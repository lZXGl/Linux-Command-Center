import os
import json
import uuid
import subprocess
import threading
from datetime import datetime
from config import APP_DIR, BASE_DIR
from services.process_manager import add_history, send_alert

PIPELINES_CONFIG_FILE = os.path.join(APP_DIR, "pipelines_config.json")
PIPELINE_HISTORY_FILE = os.path.join(APP_DIR, "pipeline_execution_history.json")

DEFAULT_PIPELINES = [
    {
        "id": "p_health_alert_flow",
        "name": "System Health Monitor & Alert Flow",
        "desc": "Trigger an alert and broadcast notification whenever system health check completes.",
        "enabled": True,
        "webhook_token": "hook_health_notify_01",
        "trigger": {
            "type": "script_success",
            "source": "health_check.py"
        },
        "actions": [
            {
                "type": "send_alert",
                "title": "System Health Verified",
                "message": "Routine health check executed successfully. All vital telemetry within normal limits."
            }
        ]
    },
    {
        "id": "p_disk_cleanup_flow",
        "name": "Low Storage Auto Docker Prune",
        "desc": "Trigger docker cleanup when invoked by webhook or system monitoring alert.",
        "enabled": True,
        "webhook_token": "hook_disk_cleanup_02",
        "trigger": {
            "type": "webhook",
            "source": "disk_alert"
        },
        "actions": [
            {
                "type": "run_script",
                "target": "docker_prune"
            },
            {
                "type": "send_alert",
                "title": "Automated Docker Cleanup",
                "message": "Disk capacity threshold triggered automated docker cleanup."
            }
        ]
    },
    {
        "id": "p_backup_verify_flow",
        "name": "Daily Backup Verification Flow",
        "desc": "Send a confirmation alert and record history when backup task finishes successfully.",
        "enabled": True,
        "webhook_token": "hook_backup_verify_03",
        "trigger": {
            "type": "script_success",
            "source": "backup_task.py"
        },
        "actions": [
            {
                "type": "send_alert",
                "title": "Backup Completed",
                "message": "Daily homelab configuration and database backup completed successfully."
            }
        ]
    }
]

def load_pipelines():
    if os.path.exists(PIPELINES_CONFIG_FILE):
        try:
            with open(PIPELINES_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    save_pipelines(DEFAULT_PIPELINES)
    return list(DEFAULT_PIPELINES)

def save_pipelines(pipelines):
    try:
        with open(PIPELINES_CONFIG_FILE, 'w') as f:
            json.dump(pipelines, f, indent=2)
        return True
    except Exception:
        return False

def load_pipeline_history():
    if os.path.exists(PIPELINE_HISTORY_FILE):
        try:
            with open(PIPELINE_HISTORY_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def log_pipeline_run(pipeline_id, pipeline_name, trigger_type, status, details=""):
    history = load_pipeline_history()
    entry = {
        "id": str(uuid.uuid4())[:8],
        "pipeline_id": pipeline_id,
        "name": pipeline_name,
        "trigger": trigger_type,
        "status": status,
        "details": details,
        "timestamp": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    }
    history.insert(0, entry)
    history = history[:50]
    try:
        with open(PIPELINE_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
    except Exception:
        pass
    return entry

def execute_pipeline(pipeline, context=None):
    if not pipeline.get("enabled", True):
        return False, "Pipeline is disabled"

    pipeline_id = pipeline.get("id")
    pipeline_name = pipeline.get("name", "Unnamed Pipeline")
    actions = pipeline.get("actions", [])
    
    def _runner():
        log_pipeline_run(pipeline_id, pipeline_name, pipeline.get("trigger", {}).get("type", "manual"), "Running", "Pipeline execution started")
        results = []
        overall_success = True

        for action in actions:
            act_type = action.get("type")
            target = action.get("target")

            if act_type == "run_script":
                try:
                    # Import dynamically to avoid circular import
                    from routes.scripts import run_script_now
                    # Execute runner
                    res = subprocess.run(["python3", os.path.join(APP_DIR, "cron_runner.py"), target], capture_output=True, text=True, timeout=180)
                    if res.returncode == 0:
                        results.append(f"Script '{target}' executed successfully")
                    else:
                        overall_success = False
                        results.append(f"Script '{target}' failed: {res.stderr[:100]}")
                except Exception as e:
                    overall_success = False
                    results.append(f"Script '{target}' error: {str(e)}")

            elif act_type == "send_alert":
                title = action.get("title", f"Pipeline Alert: {pipeline_name}")
                msg = action.get("message", "Pipeline triggered an alert.")
                send_alert("Pipeline Engine", title, msg)
                results.append(f"Sent alert: {title}")

            elif act_type == "docker_action":
                container = action.get("container", target)
                cmd_act = action.get("action", "restart")
                try:
                    subprocess.run(["docker", cmd_act, container], capture_output=True, text=True, timeout=30)
                    results.append(f"Docker {cmd_act} on {container} succeeded")
                except Exception as e:
                    results.append(f"Docker error: {str(e)}")

            elif act_type == "systemd_action":
                unit = action.get("unit", target)
                cmd_act = action.get("action", "restart")
                try:
                    subprocess.run(["sudo", "-n", "systemctl", cmd_act, unit], capture_output=True, text=True, timeout=30)
                    results.append(f"Systemd {cmd_act} on {unit} succeeded")
                except Exception as e:
                    results.append(f"Systemd error: {str(e)}")

            elif act_type == "custom_bash":
                bash_cmd = action.get("command", "")
                if bash_cmd:
                    try:
                        subprocess.run(bash_cmd, shell=True, capture_output=True, text=True, timeout=60)
                        results.append(f"Bash command executed: {bash_cmd[:40]}")
                    except Exception as e:
                        results.append(f"Bash error: {str(e)}")

        status = "Completed" if overall_success else "Failed"
        summary = " | ".join(results)
        log_pipeline_run(pipeline_id, pipeline_name, pipeline.get("trigger", {}).get("type", "manual"), status, summary)
        add_history(f"Pipeline: {pipeline_name}", f"pipeline_{pipeline_id}", "Pipeline Engine", status)

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    return True, f"Pipeline '{pipeline_name}' started asynchronously."

def trigger_event(event_type, source_name, context=None):
    """
    Trigger all matching pipelines when an event occurs (e.g. script_success, webhook).
    """
    pipelines = load_pipelines()
    triggered_count = 0
    for p in pipelines:
        if not p.get("enabled", True):
            continue
        trig = p.get("trigger", {})
        if trig.get("type") == event_type:
            src = trig.get("source", "")
            if not src or src.lower() in source_name.lower() or source_name.lower() in src.lower():
                execute_pipeline(p, context)
                triggered_count += 1
    return triggered_count

def trigger_webhook(webhook_token, payload=None):
    pipelines = load_pipelines()
    for p in pipelines:
        if p.get("webhook_token") == webhook_token:
            return execute_pipeline(p, context=payload)
    return False, "Webhook token not found"
