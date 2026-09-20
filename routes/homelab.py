import subprocess
import json
import re
import urllib.request
from flask import Blueprint, jsonify, request
from config import (
    PRIMARY_IP,
    get_all_homelab_services,
    save_custom_homelab_service,
    delete_custom_homelab_service,
    get_all_systemd_services,
    save_custom_systemd_service,
    delete_custom_systemd_service,
    get_dockge_status_config,
    save_dockge_status_config
)
from services import add_history, send_alert
from services.homelab_manager import discover_docker_containers

homelab_bp = Blueprint('homelab', __name__)

@homelab_bp.route('/api/homelab/services', methods=['GET'])
def get_services():
    services = get_all_homelab_services()
    results = []

    # Get live Docker containers
    discovered_list = discover_docker_containers()
    discovered_map = {d["container"]: d for d in discovered_list}

    # First add/update known services
    known_containers = set()
    for svc in services:
        item = dict(svc)
        container_name = svc.get("container")
        systemd_name = svc.get("systemd")
        is_custom = svc.get("is_custom", False)

        if container_name:
            known_containers.add(container_name)
            if container_name in discovered_map:
                item["status"] = discovered_map[container_name]["status"]
                # Update port if discovered
                if discovered_map[container_name].get("port"):
                    item["port"] = discovered_map[container_name]["port"]
                item["cpu_percent"] = discovered_map[container_name].get("cpu_percent", "")
                item["mem_usage"] = discovered_map[container_name].get("mem_usage", "")
                results.append(item)
            elif is_custom:
                # Custom user-added container
                item["status"] = "Offline"
                results.append(item)
        elif systemd_name:
            is_active = False
            try:
                res = subprocess.run(["systemctl", "is-active", systemd_name], capture_output=True, text=True)
                is_active = (res.stdout.strip() == "active")
            except Exception:
                pass
            if is_active:
                item["status"] = "Online"
                results.append(item)
            elif is_custom:
                item["status"] = "Offline"
                results.append(item)
        elif is_custom:
            results.append(item)

    # Auto-add any new containers discovered from Dockge / Docker that aren't in the list
    for d in discovered_list:
        if d["container"] not in known_containers:
            results.append(d)

    return jsonify(results)

@homelab_bp.route('/api/homelab/service/<service_id>/delete', methods=['POST', 'DELETE'])
def delete_service_route(service_id):
    deleted = delete_custom_homelab_service(service_id)
    if deleted:
        return jsonify({"message": f"Service '{service_id}' removed successfully."})
    return jsonify({"error": f"Custom service '{service_id}' not found."}), 404

@homelab_bp.route('/api/homelab/systemd/<service_id>/delete', methods=['POST', 'DELETE'])
def delete_systemd_route(service_id):
    deleted = delete_custom_systemd_service(service_id)
    if deleted:
        return jsonify({"message": f"Systemd service '{service_id}' removed successfully."})
    return jsonify({"error": f"Custom systemd service '{service_id}' not found."}), 404

@homelab_bp.route('/api/homelab/container/action', methods=['POST'])
def container_action_route():
    data = request.json or {}
    service_id = data.get("service_id") or data.get("id") or data.get("container")
    action = data.get("action", "").lower()

    if not service_id or not action:
        return jsonify({"error": "Service ID and action are required"}), 400

    services = get_all_homelab_services()
    svc = next((s for s in services if s["id"] == service_id or s.get("container") == service_id), None)
    container = svc.get("container") if svc else service_id

    systemd = svc.get("systemd") if svc else None

    if action == "logs":
        if systemd:
            try:
                res = subprocess.run(["sudo", "-n", "journalctl", "-u", systemd, "-n", "100", "--no-pager"], capture_output=True, text=True, timeout=5)
                logs = res.stdout + res.stderr
                return jsonify({"logs": logs if logs.strip() else "No logs available."})
            except Exception as e:
                return jsonify({"logs": f"Error fetching logs: {e}"})
        else:
            try:
                res = subprocess.run(["docker", "logs", "--tail", "100", container], capture_output=True, text=True, timeout=5)
                logs = res.stdout + res.stderr
                return jsonify({"logs": logs if logs.strip() else "No logs available."})
            except Exception as e:
                return jsonify({"logs": f"Error fetching logs: {e}"})

    if action in ["start", "stop", "restart"]:
        if systemd:
            try:
                cmd = ["sudo", "-n", "systemctl", action, systemd]
                subprocess.run(cmd, capture_output=True, text=True, check=True)
                svc_name = svc["name"] if svc else systemd
                add_history(f"{action.capitalize()} Service: {svc_name}", f"systemd_{service_id}", "Service Control", f"{action.capitalize()}ed")
                return jsonify({"message": f"Successfully performed '{action}' on {svc_name}"})
            except Exception as e:
                return jsonify({"error": str(e)}), 500
        else:
            try:
                res = subprocess.run(["docker", action, container], capture_output=True, text=True, timeout=15)
                if res.returncode != 0:
                    res = subprocess.run(["sudo", "-n", "docker", action, container], capture_output=True, text=True, timeout=15)
                
                svc_name = svc["name"] if svc else container
                add_history(f"{action.capitalize()} Container: {svc_name}", f"docker_{service_id}", "Container Control", f"{action.capitalize()}ed")
                return jsonify({"message": f"Successfully performed '{action}' on {svc_name}"})
            except Exception as e:
                return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Unsupported container action"}), 400

