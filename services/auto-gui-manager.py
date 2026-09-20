#!/usr/bin/env python3
"""
Auto GUI Manager
Automatically starts the graphical interface (graphical.target) when a monitor / TV
is powered on (connected) and stops it (isolate multi-user.target) when powered off (disconnected).
Uses direct libdrm hardware probing to actively detect display hotplugging even when
the GPU driver does not generate passive kernel interrupts.
"""

import os
import sys
import glob
import time
import socket
import select
import signal
import logging
import subprocess
import ctypes

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

NETLINK_KOBJECT_UEVENT = 15
DEBOUNCE_SECONDS = 2.5
POLL_INTERVAL_SECONDS = 2.0

running = True

def handle_signal(signum, frame):
    global running
    logging.info("Received signal %d, exiting...", signum)
    running = False

signal.signal(signal.SIGTERM, handle_signal)
signal.signal(signal.SIGINT, handle_signal)

# --- Direct Hardware DRM Probing via libdrm ---
_libdrm = None
try:
    _libdrm = ctypes.CDLL('libdrm.so.2')
except Exception as e:
    logging.warning("Could not load libdrm.so.2 (%s), falling back to sysfs only.", e)

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

def probe_drm_hardware():
    """
    Directly probes GPU hardware connectors using libdrm ioctls.
    Forces kernel driver (e.g. amdgpu) to query physical DDC/I2C lines,
    detecting displays when powered on even if no passive interrupt fired.
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
                if conn_p.connection == 1:  # 1 = connected
                    c_type = DRM_CONNECTOR_NAMES.get(conn_p.connector_type, 'Connector')
                    c_type_id = conn_p.connector_type_id
                    connected.append(f"{card_name}-{c_type}-{c_type_id}")
                _libdrm.drmModeFreeConnector(conn)
            _libdrm.drmModeFreeResources(res)
        except Exception as e:
            logging.debug("Error probing %s: %s", card_path, e)
        finally:
            if fd >= 0:
                try:
                    os.close(fd)
                except Exception:
                    pass

    return connected

def get_connected_displays():
    """
    Returns a list of connected display connector names (e.g. ['card1-HDMI-A-1']).
    Uses libdrm hardware probe first (which forces hardware DDC query),
    falling back to /sys/class/drm/*/status.
    """
    probed = probe_drm_hardware()
    if probed:
        return probed

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

def is_gui_active():
    """Checks if gdm or graphical.target is active."""
    res1 = subprocess.run(['systemctl', 'is-active', '--quiet', 'graphical.target'])
    if res1.returncode == 0:
        return True
    res2 = subprocess.run(['systemctl', 'is-active', '--quiet', 'gdm.service'])
    return res2.returncode == 0

def start_gui():
    logging.info("Starting graphical target (booting GUI)...")
    try:
        subprocess.run(['systemctl', 'start', 'graphical.target'], check=True)
        logging.info("GUI successfully started.")
    except subprocess.CalledProcessError as e:
        logging.error("Failed to start graphical target: %s", e)

def stop_gui():
    logging.info("Stopping graphical target (returning to CLI / multi-user mode)...")
    try:
        subprocess.run(['systemctl', 'isolate', 'multi-user.target'], check=True)
        logging.info("Returned to multi-user mode (GUI stopped).")
    except subprocess.CalledProcessError as e:
        logging.error("Failed to stop GUI: %s", e)

def create_netlink_socket():
    try:
        sock = socket.socket(socket.AF_NETLINK, socket.SOCK_RAW, NETLINK_KOBJECT_UEVENT)
        sock.bind((os.getpid(), 1))
        sock.setblocking(False)
        return sock
    except Exception as e:
        logging.warning("Could not create Netlink uevent socket (%s). Falling back to pure polling.", e)
        return None

def main():
    logging.info("Auto GUI Manager started (Active DRM Hardware Probing enabled).")
    nl_sock = create_netlink_socket()

    last_connected = None
    pending_state = None
    pending_time = 0

    # Initial check on startup
    initial_displays = get_connected_displays()
    last_connected = len(initial_displays) > 0
    gui_active = is_gui_active()

    logging.info("Initial state: Displays connected: %s, GUI active: %s", initial_displays if initial_displays else "None", gui_active)

    if last_connected and not gui_active:
        logging.info("Display is connected on startup. Starting GUI...")
        start_gui()
    elif not last_connected and gui_active:
        logging.info("No displays connected on startup but GUI is running. Stopping GUI...")
        stop_gui()

    while running:
        # Wait for netlink event or poll timeout
        triggered_by_event = False
        if nl_sock:
            try:
                r, _, _ = select.select([nl_sock], [], [], POLL_INTERVAL_SECONDS)
                if r:
                    # Drain socket data
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
            time.sleep(POLL_INTERVAL_SECONDS)

        # Check current connected displays (probes hardware)
        current_displays = get_connected_displays()
        is_connected = len(current_displays) > 0

        current_time = time.time()

        if is_connected != last_connected:
            if pending_state != is_connected:
                pending_state = is_connected
                pending_time = current_time
                if is_connected:
                    logging.info("Display connected detected (%s). Debouncing for %.1fs...", ", ".join(current_displays), DEBOUNCE_SECONDS)
                else:
                    logging.info("Display disconnection detected. Debouncing for %.1fs...", DEBOUNCE_SECONDS)

            elif current_time - pending_time >= DEBOUNCE_SECONDS:
                # Debounce period passed and state remains the same
                last_connected = is_connected
                pending_state = None

                gui_active = is_gui_active()
                if is_connected and not gui_active:
                    logging.info("Display connection confirmed (%s). Booting GUI...", ", ".join(current_displays))
                    start_gui()
                elif not is_connected and gui_active:
                    logging.info("Display disconnection confirmed. Stopping GUI...")
                    stop_gui()
        else:
            # If state hasn't changed, clear pending state
            pending_state = None

    if nl_sock:
        nl_sock.close()
    logging.info("Auto GUI Manager stopped.")

if __name__ == '__main__':
    main()
