import os
import json
import socket
from pathlib import Path

# --- CORE DIRECTORIES ---
APP_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.environ.get("SCRIPTS_DIR", os.path.join(APP_DIR, "scripts"))
SCREENSHOTS_DIR = os.environ.get("SCREENSHOTS_DIR", os.path.join(APP_DIR, "screenshots"))
BACKUPS_DIR = os.environ.get("BACKUPS_DIR", os.path.join(APP_DIR, "backups"))
STORAGE_BASE = os.environ.get("STORAGE_BASE", "/mnt/storage" if os.path.exists("/mnt/storage") else os.path.expanduser("~"))

# Ensure directories exist
for d in [BASE_DIR, SCREENSHOTS_DIR, BACKUPS_DIR]:
    os.makedirs(d, exist_ok=True)

# --- CONFIG & STATE FILES ---
ALERTS_CONFIG_FILE = os.path.join(APP_DIR, "alerts_config.json")
HISTORY_FILE = os.path.join(APP_DIR, "execution_history.json")
CUSTOM_SCRIPTS_FILE = os.path.join(APP_DIR, "custom_scripts.json")
CUSTOM_HOMELAB_FILE = os.path.join(APP_DIR, "custom_homelab.json")
CUSTOM_SYSTEMD_FILE = os.path.join(APP_DIR, "custom_systemd.json")
DOCKGE_CONFIG_FILE = os.path.join(APP_DIR, "dockge_config.json")
UPDATE_SCRIPT = os.path.join(APP_DIR, "update_all_system.sh")
UPDATE_LOG = os.path.join(APP_DIR, "system_update.log")

# --- SERVER NETWORKING & ENVIRONMENT ---
def get_primary_ip():
    env_ip = os.environ.get("PRIMARY_IP")
    if env_ip:
        return env_ip
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

PRIMARY_IP = get_primary_ip()
PORT = int(os.environ.get("PORT", 5000))
HOST = os.environ.get("HOST", "0.0.0.0")
DNS_SAVINGS_KB_PER_BLOCK = int(os.environ.get("DNS_SAVINGS_KB_PER_BLOCK", 300))

# --- KIOSK STATE ---
import time
KIOSK_STATE = {"reload_token": int(time.time()), "last_ping": 0}

# --- DEFAULT GENERIC SCRIPTS (Extensible via UI) ---
CORE_SCRIPTS_CONFIG = {
    "system_health": {
        "id": "system_health",
        "name": "System Health Check",
        "script": "health_check.py",
        "dir": BASE_DIR,
        "python": "python3",
        "category": "Maintenance",
        "icon": "fa-heart-pulse",
        "desc": "Check server load, memory, temperatures, and storage health.",
        "cron_pattern": r'(health_check\.py|cron_runner\.py\s+system_health)'
    },
    "docker_prune": {
        "id": "docker_prune",
        "name": "Docker System Cleanup",
        "script": "docker_cleanup.py",
        "dir": BASE_DIR,
        "python": "python3",
        "category": "Maintenance",
        "icon": "fa-broom",
        "desc": "Prune unused docker containers, dangling images, and build cache.",
        "cron_pattern": r'(docker_cleanup\.py|cron_runner\.py\s+docker_prune)'
    },
    "backup_daily": {
        "id": "backup_daily",
        "name": "Daily Snapshot Backup",
        "script": "backup_task.py",
        "dir": BASE_DIR,
        "python": "python3",
        "category": "Backups",
        "icon": "fa-box-archive",
        "desc": "Automated snapshot backup of application configs and databases.",
        "cron_pattern": r'(backup_task\.py|cron_runner\.py\s+backup_daily)'
    }
}

# --- HOMELAB CONTAINERS ---
CORE_HOMELAB_SERVICES = [
    {
        "id": "jellyfin",
        "name": "Jellyfin Media Server",
        "port": 8096,
        "protocol": "http",
        "url": f"http://{PRIMARY_IP}:8096",
        "desc": "Self-hosted movies, TV shows & media streaming",
        "icon": "fa-film",
        "systemd": "jellyfin"
    },
    {
        "id": "adguard",
        "name": "AdGuard Home Console",
        "container": "adguardhome",
        "port": 8083,
        "protocol": "http",
        "url": f"http://{PRIMARY_IP}:8083",
        "desc": "Primary DNS filter, DoH encryption & app blocker",
        "icon": "fa-shield-halved"
    },
    {
        "id": "dockge",
        "name": "Dockge Manager",
        "container": "dockge",
        "port": 5001,
        "protocol": "http",
        "url": f"http://{PRIMARY_IP}:5001",
        "desc": "Compose-oriented Docker stack management interface",
        "icon": "fa-cubes"
    },
    {
        "id": "immich",
        "name": "Immich Photos & Video",
        "container": "immich_server",
        "port": 2283,
        "protocol": "http",
        "url": f"http://{PRIMARY_IP}:2283",
        "desc": "High performance self-hosted photo & video backup",
        "icon": "fa-images"
    },
    {
        "id": "vaultwarden",
        "name": "Vaultwarden Password Vault",
        "container": "vaultwarden",
        "port": 8080,
        "protocol": "http",
        "url": f"http://{PRIMARY_IP}:8080",
        "desc": "Bitwarden-compatible end-to-end encrypted vault",
        "icon": "fa-key"
    },
    {
        "id": "pihole",
        "name": "Pi-hole DNS Sinkhole",
        "port": 80,
        "protocol": "http",
        "url": f"http://{PRIMARY_IP}/admin/",
        "desc": "Secondary DNS sinkhole & network tracker blocker",
        "icon": "fa-shield-virus",
        "systemd": "pihole-FTL"
    }
]

