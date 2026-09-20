from flask import Blueprint, jsonify, request
from services.ai_ops_manager import (
    is_ollama_running,
    start_ollama_service,
    stop_ollama_service,
    restart_ollama_service,
    stop_ai_processes,
    list_local_models,
    diagnose_log_error,
    ask_ops_copilot,
    pull_ollama_model,
    delete_ollama_model
)

ai_ops_bp = Blueprint('ai_ops', __name__)

@ai_ops_bp.route('/api/ai/status', methods=['GET'])
def ai_status():
    running = is_ollama_running()
    return jsonify({
        "running": running,
        "api_url": "http://127.0.0.1:11434"
    })

@ai_ops_bp.route('/api/ai/start', methods=['POST'])
def start_ollama():
    success, msg = start_ollama_service()
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@ai_ops_bp.route('/api/ai/stop', methods=['POST'])
def stop_ollama():
    success, msg = stop_ollama_service()
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@ai_ops_bp.route('/api/ai/restart', methods=['POST'])
def restart_ollama():
    success, msg = restart_ollama_service()
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@ai_ops_bp.route('/api/ai/kill', methods=['POST'])
def kill_ai():
    success, msg = stop_ai_processes()
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@ai_ops_bp.route('/api/ai/models', methods=['GET'])
def get_models():
    return jsonify(list_local_models())

@ai_ops_bp.route('/api/ai/models/pull', methods=['POST'])
def pull_model():
    data = request.json or {}
    model_name = data.get("model")
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400
    success, msg = pull_ollama_model(model_name)
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@ai_ops_bp.route('/api/ai/models/delete', methods=['POST'])
def delete_model():
    data = request.json or {}
    model_name = data.get("model")
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400
    success, msg = delete_ollama_model(model_name)
    if success:
        return jsonify({"message": msg})
    return jsonify({"error": msg}), 500

@ai_ops_bp.route('/api/ai/diagnose', methods=['POST'])
def diagnose_log():
    data = request.json or {}
    log_content = data.get("log", "")
    script_name = data.get("script_name", "Execution Log")
    model = data.get("model")

    if not log_content:
        return jsonify({"error": "Log content is required"}), 400

    result = diagnose_log_error(log_content, script_name, model)
    return jsonify(result)

@ai_ops_bp.route('/api/ai/ask', methods=['POST'])
def ask_copilot():
    data = request.json or {}
    question = data.get("question", "")
    model = data.get("model")

    if not question:
        return jsonify({"error": "Question is required"}), 400

    result = ask_ops_copilot(question, model)
    return jsonify(result)