@homelab_bp.route('/api/homelab/service/<service_id>/<action>', methods=['POST'])
def manage_service(service_id, action):
    action = action.lower()
    if action not in ["start", "stop", "restart"]:
        return jsonify({"error": "Action not allowed"}), 400

    services = get_all_homelab_services()
    svc = next((s for s in services if s["id"] == service_id or s.get("container") == service_id), None)
    
    container = svc.get("container") if svc else service_id
    systemd = svc.get("systemd") if svc else None

    if container:
        try:
            cmd = ["docker", action, container]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            svc_name = svc["name"] if svc else container
            add_history(f"{action.capitalize()} {svc_name}", f"docker_{service_id}", "Container Control", f"{action.capitalize()}ed")
            return jsonify({"message": f"Successfully performed '{action}' on {svc_name}"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    elif systemd:
        try:
            cmd = ["sudo", "-n", "systemctl", action, systemd]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            svc_name = svc["name"] if svc else systemd
            add_history(f"{action.capitalize()} {svc_name}", f"systemd_{service_id}", "Service Control", f"{action.capitalize()}ed")
            return jsonify({"message": f"Successfully performed '{action}' on {svc_name}"})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Service has no manageable container or unit"}), 400

@homelab_bp.route('/api/homelab/service/<service_id>/logs', methods=['GET'])
def get_container_logs(service_id):
    services = get_all_homelab_services()
    svc = next((s for s in services if s["id"] == service_id or s.get("container") == service_id), None)
    container = svc.get("container") if svc else service_id

    if container:
        try:
            res = subprocess.run(["docker", "logs", "--tail", "120", container], capture_output=True, text=True)
            return jsonify({"logs": res.stdout or res.stderr or "No recent container log output."})
        except Exception as e:
            return jsonify({"logs": f"Error fetching container logs: {e}"})

    return jsonify({"logs": "No container logs available for this service."})

@homelab_bp.route('/api/homelab/service/create', methods=['POST'])
def create_homelab_service():
    data = request.json or {}
    name = data.get("name", "").strip()
    container = data.get("container", "").strip()
    port = data.get("port")
    protocol = data.get("protocol", "http").strip().lower()
    desc = data.get("desc", "").strip()
    icon = data.get("icon", "fa-cube").strip()
    url = data.get("url", "").strip()

    if not name:
        return jsonify({"error": "Service Name is required"}), 400

    service_id = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower())
    try:
        port_num = int(port) if port else 80
    except ValueError:
        port_num = 80

    service_data = {
        "id": service_id,
        "name": name,
        "container": container if container else service_id,
        "port": port_num,
        "protocol": protocol,
        "desc": desc if desc else f"{name} container service",
        "icon": icon if icon else "fa-cube",
        "is_custom": True
    }
    if url:
        service_data["url"] = url

    save_custom_homelab_service(service_data)
    add_history(f"Added Container '{name}'", f"homelab_{service_id}", "Homelab Orchestrator", "Added")
    send_alert("Container Added", f"New Docker Service: {name}", f"Container `{service_data['container']}` on port `{port_num}` registered.")
    return jsonify({"message": f"Successfully registered container '{name}'", "service": service_data})

@homelab_bp.route('/api/homelab/systemd/create', methods=['POST'])
def create_systemd_service():
    data = request.json or {}
    name = data.get("name", "").strip()
    unit = data.get("unit", "").strip()
    port = data.get("port")
    protocol = data.get("protocol", "http").strip().lower()
    desc = data.get("desc", "").strip()
    icon = data.get("icon", "fa-gears").strip()
    url = data.get("url", "").strip()

    if not name or not unit:
        return jsonify({"error": "Service Name and Systemd Unit Name are required"}), 400

    if not unit.endswith(".service"):
        unit = f"{unit}.service"

    service_id = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower())
    try:
        port_num = int(port) if port else 80
    except ValueError:
        port_num = 80

    service_data = {
        "id": service_id,
        "name": name,
        "unit": unit,
        "port": port_num,
        "protocol": protocol,
        "desc": desc if desc else f"{name} system daemon",
        "icon": icon if icon else "fa-gears",
        "url": url if url else f"{protocol}://{PRIMARY_IP}:{port_num}",
        "is_custom": True
    }

    save_custom_systemd_service(service_data)
    add_history(f"Added Daemon '{name}'", f"systemd_{service_id}", "Systemd Orchestrator", "Added")
    send_alert("Daemon Added", f"New Systemd Unit: {name}", f"Daemon `{unit}` registered on dashboard.")
    return jsonify({"message": f"Successfully registered daemon '{name}'", "service": service_data})

