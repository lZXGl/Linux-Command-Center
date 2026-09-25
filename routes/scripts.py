import os
import sys
import re
import shlex
import subprocess
import glob
import threading
import time
from datetime import datetime
from flask import Blueprint, jsonify, request
from config import (
    BASE_DIR,
    APP_DIR,
    SCREENSHOTS_DIR,
    get_all_scripts,
    get_all_homelab_services,
    get_all_systemd_services,
    save_custom_script,
    delete_custom_script
)
from services import (
    get_current_crontab,
    parse_cron_status,
    update_script_crontab,
    get_history,
    add_history,
    send_alert
)

scripts_bp = Blueprint('scripts', __name__)

def is_process_running(script_name):
    if not script_name:
        return False
    current_pid = os.getpid()
    try:
        res = subprocess.run(["ps", "-eo", "pid,args"], capture_output=True, text=True)
        for line in res.stdout.splitlines():
            line_str = line.strip()
            if not line_str:
                continue
            parts = line_str.split(None, 1)
            if len(parts) < 2:
                continue
            try:
                pid = int(parts[0])
            except ValueError:
                continue
            if pid == current_pid:
                continue
            cmdline = parts[1]
            if f"/{script_name}" in cmdline or f" {script_name}" in cmdline:
                return True
    except Exception:
        pass
    return False

@scripts_bp.route('/api/scripts', methods=['GET'])
def get_scripts_list():
    scripts_dict = get_all_scripts()
    crontab_content = get_current_crontab()
    result = []

    for sid, sinfo in scripts_dict.items():
        cron_info = parse_cron_status(crontab_content, sinfo)
        
        # Check if running
        script_file = sinfo.get("script")
        is_running = is_process_running(script_file)

        # Check screenshot
        screenshot_time = None
        screenshot_url = None
        s_file = sinfo.get("screenshot")
        if s_file:
            screenshot_url = f"/screenshots/{s_file}"
            s_path = os.path.join(SCREENSHOTS_DIR, s_file)
            if os.path.exists(s_path):
                screenshot_time = datetime.fromtimestamp(os.path.getmtime(s_path)).strftime("%Y-%m-%d %I:%M %p")

        item = {
            "id": sid,
            "name": sinfo.get("name"),
            "category": sinfo.get("category"),
            "script": sinfo.get("script"),
            "path": sinfo.get("path"),
            "interpreter": sinfo.get("interpreter", "python3"),
            "is_existing": sinfo.get("is_existing", False),
            "icon": sinfo.get("icon", "fa-code"),
            "desc": sinfo.get("desc", ""),
            "cron_enabled": cron_info["enabled"],
            "schedules": cron_info["schedules"],
            "schedule_str": cron_info["schedule_str"],
            "is_running": is_running,
            "screenshot_time": screenshot_time,
            "screenshot_url": screenshot_url,
            "is_custom": sid not in ["system_health", "docker_prune", "backup_daily"]
        }
        result.append(item)

    return jsonify(result)

@scripts_bp.route('/api/scripts/discover', methods=['GET'])
def discover_local_scripts():
    """Scans safe user and system locations for existing scripts (.sh, .py, .bash, executables)."""
    search_dirs = [
        os.path.expanduser("~/scripts"),
        os.path.expanduser("~"),
        BASE_DIR,
        os.path.join(APP_DIR, "scripts"),
        "/usr/local/bin"
    ]
    found = []
    seen_paths = set()

    for sdir in search_dirs:
        if not os.path.exists(sdir) or not os.path.isdir(sdir):
            continue
        try:
            for entry in os.scandir(sdir):
                if entry.is_file(follow_symlinks=False):
                    lower = entry.name.lower()
                    if entry.name.startswith('.'):
                        continue
                    if lower.endswith(('.log', '.txt', '.json', '.html', '.css', '.js', '.md', '.png', '.jpg', '.tar.gz', '.zip', '.bak')):
                        continue

                    is_script_ext = lower.endswith(('.sh', '.py', '.bash'))
                    is_exec = os.access(entry.path, os.X_OK)

                    if (is_script_ext or is_exec) and entry.path not in seen_paths:
                        seen_paths.add(entry.path)
                        ext = os.path.splitext(entry.name)[1].lower()
                        if ext in ['.sh', '.bash']:
                            stype = "bash"
                        elif ext == '.py':
                            stype = "python3"
                        else:
                            stype = "executable"

                        size_b = entry.stat().st_size
                        size_str = f"{size_b / 1024:.1f} KB" if size_b > 1024 else f"{size_b} B"
                        found.append({
                            "name": entry.name,
                            "path": entry.path,
                            "type": stype,
                            "size": size_str
                        })
        except Exception:
            continue

    return jsonify({"scripts": found[:40]})

