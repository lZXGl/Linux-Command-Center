from flask import Blueprint, jsonify, request
from services import (
    create_full_backup,
    list_available_backups,
    restore_backup_archive
)

backup_bp = Blueprint('backup', __name__)

@backup_bp.route('/api/system/backup', methods=['POST'])
def trigger_backup_route():
    success, result = create_full_backup()
    if success:
        return jsonify({
            "message": f"Backup archive '{result['filename']}' ({result['size']}) created successfully in backup storage!",
            "backup": result
        })
    return jsonify({"error": f"Backup failed: {result}"}), 500

@backup_bp.route('/api/system/backups', methods=['GET'])
def list_backups_route():
    backups = list_available_backups()
    return jsonify(backups)

@backup_bp.route('/api/system/backup/restore', methods=['POST'])
def restore_backup_route():
    data = request.json or {}
    filename = data.get("filename", "").strip()

    if not filename:
        return jsonify({"error": "Filename is required"}), 400

    success, msg = restore_backup_archive(filename)
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500
