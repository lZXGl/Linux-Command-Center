from flask import Blueprint, jsonify, request
from services.opencode_manager import (
    is_opencode_running,
    start_opencode,
    stop_opencode,
    restart_opencode,
    get_opencode_status
)
from services import add_history

opencode_bp = Blueprint('opencode', __name__)

@opencode_bp.route('/api/opencode/status', methods=['GET'])
def opencode_status_route():
    return jsonify(get_opencode_status())

@opencode_bp.route('/api/opencode/start', methods=['POST'])
def start_opencode_route():
    success, msg = start_opencode()
    if success:
        add_history("Started OpenCode AI Web Studio", "opencode_start", "AI Studio", "Started")
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@opencode_bp.route('/api/opencode/stop', methods=['POST'])
def stop_opencode_route():
    success, msg = stop_opencode()
    if success:
        add_history("Stopped OpenCode AI Web Studio", "opencode_stop", "AI Studio", "Stopped")
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@opencode_bp.route('/api/opencode/restart', methods=['POST'])
def restart_opencode_route():
    success, msg = restart_opencode()
    if success:
        add_history("Restarted OpenCode AI Web Studio", "opencode_restart", "AI Studio", "Restarted")
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500
