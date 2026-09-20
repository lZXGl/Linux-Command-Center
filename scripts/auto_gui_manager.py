#!/usr/bin/env python3
"""
Universal Auto GUI Manager
==========================
Automatically boots the graphical interface (graphical.target / display-manager)
when a physical monitor or TV is connected/powered on, and returns to multi-user
CLI mode (multi-user.target) when all displays are disconnected/powered off.

Supports:
- AMD, Intel, Nouveau, and generic DRM/KMS GPUs (via active libdrm hardware probing and sysfs)
- NVIDIA GPUs with proprietary drivers (via nvidia-smi / nvidia-settings / sysfs)
- Any Display Manager (GDM, LightDM, SDDM, Ly, greetd, or standard systemd graphical.target)
- Custom start/stop hooks for non-systemd or specialized homelab environments
"""

import os
import sys
import glob
import time
import socket
import select
import signal
import logging
import argparse
import subprocess
import ctypes
from typing import List, Optional

VERSION = "2.0.0"
NETLINK_KOBJECT_UEVENT = 15

# --- Direct Hardware DRM Probing via libdrm ---
_libdrm = None
try:
    _libdrm = ctypes.CDLL('libdrm.so.2')
except Exception as e:
    logging.debug("Could not load libdrm.so.2 (%s), falling back to sysfs and driver queries.", e)

class _drmModeRes(ctypes.Structure):
    _fields_ = [
        ('count_fbs', ctypes.c_int),
        ('fbs', ctypes.c_void_p),
        ('count_crtcs', ctypes.c_int),
        ('crtcs', ctypes.c_void_p),
        ('count_connectors', ctypes.c_int),
        ('connectors', ctypes.POINTER(ctypes.c_uint32)),
        ('count_encoders', ctypes.c_int),
        ('encoders', ctypes.c_void_p),
        ('min_width', ctypes.c_uint32),
        ('max_width', ctypes.c_uint32),
        ('min_height', ctypes.c_uint32),
        ('max_height', ctypes.c_uint32),
    ]

class _drmModeConnector(ctypes.Structure):
    _fields_ = [
        ('connector_id', ctypes.c_uint32),
        ('encoder_id', ctypes.c_uint32),
        ('connector_type', ctypes.c_uint32),
        ('connector_type_id', ctypes.c_uint32),
        ('connection', ctypes.c_uint32),  # 1 = DRM_MODE_CONNECTED, 2 = DISCONNECTED, 3 = UNKNOWN
        ('mmWidth', ctypes.c_uint32),
        ('mmHeight', ctypes.c_uint32),
        ('subpixel', ctypes.c_uint32),
        ('count_modes', ctypes.c_int),
    ]

DRM_CONNECTOR_NAMES = {
    0: 'Unknown', 1: 'VGA', 2: 'DVI-I', 3: 'DVI-D', 4: 'DVI-A',
    5: 'Composite', 6: 'SVIDEO', 7: 'LVDS', 8: 'Component',
    9: '9PinDIN', 10: 'DP', 11: 'HDMI-A', 12: 'HDMI-B',
    13: 'TV', 14: 'eDP', 15: 'VIRTUAL', 16: 'DSI', 17: 'DPI',
    18: 'Writeback', 19: 'SPI', 20: 'USB'
}

running = True

