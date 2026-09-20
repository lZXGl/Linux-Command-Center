from .process_manager import (
    get_history,
    add_history,
    send_alert,
    get_active_tasks,
    kill_process_by_pid
)
from .system_monitor import (
    get_system_stats,
    get_systemd_services_status,
    exec_systemd_action,
    get_net_speed
)
from .cron_manager import (
    get_current_crontab,
    parse_cron_status,
    update_script_crontab
)
from .backup_manager import (
    create_full_backup,
    list_available_backups,
    restore_backup_archive
)
from .automation_pipeline import (
    load_pipelines,
    save_pipelines,
    load_pipeline_history,
    execute_pipeline,
    trigger_event,
    trigger_webhook
)
from .ai_ops_manager import (
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
from .smart_storage_manager import (
    get_block_devices_info,
    calculate_storage_forecast,
    get_fast_storage_breakdown,
    get_largest_files,
    scan_safe_cleaner,
    prune_safe_cleaner
)
from .watchdog_manager import (
    get_watchdog_status,
    toggle_watchdog,
    run_watchdog_sweep
)
from .opencode_manager import (
    is_opencode_running,
    start_opencode,
    stop_opencode,
    restart_opencode,
    get_opencode_status
)

__all__ = [
    "get_history",
    "add_history",
    "send_alert",
    "get_active_tasks",
    "kill_process_by_pid",
    "get_system_stats",
    "get_systemd_services_status",
    "exec_systemd_action",
    "get_net_speed",
    "get_current_crontab",
    "parse_cron_status",
    "update_script_crontab",
    "create_full_backup",
    "list_available_backups",
    "restore_backup_archive",
    "load_pipelines",
    "save_pipelines",
    "load_pipeline_history",
    "execute_pipeline",
    "trigger_event",
    "trigger_webhook",
    "is_ollama_running",
    "start_ollama_service",
    "stop_ollama_service",
    "restart_ollama_service",
    "stop_ai_processes",
    "list_local_models",
    "diagnose_log_error",
    "ask_ops_copilot",
    "pull_ollama_model",
    "delete_ollama_model",
    "get_block_devices_info",
    "calculate_storage_forecast",
    "get_fast_storage_breakdown",
    "get_largest_files",
    "scan_safe_cleaner",
    "prune_safe_cleaner",
    "get_watchdog_status",
    "toggle_watchdog",
    "run_watchdog_sweep",
    "is_opencode_running",
    "start_opencode",
    "stop_opencode",
    "restart_opencode",
    "get_opencode_status"
]