@homelab_bp.route('/api/homelab/dockge/status', methods=['GET'])
def get_dockge_status():
    cfg = get_dockge_status_config()
    url = cfg.get("url", f"http://{PRIMARY_IP}:5001")
    is_live = False

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "LinuxCommandCenter"})
        with urllib.request.urlopen(req, timeout=1.5) as res:
            if res.status in [200, 301, 302]:
                is_live = True
    except Exception:
        pass

    containers = discover_docker_containers()

    return jsonify({
        "url": url,
        "connected": cfg.get("connected", True),
        "is_live": is_live,
        "container_count": len(containers),
        "containers": containers,
        "status_text": "Connected & Online" if (is_live and cfg.get("connected", True)) else ("Connected (Offline)" if cfg.get("connected", True) else "Disconnected")
    })

@homelab_bp.route('/api/homelab/dockge/sync', methods=['POST', 'GET'])
def sync_dockge_containers():
    containers = discover_docker_containers()
    add_history("Synced Dockge & Docker Stacks", "dockge_sync", "Dockge Sync", f"Discovered {len(containers)} containers")
    return jsonify({
        "message": f"Successfully synced and discovered {len(containers)} Docker containers from host!",
        "count": len(containers),
        "containers": containers
    })

@homelab_bp.route('/api/homelab/dockge/connect', methods=['POST'])
def set_dockge_connection():
    data = request.json or {}
    url = data.get("url", "").strip()
    connected = data.get("connected", True)

    if not url:
        url = f"http://{PRIMARY_IP}:5001"

    cfg = save_dockge_status_config(url, connected)
    containers = discover_docker_containers()
    st = "Connected" if connected else "Disconnected"
    msg = f"Dockge stack manager is now {st.lower()} ({url}). Detected {len(containers)} active Docker containers." if connected else "Dockge stack manager disconnected."

    add_history(f"Dockge Manager {st}", "dockge_connect", "System Settings", st)
    return jsonify({
        "message": msg,
        "url": url,
        "connected": connected,
        "container_count": len(containers)
    })

@homelab_bp.route('/api/dns/protection-status', methods=['GET'])
def dns_protection_status():
    is_enabled = True
    status_text = "Active"
    try:
        res = subprocess.run(["sudo", "-n", "pihole", "status"], capture_output=True, text=True, timeout=3)
        out = res.stdout.lower()
        if "blocking is disabled" in out or "disabled" in out:
            is_enabled = False
            status_text = "Paused"
        elif "blocking is enabled" in out or "enabled" in out:
            is_enabled = True
            status_text = "Active"
    except Exception as e:
        status_text = f"Error: {e}"

    return jsonify({
        "enabled": is_enabled,
        "status": status_text
    })

