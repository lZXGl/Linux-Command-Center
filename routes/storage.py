import os
import json
import re
import subprocess
from flask import Blueprint, jsonify, request
from config import STORAGE_BASE
from services import add_history, send_alert

storage_bp = Blueprint('storage', __name__)

@storage_bp.route('/api/storage/overview', methods=['GET'])
def get_storage_overview():
    volumes = []
    # Storage Mount Volume (if configured and distinct from root)
    if STORAGE_BASE and STORAGE_BASE != "/" and os.path.exists(STORAGE_BASE):
        try:
            res = subprocess.run(["df", "-h", STORAGE_BASE], capture_output=True, text=True)
            lines = res.stdout.strip().split("\n")
            if len(lines) > 1:
                parts = lines[1].split()
                volumes.append({
                    "mount": STORAGE_BASE,
                    "label": "Secondary / Fast Storage",
                    "total": parts[1],
                    "used": parts[2],
                    "free": parts[3],
                    "percent": parts[4]
                })
        except Exception:
            pass

    # Root OS Disk
    try:
        res = subprocess.run(["df", "-h", "/"], capture_output=True, text=True)
        lines = res.stdout.strip().split("\n")
        if len(lines) > 1:
            parts = lines[1].split()
            volumes.append({
                "mount": "/",
                "label": "Primary OS Boot Volume",
                "total": parts[1],
                "used": parts[2],
                "free": parts[3],
                "percent": parts[4]
            })
    except Exception:
        pass

    return jsonify(volumes)

@storage_bp.route('/api/storage/explore', methods=['GET'])
@storage_bp.route('/api/storage/files', methods=['GET'])
def explore_storage():
    rel_path = request.args.get("path", "").strip().lstrip("/")
    target_path = os.path.normpath(os.path.join(STORAGE_BASE, rel_path))

    # Security check: prevent escaping storage base
    if not target_path.startswith(STORAGE_BASE):
        return jsonify({"error": "Path access denied"}), 403

    if not os.path.exists(target_path):
        return jsonify({"error": "Directory not found", "items": [], "current_path": rel_path}), 404

    items = []
    try:
        with os.scandir(target_path) as entries:
            for entry in entries:
                try:
                    stat = entry.stat()
                    is_dir = entry.is_dir()
                    size_str = "-"
                    if not is_dir:
                        size_b = stat.st_size
                        if size_b >= 1073741824:
                            size_str = f"{size_b / 1073741824:.2f} GB"
                        elif size_b >= 1048576:
                            size_str = f"{size_b / 1048576:.1f} MB"
                        else:
                            size_str = f"{size_b / 1024:.0f} KB"

                    items.append({
                        "name": entry.name,
                        "is_dir": is_dir,
                        "size": size_str,
                        "modified": stat.st_mtime
                    })
                except Exception:
                    pass
    except Exception as e:
        return jsonify({"error": str(e), "items": []}), 500

    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return jsonify({
        "current_path": rel_path,
        "items": items
    })

@storage_bp.route('/api/storage/docker-df', methods=['GET'])
def get_docker_storage_df():
    items = []
    unused_images = []
    reclaimable_total = "0B"
    try:
        res = subprocess.run(["docker", "system", "df", "--format", "{{json .}}"], capture_output=True, text=True, timeout=5)
        for line in res.stdout.strip().splitlines():
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                items.append({
                    "type": data.get("Type", ""),
                    "total": data.get("TotalCount", "0"),
                    "active": data.get("Active", "0"),
                    "size": data.get("Size", "0B"),
                    "reclaimable": data.get("Reclaimable", "0B")
                })
            except Exception:
                continue
    except Exception:
        pass

    # Find active images vs inactive images
    try:
        res_ps = subprocess.run(["docker", "ps", "--format", "{{.Image}}"], capture_output=True, text=True, timeout=5)
        active_images = set(line.strip() for line in res_ps.stdout.strip().splitlines() if line.strip())

        res_img = subprocess.run(["docker", "images", "--format", "{{json .}}"], capture_output=True, text=True, timeout=5)
        for line in res_img.stdout.strip().splitlines():
            if not line.strip():
                continue
            try:
                img = json.loads(line)
                repo = img.get("Repository", "")
                tag = img.get("Tag", "")
                full_name = f"{repo}:{tag}" if tag and tag != "<none>" else repo
                img_id = img.get("ID", "")
                is_active = (full_name in active_images) or (repo in active_images) or (img_id in active_images)
                if not is_active:
                    unused_images.append({
                        "id": img_id,
                        "name": full_name,
                        "repository": repo,
                        "tag": tag,
                        "size": img.get("Size", "0B"),
                        "created": img.get("CreatedAt", "")
                    })
            except Exception:
                continue
    except Exception:
        pass

    for i in items:
        if "reclaimable" in i and i["reclaimable"] != "0B":
            reclaimable_total = i["reclaimable"].split()[0]
            break

    return jsonify({
        "items": items,
        "total_reclaimable": reclaimable_total,
        "unused_images": unused_images,
        "unused_images_count": len(unused_images)
    })

