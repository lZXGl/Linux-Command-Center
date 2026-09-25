import os
import re
import time
import subprocess
import urllib.request
import json
from config import PRIMARY_IP

last_net_time = 0
last_net_bytes = {"rx": 0, "tx": 0}
cached_net_speed = {"rx_rate": "0 KB/s", "tx_rate": "0 KB/s"}

def get_net_speed():
    global last_net_time, last_net_bytes, cached_net_speed
    now = time.time()
    if last_net_time == 0:
        last_net_time = now
        try:
            with open("/proc/net/dev", "r") as f:
                lines = f.readlines()[2:]
            rx_total, tx_total = 0, 0
            for line in lines:
                parts = line.split()
                if not parts[0].startswith("lo:"):
                    rx_total += int(parts[1])
                    tx_total += int(parts[9])
            last_net_bytes = {"rx": rx_total, "tx": tx_total}
        except Exception:
            pass
        return cached_net_speed

    dt = now - last_net_time
    if dt >= 1.0:
        try:
            with open("/proc/net/dev", "r") as f:
                lines = f.readlines()[2:]
            rx_total, tx_total = 0, 0
            for line in lines:
                parts = line.split()
                if not parts[0].startswith("lo:"):
                    rx_total += int(parts[1])
                    tx_total += int(parts[9])

            rx_speed = (rx_total - last_net_bytes["rx"]) / dt
            tx_speed = (tx_total - last_net_bytes["tx"]) / dt

            last_net_bytes = {"rx": rx_total, "tx": tx_total}
            last_net_time = now

            def fmt(b):
                if b >= 1048576:
                    return f"{b / 1048576:.1f} MB/s"
                return f"{b / 1024:.0f} KB/s"

            cached_net_speed = {"rx_rate": fmt(rx_speed), "tx_rate": fmt(tx_speed)}
        except Exception:
            pass
    return cached_net_speed

