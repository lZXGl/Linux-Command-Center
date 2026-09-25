import os
import json
import time
import subprocess
import urllib.request
import urllib.parse
from datetime import datetime
from config import HISTORY_FILE, ALERTS_CONFIG_FILE, get_all_scripts

def get_history(limit=60):
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, 'r') as f:
            data = json.load(f)
            return data[:limit]
    except Exception:
        return []

import time
KIOSK_STATE = {"reload_token": int(time.time()), "last_ping": 0}

def get_kiosk_state():
    return dict(KIOSK_STATE)

def trigger_kiosk_reload():
    KIOSK_STATE["reload_token"] = int(time.time())
    return KIOSK_STATE["reload_token"]

def record_kiosk_ping():
    KIOSK_STATE["last_ping"] = int(time.time())
    return KIOSK_STATE["reload_token"]

def add_history(name, script_id, trigger="Manual Dashboard", status="Completed (Success)"):
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                history = json.load(f)
        except Exception:
            history = []
    
    entry = {
        "id": script_id,
        "name": name,
        "trigger": trigger,
        "timestamp": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p"),
        "status": status
    }
    history.insert(0, entry)
    history = history[:150]
    
    try:
        with open(HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception:
        pass

def send_alert(event_type="General", title="Alert", message="", details=None):
    if not os.path.exists(ALERTS_CONFIG_FILE):
        return
    try:
        with open(ALERTS_CONFIG_FILE, 'r') as f:
            cfg = json.load(f)
    except Exception:
        return

    # Discord Webhook
    discord_url = cfg.get("discord_webhook", "").strip()
    if discord_url and discord_url.startswith("http"):
        try:
            payload = {
                "username": "Homelab-Command-Center",
                "avatar_url": "https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/docker.png",
                "embeds": [{
                    "title": f"🔔 {title}",
                    "description": message,
                    "color": 65280 if "Success" in event_type or "Update" in event_type else 16711680,
                    "footer": {"text": f"Event: {event_type} • {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"}
                }]
            }
            req = urllib.request.Request(
                discord_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
            )
            urllib.request.urlopen(req, timeout=4)
        except Exception:
            pass

    # Telegram Bot
    tg_token = cfg.get("telegram_token", "").strip()
    tg_chat_id = cfg.get("telegram_chat_id", "").strip()
    if tg_token and tg_chat_id:
        try:
            tg_msg = f"🔔 *{title}*\n\n{message}\n\n_Event: {event_type}_"
            tg_url = f"https://api.telegram.org/bot{tg_token}/sendMessage"
            data = urllib.parse.urlencode({
                "chat_id": tg_chat_id,
                "text": tg_msg,
                "parse_mode": "Markdown"
            }).encode('utf-8')
            req = urllib.request.Request(tg_url, data=data, headers={'User-Agent': 'Mozilla/5.0'})
            urllib.request.urlopen(req, timeout=4)
        except Exception:
            pass

def format_elapsed(seconds):
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m {seconds % 60}s"
    hours = minutes // 60
    return f"{hours}h {minutes % 60}m"

def get_active_tasks():
    current_pid = os.getpid()
    try:
        res = subprocess.run(["ps", "-eo", "pid,%cpu,%mem,etime,args"], capture_output=True, text=True)
    except Exception:
        return []

    # Build targets list dynamically from scripts + special tasks
    scripts_map = get_all_scripts()
    targets = []
    for s_id, s in scripts_map.items():
        targets.append((s.get("script", f"{s_id}.py"), s.get("name", s_id), s_id, s.get("icon", "fa-code")))

    targets.extend([
        ("video_processor.py", "Video Automation Renderer", "video_automation", "fa-film"),
        ("update_all_system.sh", "System, Apps & Pi-hole Update", "update_all", "fa-arrows-rotate")
    ])

    active = []
    seen_ids = set()
    ignore_tokens = ["pgrep", "ps -eo", "grep", "app.py", "subprocess", "gunicorn", "vscode", "antigravity"]

    for line in res.stdout.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        parts = line_str.split(None, 4)
        if len(parts) < 5:
            continue
        pid_str, cpu, mem, etime, cmd = parts[0], parts[1], parts[2], parts[3], parts[4]
        try:
            pid = int(pid_str)
        except ValueError:
            continue
        if pid == current_pid:
            continue

        if any(tok in cmd for tok in ignore_tokens):
            continue

        for script_name, display_name, s_id, icon in targets:
            if s_id in seen_ids:
                continue
            if script_name in cmd or f"cron_runner.py {s_id}" in cmd:
                seen_ids.add(s_id)
                active.append({
                    "id": s_id,
                    "name": display_name,
                    "script": script_name,
                    "icon": icon,
                    "pid": pid,
                    "cpu": f"{cpu}%",
                    "mem": f"{mem}%",
                    "elapsed": etime,
                    "cmd": cmd
                })
                break
    return active

def is_video_processor_running():
    try:
        res = subprocess.run(["pgrep", "-f", "video_processor.py"], capture_output=True, text=True)
        return len(res.stdout.strip()) > 0
    except Exception:
        return False

def kill_process_by_pid(pid):
    try:
        subprocess.run(["kill", "-9", str(pid)], check=True)
        return True, f"Process {pid} terminated successfully."
    except Exception as e:
        return False, str(e)
