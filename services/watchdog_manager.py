import os
import time
import json
import threading
import subprocess
from datetime import datetime
from config import APP_DIR
from services.process_manager import add_history, send_alert

WATCHDOG_CONFIG_FILE = os.path.join(APP_DIR, "watchdog_config.json")
WATCHDOG_INCIDENTS_FILE = os.path.join(APP_DIR, "watchdog_incidents.json")

_WATCHDOG_LOCK = threading.Lock()
_WATCHDOG_THREAD = None
_LAST_CHECK_TIME = None

DEFAULT_MONITORED_SERVICES = [
    {"id": "adguardhome", "type": "docker", "name": "AdGuard Home DNS", "container": "adguardhome", "critical": True},
    {"id": "jellyfin", "type": "systemd", "name": "Jellyfin Media Server", "unit": "jellyfin.service", "critical": True},
    {"id": "dockge", "type": "docker", "name": "Dockge Manager", "container": "dockge", "critical": True},
    {"id": "immich", "type": "docker", "name": "Immich Photos Server", "container": "immich_server", "critical": False}
]

# In-memory tracking of restarts to prevent infinite loops (max 2 restarts per 15 mins)
_RESTART_HISTORY = {}  # {service_id: [timestamps]}
MAX_RESTARTS_PER_WINDOW = 2
RESTART_WINDOW_SECONDS = 900  # 15 minutes

def load_watchdog_config():
    if os.path.exists(WATCHDOG_CONFIG_FILE):
        try:
            with open(WATCHDOG_CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "enabled": True,
        "check_interval_seconds": 60,
        "services": DEFAULT_MONITORED_SERVICES
    }

def save_watchdog_config(cfg):
    try:
        with open(WATCHDOG_CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=2)
        return True
    except Exception:
        return False

def load_watchdog_incidents(limit=25):
    if os.path.exists(WATCHDOG_INCIDENTS_FILE):
        try:
            with open(WATCHDOG_INCIDENTS_FILE, "r") as f:
                data = json.load(f)
                return data[:limit]
        except Exception:
            pass
    return []

def record_watchdog_incident(service_id, service_name, action, result, details=""):
    incidents = []
    if os.path.exists(WATCHDOG_INCIDENTS_FILE):
        try:
            with open(WATCHDOG_INCIDENTS_FILE, "r") as f:
                incidents = json.load(f)
        except Exception:
            incidents = []

    new_incident = {
        "id": service_id,
        "name": service_name,
        "action": action,
        "result": result,
        "details": details,
        "timestamp": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p"),
        "timestamp_epoch": time.time()
    }
    incidents.insert(0, new_incident)
    incidents = incidents[:60]

    try:
        with open(WATCHDOG_INCIDENTS_FILE, "w") as f:
            json.dump(incidents, f, indent=2)
    except Exception:
        pass

def check_service_health(svc):
    stype = svc.get("type")
    if stype == "systemd":
        unit = svc.get("unit")
        try:
            # Check if unit is installed on host
            chk = subprocess.run(["systemctl", "show", "-p", "LoadState", unit], capture_output=True, text=True, timeout=3)
            if "not-found" in chk.stdout:
                return (True, "not_installed")
            res = subprocess.run(["systemctl", "is-active", unit], capture_output=True, text=True, timeout=3)
            status = res.stdout.strip()
            return (status == "active", status)
        except Exception as e:
            return (True, str(e))
    elif stype == "docker":
        cname = svc.get("container")
        try:
            res = subprocess.run(["docker", "inspect", "-f", "{{.State.Status}}", cname], capture_output=True, text=True, timeout=4)
            if res.returncode != 0:
                # Container not installed / does not exist on this machine
                return (True, "not_installed")
            status = res.stdout.strip().lower()
            return (status == "running", status or "offline")
        except Exception as e:
            return (True, str(e))
    return (True, "unknown")

