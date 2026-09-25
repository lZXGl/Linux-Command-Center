#!/usr/bin/env python3
"""
Cron Runner Wrapper for Homelab-Command-Center.
Executes scheduled cron jobs, records the run into execution_history.json as 'Scheduled Cron',
and sends alert notifications if configured.
"""
import os
import sys
import json
import time
import subprocess
from datetime import datetime
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
HISTORY_FILE = os.path.join(APP_DIR, "execution_history.json")
ALERTS_CONFIG_FILE = os.path.join(APP_DIR, "alerts_config.json")
SCRIPTS_DIR = os.path.join(APP_DIR, "scripts")

def get_scripts_map():
    scripts_map = {
        "system_health": {
            "name": "System Health Check",
            "cmd": ["python3", os.path.join(SCRIPTS_DIR, "health_check.py")],
            "cwd": SCRIPTS_DIR,
            "log": os.path.join(APP_DIR, "logs/system_health.log")
        },
        "docker_prune": {
            "name": "Docker System Cleanup",
            "cmd": ["python3", os.path.join(SCRIPTS_DIR, "docker_cleanup.py")],
            "cwd": SCRIPTS_DIR,
            "log": os.path.join(APP_DIR, "logs/docker_prune.log")
        },
        "backup_daily": {
            "name": "Daily Homelab Backup",
            "cmd": ["python3", os.path.join(SCRIPTS_DIR, "backup_task.py")],
            "cwd": SCRIPTS_DIR,
            "log": os.path.join(APP_DIR, "logs/backup_daily.log")
        }
    }
    
    custom_file = os.path.join(APP_DIR, "custom_scripts.json")
    if os.path.exists(custom_file):
        try:
            with open(custom_file, 'r') as f:
                custom = json.load(f)
            for sid, c in custom.items():
                c_path = c.get("path") or (os.path.join(c.get("dir", SCRIPTS_DIR), c.get("script")) if not os.path.isabs(c.get("script", "")) else c.get("script"))
                c_interp = (c.get("interpreter") or "").lower()
                if not c_interp:
                    if c_path.endswith(('.sh', '.bash')):
                        c_interp = "bash"
                    elif c_path.endswith('.py'):
                        c_interp = "python3"
                    elif os.access(c_path, os.X_OK):
                        c_interp = "executable"
                    else:
                        c_interp = "python3"

                if c_interp == "bash":
                    cmd = ["/bin/bash", c_path]
                elif c_interp == "sh":
                    cmd = ["/bin/sh", c_path]
                elif c_interp == "executable":
                    cmd = [c_path]
                else:
                    cmd = [c.get("python", "python3"), c_path]

                run_cwd = c.get("dir", SCRIPTS_DIR)
                if not os.path.exists(run_cwd):
                    run_cwd = os.path.dirname(c_path) if os.path.exists(os.path.dirname(c_path)) else str(APP_DIR)

                scripts_map[sid] = {
                    "name": c.get("name", sid),
                    "cmd": cmd,
                    "cwd": run_cwd,
                    "log": os.path.join(APP_DIR, f"logs/{sid}.log")
                }
        except Exception:
            pass
    return scripts_map

def record_execution(script_id, script_name, status="Success", duration_s=0.0):
    try:
        history = []
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r') as f:
                history = json.load(f)
        
        new_entry = {
            "id": script_id,
            "name": script_name,
            "timestamp": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p"),
            "trigger": "Scheduled Cron",
            "status": f"{status} ({duration_s:.1f}s)" if duration_s > 0 else status
        }
        history.insert(0, new_entry)
        history = history[:150]
        
        with open(HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        sys.stderr.write(f"Error recording execution: {e}\n")

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: cron_runner.py <script_id>\n")
        sys.exit(1)

    script_id = sys.argv[1]
    scripts_map = get_scripts_map()

    if script_id not in scripts_map:
        sys.stderr.write(f"Unknown script ID: {script_id}\n")
        sys.exit(1)

    target = scripts_map[script_id]
    log_file = target.get("log")
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        log_fp = open(log_file, "w")
    else:
        log_fp = subprocess.DEVNULL

    env = os.environ.copy()
    if "env" in target:
        env.update(target["env"])

    start_t = time.time()
    try:
        res = subprocess.run(
            target["cmd"],
            cwd=target["cwd"],
            stdout=log_fp,
            stderr=subprocess.STDOUT,
            env=env
        )
        duration = time.time() - start_t
        if res.returncode == 0:
            record_execution(script_id, target["name"], "Completed (Success)", duration)
        else:
            record_execution(script_id, target["name"], f"Failed (Exit {res.returncode})", duration)
    except Exception as e:
        duration = time.time() - start_t
        record_execution(script_id, target["name"], f"Error: {e}", duration)
    finally:
        if log_file and log_fp != subprocess.DEVNULL:
            log_fp.close()

if __name__ == "__main__":
    main()
