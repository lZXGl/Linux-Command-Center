import os
import subprocess
import re
from datetime import datetime
from config import APP_DIR, BASE_DIR

ALL_DAYS = [
    {'val': '0', 'label': 'Sun'},
    {'val': '1', 'label': 'Mon'},
    {'val': '2', 'label': 'Tue'},
    {'val': '3', 'label': 'Wed'},
    {'val': '4', 'label': 'Thu'},
    {'val': '5', 'label': 'Fri'},
    {'val': '6', 'label': 'Sat'}
]

def get_current_crontab():
    try:
        res = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        return res.stdout if res.returncode == 0 else ""
    except Exception:
        return ""

def format_cron_time(minute, hour):
    try:
        dt = datetime.strptime(f"{int(hour):02d}:{int(minute):02d}", "%H:%M")
        return dt.strftime("%I:%M %p")
    except Exception:
        return f"{hour}:{minute}"

def parse_cron_status(crontab_content, script_info):
    pattern = script_info.get("cron_pattern")
    if not pattern:
        return {"enabled": False, "schedules": [], "schedule_str": "No schedule configured"}

    lines = crontab_content.splitlines()
    schedules = []
    has_active_cron = False
    is_everyday_wildcard = False

    for line in lines:
        line_clean = line.strip()
        if not line_clean or line_clean.startswith("#"):
            continue
        
        if re.search(pattern, line_clean):
            parts = line_clean.split()
            if len(parts) >= 5:
                minute, hour, dom, month, dow = parts[0], parts[1], parts[2], parts[3], parts[4]
                has_active_cron = True
                
                # Check wildcard
                if dow == "*":
                    is_everyday_wildcard = True
                    for d in range(7):
                        schedules.append({
                            "dow": str(d),
                            "hour": f"{int(hour):02d}",
                            "minute": f"{int(minute):02d}"
                        })
                elif "-" in dow:
                    try:
                        start, end = map(int, dow.split("-"))
                        for d in range(start, end + 1):
                            schedules.append({
                                "dow": str(d),
                                "hour": f"{int(hour):02d}",
                                "minute": f"{int(minute):02d}"
                            })
                    except Exception:
                        schedules.append({"dow": dow, "hour": f"{int(hour):02d}", "minute": f"{int(minute):02d}"})
                elif "," in dow:
                    for d in dow.split(","):
                        schedules.append({
                            "dow": d.strip(),
                            "hour": f"{int(hour):02d}",
                            "minute": f"{int(minute):02d}"
                        })
                else:
                    schedules.append({
                        "dow": dow.strip(),
                        "hour": f"{int(hour):02d}",
                        "minute": f"{int(minute):02d}"
                    })

    if not schedules:
        return {
            "enabled": False,
            "schedules": [],
            "schedule_str": "Disabled (Click 'Edit Schedule')"
        }

    # Deduplicate schedules
    seen = set()
    dedup_schedules = []
    for s in schedules:
        key = (str(s["dow"]), str(s["hour"]), str(s["minute"]))
        if key not in seen:
            seen.add(key)
            dedup_schedules.append(s)
    schedules = dedup_schedules

    unique_dows = set(str(s["dow"]) for s in schedules)
    times_set = set((s["hour"], s["minute"]) for s in schedules)

    # Human readable schedule string
    if (len(unique_dows) >= 7 or is_everyday_wildcard) and len(times_set) == 1:
        sample = schedules[0]
        t_name = format_cron_time(sample["minute"], sample["hour"])
        schedule_str = f"Everyday at {t_name}"
    elif unique_dows == {"0", "1", "2", "3", "4"} and len(times_set) == 1:
        sample = schedules[0]
        t_name = format_cron_time(sample["minute"], sample["hour"])
        schedule_str = f"Sun-Thu at {t_name}"
    else:
        day_map = {'0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat'}
        formatted_items = []
        for s in schedules:
            d_val = str(s["dow"])
            d_name = day_map.get(d_val, f"Day {d_val}")
            t_name = format_cron_time(s["minute"], s["hour"])
            formatted_items.append(f"{d_name} {t_name}")
        schedule_str = ", ".join(formatted_items)

    return {
        "enabled": has_active_cron,
        "schedules": schedules,
        "schedule_str": schedule_str
    }

def update_script_crontab(script_id, script_info, schedules, enabled):
    pattern = script_info.get("cron_pattern")
    current_cron = get_current_crontab()
    
    # Remove existing lines matching pattern
    new_lines = []
    for line in current_cron.splitlines():
        if not re.search(pattern, line):
            new_lines.append(line)

    if enabled and schedules:
        # Build new cron lines
        # Group by time if possible
        by_time = {}
        for s in schedules:
            h = f"{int(s['hour']):02d}"
            m = f"{int(s['minute']):02d}"
            key = (h, m)
            by_time.setdefault(key, []).append(str(s["dow"]))

        runner_script = os.path.join(APP_DIR, "cron_runner.py")
        py_bin = "/usr/bin/python3"

        for (h, m), dows in by_time.items():
            if len(dows) >= 7:
                dow_str = "*"
            else:
                dow_str = ",".join(sorted(list(set(dows)), key=lambda x: int(x) if x.isdigit() else 99))
            new_line = f"{int(m):02d} {int(h):02d} * * {dow_str} {py_bin} {runner_script} {script_id}"
            new_lines.append(new_line)

    final_cron = "\n".join(new_lines).strip() + "\n"
    res = subprocess.run(["crontab", "-"], input=final_cron, text=True, capture_output=True)
    if res.returncode != 0:
        return False, res.stderr
    return True, "Crontab updated successfully"