def restart_failed_service(svc):
    sid = svc.get("id")
    sname = svc.get("name", sid)
    stype = svc.get("type")
    now = time.time()

    # Rate limiting check: prevent restart storm
    history = _RESTART_HISTORY.get(sid, [])
    # Filter to current window
    history = [t for t in history if now - t < RESTART_WINDOW_SECONDS]
    _RESTART_HISTORY[sid] = history

    if len(history) >= MAX_RESTARTS_PER_WINDOW:
        record_watchdog_incident(sid, sname, "Restart Blocked", "Rate Limited", f"Exceeded max {MAX_RESTARTS_PER_WINDOW} restarts in 15 mins. Manual inspection required.")
        send_alert("Watchdog Alert", f"Auto-Healing Paused: {sname}", f"Service has crashed repeatedly ({MAX_RESTARTS_PER_WINDOW} times in 15 mins). Self-healing paused to protect system.")
        return False, "Rate limit reached"

    success = False
    msg = ""

    if stype == "systemd":
        unit = svc.get("unit")
        try:
            res = subprocess.run(["sudo", "-n", "systemctl", "restart", unit], capture_output=True, text=True, timeout=8)
            success = (res.returncode == 0)
            msg = "Restart command executed" if success else res.stderr.strip()
        except Exception as e:
            msg = str(e)
    elif stype == "docker":
        cname = svc.get("container")
        try:
            res = subprocess.run(["docker", "restart", cname], capture_output=True, text=True, timeout=12)
            success = (res.returncode == 0)
            msg = "Container restarted" if success else res.stderr.strip()
        except Exception as e:
            msg = str(e)

    if success:
        _RESTART_HISTORY[sid].append(now)
        record_watchdog_incident(sid, sname, "Auto-Restart", "Success", f"Service was offline. Automatically recovered.")
        add_history(f"Watchdog Healed: {sname}", sid, "Self-Healing Watchdog", "Auto-Restarted (Healthy)")
        send_alert("Self-Healing Watchdog", f"Auto-Recovered: {sname}", f"Service was found crashed or offline and was automatically restored to healthy state.")
    else:
        record_watchdog_incident(sid, sname, "Auto-Restart Failed", "Error", msg)
        add_history(f"Watchdog Heal Failed: {sname}", sid, "Self-Healing Watchdog", f"Failed: {msg}")

    return success, msg

def run_watchdog_sweep():
    global _LAST_CHECK_TIME
    cfg = load_watchdog_config()
    if not cfg.get("enabled", True):
        return {"status": "disabled", "checks": []}

    _LAST_CHECK_TIME = datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    results = []

    for svc in cfg.get("services", []):
        is_healthy, raw_status = check_service_health(svc)
        info = {
            "id": svc.get("id"),
            "name": svc.get("name"),
            "type": svc.get("type"),
            "status": raw_status,
            "healthy": is_healthy,
            "auto_restarted": False
        }
        if not is_healthy:
            restarted, rmsg = restart_failed_service(svc)
            info["auto_restarted"] = restarted
            info["restart_msg"] = rmsg
        results.append(info)

    return {
        "status": "active",
        "last_check": _LAST_CHECK_TIME,
        "results": results
    }

def _watchdog_loop():
    while True:
        try:
            cfg = load_watchdog_config()
            interval = max(30, int(cfg.get("check_interval_seconds", 60)))
            if cfg.get("enabled", True):
                run_watchdog_sweep()
            time.sleep(interval)
        except Exception:
            time.sleep(60)

def ensure_watchdog_running():
    global _WATCHDOG_THREAD
    with _WATCHDOG_LOCK:
        if _WATCHDOG_THREAD is None or not _WATCHDOG_THREAD.is_alive():
            _WATCHDOG_THREAD = threading.Thread(target=_watchdog_loop, daemon=True, name="SelfHealingWatchdog")
            _WATCHDOG_THREAD.start()

def get_watchdog_status():
    ensure_watchdog_running()
    cfg = load_watchdog_config()
    incidents = load_watchdog_incidents(15)
    now = time.time()

    enriched_services = []
    for svc in cfg.get("services", []):
        sid = svc.get("id")
        history = [t for t in _RESTART_HISTORY.get(sid, []) if now - t < RESTART_WINDOW_SECONDS]
        is_healthy, raw_status = check_service_health(svc)
        s_copy = dict(svc)
        s_copy["status"] = "running" if is_healthy else raw_status
        s_copy["healthy"] = is_healthy
        s_copy["restarts_in_window"] = len(history)
        s_copy["details"] = f"Operational ({raw_status})" if is_healthy else f"State: {raw_status}"
        enriched_services.append(s_copy)

    return {
        "enabled": cfg.get("enabled", True),
        "last_check": _LAST_CHECK_TIME or "Starting initial check...",
        "monitored_services": enriched_services,
        "monitored_targets": enriched_services,
        "monitored_count": len(enriched_services),
        "recent_incidents": incidents,
        "incidents": incidents
    }

def toggle_watchdog(enabled=None):
    cfg = load_watchdog_config()
    current = cfg.get("enabled", True)
    new_val = not current if enabled is None else bool(enabled)
    cfg["enabled"] = new_val
    save_watchdog_config(cfg)
    st = "Enabled" if new_val else "Disabled"
    add_history(f"{st} Self-Healing Watchdog", "watchdog_toggle", "System Setting", st)
    return new_val
