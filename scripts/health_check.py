#!/usr/bin/env python3
"""
Universal Linux System Health Check Utility
===========================================
Monitors CPU load, RAM usage, storage volume capacity, CPU temperature, and uptime.
Includes configurable threshold warnings and machine-readable JSON output.

Zero external dependencies (pure Python 3 standard library).
"""

import os
import sys
import json
import shutil
import logging
import argparse
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

VERSION = "1.2.0"

def parse_args():
    parser = argparse.ArgumentParser(
        description="Inspects system resource metrics and warns when thresholds are exceeded."
    )
    parser.add_argument("--warn-disk", type=float, default=85.0,
                        help="Disk usage percent threshold for warning (default: 85.0)")
    parser.add_argument("--warn-ram", type=float, default=90.0,
                        help="RAM usage percent threshold for warning (default: 90.0)")
    parser.add_argument("--warn-cpu", type=float, default=None,
                        help="CPU 1-min load average warning threshold (default: 2.0 * CPU cores)")
    parser.add_argument("--paths", nargs="+", default=["/"],
                        help="Disk paths to monitor (default: /)")
    parser.add_argument("--json", action="store_true",
                        help="Output health metrics as JSON")
    parser.add_argument("--quiet", "-q", action="store_true",
                        help="Only print warnings/critical errors")
    return parser.parse_args()

def get_ram_info() -> Dict[str, Any]:
    """Reads /proc/meminfo for memory usage."""
    mem = {}
    try:
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().split()[0]
                    if val.isdigit():
                        mem[key] = int(val) * 1024  # convert kB to Bytes

        total = mem.get("MemTotal", 0)
        available = mem.get("MemAvailable", mem.get("MemFree", 0) + mem.get("Buffers", 0) + mem.get("Cached", 0))
        used = total - available
        percent = (used / total * 100) if total > 0 else 0.0
        return {
            "total_gb": round(total / (1024**3), 2),
            "used_gb": round(used / (1024**3), 2),
            "free_gb": round(available / (1024**3), 2),
            "percent_used": round(percent, 1)
        }
    except Exception:
        return {"error": "Could not read /proc/meminfo"}

def get_uptime_str() -> str:
    """Reads /proc/uptime."""
    try:
        with open("/proc/uptime", "r") as f:
            secs = float(f.readline().split()[0])
            return str(timedelta(seconds=int(secs)))
    except Exception:
        return "Unknown"

def get_cpu_temp() -> Optional[float]:
    """Reads CPU temperature from /sys/class/thermal or hwmon."""
    try:
        thermal_zones = os.listdir("/sys/class/thermal")
        for zone in thermal_zones:
            if zone.startswith("thermal_zone"):
                temp_path = f"/sys/class/thermal/{zone}/temp"
                type_path = f"/sys/class/thermal/{zone}/type"
                if os.path.exists(temp_path):
                    with open(temp_path, "r") as f:
                        val = float(f.read().strip())
                        if val > 1000:
                            val /= 1000.0  # millidegrees to celsius
                        return round(val, 1)
    except Exception:
        pass
    return None

def main():
    args = parse_args()
    cpu_cores = os.cpu_count() or 1
    cpu_warn_thresh = args.warn_cpu if args.warn_cpu is not None else float(cpu_cores * 2.0)

    # Gather metrics
    # Load averages
    load1, load5, load15 = (0.0, 0.0, 0.0)
    try:
        load1, load5, load15 = os.getloadavg()
    except Exception:
        pass

    ram_info = get_ram_info()
    cpu_temp = get_cpu_temp()
    uptime = get_uptime_str()

    disks = []
    warnings = []

    for path in args.paths:
        try:
            total, used, free = shutil.disk_usage(path)
            pct = (used / total * 100) if total > 0 else 0
            disks.append({
                "path": path,
                "total_gb": round(total / (1024**3), 1),
                "used_gb": round(used / (1024**3), 1),
                "free_gb": round(free / (1024**3), 1),
                "percent_used": round(pct, 1)
            })
            if pct >= 95.0:
                warnings.append(f"CRITICAL: Disk '{path}' is {pct:.1f}% full!")
            elif pct >= args.warn_disk:
                warnings.append(f"WARNING: Disk '{path}' exceeds warning threshold ({pct:.1f}% >= {args.warn_disk}%)")
        except Exception as e:
            warnings.append(f"ERROR: Could not inspect path '{path}': {e}")

    # RAM Check
    ram_pct = ram_info.get("percent_used", 0)
    if ram_pct >= 95.0:
        warnings.append(f"CRITICAL: RAM usage is {ram_pct:.1f}%!")
    elif ram_pct >= args.warn_ram:
        warnings.append(f"WARNING: RAM usage exceeds warning threshold ({ram_pct:.1f}% >= {args.warn_ram}%)")

    # CPU Load Check
    if load1 >= cpu_warn_thresh * 1.5:
        warnings.append(f"CRITICAL: 1-min CPU load average is {load1:.2f} (cores: {cpu_cores})")
    elif load1 >= cpu_warn_thresh:
        warnings.append(f"WARNING: 1-min CPU load average is {load1:.2f} (threshold: {cpu_warn_thresh})")

    status = "OK" if not warnings else ("CRITICAL" if any("CRITICAL" in w for w in warnings) else "WARNING")

    data = {
        "timestamp": datetime.now().isoformat(),
        "status": status,
        "uptime": uptime,
        "cpu": {
            "cores": cpu_cores,
            "load_1m": round(load1, 2),
            "load_5m": round(load5, 2),
            "load_15m": round(load15, 2),
            "temperature_c": cpu_temp
        },
        "ram": ram_info,
        "storage": disks,
        "alerts": warnings
    }

    if args.json:
        print(json.dumps(data, indent=2))
    else:
        if not args.quiet:
            print("==================================================")
            print(f"System Health Status: [{status}] - Uptime: {uptime}")
            print("==================================================")
            print(f"CPU Load (1m, 5m, 15m): {load1:.2f}, {load5:.2f}, {load15:.2f} ({cpu_cores} Cores)")
            if cpu_temp:
                print(f"CPU Temperature:        {cpu_temp} °C")
            print(f"RAM Usage:              {ram_info.get('used_gb', 0)} GB / {ram_info.get('total_gb', 0)} GB ({ram_pct}%)")
            for d in disks:
                print(f"Storage [{d['path']}]:          {d['used_gb']} GB / {d['total_gb']} GB ({d['percent_used']}% used, {d['free_gb']} GB free)")
            print("==================================================")

        if warnings:
            print("\nActive Alerts:")
            for w in warnings:
                print(f"  • {w}")

    # Exit codes
    if status == "CRITICAL":
        sys.exit(2)
    elif status == "WARNING":
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
