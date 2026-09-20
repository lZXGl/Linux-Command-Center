#!/usr/bin/env python3
"""
Docker System Cleanup Utility
Safely removes stopped containers and dangling images.
"""
import subprocess
from datetime import datetime

def main():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Starting Docker System Cleanup...")
    try:
        res = subprocess.run(["docker", "system", "prune", "-f"], capture_output=True, text=True)
        print(res.stdout)
    except Exception as e:
        print(f"Docker cleanup notice: {e}")
    print("Docker system maintenance completed.")

if __name__ == "__main__":
    main()
