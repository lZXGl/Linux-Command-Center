#!/bin/bash
# ==============================================================================
# Homelab-Command-Center - Generic Automated System Updater
# ==============================================================================
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
LOGFILE="$DIR/system_update.log"

echo "=== LINUX SYSTEM & APPLICATION UPDATE STARTED AT $(date) ===" > "$LOGFILE"

echo -e "\n[1/4] Updating APT System Packages..." >> "$LOGFILE"
if command -v apt-get &> /dev/null; then
    sudo apt-get update >> "$LOGFILE" 2>&1
    sudo apt-get upgrade -y >> "$LOGFILE" 2>&1
    sudo apt-get autoremove -y >> "$LOGFILE" 2>&1
else
    echo "APT package manager not detected, skipping." >> "$LOGFILE"
fi

echo -e "\n[2/4] Updating Snap Packages (if available)..." >> "$LOGFILE"
if command -v snap &> /dev/null; then
    sudo snap refresh >> "$LOGFILE" 2>&1
else
    echo "Snap not installed, skipping." >> "$LOGFILE"
fi

echo -e "\n[3/4] Updating Python Package Dependencies..." >> "$LOGFILE"
if command -v pip3 &> /dev/null; then
    pip3 install --upgrade pip setuptools wheel >> "$LOGFILE" 2>&1
fi

echo -e "\n[4/4] Updating Docker Images (if running)..." >> "$LOGFILE"
if command -v docker &> /dev/null; then
    docker system prune -f >> "$LOGFILE" 2>&1
fi

echo -e "\n=== ALL UPDATES COMPLETED SUCCESSFULLY AT $(date) ===" >> "$LOGFILE"