@scripts_bp.route('/api/scripts/create', methods=['POST'])
def create_script():
    data = request.json or {}
    mode = data.get("mode", "").strip().lower()  # "existing" or "new"
    existing_path = (data.get("path") or data.get("existing_path") or "").strip()
    name = data.get("name", "").strip()
    category = data.get("category", "Custom Scripts").strip()
    desc = data.get("desc", "").strip()
    schedule = data.get("schedule", "").strip()
    interpreter = (data.get("interpreter") or "").strip().lower()
    icon = data.get("icon", "")

    # Mode 1: Link Existing Script on System
    if mode == "existing" or existing_path:
        if not existing_path:
            return jsonify({"error": "Path to existing script is required"}), 400

        clean_path = os.path.abspath(os.path.expanduser(existing_path))
        if not os.path.exists(clean_path):
            return jsonify({"error": f"Script file not found: {existing_path}"}), 400
        if not os.path.isfile(clean_path):
            return jsonify({"error": f"Target path is not a regular file: {existing_path}"}), 400

        base_name = os.path.basename(clean_path)
        if not name:
            name_stem = os.path.splitext(base_name)[0].replace('_', ' ').replace('-', ' ').title()
            name = f"{name_stem} Runner"

        script_id = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower()).strip('_')
        if not script_id:
            script_id = f"script_{int(time.time())}"

        # Detect interpreter if not specified or set to auto
        if not interpreter or interpreter == "auto":
            lower = clean_path.lower()
            if lower.endswith(('.sh', '.bash')):
                interpreter = "bash"
            elif lower.endswith('.py'):
                interpreter = "python3"
            elif os.access(clean_path, os.X_OK):
                interpreter = "executable"
            else:
                try:
                    with open(clean_path, 'r', encoding='utf-8', errors='ignore') as f:
                        first_line = f.readline()
                        if 'python' in first_line:
                            interpreter = "python3"
                        elif 'bash' in first_line or 'sh' in first_line:
                            interpreter = "bash"
                        else:
                            interpreter = "executable"
                except Exception:
                    interpreter = "bash"

        if not icon:
            icon = "fa-terminal" if interpreter == "bash" else ("fa-python" if interpreter == "python3" else "fa-gear")

        # Make file executable if permissions permit
        try:
            os.chmod(clean_path, os.stat(clean_path).st_mode | 0o755)
        except Exception:
            pass

        script_info = {
            "id": script_id,
            "name": name,
            "script": base_name,
            "path": clean_path,
            "dir": os.path.dirname(clean_path),
            "python": "python3",
            "interpreter": interpreter,
            "category": category,
            "icon": icon,
            "desc": desc or f"Existing {interpreter.upper()} script at {clean_path}",
            "is_existing": True,
            "cron_pattern": rf'({re.escape(base_name)}|cron_runner\.py\s+{script_id})'
        }

        save_custom_script(script_id, script_info)
        add_history(f"Linked Existing Script '{name}'", script_id, "Dashboard Creator", "Linked")
        send_alert("Script Linked", f"Existing Script Linked: {name}", f"Script `{clean_path}` added to dashboard in `{category}`.")

        if schedule:
            parts = schedule.split()
            if len(parts) == 5:
                update_script_crontab(script_id, script_info, [{
                    "dow": parts[4],
                    "hour": parts[1],
                    "minute": parts[0]
                }], True)

        return jsonify({"message": f"Successfully linked existing script '{name}'", "id": script_id})

    # Mode 2: Create Brand New Script File
    if not name:
        return jsonify({"error": "Script name is required"}), 400

    code = data.get("code", "").strip()
    script_type = data.get("type", "python").lower()  # "python" or "bash"
    script_id = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower()).strip('_')
    if not script_id:
        script_id = f"script_{int(time.time())}"

    if script_type in ["bash", "sh"]:
        filename = f"{script_id}.sh"
        interpreter = "bash"
        if not icon:
            icon = "fa-terminal"
        if not code:
            code = f"""#!/usr/bin/env bash
# {name}
set -e

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting {name}..."
sleep 1
echo "Execution finished successfully."
"""
    else:
        filename = f"{script_id}.py"
        interpreter = "python3"
        if not icon:
            icon = "fa-code"
        if not code:
            code = f"""#!/usr/bin/env python3
# {name}
import time
from datetime import datetime

def main():
    print(f"[{{datetime.now()}}] Starting {name}...")
    time.sleep(1)
    print("Execution finished successfully.")

if __name__ == "__main__":
    main()
"""

    filepath = os.path.join(BASE_DIR, filename)
    os.makedirs(BASE_DIR, exist_ok=True)
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(code)
        os.chmod(filepath, 0o755)
    except Exception as e:
        return jsonify({"error": f"Failed to write script file: {e}"}), 500

    script_info = {
        "id": script_id,
        "name": name,
        "script": filename,
        "path": filepath,
        "dir": BASE_DIR,
        "python": "python3",
        "interpreter": interpreter,
        "category": category,
        "icon": icon,
        "desc": desc,
        "is_existing": False,
        "cron_pattern": rf'({re.escape(filename)}|cron_runner\.py\s+{script_id})'
    }

    save_custom_script(script_id, script_info)
    add_history(f"Created Custom Script '{name}'", script_id, "Dashboard Creator", "Created")
    send_alert("Script Created", f"New Script Registered: {name}", f"Script `{filename}` in category `{category}` has been added to dashboard.")

    if schedule:
        parts = schedule.split()
        if len(parts) == 5:
            update_script_crontab(script_id, script_info, [{
                "dow": parts[4],
                "hour": parts[1],
                "minute": parts[0]
            }], True)

    return jsonify({"message": f"Successfully created script '{name}'", "id": script_id})

