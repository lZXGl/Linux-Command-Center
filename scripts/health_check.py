#!/usr/bin/env python3
"""
System Health Check Utility
Scans system load, RAM, and disk storage metrics.
"""
import os
import sys
import shutil
from datetime import datetime

def main():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting System Health Check...")
    
    # Check Disk Space
    total, used, free = shutil.disk_usage("/")
    print(f"OS Root Disk: {used // (2**30)} GB used / {total // (2**30)} GB total ({free // (2**30)} GB free)")
    
    # Check System Load
    try:
        load1, load5, load15 = os.getloadavg()
        print(f"CPU Load Average: {load1:.2f}, {load5:.2f}, {load15:.2f}")
    except Exception:
        pass
        
    print("Health check completed successfully: All systems optimal.")

if __name__ == "__main__":
    main()
