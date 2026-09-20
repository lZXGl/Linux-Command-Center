import os
import json
from datetime import datetime
from config import APP_DIR, DNS_SAVINGS_KB_PER_BLOCK

DNS_DAILY_HISTORY_FILE = os.path.join(APP_DIR, "dns_daily_history.json")
MAX_ENTRIES = 30


def load_dns_daily_history():
    if os.path.exists(DNS_DAILY_HISTORY_FILE):
        try:
            with open(DNS_DAILY_HISTORY_FILE, 'r') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []


def record_dns_daily_snapshot(stats=None):
    """Roll up today's AdGuard/Pi-hole blocked counts + savings. At most one write per day."""
    try:
        if stats is None:
            from services.system_monitor import get_dns_stats
            stats = get_dns_stats()
        src = stats.get("dns") if isinstance(stats, dict) and isinstance(stats.get("dns"), dict) else stats
        today = datetime.now().strftime("%Y-%m-%d")
        history = load_dns_daily_history()

        combined_blocked = int(float(src.get("combined_blocked_n", 0) or 0))
        adguard_blocked = int(float(src.get("adguard_blocked_n", 0) or 0))
        pihole_blocked = int(float(src.get("pihole_blocked_n", 0) or 0))

        entry = {
            "date": today,
            "adguard_blocked": adguard_blocked,
            "pihole_blocked": pihole_blocked,
            "combined_blocked": combined_blocked,
            "saved_mb": round((combined_blocked * DNS_SAVINGS_KB_PER_BLOCK) / 1024.0, 1),
        }
        if history and history[-1].get("date") == today:
            if history[-1].get("combined_blocked") == combined_blocked:
                return history[-1]
            history[-1] = entry
        else:
            history.append(entry)
        if len(history) > MAX_ENTRIES:
            history = history[-MAX_ENTRIES:]
        with open(DNS_DAILY_HISTORY_FILE, 'w') as f:
            json.dump(history, f, indent=2)
        return entry
    except Exception:
        return None


def get_dns_history(days=7):
    history = load_dns_daily_history()
    history = history[-max(1, int(days)):]
    return {
        "labels": [h.get("date", "") for h in history],
        "adguard_blocked": [h.get("adguard_blocked", 0) for h in history],
        "pihole_blocked": [h.get("pihole_blocked", 0) for h in history],
        "combined_blocked": [h.get("combined_blocked", 0) for h in history],
        "saved_mb": [h.get("saved_mb", 0) for h in history],
        "available": bool(history),
        "days": len(history)
    }