@scripts_bp.route('/api/scripts/<script_id>', methods=['DELETE'])
@scripts_bp.route('/api/scripts/<script_id>/delete', methods=['POST'])
def delete_script(script_id):
    deleted = delete_custom_script(script_id)
    if deleted:
        add_history(f"Deleted Script '{script_id}'", script_id, "Dashboard Creator", "Deleted")
        return jsonify({"message": f"Script {script_id} deleted successfully"})
    return jsonify({"error": "Cannot delete core script or script not found"}), 400

@scripts_bp.route('/api/scripts/<script_id>/run', methods=['POST'])
@scripts_bp.route('/api/run/<script_id>', methods=['POST'])
def run_script(script_id):
    scripts = get_all_scripts()
    sinfo = scripts.get(script_id)
    if not sinfo:
        return jsonify({"error": "Script not found"}), 404

    script_name = sinfo.get("script")
    if is_process_running(script_name):
        return jsonify({"error": f"Script {sinfo.get('name')} is already running"}), 400

    python_bin = sinfo.get("python", sys.executable)
    script_dir = sinfo.get("dir", BASE_DIR)
    script_path = sinfo.get("path") or os.path.join(script_dir, script_name)

    log_dir = os.path.join(APP_DIR, "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = sinfo.get("log", os.path.join(log_dir, f"{script_id}.log"))

    interpreter = (sinfo.get("interpreter") or "").lower()
    if not interpreter:
        if script_path.endswith(('.sh', '.bash')):
            interpreter = "bash"
        elif script_path.endswith('.py'):
            interpreter = "python3"
        elif os.access(script_path, os.X_OK):
            interpreter = "executable"
        else:
            interpreter = "python3"

    q_path = shlex.quote(script_path)
    q_log = shlex.quote(log_path)

    if interpreter in ["bash", "sh"]:
        shell_bin = "/bin/bash" if interpreter == "bash" else "/bin/sh"
        cmd = f"nohup {shell_bin} {q_path} > {q_log} 2>&1 &"
    elif interpreter == "executable":
        cmd = f"nohup {q_path} > {q_log} 2>&1 &"
    else:
        cmd = f"nohup {python_bin} {q_path} > {q_log} 2>&1 &"

    run_cwd = script_dir if os.path.exists(script_dir) else os.path.dirname(script_path)
    if not os.path.exists(run_cwd):
        run_cwd = os.path.expanduser("~")

    try:
        subprocess.Popen(cmd, shell=True, cwd=run_cwd)
        add_history(sinfo.get("name"), script_id, "Manual Dashboard", "Started")
        send_alert("Manual Execution", f"Script Triggered: {sinfo.get('name')}", f"Manual run triggered from Dashboard.")
        return jsonify({"message": f"Started {sinfo.get('name')} in background!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@scripts_bp.route('/api/scripts/<script_id>/status', methods=['GET'])
def get_script_status(script_id):
    scripts = get_all_scripts()
    sinfo = scripts.get(script_id)
    if not sinfo:
        return jsonify({"running": False})
    return jsonify({"running": is_process_running(sinfo.get("script"))})

@scripts_bp.route('/api/scripts/<script_id>/toggle', methods=['POST'])
def toggle_script_cron(script_id):
    scripts = get_all_scripts()
    sinfo = scripts.get(script_id)
    if not sinfo:
        return jsonify({"error": "Script not found"}), 404

    crontab_content = get_current_crontab()
    cron_info = parse_cron_status(crontab_content, sinfo)
    new_enabled = not cron_info["enabled"]

    schedules = cron_info["schedules"]
    if not schedules and new_enabled:
        schedules = [{"dow": "*", "hour": "09", "minute": "00"}]

    success, msg = update_script_crontab(script_id, sinfo, schedules, new_enabled)
    if success:
        st = "Enabled" if new_enabled else "Disabled"
        add_history(f"{st} Cron: {sinfo.get('name')}", script_id, "Schedule Toggle", st)
        return jsonify({"message": f"Crontab schedule {st.lower()} for {sinfo.get('name')}", "enabled": new_enabled})
    return jsonify({"error": msg}), 500

@scripts_bp.route('/api/scripts/<script_id>/cron', methods=['POST'])
def update_script_cron_endpoint(script_id):
    scripts = get_all_scripts()
    sinfo = scripts.get(script_id)
    if not sinfo:
        return jsonify({"error": "Script not found"}), 404

    data = request.json or {}
    schedules = data.get("schedules") or data.get("per_day_schedules") or []
    enabled = data.get("enabled", True)
    cron_expr = data.get("cron_expr", "").strip()

    if cron_expr:
        parts = cron_expr.split()
        if len(parts) >= 5:
            schedules = [{
                "minute": parts[0],
                "hour": parts[1],
                "dow": parts[4]
            }]

    success, msg = update_script_crontab(script_id, sinfo, schedules, enabled)
    if success:
        add_history(f"Updated Schedule: {sinfo.get('name')}", script_id, "Cron Editor", "Updated")
        return jsonify({"message": f"Updated crontab schedule for {sinfo.get('name')}"})
    return jsonify({"error": msg}), 500

def fetch_log_content_for_id(script_id, max_chars=25000):
    scripts = get_all_scripts()
    sinfo = scripts.get(script_id, {})

    clean_id = script_id.replace("_automation", "").replace("_script", "").lower()

    # 1. Candidate file paths
    candidate_paths = []
    if sinfo.get("log"):
        candidate_paths.append(sinfo["log"])

    script_dir = sinfo.get("dir", BASE_DIR)
    candidate_paths.extend([
        os.path.join(script_dir, "logs", f"{script_id}.log"),
        os.path.join(script_dir, "logs", f"{clean_id}.log"),
        os.path.join(script_dir, f"{script_id}.log"),
        os.path.join(script_dir, f"{clean_id}.log"),
        os.path.join(APP_DIR, "logs", f"{script_id}.log"),
        os.path.join(APP_DIR, "logs", f"{clean_id}.log"),
        os.path.join(APP_DIR, f"{script_id}.log"),
        os.path.join(APP_DIR, f"{clean_id}.log"),
    ])

    if script_id in ["system_update", "update_all"]:
        candidate_paths.insert(0, os.path.join(APP_DIR, "system_update.log"))

    # Check candidates
    for p in candidate_paths:
        if p and os.path.exists(p) and os.path.getsize(p) > 0:
            try:
                with open(p, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if content.strip():
                        return content[-max_chars:] if len(content) > max_chars else content
            except Exception:
                pass

    # Fuzzy check in script_dir/logs/ and APP_DIR/logs/
    for logs_dir in [os.path.join(script_dir, "logs"), os.path.join(APP_DIR, "logs")]:
        if os.path.exists(logs_dir):
            try:
                for f in os.listdir(logs_dir):
                    if f.endswith(".log") and (clean_id in f.lower() or script_id.lower() in f.lower()):
                        fp = os.path.join(logs_dir, f)
                        if os.path.getsize(fp) > 0:
                            with open(fp, 'r', encoding='utf-8', errors='ignore') as log_file:
                                c = log_file.read()
                                if c.strip():
                                    return c[-max_chars:] if len(c) > max_chars else c
            except Exception:
                pass

    # 2. Check if script_id is a verified Docker container
    homelab_services = get_all_homelab_services()
    c_match = next((s for s in homelab_services if s.get("id") == script_id or s.get("container") == script_id), None)
    if c_match or script_id in ["adguardhome", "immich_server", "immich_machine_learning", "immich_postgres", "immich_redis"]:
        container_name = c_match.get("container", script_id) if c_match else script_id
        try:
            res = subprocess.run(["docker", "logs", "--tail", "150", container_name], capture_output=True, text=True, timeout=2)
            if res.returncode == 0:
                out = res.stdout.strip() or res.stderr.strip()
                if out:
                    return out
        except Exception:
            pass

    # 3. Check if script_id is a verified systemd unit
    systemd_services = get_all_systemd_services()
    u_match = next((s for s in systemd_services if s.get("id") == script_id or s.get("unit", "").startswith(script_id)), None)
    if u_match or script_id in ["jellyfin", "all-in-one-dash", "homelab-command-center", "linux-command-center"]:
        unit_name = u_match.get("unit") if u_match else (f"{script_id}.service" if not script_id.endswith(".service") else script_id)
        try:
            res = subprocess.run(["journalctl", "-u", unit_name, "-n", "100", "--no-pager"], capture_output=True, text=True, timeout=2)
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout.strip()
        except Exception:
            pass

    # 4. Check watchdog incidents
    try:
        from services.watchdog_manager import load_watchdog_incidents
        incidents = load_watchdog_incidents(15)
        matched = [inc for inc in incidents if inc.get("id") == script_id or script_id in inc.get("name", "").lower()]
        if matched:
            lines = [f"=== Watchdog Diagnostics for {script_id.upper()} ==="]
            for m in matched[:5]:
                lines.append(f"[{m.get('timestamp')}] {m.get('action')} - Result: {m.get('result')}")
                if m.get('details'):
                    lines.append(f"  Reason: {m.get('details')}")
            return "\n".join(lines)
    except Exception:
        pass

    # 5. Check execution history
    try:
        history = get_history()
        matched = [h for h in history if h.get("id") == script_id or script_id in h.get("name", "").lower()]
        if matched:
            lines = [f"=== Execution History Record for {script_id.upper()} ==="]
            for h in matched[:8]:
                lines.append(f"[{h.get('timestamp')}] Task: {h.get('name')} | Trigger: {h.get('trigger')}")
                lines.append(f"  Status: {h.get('status')}")
            return "\n".join(lines)
    except Exception:
        pass

    return "No execution log output recorded yet for this task."

@scripts_bp.route('/api/logs/<script_id>', methods=['GET'])
def get_script_logs(script_id):
    content = fetch_log_content_for_id(script_id)
    return jsonify({
        "logs": content,
        "log": content,
        "script_id": script_id
    })

@scripts_bp.route('/api/code/<script_id>', methods=['GET', 'POST'])
def manage_script_code(script_id):
    scripts = get_all_scripts()
    sinfo = scripts.get(script_id)
    if not sinfo:
        return jsonify({"error": "Script not found"}), 404

    filepath = sinfo.get("path") or os.path.join(sinfo.get("dir", BASE_DIR), sinfo.get("script"))

    if request.method == 'GET':
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    return jsonify({"code": f.read()})
            except Exception as e:
                return jsonify({"error": str(e)}), 500
        return jsonify({"error": "Script source file not found"}), 404

    data = request.json or {}
    new_code = data.get("code", "")
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_code)
        add_history(f"Edited Code for {sinfo.get('name')}", script_id, "Code Editor", "Saved")
        return jsonify({"message": "Code saved successfully!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@scripts_bp.route('/api/history', methods=['GET'])
def get_execution_history_route():
    return jsonify(get_history())

_BATCH_SCRIPTS_LOCK = threading.Lock()
_BATCH_SCRIPTS_RUNNING = False
_BATCH_SCRIPTS_CURRENT = None

def _run_batch_worker(script_ids):
    global _BATCH_SCRIPTS_RUNNING, _BATCH_SCRIPTS_CURRENT
    with _BATCH_SCRIPTS_LOCK:
        _BATCH_SCRIPTS_RUNNING = True
    try:
        scripts = get_all_scripts()
        for sid in script_ids:
            with _BATCH_SCRIPTS_LOCK:
                _BATCH_SCRIPTS_CURRENT = sid
            sinfo = scripts.get(sid)
            if not sinfo:
                continue
            script_name = sinfo.get("script")
            python_bin = sinfo.get("python", sys.executable)
            script_dir = sinfo.get("dir", BASE_DIR)
            script_path = os.path.join(script_dir, script_name)
            log_dir = os.path.join(script_dir, "logs")
            os.makedirs(log_dir, exist_ok=True)
            log_path = sinfo.get("log", os.path.join(log_dir, f"{sid}.log"))

            s_name = sinfo.get("name", sid)
            add_history(s_name, sid, "Batch Runner", "Started")
            try:
                with open(log_path, "a") as lf:
                    lf.write(f"\n--- Batch run started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---\n")
                    lf.flush()
                    proc = subprocess.Popen(
                        [python_bin, script_path],
                        cwd=script_dir,
                        stdout=lf,
                        stderr=subprocess.STDOUT
                    )
                    proc.wait(timeout=180)
                    status_text = "Completed" if proc.returncode == 0 else f"Failed (exit {proc.returncode})"
                    add_history(s_name, sid, "Batch Runner", status_text)
            except subprocess.TimeoutExpired:
                try:
                    proc.kill()
                except Exception:
                    pass
                add_history(s_name, sid, "Batch Runner", "Timed Out (180s)")
            except Exception as e:
                add_history(s_name, sid, "Batch Runner", f"Error: {e}")

            time.sleep(2)
    finally:
        with _BATCH_SCRIPTS_LOCK:
            _BATCH_SCRIPTS_RUNNING = False
            _BATCH_SCRIPTS_CURRENT = None

@scripts_bp.route('/api/scripts/batch', methods=['POST'])
def run_scripts_batch():
    global _BATCH_SCRIPTS_RUNNING, _BATCH_SCRIPTS_CURRENT
    with _BATCH_SCRIPTS_LOCK:
        if _BATCH_SCRIPTS_RUNNING:
            return jsonify({
                "error": "A batch execution is already in progress.",
                "current_script": _BATCH_SCRIPTS_CURRENT,
                "running": True
            }), 409

    data = request.json or {}
    category = data.get("category")
    scripts_requested = data.get("scripts", [])

    scripts = get_all_scripts()
    if scripts_requested:
        batch_ids = [sid for sid in scripts_requested if sid in scripts]
    elif category:
        batch_ids = [sid for sid, s in scripts.items() if s.get("category") == category]
    else:
        batch_ids = list(scripts.keys())

    if not batch_ids:
        return jsonify({"error": "No matching scripts found for batch run"}), 404

    t = threading.Thread(target=_run_batch_worker, args=(batch_ids,), daemon=True)
    t.start()
    return jsonify({
        "message": f"Started sequential batch run for {len(batch_ids)} scripts. Running in background.",
        "scripts": batch_ids
    })

@scripts_bp.route('/api/scripts/batch/status', methods=['GET'])
def get_scripts_batch_status():
    with _BATCH_SCRIPTS_LOCK:
        return jsonify({
            "running": _BATCH_SCRIPTS_RUNNING,
            "current_script": _BATCH_SCRIPTS_CURRENT
        })

@scripts_bp.route('/api/scripts/timeline', methods=['GET'])
def get_scripts_timeline():
    history = get_history(limit=50)
    scripts = get_all_scripts()
    timeline = []
    
    for item in history:
        sid = item.get("id", "")
        name = item.get("name", sid)
        status = item.get("status", "")
        ts = item.get("timestamp", "")
        trigger = item.get("trigger", "")
        
        status_low = status.lower()
        is_error = any(k in status_low for k in ["fail", "error", "exception", "exit 1", "exit 2", "crash"])
        is_success = any(k in status_low for k in ["success", "completed", "done", "started", "enabled", "pushed"])
        
        dur_match = re.search(r'\(([0-9.]+)s\)', status)
        duration_s = float(dur_match.group(1)) if dur_match else None
        
        screenshot_url = None
        sinfo = scripts.get(sid, {})
        s_file = sinfo.get("screenshot")
        if s_file:
            s_path = os.path.join(SCREENSHOTS_DIR, s_file)
            if os.path.exists(s_path):
                screenshot_url = f"/screenshots/{s_file}"
        
        timeline.append({
            "id": sid,
            "name": name,
            "timestamp": ts,
            "trigger": trigger,
            "status": status,
            "is_error": is_error,
            "is_success": is_success and not is_error,
            "duration_s": duration_s,
            "screenshot_url": screenshot_url
        })
        
    return jsonify({
        "timeline": timeline,
        "total_runs": len(timeline),
        "success_count": sum(1 for t in timeline if t["is_success"]),
        "error_count": sum(1 for t in timeline if t["is_error"])
    })

@scripts_bp.route('/api/scripts/<script_id>/failure-snapshot', methods=['GET'])
def get_script_failure_snapshot(script_id):
    scripts = get_all_scripts()
    sinfo = scripts.get(script_id, {})
    
    # 1. Fetch screenshot
    screenshot_url = None
    screenshot_time = None
    s_file = sinfo.get("screenshot")
    if s_file:
        s_path = os.path.join(SCREENSHOTS_DIR, s_file)
        if os.path.exists(s_path):
            screenshot_url = f"/screenshots/{s_file}"
            screenshot_time = datetime.fromtimestamp(os.path.getmtime(s_path)).strftime("%Y-%m-%d %I:%M %p")
    
    if not screenshot_url:
        for ext in [".png", ".jpg"]:
            alt_path = os.path.join(SCREENSHOTS_DIR, f"{script_id}{ext}")
            if os.path.exists(alt_path):
                screenshot_url = f"/screenshots/{script_id}{ext}"
                screenshot_time = datetime.fromtimestamp(os.path.getmtime(alt_path)).strftime("%Y-%m-%d %I:%M %p")
                break

    # 2. Fetch last 60 lines of log
    full_log = fetch_log_content_for_id(script_id)
    lines = full_log.splitlines()
    log_tail = "\n".join(lines[-60:]) if len(lines) > 60 else full_log

    # 3. Find error summary
    error_summary = None
    if log_tail:
        for line in log_tail.splitlines():
            line_str = line.strip()
            if any(k in line_str.lower() for k in ["error:", "traceback", "exception:", "failed:", "fatal:"]):
                error_summary = line_str
                break

    return jsonify({
        "script_id": script_id,
        "name": sinfo.get("name", script_id),
        "screenshot_url": screenshot_url,
        "screenshot_time": screenshot_time,
        "log_tail": log_tail or "No log output recorded yet for this script.",
        "error_summary": error_summary
    })

