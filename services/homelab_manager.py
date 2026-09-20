import subprocess
import json
import re
import time
import threading
from config import PRIMARY_IP

_DOCKER_STATS_CACHE = {"timestamp": 0, "data": {}}
_STATS_LOCK = threading.Lock()
_STATS_THREAD_STARTED = False

def _fetch_docker_stats_sync():
    stats = {}
    try:
        res = subprocess.run(['docker', 'stats', '--no-stream', '--format', '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'], capture_output=True, text=True, timeout=5)
        if res.returncode == 0:
            for line in res.stdout.strip().splitlines():
                if not line.strip():
                    continue
                parts = line.split('\t')
                if len(parts) >= 3:
                    name = parts[0].strip()
                    cpu = parts[1].strip()
                    mem = parts[2].strip()
                    stats[name] = {"cpu": cpu, "mem": mem}
    except Exception:
        pass
    return stats

def _stats_worker_loop():
    while True:
        try:
            new_stats = _fetch_docker_stats_sync()
            with _STATS_LOCK:
                _DOCKER_STATS_CACHE["data"] = new_stats
                _DOCKER_STATS_CACHE["timestamp"] = time.time()
        except Exception:
            pass
        time.sleep(8)

def ensure_stats_worker():
    global _STATS_THREAD_STARTED
    if not _STATS_THREAD_STARTED:
        with _STATS_LOCK:
            if not _STATS_THREAD_STARTED:
                t = threading.Thread(target=_stats_worker_loop, daemon=True, name="DockerStatsWorker")
                t.start()
                _STATS_THREAD_STARTED = True

def get_docker_stats():
    ensure_stats_worker()
    with _STATS_LOCK:
        return dict(_DOCKER_STATS_CACHE.get("data", {}))

def discover_docker_containers():
    discovered = []
    stats_map = get_docker_stats()
    try:
        res = subprocess.run(['docker', 'ps', '-a', '--format', '{{json .}}'], capture_output=True, text=True, timeout=5)
        lines = res.stdout.strip().split('\n')
        for line in lines:
            if not line.strip():
                continue
            try:
                c = json.loads(line)
            except Exception:
                continue

            name = c.get('Names', '')
            ports_raw = c.get('Ports', '')
            state = c.get('State', 'running').lower()
            img = c.get('Image', '')

            # Skip internal worker / helper containers without web interfaces
            if any(skip in name.lower() for skip in ['_postgres', '_redis', '_machine_learning', '_db', 'socket-proxy']):
                continue

            # Extract all host ports
            host_ports = [int(p) for p in re.findall(r'0\.0\.0\.0:(\d+)->', ports_raw)]
            
            # Smart port selection
            n_low = name.lower()
            if 'vaultwarden' in n_low or 'bitwarden' in n_low:
                primary_port = 8080
            elif 'stirling' in n_low or 'pdf' in n_low:
                primary_port = 8081
            elif 'adguard' in n_low:
                primary_port = 8083
            elif 'immich' in n_low:
                primary_port = 2283
            elif 'dockge' in n_low:
                primary_port = 5001
            elif 8083 in host_ports:
                primary_port = 8083
            elif 5001 in host_ports:
                primary_port = 5001
            elif 8080 in host_ports:
                primary_port = 8080
            elif 8081 in host_ports:
                primary_port = 8081
            elif 2283 in host_ports:
                primary_port = 2283
            elif host_ports:
                web_candidates = [p for p in host_ports if p not in [53, 5354, 853, 67, 68, 443, 5443, 6060]]
                primary_port = web_candidates[0] if web_candidates else host_ports[0]
            else:
                primary_port = 80

            # Smart title
            clean_name = name.replace('-', ' ').replace('_', ' ').title()
            if 'Immich' in clean_name and 'Server' in clean_name:
                clean_name = 'Immich Photo & Video Backup'
            elif 'Adguardhome' in clean_name:
                clean_name = 'AdGuard Home Console'
            elif 'Stirling' in clean_name:
                clean_name = 'Stirling PDF Suite'
            elif 'Vaultwarden' in clean_name:
                clean_name = 'Vaultwarden Password Vault'
            elif 'Dockge' in clean_name:
                clean_name = 'Dockge Stack Manager'

            # Smart icon
            icon = 'fa-cube'
            n_low = name.lower()
            if 'immich' in n_low: icon = 'fa-images'
            elif 'pdf' in n_low: icon = 'fa-file-pdf'
            elif 'adguard' in n_low: icon = 'fa-shield-halved'
            elif 'vault' in n_low: icon = 'fa-key'
            elif 'dockge' in n_low or 'portainer' in n_low: icon = 'fa-cubes'
            elif 'jellyfin' in n_low or 'plex' in n_low: icon = 'fa-film'
            elif 'torrent' in n_low: icon = 'fa-download'
            elif 'wireguard' in n_low: icon = 'fa-network-wired'

            c_stat = stats_map.get(name, {})
            discovered.append({
                'id': name.lower().replace('-', '_'),
                'name': clean_name,
                'container': name,
                'port': primary_port,
                'protocol': 'http',
                'status': 'Online' if state == 'running' else 'Offline',
                'desc': f'Docker container ({img.split(":")[0]})',
                'icon': icon,
                'is_discovered': True,
                'cpu_percent': c_stat.get('cpu', ''),
                'mem_usage': c_stat.get('mem', '')
            })
    except Exception:
        pass

    return discovered

def manage_homelab_unit(service_id, action):
    from config import get_all_homelab_services
    services = get_all_homelab_services()
    svc = next((s for s in services if s["id"] == service_id or s.get("container") == service_id), None)
    container = svc.get("container") if svc else service_id
    systemd = svc.get("systemd") if svc else None
    svc_name = svc["name"] if svc else (systemd or container)

    if systemd:
        cmd = ["sudo", "-n", "systemctl", action, systemd]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.returncode == 0:
                return True, f"Successfully performed '{action}' on {svc_name}"
            return False, res.stderr or f"Failed to {action} {systemd}"
        except Exception as e:
            return False, str(e)
    else:
        try:
            res = subprocess.run(["docker", action, container], capture_output=True, text=True, timeout=15)
            if res.returncode != 0:
                res = subprocess.run(["sudo", "-n", "docker", action, container], capture_output=True, text=True, timeout=15)
            if res.returncode == 0:
                return True, f"Successfully performed '{action}' on {svc_name}"
            return False, res.stderr or f"Failed to {action} {container}"
        except Exception as e:
            return False, str(e)

def get_homelab_logs(service_id):
    from config import get_all_homelab_services
    services = get_all_homelab_services()
    svc = next((s for s in services if s["id"] == service_id or s.get("container") == service_id), None)
    container = svc.get("container") if svc else service_id
    systemd = svc.get("systemd") if svc else None

    if systemd:
        try:
            res = subprocess.run(["sudo", "-n", "journalctl", "-u", systemd, "-n", "100", "--no-pager"], capture_output=True, text=True, timeout=15)
            logs = res.stdout + res.stderr
            return logs if logs.strip() else "No logs available."
        except Exception as e:
            return f"Error fetching logs: {e}"
    else:
        try:
            res = subprocess.run(["docker", "logs", "--tail", "100", container], capture_output=True, text=True, timeout=15)
            if res.returncode != 0:
                res = subprocess.run(["sudo", "-n", "docker", "logs", "--tail", "100", container], capture_output=True, text=True, timeout=15)
            logs = res.stdout + res.stderr
            return logs if logs.strip() else "No logs available."
        except Exception as e:
            return f"Error fetching logs: {e}"
