from flask import Blueprint, jsonify
from services.smart_storage_manager import calculate_storage_forecast, get_block_devices_info

smart_storage_bp = Blueprint('smart_storage', __name__)

@smart_storage_bp.route('/api/smart-storage/stats', methods=['GET'])
def get_smart_storage_stats():
    return jsonify(calculate_storage_forecast())

@smart_storage_bp.route('/api/smart-storage/drives', methods=['GET'])
def get_drives_only():
    return jsonify(get_block_devices_info())
