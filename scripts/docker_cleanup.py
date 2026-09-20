#!/usr/bin/env python3
"""
Universal Docker System Cleanup Utility
=======================================
Safely frees disk storage by pruning stopped containers, dangling/unused images,
orphaned networks, and unused build cache.

Supports dry-run capacity inspection, volume cleanup toggles, and JSON metrics reporting.
"""

import sys
import json
import shutil
import logging
import argparse
import subprocess
from datetime import datetime

VERSION = "1.1.0"

def parse_args():
    parser = argparse.ArgumentParser(
        description="Safely reclaims disk storage by pruning unused Docker resources."
    )
    parser.add_argument("--all", "-a", action="store_true",
                        help="Remove all unused images, not just dangling ones")
    parser.add_argument("--volumes", action="store_true",
                        help="Prune unused volumes (CAUTION: removes anonymous volumes not attached to any container)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Inspect reclaimable Docker storage without removing resources")
    parser.add_argument("--json", action="store_true",
                        help="Output storage metrics in JSON format")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable verbose output")
    return parser.parse_args()

def check_docker_available():
    """Verifies that docker binary exists and the daemon is reachable."""
    if not shutil.which("docker"):
        logging.error("Docker executable not found in PATH.")
        return False
    try:
        res = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=5)
        if res.returncode != 0:
            logging.error("Docker daemon is not running or current user lacks permissions:\n%s", res.stderr.strip())
            return False
        return True
    except subprocess.TimeoutExpired:
        logging.error("Timeout communicating with Docker daemon.")
        return False
    except Exception as e:
        logging.error("Error communicating with Docker: %s", e)
        return False

def get_docker_df():
    """Queries docker system df for storage utilization."""
    try:
        res = subprocess.run(["docker", "system", "df", "--format", "{{json .}}"],
                             capture_output=True, text=True, timeout=10)
        if res.returncode == 0:
            items = []
            for line in res.stdout.strip().splitlines():
                if line.strip():
                    try:
                        items.append(json.loads(line))
                    except Exception:
                        pass
            return items
    except Exception:
        pass
    return []

def main():
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    if not check_docker_available():
        sys.exit(1)

    if args.dry_run or args.json:
        df_data = get_docker_df()
        if args.json:
            print(json.dumps({"timestamp": datetime.now().isoformat(), "storage": df_data}, indent=2))
            return
        logging.info("[DRY RUN] Current Docker Storage Utilization:")
        for item in df_data:
            logging.info("  %-15s Total: %-8s Active: %-8s Size: %-10s Reclaimable: %s",
                         item.get("Type", "Unknown"),
                         item.get("TotalCount", "0"),
                         item.get("Active", "0"),
                         item.get("Size", "0B"),
                         item.get("Reclaimable", "0B"))
        logging.info("Run without --dry-run to execute pruning.")
        return

    logging.info("Initiating Docker System Cleanup...")
    cmd = ["docker", "system", "prune", "-f"]
    if args.all:
        cmd.append("-a")
    if args.volumes:
        cmd.append("--volumes")

    logging.info("Executing: %s", " ".join(cmd))
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if res.returncode == 0:
            output_lines = res.stdout.strip().splitlines()
            for line in output_lines:
                if "Total reclaimed space:" in line or "deleted" in line.lower():
                    logging.info(line.strip())
            logging.info("Docker maintenance completed successfully.")
        else:
            logging.error("Docker prune failed:\n%s", res.stderr.strip())
            sys.exit(res.returncode)
    except subprocess.TimeoutExpired:
        logging.error("Docker prune timed out.")
        sys.exit(1)
    except Exception as e:
        logging.error("Exception during Docker prune: %s", e)
        sys.exit(1)

if __name__ == "__main__":
    main()
