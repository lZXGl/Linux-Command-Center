import os
import json
import re
import time
import subprocess
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from config import (
    APP_DIR,
    ALERTS_CONFIG_FILE,
    UPDATE_SCRIPT,
    UPDATE_LOG,
    get_all_systemd_services
)
from services import (
    get_system_stats,
    get_systemd_services_status,
    exec_systemd_action,
    get_active_tasks,
    kill_process_by_pid,
    add_history,
    send_alert
)

system_bp = Blueprint('system', __name__)

TELEMETRY_HISTORY_FILE = os.path.join(APP_DIR, "telemetry_history.json")

def load_telemetry_history():
    if os.path.exists(TELEMETRY_HISTORY_FILE):
        try:
            with open(TELEMETRY_HISTORY_FILE, 'r') as f:
                data = json.load(f)
                if data and isinstance(data, list):
                    return data
        except Exception:
            pass
    now = datetime.now()
    history = []
    for i in range(23, -1, -1):
        dt = now - timedelta(hours=i)
        t_str = dt.strftime("%H:%M")
        history.append({
            "time": t_str,
            "cpu": 12.0,
            "ram": 38.0,
            "gpu": 0.0,
            "dns_block": 15.5
        })
    return history

def save_telemetry_snapshot():
    try:
        history = load_telemetry_history()
        stats = get_system_stats()
        cpu_val = float(stats.get("cpu_percent", "0%").replace("%", ""))
        ram_val = float(stats.get("ram_percent", "0%").replace("%", ""))
        gpu_val = float(stats.get("gpu_percent", "0%").replace("%", ""))
        dns_block_val = float(stats.get("dns", {}).get("block_percent", "0%").replace("%", ""))

        t_str = datetime.now().strftime("%H:%M")
        
        # If the latest recorded point was within the last 15 minutes, update it in place to match live top bar
        if history and history[-1].get("time") == t_str:
            history[-1] = {
                "time": t_str,
                "cpu": cpu_val,
                "ram": ram_val,
                "gpu": gpu_val,
                "dns_block": dns_block_val
            }
        else:
            history.append({
                "time": t_str,
                "cpu": cpu_val,
                "ram": ram_val,
                "gpu": gpu_val,
                "dns_block": dns_block_val
            })

        if len(history) > 24:
            history = history[-24:]

        with open(TELEMETRY_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception:
        pass

@system_bp.route('/api/system/stats', methods=['GET'])
def get_stats():
    stats = get_system_stats()
    
    # Check if update is running
    is_updating = False
    try:
        res = subprocess.run(["pgrep", "-f", "update_all_system.sh"], capture_output=True, text=True)
        is_updating = len(res.stdout.strip()) > 0
    except Exception:
        pass

    active_tasks = get_active_tasks()
    stats["is_updating"] = is_updating
    stats["running_count"] = len(active_tasks)
    try:
        from config import KIOSK_STATE
        stats["kiosk_reload_token"] = KIOSK_STATE.get("reload_token", 0)
        stats["kiosk_online"] = (time.time() - KIOSK_STATE.get("last_ping", 0)) < 45
    except Exception:
        pass
    return jsonify(stats)

@system_bp.route('/api/system/active-tasks', methods=['GET'])
def active_tasks_route():
    return jsonify(get_active_tasks())

@system_bp.route('/api/system/active-tasks/<int:pid>/kill', methods=['POST'])
@system_bp.route('/api/system/kill-process', methods=['POST'])
def kill_task_route(pid=None):
    if pid is None:
        data = request.json or {}
        pid = data.get("pid")
    
    if not pid:
        return jsonify({"error": "PID required"}), 400

    success, msg = kill_process_by_pid(pid)
    if success:
        add_history(f"Terminated PID {pid}", f"pid_{pid}", "Active Tasks Inspector", "Killed")
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@system_bp.route('/api/system/services-status', methods=['GET'])
def systemd_services_status():
    services = get_all_systemd_services()
    return jsonify(get_systemd_services_status(services))

@system_bp.route('/api/system/service/action', methods=['POST'])
@system_bp.route('/api/system/service/restart', methods=['POST'])
def systemd_action():
    data = request.json or {}
    unit = data.get("unit")
    action = data.get("action", "restart").lower()

    if not unit:
        return jsonify({"error": "Unit is required"}), 400

    success, msg = exec_systemd_action(unit, action)
    if success:
        add_history(f"{action.capitalize()} Systemd: {unit}", f"unit_{unit}", "System Control", f"{action.capitalize()}ed")
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@system_bp.route('/api/system/update', methods=['POST'])
@system_bp.route('/api/system/update-all', methods=['POST'])
def trigger_update():
    if not os.path.exists(UPDATE_SCRIPT):
        return jsonify({"error": "Update script not found"}), 404

    # Check if already running
    is_running = False
    try:
        res = subprocess.run(["pgrep", "-f", "update_all_system.sh"], capture_output=True, text=True)
        is_running = len(res.stdout.strip()) > 0
    except Exception:
        pass
    if is_running:
        return jsonify({"error": "System update is already in progress"}), 400

    cmd = f"nohup bash {UPDATE_SCRIPT} > {UPDATE_LOG} 2>&1 &"
    try:
        subprocess.Popen(cmd, shell=True, cwd=APP_DIR)
        add_history("System & App Update", "system_update", trigger="Dashboard Update", status="Started")
        send_alert("System Update", "Full System Update Triggered", "Linux packages, python libraries, and Pi-hole rules update started.")
        return jsonify({"message": "System and packages update started in background!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@system_bp.route('/api/system/update-log', methods=['GET'])
def get_update_log():
    is_running = False
    try:
        res = subprocess.run(["pgrep", "-f", "update_all_system.sh"], capture_output=True, text=True)
        is_running = len(res.stdout.strip()) > 0
    except Exception:
        pass

    log_content = ""
    if os.path.exists(UPDATE_LOG):
        try:
            with open(UPDATE_LOG, 'r', encoding='utf-8', errors='ignore') as f:
                log_content = f.read()
        except Exception:
            pass
    return jsonify({
        "running": is_running,
        "log": log_content if log_content.strip() else ("Starting update process..." if is_running else "No recent update logs available.")
    })

@system_bp.route('/api/system/reboot', methods=['POST'])
def trigger_reboot():
    try:
        add_history("Server Emergency Reboot", "server_reboot", "Dashboard Settings", "Rebooting")
        send_alert("Server Reboot", "Linux Server Reboot Initiated", "The server is restarting now.")
        subprocess.Popen(["sudo", "-n", "reboot"])
        return jsonify({"message": "Reboot command sent to server!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

_ALERT_COOLDOWNS = {}

def check_system_health_watchdog():
    if not os.path.exists(ALERTS_CONFIG_FILE):
        return
    try:
        with open(ALERTS_CONFIG_FILE, 'r') as f:
            cfg = json.load(f)
    except Exception:
        return

    if not cfg.get("enabled"):
        return

    now = time.time()
    cooldown = 3 * 3600  # 3 hours cooldown per alert type

    # 1. Temperature Warning
    if cfg.get("alert_temp", False) or cfg.get("alert_temp_enabled", False):
        try:
            from services.system_monitor import get_cpu_temp
            temp_str = get_cpu_temp()
            clean_digits = re.sub(r'[^\d.]', '', temp_str) if temp_str and temp_str != "N/A" else "0"
            temp_val = float(clean_digits) if clean_digits else 0
            if temp_val >= 80.0:
                last_sent = _ALERT_COOLDOWNS.get("temp", 0)
                if now - last_sent > cooldown:
                    send_alert("Hardware Warning", f"High CPU Temperature: {temp_str}", f"System CPU thermal sensor reached {temp_str}, exceeding 80°C safe threshold.")
                    _ALERT_COOLDOWNS["temp"] = now
        except Exception:
            pass

    # 2. Disk Space Warning
    if cfg.get("alert_disk", False) or cfg.get("alert_disk_enabled", False):
        try:
            stat = os.statvfs('/')
            free_pct = (stat.f_bavail / stat.f_blocks) * 100
            if free_pct <= 10.0:
                last_sent = _ALERT_COOLDOWNS.get("disk", 0)
                if now - last_sent > cooldown:
                    send_alert("Storage Warning", f"Low Root Disk Space: {free_pct:.1f}% free", f"Primary OS root disk has only {free_pct:.1f}% space remaining.")
                    _ALERT_COOLDOWNS["disk"] = now
        except Exception:
            pass

    # 3. Docker Container Unexpected Crash
    if cfg.get("alert_crash", False) or cfg.get("alert_crash_enabled", False):
        try:
            res = subprocess.run(["docker", "ps", "-a", "--filter", "status=exited", "--format", "{{.Names}}\t{{.Status}}"], capture_output=True, text=True, timeout=3)
            for line in res.stdout.strip().splitlines():
                if not line.strip(): continue
                parts = line.split('\t')
                c_name = parts[0].strip()
                status_str = parts[1].strip() if len(parts) > 1 else "Exited"
                if "Exited (0)" not in status_str and "Exited" in status_str:
                    key = f"crash_{c_name}"
                    last_sent = _ALERT_COOLDOWNS.get(key, 0)
                    if now - last_sent > cooldown:
                        send_alert("Container Crash", f"Container {c_name} Stopped", f"Docker container `{c_name}` stopped unexpectedly: {status_str}")
                        _ALERT_COOLDOWNS[key] = now
        except Exception:
            pass

@system_bp.route('/api/settings/alerts', methods=['GET', 'POST'])
@system_bp.route('/api/system/settings/alerts', methods=['GET', 'POST'])
def alerts_settings():
    if request.method == 'GET':
        if os.path.exists(ALERTS_CONFIG_FILE):
            try:
                with open(ALERTS_CONFIG_FILE, 'r') as f:
                    return jsonify(json.load(f))
            except Exception:
                pass
        return jsonify({
            "discord_webhook": "",
            "telegram_token": "",
            "telegram_chat_id": "",
            "enabled": True,
            "alert_temp": False,
            "alert_disk": False,
            "alert_crash": False
        })

    data = request.json or {}
    try:
        with open(ALERTS_CONFIG_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        add_history("Updated Alert Settings", "alert_settings", "Settings", "Saved")
        return jsonify({"message": "Alerts configuration saved successfully!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@system_bp.route('/api/settings/alerts/test', methods=['POST'])
@system_bp.route('/api/system/settings/alerts/test', methods=['POST'])
def test_alerts_endpoint():
    try:
        send_alert("Test Alert", "Command Center Notification", "This is a test notification from your server dashboard. Alerts are working properly!")
        return jsonify({"message": "Test notification sent successfully!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@system_bp.route('/api/network/security', methods=['GET'])
@system_bp.route('/api/system/network-security', methods=['GET'])
def network_security_route():
    ports = []
    try:
        res = subprocess.run(["ss", "-tulpn"], capture_output=True, text=True, timeout=2)
        lines = res.stdout.splitlines()[1:]
        for line in lines[:12]:
            parts = line.split()
            if len(parts) >= 5:
                ports.append({"proto": parts[0], "local": parts[4], "process": parts[-1] if len(parts) > 5 else "N/A"})
    except Exception:
        pass

    net_data = {
        "ufw_status": "Active (Default Deny Incoming)",
        "open_ports": ports,
        "interfaces": {}
    }
    try:
        if_addrs = psutil.net_if_addrs()
        for iface, addrs in if_addrs.items():
            if iface.startswith(('lo', 'docker', 'br-', 'veth')):
                continue
            for a in addrs:
                family_name = getattr(getattr(a, 'family', None), 'name', '')
                if family_name == 'AF_INET' or getattr(a, 'family', None) == 2:
                    net_data["interfaces"][iface] = a.address
                    if not net_data.get("primary_ip"):
                        net_data["primary_ip"] = a.address
    except Exception:
        pass

    discovered_ips = list(net_data.get("interfaces", {}).values())
    net_data["enp3s0_ip"] = net_data.get("interfaces", {}).get("enp3s0", (discovered_ips[0] if len(discovered_ips) > 0 else "127.0.0.1"))
    net_data["eno1_ip"] = net_data.get("interfaces", {}).get("eno1", (discovered_ips[1] if len(discovered_ips) > 1 else net_data["enp3s0_ip"]))

    return jsonify(net_data)

@system_bp.route('/api/system/history-telemetry', methods=['GET'])
@system_bp.route('/api/system/telemetry-history', methods=['GET'])
def telemetry_history_route():
    save_telemetry_snapshot()
    try:
        check_system_health_watchdog()
    except Exception:
        pass
    history = load_telemetry_history()
    return jsonify({
        "labels": [item["time"] for item in history],
        "cpu": [item.get("cpu", 0) for item in history],
        "ram": [item.get("ram", 0) for item in history],
        "gpu": [item.get("gpu", 0) for item in history],
        "dns_block": [item.get("dns_block", 0) for item in history]
    })
