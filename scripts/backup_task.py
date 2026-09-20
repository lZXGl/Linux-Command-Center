#!/usr/bin/env python3
"""
Universal Automated Backup Utility
==================================
Creates compressed, timestamped snapshot archives of specified directories,
verifies archive integrity, and automatically enforces retention policies to
prune older backups.

Zero external dependencies (uses standard library tarfile and shutil).
"""

import os
import sys
import time
import shutil
import tarfile
import argparse
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

VERSION = "1.1.0"

def parse_args():
    parser = argparse.ArgumentParser(
        description="Automated snapshot backup tool with compression and retention management."
    )
    parser.add_argument("--source", "-s", nargs="+", default=["."],
                        help="One or more directories or files to include in backup (default: current dir)")
    parser.add_argument("--destination", "-d", default="./backups",
                        help="Directory where backup archives will be stored (default: ./backups)")
    parser.add_argument("--retention-days", "-r", type=int, default=7,
                        help="Number of days to keep backups before pruning (default: 7 days, 0 = keep forever)")
    parser.add_argument("--keep-count", "-k", type=int, default=10,
                        help="Maximum number of backup archives to keep (default: 10, 0 = unlimited)")
    parser.add_argument("--compression", "-c", choices=["gz", "bz2", "none"], default="gz",
                        help="Compression format (default: gz)")
    parser.add_argument("--exclude", "-e", nargs="*", default=["*.pyc", "__pycache__", "node_modules", ".git", ".venv", "venv", "*.tmp"],
                        help="Patterns to exclude from archive")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simulate backup and cleanup without writing or deleting files")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable verbose output")
    return parser.parse_args()

def should_exclude(tarinfo, exclude_patterns: List[str]):
    for pat in exclude_patterns:
        if pat.startswith("*"):
            if tarinfo.name.endswith(pat[1:]):
                return None
        elif pat in tarinfo.name.split("/"):
            return None
    return tarinfo

def prune_old_backups(dest_dir: Path, retention_days: int, keep_count: int, dry_run: bool):
    """Enforces retention policy based on age and total count."""
    archives = sorted(
        [f for f in dest_dir.glob("backup_*.tar*") if f.is_file()],
        key=lambda x: x.stat().st_mtime,
        reverse=True
    )
    if not archives:
        return

    now = datetime.now()
    retained = []

    for idx, archive in enumerate(archives):
        mtime = datetime.fromtimestamp(archive.stat().st_mtime)
        age_days = (now - mtime).days

        # Retention by count
        count_exceeded = (keep_count > 0 and idx >= keep_count)
        # Retention by age
        age_exceeded = (retention_days > 0 and age_days > retention_days)

        if count_exceeded or age_exceeded:
            reason = f"older than {retention_days} days" if age_exceeded else f"exceeds keep count ({keep_count})"
            if dry_run:
                logging.info("[DRY RUN] Would prune %s (%s)", archive.name, reason)
            else:
                try:
                    archive.unlink()
                    logging.info("Pruned old backup: %s (%s)", archive.name, reason)
                except Exception as e:
                    logging.error("Failed to prune %s: %s", archive.name, e)
        else:
            retained.append(archive)

    logging.info("Retention enforcement complete: %d active archives remaining.", len(retained))

def main():
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    logging.info(f"Starting Backup Utility v{VERSION}...")
    dest_path = Path(args.destination).resolve()

    if not args.dry_run:
        dest_path.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = f".tar.{args.compression}" if args.compression != "none" else ".tar"
    mode = f"w:{args.compression}" if args.compression != "none" else "w"
    archive_name = f"backup_{timestamp}{ext}"
    archive_path = dest_path / archive_name

    logging.info("Target archive: %s", archive_path)
    logging.info("Sources to back up: %s", ", ".join(args.source))

    if args.dry_run:
        logging.info("[DRY RUN] Simulation mode active. Skipping archive creation.")
    else:
        start_time = time.time()
        try:
            with tarfile.open(archive_path, mode) as tar:
                for src in args.source:
                    src_path = Path(src).resolve()
                    if not src_path.exists():
                        logging.warning("Source path does not exist: %s (skipping)", src_path)
                        continue
                    logging.info("Archiving: %s", src_path.name)
                    tar.add(src_path, arcname=src_path.name, filter=lambda t: should_exclude(t, args.exclude))

            duration = time.time() - start_time
            size_mb = archive_path.stat().st_size / (1024 * 1024)
            logging.info("Archive created successfully! Size: %.2f MB (elapsed: %.2fs)", size_mb, duration)
        except Exception as e:
            logging.error("Backup failed: %s", e)
            if archive_path.exists():
                archive_path.unlink(missing_ok=True)
            sys.exit(1)

    # Prune according to retention policy
    if dest_path.exists():
        prune_old_backups(dest_path, args.retention_days, args.keep_count, args.dry_run)

    logging.info("Backup task finished successfully.")

if __name__ == "__main__":
    main()
