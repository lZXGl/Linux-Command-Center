import os
from flask import Blueprint, render_template, send_from_directory, abort, current_app, make_response
from config import SCREENSHOTS_DIR

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    resp = make_response(render_template('index.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@main_bp.route('/lite')
def lite():
    resp = make_response(render_template('lite.html'))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@main_bp.route('/api/kiosk/reload', methods=['POST'])
def trigger_kiosk_reload():
    import time
    from flask import jsonify
    from config import KIOSK_STATE
    KIOSK_STATE["reload_token"] = int(time.time())
    return jsonify({"success": True, "reload_token": KIOSK_STATE["reload_token"], "message": "Wall tablet reload signal dispatched!"})

@main_bp.route('/api/kiosk/ping', methods=['POST', 'GET'])
def ping_kiosk():
    import time
    from flask import jsonify
    from config import KIOSK_STATE
    KIOSK_STATE["last_ping"] = int(time.time())
    return jsonify({"success": True, "reload_token": KIOSK_STATE["reload_token"]})

@main_bp.route('/api/kiosk/status', methods=['GET'])
def kiosk_status():
    import time
    from flask import jsonify
    from config import KIOSK_STATE
    is_online = (time.time() - KIOSK_STATE.get("last_ping", 0)) < 45
    return jsonify({
        "online": is_online,
        "last_ping": KIOSK_STATE.get("last_ping", 0),
        "reload_token": KIOSK_STATE.get("reload_token", 0)
    })

_WEATHER_CACHE = {"timestamp": 0, "data": None}

def get_location_coords():
    lat = os.environ.get("LATITUDE", "30.0444")
    lon = os.environ.get("LONGITUDE", "31.2357")
    city = os.environ.get("CITY", "Local")
    return lat, lon, city

@main_bp.route('/api/weather', methods=['GET'])
def get_weather():
    import urllib.request
    import json
    import time
    from flask import jsonify
    global _WEATHER_CACHE
    now = time.time()
    # In-memory cache for 30 minutes (1800s) -> practically 0 internet usage
    if _WEATHER_CACHE["data"] and (now - _WEATHER_CACHE["timestamp"]) < 1800:
        return jsonify(_WEATHER_CACHE["data"])

    lat, lon, city = get_location_coords()
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true"
        req = urllib.request.Request(url, headers={'User-Agent': 'LinuxCommandCenter/1.0'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
            cw = raw.get("current_weather", {})
            temp = cw.get("temperature")
            wcode = cw.get("weathercode", 0)
            is_day = cw.get("is_day", 1)

            cond = "Clear"
            if wcode in [0, 1]:
                cond = "Clear"
            elif wcode in [2, 3]:
                cond = "Partly Cloudy"
            elif wcode in [45, 48]:
                cond = "Foggy"
            elif wcode in [51, 53, 55, 61, 63, 65, 80, 81, 82]:
                cond = "Rain"
            elif wcode in [71, 73, 75, 85, 86]:
                cond = "Snow"
            elif wcode in [95, 96, 99]:
                cond = "Thunderstorm"

            res_data = {
                "temp": f"{round(temp)}°C" if temp is not None else "--",
                "icon": "",
                "condition": cond,
                "city": city
            }
            _WEATHER_CACHE["data"] = res_data
            _WEATHER_CACHE["timestamp"] = now
            return jsonify(res_data)
    except Exception:
        if _WEATHER_CACHE["data"]:
            return jsonify(_WEATHER_CACHE["data"])
        return jsonify({"temp": "28°C", "icon": "", "condition": "Clear", "city": city})

_PRAYER_CACHE = {"timestamp": 0, "data": None}

@main_bp.route('/api/prayer', methods=['GET'])
def get_prayer():
    import urllib.request
    import json
    import time
    import re
    from flask import jsonify
    global _PRAYER_CACHE
    now = time.time()
    # Cache for 12 hours (43200s) -> 0 external internet on tablet
    if _PRAYER_CACHE["data"] and (now - _PRAYER_CACHE["timestamp"]) < 43200:
        return jsonify(_PRAYER_CACHE["data"])

    lat, lon, city = get_location_coords()
    try:
        url = f"https://api.aladhan.com/v1/timings?latitude={lat}&longitude={lon}&method=5"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (LinuxCommandCenter)'})
        with urllib.request.urlopen(req, timeout=4) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
            t = raw.get("data", {}).get("timings", {})
            h = raw.get("data", {}).get("date", {}).get("hijri", {})
            month_en = h.get("month", {}).get("en", "")
            # Clean transliterated Arabic to pure ASCII
            replacements = {'ī': 'i', 'ʿ': '', 'ā': 'a', 'ū': 'u', 'ḍ': 'd', 'ṣ': 's', 'ṭ': 't', 'ẓ': 'z', 'ḥ': 'h'}
            for k, v in replacements.items():
                month_en = month_en.replace(k, v)
            month_clean = re.sub(r'[^\x00-\x7F]', '', month_en).replace("  ", " ").strip()
            if not month_clean:
                month_clean = "Rabi al-Awwal"
            hijri_str = f"{h.get('day', '')} {month_clean} {h.get('year', '')} AH".strip()

            data = {
                "timings": {
                    "Fajr": t.get("Fajr", "05:05")[:5],
                    "Sunrise": t.get("Sunrise", "06:34")[:5],
                    "Dhuhr": t.get("Dhuhr", "12:54")[:5],
                    "Asr": t.get("Asr", "16:28")[:5],
                    "Maghrib": t.get("Maghrib", "19:13")[:5],
                    "Isha": t.get("Isha", "20:32")[:5]
                },
                "hijri": hijri_str,
                "city": city
            }
            _PRAYER_CACHE["data"] = data
            _PRAYER_CACHE["timestamp"] = now
            return jsonify(data)
    except Exception:
        if _PRAYER_CACHE["data"]:
            return jsonify(_PRAYER_CACHE["data"])
        return jsonify({
            "timings": {
                "Fajr": "05:05",
                "Sunrise": "06:34",
                "Dhuhr": "12:54",
                "Asr": "16:28",
                "Maghrib": "19:13",
                "Isha": "20:32"
            },
            "hijri": "23 Rabi al-Awwal 1448 AH",
            "city": city
        })

@main_bp.route('/favicon.ico')
@main_bp.route('/favicon.png')
def favicon():
    return send_from_directory(os.path.join(current_app.root_path, 'static'), 'favicon.png', mimetype='image/png')

@main_bp.route('/apple-touch-icon.png')
@main_bp.route('/apple-touch-icon-precomposed.png')
def apple_touch_icon():
    return send_from_directory(os.path.join(current_app.root_path, 'static'), 'apple-touch-icon.png', mimetype='image/png')

@main_bp.route('/manifest.json')
def manifest():
    static_dir = os.path.join(current_app.root_path, 'static')
    if os.path.exists(os.path.join(static_dir, 'manifest.json')):
        return send_from_directory(static_dir, 'manifest.json', mimetype='application/manifest+json')
    abort(404)

@main_bp.route('/sw.js')
def service_worker():
    static_dir = os.path.join(current_app.root_path, 'static')
    return send_from_directory(static_dir, 'sw.js', mimetype='application/javascript')

@main_bp.route('/screenshots/<filename>')
def get_screenshot(filename):
    if not os.path.exists(os.path.join(SCREENSHOTS_DIR, filename)):
        return abort(404)
    return send_from_directory(SCREENSHOTS_DIR, filename)