# --- SYSTEMD DAEMONS ---
CORE_SYSTEMD_SERVICES = [
    {
        "id": "unbound",
        "name": "Unbound Recursive DNS Resolver",
        "unit": "unbound.service",
        "desc": "Recursive caching DNS resolver & cryptographic DNSSEC validator",
        "port": 5335,
        "protocol": "dns",
        "icon": "fa-solid fa-network-wired"
    },
    {
        "id": "docker",
        "name": "Docker Engine Daemon",
        "unit": "docker.service",
        "desc": "Container Virtualization Engine & Runtime Socket",
        "port": 2375,
        "protocol": "tcp",
        "icon": "fa-brands fa-docker"
    },
    {
        "id": "ssh",
        "name": "OpenSSH Remote Server",
        "unit": "ssh.service",
        "desc": "Secure Shell Daemon for CLI Administration",
        "port": 22,
        "protocol": "tcp",
        "icon": "fa-solid fa-terminal"
    }
]

# --- DYNAMIC CONFIGURATION HELPERS ---
def get_all_scripts():
    scripts = dict(CORE_SCRIPTS_CONFIG)
    if os.path.exists(CUSTOM_SCRIPTS_FILE):
        try:
            with open(CUSTOM_SCRIPTS_FILE, 'r') as f:
                custom = json.load(f)
                scripts.update(custom)
        except Exception:
            pass
    return scripts

def save_custom_script(script_id, script_data):
    custom = {}
    if os.path.exists(CUSTOM_SCRIPTS_FILE):
        try:
            with open(CUSTOM_SCRIPTS_FILE, 'r') as f:
                custom = json.load(f)
        except Exception:
            pass
    custom[script_id] = script_data
    with open(CUSTOM_SCRIPTS_FILE, 'w') as f:
        json.dump(custom, f, indent=2)

def delete_custom_script(script_id):
    if os.path.exists(CUSTOM_SCRIPTS_FILE):
        try:
            with open(CUSTOM_SCRIPTS_FILE, 'r') as f:
                custom = json.load(f)
            if script_id in custom:
                del custom[script_id]
                with open(CUSTOM_SCRIPTS_FILE, 'w') as f:
                    json.dump(custom, f, indent=2)
                return True
        except Exception:
            pass
    return False

def get_all_homelab_services():
    services = list(CORE_HOMELAB_SERVICES)
    if os.path.exists(CUSTOM_HOMELAB_FILE):
        try:
            with open(CUSTOM_HOMELAB_FILE, 'r') as f:
                custom = json.load(f)
                services.extend(custom)
        except Exception:
            pass
    return services

def save_custom_homelab_service(service_data):
    custom = []
    if os.path.exists(CUSTOM_HOMELAB_FILE):
        try:
            with open(CUSTOM_HOMELAB_FILE, 'r') as f:
                custom = json.load(f)
        except Exception:
            pass
    custom.append(service_data)
    with open(CUSTOM_HOMELAB_FILE, 'w') as f:
        json.dump(custom, f, indent=2)

def delete_custom_homelab_service(service_id):
    if os.path.exists(CUSTOM_HOMELAB_FILE):
        try:
            with open(CUSTOM_HOMELAB_FILE, 'r') as f:
                custom = json.load(f)
            new_custom = [s for s in custom if s.get("id") != service_id and s.get("container") != service_id]
            if len(new_custom) != len(custom):
                with open(CUSTOM_HOMELAB_FILE, 'w') as f:
                    json.dump(new_custom, f, indent=2)
                return True
        except Exception:
            pass
    return False

def get_all_systemd_services():
    services = list(CORE_SYSTEMD_SERVICES)
    if os.path.exists(CUSTOM_SYSTEMD_FILE):
        try:
            with open(CUSTOM_SYSTEMD_FILE, 'r') as f:
                custom = json.load(f)
                services.extend(custom)
        except Exception:
            pass
    return services

def save_custom_systemd_service(service_data):
    custom = []
    if os.path.exists(CUSTOM_SYSTEMD_FILE):
        try:
            with open(CUSTOM_SYSTEMD_FILE, 'r') as f:
                custom = json.load(f)
        except Exception:
            pass
    custom.append(service_data)
    with open(CUSTOM_SYSTEMD_FILE, 'w') as f:
        json.dump(custom, f, indent=2)

def delete_custom_systemd_service(service_id):
    if os.path.exists(CUSTOM_SYSTEMD_FILE):
        try:
            with open(CUSTOM_SYSTEMD_FILE, 'r') as f:
                custom = json.load(f)
            new_custom = [s for s in custom if s.get("id") != service_id and s.get("unit") != service_id]
            if len(new_custom) != len(custom):
                with open(CUSTOM_SYSTEMD_FILE, 'w') as f:
                    json.dump(new_custom, f, indent=2)
                return True
        except Exception:
            pass
    return False

def get_dockge_status_config():
    default_cfg = {
        "url": f"http://{PRIMARY_IP}:5001",
        "connected": True
    }
    if os.path.exists(DOCKGE_CONFIG_FILE):
        try:
            with open(DOCKGE_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return default_cfg

def save_dockge_status_config(url, connected=True):
    cfg = {"url": url, "connected": connected}
    with open(DOCKGE_CONFIG_FILE, 'w') as f:
        json.dump(cfg, f, indent=2)
    return cfg
