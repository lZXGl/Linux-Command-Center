import os
import shutil
import json
import subprocess
import urllib.request
import urllib.error
import threading

OLLAMA_API_BASE = "http://127.0.0.1:11434"
VULKAN_AI_BASE = "http://127.0.0.1:11435"
OLLAMA_BIN = os.environ.get("OLLAMA_BIN", shutil.which("ollama") or os.path.expanduser("~/ollama/bin/ollama") or "/usr/local/bin/ollama")

def is_vulkan_ai_running():
    try:
        req = urllib.request.Request(f"{VULKAN_AI_BASE}/v1/models", method="GET")
        with urllib.request.urlopen(req, timeout=1.0) as response:
            return response.status == 200
    except Exception:
        return False

def is_ollama_running():
    if is_vulkan_ai_running():
        return True
    try:
        req = urllib.request.Request(f"{OLLAMA_API_BASE}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as response:
            return response.status == 200
    except Exception:
        return False

def start_ollama_service():
    """
    Starts the Vulkan GPU AI Engine and Ollama.
    """
    try:
        subprocess.run(["sudo", "-n", "systemctl", "start", "vulkan-ai.service"], capture_output=True, text=True, timeout=8)
    except Exception:
        pass

    try:
        subprocess.run(["sudo", "-n", "systemctl", "start", "ollama.service"], capture_output=True, text=True, timeout=8)
    except Exception:
        pass

    import time
    for _ in range(6):
        if is_vulkan_ai_running() or is_ollama_running():
            return True, "Local AI Engine (AMD GPU) started successfully."
        time.sleep(0.5)

    return True, "Local AI Engine start signal dispatched."

def stop_ollama_service():
    """
    Explicitly stops AI daemons and kills running inference runners.
    """
    stop_ai_processes()
    
    try:
        subprocess.run(["sudo", "-n", "systemctl", "stop", "vulkan-ai.service"], capture_output=True, text=True, timeout=8)
    except Exception:
        pass

    try:
        subprocess.run(["sudo", "-n", "systemctl", "stop", "ollama.service"], capture_output=True, text=True, timeout=8)
    except Exception:
        pass

    try:
        subprocess.run(["pkill", "-9", "-f", "llama-server"], capture_output=True, text=True)
        subprocess.run(["pkill", "-9", "-f", "ollama serve"], capture_output=True, text=True)
        subprocess.run(["pkill", "-9", "-f", "ollama runner"], capture_output=True, text=True)
    except Exception:
        pass

    return True, "AI services stopped completely."

def restart_ollama_service():
    """
    Restarts AI services.
    """
    stop_ai_processes()
    try:
        subprocess.run(["sudo", "-n", "systemctl", "restart", "vulkan-ai.service"], capture_output=True, text=True, timeout=10)
    except Exception:
        pass
    try:
        subprocess.run(["sudo", "-n", "systemctl", "restart", "ollama.service"], capture_output=True, text=True, timeout=10)
    except Exception:
        pass
    return True, "AI services restarted."

def stop_ai_processes():
    """
    Terminates all running inference runners immediately to reset CPU and VRAM.
    """
    try:
        subprocess.run(["pkill", "-9", "-f", "llama-server"], capture_output=True, text=True)
        subprocess.run(["pkill", "-9", "-f", "ollama serve"], capture_output=True, text=True)
        subprocess.run(["pkill", "-9", "-f", "ollama runner"], capture_output=True, text=True)
        subprocess.run(["pkill", "-9", "-f", "llama-cli"], capture_output=True, text=True)
    except Exception:
        pass
    return True, "Active AI inference processes terminated."

def list_local_models():
    """
    Lists installed models across Vulkan GPU engine and Ollama.
    """
    vulkan_active = is_vulkan_ai_running()
    ollama_active = False
    
    formatted = []
    if vulkan_active:
        formatted.append({
            "name": "qwen2:1.5b (AMD Radeon Vulkan GPU)",
            "model": "qwen2:1.5b",
            "size": "0.89 GB (VRAM)",
            "modified_at": "Active on AMD GPU",
            "digest": "vulkan-gpu",
            "details": {"gpu": "AMD Radeon R7 260X / 360", "backend": "Vulkan"}
        })

    try:
        req = urllib.request.Request(f"{OLLAMA_API_BASE}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=1.5) as response:
            if response.status == 200:
                ollama_active = True
                data = json.loads(response.read().decode('utf-8'))
                models = data.get("models", [])
                for m in models:
                    size_gb = round(m.get("size", 0) / (1024 ** 3), 2)
                    formatted.append({
                        "name": m.get("name"),
                        "model": m.get("model"),
                        "size": f"{size_gb} GB",
                        "modified_at": m.get("modified_at", "")[:19].replace("T", " "),
                        "digest": m.get("digest", "")[:12],
                        "details": m.get("details", {})
                    })
    except Exception:
        pass
    
    if vulkan_active or ollama_active:
        return {"running": True, "models": formatted}
    
    return {"running": False, "models": [], "error": "AI engines are currently stopped"}

def diagnose_log_error(log_content, script_name="Automation Script", model=None):
    if is_vulkan_ai_running():
        try:
            prompt = (
                f"You are an expert Linux System Administrator.\n"
                f"Analyze this error from '{script_name}':\n"
                f"{log_content[-1500:]}\n\n"
                f"Give a short 3-part diagnosis: 1. Root Cause, 2. Impact, 3. Recommended Fix (concrete bash command)."
            )
            payload = json.dumps({
                "model": "qwen2",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 250,
                "temperature": 0.3
            }).encode('utf-8')
            req = urllib.request.Request(
                f"{VULKAN_AI_BASE}/v1/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=35) as response:
                if response.status == 200:
                    res_data = json.loads(response.read().decode('utf-8'))
                    reply = res_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    return {
                        "success": True,
                        "model_used": "Qwen2 1.5B (AMD Radeon Vulkan GPU)",
                        "analysis": reply
                    }
        except Exception:
            pass

    if not is_ollama_running():
        return {
            "success": True,
            "model_used": "Built-in Diagnostic Engine",
            "analysis": generate_fallback_diagnosis(log_content, script_name)
        }

    return {
        "success": True,
        "model_used": "Built-in Diagnostic Engine",
        "analysis": generate_fallback_diagnosis(log_content, script_name)
    }

def generate_fallback_diagnosis(log_content, script_name):
    lower = log_content.lower()
    if "no such file or directory" in lower:
        return (
            "### 🔍 Root Cause\nA required file, script path, or target directory is missing or inaccessible.\n\n"
            "### ⚠️ Impact\nThe script was unable to locate dependencies or output directories.\n\n"
            "### 🛠️ Recommended Fix\n"
            "- Verify that all referenced file paths exist.\n"
            "- Check permissions with `ls -la <path>`.\n"
            "- Ensure the working directory `BASE_DIR` is set correctly."
        )
    elif "permission denied" in lower:
        return (
            "### 🔍 Root Cause\nPermission Denied error during script execution or socket access.\n\n"
            "### ⚠️ Impact\nThe executing process lacks sufficient read/write/execution rights.\n\n"
            "### 🛠️ Recommended Fix\n"
            "- Run `chmod +x <script.py>` or verify directory write permissions.\n"
            "- Check if passwordless sudo is required for system commands."
        )
    elif "connection refused" in lower or "timeout" in lower:
        return (
            "### 🔍 Root Cause\nNetwork timeout or target service refused connection.\n\n"
            "### ⚠️ Impact\nUnable to communicate with the target web portal or API endpoint.\n\n"
            "### 🛠️ Recommended Fix\n"
            "- Verify network connectivity via `ping -c 3 1.1.1.1`.\n"
            "- Check if the remote login page or Docker container is active."
        )
    else:
        return (
            "### 🔍 Root Cause\nGeneral execution error or unexpected exception encountered.\n\n"
            "### ⚠️ Impact\nProcess terminated before reaching completion.\n\n"
            "### 🛠️ Recommended Fix\n"
            "- Review the full log in the execution history.\n"
            "- Test running the script directly from the interactive Web Terminal."
        )

def ask_ops_copilot(question, model=None):
    if is_vulkan_ai_running():
        try:
            system_prompt = (
                "You are AI Ops Copilot, a Linux and Homelab engineer. "
                "Keep answers concise, direct, and provide exact Bash/Python commands."
            )
            payload = json.dumps({
                "model": "qwen2",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question}
                ],
                "max_tokens": 200,
                "temperature": 0.3
            }).encode('utf-8')
            req = urllib.request.Request(
                f"{VULKAN_AI_BASE}/v1/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=35) as response:
                if response.status == 200:
                    res_data = json.loads(response.read().decode('utf-8'))
                    reply = res_data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    return {
                        "success": True,
                        "model_used": "Qwen2 1.5B (AMD Radeon Vulkan GPU)",
                        "reply": reply
                    }
        except Exception as e:
            return {
                "success": False,
                "error": f"GPU inference error ({str(e)})."
            }

    if not is_ollama_running():
        return {
            "success": False,
            "error": "AI Engine is currently offline. Click 'Start' in AI Ops to enable GPU AI inference."
        }

    return {
        "success": False,
        "error": "Ollama is running on CPU. For fast responses, Vulkan GPU engine is recommended."
    }

def pull_ollama_model(model_name):
    if not is_ollama_running():
        start_ollama_service()

    def _pull_thread():
        try:
            subprocess.run([OLLAMA_BIN, "pull", model_name], capture_output=True, text=True)
        except Exception:
            pass

    thread = threading.Thread(target=_pull_thread, daemon=True)
    thread.start()
    return True, f"Started pulling model '{model_name}' in background."

def delete_ollama_model(model_name):
    try:
        res = subprocess.run([OLLAMA_BIN, "rm", model_name], capture_output=True, text=True)
        if res.returncode == 0:
            return True, f"Successfully removed model '{model_name}'"
        return False, res.stderr or "Failed to remove model"
    except Exception as e:
        return False, str(e)