def get_system_uptime():
    try:
        with open('/proc/uptime', 'r') as f:
            uptime_seconds = float(f.readline().split()[0])
            hours = int(uptime_seconds // 3600)
            minutes = int((uptime_seconds % 3600) // 60)
            days = hours // 24
            hours_rem = hours % 24
            if days > 0:
                return f"{days}d {hours_rem}h {minutes}m"
            return f"{hours}h {minutes}m"
    except Exception:
        return "Unknown"

def get_cpu_temp():
    try:
        temps = []
        for zone in sorted(os.listdir('/sys/class/thermal')):
            if zone.startswith('thermal_zone'):
                path = f'/sys/class/thermal/{zone}/temp'
                if os.path.exists(path):
                    with open(path, 'r') as f:
                        val = int(f.read().strip())
                        temps.append(val / 1000.0)
        if temps:
            return f"{max(temps):.0f}°C"
    except Exception:
        pass
    return "N/A"

_ADGUARD_CACHE = {"ts": 0.0, "total": 0, "blocked": 0}
ADGUARD_CACHE_TTL_SECONDS = 60

def _get_adguard_24h():
    now = time.time()
    cached = _ADGUARD_CACHE
    if now - cached["ts"] < ADGUARD_CACHE_TTL_SECONDS:
        return cached["total"], cached["blocked"]

    from datetime import datetime, timezone, timedelta
    adguard_total, adguard_blocked = 0, 0
    default_adguard = os.path.expanduser("~/homelab/adguard/work/data/querylog.json")
    path = os.environ.get("ADGUARD_QUERYLOG_PATH", default_adguard if os.path.exists(default_adguard) else "/opt/AdGuardHome/data/querylog.json")

    if os.path.exists(path):
        try:
            now_utc = datetime.now(timezone.utc)
            cutoff = now_utc - timedelta(hours=24)
            with open(path, "rb") as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                f.seek(max(0, size - 8 * 1024 * 1024))
                lines = f.read().decode('utf-8', errors='ignore').splitlines()
                if size > 8 * 1024 * 1024 and lines:
                    lines = lines[1:]
                for line in lines:
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                        t_str = data.get("T")
                        if t_str:
                            t = datetime.fromisoformat(t_str.replace('Z', '+00:00'))
                            if t >= cutoff:
                                adguard_total += 1
                                res = data.get("Result", {})
                                if res.get("IsFiltered") or res.get("Reason", 0) != 0:
                                    adguard_blocked += 1
                    except Exception:
                        pass
        except Exception:
            pass

    cached.update({"ts": now, "total": adguard_total, "blocked": adguard_blocked})
    return adguard_total, adguard_blocked

def get_dns_stats():
    from config import DNS_SAVINGS_KB_PER_BLOCK
    adguard_total, adguard_blocked = _get_adguard_24h()
    pihole_total, pihole_blocked = 0, 0
    
    # 1. Pi-hole v6 API (24-Hour metrics)
    try:
        req = urllib.request.Request("http://127.0.0.1/api/stats/summary", headers={"User-Agent": "LinuxCommandCenter"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            data = json.loads(resp.read().decode())
            queries = data.get("queries", {})
            pihole_total = queries.get("total", 0)
            pihole_blocked = queries.get("blocked", 0)
    except Exception:
        pass

    combined_total = adguard_total + pihole_total
    combined_blocked = adguard_blocked + pihole_blocked
    block_percent = f"{(combined_blocked / combined_total * 100):.1f}%" if combined_total > 0 else "0.0%"

    def fmt_num(n):
        return f"{n:,}"

    def calc_saved_mb(blocked):
        return round((blocked * DNS_SAVINGS_KB_PER_BLOCK) / 1024.0, 1)

    return {
        "adguard_total": fmt_num(adguard_total),
        "adguard_blocked": fmt_num(adguard_blocked),
        "pihole_total": fmt_num(pihole_total),
        "pihole_blocked": fmt_num(pihole_blocked),
        "combined_total": fmt_num(combined_total),
        "combined_blocked": fmt_num(combined_blocked),
        "block_percent": block_percent,
        "adguard_saved_mb": calc_saved_mb(adguard_blocked),
        "pihole_saved_mb": calc_saved_mb(pihole_blocked),
        "combined_saved_mb": calc_saved_mb(combined_blocked),
        "adguard_total_n": adguard_total,
        "adguard_blocked_n": adguard_blocked,
        "pihole_total_n": pihole_total,
        "pihole_blocked_n": pihole_blocked,
        "combined_total_n": combined_total,
        "combined_blocked_n": combined_blocked,
    }

def get_disk_usage_stats():
    res = {
        "disk1": "0.0%",
        "disk1_percent": "0.0%",
        "disk2": None,
        "disk2_percent": None,
        "disk2_name": None
    }
    try:
        stat1 = os.statvfs('/')
        total1 = stat1.f_blocks * stat1.f_frsize
        free1 = stat1.f_bavail * stat1.f_frsize
        used1 = total1 - free1
        percent1 = round((used1 / total1) * 100, 1) if total1 else 0
        free_gb1 = round(free1 / (1024 ** 3), 1)
        res["disk1"] = f"{percent1}% ({free_gb1} GB Free)"
        res["disk1_percent"] = f"{percent1}% ({free_gb1} GB Free)"
    except Exception:
        pass

    # Optional secondary storage mount (only if configured via env)
    sec_path = os.environ.get("SECONDARY_STORAGE_PATH")
    if sec_path and os.path.exists(sec_path):
        try:
            stat2 = os.statvfs(sec_path)
            total2 = stat2.f_blocks * stat2.f_frsize
            free2 = stat2.f_bavail * stat2.f_frsize
            used2 = total2 - free2
            percent2 = round((used2 / total2) * 100, 1) if total2 else 0
            free_gb2 = round(free2 / (1024 ** 3), 1)
            res["disk2"] = f"{percent2}% ({free_gb2} GB Free)"
            res["disk2_percent"] = f"{percent2}% ({free_gb2} GB Free)"
            res["disk2_name"] = os.path.basename(sec_path.rstrip("/")) or "Storage"
        except Exception:
            pass

    return res

last_cpu_time = 0
last_cpu_idle = 0
last_cpu_total = 0
cached_cpu_percent = "0%"

def get_realtime_cpu():
    global last_cpu_time, last_cpu_idle, last_cpu_total, cached_cpu_percent
    now = time.time()
    if last_cpu_time > 0 and (now - last_cpu_time) < 0.5:
        return cached_cpu_percent

    try:
        with open("/proc/stat", "r") as f:
            line = f.readline()
        fields = [float(x) for x in line.split()[1:]]
        idle = fields[3] + fields[4]
        total = sum(fields)

        if last_cpu_total > 0 and total > last_cpu_total:
            d_idle = idle - last_cpu_idle
            d_total = total - last_cpu_total
            if d_total > 0:
                pct = max(0.0, min(100.0, 100.0 * (1.0 - d_idle / d_total)))
                cached_cpu_percent = f"{pct:.0f}%"

        last_cpu_idle = idle
        last_cpu_total = total
        last_cpu_time = now
    except Exception:
        pass
    return cached_cpu_percent

def get_realtime_ram():
    try:
        with open("/proc/meminfo", "r") as f:
            lines = f.readlines()
        mem_total = 0
        mem_avail = 0
        for l in lines:
            if l.startswith("MemTotal:"):
                mem_total = float(l.split()[1])
            elif l.startswith("MemAvailable:"):
                mem_avail = float(l.split()[1])
        if mem_total > 0:
            used_pct = ((mem_total - mem_avail) / mem_total) * 100.0
            return f"{used_pct:.0f}%"
    except Exception:
        pass
    return "0%"

import glob

def get_gpu_stats():
    stats = {
        "gpu_percent": "0%",
        "vram_used_mb": 0,
        "vram_total_mb": 2048,
        "vram_percent": "0%",
        "gpu_temp": "N/A",
        "vram_text": "0.0 / 2.0 GB",
        "has_gpu": False
    }
    
    # 1. GPU Busy %
    paths = glob.glob('/sys/class/drm/card*/device/gpu_busy_percent')
    if paths:
        try:
            with open(paths[0], 'r') as f:
                val = int(f.read().strip())
                stats['gpu_percent'] = f"{val}%"
                stats['has_gpu'] = True
        except Exception:
            pass

    # 2. VRAM Used & Total
    used_paths = glob.glob('/sys/class/drm/card*/device/mem_info_vram_used')
    total_paths = glob.glob('/sys/class/drm/card*/device/mem_info_vram_total')
    if used_paths and total_paths:
        try:
            with open(used_paths[0], 'r') as f1, open(total_paths[0], 'r') as f2:
                used = int(f1.read().strip())
                total = int(f2.read().strip())
                used_mb = used // (1024 * 1024)
                total_mb = total // (1024 * 1024)
                stats['vram_used_mb'] = used_mb
                stats['vram_total_mb'] = total_mb
                stats['vram_percent'] = f"{(used / total * 100):.0f}%"
                stats['vram_text'] = f"{used_mb / 1024:.1f} / {total_mb / 1024:.1f} GB"
                stats['has_gpu'] = True
        except Exception:
            pass

    # 3. GPU Temp
    temp_paths = glob.glob('/sys/class/drm/card*/device/hwmon/hwmon*/temp1_input')
    if temp_paths:
        try:
            with open(temp_paths[0], 'r') as f:
                t = int(f.read().strip()) / 1000.0
                stats['gpu_temp'] = f"{t:.0f}°C"
                stats['has_gpu'] = True
        except Exception:
            pass

    return stats

def get_system_stats():
    speed = get_net_speed()
    disks = get_disk_usage_stats()
    gpu = get_gpu_stats()

    stats = {
        "uptime": get_system_uptime(),
        "cpu_temp": get_cpu_temp(),
        "cpu_percent": get_realtime_cpu(),
        "ram_percent": get_realtime_ram(),
        "gpu_percent": gpu["gpu_percent"],
        "gpu_temp": gpu["gpu_temp"],
        "vram_percent": gpu["vram_percent"],
        "vram_text": gpu["vram_text"],
        "gpu": gpu,
        "disk1_percent": disks["disk1_percent"],
        "disk2_percent": disks["disk2_percent"],
        "disk2_name": disks.get("disk2_name"),
        "disk1": disks["disk1"],
        "disk2": disks["disk2"],
        "net_rx": speed["rx_rate"],
        "net_tx": speed["tx_rate"],
        "dns": get_dns_stats()
    }
    return stats

def get_systemd_services_status(services_config):
    results = []
    for svc in services_config:
        unit = svc.get("unit")
        item = dict(svc)
        item["active"] = False
        item["status"] = "Offline"
        item["status_text"] = "Inactive"
        
        if unit:
            try:
                if unit in ["vulkan-ai.service", "ollama.service"]:
                    from services.ai_ops_manager import is_vulkan_ai_running, is_ollama_running
                    is_active = is_vulkan_ai_running() or is_ollama_running()
                else:
                    res = subprocess.run(["systemctl", "is-active", unit], capture_output=True, text=True)
                    is_active = (res.stdout.strip() == "active")
                item["active"] = is_active
                item["status"] = "Online" if is_active else "Offline"
                item["status_text"] = "Active" if is_active else "Inactive"
            except Exception:
                pass
        results.append(item)
    return results

def exec_systemd_action(unit, action):
    action = action.lower()
    if action not in ["start", "stop", "restart"]:
        return False, "Action not permitted"
    try:
        if unit in ["vulkan-ai.service", "ollama.service", "vulkan-ai", "ollama"]:
            from services.ai_ops_manager import start_ollama_service, stop_ollama_service, restart_ollama_service
            if action == "stop":
                success, msg = stop_ollama_service()
                return success, msg
            elif action == "start":
                success, msg = start_ollama_service()
                return success, msg
            elif action == "restart":
                success, msg = restart_ollama_service()
                return success, msg

        subprocess.run(["sudo", "-n", "systemctl", action, unit], capture_output=True, text=True, timeout=8)
        return True, f"Successfully executed '{action}' on {unit}"
    except Exception as e:
        return False, str(e)
