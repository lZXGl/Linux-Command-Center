import os
import shutil
import json
import subprocess
import urllib.request
from config import PRIMARY_IP

OPENCODE_BIN = os.environ.get("OPENCODE_BIN", shutil.which("opencode") or os.path.expanduser("~/.opencode/bin/opencode"))
OPENCODE_PORT = 4096

def is_opencode_running():
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{OPENCODE_PORT}/", method="GET")
        with urllib.request.urlopen(req, timeout=1.0) as response:
            return response.status == 200
    except Exception:
        pass
    try:
        res = subprocess.run(["systemctl", "is-active", "opencode.service"], capture_output=True, text=True, timeout=2)
        return res.stdout.strip() == "active"
    except Exception:
        return False

def start_opencode():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "start", "opencode.service"], capture_output=True, text=True, timeout=8)
        return True, "OpenCode AI Web Studio server started."
    except Exception as e:
        return False, str(e)

def stop_opencode():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "stop", "opencode.service"], capture_output=True, text=True, timeout=8)
        subprocess.run(["pkill", "-9", "-f", "opencode web"], capture_output=True, text=True)
        subprocess.run(["pkill", "-9", "-f", "opencode serve"], capture_output=True, text=True)
        return True, "OpenCode AI Web Studio server stopped."
    except Exception as e:
        return False, str(e)

def restart_opencode():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "restart", "opencode.service"], capture_output=True, text=True, timeout=8)
        return True, "OpenCode AI Web Studio server restarted."
    except Exception as e:
        return False, str(e)

def get_opencode_status():
    running = is_opencode_running()
    return {
        "running": running,
        "port": OPENCODE_PORT,
        "url": f"http://{PRIMARY_IP}:{OPENCODE_PORT}",
        "version": "1.15.12",
        "description": "Interactive AI Web IDE & Autonomous Coding Agent"
    }