@homelab_bp.route('/api/dns/pause', methods=['POST'])
def dns_pause_protection():
    data = request.json or {}
    duration = data.get("duration", "5m").strip().lower()
    if not re.match(r'^\d+[smh]$', duration):
        duration = "5m"

    try:
        cmd = ["sudo", "-n", "pihole", "disable", duration]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        add_history(f"Paused DNS Protection ({duration})", "dns_pause", "DNS Security", f"Paused {duration}")
        send_alert("DNS Security", f"DNS Protection Paused ({duration})", f"Pi-hole ad-blocking was temporarily paused for {duration}.")
        return jsonify({
            "success": True,
            "status": "paused",
            "duration": duration,
            "message": f"DNS protection paused for {duration}."
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@homelab_bp.route('/api/dns/resume', methods=['POST'])
def dns_resume_protection():
    try:
        cmd = ["sudo", "-n", "pihole", "enable"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        add_history("Resumed DNS Protection", "dns_resume", "DNS Security", "Active")
        send_alert("DNS Security", "DNS Protection Resumed", "Pi-hole ad-blocking shield has been re-enabled.")
        return jsonify({
            "success": True,
            "status": "active",
            "message": "DNS protection resumed successfully."
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@homelab_bp.route('/api/dns/unbound/status', methods=['GET'])
def unbound_status_route():
    is_active = False
    stats = {"queries": 0, "cache_hits": 0, "cache_miss": 0, "uptime": "0s"}
    try:
        res = subprocess.run(["sudo", "-n", "systemctl", "is-active", "unbound"], capture_output=True, text=True, timeout=3)
        is_active = (res.stdout.strip() == "active")
    except Exception:
        pass

    try:
        res_stats = subprocess.run(["sudo", "-n", "unbound-control", "stats_noreset"], capture_output=True, text=True, timeout=3)
        for line in res_stats.stdout.splitlines():
            if line.startswith("total.num.queries="):
                stats["queries"] = int(line.split("=")[1])
            elif line.startswith("total.num.cachehits="):
                stats["cache_hits"] = int(line.split("=")[1])
            elif line.startswith("total.num.cachemiss="):
                stats["cache_miss"] = int(line.split("=")[1])
            elif line.startswith("time.up="):
                up_sec = float(line.split("=")[1])
                stats["uptime"] = f"{int(up_sec // 3600)}h {int((up_sec % 3600) // 60)}m"
    except Exception:
        pass

    return jsonify({
        "status": "Active" if is_active else "Offline",
        "active": is_active,
        "port": 5335,
        "dnssec": True,
        "queries": stats["queries"],
        "cache_hits": stats["cache_hits"],
        "cache_miss": stats["cache_miss"],
        "uptime": stats["uptime"]
    })

@homelab_bp.route('/api/dns/unbound/flush', methods=['POST'])
def unbound_flush_route():
    try:
        res = subprocess.run(["sudo", "-n", "unbound-control", "flush_zone", "."], capture_output=True, text=True, timeout=5)
        add_history("Flushed Unbound DNS Cache", "unbound_flush", "DNS Security", "Success")
        return jsonify({"success": True, "message": "Unbound DNS cache successfully flushed!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@homelab_bp.route('/api/dns/unbound/restart', methods=['POST'])
def unbound_restart_route():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "restart", "unbound.service"], capture_output=True, text=True, timeout=10)
        add_history("Restarted Unbound Resolver", "unbound_restart", "DNS Security", "Success")
        return jsonify({"success": True, "message": "Unbound DNS resolver successfully restarted!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

from services.watchdog_manager import (
    get_watchdog_status,
    toggle_watchdog,
    run_watchdog_sweep
)

@homelab_bp.route('/api/homelab/watchdog/status', methods=['GET'])
def watchdog_status_route():
    try:
        return jsonify(get_watchdog_status())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@homelab_bp.route('/api/homelab/watchdog/toggle', methods=['POST'])
def watchdog_toggle_route():
    try:
        data = request.json or {}
        new_val = toggle_watchdog(data.get("enabled"))
        return jsonify({"success": True, "enabled": new_val, "message": f"Watchdog {'enabled' if new_val else 'disabled'} successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@homelab_bp.route('/api/homelab/watchdog/heal-now', methods=['POST'])
def watchdog_heal_now_route():
    try:
        results = run_watchdog_sweep()
        return jsonify({"success": True, "results": results, "message": "Watchdog health sweep completed!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500



