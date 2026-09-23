# Linux Command Center

A modern, fast, modular **web-based Command Center** for home servers, homelabs, Linux VPS, and multi-service server orchestration.

Designed to work dynamically out of the box on any Linux distribution with zero hardcoded paths or environment-specific dependencies.

<p align="center">
  <img src="docs/assets/launch_preview.gif" alt="Linux Command Center Dashboard Preview" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active_v2.0-30d158?style=flat-square&logo=linux&logoColor=white" alt="Status Active" />
  <img src="https://img.shields.io/badge/Watchdog-Auto--Healing-2997ff?style=flat-square&logo=docker&logoColor=white" alt="Watchdog Auto-Healing" />
  <img src="https://img.shields.io/badge/Local_AI-Ollama_Copilot-c084fc?style=flat-square&logo=openai&logoColor=white" alt="Local AI" />
  <img src="https://img.shields.io/badge/Python-3.10+-38bdf8?style=flat-square&logo=python&logoColor=white" alt="Python 3.10+" />
  <img src="https://img.shields.io/badge/License-MIT-gray?style=flat-square" alt="License" />
</p>

---

## Features

- **Live Telemetry & Health Monitoring**:
  Real-time CPU usage, thermal temperatures, RAM percentage, multi-drive storage allocation, network bandwidth throughput, DNS query/blocked metrics for Pi-hole & AdGuard Home, and 24h trend charts.

- **Diagnostics Timeline & Visual Failure Snapshots**:
  Chronological execution history and failure logs with comprehensive captured terminal states, exit codes, execution durations, and interactive snapshot inspection modals.

- **Storage Forecaster & SMART Analytics**:
  Physical block-device I/O telemetry, SMART health grading, linear predictive capacity forecasting, and dynamic storage capacity breakdown across media, archives, and system volumes.

- **Automated Watchdog Auto-Healing**:
  Configurable background health monitor that tracks homelab containers and core systemd daemons, automatically performing self-healing restarts upon failure with clearable incident history.

- **Script Runner & Visual Crontab Scheduler**:
  One-click execution with confirmation modals and real-time status; link existing system scripts (`.sh`, `.py`, binaries) with live host auto-discovery or write new scripts, edit per-day visual crontab schedules, and execute batch tasks.

- **Dynamic Network & UFW Security**:
  Auto-detects live IPv4 network interfaces, inspects real-time UFW firewall status, and displays active listening ports mapped to standard network services.

- **Container & Service Orchestration**:
  Auto-discovered running Docker containers with port mapping, live status, start/stop/restart controls, and systemd service supervision.

- **Event-Driven Automation Pipelines**:
  Chain multi-step actions on script completion or failure, with external webhook receiver endpoints (`/api/pipelines/webhook/<token>`).

- **Local AI Ops & Ollama Hub**:
  GPU-accelerated LLM management (pull/list/delete), 1-click log error diagnostics, and an integrated server ops copilot.

- **Storage Explorer & Snapshot Backup Engine**:
  Filesystem browser with previews, 1-click compressed `.tar.gz` backup creation, and point-in-time snapshot restore.

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/lZXGl/linux-command-center.git
cd linux-command-center
```

### 2. Install dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment (Optional)

```bash
cp .env.example .env
# Edit .env to customize PORT, STORAGE_BASE, or binary paths if needed
```

### 4. Run the dashboard

```bash
python3 app.py
```

Open **`http://<server-ip>:5000`** in your browser.

---

## Architecture

```
linux-command-center/
├── app.py                     # Flask application entrypoint
├── config.py                  # Core configuration & dynamic environment loader
├── cron_runner.py             # Crontab execution wrapper & history logger
├── update_all_system.sh       # Automated system & package updater
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variables template
├── routes/                    # Modular blueprint endpoints
│   ├── main.py                # Dashboard UI & kiosk mode serving
│   ├── scripts.py             # Script management, batch runner & logs
│   ├── homelab.py             # Docker containers & watchdog endpoints
│   ├── system.py              # Telemetry, services, updates & network
│   ├── storage.py             # Visual storage explorer
│   ├── backup.py              # Snapshot backup & rollback engine
│   ├── pipelines.py           # Event-driven pipeline workflows
│   ├── ai_ops.py              # Local Ollama AI & copilot endpoints
│   ├── smart_storage.py       # SMART device telemetry & forecaster
│   └── opencode.py            # Terminal & Web IDE integration
├── services/                  # Business logic engines
│   ├── system_monitor.py      # Telemetry, uptime, temperatures & DNS
│   ├── process_manager.py     # Active tasks, execution history, alerts
│   ├── homelab_manager.py     # Docker auto-discovery & container control
│   ├── watchdog_manager.py    # Automated daemon/container watchdog
│   ├── cron_manager.py        # System crontab parser & editor
│   ├── backup_manager.py      # Tar.gz archive & snapshot manager
│   ├── automation_pipeline.py # Pipelines engine & webhook dispatcher
│   ├── ai_ops_manager.py      # Local Ollama LLM inference & diagnostics
│   ├── smart_storage_manager.py # Block device health, forecasting & scanner
│   └── opencode_manager.py    # Web IDE process supervisor
├── scripts/                   # Bundled maintenance scripts
│   ├── health_check.py        # System load, disk & memory verification
│   ├── docker_cleanup.py      # Docker prune & container maintenance
│   └── backup_task.py         # Daily snapshot verification
├── static/                    # Shaders, JS, CSS and static assets
├── systemd/                   # Systemd unit template
│   └── linux-command-center.service.example
└── templates/
    ├── index.html             # Full-featured single-page dashboard UI
    └── lite.html              # Ultra-fast kiosk & mobile lite UI
```

---

## Systemd Service (Auto-start on Boot)

To run Linux Command Center as a systemd background service:

```bash
sudo cp systemd/linux-command-center.service.example /etc/systemd/system/linux-command-center.service
sudo nano /etc/systemd/system/linux-command-center.service   # Adjust User and WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now linux-command-center.service
```

---

## Configuration & Customization

All paths and service integrations are fully dynamic and can be configured via environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Web dashboard listening port |
| `HOST` | `0.0.0.0` | Bind IP address |
| `PRIMARY_IP` | *Auto-detected* | LAN IP address for dashboard links |
| `STORAGE_BASE` | `/mnt/storage` | Base mount path for storage distribution scanner |
| `SCRIPTS_DIR` | `./scripts` | Directory for managed executable scripts |
| `SCREENSHOTS_DIR` | `./screenshots` | Directory for saved failure screenshots |
| `BACKUPS_DIR` | `./backups` | Directory for generated `.tar.gz` backups |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint for AI Ops |

---

## License

Released under the [MIT License](LICENSE).