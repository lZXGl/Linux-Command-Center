import uuid
from flask import Blueprint, jsonify, request
from services.automation_pipeline import (
    load_pipelines,
    save_pipelines,
    load_pipeline_history,
    execute_pipeline,
    trigger_webhook
)

pipelines_bp = Blueprint('pipelines', __name__)

@pipelines_bp.route('/api/pipelines', methods=['GET'])
def get_pipelines():
    return jsonify(load_pipelines())

@pipelines_bp.route('/api/pipelines/history', methods=['GET'])
def get_pipelines_history():
    return jsonify(load_pipeline_history())

@pipelines_bp.route('/api/pipelines/save', methods=['POST'])
def save_pipeline():
    data = request.json or {}
    p_id = data.get("id")
    pipelines = load_pipelines()

    if not p_id:
        p_id = f"pipe_{str(uuid.uuid4())[:8]}"
        data["id"] = p_id
        if not data.get("webhook_token"):
            data["webhook_token"] = f"hook_{str(uuid.uuid4())[:10]}"
        pipelines.append(data)
    else:
        found = False
        for idx, p in enumerate(pipelines):
            if p.get("id") == p_id:
                if not data.get("webhook_token"):
                    data["webhook_token"] = p.get("webhook_token", f"hook_{str(uuid.uuid4())[:10]}")
                pipelines[idx] = data
                found = True
                break
        if not found:
            pipelines.append(data)

    success = save_pipelines(pipelines)
    if success:
        return jsonify({"message": "Pipeline saved successfully", "pipeline": data})
    return jsonify({"error": "Failed to save pipeline"}), 500

@pipelines_bp.route('/api/pipelines/<pipeline_id>/toggle', methods=['POST'])
def toggle_pipeline(pipeline_id):
    pipelines = load_pipelines()
    for p in pipelines:
        if p.get("id") == pipeline_id:
            p["enabled"] = not p.get("enabled", True)
            save_pipelines(pipelines)
            return jsonify({"message": f"Pipeline state toggled to {p['enabled']}", "enabled": p["enabled"]})
    return jsonify({"error": "Pipeline not found"}), 404

@pipelines_bp.route('/api/pipelines/<pipeline_id>/run', methods=['POST'])
def run_pipeline(pipeline_id):
    pipelines = load_pipelines()
    for p in pipelines:
        if p.get("id") == pipeline_id:
            success, msg = execute_pipeline(p, context={"manual": True})
            if success:
                return jsonify({"message": msg})
            return jsonify({"error": msg}), 400
    return jsonify({"error": "Pipeline not found"}), 404

@pipelines_bp.route('/api/pipelines/<pipeline_id>', methods=['DELETE'])
def delete_pipeline(pipeline_id):
    pipelines = load_pipelines()
    new_list = [p for p in pipelines if p.get("id") != pipeline_id]
    if len(new_list) < len(pipelines):
        save_pipelines(new_list)
        return jsonify({"message": "Pipeline deleted"})
    return jsonify({"error": "Pipeline not found"}), 404

@pipelines_bp.route('/api/pipelines/webhook/<webhook_token>', methods=['POST', 'GET'])
def webhook_endpoint(webhook_token):
    payload = request.json if request.is_json else request.args.to_dict()
    success, msg = trigger_webhook(webhook_token, payload)
    if success:
        return jsonify({"status": "triggered", "message": msg})
    return jsonify({"error": msg}), 404
