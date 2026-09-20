import os
import glob
import subprocess
from datetime import datetime
from config import BACKUPS_DIR, APP_DIR, BASE_DIR
from services.process_manager import add_history, send_alert

def create_full_backup():
    os.makedirs(BACKUPS_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"command_center_backup_{timestamp}.tar.gz"
    backup_filepath = os.path.join(BACKUPS_DIR, backup_filename)

    app_parent = os.path.dirname(APP_DIR)
    app_folder = os.path.basename(APP_DIR)

    cmd = [
        "tar", "-czf", backup_filepath,
        "-C", app_parent,
        app_folder
    ]
    if os.path.exists(BASE_DIR) and not BASE_DIR.startswith(APP_DIR):
        base_parent = os.path.dirname(BASE_DIR)
        base_folder = os.path.basename(BASE_DIR)
        cmd.extend(["-C", base_parent, base_folder])
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if res.returncode == 0 and os.path.exists(backup_filepath):
            size_mb = os.path.getsize(backup_filepath) / (1024 * 1024)
            add_history("Full System & App Backup", "system_backup", "Dashboard Settings", f"Success ({size_mb:.2f} MB)")
            send_alert("Backup Created", "Full Config & Script Backup Created", f"Successfully created archive `{backup_filename}` ({size_mb:.2f} MB) in `{BACKUPS_DIR}`.")
            return True, {
                "filename": backup_filename,
                "path": backup_filepath,
                "size": f"{size_mb:.2f} MB",
                "timestamp": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
            }
        return False, res.stderr or "Backup command failed"
    except Exception as e:
        return False, str(e)

def list_available_backups():
    if not os.path.exists(BACKUPS_DIR):
        return []
    
    files = glob.glob(os.path.join(BACKUPS_DIR, "*.tar.gz"))
    files.sort(key=os.path.getmtime, reverse=True)
    
    backups = []
    for f in files:
        fname = os.path.basename(f)
        mtime = datetime.fromtimestamp(os.path.getmtime(f)).strftime("%Y-%m-%d %I:%M:%S %p")
        size_bytes = os.path.getsize(f)
        if size_bytes >= 1048576:
            size_str = f"{size_bytes / 1048576:.2f} MB"
        else:
            size_str = f"{size_bytes / 1024:.1f} KB"
            
        backups.append({
            "filename": fname,
            "path": f,
            "modified": mtime,
            "size": size_str,
            "is_full": "full" in fname or "all_in_one" in fname or "command_center" in fname
        })
    return backups

def restore_backup_archive(filename):
    if not filename or ".." in filename or "/" in filename:
        return False, "Invalid backup filename"
        
    target_archive = os.path.join(BACKUPS_DIR, filename)
    if not os.path.exists(target_archive):
        return False, f"Backup file {filename} not found in backup storage"

    app_parent = os.path.dirname(APP_DIR)
    app_folder = os.path.basename(APP_DIR)

    # 1. Create a pre-restore safety snapshot first
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safety_archive = os.path.join(BACKUPS_DIR, f"pre_restore_safety_{timestamp}.tar.gz")
    try:
        subprocess.run(["tar", "-czf", safety_archive, "-C", app_parent, app_folder], capture_output=True)
    except Exception:
        pass

    # 2. Extract archive to parent directory
    try:
        res = subprocess.run(["tar", "-xzf", target_archive, "-C", app_parent], capture_output=True, text=True, timeout=60)
        if res.returncode == 0:
            add_history("Revert to Backup Archive", "system_restore", "Dashboard Settings", f"Restored {filename}")
            send_alert("Backup Restored", "System Reverted to Backup Archive", f"Dashboard and scripts reverted to backup archive `{filename}`.")
            return True, f"Successfully restored archive '{filename}'. Dashboard files reverted."
        return False, res.stderr or "Extraction failed"
    except Exception as e:
        return False, str(e)
