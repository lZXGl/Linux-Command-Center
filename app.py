import sys
from pathlib import Path

# Add app directory to sys.path
APP_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(APP_DIR))

from flask import Flask
from config import PORT, HOST
from routes import (
    main_bp,
    scripts_bp,
    system_bp,
    homelab_bp,
    storage_bp,
    backup_bp,
    pipelines_bp,
    ai_ops_bp,
    smart_storage_bp,
    opencode_bp
)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'homelab-command-center-secret-key-change-me'

# Register modular blueprints
app.register_blueprint(main_bp)
app.register_blueprint(scripts_bp)
app.register_blueprint(system_bp)
app.register_blueprint(homelab_bp)
app.register_blueprint(storage_bp)
app.register_blueprint(backup_bp)
app.register_blueprint(pipelines_bp)
app.register_blueprint(ai_ops_bp)
app.register_blueprint(smart_storage_bp)
app.register_blueprint(opencode_bp)

if __name__ == "__main__":
    print(f"🚀 Homelab-Command-Center starting on http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=False)