@storage_bp.route('/api/storage/docker-prune', methods=['POST'])
def docker_prune():
    try:
        req_data = request.get_json(silent=True) or {}
        mode = req_data.get("mode", "safe")
        image_id = req_data.get("image_id")

        if mode == "image" and image_id:
            # Remove single image
            cmd = ["docker", "rmi", "-f", image_id]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if res.returncode != 0:
                return jsonify({"success": False, "error": res.stderr or "Failed to delete image"}), 400
            add_history(f"Deleted Docker Image {image_id}", "docker_rmi", "Storage Cleanup", "Success")
            return jsonify({
                "success": True,
                "reclaimed": "1 Image",
                "message": f"Successfully deleted image {image_id}."
            })
        elif mode in ["all", "deep"]:
            # Prune all unused images + dangling + stopped containers + build cache
            cmd = ["docker", "system", "prune", "-a", "-f"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            reclaimed_match = re.search(r'Total reclaimed space:\s*([^\n\r]+)', res.stdout)
            reclaimed_str = reclaimed_match.group(1).strip() if reclaimed_match else "0B"
            add_history(f"Deep Cleaned All Docker Images ({reclaimed_str})", "docker_prune_all", "Storage Cleanup", "Success")
            send_alert("Storage Cleanup", "Docker Deep Cleanup", f"Successfully wiped all unused Docker images and freed {reclaimed_str}.")
            return jsonify({
                "success": True,
                "reclaimed": reclaimed_str,
                "output": res.stdout,
                "message": f"Docker deep cleanup complete! Reclaimed {reclaimed_str}."
            })
        else:
            # Safe prune: dangling images, stopped containers, build cache only
            cmd = ["docker", "system", "prune", "-f"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            reclaimed_match = re.search(r'Total reclaimed space:\s*([^\n\r]+)', res.stdout)
            reclaimed_str = reclaimed_match.group(1).strip() if reclaimed_match else "0B"
            add_history(f"Safe Cleaned Docker Space ({reclaimed_str})", "docker_prune_safe", "Storage Cleanup", "Success")
            send_alert("Storage Cleanup", "Docker Garbage Cleaned", f"Successfully pruned Docker dangling resources and freed {reclaimed_str}.")
            return jsonify({
                "success": True,
                "reclaimed": reclaimed_str,
                "output": res.stdout,
                "message": f"Docker safe cleanup complete! Reclaimed {reclaimed_str}."
            })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

from services.smart_storage_manager import (
    get_fast_storage_breakdown,
    get_largest_files,
    scan_safe_cleaner,
    prune_safe_cleaner
)

@storage_bp.route('/api/storage/breakdown', methods=['GET'])
def storage_breakdown_route():
    try:
        return jsonify(get_fast_storage_breakdown())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@storage_bp.route('/api/storage/largest-files', methods=['GET'])
def storage_largest_files_route():
    limit = int(request.args.get("limit", 15))
    try:
        return jsonify(get_largest_files(limit=limit))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@storage_bp.route('/api/storage/cleaner/scan', methods=['GET'])
def storage_cleaner_scan_route():
    try:
        return jsonify(scan_safe_cleaner())
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@storage_bp.route('/api/storage/cleaner/prune', methods=['POST'])
def storage_cleaner_prune_route():
    try:
        result = prune_safe_cleaner()
        if result.get("deleted_count", 0) > 0:
            add_history(f"Pruned {result['deleted_count']} Scratch Files ({result['reclaimed_str']})", "storage_prune", "Storage Cleaner", "Success")
            send_alert("Storage Cleaner", "Scratch Files Cleaned", f"Pruned {result['deleted_count']} scratch/temporary files and freed {result['reclaimed_str']}.")
        return jsonify(result)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