def handle_signal(signum, frame):
    global running
    logging.info("Received signal %d, exiting...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

def probe_drm_hardware() -> List[str]:
    """
    Directly probes GPU hardware connectors using libdrm ioctls (KMS/DRM).
    Forces kernel driver (AMD amdgpu, Intel i915/xe, Nouveau, virtio-gpu) to query
    physical DDC/I2C lines, detecting displays even if no passive interrupt fired.
    """
    if not _libdrm:
        return []

    connected = []
    for card_path in sorted(glob.glob('/dev/dri/card[0-9]*')):
        card_name = os.path.basename(card_path)
        fd = -1
        try:
            fd = os.open(card_path, os.O_RDWR)
            res = _libdrm.drmModeGetResources(fd)
            if not res:
                continue
            res_p = ctypes.cast(res, ctypes.POINTER(_drmModeRes)).contents
            for i in range(res_p.count_connectors):
                conn_id = res_p.connectors[i]
                conn = _libdrm.drmModeGetConnector(fd, conn_id)
                if not conn:
                    continue
                conn_p = ctypes.cast(conn, ctypes.POINTER(_drmModeConnector)).contents
                if conn_p.connection == 1:  # 1 = DRM_MODE_CONNECTED
                    c_type = DRM_CONNECTOR_NAMES.get(conn_p.connector_type, 'Connector')
                    c_type_id = conn_p.connector_type_id
                    connected.append(f"{card_name}-{c_type}-{c_type_id}")
                _libdrm.drmModeFreeConnector(conn)
            _libdrm.drmModeFreeResources(res)
        except Exception as e:
            logging.debug("Error probing DRM hardware on %s: %s", card_path, e)
        finally:
            if fd >= 0:
                try:
                    os.close(fd)
                except Exception:
                    pass

    return connected

def probe_sysfs_drm() -> List[str]:
    """Fallback probe using /sys/class/drm/card*-*/status."""
    connected = []
    for status_path in sorted(glob.glob('/sys/class/drm/card*-*/status')):
        try:
            with open(status_path, 'r') as f:
                if f.read().strip() == 'connected':
                    connector_name = os.path.basename(os.path.dirname(status_path))
                    connected.append(connector_name)
        except Exception as e:
            logging.debug("Error reading %s: %s", status_path, e)
    return connected

def probe_nvidia_displays() -> List[str]:
    """
    Detects connected displays on proprietary NVIDIA drivers where DRM sysfs
    connectors may not be populated without modeset=1.
    """
    connected = []
    # Check if nvidia driver is loaded
    if os.path.exists('/proc/driver/nvidia'):
        try:
            # Query nvidia-smi for active displays
            res = subprocess.run(
                ['nvidia-smi', '--query-gpu=display_active', '--format=csv,noheader'],
                capture_output=True, text=True, timeout=2
            )
            if res.returncode == 0:
                for idx, line in enumerate(res.stdout.strip().splitlines()):
                    if line.strip().lower() in ('1', 'enabled', 'true', 'active'):
                        connected.append(f"nvidia-gpu{idx}-display")
        except Exception as e:
            logging.debug("nvidia-smi probe failed: %s", e)
    return connected

def get_connected_displays() -> List[str]:
    """
    Aggregates all probe methods:
    1. Direct libdrm hardware query (KMS / AMD / Intel / Nouveau)
    2. /sys/class/drm status files
    3. NVIDIA proprietary driver query
    """
    displays = probe_drm_hardware()
    if not displays:
        displays = probe_sysfs_drm()
    if not displays:
        displays = probe_nvidia_displays()
    return list(dict.fromkeys(displays))

def detect_display_manager() -> str:
    """
    Auto-detects active or installed display manager service.
    Returns the unit name or 'graphical.target'.
    """
    candidates = [
        'display-manager.service',
        'gdm.service',
        'gdm3.service',
        'lightdm.service',
        'sddm.service',
        'ly.service',
        'greetd.service',
        'lxdm.service'
    ]
    for unit in candidates:
        try:
            res = subprocess.run(['systemctl', 'is-active', '--quiet', unit], timeout=1)
            if res.returncode == 0:
                return unit
        except Exception:
            pass

    return 'graphical.target'

def is_gui_active(dm_service: Optional[str] = None) -> bool:
    """Checks if graphical target or display manager is currently running."""
    # Check graphical.target
    try:
        res = subprocess.run(['systemctl', 'is-active', '--quiet', 'graphical.target'], timeout=1)
        if res.returncode == 0:
            return True
    except Exception:
        pass

    target_dm = dm_service or detect_display_manager()
    if target_dm and target_dm != 'graphical.target':
        try:
            res = subprocess.run(['systemctl', 'is-active', '--quiet', target_dm], timeout=1)
            if res.returncode == 0:
                return True
        except Exception:
            pass

    return False

def start_gui(dm_service: Optional[str] = None, custom_cmd: Optional[str] = None, dry_run: bool = False):
    logging.info("Starting graphical target (booting GUI)...")
    if dry_run:
        logging.info("[DRY RUN] Would start GUI")
        return

    if custom_cmd:
        try:
            subprocess.run(custom_cmd, shell=True, check=True)
            logging.info("Custom GUI start command succeeded.")
        except subprocess.CalledProcessError as e:
            logging.error("Failed custom GUI start command: %s", e)
        return

    try:
        subprocess.run(['systemctl', 'start', 'graphical.target'], check=True, timeout=10)
        logging.info("GUI successfully started (graphical.target).")
    except Exception as e:
        target_dm = dm_service or detect_display_manager()
        logging.warning("graphical.target start failed (%s), attempting %s...", e, target_dm)
        try:
            subprocess.run(['systemctl', 'start', target_dm], check=True, timeout=10)
            logging.info("GUI started successfully via %s.", target_dm)
        except Exception as e2:
            logging.error("Failed to start GUI via %s: %s", target_dm, e2)

def stop_gui(custom_cmd: Optional[str] = None, dry_run: bool = False):
    logging.info("Stopping graphical target (returning to CLI / multi-user mode)...")
    if dry_run:
        logging.info("[DRY RUN] Would stop GUI")
        return

    if custom_cmd:
        try:
            subprocess.run(custom_cmd, shell=True, check=True)
            logging.info("Custom GUI stop command succeeded.")
        except subprocess.CalledProcessError as e:
            logging.error("Failed custom GUI stop command: %s", e)
        return

    try:
        subprocess.run(['systemctl', 'isolate', 'multi-user.target'], check=True, timeout=15)
        logging.info("Returned to multi-user mode (GUI stopped).")
    except Exception as e:
        logging.error("Failed to isolate multi-user.target: %s", e)

def create_netlink_socket() -> Optional[socket.socket]:
    try:
        sock = socket.socket(socket.AF_NETLINK, socket.SOCK_RAW, NETLINK_KOBJECT_UEVENT)
        sock.bind((os.getpid(), 1))
        sock.setblocking(False)
        return sock
    except Exception as e:
        logging.warning("Could not create Netlink uevent socket (%s). Operating in periodic polling mode.", e)
        return None

def parse_args():
    parser = argparse.ArgumentParser(
        description="Auto GUI Manager: Boots graphical interface on monitor connection, isolates to CLI on disconnect."
    )
    parser.add_argument("--debounce", type=float, default=float(os.getenv("AUTO_GUI_DEBOUNCE", "2.5")),
                        help="Debounce period in seconds before switching state (default: 2.5)")
    parser.add_argument("--poll-interval", type=float, default=float(os.getenv("AUTO_GUI_POLL_INTERVAL", "2.0")),
                        help="Polling interval in seconds (default: 2.0)")
    parser.add_argument("--display-manager", type=str, default=os.getenv("AUTO_GUI_DM", None),
                        help="Specific display manager service (e.g., gdm, lightdm, sddm, graphical.target)")
    parser.add_argument("--start-cmd", type=str, default=os.getenv("AUTO_GUI_START_CMD", None),
                        help="Custom shell command to execute when starting GUI")
    parser.add_argument("--stop-cmd", type=str, default=os.getenv("AUTO_GUI_STOP_CMD", None),
                        help="Custom shell command to execute when stopping GUI")
    parser.add_argument("--dry-run", action="store_true", default=bool(os.getenv("AUTO_GUI_DRY_RUN", "")),
                        help="Log state transitions without modifying system targets")
    parser.add_argument("--verbose", "-v", action="store_true", help="Enable verbose debug logging")
    parser.add_argument("--version", action="version", version=f"Auto GUI Manager v{VERSION}")
    return parser.parse_args()

def main():
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    logging.info(f"Auto GUI Manager v{VERSION} initialized.")
    if args.dry_run:
        logging.info("Running in DRY-RUN mode (system state will NOT be modified).")

    nl_sock = create_netlink_socket()
    last_connected = None
    pending_state = None
    pending_time = 0

    # Initial state check
    initial_displays = get_connected_displays()
    last_connected = len(initial_displays) > 0
    gui_active = is_gui_active(args.display_manager)

    logging.info("Initial state: Displays connected: %s | GUI active: %s",
                 initial_displays if initial_displays else "None", gui_active)

    if last_connected and not gui_active:
        logging.info("Display connected on boot. Starting GUI...")
        start_gui(args.display_manager, args.start_cmd, args.dry_run)
    elif not last_connected and gui_active:
        logging.info("No displays connected on boot but GUI is running. Stopping GUI...")
        stop_gui(args.stop_cmd, args.dry_run)

    while running:
        triggered_by_event = False
        if nl_sock:
            try:
                r, _, _ = select.select([nl_sock], [], [], args.poll_interval)
                if r:
                    while True:
                        try:
                            data = nl_sock.recv(4096)
                            if b'SUBSYSTEM=drm' in data:
                                triggered_by_event = True
                        except (BlockingIOError, InterruptedError):
                            break
            except (select.error, InterruptedError):
                if not running:
                    break
        else:
            time.sleep(args.poll_interval)

        current_displays = get_connected_displays()
        is_connected = len(current_displays) > 0
        current_time = time.time()

        if is_connected != last_connected:
            if pending_state != is_connected:
                pending_state = is_connected
                pending_time = current_time
                if is_connected:
                    logging.info("Display connection detected (%s). Debouncing for %.1fs...",
                                 ", ".join(current_displays), args.debounce)
                else:
                    logging.info("Display disconnection detected. Debouncing for %.1fs...", args.debounce)

            elif current_time - pending_time >= args.debounce:
                last_connected = is_connected
                pending_state = None

                gui_active = is_gui_active(args.display_manager)
                if is_connected and not gui_active:
                    logging.info("Display connection confirmed (%s). Booting GUI...", ", ".join(current_displays))
                    start_gui(args.display_manager, args.start_cmd, args.dry_run)
                elif not is_connected and gui_active:
                    logging.info("Display disconnection confirmed. Stopping GUI...")
                    stop_gui(args.stop_cmd, args.dry_run)
        else:
            pending_state = None

    if nl_sock:
        try:
            nl_sock.close()
        except Exception:
            pass
    logging.info("Auto GUI Manager cleanly stopped.")

if __name__ == '__main__':
    main()
