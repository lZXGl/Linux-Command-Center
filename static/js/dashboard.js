    let currentCategory = 'all';
    let allScriptsData = [];
    let homelabServicesData = [];
    let updateLogTimer = null;

    const ALL_DAYS = [
        { val: '0', label: 'Sunday' },
        { val: '1', label: 'Monday' },
        { val: '2', label: 'Tuesday' },
        { val: '3', label: 'Wednesday' },
        { val: '4', label: 'Thursday' },
        { val: '5', label: 'Friday' },
        { val: '6', label: 'Saturday' }
    ];

    // --- CUSTOM TOAST NOTIFICATION ENGINE ---
    function showToast(message, type = 'success', duration = 3500) {
        if (!message) return;
        // Clean and strip any emojis from toast text
        const cleanMsg = String(message)
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{200D}]/gu, '')
            .trim();

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `custom-toast toast-${type}`;
        
        let icon = 'fa-circle-check';
        let border = 'var(--accent-green)';
        if (type === 'error') { icon = 'fa-circle-xmark'; border = 'var(--accent-red)'; }
        if (type === 'info') { icon = 'fa-circle-info'; border = 'var(--accent-cyan)'; }

        toast.innerHTML = `
            <i class="fa-solid ${icon}" style="font-size:1.15rem; color:${border};"></i>
            <div style="flex:1; font-size:0.88rem; font-weight:600; color:#fff;">${cleanMsg}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.35s ease forwards';
            setTimeout(() => toast.remove(), 350);
        }, duration);
    }

    // --- CUSTOM CONFIRM MODAL ENGINE ---
    function showConfirm(title, message, onConfirm, isDanger = false) {
        const modal = document.getElementById('viewer-modal');
        document.getElementById('modal-title').innerText = title;
        
        document.getElementById('modal-body').innerHTML = `
            <div style="text-align:center; padding: 1.5rem 1rem;">
                <div style="width:64px; height:64px; border-radius:50%; background:${isDanger ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}; color:${isDanger ? 'var(--accent-red)' : 'var(--accent-green)'}; display:inline-flex; align-items:center; justify-content:center; font-size:1.8rem; margin-bottom:1.25rem; border:1px solid ${isDanger ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'};">
                    <i class="fa-solid ${isDanger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i>
                </div>
                <h3 style="font-size:1.25rem; font-weight:700; margin-bottom:0.6rem; color:#fff;">${title}</h3>
                <p style="font-size:0.9rem; color:var(--text-secondary); max-width:480px; margin:0 auto 2rem auto; line-height:1.5;">${message}</p>
                
                <div style="display:flex; justify-content:center; gap:1rem;">
                    <button class="btn btn-secondary" style="padding:0.75rem 1.5rem;" onclick="closeModal()">Cancel</button>
                    <button class="btn ${isDanger ? 'btn-danger-confirm' : 'btn-primary'}" style="padding:0.75rem 1.75rem;" id="confirm-action-btn">
                        Confirm Action
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('confirm-action-btn').onclick = async () => {
            closeModal();
            await onConfirm();
        };

        modal.classList.add('active');
    }

    
    // ==========================================
    // --- DYNAMIC CREATION & BACKUP CONTROLLERS ---
    // ==========================================

    
    async function syncDockgeContainers() {
        showToast('Scanning and pulling containers from Dockge & Docker host...', 'info', 2500);
        try {
            const res = await fetch('/api/homelab/dockge/sync', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || `Discovered ${data.count} containers!`, 'success', 4000);
                loadScripts(true);
            } else {
                showToast(data.error || 'Sync failed', 'error');
            }
        } catch(e) {
            showToast('Error syncing with Dockge', 'error');
        }
    }

    function openAddScriptModal() {
        document.getElementById('modal-title').innerText = 'Add Custom Automation Script';
        document.getElementById('modal-body').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.15rem;">
                <p style="font-size:0.85rem; color:var(--text-secondary);">Register a new Python automation script. The file is created and placed in your dashboard ready to run and schedule.</p>
                <div class="form-group">
                    <label>Script Name:</label>
                    <input type="text" id="new-script-name" class="form-control" placeholder="e.g. Database Backup Runner">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Category:</label>
                        <select id="new-script-category" class="form-control">
                            <option value="Maintenance">Maintenance</option>
                            <option value="Backups">Backups</option>
                            <option value="Custom Scripts" selected>Custom Scripts</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Crontab Schedule (Optional):</label>
                        <input type="text" id="new-script-cron" class="form-control" placeholder="e.g. 0 3 * * *">
                    </div>
                </div>
                <div class="form-group">
                    <label>Description:</label>
                    <input type="text" id="new-script-desc" class="form-control" placeholder="Brief description of script...">
                </div>
                <div class="form-group">
                    <label>Python Code:</label>
                    <textarea id="new-script-code" class="form-control" style="height:170px; font-family:'JetBrains Mono', monospace; font-size:0.85rem; line-height:1.45;">#!/usr/bin/env python3
import time
from datetime import datetime

def main():
    print(f"[{datetime.now()}] Starting automation...")
    time.sleep(1)
    print("Script completed successfully.")

if __name__ == "__main__":
    main()
</textarea>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitCreateScript()"><i class="fa-solid fa-plus"></i> Save & Register Script</button>
                </div>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
    }

    async function submitCreateScript() {
        const name = document.getElementById('new-script-name').value.trim();
        const category = document.getElementById('new-script-category').value.trim();
        const desc = document.getElementById('new-script-desc').value.trim();
        const schedule = document.getElementById('new-script-cron').value.trim();
        const code = document.getElementById('new-script-code').value.trim();

        if (!name) {
            showToast('Please enter a script name', 'error');
            return;
        }

        try {
            const res = await fetch('/api/scripts/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, category, desc, schedule, code })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message, 'success');
                closeModal();
                loadScripts(true);
            } else {
                showToast(data.error || 'Failed to create script', 'error');
            }
        } catch(e) {
            showToast('Error creating script', 'error');
        }
    }

    function openAddContainerModal() {
        document.getElementById('modal-title').innerText = 'Add Docker Homelab Container';
        document.getElementById('modal-body').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.15rem;">
                <p style="font-size:0.85rem; color:var(--text-secondary);">Add a Docker container card to manage its runtime, restart container, and open its web interface directly from the dashboard.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Display Name:</label>
                        <input type="text" id="new-c-name" class="form-control" placeholder="e.g. Nextcloud Hub">
                    </div>
                    <div class="form-group">
                        <label>Docker Container Name:</label>
                        <input type="text" id="new-c-container" class="form-control" placeholder="e.g. nextcloud">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Service Port:</label>
                        <input type="number" id="new-c-port" class="form-control" placeholder="e.g. 8088">
                    </div>
                    <div class="form-group">
                        <label>Protocol:</label>
                        <select id="new-c-proto" class="form-control">
                            <option value="http" selected>HTTP</option>
                            <option value="https">HTTPS</option>
                            <option value="tcp">TCP</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Description:</label>
                    <input type="text" id="new-c-desc" class="form-control" placeholder="e.g. Cloud storage and file sharing server">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitCreateContainer()"><i class="fa-solid fa-plus"></i> Add Container</button>
                </div>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
    }

    async function submitCreateContainer() {
        const name = document.getElementById('new-c-name').value.trim();
        const container = document.getElementById('new-c-container').value.trim();
        const port = document.getElementById('new-c-port').value.trim();
        const protocol = document.getElementById('new-c-proto').value.trim();
        const desc = document.getElementById('new-c-desc').value.trim();

        if (!name || !port) {
            showToast('Service Name and Port are required', 'error');
            return;
        }

        try {
            const res = await fetch('/api/homelab/service/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, container, port, protocol, desc })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message, 'success');
                closeModal();
                loadScripts(true);
            } else {
                showToast(data.error || 'Failed to add container', 'error');
            }
        } catch(e) {
            showToast('Error registering container', 'error');
        }
    }

    function openAddSystemdModal() {
        document.getElementById('modal-title').innerText = 'Add Core Systemd Daemon / Service';
        document.getElementById('modal-body').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.15rem;">
                <p style="font-size:0.85rem; color:var(--text-secondary);">Register a Linux systemd service unit to monitor status, start/stop/restart, and open service ports.</p>
                <div class="form-row">
                    <div class="form-group">
                        <label>Display Name:</label>
                        <input type="text" id="new-s-name" class="form-control" placeholder="e.g. Nginx Web Server">
                    </div>
                    <div class="form-group">
                        <label>Systemd Unit Name:</label>
                        <input type="text" id="new-s-unit" class="form-control" placeholder="e.g. nginx.service">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Service Port:</label>
                        <input type="number" id="new-s-port" class="form-control" placeholder="e.g. 80">
                    </div>
                    <div class="form-group">
                        <label>Protocol:</label>
                        <select id="new-s-proto" class="form-control">
                            <option value="http" selected>HTTP</option>
                            <option value="https">HTTPS</option>
                            <option value="tcp">TCP</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Description:</label>
                    <input type="text" id="new-s-desc" class="form-control" placeholder="e.g. Web proxy and HTTP server daemon">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitCreateSystemd()"><i class="fa-solid fa-plus"></i> Add Systemd Service</button>
                </div>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
    }

    async function submitCreateSystemd() {
        const name = document.getElementById('new-s-name').value.trim();
        const unit = document.getElementById('new-s-unit').value.trim();
        const port = document.getElementById('new-s-port').value.trim();
        const protocol = document.getElementById('new-s-proto').value.trim();
        const desc = document.getElementById('new-s-desc').value.trim();

        if (!name || !unit) {
            showToast('Service Name and Systemd Unit are required', 'error');
            return;
        }

        try {
            const res = await fetch('/api/homelab/systemd/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, unit, port, protocol, desc })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message, 'success');
                closeModal();
                loadScripts(true);
            } else {
                showToast(data.error || 'Failed to add systemd service', 'error');
            }
        } catch(e) {
            showToast('Error registering systemd service', 'error');
        }
    }

    async function loadDockgeSettingsStatus() {
        try {
            const res = await fetch('/api/homelab/dockge/status');
            const data = await res.json();
            const urlEl = document.getElementById('dockge-current-url');
            const pillEl = document.getElementById('dockge-status-pill');
            const btnToggle = document.getElementById('btn-toggle-dockge');

            if (urlEl) urlEl.innerText = data.url;
            if (pillEl) {
                if (data.connected && data.is_live) {
                    pillEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Connected';
                    pillEl.style.color = 'var(--accent-green)';
                    pillEl.style.background = 'rgba(16, 185, 129, 0.15)';
                    pillEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                } else if (data.connected) {
                    pillEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Offline';
                    pillEl.style.color = '#f59e0b';
                    pillEl.style.background = 'rgba(245, 158, 11, 0.15)';
                    pillEl.style.borderColor = 'rgba(245, 158, 11, 0.35)';
                } else {
                    pillEl.innerHTML = '<i class="fa-solid fa-ban"></i> Disconnected';
                    pillEl.style.color = 'var(--text-secondary)';
                    pillEl.style.background = 'rgba(107, 114, 128, 0.1)';
                    pillEl.style.borderColor = 'var(--border-color)';
                }
            }
            if (btnToggle) {
                btnToggle.innerHTML = data.connected ? '<i class="fa-solid fa-power-off"></i> Disconnect' : '<i class="fa-solid fa-link"></i> Connect';
            }
        } catch(e) {}
    }

    async function toggleDockgeConnection() {
        try {
            const stRes = await fetch('/api/homelab/dockge/status');
            const st = await stRes.json();

            if (st.connected) {
                showConfirm(
                    "Disconnect Dockge Manager",
                    `Are you sure you want to disconnect from the Dockge Compose visual orchestrator at ${st.url}?`,
                    async () => {
                        try {
                            const res = await fetch('/api/homelab/dockge/connect', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ url: st.url, connected: false })
                            });
                            const data = await res.json();
                            showToast(data.message || "Dockge disconnected", 'info');
                            loadDockgeSettingsStatus();
                        } catch(e) {
                            showToast('Error disconnecting Dockge', 'error');
                        }
                    }
                );
            } else {
                const res = await fetch('/api/homelab/dockge/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: st.url, connected: true })
                });
                const data = await res.json();
                showToast(data.message || "Dockge connected", 'success');
                loadDockgeSettingsStatus();
            }
        } catch(e) {
            showToast('Error updating Dockge connection', 'error');
        }
    }

    function openConnectDockgeModal() {
        document.getElementById('modal-title').innerText = 'Configure Dockge Manager URL';
        document.getElementById('modal-body').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <p style="font-size:0.85rem; color:var(--text-secondary);">Set the HTTP endpoint URL of your Dockge Compose web orchestrator.</p>
                <div class="form-group">
                    <label>Dockge Endpoint URL:</label>
                    <input type="text" id="dockge-url-setting-input" class="form-control" value="http://${window.location.hostname || "localhost"}:5001" placeholder="http://${window.location.hostname || "localhost"}:5001">
                </div>
                <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="submitConnectDockge()"><i class="fa-solid fa-link"></i> Save URL</button>
                </div>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
        fetch('/api/homelab/dockge/status').then(r => r.json()).then(d => {
            if (d.url) document.getElementById('dockge-url-setting-input').value = d.url;
        });
    }

    async function submitConnectDockge() {
        const url = document.getElementById('dockge-url-setting-input').value.trim();
        if (!url) {
            showToast('Please enter a valid URL', 'error');
            return;
        }
        try {
            const res = await fetch('/api/homelab/dockge/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url, connected: true })
            });
            const data = await res.json();
            showToast(data.message, 'success');
            closeModal();
            loadDockgeSettingsStatus();
        } catch(e) {
            showToast('Error saving Dockge URL', 'error');
        }
    }

    function triggerFullBackup() {
        showConfirm(
            'Create Full Application & System Backup',
            'Take a complete timestamped .tar.gz archive copy of dashboard, configurations, and crontab rules into the configured backups directory?',
            async () => {
                showToast('Creating full backup archive...', 'info', 3500);
                try {
                    const res = await fetch('/api/system/backup', { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        showToast(data.message, 'success', 5000);
                    } else {
                        showToast(data.error || 'Backup failed', 'error');
                    }
                } catch(e) {
                    showToast('Error executing backup', 'error');
                }
            }
        );
    }

    async function openRevertBackupModal() {
        document.getElementById('modal-title').innerText = 'Revert to Backup Archive Snapshot';
        document.getElementById('modal-body').innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Scanning available backups in fast storage...</div>`;
        document.getElementById('viewer-modal').classList.add('active');

        try {
            const res = await fetch('/api/system/backups');
            const backups = await res.json();

            if (!backups.length) {
                document.getElementById('modal-body').innerHTML = `
                    <div style="text-align:center; padding:2rem;">
                        <p style="color:var(--text-secondary); margin-bottom:1.5rem;">No backup archives found in the backups directory.</p>
                        <button class="btn btn-primary" onclick="triggerFullBackup(); closeModal();"><i class="fa-solid fa-box-archive"></i> Create First Backup</button>
                    </div>
                `;
                return;
            }

            document.getElementById('modal-body').innerHTML = `
                <div style="margin-bottom:1rem; font-size:0.85rem; color:var(--text-secondary);">
                    Select a snapshot to revert dashboard code and scripts to that exact version. A safety snapshot is automatically created prior to restoration.
                </div>
                <div style="display:flex; flex-direction:column; gap:0.65rem; max-height:420px; overflow-y:auto; padding-right:0.25rem;">
                    ${backups.map(b => `
                        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:12px; padding:0.85rem 1.15rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem;">
                            <div>
                                <div style="font-weight:700; color:#fff; font-size:0.92rem; display:flex; align-items:center; gap:0.5rem;">
                                    <i class="fa-solid fa-file-zipper" style="color:var(--accent-cyan);"></i>
                                    ${b.filename}
                                </div>
                                <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:0.2rem; display:flex; gap:0.8rem;">
                                    <span><i class="fa-solid fa-clock"></i> ${b.modified}</span>
                                    <span><i class="fa-solid fa-hard-drive"></i> ${b.size}</span>
                                </div>
                            </div>
                            <button class="btn btn-secondary" style="padding:0.4rem 0.85rem; font-size:0.8rem;" onclick="submitRestoreBackup('${b.filename}')">
                                <i class="fa-solid fa-rotate-left" style="color:var(--accent-green);"></i> Restore Snapshot
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch(e) {
            document.getElementById('modal-body').innerHTML = `<div style="color:var(--accent-red); padding:1rem;">Error reading backups directory.</div>`;
        }
    }

    function submitRestoreBackup(filename) {
        showConfirm(
            `Restore Backup: ${filename}`,
            `Are you sure you want to REVERT and RESTORE all files from archive '${filename}'? Current state will be safely snapshotted first.`,
            async () => {
                showToast(`Restoring backup archive '${filename}'...`, 'info', 4000);
                try {
                    const res = await fetch('/api/system/backup/restore', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        showToast(data.message, 'success', 5000);
                        closeModal();
                        setTimeout(() => location.reload(), 1500);
                    } else {
                        showToast(data.error || 'Restore failed', 'error');
                    }
                } catch(e) {
                    showToast('Error restoring backup archive', 'error');
                }
            },
            true
        );
    }

    const DASHBOARD_THEMES = [
        {
            id: 'apple',
            name: 'Apple Cupertino',
            desc: 'macOS frosted glassmorphism, SF Pro typography, and Cupertino Action Blue',
            icon: 'fa-apple',
            bg: '#000000',
            card: 'rgba(28, 28, 30, 0.72)',
            accent: '#2997ff',
            glow: '#0071e3'
        },
        {
            id: 'linear',
            name: 'Linear Software Craft',
            desc: 'Obsidian #010102 canvas with signature lavender #5E6AD2 and hairline borders',
            icon: 'fa-layer-group',
            bg: '#010102',
            card: '#0f1011',
            accent: '#5e6ad2',
            glow: '#828fff'
        },
        {
            id: 'vercel',
            name: 'Vercel Monochrome',
            desc: 'High-contrast monochrome geometric aesthetic with strict borders',
            icon: 'fa-play',
            bg: '#000000',
            card: '#0a0a0a',
            accent: '#ffffff',
            glow: '#ffffff'
        },
        {
            id: 'monochrome',
            name: 'Obsidian Noir',
            desc: 'Ultra-deep obsidian black with pure white & silver glass accents',
            icon: 'fa-moon',
            bg: '#09090b',
            card: '#121216',
            accent: '#ffffff',
            glow: '#71717a'
        },
        {
            id: 'cyberpunk',
            name: 'Cyberpunk Neon',
            desc: 'Deep indigo midnight with electric violet & cyan glow',
            icon: 'fa-bolt',
            bg: '#080918',
            card: '#10142a',
            accent: '#8b5cf6',
            glow: '#06b6d4'
        },
        {
            id: 'emerald',
            name: 'Emerald Matrix',
            desc: 'Deep obsidian forest with vibrant mint & lime highlights',
            icon: 'fa-shield-halved',
            bg: '#02140d',
            card: '#061e14',
            accent: '#10b981',
            glow: '#34d399'
        },
        {
            id: 'azure',
            name: 'Oceanic Azure',
            desc: 'Deep sea navy abyss with electric ice-blue & cobalt',
            icon: 'fa-water',
            bg: '#031020',
            card: '#081a30',
            accent: '#0ea5e9',
            glow: '#38bdf8'
        },
        {
            id: 'solar',
            name: 'Solar Crimson',
            desc: 'Dark ember charcoal with golden amber & flame accents',
            icon: 'fa-fire',
            bg: '#140704',
            card: '#220e0a',
            accent: '#f59e0b',
            glow: '#ef4444'
        },
        {
            id: 'sakura',
            name: 'Tokyo Sakura',
            desc: 'Velvet plum purple with magenta & pastel lavender glow',
            icon: 'fa-wand-magic-sparkles',
            bg: '#120616',
            card: '#1c0c28',
            accent: '#ec4899',
            glow: '#c084fc'
        }
    ];

    const BG_SHADERS = [
        { id: 'silk', name: 'Silk Waves', desc: 'Flowing satin wave simulation (Default)', icon: 'fa-wind', color: '#00f2fe' },
        { id: 'floating_lines', name: 'Floating Lines', desc: 'Smooth geometric line oscillations', icon: 'fa-wave-square', color: '#a855f7' },
        { id: 'molten_metal', name: 'Molten Metal', desc: 'Liquid metallic chromatic refraction', icon: 'fa-fire-flame-curved', color: '#ec4899' },
        { id: 'plasma', name: 'Plasma Flow', desc: 'Volumetric glowing nebula particles', icon: 'fa-sun', color: '#f59e0b' },
        { id: 'prismatic_burst', name: 'Prismatic Ray', desc: '3D chromatic ray burst illumination', icon: 'fa-burst', color: '#10b981' },
        { id: 'none', name: 'Minimal Dark', desc: 'Plain dark background (GPU disabled)', icon: 'fa-ban', color: '#a1a1aa' }
    ];

    function changeTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
        localStorage.setItem('dashboard_theme', themeName);
        updateThemeUIState();
        showToast(`Applied Theme: ${themeName.toUpperCase()}`, 'info', 2000);
    }

    function updateThemeUIState() {
        const currentTheme = localStorage.getItem('dashboard_theme') || 'apple';
        const currentShader = localStorage.getItem('bg_shader') || 'none';
        
        const found = DASHBOARD_THEMES.find(t => t.id === currentTheme) || DASHBOARD_THEMES[0];
        const headerPill = document.getElementById('header-theme-name');
        if (headerPill) {
            headerPill.innerText = `Theme: ${found.name.split(' ')[0]}`;
        }

        // Update all theme cards in DOM
        document.querySelectorAll('.theme-studio-card').forEach(el => {
            const id = el.dataset.themeId;
            const targetTheme = DASHBOARD_THEMES.find(t => t.id === id) || found;
            if (id === currentTheme) {
                el.style.borderColor = targetTheme.accent;
                el.style.boxShadow = `0 0 25px ${targetTheme.accent}33`;
                const badge = el.querySelector('.theme-status-tag');
                if (badge) {
                    badge.innerHTML = `<i class="fa-solid fa-check"></i> Active`;
                    badge.style.background = `${targetTheme.accent}25`;
                    badge.style.color = targetTheme.accent;
                    badge.style.borderColor = targetTheme.accent;
                }
            } else {
                el.style.borderColor = 'var(--border-color)';
                el.style.boxShadow = 'none';
                const badge = el.querySelector('.theme-status-tag');
                if (badge) {
                    badge.innerText = 'Select';
                    badge.style.background = 'rgba(255,255,255,0.05)';
                    badge.style.color = 'var(--text-secondary)';
                    badge.style.borderColor = 'transparent';
                }
            }
        });

        // Update all shader cards in DOM
        document.querySelectorAll('.shader-studio-card').forEach(el => {
            const id = el.dataset.shaderId;
            if (id === currentShader) {
                el.style.borderColor = 'var(--accent-cyan)';
                el.style.boxShadow = `0 0 20px rgba(6, 182, 212, 0.25)`;
                const badge = el.querySelector('.shader-status-tag');
                if (badge) {
                    badge.innerHTML = `<i class="fa-solid fa-check"></i> Active`;
                    badge.style.background = 'rgba(6, 182, 212, 0.2)';
                    badge.style.color = 'var(--accent-cyan)';
                    badge.style.borderColor = 'var(--accent-cyan)';
                }
            } else {
                el.style.borderColor = 'var(--border-color)';
                el.style.boxShadow = 'none';
                const badge = el.querySelector('.shader-status-tag');
                if (badge) {
                    badge.innerText = 'Select';
                    badge.style.background = 'rgba(255,255,255,0.05)';
                    badge.style.color = 'var(--text-secondary)';
                    badge.style.borderColor = 'transparent';
                }
            }
        });
    }

    function renderThemePaletteCardsHTML() {
        const currentTheme = localStorage.getItem('dashboard_theme') || 'apple';
        return DASHBOARD_THEMES.map(t => {
            const isActive = t.id === currentTheme;
            const iconClass = t.icon.includes('apple') ? 'fa-brands fa-apple' : `fa-solid ${t.icon}`;
            return `
                <div class="theme-studio-card" data-theme-id="${t.id}" onclick="changeTheme('${t.id}')" style="background: rgba(18, 18, 24, 0.75); backdrop-filter: blur(14px); border: 1.5px solid ${isActive ? t.accent : 'var(--border-color)'}; border-radius: 14px; padding: 1.1rem; cursor: pointer; transition: all 0.25s ease; display: flex; flex-direction: column; gap: 0.75rem; ${isActive ? `box-shadow: 0 0 25px ${t.accent}33;` : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.95rem; color: #fff;">
                            <i class="${iconClass}" style="color: ${t.accent};"></i>
                            ${t.name}
                        </div>
                        <span class="theme-status-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 12px; border: 1px solid ${isActive ? t.accent : 'transparent'}; background: ${isActive ? `${t.accent}25` : 'rgba(255,255,255,0.05)'}; color: ${isActive ? t.accent : 'var(--text-secondary)'}; font-weight: 700;">
                            ${isActive ? '<i class="fa-solid fa-check"></i> Active' : 'Select'}
                        </span>
                    </div>

                    <!-- 4-Color Swatch Preview Bar -->
                    <div style="display: flex; height: 16px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15);">
                        <div style="flex: 2; background: ${t.bg};" title="Background: ${t.bg}"></div>
                        <div style="flex: 2; background: ${t.card};" title="Card Surface: ${t.card}"></div>
                        <div style="flex: 1.5; background: ${t.accent};" title="Primary Accent: ${t.accent}"></div>
                        <div style="flex: 1.5; background: ${t.glow};" title="Glow Highlight: ${t.glow}"></div>
                    </div>

                    <p style="font-size: 0.76rem; color: var(--text-secondary); line-height: 1.35; margin: 0;">
                        ${t.desc}
                    </p>
                </div>
            `;
        }).join('');
    }

    function renderBgShaderCardsHTML() {
        const currentShader = localStorage.getItem('bg_shader') || 'none';
        return BG_SHADERS.map(s => {
            const isActive = s.id === currentShader;
            return `
                <div class="shader-studio-card" data-shader-id="${s.id}" onclick="setBgShader('${s.id}'); updateThemeUIState();" style="background: rgba(18, 18, 24, 0.75); backdrop-filter: blur(14px); border: 1.5px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-color)'}; border-radius: 14px; padding: 1.1rem; cursor: pointer; transition: all 0.25s ease; display: flex; flex-direction: column; gap: 0.6rem; ${isActive ? 'box-shadow: 0 0 20px rgba(6, 182, 212, 0.25);' : ''}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.95rem; color: #fff;">
                            <i class="fa-solid ${s.icon}" style="color: ${s.color};"></i>
                            ${s.name}
                        </div>
                        <span class="shader-status-tag" style="font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 12px; border: 1px solid ${isActive ? 'var(--accent-cyan)' : 'transparent'}; background: ${isActive ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.05)'}; color: ${isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)'}; font-weight: 700;">
                            ${isActive ? '<i class="fa-solid fa-check"></i> Active' : 'Select'}
                        </span>
                    </div>
                    <p style="font-size: 0.76rem; color: var(--text-secondary); line-height: 1.35; margin: 0;">
                        ${s.desc}
                    </p>
                </div>
            `;
        }).join('');
    }

    function renderSettingsThemeStudio() {
        const themeGrid = document.getElementById('settings-theme-palette-grid');
        if (themeGrid) {
            themeGrid.innerHTML = renderThemePaletteCardsHTML();
        }
        const shaderGrid = document.getElementById('settings-shader-grid');
        if (shaderGrid) {
            shaderGrid.innerHTML = renderBgShaderCardsHTML();
        }
    }

    function openThemeModal() {
        document.getElementById('modal-title').innerText = `🎨 Theme & Visual Aesthetics Studio`;
        document.getElementById('modal-body').innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.5rem; max-height: 75vh; overflow-y: auto; padding-right: 0.25rem;">
                <div>
                    <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fa-solid fa-palette" style="color: var(--accent-cyan);"></i> Dashboard Theme Palette
                    </h4>
                    <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">
                        Select a glassmorphic palette. Changes apply immediately and sync across all tabs.
                    </p>
                    <div class="theme-palette-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.85rem;">
                        ${renderThemePaletteCardsHTML()}
                    </div>
                </div>

                <hr style="border: none; border-top: 1px solid var(--border-color); margin: 0.25rem 0;">

                <div>
                    <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--accent-cyan);"></i> Dynamic WebGL Background FX
                    </h4>
                    <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 1rem;">
                        GPU-accelerated background shaders or Minimal Dark mode.
                    </p>
                    <div class="theme-shader-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.85rem;">
                        ${renderBgShaderCardsHTML()}
                    </div>
                </div>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
    }

    function openGearSettingsModal() {
        openThemeModal();
    }

    let currentSearchQuery = '';

    function clearGlobalSearch() {
        const input = document.getElementById('global-search-input');
        if (input) {
            input.value = '';
            filterCardsInstant('');
            input.focus();
        }
    }

    function filterCardsInstant(query) {
        currentSearchQuery = (query || '').toLowerCase().trim();
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) clearBtn.style.display = currentSearchQuery ? 'block' : 'none';
        
        // If user starts typing while on any special tab, auto-switch to All Scripts
        if (currentSearchQuery && currentCategory !== 'all' && currentCategory !== 'Maintenance' && currentCategory !== 'Backups' && currentCategory !== 'Services & Dockge') {
            switchCategory('all');
        }

        const cards = document.querySelectorAll('#scripts-grid .card, #scripts-grid .service-card');
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            const searchData = (card.getAttribute('data-search') || '').toLowerCase();
            if (!currentSearchQuery || text.includes(currentSearchQuery) || searchData.includes(currentSearchQuery)) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });

        // Hide/show section containers if they have matching cards
        document.querySelectorAll('#scripts-grid .grid-section').forEach(sec => {
            if (!currentSearchQuery) {
                sec.style.display = '';
            } else {
                const visible = Array.from(sec.querySelectorAll('.card, .service-card')).some(c => c.style.display !== 'none');
                sec.style.display = visible ? '' : 'none';
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        const isSearchShortcut = e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k');
        if (isSearchShortcut && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            const searchInput = document.getElementById('global-search-input');
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
        }
    });

    function openSystemControlModal() {
        document.getElementById('modal-title').innerText = `⚙️ System Operations & Server Control`;
        document.getElementById('modal-body').innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem; padding: 0.5rem;">
                <div class="system-control-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem;">
                    <div style="background: rgba(255, 255, 255, 0.04); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                <i class="fa-solid fa-arrows-rotate" style="color: var(--accent-cyan); font-size: 1.2rem;"></i>
                                <h4 style="font-size: 1rem; font-weight: 700; color: #fff;">System Update</h4>
                            </div>
                            <p style="font-size: 0.82rem; color: var(--text-secondary);">Upgrade Linux packages, python apps, and Pi-hole rules.</p>
                        </div>
                        <button class="btn btn-update-all" onclick="triggerUpdateAll(); closeModal();" id="btn-update-all" style="width: 100%; justify-content: center;">
                            <i class="fa-solid fa-arrows-rotate"></i> Run System Update
                        </button>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.04); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                <i class="fa-solid fa-box-archive" style="color: var(--accent-cyan); font-size: 1.2rem;"></i>
                                <h4 style="font-size: 1rem; font-weight: 700; color: #fff;">Archive Backup</h4>
                            </div>
                            <p style="font-size: 0.82rem; color: var(--text-secondary);">Backup configs & scripts to the backups directory.</p>
                        </div>
                        <button class="btn btn-secondary" onclick="triggerBackup(); closeModal();" style="width: 100%; justify-content: center;">
                            <i class="fa-solid fa-box-archive"></i> Create Backup
                        </button>
                    </div>

                    <div style="background: rgba(255, 255, 255, 0.04); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                <i class="fa-solid fa-bell" style="color: var(--accent-amber); font-size: 1.2rem;"></i>
                                <h4 style="font-size: 1rem; font-weight: 700; color: #fff;">Phone Alerts</h4>
                            </div>
                            <p style="font-size: 0.82rem; color: var(--text-secondary);">Configure Discord webhooks and Telegram bot alerts.</p>
                        </div>
                        <button class="btn btn-secondary" onclick="openAlertsModal();" style="width: 100%; justify-content: center;">
                            <i class="fa-solid fa-bell"></i> Configure Alerts
                        </button>
                    </div>

                    <div style="background: rgba(239, 68, 68, 0.08); padding: 1.25rem; border-radius: 16px; border: 1px solid rgba(239, 68, 68, 0.3); display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                <i class="fa-solid fa-power-off" style="color: var(--accent-red); font-size: 1.2rem;"></i>
                                <h4 style="font-size: 1rem; font-weight: 700; color: #fff;">Reboot Server</h4>
                            </div>
                            <p style="font-size: 0.82rem; color: var(--text-secondary);">Perform emergency system restart of Linux server.</p>
                        </div>
                        <button class="btn btn-secondary" onclick="triggerReboot(); closeModal();" style="width: 100%; justify-content: center; border-color: rgba(239, 68, 68, 0.4); color: var(--accent-red);">
                            <i class="fa-solid fa-power-off"></i> Reboot Server
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
    }

    const savedTheme = localStorage.getItem('dashboard_theme') || 'apple';
    document.documentElement.setAttribute('data-theme', savedTheme);

    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    let latestDnsData = {};

    function openPiholeBlocked(e) {
        if (e) e.stopPropagation();
        openDnsChooserModal('blocked');
    }

    function openDnsService(service, target = 'dashboard') {
        const host = window.location.hostname || 'localhost';
        if (service === 'pihole') {
            if (target === 'blocked') {
                window.open(`http://${host}/admin/queries?upstream=blocklist`, '_blank');
            } else if (target === 'queries') {
                window.open(`http://${host}/admin/queries`, '_blank');
            } else {
                window.open(`http://${host}/admin/`, '_blank');
            }
        } else if (service === 'adguard') {
            if (target === 'logs' || target === 'blocked') {
                window.open(`http://${host}:8083/#logs`, '_blank');
            } else {
                window.open(`http://${host}:8083`, '_blank');
            }
        }
        closeModal();
    }

    function openDnsChooserModal(initialMode = 'total') {
        const modal = document.getElementById('viewer-modal');
        renderDnsModalContent(initialMode);
        modal.classList.add('active');
    }

    function renderDnsModalContent(mode = 'total') {
        const isBlocked = (mode === 'blocked');
        
        document.getElementById('modal-title').innerHTML = isBlocked 
            ? `<i class="fa-solid fa-shield-virus" style="color:var(--accent-green)"></i> Blocked Threats & DNS Sinkholes`
            : `<i class="fa-solid fa-shield-halved" style="color:var(--accent-cyan)"></i> DNS Network Protection Consoles`;
        
        const piTotal = latestDnsData.pihole_total || '0';
        const piBlocked = latestDnsData.pihole_blocked || '0';
        const adTotal = latestDnsData.adguard_total || '0';
        const adBlocked = latestDnsData.adguard_blocked || '0';
        const combTotal = latestDnsData.combined_total || '0';
        const combBlocked = latestDnsData.combined_blocked || '0';
        const blockRate = latestDnsData.block_percent || '0%';

        function formatSavings(mb) {
            const val = parseFloat(mb);
            if (isNaN(val) || val <= 0) return '0 MB';
            if (val >= 1024) return (val / 1024).toFixed(2) + ' GB';
            return val.toFixed(1) + ' MB';
        }

        const savingsCard = isBlocked ? `
                <div style="background: linear-gradient(135deg, rgba(16,185,129,0.10), rgba(6,182,212,0.04)); border: 1px solid rgba(16,185,129,0.28); border-radius: 16px; padding: 1rem 1.15rem; display: flex; flex-direction: column; gap: 0.65rem;">
                    <div style="display: flex; align-items: center; gap: 0.7rem;">
                        <div class="icon-box" style="width: 36px; height: 36px; min-width: 36px; font-size: 1rem; background: rgba(16,185,129,0.15); color: var(--accent-green); border-color: rgba(16,185,129,0.35);">
                            <i class="fa-solid fa-piggy-bank"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="font-size: 0.74rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;">Estimated Internet Savings (24h)</div>
                            <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">${formatSavings(latestDnsData.combined_saved_mb)} <span style="font-size: 0.82rem; color: var(--accent-green); font-weight: 600;">via ${combBlocked} blocked threats</span></div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.7rem; border-radius: 10px; border: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                            <span style="font-size: 0.75rem; color: var(--text-secondary);"><i class="fa-solid fa-shield-virus" style="color:#ef4444;"></i> Pi-hole</span>
                            <strong style="font-size: 0.95rem; color: #fff;">${formatSavings(latestDnsData.pihole_saved_mb)}</strong>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                            <span style="font-size: 0.75rem; color: var(--text-secondary);"><i class="fa-solid fa-shield-halved" style="color: var(--accent-green);"></i> AdGuard</span>
                            <strong style="font-size: 0.95rem; color: #fff;">${formatSavings(latestDnsData.adguard_saved_mb)}</strong>
                        </div>
                    </div>
                    <div style="font-size: 0.68rem; color: var(--text-secondary);"><i class="fa-solid fa-circle-info"></i> Estimate: ~300 KB per blocked request (tunable in config.py)</div>
                </div>
            ` : '';

        // Summary Banner Content
        const bannerStyle = isBlocked
            ? `background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35);`
            : `background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.3);`;
            
        const bannerTitle = isBlocked
            ? `<div style="font-size: 0.8rem; color: var(--accent-green); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;"><i class="fa-solid fa-shield-halved"></i> Active Sinkhole Defense</div>
               <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">${combBlocked} Threats Blocked <span style="font-size: 0.85rem; color: var(--accent-green); font-weight: 600;">(${blockRate} Block Rate)</span></div>`
            : `<div style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Combined 24h Telemetry</div>
               <div style="font-size: 1.15rem; font-weight: 800; color: #fff;">${combTotal} Queries <span style="font-size: 0.85rem; color: var(--accent-green); font-weight: 600;">(${combBlocked} blocked &bull; ${blockRate})</span></div>`;

        const badgePill = isBlocked
            ? `<span class="count-pill" style="background: rgba(16, 185, 129, 0.2); color: var(--accent-green); border-color: rgba(16, 185, 129, 0.4);"><i class="fa-solid fa-check"></i> Filter Active</span>`
            : `<span class="count-pill" style="background: rgba(99, 102, 241, 0.2); color: #818cf8; border-color: rgba(99, 102, 241, 0.4);">Dual Sinkhole Active</span>`;

        // Pi-hole action buttons depending on mode
        const piholeActions = isBlocked
            ? `
                <button class="btn btn-primary" onclick="openDnsService('pihole', 'blocked')" style="justify-content: center; width: 100%; font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                    <i class="fa-solid fa-shield-virus"></i> View Pi-hole Blocked List (${piBlocked})
                </button>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <button class="btn btn-secondary" onclick="openDnsService('pihole', 'queries')" style="justify-content: center; font-size: 0.78rem;">
                        <i class="fa-solid fa-list"></i> All Queries
                    </button>
                    <button class="btn btn-secondary" onclick="openDnsService('pihole', 'dashboard')" style="justify-content: center; font-size: 0.78rem;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Admin Panel
                    </button>
                </div>
            `
            : `
                <button class="btn btn-primary" onclick="openDnsService('pihole', 'queries')" style="justify-content: center; width: 100%;">
                    <i class="fa-solid fa-list"></i> View Pi-hole Queries
                </button>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <button class="btn btn-secondary" onclick="openDnsService('pihole', 'blocked')" style="justify-content: center; font-size: 0.78rem;">
                        <i class="fa-solid fa-shield-virus" style="color:var(--accent-green)"></i> Blocked List
                    </button>
                    <button class="btn btn-secondary" onclick="openDnsService('pihole', 'dashboard')" style="justify-content: center; font-size: 0.78rem;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Admin Panel
                    </button>
                </div>
            `;

        // AdGuard action buttons depending on mode
        const adguardActions = isBlocked
            ? `
                <button class="btn btn-primary" onclick="openDnsService('adguard', 'logs')" style="justify-content: center; width: 100%; font-weight: 700; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                    <i class="fa-solid fa-shield-halved"></i> View AdGuard Blocked Logs (${adBlocked})
                </button>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <button class="btn btn-secondary" onclick="openDnsService('adguard', 'dashboard')" style="justify-content: center; font-size: 0.78rem;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Console
                    </button>
                    <button class="btn btn-secondary" onclick="openDnsService('adguard', 'logs')" style="justify-content: center; font-size: 0.78rem;">
                        <i class="fa-solid fa-list-check"></i> Query Log
                    </button>
                </div>
            `
            : `
                <button class="btn btn-primary" onclick="openDnsService('adguard', 'dashboard')" style="justify-content: center; width: 100%;">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> Open AdGuard Console
                </button>
                <button class="btn btn-secondary" onclick="openDnsService('adguard', 'logs')" style="justify-content: center; width: 100%; font-size: 0.78rem;">
                    <i class="fa-solid fa-list-check"></i> View AdGuard Query Log
                </button>
            `;

        document.getElementById('modal-body').innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.15rem; padding: 0.25rem;">
                <!-- Mode Switcher Tabs -->
                <div style="display: flex; gap: 0.5rem; background: rgba(0,0,0,0.3); padding: 0.35rem; border-radius: 12px; border: 1px solid var(--border-color);">
                    <button type="button" class="btn ${!isBlocked ? 'btn-primary' : 'btn-secondary'}" onclick="renderDnsModalContent('total')" style="flex: 1; justify-content: center; font-size: 0.82rem; padding: 0.5rem 0.75rem; border-radius: 9px;">
                        <i class="fa-solid fa-globe"></i> All Queries (${combTotal})
                    </button>
                    <button type="button" class="btn ${isBlocked ? 'btn-primary' : 'btn-secondary'}" onclick="renderDnsModalContent('blocked')" style="flex: 1; justify-content: center; font-size: 0.82rem; padding: 0.5rem 0.75rem; border-radius: 9px; ${isBlocked ? 'background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-color: rgba(16, 185, 129, 0.4);' : ''}">
                        <i class="fa-solid fa-shield-virus" style="${!isBlocked ? 'color:var(--accent-green);' : ''}"></i> Blocked Threats (${combBlocked})
                    </button>
                </div>

                <!-- Combined Summary Banner -->
                <div style="${bannerStyle} border-radius: 14px; padding: 0.85rem 1.15rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                    <div>
                        ${bannerTitle}
                    </div>
                    ${badgePill}
                </div>

                <!-- One-Click Pause Protection Bar -->
                <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 14px; padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.6rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 700; color: #fff;">
                            <i class="fa-solid fa-pause-circle" style="color: var(--accent-amber);"></i> One-Click DNS Pause Protection
                        </div>
                        <div id="dns-protection-badge" style="font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: rgba(52, 211, 153, 0.15); color: var(--accent-green); border: 1px solid rgba(52, 211, 153, 0.3);">
                            <i class="fa-solid fa-circle" style="font-size: 0.5rem; vertical-align: middle;"></i> Active & Filtering
                        </div>
                    </div>
                    <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                        <button type="button" class="btn btn-secondary" onclick="pauseDnsProtection('5m')" style="flex: 1; min-width: 65px; justify-content: center; font-size: 0.75rem; padding: 0.45rem 0.5rem;">
                            <i class="fa-solid fa-clock"></i> 5m
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="pauseDnsProtection('10m')" style="flex: 1; min-width: 65px; justify-content: center; font-size: 0.75rem; padding: 0.45rem 0.5rem;">
                            <i class="fa-solid fa-clock"></i> 10m
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="pauseDnsProtection('15m')" style="flex: 1; min-width: 65px; justify-content: center; font-size: 0.75rem; padding: 0.45rem 0.5rem;">
                            <i class="fa-solid fa-clock"></i> 15m
                        </button>
                        <button type="button" class="btn btn-secondary" onclick="pauseDnsProtection('30m')" style="flex: 1; min-width: 65px; justify-content: center; font-size: 0.75rem; padding: 0.45rem 0.5rem;">
                            <i class="fa-solid fa-clock"></i> 30m
                        </button>
                        <button type="button" class="btn btn-primary" onclick="resumeDnsProtection()" style="flex: 1.2; min-width: 90px; justify-content: center; font-size: 0.75rem; padding: 0.45rem 0.6rem; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                            <i class="fa-solid fa-play"></i> Resume
                        </button>
                    </div>
                </div>

                ${savingsCard}

                <!-- Dual Services Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                    <!-- Pi-hole Card -->
                    <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <div class="icon-box" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">
                                        <i class="fa-solid fa-shield-virus"></i>
                                    </div>
                                    <div>
                                        <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0;">Pi-hole Sinkhole</h4>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Port 80 &bull; FTL Core</div>
                                    </div>
                                </div>
                                <span class="port-badge">:80</span>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.75rem; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                                <div>
                                    <div style="font-size: 0.72rem; color: var(--text-secondary);">24h Queries</div>
                                    <div style="font-size: 1.05rem; font-weight: 800; color: #818cf8;">${piTotal}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.72rem; color: var(--text-secondary);">Blocked Threats</div>
                                    <div style="font-size: 1.05rem; font-weight: 800; color: var(--accent-green);">${piBlocked}</div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            ${piholeActions}
                        </div>
                    </div>

                    <!-- AdGuard Card -->
                    <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <div class="icon-box" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-green); border-color: rgba(16, 185, 129, 0.3);">
                                        <i class="fa-solid fa-shield-halved"></i>
                                    </div>
                                    <div>
                                        <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0;">AdGuard Home</h4>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Port 8083 &bull; Primary DNS & DoH</div>
                                    </div>
                                </div>
                                <span class="port-badge">:8083</span>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.75rem; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                                <div>
                                    <div style="font-size: 0.72rem; color: var(--text-secondary);">24h Queries</div>
                                    <div style="font-size: 1.05rem; font-weight: 800; color: #818cf8;">${adTotal}</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.72rem; color: var(--text-secondary);">Blocked Threats</div>
                                    <div style="font-size: 1.05rem; font-weight: 800; color: var(--accent-green);">${adBlocked}</div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            ${adguardActions}
                        </div>
                    </div>

                    <!-- Unbound Recursive Resolver Card -->
                    <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                        <div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <div class="icon-box" style="background: rgba(6, 182, 212, 0.15); color: #06b6d4; border-color: rgba(6, 182, 212, 0.3);">
                                        <i class="fa-solid fa-network-wired"></i>
                                    </div>
                                    <div>
                                        <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 0;">Unbound DNS</h4>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Port 5335 &bull; Root Recursive & DNSSEC</div>
                                    </div>
                                </div>
                                <span class="port-badge">:5335</span>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.75rem; border-radius: 10px; border: 1px solid var(--border-color); margin-bottom: 0.5rem;">
                                <div>
                                    <div style="font-size: 0.72rem; color: var(--text-secondary);">Validation</div>
                                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--accent-cyan);"><i class="fa-solid fa-lock"></i> DNSSEC</div>
                                </div>
                                <div>
                                    <div style="font-size: 0.72rem; color: var(--text-secondary);">Resolution</div>
                                    <div style="font-size: 0.95rem; font-weight: 700; color: var(--accent-green);"><i class="fa-solid fa-check"></i> Recursive</div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <button class="btn btn-secondary" onclick="flushUnboundCache()" style="justify-content: center; width: 100%; font-size: 0.8rem;">
                                <i class="fa-solid fa-broom" style="color:var(--accent-amber);"></i> Flush Unbound Cache
                            </button>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                                <button class="btn btn-secondary" onclick="restartUnbound()" style="justify-content: center; font-size: 0.78rem;">
                                    <i class="fa-solid fa-rotate-right"></i> Restart
                                </button>
                                <button class="btn btn-secondary" onclick="openContainerLogsModal('unbound', 'Unbound DNS Resolver')" style="justify-content: center; font-size: 0.78rem;">
                                    <i class="fa-solid fa-terminal"></i> Logs
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3-Tier Sovereign DNS Chain Indicator -->
                <div style="background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border-color); border-radius: 12px; padding: 0.75rem 1rem; display: flex; align-items: center; justify-content: space-around; flex-wrap: wrap; gap: 0.5rem; font-size: 0.78rem;">
                    <span style="color:var(--text-secondary);"><i class="fa-solid fa-laptop"></i> Devices</span>
                    <i class="fa-solid fa-arrow-right" style="color:rgba(255,255,255,0.3); font-size:0.7rem;"></i>
                    <span style="color:#ef4444; font-weight:600;"><i class="fa-solid fa-shield-virus"></i> Pi-hole (:80)</span>
                    <i class="fa-solid fa-arrow-right" style="color:rgba(255,255,255,0.3); font-size:0.7rem;"></i>
                    <span style="color:#10b981; font-weight:600;"><i class="fa-solid fa-shield-halved"></i> AdGuard Home (:8083)</span>
                    <i class="fa-solid fa-arrow-right" style="color:rgba(255,255,255,0.3); font-size:0.7rem;"></i>
                    <span style="color:#06b6d4; font-weight:600;"><i class="fa-solid fa-network-wired"></i> Unbound (:5335 Recursive)</span>
                    <i class="fa-solid fa-arrow-right" style="color:rgba(255,255,255,0.3); font-size:0.7rem;"></i>
                    <span style="color:var(--accent-green); font-weight:600;"><i class="fa-solid fa-globe"></i> Root Servers</span>
                </div>
            </div>
        `;
        checkDnsProtectionStatus();
    }

    async function loadStats() {
        try {
            const res = await fetch('/api/system/stats');
            const data = await res.json();
            const dns = data.dns || {};
            latestDnsData = dns;

            document.getElementById('header-uptime').innerText = `Uptime: ${data.uptime || 'Loading...'}`;
            document.getElementById('header-active-tasks').innerText = `Active Tasks: ${data.running_count || 0}`;
            loadDockgeSettingsStatus();

            // Hardware & Telemetry Stats Bar
            const sysStatsEl = document.getElementById('sys-stats');
            if (sysStatsEl) {
                sysStatsEl.removeAttribute('aria-busy');
                sysStatsEl.innerHTML = `
                <div class="stat-pill" title="System CPU Usage & Thermal Temperature"><i class="fa-solid fa-microchip" style="color:var(--accent-amber)"></i> CPU: <strong>${data.cpu_percent || '0%'}</strong> <span style="color:#fbbf24; font-size:0.75rem;">(${data.cpu_temp || 'N/A'})</span></div>
                <div class="stat-pill" title="System RAM Usage"><i class="fa-solid fa-memory" style="color:var(--accent-cyan)"></i> RAM: <strong>${data.ram_percent || '0%'}</strong></div>
                <div class="stat-pill" title="GPU Compute Load & Temperature"><i class="fa-solid fa-gamepad" style="color:#ec4899"></i> GPU: <strong>${data.gpu_percent || '0%'}</strong> <span style="color:#f472b6; font-size:0.75rem;">(${data.gpu_temp || 'N/A'})</span></div>
                <div class="stat-pill" title="VRAM Memory Allocation"><i class="fa-solid fa-layer-group" style="color:#c084fc"></i> VRAM: <strong>${data.vram_text || data.vram_percent || '0%'}</strong></div>
                <div class="stat-pill" title="Storage Free"><i class="fa-solid fa-hard-drive"></i> ${data.disk2_percent ? 'OS Disk' : 'Disk'}: <strong>${data.disk1_percent || '0%'}</strong></div>
                ${data.disk2_percent ? `<div class="stat-pill" title="Secondary Storage Volume Free"><i class="fa-solid fa-server" style="color:var(--accent-cyan)"></i> ${data.disk2_name || 'Storage'}: <strong>${data.disk2_percent}</strong></div>` : ''}
                <div class="stat-pill clickable-pill" title="Pi-hole + AdGuard Combined Queries (Click to open DNS console)" onclick="openDnsChooserModal('total')"><i class="fa-solid fa-globe" style="color:#818cf8"></i> Total DNS: <strong>${dns.combined_total || '0'}</strong></div>
                <div class="stat-pill clickable-pill stat-pill-blocked" title="Pi-hole + AdGuard Blocked Threats (Click to open Blocked DNS console)" onclick="openDnsChooserModal('blocked')"><i class="fa-solid fa-shield-virus" style="color:var(--accent-green)"></i> Blocked: <strong>${dns.combined_blocked || '0'} (${dns.block_percent || '0%'})</strong></div>
            `;
            }

            // Dedicated DNS Shield Banner Stats (if present)
            const bannerStats = document.getElementById('dns-banner-stats');
            if (bannerStats) {
                bannerStats.innerHTML = `
                    <div class="stat-pill clickable-pill" title="Pi-hole + AdGuard Combined Queries (Click to open DNS console)" onclick="openDnsChooserModal('total')"><i class="fa-solid fa-globe" style="color:#818cf8"></i> Total DNS Queries: <strong>${dns.combined_total || '0'}</strong></div>
                    <div class="stat-pill clickable-pill stat-pill-blocked" title="Pi-hole + AdGuard Blocked Threats (Click to open Blocked DNS console)" onclick="openDnsChooserModal('blocked')"><i class="fa-solid fa-shield-virus" style="color:var(--accent-green)"></i> Blocked Threats: <strong>${dns.combined_blocked || '0'} (${dns.block_percent || '0%'})</strong></div>
                `;
            }

            const btnUpd = document.getElementById('btn-update-all');
            if (data.is_updating) {
                btnUpd.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating System...`;
                btnUpd.disabled = true;
            } else {
                btnUpd.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Update System`;
                btnUpd.disabled = false;
            }

            const btnVid = document.getElementById('btn-run-video');
            if (data.is_video_running) {
                if (btnVid) {
                    btnVid.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Rendering Video...`;
                    btnVid.disabled = true;
                }
            } else {
                if (btnVid && !videoRenderCheckTimer) {
                    btnVid.innerHTML = `<i class="fa-solid fa-play"></i> Generate & Render Video`;
                    btnVid.disabled = false;
                }
            }
        } catch (e) {}
    }

    async function openActiveTasksModal() {
        document.getElementById('modal-title').innerText = `Active Background Tasks Inspector`;
        document.getElementById('modal-body').innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-secondary);">Loading active task details...</div>`;
        document.getElementById('viewer-modal').classList.add('active');

        try {
            const res = await fetch('/api/system/active-tasks');
            const tasks = await res.json();

            if (!tasks.length) {
                document.getElementById('modal-body').innerHTML = `
                    <div style="text-align: center; padding: 2.5rem 1rem;">
                        <div style="width: 68px; height: 68px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); color: var(--accent-green); display: inline-flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 1.25rem; border: 1px solid rgba(16, 185, 129, 0.3);">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                        <h3 style="font-size: 1.3rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem;">All Systems Idle</h3>
                        <p style="color: var(--text-secondary); font-size: 0.9rem; max-width: 440px; margin: 0 auto 1.5rem auto;">No automation scripts, updates, or background renders are currently running.</p>
                        <button class="btn btn-primary" onclick="closeModal()"><i class="fa-solid fa-check"></i> Back to Dashboard</button>
                    </div>
                `;
                return;
            }

            document.getElementById('modal-body').innerHTML = `
                <div style="margin-bottom: 1.25rem; font-size:0.9rem; color:var(--text-secondary);">
                    Currently executing <strong>${tasks.length} active process(es)</strong> in background:
                </div>
                <div>
                    ${tasks.map(t => `
                        <div class="task-card-item">
                            <div style="display:flex; align-items:center; gap:0.9rem;">
                                <div class="icon-box" style="width:42px; height:42px; min-width:42px; min-height:42px; font-size:1.1rem; background:rgba(6, 182, 212, 0.15); color:var(--accent-cyan); border-color:rgba(6, 182, 212, 0.3);">
                                    <i class="fa-solid ${t.icon}"></i>
                                </div>
                                <div>
                                    <h4 style="font-size:1.05rem; font-weight:700; color:#fff;">${t.name}</h4>
                                    <div style="display:flex; gap:0.6rem; align-items:center; margin-top:0.25rem; flex-wrap:wrap;">
                                        <span class="count-pill" style="font-family:'JetBrains Mono', monospace; font-size:0.75rem;">PID: ${t.pid}</span>
                                        <span style="font-size:0.78rem; color:var(--text-secondary);"><i class="fa-solid fa-clock"></i> ${t.elapsed}</span>
                                        <span style="font-size:0.78rem; color:var(--accent-amber);"><i class="fa-solid fa-microchip"></i> ${t.cpu} CPU</span>
                                        <span style="font-size:0.78rem; color:var(--accent-cyan);"><i class="fa-solid fa-memory"></i> ${t.mem} RAM</span>
                                    </div>
                                </div>
                            </div>
                            <div style="display:flex; gap:0.5rem;">
                                <button class="btn btn-secondary" style="padding:0.45rem 0.8rem;" onclick="viewLogs('${t.name.replace(/'/g, "\\'")}', '${t.id}')">
                                    <i class="fa-solid fa-terminal"></i> Log Stream
                                </button>
                                <button class="btn btn-secondary" style="padding:0.45rem 0.8rem; color:var(--accent-red); border-color:rgba(239, 68, 68, 0.3);" onclick="terminateActiveTask('${t.name.replace(/'/g, "\\'")}', ${t.pid})">
                                    <i class="fa-solid fa-stop"></i> Terminate Task
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (e) {
            document.getElementById('modal-body').innerHTML = `<div style="color:var(--accent-red); padding:1rem;">Error fetching active tasks.</div>`;
        }
    }

    function terminateActiveTask(name, pid) {
        showConfirm(
            `Terminate Task: ${name}`,
            `Are you sure you want to stop/kill active process '${name}' (PID: ${pid})?`,
            async () => {
                try {
                    const res = await fetch(`/api/system/active-tasks/${pid}/kill`, { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        showToast(data.message, 'success');
                        openActiveTasksModal();
                        loadScripts();
                    } else {
                        showToast(data.error || 'Failed to kill process', 'error');
                    }
                } catch (e) { showToast('Error killing process', 'error'); }
            },
            true
        );
    }

    let cachedSystemdServicesData = [];

    async function loadScripts(triggerAnimation = false) {
        // 1. Fetch scripts and render IMMEDIATELY (0ms delay)
        fetch('/api/scripts')
            .then(res => res.json())
            .then(data => {
                allScriptsData = data;
                try {
                    localStorage.setItem('cached_scripts_data', JSON.stringify(data));
                } catch(e) {}
                renderContent(triggerAnimation);
            })
            .catch(() => {});

        // 2. Fetch homelab & systemd services concurrently in background
        Promise.all([
            fetch('/api/homelab/services').then(r => r.json()).catch(() => []),
            fetch('/api/system/services-status').then(r => r.json()).catch(() => [])
        ]).then(([lab, sys]) => {
            homelabServicesData = lab;
            cachedSystemdServicesData = sys;
            if (currentCategory === 'all' || currentCategory.includes('Services') || currentCategory.includes('Homelab')) {
                renderContent(false);
            }
        });
    }

    function switchCategory(cat) {
        currentCategory = cat;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isMatch = (cat === 'system-tab' && (btn.innerText.includes('System') || btn.getAttribute('onclick')?.includes('system-tab'))) ||
                            (cat === 'pipelines-tab' && (btn.innerText.includes('Pipelines') || btn.getAttribute('onclick')?.includes('pipelines-tab'))) ||
                            (cat === 'ai-tab' && (btn.innerText.includes('AI Ops') || btn.getAttribute('onclick')?.includes('ai-tab'))) ||
                            (cat === 'smart-storage-tab' && (btn.innerText.includes('SMART') || btn.getAttribute('onclick')?.includes('smart-storage-tab'))) ||
                            (cat === 'all' && btn.innerText.includes('All')) ||
                            ((cat === 'Services & Dockge' || cat === 'Homelab Services') && (btn.innerText.includes('Services') || btn.innerText.includes('Dockge') || btn.innerText.includes('Homelab'))) ||
                            (!['smart-storage-tab','system-tab','pipelines-tab','ai-tab'].includes(cat) && btn.innerText.includes(cat));
            btn.classList.toggle('active', isMatch);
        });
        renderContent(true);
    }

    function renderContent(triggerAnimation = false) {
        const grid = document.getElementById('scripts-grid');
        const historyView = document.getElementById('history-view');
        const systemView = document.getElementById('system-tab-view');
        const storageView = document.getElementById('storage-tab-view');
        const pipelinesView = document.getElementById('pipelines-tab-view');
        const aiView = document.getElementById('ai-tab-view');
        const smartStorageView = document.getElementById('smart-storage-tab-view');

        // Hide all special views initially
        [historyView, systemView, storageView, pipelinesView, aiView, smartStorageView].forEach(v => {
            if (v) v.classList.remove('active-tab');
        });

        if (currentCategory === 'smart-storage-tab') {
            grid.style.display = 'none';
            if (smartStorageView) smartStorageView.classList.add('active-tab');
            loadSmartStorage();
            return;
        }

        if (currentCategory === 'pipelines-tab') {
            grid.style.display = 'none';
            if (pipelinesView) pipelinesView.classList.add('active-tab');
            loadPipelines();
            loadPipelineHistory();
            return;
        }

        if (currentCategory === 'ai-tab') {
            grid.style.display = 'none';
            if (aiView) aiView.classList.add('active-tab');
            loadAiOpsStatus();
            return;
        }

        if (currentCategory === 'storage-tab') {
            grid.style.display = 'none';
            if (storageView) storageView.classList.add('active-tab');
            loadStorageExplorer('');
            return;
        }

        if (currentCategory === 'system-tab' || currentCategory === 'System & Settings') {
            grid.style.display = 'none';
            if (systemView) systemView.classList.add('active-tab');
            renderSettingsThemeStudio();
            updateThemeUIState();
            loadTelemetryChart();
            loadDnsHistoryChart();
            loadNetworkSecurity();
            loadWatchdogStatus();
            return;
        }

        if (currentCategory === 'Execution History') {
            grid.style.display = 'none';
            if (triggerAnimation && historyView) {
                historyView.style.animation = 'none';
                historyView.offsetHeight;
                historyView.style.animation = 'fadeInUp 0.35s ease-out';
            }
            if (historyView) historyView.classList.add('active-tab');
            loadExecutionHistoryView();
            return;
        }

        grid.style.display = 'grid';

        if (triggerAnimation) {
            grid.style.animation = 'none';
            grid.offsetHeight;
            grid.style.animation = 'fadeInUp 0.35s ease-out';
        }

        if (currentCategory === 'all') {
            const scriptsHtml = allScriptsData.map(renderScriptCardHTML).join('');
            const servicesHtml = homelabServicesData.map(renderServiceCardHTML).join('');
            const systemdHtml = renderSystemdServicesHTML(cachedSystemdServicesData);

            grid.innerHTML = `
                <div class="grid-section" id="section-scripts">
                    <div class="grid-section-header">
                        <h3><i class="fa-solid fa-layer-group" style="color: var(--accent-cyan);"></i> Automation & Maintenance Scripts</h3>
                        <div class="section-header-actions">
                            <button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="openAddScriptModal()"><i class="fa-solid fa-plus"></i> Add Script</button>
                            <span class="count-pill" style="font-size: 0.8rem;">${allScriptsData.length} scripts</span>
                        </div>
                    </div>
                    <div class="cards-subgrid" id="scripts-list-grid">
                        ${scriptsHtml}
                    </div>
                </div>

                <div class="grid-section" id="section-dockge">
                    <div class="grid-section-header">
                        <h3><i class="fa-solid fa-cubes" style="color: #3b82f6;"></i> Dockge Homelab Containers</h3>
                        <div class="section-header-actions">
                            <button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="openAddContainerModal()"><i class="fa-solid fa-plus"></i> Add Container</button>
                            <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="syncDockgeContainers()"><i class="fa-solid fa-arrows-rotate"></i> Sync Dockge</button>
                            <span class="count-pill" style="font-size: 0.8rem;">${homelabServicesData.length} containers</span>
                        </div>
                    </div>
                    <div class="cards-subgrid" id="dockge-list-grid">
                        ${servicesHtml}
                    </div>
                </div>

                <div class="grid-section" id="section-systemd">
                    <div class="grid-section-header">
                        <h3><i class="fa-solid fa-server" style="color: var(--accent-cyan);"></i> Core Systemd Services & Daemons</h3>
                        <div class="section-header-actions">
                            <button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="openAddSystemdModal()"><i class="fa-solid fa-plus"></i> Add Service</button>
                            <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="loadSystemdServices()"><i class="fa-solid fa-rotate"></i> Refresh</button>
                            <span class="count-pill" style="font-size: 0.8rem;">${cachedSystemdServicesData.length} daemons</span>
                        </div>
                    </div>
                    <div class="cards-subgrid" id="services-list-grid">
                        ${systemdHtml}
                    </div>
                </div>
            `;
        } else if (currentCategory === 'Services & Dockge' || currentCategory === 'Homelab Services') {
            const servicesHtml = homelabServicesData.map(renderServiceCardHTML).join('');
            const systemdHtml = renderSystemdServicesHTML(cachedSystemdServicesData);

            grid.innerHTML = `
                <div class="grid-section" id="section-dockge">
                    <div class="grid-section-header">
                        <h3><i class="fa-solid fa-cubes" style="color: #3b82f6;"></i> Dockge Homelab Containers</h3>
                        <div class="section-header-actions">
                            <button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="openAddContainerModal()"><i class="fa-solid fa-plus"></i> Add Container</button>
                            <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="syncDockgeContainers()"><i class="fa-solid fa-arrows-rotate"></i> Sync Dockge</button>
                            <span class="count-pill" style="font-size: 0.8rem;">${homelabServicesData.length} containers</span>
                        </div>
                    </div>
                    <div class="cards-subgrid" id="dockge-list-grid">
                        ${servicesHtml}
                    </div>
                </div>

                <div class="grid-section" id="section-systemd">
                    <div class="grid-section-header">
                        <h3><i class="fa-solid fa-server" style="color: var(--accent-cyan);"></i> Core Systemd Services & Daemons</h3>
                        <div class="section-header-actions">
                            <button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="openAddSystemdModal()"><i class="fa-solid fa-plus"></i> Add Service</button>
                            <button class="btn btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="loadSystemdServices()"><i class="fa-solid fa-rotate"></i> Refresh</button>
                            <span class="count-pill" style="font-size: 0.8rem;">${cachedSystemdServicesData.length} daemons</span>
                        </div>
                    </div>
                    <div class="cards-subgrid" id="services-list-grid">
                        ${systemdHtml}
                    </div>
                </div>
            `;
        } else {
            const filtered = allScriptsData.filter(s => s.category === currentCategory);
            const scriptsHtml = filtered.map(renderScriptCardHTML).join('');
            grid.innerHTML = `
                <div class="grid-section">
                    <div class="grid-section-header">
                        <h3><i class="fa-solid fa-layer-group" style="color: var(--accent-cyan);"></i> ${currentCategory}</h3>
                        <div class="section-header-actions">
                            <button class="btn btn-primary" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;" onclick="openAddScriptModal()"><i class="fa-solid fa-plus"></i> Add Script</button>
                            <span class="count-pill" style="font-size: 0.8rem;">${filtered.length} scripts</span>
                        </div>
                    </div>
                    <div class="cards-subgrid">
                        ${scriptsHtml}
                    </div>
                </div>
            `;
        }

        if (currentSearchQuery) {
            filterCardsInstant(currentSearchQuery);
        }
    }

        function renderScriptCardHTML(s) {
        const searchKeywords = `${s.name} ${s.category} ${s.script} ${s.schedule_str} script python`.toLowerCase();
        return `
            <div class="card" data-search="${searchKeywords}">
                <div>
                    <div class="card-header">
                        <div class="card-icon-title">
                            <div class="icon-box">
                                <i class="fa-solid ${s.icon}"></i>
                            </div>
                            <div class="card-title-text">
                                <h3>${s.name}</h3>
                                <div class="card-category">${s.category} &bull; ${s.script}</div>
                            </div>
                        </div>
                        <label class="toggle-switch" title="Toggle Cron Schedule">
                            <input type="checkbox" ${s.cron_enabled ? 'checked' : ''} onchange="toggleCron('${s.id}')">
                            <span class="slider"></span>
                        </label>
                    </div>

                    <div class="card-details">
                        <div class="detail-row">
                            <span class="detail-label">Cron Schedule</span>
                            <span class="detail-value" style="text-align:right; max-width:210px; font-size:0.8rem;">${s.schedule_str}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value" style="color: ${s.is_running ? 'var(--accent-cyan)' : (s.cron_enabled ? 'var(--accent-green)' : 'var(--text-secondary)')}">
                                ${s.is_running ? '<i class="fa-solid fa-spinner fa-spin"></i> Running...' : (s.cron_enabled ? '<i class="fa-solid fa-check"></i> Scheduled' : '<i class="fa-solid fa-ban"></i> Disabled')}
                            </span>
                        </div>
                        ${s.screenshot_time ? `
                        <div class="detail-row">
                            <span class="detail-label">Last Screenshot</span>
                            <span class="detail-value">${s.screenshot_time}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div class="card-actions">
                    <button class="btn btn-primary" onclick="runNow('${s.id}')" ${s.is_running ? 'disabled' : ''}>
                        <i class="fa-solid fa-play"></i> Run Now
                    </button>
                    <button class="btn btn-secondary" onclick="openCronModal('${s.id}')">
                        <i class="fa-solid fa-clock"></i> Edit Schedule
                    </button>
                    ${s.screenshot_url ? `
                    <button class="btn btn-secondary" onclick="viewScreenshot('${s.id}')">
                        <i class="fa-solid fa-image"></i> Screenshot
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    function getFontAwesomeClass(icon) {
        if (!icon) return 'fa-solid fa-server';
        const trimmed = icon.trim();
        if (trimmed.startsWith('fa-solid ') || trimmed.startsWith('fa-brands ') || trimmed.startsWith('fa-regular ')) {
            return trimmed;
        }
        if (trimmed.startsWith('fa-')) {
            return `fa-solid ${trimmed}`;
        }
        return `fa-solid fa-${trimmed}`;
    }

    function resolveServiceUrl(rawUrl, port, protocol) {
        const preferredHost = window.location.hostname || 'localhost';
        if (rawUrl) {
            try {
                const u = new URL(rawUrl);
                if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || /^192\.168\./.test(u.hostname) || u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
                    u.hostname = preferredHost;
                    return u.toString();
                }
                return rawUrl;
            } catch(e) {
                return rawUrl;
            }
        }
        const proto = protocol || 'http';
        return `${proto}://${preferredHost}:${port}`;
    }

    function renderServiceCardHTML(s) {
        const searchKeywords = `${s.name} ${s.desc} ${s.port} ${s.protocol} dockge homelab container docker service`.toLowerCase();
        const targetUrl = resolveServiceUrl(s.url, s.port, s.protocol);
        const iconClass = getFontAwesomeClass(s.icon);
        const statsRow = (s.cpu_percent || s.mem_usage) ? `
            <div class="detail-row" style="margin-top: 2px;">
                <span class="detail-label">Resources</span>
                <span class="detail-value" style="display:inline-flex; gap:5px; align-items:center;">
                    ${s.cpu_percent ? `<span style="background:rgba(56,189,248,0.12); color:#38bdf8; font-size:0.75rem; font-weight:600; padding:1px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.25);"><i class="fa-solid fa-microchip"></i> ${s.cpu_percent}</span>` : ''}
                    ${s.mem_usage ? `<span style="background:rgba(192,132,252,0.12); color:#c084fc; font-size:0.75rem; font-weight:600; padding:1px 6px; border-radius:4px; border:1px solid rgba(192,132,252,0.25);"><i class="fa-solid fa-memory"></i> ${s.mem_usage.split('/')[0].trim()}</span>` : ''}
                </span>
            </div>
        ` : '';
        return `
            <div class="service-card" data-search="${searchKeywords}">
                <div>
                    <div class="card-header">
                        <div class="card-icon-title">
                            <div class="icon-box">
                                <i class="${iconClass}"></i>
                            </div>
                            <div class="card-title-text">
                                <h3>${s.name}</h3>
                                <div class="card-category">${s.desc}</div>
                            </div>
                        </div>
                        <span class="port-badge">:${s.port}</span>
                    </div>

                    <div class="card-details">
                        <div class="detail-row">
                            <span class="detail-label">Service Port</span>
                            <span class="detail-value">${s.port} (${(s.protocol || 'HTTP').toUpperCase()})</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value" style="color: ${s.status === 'Online' ? 'var(--accent-green)' : 'var(--accent-red)'}">
                                <i class="fa-solid ${s.status === 'Online' ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${s.status}
                            </span>
                        </div>
                        ${statsRow}
                    </div>
                </div>

                <div class="card-actions">
                    <a href="${targetUrl}" target="_blank" class="btn btn-primary">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open App
                    </a>
                    <button class="btn btn-secondary btn-restart" onclick="execContainerAction('${s.id}', 'restart')" title="Restart Container">
                        <i class="fa-solid fa-rotate-right"></i> Restart
                    </button>
                    <button class="btn btn-secondary btn-logs" onclick="openContainerLogsModal('${s.container || s.id}', '${s.name}')" title="Live Container Logs">
                        <i class="fa-solid fa-terminal"></i> Logs
                    </button>
                    <button class="btn btn-secondary btn-start" onclick="execContainerAction('${s.id}', 'start')" title="Start Container">
                        <i class="fa-solid fa-play" style="color:var(--accent-green)"></i> Start
                    </button>
                    <button class="btn btn-secondary btn-stop" onclick="execContainerAction('${s.id}', 'stop')" title="Stop Container">
                        <i class="fa-solid fa-stop" style="color:var(--accent-red)"></i> Stop
                    </button>
                </div>
            </div>
        `;
    }

    async function loadExecutionHistoryView() {
        const container = document.getElementById('history-table-container');
        const trackContainer = document.getElementById('timeline-visual-track');
        const metricsContainer = document.getElementById('timeline-metrics-pills');

        try {
            const [histRes, timelineRes] = await Promise.all([
                fetch('/api/history').then(r => r.json()).catch(() => []),
                fetch('/api/scripts/timeline').then(r => r.json()).catch(() => ({ timeline: [], total_runs: 0, success_count: 0, error_count: 0 }))
            ]);

            const history = Array.isArray(histRes) ? histRes : [];
            const timelineData = timelineRes || {};
            const timelineList = timelineData.timeline || [];

            // 1. Render Metrics Pills
            if (metricsContainer) {
                const total = timelineData.total_runs || history.length;
                const errs = timelineData.error_count || 0;
                const succ = timelineData.success_count || (total - errs);
                const rate = total > 0 ? Math.round((succ / total) * 100) : 100;

                metricsContainer.innerHTML = `
                    <span class="count-pill" style="background: rgba(255,255,255,0.06); font-size:0.75rem;"><i class="fa-solid fa-list-check" style="color:var(--accent-cyan);"></i> Total: ${total} runs</span>
                    <span class="count-pill" style="background: rgba(16,185,129,0.15); color:var(--accent-green); border-color:rgba(16,185,129,0.3); font-size:0.75rem;"><i class="fa-solid fa-check"></i> ${succ} Successful (${rate}%)</span>
                    <span class="count-pill" style="background: ${errs > 0 ? 'rgba(244,63,94,0.18)' : 'rgba(255,255,255,0.04)'}; color:${errs > 0 ? '#f43f5e' : 'var(--text-secondary)'}; border-color:${errs > 0 ? 'rgba(244,63,94,0.4)' : 'var(--border-color)'}; font-size:0.75rem;"><i class="fa-solid fa-triangle-exclamation"></i> ${errs} Failures</span>
                `;
            }

            // 2. Render 24-Hour Visual Schedule Rail
            if (trackContainer) {
                if (!timelineList.length) {
                    trackContainer.innerHTML = `<div style="color:var(--text-secondary); font-size:0.82rem; padding:0.5rem;">No recent executions recorded in timeline.</div>`;
                } else {
                    trackContainer.innerHTML = timelineList.map(t => {
                        const isErr = t.is_error;
                        const bg = isErr ? 'rgba(244, 63, 94, 0.22)' : 'rgba(16, 185, 129, 0.15)';
                        const border = isErr ? '#f43f5e' : 'rgba(16, 185, 129, 0.35)';
                        const color = isErr ? '#ff4d6d' : 'var(--accent-green)';
                        const icon = isErr ? 'fa-circle-exclamation' : 'fa-circle-check';
                        const durText = t.duration_s ? `${t.duration_s}s` : '';
                        const timeShort = (t.timestamp || '').split(' ').slice(1).join(' ');

                        return `
                            <div class="timeline-node" onclick="openFailureSnapshotModal('${t.id}', '${(t.name || '').replace(/'/g, "\\'")}')" style="display:inline-flex; align-items:center; gap:0.4rem; padding:0.35rem 0.7rem; border-radius:9px; background:${bg}; border:1px solid ${border}; color:${color}; font-size:0.75rem; font-weight:600; cursor:pointer; white-space:nowrap; transition:transform 0.15s ease, box-shadow 0.15s ease;" title="${t.name} - ${t.status} at ${t.timestamp} (Click to inspect snapshot/logs)">
                                <i class="fa-solid ${icon}"></i>
                                <span style="color:#fff;">${t.name}</span>
                                ${durText ? `<span style="font-size:0.68rem; opacity:0.8; font-family:'JetBrains Mono', monospace;">${durText}</span>` : ''}
                                <span style="font-size:0.65rem; color:var(--text-secondary); opacity:0.8;">${timeShort}</span>
                            </div>
                        `;
                    }).join('');
                }
            }

            // 3. Render Table with Failure Snapshot Buttons
            if (container) {
                if (!history.length) {
                    container.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-secondary);">No execution history recorded yet.</div>`;
                    return;
                }

                container.innerHTML = `
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th>Script / Task Name</th>
                                <th>Trigger Source</th>
                                <th>Execution Timestamp</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.map(item => {
                                let trigBadge = `<span class="count-pill">${item.trigger}</span>`;
                                const trig = (item.trigger || '').toLowerCase();
                                if (trig.includes('cron') || trig.includes('scheduled')) {
                                    trigBadge = `<span class="count-pill" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-green); border: 1px solid rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-clock"></i> ${item.trigger}</span>`;
                                } else if (trig.includes('manual') || trig.includes('dashboard')) {
                                    trigBadge = `<span class="count-pill" style="background: rgba(0, 242, 254, 0.15); color: var(--accent-cyan); border: 1px solid rgba(0, 242, 254, 0.3);"><i class="fa-solid fa-play"></i> ${item.trigger}</span>`;
                                } else if (trig.includes('studio') || trig.includes('render')) {
                                    trigBadge = `<span class="count-pill" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);"><i class="fa-solid fa-film"></i> ${item.trigger}</span>`;
                                } else if (trig.includes('watchdog')) {
                                    trigBadge = `<span class="count-pill" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);"><i class="fa-solid fa-shield-heart"></i> Watchdog</span>`;
                                }

                                const isFail = (item.status || '').toLowerCase().includes('fail') || (item.status || '').toLowerCase().includes('error');
                                const stColor = isFail ? 'var(--accent-red)' : 'var(--accent-green)';
                                const stIcon = isFail ? 'fa-circle-xmark' : 'fa-circle-check';

                                return `
                                    <tr>
                                        <td><strong>${item.name}</strong></td>
                                        <td>${trigBadge}</td>
                                        <td style="color:var(--text-secondary);">${item.timestamp}</td>
                                        <td><span style="color:${stColor}; font-weight:600;"><i class="fa-solid ${stIcon}"></i> ${item.status}</span></td>
                                        <td>
                                            <button class="btn btn-secondary" style="padding:0.35rem 0.75rem; font-size:0.78rem; background: ${isFail ? 'rgba(244,63,94,0.18)' : 'rgba(255,255,255,0.06)'}; color: ${isFail ? '#f43f5e' : 'var(--accent-cyan)'}; border-color: ${isFail ? 'rgba(244,63,94,0.35)' : 'var(--border-color)'};" onclick="openFailureSnapshotModal('${item.id}', '${item.name.replace(/'/g, "\\'")}')" title="Inspect snapshot, logs, and diagnostics">
                                                <i class="fa-solid fa-camera"></i> Snapshot & Log
                                            </button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            }
        } catch (e) {
            if (container) container.innerHTML = `<div style="color:var(--accent-red); padding:1rem;">Error loading execution history.</div>`;
        }
    }

    async function openFailureSnapshotModal(scriptId, scriptName) {
        const modal = document.getElementById('viewer-modal');
        document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-camera-retro" style="color: #00f2fe;"></i> Snapshot & Diagnostic: ${escapeHtml(scriptName || scriptId)}`;
        document.getElementById('modal-body').innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Loading execution diagnostics and screenshot...</div>`;
        modal.classList.add('active');

        try {
            const res = await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/failure-snapshot`);
            const data = await res.json();

            const hasScreenshot = Boolean(data.screenshot_url);
            const errorBanner = data.error_summary ? `
                <div style="background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.35); border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 1rem; color: #fff; font-size: 0.85rem; display: flex; align-items: center; gap: 0.6rem;">
                    <i class="fa-solid fa-circle-exclamation" style="color: #f43f5e; font-size: 1.1rem;"></i>
                    <div>
                        <strong style="color: #f43f5e;">Detected Error:</strong>
                        <span style="font-family:'JetBrains Mono', monospace; font-size:0.8rem; margin-left:0.35rem;">${escapeHtml(data.error_summary)}</span>
                    </div>
                </div>
            ` : '';

            const screenshotCol = hasScreenshot ? `
                <div style="flex: 1 1 320px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 12px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; font-weight:700; color:#fff;">
                        <span><i class="fa-solid fa-image" style="color:var(--accent-cyan);"></i> Browser Snapshot</span>
                        <span style="font-size:0.72rem; color:var(--text-secondary);">${data.screenshot_time || 'Latest Capture'}</span>
                    </div>
                    <a href="${data.screenshot_url}" target="_blank" title="Click to view full image in new tab">
                        <img src="${data.screenshot_url}?t=${Date.now()}" style="width:100%; max-height:360px; object-fit:contain; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#000;" alt="Browser Capture">
                    </a>
                </div>
            ` : `
                <div style="flex: 1 1 240px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; text-align:center; color:var(--text-secondary); display:flex; flex-direction:column; justify-content:center; align-items:center; gap:0.5rem;">
                    <i class="fa-regular fa-image" style="font-size:2rem; opacity:0.3;"></i>
                    <span style="font-size:0.82rem;">No Playwright browser screenshot captured for this task.</span>
                </div>
            `;

            document.getElementById('modal-body').innerHTML = `
                ${errorBanner}
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
                    ${screenshotCol}
                    <div style="flex: 1 1 380px; display: flex; flex-direction: column; gap: 0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; font-weight:700; color:#fff;">
                            <span><i class="fa-solid fa-terminal" style="color:var(--accent-green);"></i> Execution Log Tail (Last 60 Lines)</span>
                        </div>
                        <div class="terminal-box" style="max-height: 360px; overflow-y: auto; font-size: 0.78rem; font-family:'JetBrains Mono', monospace; line-height: 1.45; white-space: pre-wrap; word-break: break-all; background: #0c0d10; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem; color: #e2e8f0;">${escapeHtml(data.log_tail)}</div>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                    <button class="btn btn-primary" onclick="runScript('${scriptId}')">
                        <i class="fa-solid fa-play"></i> Rerun Script Now
                    </button>
                </div>
            `;
        } catch(e) {
            document.getElementById('modal-body').innerHTML = `<div style="color:var(--accent-red); padding:1rem; text-align:center;">Failed to fetch snapshot data.</div>`;
        }
    }

    function triggerReboot() {
        showConfirm(
            "Reboot Linux Server",
            "Are you sure you want to REBOOT the entire Linux server? All homelab services will momentarily restart.",
            async () => {
                try {
                    const res = await fetch('/api/system/reboot', { method: 'POST' });
                    const data = await res.json();
                    showToast(data.message || 'Reboot command sent!', 'info', 5000);
                } catch (e) {
                    showToast('Reboot command sent to server!', 'info', 5000);
                }
            },
            true
        );
    }

    function restartService(serviceId) {
        showConfirm(
            `Restart Service: ${serviceId}`,
            `Are you sure you want to restart container/service '${serviceId}'?`,
            async () => {
                try {
                    const res = await fetch(`/api/homelab/service/${serviceId}/restart`, { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        showToast(data.message, 'success');
                        loadScripts();
                    } else {
                        showToast(data.error || 'Failed to restart service', 'error');
                    }
                } catch (e) { showToast('Error restarting service', 'error'); }
            }
        );
    }

    function triggerBackup() {
        showConfirm(
            "Create Homelab Config Backup",
            "Create a clean .tar.gz archive backup of Docker homelab, scripts, and dashboard in the backups directory?",
            async () => {
                try {
                    showToast('Creating config backup archive...', 'info', 3000);
                    const res = await fetch('/api/system/backup', { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        showToast('Backup archive created successfully!', 'success');
                    } else {
                        showToast(data.error || 'Backup failed', 'error');
                    }
                } catch (e) { showToast('Error creating backup', 'error'); }
            }
        );
    }

    async function openAlertsModal() {
        document.getElementById('modal-title').innerText = `Discord & Telegram Phone Alerts Configuration`;
        document.getElementById('modal-body').innerHTML = `
            <div style="font-size:0.88rem; color:var(--text-secondary); margin-bottom:1.5rem;">
                Configure Webhooks to get instant alerts on your phone when backups finish, scripts run, or system updates complete.
            </div>
            
            <div class="form-group" style="margin-bottom:1.2rem;">
                <label><i class="fa-brands fa-discord" style="color:#5865F2"></i> Discord Webhook URL</label>
                <input type="text" id="cfg-discord" class="form-control" placeholder="https://discord.com/api/webhooks/...">
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label><i class="fa-brands fa-telegram" style="color:#26A5E4"></i> Telegram Bot Token</label>
                    <input type="text" id="cfg-tg-token" class="form-control" placeholder="123456789:ABCdef...">
                </div>
                <div class="form-group">
                    <label><i class="fa-solid fa-id-card"></i> Telegram Chat ID</label>
                    <input type="text" id="cfg-tg-chat" class="form-control" placeholder="987654321">
                </div>
            </div>

            <div style="margin-top:1.2rem; display:flex; align-items:center; gap:0.75rem;">
                <input type="checkbox" id="cfg-alerts-enabled" style="width:18px; height:18px; cursor:pointer;">
                <label for="cfg-alerts-enabled" style="cursor:pointer; font-size:0.9rem; font-weight:600;">Enable Instant Phone Notifications</label>
            </div>

            <div style="margin-top:1.4rem; padding-top:1.1rem; border-top:1px solid var(--border-color);">
                <div style="font-size:0.92rem; font-weight:700; color:var(--text-primary); margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem;">
                    <i class="fa-solid fa-heart-pulse" style="color:var(--accent-red)"></i> Automated Health & Watchdog Alerts
                </div>
                <div style="display:flex; flex-direction:column; gap:0.65rem; font-size:0.85rem; color:var(--text-secondary);">
                    <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer;">
                        <input type="checkbox" id="cfg-alert-temp" style="width:16px; height:16px; cursor:pointer;">
                        <span>Alert if CPU/GPU Thermal Temperature exceeds 80°C</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer;">
                        <input type="checkbox" id="cfg-alert-disk" style="width:16px; height:16px; cursor:pointer;">
                        <span>Alert if OS Root Storage drops below 10% free space</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:0.6rem; cursor:pointer;">
                        <input type="checkbox" id="cfg-alert-crash" style="width:16px; height:16px; cursor:pointer;">
                        <span>Alert if a Docker Container crashes or stops unexpectedly</span>
                    </label>
                </div>
            </div>

            <div style="margin-top: 1.8rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                <button class="btn btn-secondary" onclick="testAlerts()"><i class="fa-solid fa-paper-plane"></i> Send Test Notification</button>
                <button class="btn btn-primary" style="padding:0.75rem 1.5rem;" onclick="saveAlerts()"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');

        try {
            const res = await fetch('/api/system/settings/alerts');
            const data = await res.json();
            document.getElementById('cfg-discord').value = data.discord_webhook || '';
            document.getElementById('cfg-tg-token').value = data.telegram_token || '';
            document.getElementById('cfg-tg-chat').value = data.telegram_chat_id || '';
            document.getElementById('cfg-alerts-enabled').checked = !!data.enabled;
            document.getElementById('cfg-alert-temp').checked = !!data.alert_temp;
            document.getElementById('cfg-alert-disk').checked = !!data.alert_disk;
            document.getElementById('cfg-alert-crash').checked = !!data.alert_crash;
        } catch (e) {}
    }

    async function saveAlerts() {
        const payload = {
            discord_webhook: document.getElementById('cfg-discord').value.trim(),
            telegram_token: document.getElementById('cfg-tg-token').value.trim(),
            telegram_chat_id: document.getElementById('cfg-tg-chat').value.trim(),
            enabled: document.getElementById('cfg-alerts-enabled').checked,
            alert_temp: document.getElementById('cfg-alert-temp').checked,
            alert_disk: document.getElementById('cfg-alert-disk').checked,
            alert_crash: document.getElementById('cfg-alert-crash').checked
        };
        try {
            const res = await fetch('/api/system/settings/alerts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('Alert settings saved successfully!', 'success');
                closeModal();
            }
        } catch (e) { showToast('Failed to save alert settings', 'error'); }
    }

    async function testAlerts() {
        try {
            const res = await fetch('/api/system/settings/alerts/test', { method: 'POST' });
            const data = await res.json();
            if (res.ok) showToast(data.message, 'success');
            else showToast(data.error || 'Failed to send test alert', 'error');
        } catch (e) { showToast('Error testing notification', 'error'); }
    }

    async function toggleCron(scriptId) {
        try {
            const res = await fetch(`/api/scripts/${scriptId}/toggle`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Updated cron schedule', 'info', 2000);
                loadScripts();
            } else {
                showToast('Failed to toggle script cron', 'error');
            }
        } catch (e) {
            showToast('Failed to toggle script cron', 'error');
        }
    }

    let scriptRunningCheckTimer = null;

    function startScriptRunningPolling() {
        if (scriptRunningCheckTimer) clearInterval(scriptRunningCheckTimer);
        scriptRunningCheckTimer = setInterval(async () => {
            try {
                const res = await fetch('/api/scripts');
                if (res.ok) {
                    const newScripts = await res.json();
                    allScriptsData = newScripts;
                    renderContent(false);

                    // Check if all scripts have finished executing
                    const stillRunning = newScripts.some(s => s.is_running);
                    if (!stillRunning) {
                        clearInterval(scriptRunningCheckTimer);
                        scriptRunningCheckTimer = null;
                        showToast('🎉 Script execution completed!', 'success', 3000);
                        if (currentCategory === 'Execution History') {
                            loadExecutionHistoryView();
                        }
                    }
                }
            } catch (e) {}
        }, 1500);
    }

    function runNow(scriptId) {
        const s = allScriptsData.find(item => item.id === scriptId);
        const displayName = s ? s.name : scriptId;

        showConfirm(
            `Execute Script: ${displayName}`,
            `Are you sure you want to run '${displayName}' manually right now?`,
            async () => {
                // Immediately set running in local state so UI status changes to "Running..." instantly
                if (s) s.is_running = true;
                renderContent(false);

                showToast(`Executing ${displayName}...`, 'info', 2500);
                try {
                    const res = await fetch(`/api/scripts/${scriptId}/run`, { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        showToast(data.message || `Started ${displayName}`, 'success', 3000);
                        // Start rapid status polling without opening log modal
                        startScriptRunningPolling();
                        setTimeout(() => loadScripts(false), 500);
                    } else {
                        showToast(data.error || 'Failed to start script', 'error');
                        if (s) s.is_running = false;
                        renderContent(false);
                    }
                } catch (e) {
                    showToast('Error triggering script', 'error');
                    if (s) s.is_running = false;
                    renderContent(false);
                }
            }
        );
    }

    let videoRenderCheckTimer = null;

    function startVideoRenderPolling() {
        if (videoRenderCheckTimer) clearInterval(videoRenderCheckTimer);
        videoRenderCheckTimer = setInterval(async () => {
            try {
                const sRes = await fetch('/api/video/status');
                const sData = await sRes.json();
                const btn = document.getElementById('btn-run-video');

                if (sData.running) {
                    if (btn) {
                        btn.disabled = true;
                        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Rendering Video...`;
                    }
                } else {
                    clearInterval(videoRenderCheckTimer);
                    videoRenderCheckTimer = null;
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = `<i class="fa-solid fa-play"></i> Generate & Render Video`;
                    }
                    showToast('Video rendering complete!', 'success');
                    loadVideoFiles();
                    if (currentCategory === 'Execution History') {
                        loadExecutionHistoryView();
                    }
                }
            } catch (e) {}
        }, 1500);
    }

    async function runVideoProcessor() {
        const btn = document.getElementById('btn-run-video');

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Rendering Video...`;
        }

        try {
            const res = await fetch('/api/video/process', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Video rendering started in background!', 'success');
                startVideoRenderPolling();
            } else {
                showToast(data.error || 'Video rendering is already in progress', 'error');
                // Check if it really is running
                startVideoRenderPolling();
            }
        } catch (e) {
            showToast('Error starting video rendering', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-play"></i> Generate & Render Video`;
            }
        }
    }

    function openCronModal(scriptId) {
        const s = allScriptsData.find(item => item.id === scriptId);
        if (!s) return;

        const existingSchedules = s.schedules || [];
        const schedMap = {};
        existingSchedules.forEach(item => {
            schedMap[item.dow] = { hour: item.hour, minute: item.minute };
        });

        document.getElementById('modal-title').innerText = `Edit Per-Day Schedule: ${s.name}`;

        const rowsHtml = ALL_DAYS.map(d => {
            const active = schedMap.hasOwnProperty(d.val);
            const curH = active ? schedMap[d.val].hour : '09';
            const curM = active ? schedMap[d.val].minute : '00';

            const hOpts = Array.from({length: 24}, (_, i) => {
                const hStr = i.toString().padStart(2, '0');
                const ampm = i < 12 ? 'AM' : 'PM';
                let h12 = i % 12;
                if (h12 === 0) h12 = 12;
                return `<option value="${hStr}" ${hStr === curH ? 'selected' : ''}>${h12.toString().padStart(2, '0')} ${ampm}</option>`;
            }).join('');

            const mOpts = Array.from({length: 60}, (_, i) => {
                const mStr = i.toString().padStart(2, '0');
                return `<option value="${mStr}" ${mStr === curM ? 'selected' : ''}>:${mStr}</option>`;
            }).join('');

            return `
                <div class="day-time-row">
                    <label>
                        <input type="checkbox" class="cron-perday-chk" data-dow="${d.val}" ${active ? 'checked' : ''}>
                        <span>${d.label}</span>
                    </label>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <select class="form-control cron-perday-hour" data-dow="${d.val}" style="padding:0.35rem 0.6rem; font-size:0.82rem; width:110px;">
                            ${hOpts}
                        </select>
                        <select class="form-control cron-perday-min" data-dow="${d.val}" style="padding:0.35rem 0.6rem; font-size:0.82rem; width:80px;">
                            ${mOpts}
                        </select>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('modal-body').innerHTML = `
            <div style="margin-bottom: 1.25rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
                    <label style="font-size:0.88rem; color:var(--text-secondary); font-weight:600;"><i class="fa-solid fa-calendar-days"></i> Configure Distinct Times for Each Day</label>
                    <div style="display:flex; gap:0.5rem;">
                        <button type="button" class="btn btn-secondary" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="toggleAllPerDay(true)">Select All</button>
                        <button type="button" class="btn btn-secondary" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="toggleAllPerDay(false)">Deselect All</button>
                    </div>
                </div>
                
                <div class="per-day-table">
                    ${rowsHtml}
                </div>
            </div>

            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
                <details>
                    <summary style="font-size: 0.82rem; color: var(--text-secondary); cursor: pointer;"><i class="fa-solid fa-code"></i> Advanced Single Custom Cron Expression</summary>
                    <div class="form-group" style="margin-top: 0.8rem;">
                        <input type="text" id="cron-custom-input" class="form-control" placeholder="e.g. 59 08 * * 0,1,2,3,4">
                    </div>
                </details>
            </div>

            <div style="margin-top: 1.5rem; display: flex; justify-content: flex-end;">
                <button class="btn btn-primary" style="padding: 0.75rem 1.5rem;" onclick="savePerDaySchedule('${s.id}')">
                    <i class="fa-solid fa-floppy-disk"></i> Save Schedule
                </button>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
    }

    function toggleAllPerDay(checkState) {
        document.querySelectorAll('.cron-perday-chk').forEach(chk => chk.checked = checkState);
    }

    async function savePerDaySchedule(scriptId) {
        const customInput = document.getElementById('cron-custom-input').value.trim();
        let payload = {};

        if (customInput) {
            payload = { cron_expr: customInput };
        } else {
            const chks = document.querySelectorAll('.cron-perday-chk:checked');
            if (!chks.length) {
                showToast('Please select at least one day for execution!', 'error');
                return;
            }
            const perDayList = [];
            chks.forEach(chk => {
                const dow = chk.getAttribute('data-dow');
                const hour = document.querySelector(`.cron-perday-hour[data-dow="${dow}"]`).value;
                const min = document.querySelector(`.cron-perday-min[data-dow="${dow}"]`).value;
                perDayList.push({ dow: dow, hour: hour, minute: min });
            });
            payload = { 
                schedules: perDayList,
                per_day_schedules: perDayList,
                enabled: true 
            };
        }

        try {
            const res = await fetch(`/api/scripts/${scriptId}/cron`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('Schedule updated successfully!', 'success');
                closeModal();
                loadScripts(false);
            } else {
                showToast('Failed to update schedule', 'error');
            }
        } catch (e) { showToast('Error updating schedule', 'error'); }
    }

    let systemUpdateCheckTimer = null;

    function setUpdateButtonsState(isUpdating) {
        const btnUpd = document.getElementById('btn-update-all');
        const btnUpdTab = document.getElementById('btn-update-all-tab');
        if (isUpdating) {
            if (btnUpd) {
                btnUpd.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating System...`;
                btnUpd.disabled = true;
            }
            if (btnUpdTab) {
                btnUpdTab.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating System...`;
                btnUpdTab.disabled = true;
            }
        } else {
            if (btnUpd) {
                btnUpd.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Update System`;
                btnUpd.disabled = false;
            }
            if (btnUpdTab) {
                btnUpdTab.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Update All System`;
                btnUpdTab.disabled = false;
            }
        }
    }

    function startSystemUpdatePolling() {
        if (systemUpdateCheckTimer) clearInterval(systemUpdateCheckTimer);
        systemUpdateCheckTimer = setInterval(async () => {
            try {
                const res = await fetch('/api/system/update-log');
                const data = await res.json();
                
                // Stream terminal text if modal is open
                const term = document.getElementById('upd-log-terminal');
                if (term && data.log) {
                    term.innerText = data.log;
                    term.scrollTop = term.scrollHeight;
                }

                if (data.running) {
                    setUpdateButtonsState(true);
                } else {
                    clearInterval(systemUpdateCheckTimer);
                    systemUpdateCheckTimer = null;
                    setUpdateButtonsState(false);
                    showToast('System update completed successfully!', 'success');
                    loadStats();
                    if (currentCategory === 'Execution History') {
                        loadExecutionHistoryView();
                    }
                }
            } catch (e) {}
        }, 1200);
    }

    function triggerUpdateAll() {
        showConfirm(
            "System, App & Pi-hole Update",
            "Are you sure you want to run full System, App & Pi-hole Updates (APT packages, Pi-hole FTL, Snap, Git repos, Pip, NPM)?",
            async () => {
                setUpdateButtonsState(true);
                showToast('Starting system and apps update...', 'info', 2500);
                try {
                    const res = await fetch('/api/system/update-all', { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        viewUpdateLog();
                        startSystemUpdatePolling();
                    } else {
                        showToast(data.error || 'Update already in progress', 'error');
                        startSystemUpdatePolling();
                    }
                } catch (e) {
                    showToast('Error triggering system update', 'error');
                    setUpdateButtonsState(false);
                }
            }
        );
    }

    async function viewUpdateLog() {
        document.getElementById('modal-title').innerText = `System, App & Pi-hole Live Update Log`;
        document.getElementById('modal-body').innerHTML = `<div class="terminal-box" id="upd-log-terminal">Loading update log stream...</div>`;
        document.getElementById('viewer-modal').classList.add('active');

        startSystemUpdatePolling();
    }

    async function viewLogs(name, scriptId) {
        document.getElementById('modal-title').innerText = `${name} - Output Log`;
        document.getElementById('modal-body').innerHTML = `<div class="terminal-box"><i class="fa-solid fa-spinner fa-spin"></i> Loading log output...</div>`;
        document.getElementById('viewer-modal').classList.add('active');

        try {
            const res = await fetch(`/api/logs/${encodeURIComponent(scriptId)}`);
            const data = await res.json();
            const logText = data.log || data.logs || 'No execution logs available for this task.';
            document.getElementById('modal-body').innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
                    <span style="font-size:0.8rem; color:var(--text-secondary);"><i class="fa-solid fa-file-lines"></i> ${escapeHtml(name)} execution stream</span>
                    <button class="btn btn-primary" onclick="diagnoseLogWithAi(\`${encodeURIComponent(logText.slice(0, 8000))}\`, '${name}')" style="padding:0.35rem 0.8rem; font-size:0.78rem; background:linear-gradient(135deg, #ec4899, #8b5cf6);">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Diagnose with AI
                    </button>
                </div>
                <div class="terminal-box" id="active-modal-log-box" style="white-space: pre-wrap; word-break: break-all; max-height: 480px; overflow-y: auto;">${escapeHtml(logText)}</div>
            `;
        } catch (e) {
            document.getElementById('modal-body').innerHTML = `<div class="terminal-box">Error loading logs.</div>`;
        }
    }

    function viewScreenshot(scriptId) {
        const s = allScriptsData.find(item => item.id === scriptId);
        if (!s || !s.screenshot_url) return;

        document.getElementById('modal-title').innerText = `${s.name} - Latest Screenshot`;
        document.getElementById('modal-body').innerHTML = `
            <div style="text-align: center;">
                <img src="${s.screenshot_url}" class="screenshot-img" alt="Screenshot" onerror="this.onerror=null; this.src=''; this.insertAdjacentHTML('afterend', '<p style=\'color:var(--accent-red); padding:1rem;\'>Screenshot image could not be loaded or is missing.</p>');">
                <div style="margin-top: 1rem; display: flex; justify-content: center; gap: 1rem;">
                    <a href="${s.screenshot_url}" target="_blank" class="btn btn-secondary"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Full Size</a>
                    <a href="${s.screenshot_url}" download class="btn btn-primary"><i class="fa-solid fa-download"></i> Download</a>
                </div>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');
    }

    // --- VIDEO AUTOMATION FILES & DRAG-AND-DROP ---
    async function loadVideoFiles() {
        try {
            const res = await fetch('/api/video/files');
            const data = await res.json();
            renderFileList('background', data.background || []);
            renderFileList('main', data.main || []);
            renderFileList('final', data.final || []);

            document.getElementById('count-bg').innerText = `${(data.background || []).length} files`;
            document.getElementById('count-main').innerText = `${(data.main || []).length} files`;
            document.getElementById('count-final').innerText = `${(data.final || []).length} files`;

            // Check running status
            const sRes = await fetch('/api/video/status');
            const sData = await sRes.json();
            const btn = document.getElementById('btn-run-video');
            if (sData.running) {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Rendering Video...`;
                }
                startVideoRenderPolling();
            } else {
                if (btn && !videoRenderCheckTimer) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-play"></i> Generate & Render Video`;
                }
            }
        } catch (e) {}
    }

    function renderFileList(folder, files) {
        const container = document.getElementById(`list-${folder}`);
        if (!files || !files.length) {
            container.innerHTML = `<div style="font-size:0.8rem; color:var(--text-secondary); padding:0.5rem; text-align:center;">No files in ${folder} folder.</div>`;
            return;
        }
        container.innerHTML = files.map(f => {
            const isImg = /\.(gif|png|jpg|jpeg|webp)$/i.test(f.name);
            const iconClass = isImg ? 'fa-file-image' : 'fa-file-video';
            const iconColor = isImg ? 'var(--accent-amber)' : 'var(--accent-cyan)';
            return `
                <div class="file-item">
                    <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:210px;">
                        <i class="fa-solid ${iconClass}" style="color:${iconColor}; margin-right:0.4rem;"></i>
                        <strong>${f.name}</strong>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${f.size_mb} MB &bull; ${f.mtime}</div>
                    </div>
                    <div style="display:flex; gap:0.4rem;">
                        <button class="btn btn-secondary" style="padding:0.3rem 0.55rem;" title="Preview Media" onclick="previewMedia('${f.name}', '${f.url}')"><i class="fa-solid fa-eye"></i></button>
                        <button class="btn btn-secondary" style="padding:0.3rem 0.55rem; color:var(--accent-red);" title="Delete Media" onclick="deleteVideoFile('${folder}', '${f.name}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function previewMedia(name, url) {
        const isImg = /\.(gif|png|jpg|jpeg|webp)$/i.test(name);
        document.getElementById('modal-title').innerText = `Preview Media: ${name}`;
        
        if (isImg) {
            document.getElementById('modal-body').innerHTML = `
                <div style="text-align:center; padding:1rem;">
                    <img src="${url}" style="max-width:100%; max-height:70vh; border-radius:12px; object-fit:contain; border:1px solid var(--border-color);" alt="${name}">
                </div>
            `;
        } else {
            document.getElementById('modal-body').innerHTML = `<video src="${url}" controls style="width:100%; border-radius:10px;" autoplay></video>`;
        }
        document.getElementById('viewer-modal').classList.add('active');
    }

    function deleteVideoFile(folder, filename) {
        showConfirm(
            `Delete Video: ${filename}`,
            `Are you sure you want to delete '${filename}' from '${folder}' folder? This cannot be undone.`,
            async () => {
                try {
                    const res = await fetch(`/api/video/file/${folder}/${filename}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast(`Deleted ${filename}`, 'info');
                        loadVideoFiles();
                    }
                } catch (e) { showToast('Delete failed', 'error'); }
            },
            true
        );
    }

    async function handleMultipleFileUpload(folder, fileList) {
        if (!fileList || !fileList.length) return;
        
        const formData = new FormData();
        for (let i = 0; i < fileList.length; i++) {
            formData.append('file', fileList[i]);
        }

        try {
            showToast(`Uploading ${fileList.length} video(s)...`, 'info', 2000);
            const res = await fetch(`/api/video/upload/${folder}`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                showToast(`Successfully uploaded ${fileList.length} video(s) to ${folder}!`, 'success');
                loadVideoFiles();
            } else {
                showToast('Upload failed', 'error');
            }
        } catch (e) { showToast('Error uploading files', 'error'); }
    }

    ['background', 'main'].forEach(type => {
        const zone = document.getElementById(`dz-${type}`);
        if (!zone) return;
        ['dragenter', 'dragover'].forEach(eventName => {
            zone.addEventListener(eventName, (e) => { e.preventDefault(); zone.classList.add('dragover'); }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            zone.addEventListener(eventName, (e) => { e.preventDefault(); zone.classList.remove('dragover'); }, false);
        });
        zone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) handleMultipleFileUpload(type, files);
        }, false);
    });

    // --- TERMINAL DRAWER ENGINE ---
    let isTerminalOpen = false;
    function toggleTerminalDrawer() {
        const drawer = document.getElementById('terminal-drawer');
        isTerminalOpen = !isTerminalOpen;
        drawer.style.right = isTerminalOpen ? '0px' : '-480px';
    }

    function runTerminalPreset(cmd) {
        document.getElementById('terminal-input').value = cmd;
        sendTerminalCmd();
    }

    async function sendTerminalCmd() {
        const input = document.getElementById('terminal-input');
        const viewport = document.getElementById('terminal-viewport');
        const cmd = input.value.trim();
        if (!cmd) return;

        viewport.innerHTML += `\n\n<span style="color:#fff;">$ ${cmd}</span>\nRunning...`;
        viewport.scrollTop = viewport.scrollHeight;
        input.value = '';

        try {
            const res = await fetch('/api/terminal/exec', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
            });
            const data = await res.json();
            viewport.innerHTML += `\n${data.output || data.error}`;
            viewport.scrollTop = viewport.scrollHeight;
        } catch (e) {
            viewport.innerHTML += `\n<span style="color:var(--accent-red);">Error executing command.</span>`;
        }
    }

    // --- ADVANCED DOCKGE CONTAINER MANAGER ---
    async function execContainerAction(serviceId, action) {
        if (action === 'logs') {
            document.getElementById('modal-title').innerText = `Container Logs: ${serviceId}`;
            document.getElementById('modal-body').innerHTML = `<div class="terminal-box">Loading container logs...</div>`;
            document.getElementById('viewer-modal').classList.add('active');
        }

        try {
            const res = await fetch('/api/homelab/container/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ service_id: serviceId, action })
            });
            const data = await res.json();

            if (action === 'logs') {
                document.getElementById('modal-body').innerHTML = `<div class="terminal-box">${data.logs || 'No logs available.'}</div>`;
            } else {
                showToast(data.message || `Executed ${action} on container`, 'success');
                setTimeout(loadScripts, 1000);
            }
        } catch (e) {
            showToast(`Failed to execute ${action} on container`, 'error');
        }
    }

    // --- CHART.JS 24-HOUR TELEMETRY CHART ---
    let telemetryChartInstance = null;
    async function loadTelemetryChart() {
        const ctx = document.getElementById('telemetryChart');
        if (!ctx) return;

        try {
            const res = await fetch('/api/system/history-telemetry');
            const data = await res.json();

            if (telemetryChartInstance) {
                telemetryChartInstance.data.labels = data.labels;
                telemetryChartInstance.data.datasets[0].data = data.cpu;
                telemetryChartInstance.data.datasets[1].data = data.ram;
                telemetryChartInstance.data.datasets[2].data = data.gpu || data.cpu.map(() => 0);
                telemetryChartInstance.data.datasets[3].data = data.dns_block;
                telemetryChartInstance.update('none');
                return;
            }

            telemetryChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.labels,
                    datasets: [
                        {
                            label: 'CPU Usage %',
                            data: data.cpu,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.08)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'RAM Usage %',
                            data: data.ram,
                            borderColor: '#06b6d4',
                            backgroundColor: 'rgba(6, 182, 212, 0.08)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'GPU Usage % (AMD Radeon)',
                            data: data.gpu || data.cpu.map(() => 0),
                            borderColor: '#ec4899',
                            backgroundColor: 'rgba(236, 72, 153, 0.1)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'DNS Block Rate %',
                            data: data.dns_block,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 300 },
                    scales: {
                        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                        y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
                    },
                    plugins: {
                        legend: { labels: { color: '#fff', font: { family: 'Inter' } } }
                    }
                }
            });
        } catch (e) {}
    }

    // --- DAILY DNS BLOCKED & SAVINGS TREND (7 / 30 DAYS) ---
    let dnsHistoryChartInstance = null;
    let dnsHistoryRange = 7;

    function setDnsHistoryRange(days) {
        dnsHistoryRange = days;
        const b7 = document.getElementById('dns-range-btn-7');
        const b30 = document.getElementById('dns-range-btn-30');
        [b7, b30].forEach(b => { if (b) { b.style.borderColor = ''; b.style.color = ''; } });
        const active = days === 7 ? b7 : b30;
        if (active) { active.style.borderColor = 'rgba(16,185,129,0.5)'; active.style.color = '#6ee7b7'; }
        loadDnsHistoryChart();
    }

    async function loadDnsHistoryChart() {
        const ctx = document.getElementById('dnsHistoryChart');
        if (!ctx) return;
        try {
            const res = await fetch(`/api/system/dns-history?days=${dnsHistoryRange}`);
            const data = await res.json();

            if (dnsHistoryChartInstance) {
                dnsHistoryChartInstance.data.labels = data.labels;
                dnsHistoryChartInstance.data.datasets[0].data = data.pihole_blocked;
                dnsHistoryChartInstance.data.datasets[1].data = data.adguard_blocked;
                dnsHistoryChartInstance.data.datasets[2].data = data.saved_mb;
                dnsHistoryChartInstance.update('none');
                return;
            }

            dnsHistoryChartInstance = new Chart(ctx, {
                data: {
                    labels: data.labels,
                    datasets: [
                        { type: 'bar', label: 'Pi-hole Blocked', data: data.pihole_blocked,
                          backgroundColor: 'rgba(6, 182, 212, 0.55)', borderColor: '#06b6d4', borderRadius: 3 },
                        { type: 'bar', label: 'AdGuard Blocked', data: data.adguard_blocked,
                          backgroundColor: 'rgba(139, 92, 246, 0.55)', borderColor: '#8b5cf6', borderRadius: 3 },
                        { type: 'line', label: 'Savings (MB)', data: data.saved_mb,
                          borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.08)',
                          yAxisID: 'y1', tension: 0.4, fill: true }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 300 },
                    scales: {
                        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', maxRotation: 45 } },
                        y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                        y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { color: '#fbbf24' } }
                    },
                    plugins: { legend: { labels: { color: '#d1d5db', boxWidth: 12 } } }
                }
            });
        } catch (e) {}
    }

    // --- FAST STORAGE EXPLORER ENGINE ---
    let currentStoragePath = '';

    async function loadStorageExplorer(path = '') {
        currentStoragePath = path;
        const breadcrumbs = document.getElementById('storage-breadcrumbs');
        const grid = document.getElementById('storage-files-grid');

        if (breadcrumbs) {
            breadcrumbs.innerHTML = `
                <span style="color:var(--text-secondary);">Storage Root:</span> /${path}
                ${path ? `<button class="btn btn-secondary" style="padding:0.2rem 0.6rem; font-size:0.75rem; margin-left:1rem;" onclick="loadStorageExplorer('')"><i class="fa-solid fa-house"></i> Root</button>` : ''}
            `;
        }

        try {
            const res = await fetch(`/api/storage/files?path=${encodeURIComponent(path)}`);
            const data = await res.json();

            if (data.error) {
                grid.innerHTML = `<div style="color:var(--accent-red); grid-column:1/-1;">${data.error}</div>`;
                return;
            }

            if (!data.items || !data.items.length) {
                grid.innerHTML = `<div style="color:var(--text-secondary); grid-column:1/-1; padding:2rem; text-align:center;">Directory is empty.</div>`;
                return;
            }

            grid.innerHTML = data.items.map(item => `
                <div style="background: rgba(18, 18, 18, 0.8); border: 1px solid var(--border-color); border-radius: 14px; padding: 1rem; display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem; transition: transform 0.2s ease;">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <i class="fa-solid ${item.is_dir ? 'fa-folder' : 'fa-file-lines'}" style="font-size: 1.5rem; color: ${item.is_dir ? '#f59e0b' : 'var(--accent-cyan)'};"></i>
                        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <h4 style="font-size: 0.92rem; font-weight: 700; color: #fff; overflow: hidden; text-overflow: ellipsis;">${item.name}</h4>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">${item.is_dir ? 'Directory' : item.size} &bull; ${item.mtime}</span>
                        </div>
                    </div>

                    ${item.is_dir ? `
                        <button class="btn btn-secondary" onclick="loadStorageExplorer('${item.path}')" style="width: 100%; justify-content: center; font-size: 0.8rem;">
                            <i class="fa-solid fa-folder-open"></i> Open Folder
                        </button>
                    ` : `
                        <a href="/api/video/file/final/${item.name}" download class="btn btn-primary" style="width: 100%; justify-content: center; font-size: 0.8rem;">
                            <i class="fa-solid fa-download"></i> Download File
                        </a>
                    `}
                </div>
            `).join('');
        } catch (e) {
            grid.innerHTML = `<div style="color:var(--accent-red); grid-column:1/-1;">Error loading directory content.</div>`;
        }
    }

    // --- SYSTEMD CORE SERVICES MONITOR ---
    function renderSystemdServicesHTML(data) {
        if (!data || !data.length) {
            return `<div style="color:var(--text-secondary); grid-column:1/-1; padding:0.5rem; text-align:center;">Loading system services...</div>`;
        }
        return data.map(s => {
            const searchKeywords = `${s.name} ${s.unit} ${s.desc || ''} ${s.port || ''} systemd service daemon`.toLowerCase();
            const targetUrl = resolveServiceUrl(s.url, s.port, s.protocol);
            const iconClass = getFontAwesomeClass(s.icon);
            const openBtnHtml = s.is_terminal 
                ? `<button class="btn btn-primary" onclick="toggleTerminalDrawer()"><i class="fa-solid fa-terminal"></i> Open Terminal</button>`
                : `<a href="${targetUrl}" target="_blank" class="btn btn-primary"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open App</a>`;

            return `
                <div class="service-card" data-search="${searchKeywords}">
                    <div>
                        <div class="card-header">
                            <div class="card-icon-title">
                                <div class="icon-box">
                                    <i class="${iconClass}"></i>
                                </div>
                                <div class="card-title-text">
                                    <h3>${s.name}</h3>
                                    <div class="card-category" style="font-family:'JetBrains Mono', monospace; font-size:0.72rem; color:var(--accent-cyan);">${s.unit}</div>
                                </div>
                            </div>
                            <span class="port-badge">:${s.port || 'SYS'}</span>
                        </div>

                        <div class="card-details">
                            <div class="detail-row">
                                <span class="detail-label">Service Port</span>
                                <span class="detail-value">${s.port ? s.port + ' (' + (s.protocol || 'TCP').toUpperCase() + ')' : 'System Daemon'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Status</span>
                                <span class="detail-value" style="color: ${s.active ? 'var(--accent-green)' : 'var(--accent-red)'}">
                                    <i class="fa-solid ${s.active ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${s.active ? 'Online (Active)' : 'Offline (Inactive)'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="card-actions">
                        ${openBtnHtml}
                        <button class="btn btn-secondary btn-restart" onclick="systemdServiceAction('${s.unit}', 'restart')" title="Restart Service">
                            <i class="fa-solid fa-rotate-right"></i> Restart
                        </button>
                        <button class="btn btn-secondary btn-start" onclick="systemdServiceAction('${s.unit}', 'start')" title="Start Service">
                            <i class="fa-solid fa-play" style="color:var(--accent-green)"></i> Start
                        </button>
                        <button class="btn btn-secondary btn-stop" onclick="systemdServiceAction('${s.unit}', 'stop')" title="Stop Service">
                            <i class="fa-solid fa-stop" style="color:var(--accent-red)"></i> Stop
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function loadSystemdServices() {
        try {
            const res = await fetch('/api/system/services-status');
            cachedSystemdServicesData = await res.json();
            const grid = document.getElementById('services-list-grid');
            if (grid) {
                grid.innerHTML = renderSystemdServicesHTML(cachedSystemdServicesData);
            }
        } catch (e) {}
    }

    async function systemdServiceAction(unit, action) {
        showToast(`Executing ${action} on ${unit}...`, 'info');
        try {
            const res = await fetch('/api/system/service/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unit, action })
            });
            const data = await res.json();
            showToast(data.message || data.error, res.ok ? 'success' : 'error');
            setTimeout(loadSystemdServices, 1500);
            if (unit.includes('vulkan') || unit.includes('ollama') || unit.includes('ai')) {
                setTimeout(loadAiOpsStatus, 1500);
            }
        } catch (e) {
            showToast(`Failed to ${action} ${unit}`, 'error');
        }
    }

    // --- UFW FIREWALL & NETWORK SECURITY ---
    async function loadNetworkSecurity() {
        const container = document.getElementById('network-security-content');
        if (!container) return;

        try {
            const res = await fetch('/api/network/security');
            const data = await res.json();

            container.innerHTML = `
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
                    <div class="stat-pill" title="Network Table 200 Interface"><i class="fa-solid fa-network-wired" style="color:var(--accent-cyan)"></i> enp3s0: <strong>${data.enp3s0_ip}</strong></div>
                    <div class="stat-pill" title="Network Table 201 Interface"><i class="fa-solid fa-network-wired" style="color:var(--accent-amber)"></i> eno1: <strong>${data.eno1_ip}</strong></div>
                    <div class="stat-pill" title="UFW Shield Status"><i class="fa-solid fa-shield-halved" style="color:var(--accent-green)"></i> UFW Firewall: <strong>${data.ufw_status}</strong></div>
                </div>

                <div style="font-size: 0.85rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem;">Active Listening Ports & Bound Services:</div>
                <table class="history-table" style="font-size: 0.8rem;">
                    <thead>
                        <tr>
                            <th>Protocol</th>
                            <th>Bound Local Address / Port</th>
                            <th>Process Info</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.open_ports.map(p => `
                            <tr>
                                <td><span class="count-pill" style="font-size:0.72rem;">${p.proto}</span></td>
                                <td style="font-family:'JetBrains Mono', monospace; font-weight:600; color:var(--accent-cyan);">${p.local}</td>
                                <td style="color:var(--text-secondary);">${p.process}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            container.innerHTML = `<div style="color:var(--accent-red);">Error loading network security info.</div>`;
        }
    }

    // ==========================================
    // --- 1. EVENT-DRIVEN PIPELINES CONTROLLER ---
    // ==========================================
    let currentPipelineActions = [];

    async function loadPipelines() {
        const container = document.getElementById('pipelines-list-container');
        if (!container) return;
        try {
            const res = await fetch('/api/pipelines');
            const pipelines = await res.json();
            if (!pipelines || !pipelines.length) {
                container.innerHTML = `
                    <div style="background: rgba(18, 18, 18, 0.85); backdrop-filter: blur(16px); border: 1px solid var(--border-color); border-radius: 16px; padding: 2rem; text-align: center;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(234, 179, 8, 0.12); color: #eab308; display: inline-flex; align-items: center; justify-content: center; font-size: 1.6rem; border: 1px solid rgba(234, 179, 8, 0.3); margin-bottom: 1rem;">
                            <i class="fa-solid fa-bolt"></i>
                        </div>
                        <h3 style="font-size: 1.25rem; font-weight: 800; color: #fff; margin-bottom: 0.5rem;">No Active Automation Pipelines</h3>
                        <p style="font-size: 0.88rem; color: var(--text-secondary); max-width: 560px; margin: 0 auto 1.5rem auto;">
                            Pipelines allow you to chain actions automatically (e.g., automatically upload to TikTok when a video finishes rendering, or trigger phone alerts on script completion).
                        </p>
                        
                        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-bottom: 2rem;">
                            <button class="btn btn-primary" onclick="openCreatePipelineModal()"><i class="fa-solid fa-plus"></i> Build Custom Pipeline</button>
                        </div>

                        <div style="border-top: 1px solid var(--border-color); padding-top: 1.5rem; text-align: left;">
                            <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--accent-cyan);"></i> Quick-Start 1-Click Pipeline Templates
                            </h4>
                            <div class="pipeline-templates-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
                                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem;">
                                            <i class="fa-solid fa-heart-pulse" style="color: #00f2fe;"></i>
                                            <strong style="color: #fff; font-size: 0.95rem;">Health Check ➔ Status Alert</strong>
                                        </div>
                                        <p style="font-size: 0.8rem; color: var(--text-secondary);">When server health check completes, automatically dispatch a status notification alert.</p>
                                    </div>
                                    <button class="btn btn-secondary" onclick="deployPipelineTemplate('health_alert')" style="width: 100%; justify-content: center; font-size: 0.8rem;">
                                        <i class="fa-solid fa-bolt" style="color: #eab308;"></i> Deploy Template
                                    </button>
                                </div>

                                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem;">
                                            <i class="fa-solid fa-box-archive" style="color: #f59e0b;"></i>
                                            <strong style="color: #fff; font-size: 0.95rem;">Backup Snapshot ➔ Notification</strong>
                                        </div>
                                        <p style="font-size: 0.8rem; color: var(--text-secondary);">When daily backup finishes, send instant Discord, Telegram, or Webhook notification.</p>
                                    </div>
                                    <button class="btn btn-secondary" onclick="deployPipelineTemplate('snapshot_notify')" style="width: 100%; justify-content: center; font-size: 0.8rem;">
                                        <i class="fa-solid fa-bolt" style="color: #eab308;"></i> Deploy Template
                                    </button>
                                </div>

                                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem;">
                                            <i class="fa-solid fa-broom" style="color: #10b981;"></i>
                                            <strong style="color: #fff; font-size: 0.95rem;">Docker Cleanup ➔ Daily Backup</strong>
                                        </div>
                                        <p style="font-size: 0.8rem; color: var(--text-secondary);">Prune unused Docker containers and images, then trigger full system backup.</p>
                                    </div>
                                    <button class="btn btn-secondary" onclick="deployPipelineTemplate('docker_backup')" style="width: 100%; justify-content: center; font-size: 0.8rem;">
                                        <i class="fa-solid fa-bolt" style="color: #eab308;"></i> Deploy Template
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }
            container.innerHTML = pipelines.map(p => `
                <div style="background: rgba(18, 18, 18, 0.85); backdrop-filter: blur(16px); border: 1px solid var(--border-color); border-radius: 16px; padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(234, 179, 8, 0.12); color: #eab308; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; border: 1px solid rgba(234, 179, 8, 0.3);">
                                <i class="fa-solid fa-bolt"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 1.05rem; font-weight: 700; color: #fff;">${p.name}</h3>
                                <p style="font-size: 0.82rem; color: var(--text-secondary);">${p.desc || 'Automated action sequence'}</p>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.75rem;">
                            <span class="count-pill" style="background: ${p.enabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)'}; color: ${p.enabled ? 'var(--accent-green)' : 'var(--text-secondary)'}; border: 1px solid ${p.enabled ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-color)'};">
                                ${p.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <button class="btn btn-secondary" onclick="togglePipeline('${p.id}')" style="padding: 0.35rem 0.7rem; font-size: 0.75rem;">
                                <i class="fa-solid fa-power-off"></i> ${p.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button class="btn btn-primary" onclick="runPipelineNow('${p.id}')" style="padding: 0.35rem 0.8rem; font-size: 0.75rem;">
                                <i class="fa-solid fa-play"></i> Run Flow
                            </button>
                            <button class="btn btn-secondary" onclick="deletePipeline('${p.id}')" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; color: var(--accent-red);" title="Delete Pipeline">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; padding: 0.75rem 1rem; background: rgba(0, 0, 0, 0.35); border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.82rem;">
                        <span style="color: var(--text-secondary); font-weight: 600;">TRIGGER:</span>
                        <span class="count-pill" style="background: rgba(234, 179, 8, 0.15); color: #eab308; border-color: rgba(234, 179, 8, 0.3);">
                            <i class="fa-solid fa-bell"></i> ${p.trigger?.type || 'event'}: ${p.trigger?.source || 'Any'}
                        </span>
                        <i class="fa-solid fa-arrow-right" style="color: var(--text-secondary); font-size: 0.75rem;"></i>
                        <span style="color: var(--text-secondary); font-weight: 600;">ACTIONS:</span>
                        ${(p.actions || []).map((act, i) => `
                            <span class="count-pill" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.3);">
                                ${i + 1}. ${act.type === 'run_script' ? '🚀 Run ' + (act.target || 'Script') : act.type === 'send_alert' ? '🔔 Alert' : act.type === 'docker_action' ? '🐳 Docker ' + (act.container || '') : act.type}
                            </span>
                        `).join('<i class="fa-solid fa-arrow-right" style="color: var(--text-secondary); font-size: 0.75rem;"></i>')}
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: rgba(255, 255, 255, 0.02); padding: 0.4rem 0.75rem; border-radius: 8px; border: 1px solid var(--border-color); font-size: 0.78rem;">
                        <span style="color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <i class="fa-solid fa-link" style="color: var(--accent-cyan);"></i> Ingestion Webhook: <strong>/api/pipelines/webhook/${p.webhook_token || p.id}</strong>
                        </span>
                        <button class="btn btn-secondary" onclick="copyWebhookUrl('${p.webhook_token || p.id}')" style="padding: 0.2rem 0.55rem; font-size: 0.72rem;">
                            <i class="fa-solid fa-copy"></i> Copy URL
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = `<div style="color:var(--accent-red);">Error loading pipelines.</div>`;
        }
    }

    async function loadPipelineHistory() {
        const container = document.getElementById('pipeline-history-container');
        if (!container) return;
        try {
            const res = await fetch('/api/pipelines/history');
            const history = await res.json();
            if (!history.length) {
                container.innerHTML = `<div style="color:var(--text-secondary); padding:1rem; text-align:center;">No pipeline executions logged yet.</div>`;
                return;
            }
            container.innerHTML = `
                <table class="history-table" style="font-size: 0.82rem;">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Pipeline</th>
                            <th>Trigger</th>
                            <th>Status</th>
                            <th>Execution Summary</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${history.map(h => `
                            <tr>
                                <td style="color:var(--text-secondary); font-family:'JetBrains Mono', monospace;">${h.timestamp}</td>
                                <td style="font-weight:700; color:#fff;">${h.name}</td>
                                <td><span class="count-pill" style="font-size:0.72rem;">${h.trigger}</span></td>
                                <td>
                                    <span class="count-pill" style="background:${h.status === 'Completed' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color:${h.status === 'Completed' ? 'var(--accent-green)' : 'var(--accent-red)'}; font-size:0.72rem;">
                                        ${h.status}
                                    </span>
                                </td>
                                <td style="color:var(--text-secondary); font-size:0.78rem;">${h.details || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            container.innerHTML = `<div style="color:var(--accent-red);">Error loading pipeline history.</div>`;
        }
    }

    async function togglePipeline(id) {
        try {
            const res = await fetch(`/api/pipelines/${id}/toggle`, { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'Pipeline toggled', 'success');
            loadPipelines();
        } catch (e) {
            showToast('Failed to toggle pipeline', 'error');
        }
    }

    async function runPipelineNow(id) {
        showToast('Triggering pipeline flow...', 'info', 2000);
        try {
            const res = await fetch(`/api/pipelines/${id}/run`, { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'Pipeline execution started', 'success');
            setTimeout(loadPipelineHistory, 1500);
        } catch (e) {
            showToast('Failed to trigger pipeline', 'error');
        }
    }

    async function deletePipeline(id) {
        showConfirm('Delete Pipeline Flow', 'Are you sure you want to remove this automation pipeline?', async () => {
            try {
                const res = await fetch(`/api/pipelines/${id}`, { method: 'DELETE' });
                const data = await res.json();
                showToast(data.message || 'Pipeline deleted', 'success');
                loadPipelines();
            } catch (e) {
                showToast('Failed to delete pipeline', 'error');
            }
        }, true);
    }

    function copyWebhookUrl(token) {
        const fullUrl = `${window.location.origin}/api/pipelines/webhook/${token}`;
        navigator.clipboard.writeText(fullUrl).then(() => {
            showToast('Webhook URL copied to clipboard!', 'success', 2500);
        }).catch(() => {
            prompt('Copy this Webhook URL:', fullUrl);
        });
    }

    async function deployPipelineTemplate(templateKey) {
        let payload = null;
        if (templateKey === 'health_alert') {
            payload = {
                name: "Health Check ➔ Discord/Telegram Alert",
                desc: "When system health check finishes, dispatch status notification alert.",
                enabled: true,
                trigger: { type: "script_success", source: "health_check.py" },
                actions: [
                    { type: "send_alert", title: "Server Health Verified", message: "System health check completed successfully." }
                ]
            };
        } else if (templateKey === 'snapshot_notify') {
            payload = {
                name: "Daily Backup ➔ Snapshot Notification",
                desc: "When daily snapshot backup completes, dispatch notification alert.",
                enabled: true,
                trigger: { type: "script_success", source: "backup_task.py" },
                actions: [
                    { type: "send_alert", title: "Daily Backup Finished", message: "Daily homelab snapshot backup completed successfully." }
                ]
            };
        } else if (templateKey === 'docker_backup') {
            payload = {
                name: "Docker Cleanup ➔ Daily Backup Flow",
                desc: "Prune system Docker images and containers, then run full snapshot backup.",
                enabled: true,
                trigger: { type: "script_success", source: "docker_cleanup.py" },
                actions: [
                    { type: "send_alert", title: "Docker Cleanup Done", message: "Docker cleanup complete. Starting daily backup..." },
                    { type: "run_script", target: "backup_daily" }
                ]
            };
        }

        if (!payload) return;
        showToast('Deploying pipeline template...', 'info', 2000);
        try {
            const res = await fetch('/api/pipelines/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Pipeline template deployed successfully!', 'success');
                loadPipelines();
            } else {
                showToast(data.error || 'Failed to deploy template', 'error');
            }
        } catch (e) {
            showToast('Error deploying template', 'error');
        }
    }

    function getScriptOptionsHTML(selectedId = '') {
        let options = '';
        if (allScriptsData && allScriptsData.length) {
            options = allScriptsData.map(s => `
                <option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>
                    ${s.name} (${s.file})
                </option>
            `).join('');
        } else {
            // Fallback presets
            options = `
                <option value="health_check">System Health Check (health_check.py)</option>
                <option value="docker_cleanup">Docker System Cleanup (docker_cleanup.py)</option>
                <option value="backup_daily">Daily Homelab Backup (backup_task.py)</option>
            `;
        }
        return options;
    }

    function openCreatePipelineModal() {
        currentPipelineActions = [
            { type: 'send_alert', title: 'Automated Alert', message: 'Pipeline executed successfully.' }
        ];

        document.getElementById('modal-title').innerText = 'Build Automation Pipeline Flow';
        document.getElementById('modal-body').innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1.25rem;">
                <!-- Step 1: Info -->
                <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem;">
                    <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="width: 22px; height: 22px; border-radius: 50%; background: var(--accent-cyan); color: #000; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800;">1</span>
                        Pipeline Overview
                    </h4>
                    <div>
                        <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Pipeline Name</label>
                        <input type="text" id="new-pipe-name" placeholder="e.g. Video Studio ➔ TikTok Auto Chain" style="width:100%; background:rgba(0,0,0,0.5); border:1px solid var(--border-color); border-radius:8px; padding:0.6rem 0.8rem; color:#fff; font-size:0.88rem;">
                    </div>
                    <div>
                        <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Description</label>
                        <input type="text" id="new-pipe-desc" placeholder="What does this automated flow accomplish?" style="width:100%; background:rgba(0,0,0,0.5); border:1px solid var(--border-color); border-radius:8px; padding:0.6rem 0.8rem; color:#fff; font-size:0.88rem;">
                    </div>
                </div>

                <!-- Step 2: Trigger -->
                <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem;">
                    <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
                        <span style="width: 22px; height: 22px; border-radius: 50%; background: #eab308; color: #000; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800;">2</span>
                        Trigger Event Condition
                    </h4>
                    <div>
                        <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">When should this pipeline run?</label>
                        <select id="new-pipe-trig-type" onchange="togglePipelineTriggerInput()" style="width:100%; background:rgba(0,0,0,0.6); border:1px solid var(--border-color); border-radius:8px; padding:0.6rem 0.8rem; color:#fff; font-size:0.88rem;">
                            <option value="script_success">🏁 When a Python Script Finishes Successfully</option>
                            <option value="webhook">🔗 When an Inbound Webhook is Called</option>
                            <option value="manual">🖐️ Manual Run Button Only</option>
                        </select>
                    </div>
                    <div id="pipe-trigger-source-container">
                        <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Select Trigger Script</label>
                        <select id="new-pipe-trig-source" style="width:100%; background:rgba(0,0,0,0.6); border:1px solid var(--border-color); border-radius:8px; padding:0.6rem 0.8rem; color:#fff; font-size:0.88rem;">
                            ${getScriptOptionsHTML()}
                        </select>
                    </div>
                </div>

                <!-- Step 3: Actions Sequence Builder -->
                <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.85rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.5rem;">
                            <span style="width: 22px; height: 22px; border-radius: 50%; background: var(--accent-green); color: #000; display: inline-flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800;">3</span>
                            Action Sequence Chaining
                        </h4>
                        <button class="btn btn-secondary" onclick="addPipelineActionStep()" style="padding: 0.3rem 0.65rem; font-size: 0.75rem;">
                            <i class="fa-solid fa-plus"></i> Add Next Action Step
                        </button>
                    </div>

                    <div id="pipe-actions-list-builder" style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <!-- Rendered via JS -->
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top:0.5rem;">
                    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="saveNewPipelineAction()"><i class="fa-solid fa-floppy-disk"></i> Save & Deploy Pipeline</button>
                </div>
            </div>
        `;
        renderPipelineActionStepsBuilder();
        document.getElementById('viewer-modal').classList.add('active');
    }

    function togglePipelineTriggerInput() {
        const type = document.getElementById('new-pipe-trig-type').value;
        const container = document.getElementById('pipe-trigger-source-container');
        if (type === 'script_success') {
            container.style.display = 'block';
            container.innerHTML = `
                <label style="font-size:0.8rem; color:var(--text-secondary); display:block; margin-bottom:0.3rem;">Select Trigger Script</label>
                <select id="new-pipe-trig-source" style="width:100%; background:rgba(0,0,0,0.6); border:1px solid var(--border-color); border-radius:8px; padding:0.6rem 0.8rem; color:#fff; font-size:0.88rem;">
                    ${getScriptOptionsHTML()}
                </select>
            `;
        } else if (type === 'webhook') {
            container.style.display = 'block';
            container.innerHTML = `
                <div style="font-size:0.82rem; color:var(--accent-cyan); background:rgba(6,182,212,0.1); padding:0.6rem 0.85rem; border-radius:8px; border:1px solid rgba(6,182,212,0.2);">
                    <i class="fa-solid fa-circle-info"></i> A unique Ingestion Webhook token will be generated automatically when saved.
                </div>
                <input type="hidden" id="new-pipe-trig-source" value="webhook">
            `;
        } else {
            container.style.display = 'none';
        }
    }

    function renderPipelineActionStepsBuilder() {
        const container = document.getElementById('pipe-actions-list-builder');
        if (!container) return;

        if (!currentPipelineActions.length) {
            container.innerHTML = `<div style="color:var(--text-secondary); font-size:0.82rem; text-align:center; padding:1rem;">Click "+ Add Next Action Step" to chain an action.</div>`;
            return;
        }

        container.innerHTML = currentPipelineActions.map((act, idx) => `
            <div style="background: rgba(0, 0, 0, 0.45); border: 1px solid var(--border-color); border-radius: 10px; padding: 0.85rem 1rem; display: flex; flex-direction: column; gap: 0.6rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: var(--accent-cyan); font-size: 0.85rem;">Step ${idx + 1}</span>
                    ${currentPipelineActions.length > 1 ? `
                        <button onclick="removePipelineActionStep(${idx})" style="background:transparent; border:none; color:var(--accent-red); cursor:pointer; font-size:0.85rem;" title="Remove Step">
                            <i class="fa-solid fa-times"></i>
                        </button>
                    ` : ''}
                </div>

                <div class="pipeline-action-row" style="display: grid; grid-template-columns: 140px 1fr; gap: 0.75rem; align-items: center;">
                    <select onchange="updatePipelineActionType(${idx}, this.value)" style="background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; padding:0.45rem 0.6rem; color:#fff; font-size:0.82rem;">
                        <option value="run_script" ${act.type === 'run_script' ? 'selected' : ''}>🚀 Run Script</option>
                        <option value="send_alert" ${act.type === 'send_alert' ? 'selected' : ''}>🔔 Send Alert</option>
                        <option value="docker_action" ${act.type === 'docker_action' ? 'selected' : ''}>🐳 Docker</option>
                    </select>

                    <div>
                        ${act.type === 'run_script' ? `
                            <select onchange="currentPipelineActions[${idx}].target = this.value" style="width:100%; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; padding:0.45rem 0.6rem; color:#fff; font-size:0.82rem;">
                                ${getScriptOptionsHTML(act.target || '')}
                            </select>
                        ` : act.type === 'send_alert' ? `
                            <input type="text" placeholder="Alert message to send..." value="${act.message || ''}" oninput="currentPipelineActions[${idx}].message = this.value" style="width:100%; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; padding:0.45rem 0.6rem; color:#fff; font-size:0.82rem;">
                        ` : `
                            <div style="display:flex; gap:0.5rem;">
                                <select onchange="currentPipelineActions[${idx}].container = this.value" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; padding:0.45rem 0.6rem; color:#fff; font-size:0.82rem;">
                                    <option value="dockge">Dockge</option>
                                    <option value="jellyfin">Jellyfin</option>
                                    <option value="immich_server">Immich</option>
                                    <option value="vaultwarden">Vaultwarden</option>
                                    <option value="adguardhome">AdGuard Home</option>
                                    <option value="stirling-pdf">Stirling PDF</option>
                                </select>
                                <select onchange="currentPipelineActions[${idx}].action = this.value" style="width:100px; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:6px; padding:0.45rem 0.6rem; color:#fff; font-size:0.82rem;">
                                    <option value="restart">Restart</option>
                                    <option value="stop">Stop</option>
                                    <option value="start">Start</option>
                                </select>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `).join('');
    }

    function addPipelineActionStep() {
        currentPipelineActions.push({
            type: 'run_script',
            target: allScriptsData && allScriptsData[0] ? allScriptsData[0].id : 'video_processor.py'
        });
        renderPipelineActionStepsBuilder();
    }

    function removePipelineActionStep(idx) {
        currentPipelineActions.splice(idx, 1);
        renderPipelineActionStepsBuilder();
    }

    function updatePipelineActionType(idx, newType) {
        if (newType === 'run_script') {
            currentPipelineActions[idx] = {
                type: 'run_script',
                target: allScriptsData && allScriptsData[0] ? allScriptsData[0].id : 'video_processor.py'
            };
        } else if (newType === 'send_alert') {
            currentPipelineActions[idx] = {
                type: 'send_alert',
                title: 'Pipeline Step Notification',
                message: 'Automated workflow step triggered successfully.'
            };
        } else if (newType === 'docker_action') {
            currentPipelineActions[idx] = {
                type: 'docker_action',
                container: 'dockge',
                action: 'restart'
            };
        }
        renderPipelineActionStepsBuilder();
    }

    async function saveNewPipelineAction() {
        const name = document.getElementById('new-pipe-name').value.trim();
        const desc = document.getElementById('new-pipe-desc').value.trim();
        const trigType = document.getElementById('new-pipe-trig-type').value;
        const trigSrcEl = document.getElementById('new-pipe-trig-source');
        const trigSrc = trigSrcEl ? trigSrcEl.value.trim() : 'manual';

        if (!name) {
            showToast('Pipeline name is required', 'error');
            return;
        }

        if (!currentPipelineActions.length) {
            showToast('Please add at least one action step', 'error');
            return;
        }

        const payload = {
            name: name,
            desc: desc || "Automated action sequence",
            enabled: true,
            trigger: {
                type: trigType,
                source: trigSrc
            },
            actions: currentPipelineActions
        };

        try {
            const res = await fetch('/api/pipelines/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Pipeline created and deployed!', 'success');
                closeModal();
                loadPipelines();
            } else {
                showToast(data.error || 'Failed to save pipeline', 'error');
            }
        } catch (e) {
            showToast('Error saving pipeline', 'error');
        }
    }

    // ==========================================
    // --- 2. LOCAL AI OPS & OLLAMA CONTROLLER ---
    // ==========================================
    async function loadAiOpsStatus() {
        loadOpenCodeStatus();
        const badge = document.getElementById('ollama-status-badge');
        const modelsList = document.getElementById('ai-models-list');
        const countPill = document.getElementById('models-count-pill');
        const modelSelect = document.getElementById('copilot-model-select');

        try {
            const res = await fetch('/api/ai/models');
            const data = await res.json();

            if (data.running) {
                if (badge) {
                    badge.innerHTML = `<i class="fa-solid fa-circle" style="color:var(--accent-green); font-size:0.65rem;"></i> Ollama Online`;
                    badge.style.background = 'rgba(16, 185, 129, 0.15)';
                    badge.style.color = 'var(--accent-green)';
                    badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                }
            } else {
                if (badge) {
                    badge.innerHTML = `<i class="fa-solid fa-circle" style="color:var(--accent-amber); font-size:0.65rem;"></i> Ollama Offline`;
                    badge.style.background = 'rgba(245, 158, 11, 0.15)';
                    badge.style.color = '#f59e0b';
                    badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                }
            }

            const models = data.models || [];
            if (countPill) countPill.innerText = `${models.length} model${models.length === 1 ? '' : 's'}`;

            if (modelSelect && models.length) {
                modelSelect.innerHTML = models.map(m => `<option value="${m.name}">${m.name} (${m.size})</option>`).join('');
            }

            if (!models.length) {
                if (modelsList) {
                    modelsList.innerHTML = `
                        <div style="color:var(--text-secondary); text-align:center; padding:1.5rem; font-size:0.85rem;">
                            No Ollama models downloaded yet.<br>
                            <span style="font-size:0.78rem; color:var(--accent-cyan);">Type <code>tinyllama</code> or <code>mistral</code> above and click Pull!</span>
                        </div>
                    `;
                }
                return;
            }

            if (modelsList) {
                modelsList.innerHTML = models.map(m => `
                    <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 10px; padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: #fff; font-size: 0.9rem;">${m.name}</strong>
                            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem;">
                                Size: <span style="color: var(--accent-cyan); font-weight: 600;">${m.size}</span> | Updated: ${m.modified_at}
                            </div>
                        </div>
                        <button class="btn btn-secondary" onclick="deleteModelAction('${m.name}')" style="padding: 0.3rem 0.6rem; font-size: 0.72rem; color: var(--accent-red);" title="Delete Model">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                `).join('');
            }
        } catch (e) {
            if (modelsList) modelsList.innerHTML = `<div style="color:var(--accent-red);">Error fetching AI models.</div>`;
        }
    }

    async function startOllamaService() {
        showToast('Starting local AI engine (AMD GPU)...', 'info', 2500);
        try {
            const res = await fetch('/api/ai/start', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'AI engine startup requested', 'success');
            setTimeout(() => { loadAiOpsStatus(); loadSystemdServices(); }, 2000);
        } catch (e) {
            showToast('Failed to start AI engine', 'error');
        }
    }

    async function stopOllamaService() {
        showToast('Stopping AI daemons and background runners...', 'info', 2000);
        try {
            const res = await fetch('/api/ai/stop', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'AI services stopped', 'success');
            setTimeout(() => { loadAiOpsStatus(); loadSystemdServices(); }, 1500);
        } catch (e) {
            showToast('Failed to stop AI engine', 'error');
        }
    }

    async function restartOllamaService() {
        showToast('Restarting AI engine...', 'info', 2500);
        try {
            const res = await fetch('/api/ai/restart', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'AI engine restarted', 'success');
            setTimeout(() => { loadAiOpsStatus(); loadSystemdServices(); }, 2000);
        } catch (e) {
            showToast('Failed to restart AI engine', 'error');
        }
    }

    async function stopAiProcessesAction() {
        showToast('Terminating active AI inference processes...', 'info', 2000);
        try {
            const res = await fetch('/api/ai/kill', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'AI processes terminated and CPU reset.', 'success', 3500);
            const box = document.getElementById('copilot-response-box');
            if (box) {
                box.innerHTML = `[AI Process Terminated]: All active inference processes killed. CPU & RAM freed.`;
            }
            loadAiOpsStatus();
            loadSystemdServices();
        } catch (e) {
            showToast('Error stopping AI processes', 'error');
        }
    }

    async function pullModelAction() {
        const input = document.getElementById('pull-model-input');
        const modelName = input.value.trim();
        if (!modelName) {
            showToast('Enter a model name to pull (e.g. tinyllama)', 'error');
            return;
        }
        showToast(`Started pulling model '${modelName}' in background...`, 'info', 4000);
        input.value = '';
        try {
            const res = await fetch('/api/ai/models/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });
            const data = await res.json();
            showToast(data.message || 'Pull initiated', 'success');
        } catch (e) {
            showToast('Failed to initiate pull', 'error');
        }
    }

    async function deleteModelAction(modelName) {
        showConfirm('Remove Model', `Are you sure you want to delete model '${modelName}'?`, async () => {
            try {
                const res = await fetch('/api/ai/models/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: modelName })
                });
                const data = await res.json();
                showToast(data.message || 'Model deleted', 'success');
                loadAiOpsStatus();
            } catch (e) {
                showToast('Failed to delete model', 'error');
            }
        }, true);
    }

    function setCopilotPrompt(text) {
        const input = document.getElementById('copilot-input');
        if (input) {
            input.value = text;
            askCopilotAction();
        }
    }

    async function askCopilotAction() {
        const input = document.getElementById('copilot-input');
        const box = document.getElementById('copilot-response-box');
        const modelSelect = document.getElementById('copilot-model-select');
        const q = input.value.trim();
        if (!q) return;

        input.value = '';
        box.innerHTML = `> Query: ${q}\n\n🤖 Analyzing request with local AI (CPU thread capped)...\n`;

        try {
            const res = await fetch('/api/ai/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: q, model: modelSelect ? modelSelect.value : null })
            });
            const data = await res.json();
            if (data.success) {
                box.innerHTML = `> Query: ${q}\n\n🤖 [${data.model_used || 'AI Copilot'}]:\n${data.reply}`;
            } else {
                box.innerHTML = `> Query: ${q}\n\n⚠️ Error: ${data.error}`;
            }
        } catch (e) {
            box.innerHTML = `> Query: ${q}\n\n⚠️ Connection failed to Ops Copilot API.`;
        }
    }

    async function diagnoseLogWithAi(encodedLog, scriptName) {
        const logText = decodeURIComponent(encodedLog);
        document.getElementById('modal-title').innerText = `AI Diagnosis: ${scriptName}`;
        document.getElementById('modal-body').innerHTML = `
            <div style="padding: 1.5rem; text-align: center;">
                <div style="width: 50px; height: 50px; border-radius: 50%; border: 3px solid rgba(236,72,153,0.2); border-top-color: #ec4899; animation: spin 1s linear infinite; margin: 0 auto 1rem auto;"></div>
                <h4 style="font-size: 1.1rem; color: #fff; margin-bottom: 0.4rem;">Analyzing Log Traceback with Local AI...</h4>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Querying Ollama to isolate root cause, severity, and exact remediation steps.</p>
                <button class="btn btn-secondary" onclick="stopAiProcessesAction(); closeModal();" style="margin-top: 1rem; color: var(--accent-red); border-color: rgba(239,68,68,0.3);">
                    <i class="fa-solid fa-stop"></i> Cancel / Stop AI
                </button>
            </div>
        `;
        document.getElementById('viewer-modal').classList.add('active');

        try {
            const res = await fetch('/api/ai/diagnose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ log: logText, script_name: scriptName })
            });
            const data = await res.json();
            
            document.getElementById('modal-body').innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                        <span class="count-pill" style="background: rgba(236,72,153,0.15); color: #ec4899; border-color: rgba(236,72,153,0.3);">
                            <i class="fa-solid fa-brain"></i> Model: ${data.model_used || 'Ollama AI'}
                        </span>
                        <span style="font-size: 0.78rem; color: var(--text-secondary);">Target: <strong>${scriptName}</strong></span>
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-color); border-radius: 10px; padding: 1.25rem; font-size: 0.88rem; color: #e2e8f0; line-height: 1.6; white-space: pre-wrap;">
${data.analysis || 'Analysis could not be generated.'}
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
                        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                    </div>
                </div>
            `;
        } catch (e) {
            document.getElementById('modal-body').innerHTML = `<div style="color:var(--accent-red); padding:1rem;">Error running AI diagnosis.</div>`;
        }
    }

    // --- OPENCODE AI STUDIO CONTROLLER ---
    async function loadOpenCodeStatus() {
        const badge = document.getElementById('opencode-status-badge');
        if (!badge) return;
        try {
            const res = await fetch('/api/opencode/status');
            const data = await res.json();
            if (data.running) {
                badge.innerHTML = `<i class="fa-solid fa-circle" style="color:var(--accent-green); font-size:0.65rem;"></i> Online (:4096)`;
                badge.style.background = 'rgba(16, 185, 129, 0.15)';
                badge.style.color = 'var(--accent-green)';
                badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            } else {
                badge.innerHTML = `<i class="fa-solid fa-circle" style="color:var(--accent-amber); font-size:0.65rem;"></i> Offline`;
                badge.style.background = 'rgba(245, 158, 11, 0.15)';
                badge.style.color = '#f59e0b';
                badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            }
        } catch(e) {
            badge.innerText = 'Offline';
        }
    }

    async function startOpenCodeService() {
        showToast('Starting OpenCode AI Web Studio on :4096...', 'info', 2500);
        try {
            const res = await fetch('/api/opencode/start', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'OpenCode started', 'success');
            setTimeout(() => { loadOpenCodeStatus(); loadSystemdServices(); }, 2000);
        } catch(e) { showToast('Failed to start OpenCode', 'error'); }
    }

    async function stopOpenCodeService() {
        showToast('Stopping OpenCode server...', 'info', 2000);
        try {
            const res = await fetch('/api/opencode/stop', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'OpenCode stopped', 'success');
            setTimeout(() => { loadOpenCodeStatus(); loadSystemdServices(); }, 1500);
        } catch(e) { showToast('Failed to stop OpenCode', 'error'); }
    }

    async function restartOpenCodeService() {
        showToast('Restarting OpenCode server...', 'info', 2000);
        try {
            const res = await fetch('/api/opencode/restart', { method: 'POST' });
            const data = await res.json();
            showToast(data.message || 'OpenCode restarted', 'success');
            setTimeout(() => { loadOpenCodeStatus(); loadSystemdServices(); }, 2000);
        } catch(e) { showToast('Failed to restart OpenCode', 'error'); }
    }

    // ==========================================
    // --- 3. SMART DRIVES & STORAGE FORECAST ---
    // ==========================================
    async function loadSmartStorage() {
        const cardsContainer = document.getElementById('storage-forecast-cards');
        const drivesContainer = document.getElementById('drives-list-table');

        try {
            const res = await fetch('/api/smart-storage/stats');
            const data = await res.json();

            const root = data.root || {};
            const drives = data.drives || [];

            if (cardsContainer) {
                cardsContainer.innerHTML = `
                    <div style="background: rgba(18, 18, 18, 0.75); backdrop-filter: blur(16px); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem;">
                        <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">OS Root Storage (/)</span>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <h3 style="font-size: 1.5rem; font-weight: 800; color: #fff;">${root.used_gb} <span style="font-size: 0.85rem; color: var(--text-secondary);">/ ${root.total_gb} GB</span></h3>
                            <span class="count-pill" style="color: var(--accent-cyan);">${root.percent}%</span>
                        </div>
                        <div class="progress-bar-bg" style="margin-top: 0.25rem;">
                            <div class="progress-bar-fill" style="width: ${root.percent}%; background: var(--accent-cyan);"></div>
                        </div>
                    </div>

                    <div style="background: rgba(18, 18, 18, 0.75); backdrop-filter: blur(16px); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem;">
                        <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">Growth Velocity & Burn Rate</span>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <h3 style="font-size: 1.5rem; font-weight: 800; color: #fff;">+${root.daily_growth_gb} <span style="font-size: 0.85rem; color: var(--text-secondary);">GB / day</span></h3>
                            <span class="count-pill" style="color: var(--accent-green);">${root.burn_rate}</span>
                        </div>
                        <p style="font-size: 0.78rem; color: var(--text-secondary);">Calculated from persistent 30-day telemetry trends</p>
                    </div>

                    <div style="background: rgba(18, 18, 18, 0.75); backdrop-filter: blur(16px); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem;">
                        <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">90% Capacity Threshold</span>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <h3 style="font-size: 1.5rem; font-weight: 800; color: #f59e0b;">~${root.days_until_90} <span style="font-size: 0.85rem; color: var(--text-secondary);">days</span></h3>
                            <span style="font-size: 0.8rem; color: #f59e0b; font-weight: 600;">${root.date_until_90}</span>
                        </div>
                        <p style="font-size: 0.78rem; color: var(--text-secondary);">Estimated milestone before drive cleanup recommended</p>
                    </div>

                    <div style="background: rgba(18, 18, 18, 0.75); backdrop-filter: blur(16px); padding: 1.25rem; border-radius: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 0.5rem;">
                        <span style="font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase;">100% Full Exhaustion</span>
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <h3 style="font-size: 1.5rem; font-weight: 800; color: var(--accent-red);">~${root.days_until_100} <span style="font-size: 0.85rem; color: var(--text-secondary);">days</span></h3>
                            <span style="font-size: 0.8rem; color: var(--accent-red); font-weight: 600;">${root.date_until_100}</span>
                        </div>
                        <p style="font-size: 0.78rem; color: var(--text-secondary);">Predicted zero-byte disk exhaustion date</p>
                    </div>
                `;
            }

            if (drivesContainer) {
                if (!drives || drives.length === 0) {
                    drivesContainer.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding:1.5rem;">No physical block storage devices detected.</div>`;
                } else {
                    const tableHtml = `
                        <div class="drives-desktop-table table-responsive">
                            <table class="history-table" style="font-size: 0.82rem; width: 100%; min-width: 650px;">
                                <thead>
                                    <tr>
                                        <th>Device</th>
                                        <th>Model Name</th>
                                        <th>Capacity</th>
                                        <th>Type & Interface</th>
                                        <th>I/O Read / Write</th>
                                        <th>SMART Health Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${drives.map(d => {
                                        const score = parseInt(d.health_score) || 100;
                                        const color = score >= 90 ? 'var(--accent-green)' : (score >= 70 ? 'var(--accent-amber)' : 'var(--accent-red)');
                                        const bg = score >= 90 ? 'rgba(16,185,129,0.15)' : (score >= 70 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)');
                                        const border = score >= 90 ? 'rgba(16,185,129,0.3)' : (score >= 70 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)');
                                        const isSsd = d.is_ssd || (d.type && d.type.toLowerCase().includes('ssd'));
                                        const icon = isSsd ? 'fa-microchip' : 'fa-hard-drive';

                                        return `
                                            <tr>
                                                <td style="font-family:'JetBrains Mono', monospace; font-weight:700; color:var(--accent-cyan); white-space:nowrap;">
                                                    <i class="fa-solid ${icon}" style="font-size:0.8rem; margin-right:0.35rem; color:var(--accent-cyan);"></i>${escapeHtml(d.name)}
                                                </td>
                                                <td style="color:#fff; font-weight:600;">${escapeHtml(d.model || 'Generic Storage Drive')}</td>
                                                <td><span class="count-pill" style="font-size:0.75rem;">${escapeHtml(d.size || 'N/A')}</span></td>
                                                <td><span class="count-pill" style="font-size:0.75rem;">${escapeHtml(d.type || 'Block')} (${escapeHtml(d.interface || 'SATA')})</span></td>
                                                <td style="font-family:'JetBrains Mono', monospace; color:var(--text-secondary); font-size:0.78rem; white-space:nowrap;">
                                                    ↓ ${d.read_mb} MB / ↑ ${d.write_mb} MB
                                                </td>
                                                <td>
                                                    <span class="count-pill" style="background:${bg}; color:${color}; border-color:${border}; font-size:0.75rem; white-space:nowrap;">
                                                        <i class="fa-solid fa-heart-pulse"></i> ${d.health_score}% - ${escapeHtml(d.health_status || 'Healthy')}
                                                    </span>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;

                    const cardsHtml = `
                        <div class="drives-mobile-cards">
                            ${drives.map(d => {
                                const score = parseInt(d.health_score) || 100;
                                const color = score >= 90 ? 'var(--accent-green)' : (score >= 70 ? 'var(--accent-amber)' : 'var(--accent-red)');
                                const bg = score >= 90 ? 'rgba(16,185,129,0.15)' : (score >= 70 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)');
                                const border = score >= 90 ? 'rgba(16,185,129,0.3)' : (score >= 70 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)');
                                const isSsd = d.is_ssd || (d.type && d.type.toLowerCase().includes('ssd'));
                                const icon = isSsd ? 'fa-microchip' : 'fa-hard-drive';

                                return `
                                    <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid var(--border-color); border-radius: 12px; padding: 0.95rem; display: flex; flex-direction: column; gap: 0.65rem;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(6, 182, 212, 0.12); border: 1px solid rgba(6, 182, 212, 0.3); display: flex; align-items: center; justify-content: center; font-size: 0.88rem; color: var(--accent-cyan); flex-shrink: 0;">
                                                    <i class="fa-solid ${icon}"></i>
                                                </div>
                                                <div>
                                                    <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.95rem; font-weight: 800; color: var(--accent-cyan); line-height: 1.1;">/dev/${escapeHtml(d.name)}</div>
                                                    <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.1rem;">${escapeHtml(d.type || 'Block Device')}</div>
                                                </div>
                                            </div>
                                            <span class="count-pill" style="background: ${bg}; color: ${color}; border-color: ${border}; font-size: 0.72rem; font-weight: 700; padding: 0.28rem 0.6rem; flex-shrink: 0;">
                                                <i class="fa-solid fa-heart-pulse"></i> ${d.health_score}%
                                            </span>
                                        </div>

                                        <div>
                                            <div style="font-size: 0.88rem; font-weight: 700; color: #fff; line-height: 1.3;">${escapeHtml(d.model || 'Generic Storage Drive')}</div>
                                            <div style="font-size: 0.74rem; color: var(--text-secondary); margin-top: 0.15rem;">Health: <strong style="color: ${color};">${escapeHtml(d.health_status || 'Good / Healthy')}</strong></div>
                                        </div>

                                        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                                            <span class="stat-pill" style="font-size: 0.72rem; padding: 0.25rem 0.55rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;">
                                                <i class="fa-solid fa-database" style="color: var(--accent-cyan);"></i> Size: <strong>${escapeHtml(d.size || 'N/A')}</strong>
                                            </span>
                                            <span class="stat-pill" style="font-size: 0.72rem; padding: 0.25rem 0.55rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;">
                                                <i class="fa-solid fa-bolt" style="color: var(--accent-amber);"></i> Bus: <strong>${escapeHtml(d.interface || 'SATA')}</strong>
                                            </span>
                                            ${d.state ? `
                                            <span class="stat-pill" style="font-size: 0.72rem; padding: 0.25rem 0.55rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;">
                                                <i class="fa-solid fa-circle" style="font-size: 0.45rem; color: var(--accent-green);"></i> <strong>${escapeHtml(d.state)}</strong>
                                            </span>` : ''}
                                        </div>

                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; background: rgba(0, 0, 0, 0.25); padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                                            <div>
                                                <div style="font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                                                    <i class="fa-solid fa-arrow-down" style="color: #38bdf8;"></i> Total Read
                                                </div>
                                                <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 700; color: #fff; margin-top: 0.15rem;">
                                                    ${d.read_mb} <span style="font-size: 0.68rem; color: var(--text-secondary); font-weight: 400;">MB</span>
                                                </div>
                                                ${d.reads_completed ? `<div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 0.1rem;">${escapeHtml(d.reads_completed)} ops</div>` : ''}
                                            </div>
                                            <div>
                                                <div style="font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
                                                    <i class="fa-solid fa-arrow-up" style="color: var(--accent-amber);"></i> Total Write
                                                </div>
                                                <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 700; color: #fff; margin-top: 0.15rem;">
                                                    ${d.write_mb} <span style="font-size: 0.68rem; color: var(--text-secondary); font-weight: 400;">MB</span>
                                                </div>
                                                ${d.writes_completed ? `<div style="font-size: 0.65rem; color: var(--text-secondary); margin-top: 0.1rem;">${escapeHtml(d.writes_completed)} ops</div>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;

                    drivesContainer.innerHTML = tableHtml + cardsHtml;
                }
            }
        } catch (e) {
            if (cardsContainer) cardsContainer.innerHTML = `<div style="color:var(--accent-red);">Error loading storage forecast.</div>`;
        }

        // Fast Storage Space Breakdown
        try {
            const resBreakdown = await fetch('/api/storage/breakdown');
            const dataBreakdown = await resBreakdown.json();
            const capPill = document.getElementById('fast-storage-capacity-pill');
            const bar = document.getElementById('fast-storage-stacked-bar');
            const catGrid = document.getElementById('fast-storage-categories-grid');

            if (capPill && dataBreakdown.used_gb) {
                capPill.textContent = `${dataBreakdown.used_gb} GB / ${dataBreakdown.total_gb} GB (${dataBreakdown.percent}%)`;
            }

            const usedTotal = dataBreakdown.used_gb || 1;
            if (bar && dataBreakdown.categories) {
                bar.innerHTML = dataBreakdown.categories
                    .map(c => {
                        const pct = Math.round((c.size_gb / usedTotal) * 100);
                        return `<div title="${escapeHtml(c.name)}: ${c.size_gb} GB (${pct}%)" style="width: ${pct}%; background: ${c.color}; transition: width 0.3s ease;"></div>`;
                    })
                    .join('');
            }

            if (catGrid && dataBreakdown.categories) {
                catGrid.innerHTML = dataBreakdown.categories.map(c => {
                    const pct = Math.round((c.size_gb / usedTotal) * 100);
                    return `
                        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 10px; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.35rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.8rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.4rem;">
                                    <i class="fa-solid ${c.icon}" style="color: ${c.color};"></i> ${escapeHtml(c.name)}
                                </span>
                                <span class="count-pill" style="font-size: 0.72rem; color: ${c.color}; border-color: ${c.color}40;">${pct}%</span>
                            </div>
                            <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; font-weight: 800; color: #fff;">
                                ${c.size_gb} GB
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-secondary);">${escapeHtml(c.folder)}</div>
                        </div>
                    `;
                }).join('');
            }
        } catch (e) {
            console.error('Error loading storage breakdown:', e);
        }

        // Safe Junk Cleaner Scan
        try {
            const resJunk = await fetch('/api/storage/cleaner/scan');
            const dataJunk = await resJunk.json();
            const junkPill = document.getElementById('reclaimable-junk-pill');
            if (junkPill && dataJunk.reclaimable_str) {
                junkPill.textContent = dataJunk.reclaimable_str;
            }
        } catch (e) {
            console.error('Error scanning safe cleaner:', e);
        }

        loadLargestFilesList();
        loadDockerStorageDf();
    }

    async function loadLargestFilesList() {
        const container = document.getElementById('largest-files-table-container');
        if (!container) return;
        try {
            const res = await fetch('/api/storage/largest-files?limit=15');
            const data = await res.json();
            const files = Array.isArray(data) ? data : (data.files || []);
            if (files.length === 0) {
                container.innerHTML = `<div style="color:var(--text-secondary); padding:1rem;">No large files detected in fast storage.</div>`;
                return;
            }
            container.innerHTML = `
                <div class="table-responsive">
                    <table class="history-table" style="font-size: 0.82rem; width: 100%;">
                        <thead>
                            <tr>
                                <th style="width: 50px;">#</th>
                                <th>Filename & Path</th>
                                <th>Category</th>
                                <th>File Size</th>
                                <th>Modified</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${files.map((f, i) => `
                                <tr>
                                    <td style="color: var(--text-secondary); font-weight: 700;">#${i + 1}</td>
                                    <td>
                                        <div style="font-weight: 700; color: #fff; display: flex; align-items: center; gap: 0.45rem;">
                                            <i class="fa-regular fa-file-video" style="color: var(--accent-cyan); font-size: 0.85rem;"></i>
                                            <span title="${escapeHtml(f.path || '')}">${escapeHtml(f.name || '')}</span>
                                        </div>
                                        <div style="font-size: 0.7rem; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; margin-top: 0.15rem; max-width: 480px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(f.path || '')}">
                                            ${escapeHtml(f.path || '')}
                                        </div>
                                    </td>
                                    <td>
                                        <span class="count-pill" style="font-size: 0.74rem;">
                                            <i class="fa-solid fa-film" style="margin-right: 0.25rem;"></i>${escapeHtml(f.category || 'Media')}
                                        </span>
                                    </td>
                                    <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #00f2fe; white-space: nowrap;">
                                        ${escapeHtml(f.size_str || (f.size_gb + ' GB'))}
                                    </td>
                                    <td style="color: var(--text-secondary); font-size: 0.78rem; white-space: nowrap;">
                                        ${escapeHtml(f.modified || 'Recent')}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            if (container) container.innerHTML = `<div style="color:var(--accent-red); padding:1rem;">Failed to scan largest files.</div>`;
        }
    }

    async function runSafeJunkCleanerAction() {
        const btn = document.getElementById('btn-prune-safe-junk');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cleaning...`;
        }
        try {
            const res = await fetch('/api/storage/cleaner/prune', { method: 'POST' });
            const data = await res.json();
            const count = data.deleted_count || 0;
            const recl = data.reclaimed_str || '0 MB';
            showToast(`Safe cleanup complete! Freed ${recl} across ${count} temporary files.`, 'success', 4000);
            loadSmartStorage();
        } catch (e) {
            showToast('Failed to execute safe storage cleanup.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-broom"></i> Clean Safe Junk (<span id="reclaimable-junk-pill">0 MB</span>)`;
            }
        }
    }

    // ==========================================
    // --- WATCHDOG CONTROLLER ---
    // ==========================================
    async function loadWatchdogStatus() {
        const badge = document.getElementById('watchdog-active-badge');
        const toggleBtn = document.getElementById('btn-watchdog-toggle');
        const grid = document.getElementById('watchdog-services-grid');
        const incidentsContainer = document.getElementById('watchdog-incidents-container');
        const lastCheckLabel = document.getElementById('watchdog-last-check-label');

        try {
            const res = await fetch('/api/homelab/watchdog/status');
            const data = await res.json();

            if (badge) {
                if (data.enabled) {
                    badge.style.background = 'rgba(16,185,129,0.15)';
                    badge.style.color = 'var(--accent-green)';
                    badge.style.borderColor = 'rgba(16,185,129,0.3)';
                    badge.textContent = 'Active (Autonomous)';
                } else {
                    badge.style.background = 'rgba(245,158,11,0.15)';
                    badge.style.color = 'var(--accent-amber)';
                    badge.style.borderColor = 'rgba(245,158,11,0.3)';
                    badge.textContent = 'Standby (Manual)';
                }
            }

            if (toggleBtn) {
                if (data.enabled) {
                    toggleBtn.innerHTML = `<i class="fa-solid fa-power-off" style="color:var(--accent-green);"></i> Auto-Heal: ON`;
                    toggleBtn.style.borderColor = 'rgba(16,185,129,0.4)';
                } else {
                    toggleBtn.innerHTML = `<i class="fa-solid fa-power-off" style="color:var(--accent-amber);"></i> Auto-Heal: OFF`;
                    toggleBtn.style.borderColor = 'rgba(245,158,11,0.4)';
                }
            }

            if (lastCheckLabel) {
                lastCheckLabel.textContent = `Last Health Sweep: ${data.last_sweep || 'Just now'}`;
            }

            if (grid) {
                const targets = data.monitored_targets || [];
                if (targets.length === 0) {
                    grid.innerHTML = `<div style="color:var(--text-secondary); padding:0.5rem;">No daemons registered for monitoring.</div>`;
                } else {
                    grid.innerHTML = targets.map(t => {
                        const isRunning = t.status === 'running';
                        const iconColor = isRunning ? 'var(--accent-green)' : 'var(--accent-red)';
                        const statusBg = isRunning ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)';
                        const statusBorder = isRunning ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)';
                        const typeIcon = t.type === 'docker' ? 'fa-docker fa-brands' : 'fa-gear fa-solid';

                        return `
                            <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 12px; padding: 0.95rem; display: flex; flex-direction: column; gap: 0.55rem;">
                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                    <div style="display:flex; align-items:center; gap:0.45rem;">
                                        <i class="${typeIcon}" style="color:var(--accent-cyan); font-size:0.95rem;"></i>
                                        <span style="font-weight:700; color:#fff; font-size:0.88rem;">${escapeHtml(t.name)}</span>
                                    </div>
                                    <span class="count-pill" style="background:${statusBg}; color:${iconColor}; border-color:${statusBorder}; font-size:0.72rem; font-weight:700;">
                                        ${isRunning ? 'RUNNING' : 'OFFLINE'}
                                    </span>
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-secondary); display:flex; justify-content:space-between;">
                                    <span>Type: <strong style="color:#fff;">${escapeHtml(t.type)}</strong></span>
                                    <span>Restarts (15m): <strong style="color:${t.restarts_in_window > 0 ? 'var(--accent-amber)' : 'var(--text-secondary)'};">${t.restarts_in_window}/2</strong></span>
                                </div>
                                <div style="font-size:0.72rem; color:var(--text-secondary); background:rgba(255,255,255,0.03); padding:0.35rem 0.5rem; border-radius:6px; font-family:'JetBrains Mono', monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                    ${escapeHtml(t.details || 'Operational')}
                                </div>
                            </div>
                        `;
                    }).join('');
                }
            }

            if (incidentsContainer) {
                const incidents = data.incidents || [];
                if (incidents.length === 0) {
                    incidentsContainer.innerHTML = `<div style="color:var(--text-secondary); font-size:0.8rem; padding:0.25rem 0;"><i class="fa-solid fa-check" style="color:var(--accent-green); margin-right:0.4rem;"></i> No recent crashes or auto-healing events. All systems stable.</div>`;
                } else {
                    incidentsContainer.innerHTML = incidents.slice(0, 5).map(inc => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:0.4rem 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.8rem;">
                            <div>
                                <span style="font-weight:700; color:#fff;">${escapeHtml(inc.target)}</span>
                                <span style="color:var(--text-secondary); margin-left:0.5rem;">${escapeHtml(inc.reason || 'Crashed / Unreachable')}</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:0.5rem;">
                                <span class="count-pill" style="font-size:0.7rem; color:var(--accent-green); border-color:rgba(16,185,129,0.3);">${escapeHtml(inc.action)}</span>
                                <span style="font-size:0.72rem; color:var(--text-secondary);">${escapeHtml(inc.timestamp)}</span>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (e) {
            if (grid) grid.innerHTML = `<div style="color:var(--accent-red); font-size:0.82rem;">Failed to fetch watchdog telemetry.</div>`;
        }
    }

    async function toggleWatchdogAction() {
        try {
            const res = await fetch('/api/homelab/watchdog/toggle', { method: 'POST' });
            const data = await res.json();
            if (data.status === 'success') {
                showToast(`Watchdog auto-healing is now ${data.enabled ? 'ENABLED' : 'PAUSED'}.`, 'info', 3000);
                loadWatchdogStatus();
            }
        } catch (e) {
            showToast('Failed to toggle watchdog state.', 'error');
        }
    }

    async function runWatchdogSweepAction() {
        showToast('Running instantaneous health sweep on all daemons...', 'info', 2000);
        try {
            const res = await fetch('/api/homelab/watchdog/heal-now', { method: 'POST' });
            const data = await res.json();
            const count = (data.restarted || []).length;
            if (count > 0) {
                showToast(`Health sweep complete: recovered ${count} crashed services!`, 'warning', 4000);
            } else {
                showToast('Health sweep complete: all 5 monitored services are running smoothly.', 'success', 3500);
            }
            loadWatchdogStatus();
        } catch (e) {
            showToast('Failed to run watchdog sweep.', 'error');
        }
    }

    function closeModal() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        if (updateLogTimer) clearInterval(updateLogTimer);
    }

    // Auto-sync body scroll lock whenever a modal becomes active/inactive
    const modalObserver = new MutationObserver(() => {
        const hasActiveModal = !!document.querySelector('.modal.active');
        document.body.classList.toggle('modal-open', hasActiveModal);
        document.body.style.overflow = hasActiveModal ? 'hidden' : '';
    });
    document.querySelectorAll('.modal').forEach(m => {
        modalObserver.observe(m, { attributes: true, attributeFilter: ['class'] });
        // Close modal when clicking backdrop outside modal-content
        m.addEventListener('click', (e) => {
            if (e.target === m) closeModal();
        });
    });

    // Close active modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.querySelector('.modal.active')) {
            closeModal();
        }
    });

    // Dynamic Environment Badge & Isolation
    function updateEnvironmentBadge() {
        const isDev = (window.location.port === '6999' || window.location.pathname.includes('dev'));
        const envBadge = document.getElementById('env-badge');
        const envLabel = document.getElementById('env-label');
        const envDot = document.getElementById('env-pulse-dot');
        if (envBadge && envLabel && envDot) {
            if (isDev) {
                envBadge.style.background = 'rgba(168, 85, 247, 0.15)';
                envBadge.style.color = '#c084fc';
                envBadge.style.borderColor = 'rgba(168, 85, 247, 0.35)';
                envDot.style.background = '#a855f7';
                envLabel.innerText = 'DEV';
            } else {
                envBadge.style.background = 'rgba(16, 185, 129, 0.15)';
                envBadge.style.color = 'var(--accent-green)';
                envBadge.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                envDot.style.background = 'var(--accent-green)';
                envLabel.innerText = 'ACTIVE';
            }
        }

        if (!isDev) {
            document.querySelectorAll('.dev-only-tab').forEach(el => el.remove());
            const promoView = document.getElementById('promotion-tab-view');
            if (promoView) promoView.remove();
        }
    }

    updateEnvironmentBadge();
    updateThemeUIState();

    // Instant First-Paint from Local Cache (0ms delay)
    try {
        const cachedScripts = localStorage.getItem('cached_scripts_data');
        if (cachedScripts) {
            allScriptsData = JSON.parse(cachedScripts);
            renderContent(false);
        }
    } catch(e) {}

    loadStats();
    loadScripts(true);
    setTimeout(loadTelemetryChart, 1000);
    setTimeout(loadWatchdogStatus, 1500);

    // --- PWA SERVICE WORKER REGISTRATION ---
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
    }

    // --- 1. DNS PAUSE PROTECTION TIMER CONTROLLER ---
    async function checkDnsProtectionStatus() {
        try {
            const res = await fetch('/api/dns/protection-status');
            const data = await res.json();
            const badge = document.getElementById('dns-protection-badge');
            if (badge) {
                if (data.status === 'Active' || data.enabled) {
                    badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size:0.5rem; vertical-align:middle; color:var(--accent-green);"></i> Active & Filtering`;
                    badge.style.background = 'rgba(52, 211, 153, 0.15)';
                    badge.style.color = 'var(--accent-green)';
                    badge.style.borderColor = 'rgba(52, 211, 153, 0.3)';
                } else {
                    badge.innerHTML = `<i class="fa-solid fa-pause" style="font-size:0.6rem; vertical-align:middle; color:var(--accent-amber);"></i> Protection Paused`;
                    badge.style.background = 'rgba(251, 191, 36, 0.15)';
                    badge.style.color = 'var(--accent-amber)';
                    badge.style.borderColor = 'rgba(251, 191, 36, 0.3)';
                }
            }
        } catch (e) {}
    }

    async function pauseDnsProtection(duration = '5m') {
        try {
            showToast(`Pausing DNS protection for ${duration}...`, 'info', 2000);
            const res = await fetch('/api/dns/pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration: duration })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`DNS protection paused for ${duration}!`, 'warning', 4000);
                checkDnsProtectionStatus();
            } else {
                showToast(data.error || 'Failed to pause DNS', 'error');
            }
        } catch (e) {
            showToast('Error communicating with DNS service', 'error');
        }
    }

    async function resumeDnsProtection() {
        try {
            const res = await fetch('/api/dns/resume', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast('DNS protection shield resumed!', 'success', 3000);
                checkDnsProtectionStatus();
            } else {
                showToast(data.error || 'Failed to resume DNS', 'error');
            }
        } catch (e) {
            showToast('Error communicating with DNS service', 'error');
        }
    }

    async function flushUnboundCache() {
        try {
            showToast('Flushing Unbound DNS cache...', 'info', 2000);
            const res = await fetch('/api/dns/unbound/flush', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                showToast('Unbound DNS cache flushed successfully!', 'success');
            } else {
                showToast(data.error || 'Failed to flush Unbound cache', 'error');
            }
        } catch (e) {
            showToast('Error communicating with Unbound service', 'error');
        }
    }

    async function restartUnbound() {
        showConfirm(
            "Restart Unbound Resolver",
            "Restart the local Unbound DNS recursive resolver daemon (port 5335)?",
            async () => {
                try {
                    showToast('Restarting Unbound service...', 'info', 2000);
                    const res = await fetch('/api/dns/unbound/restart', { method: 'POST' });
                    const data = await res.json();
                    if (res.ok) {
                        showToast('Unbound recursive resolver restarted!', 'success');
                    } else {
                        showToast(data.error || 'Failed to restart Unbound', 'error');
                    }
                } catch (e) {
                    showToast('Error restarting Unbound service', 'error');
                }
            }
        );
    }

    // --- 2. CONTAINER LIVE LOG VIEWER MODAL ---
    let logAutoRefreshInterval = null;

    async function openContainerLogsModal(containerId, containerName) {
        if (logAutoRefreshInterval) {
            clearInterval(logAutoRefreshInterval);
            logAutoRefreshInterval = null;
        }
        const modal = document.getElementById('viewer-modal');
        document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-terminal" style="color:var(--accent-cyan)"></i> Logs: ${containerName}`;
        document.getElementById('modal-body').innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; flex-wrap:wrap; gap:0.5rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <button class="btn btn-secondary" style="font-size:0.78rem; padding:0.4rem 0.75rem;" onclick="fetchContainerLogs('${containerId}')">
                        <i class="fa-solid fa-rotate-right"></i> Refresh
                    </button>
                    <label style="font-size:0.78rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.4rem; cursor:pointer;">
                        <input type="checkbox" id="logs-auto-refresh" onchange="toggleLogsAutoRefresh('${containerId}')" style="cursor:pointer; width:15px; height:15px;"> Auto-Refresh (3s)
                    </label>
                </div>
                <button class="btn btn-secondary" style="font-size:0.78rem; padding:0.4rem 0.75rem;" onclick="copyContainerLogs()">
                    <i class="fa-solid fa-copy"></i> Copy Logs
                </button>
            </div>
            <pre id="container-logs-output" style="background:#09090b; color:#38bdf8; font-family:'JetBrains Mono', monospace; font-size:0.75rem; line-height:1.45; padding:1rem; border-radius:10px; border:1px solid rgba(255,255,255,0.1); max-height:480px; overflow-y:auto; white-space:pre-wrap; word-break:break-all;">Loading container logs...</pre>
        `;
        modal.classList.add('active');
        await fetchContainerLogs(containerId);
    }

    async function fetchContainerLogs(containerId) {
        const out = document.getElementById('container-logs-output');
        if (!out) return;
        try {
            const res = await fetch(`/api/homelab/service/${containerId}/logs`);
            const data = await res.json();
            out.textContent = data.logs || 'No log output available.';
            out.scrollTop = out.scrollHeight;
        } catch (e) {
            out.textContent = 'Error fetching container logs: ' + e;
        }
    }

    function toggleLogsAutoRefresh(containerId) {
        const chk = document.getElementById('logs-auto-refresh');
        if (logAutoRefreshInterval) {
            clearInterval(logAutoRefreshInterval);
            logAutoRefreshInterval = null;
        }
        if (chk && chk.checked) {
            logAutoRefreshInterval = setInterval(() => {
                const modal = document.getElementById('viewer-modal');
                if (modal && modal.classList.contains('active')) {
                    fetchContainerLogs(containerId);
                } else {
                    clearInterval(logAutoRefreshInterval);
                    logAutoRefreshInterval = null;
                }
            }, 3000);
        }
    }

    function copyContainerLogs() {
        const out = document.getElementById('container-logs-output');
        if (out && out.textContent) {
            navigator.clipboard.writeText(out.textContent);
            showToast('Logs copied to clipboard!', 'success', 2000);
        }
    }

    // --- 4. DOCKER STORAGE BREAKDOWN & GARBAGE COLLECTOR ---
    async function loadDockerStorageDf() {
        const container = document.getElementById('docker-df-container');
        const pill = document.getElementById('docker-reclaimable-pill');
        if (!container) return;
        try {
            const res = await fetch('/api/storage/docker-df');
            const data = await res.json();
            if (pill) pill.innerText = data.total_reclaimable || '0B';
            
            const items = data.items || [];
            if (!items.length) {
                container.innerHTML = `<div style="color:var(--text-secondary); font-size:0.85rem;">No Docker disk usage telemetry available.</div>`;
                return;
            }

            let cardsHtml = `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:0.85rem;">`;
            items.forEach(item => {
                const icon = item.type.toLowerCase().includes('image') ? 'fa-layer-group'
                           : item.type.toLowerCase().includes('container') ? 'fa-box'
                           : item.type.toLowerCase().includes('volume') ? 'fa-database' : 'fa-hard-drive';
                cardsHtml += `
                    <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:12px; padding:0.9rem 1.1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                            <span style="font-size:0.82rem; font-weight:700; color:var(--accent-cyan); display:flex; align-items:center; gap:0.4rem;">
                                <i class="fa-solid ${icon}"></i> ${item.type}
                            </span>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">${item.active} Active / ${item.total} Total</span>
                        </div>
                        <div style="font-size:1.15rem; font-weight:800; color:#fff; margin-bottom:0.2rem;">${item.size}</div>
                        <div style="font-size:0.74rem; color:var(--accent-amber);">Reclaimable: <strong>${item.reclaimable}</strong></div>
                    </div>
                `;
            });
            cardsHtml += `</div>`;
            container.innerHTML = cardsHtml;
        } catch (e) {
            container.innerHTML = `<div style="color:var(--accent-red); font-size:0.85rem;">Failed to load Docker storage data.</div>`;
        }
    }

    async function runDockerPrune() {
        const modal = document.getElementById('viewer-modal');
        document.getElementById('modal-title').innerHTML = `<i class="fa-brands fa-docker" style="color:#38bdf8;"></i> Docker Garbage Collector & Image Manager`;
        document.getElementById('modal-body').innerHTML = `
            <div style="text-align:center; padding:2rem 1rem; color:var(--text-secondary);">
                <i class="fa-solid fa-spinner fa-spin" style="font-size:1.5rem; color:var(--accent-cyan); margin-bottom:0.75rem;"></i>
                <div>Analyzing Docker disk usage & stored images...</div>
            </div>
        `;
        modal.classList.add('active');

        try {
            const res = await fetch('/api/storage/docker-df');
            const data = await res.json();
            const unusedImages = data.unused_images || [];
            const reclaimable = data.total_reclaimable || '0B';

            document.getElementById('modal-body').innerHTML = `
                <div style="display:flex; flex-direction:column; gap:0.95rem; padding:0.2rem;">
                    <!-- Explanation Alert -->
                    <div style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); border-radius:12px; padding:0.85rem 1rem;">
                        <div style="font-size:0.84rem; font-weight:700; color:var(--accent-amber); display:flex; align-items:center; gap:0.45rem; margin-bottom:0.3rem;">
                            <i class="fa-solid fa-circle-info"></i> Why Does Docker Report ${reclaimable} Reclaimable?
                        </div>
                        <div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.45;">
                            Docker marks all <strong>inactive stored images</strong> (images with no running container, e.g. stopped Jellyfin, Dockge, or alternate ML models) as reclaimable.
                            Standard <strong>Safe Prune</strong> protects your stopped stack images, while <strong>Deep Clean</strong> wipes them to reclaim disk space.
                        </div>
                    </div>

                    <!-- Action Cards -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem;">
                        <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:12px; padding:0.95rem; display:flex; flex-direction:column; justify-content:space-between; gap:0.75rem;">
                            <div>
                                <div style="font-size:0.88rem; font-weight:700; color:#fff; display:flex; align-items:center; gap:0.4rem;">
                                    <i class="fa-solid fa-shield-halved" style="color:var(--accent-green);"></i> Safe Prune (Dangling & Cache)
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.35rem; line-height:1.4;">
                                    Removes untagged intermediate layers, stopped containers, and build cache. <strong>100% safe</strong>: keeps all named homelab images intact.
                                </div>
                            </div>
                            <button class="btn btn-secondary" onclick="executeDockerPruneAction('safe')" style="justify-content:center; font-size:0.8rem; padding:0.55rem; width:100%;">
                                <i class="fa-solid fa-broom"></i> Run Safe Prune
                            </button>
                        </div>

                        <div style="background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.3); border-radius:12px; padding:0.95rem; display:flex; flex-direction:column; justify-content:space-between; gap:0.75rem;">
                            <div>
                                <div style="font-size:0.88rem; font-weight:700; color:var(--accent-red); display:flex; align-items:center; gap:0.4rem;">
                                    <i class="fa-solid fa-trash-can"></i> Deep Wipe All (${reclaimable})
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.35rem; line-height:1.4;">
                                    Deletes all ${unusedImages.length} inactive images to reclaim the full ${reclaimable}. (Images can be re-pulled whenever you start those containers).
                                </div>
                            </div>
                            <button class="btn btn-danger" onclick="executeDockerPruneAction('all')" style="justify-content:center; font-size:0.8rem; padding:0.55rem; width:100%; background:linear-gradient(135deg, #ef4444, #b91c1c); color:#fff; border:none;">
                                <i class="fa-solid fa-trash"></i> Wipe All Inactive Images
                            </button>
                        </div>
                    </div>

                    <!-- Inactive Images List with 1-Click Individual Trash -->
                    <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:12px; padding:0.85rem;">
                        <div style="font-size:0.82rem; font-weight:700; color:#fff; margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.4rem;">
                            <span><i class="fa-solid fa-layer-group" style="color:var(--accent-cyan);"></i> Inactive Images on Disk (${unusedImages.length})</span>
                            <span style="font-size:0.72rem; color:var(--text-secondary);">Click trash to delete single image</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:0.45rem; max-height:220px; overflow-y:auto; -webkit-overflow-scrolling:touch;">
                            ${unusedImages.length === 0 ? '<div style="color:var(--text-secondary); font-size:0.78rem; text-align:center; padding:0.8rem;">No inactive images found. All images have active containers!</div>' : ''}
                            ${unusedImages.map(img => `
                                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); padding:0.5rem 0.75rem; border-radius:8px;">
                                    <div style="min-width:0; flex:1; margin-right:0.75rem;">
                                        <div style="font-family:'JetBrains Mono', monospace; font-size:0.78rem; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                            ${escapeHtml(img.name)}
                                        </div>
                                        <div style="font-size:0.68rem; color:var(--text-secondary);">${escapeHtml(img.size)} • ID: ${escapeHtml(img.id.substring(0, 12))}</div>
                                    </div>
                                    <button class="btn btn-secondary" onclick="executeDockerPruneAction('image', '${escapeHtml(img.id)}', '${escapeHtml(img.name)}')" style="padding:0.3rem 0.6rem; font-size:0.72rem; color:var(--accent-red); border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.1);" title="Delete only this image">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            document.getElementById('modal-body').innerHTML = `<div style="color:var(--accent-red); padding:1rem; text-align:center;">Failed to analyze Docker storage data.</div>`;
        }
    }

    async function executeDockerPruneAction(mode, imageId = null, imageName = null) {
        if (mode === 'all') {
            const confirmed = confirm("Are you sure you want to wipe ALL inactive Docker images? This will free all inactive image space, but you will need an internet connection to re-pull images for stopped containers.");
            if (!confirmed) return;
        }

        closeModal();
        showToast(mode === 'all' ? 'Deep wiping inactive Docker images...' : (mode === 'image' ? `Deleting image ${imageName}...` : 'Pruning Docker dangling resources...'), 'info', 3000);

        try {
            const res = await fetch('/api/storage/docker-prune', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: mode, image_id: imageId })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || `Docker cleanup complete! Reclaimed ${data.reclaimed}.`, 'success', 4000);
                loadDockerStorageDf();
                loadStats();
            } else {
                showToast(data.error || 'Failed to complete Docker cleanup', 'error');
            }
        } catch (e) {
            showToast('Error executing Docker cleanup action', 'error');
        }
    }

    // --- 5. MOBILE QUICK ACTIONS MODAL ---
    function openQuickActionModal() {
        const modal = document.getElementById('viewer-modal');
        const dockerPill = document.getElementById('docker-reclaimable-pill')?.innerText;
        const dockerSubtext = dockerPill && dockerPill !== '0B' ? ` <span style="font-size:0.7rem; color:var(--accent-amber); font-weight:700;">(${dockerPill})</span>` : '';

        document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-bolt-lightning" style="color:var(--accent-cyan)"></i> Quick Actions`;
        document.getElementById('modal-body').innerHTML = `
            <div style="display:flex; flex-direction:column; gap:0.9rem; padding:0.2rem;">
                <div style="font-size:0.82rem; color:var(--text-secondary);">
                    Instant 1-tap controls for rapid server operations on mobile.
                </div>

                <!-- DNS Pause Controls -->
                <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:12px; padding:0.85rem;">
                    <div style="font-size:0.85rem; font-weight:700; color:#fff; margin-bottom:0.6rem; display:flex; align-items:center; gap:0.5rem;">
                        <i class="fa-solid fa-shield-virus" style="color:var(--accent-amber)"></i> Pause DNS Protection
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:0.4rem;">
                        <button class="btn btn-secondary" onclick="pauseDnsProtection('5m'); closeModal();" style="justify-content:center; font-size:0.75rem; padding:0.45rem;">5m</button>
                        <button class="btn btn-secondary" onclick="pauseDnsProtection('15m'); closeModal();" style="justify-content:center; font-size:0.75rem; padding:0.45rem;">15m</button>
                        <button class="btn btn-primary" onclick="resumeDnsProtection(); closeModal();" style="justify-content:center; font-size:0.75rem; padding:0.45rem; background:linear-gradient(135deg,#10b981,#059669);">Resume</button>
                    </div>
                </div>

                <!-- Storage & Update -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem;">
                    <button class="btn btn-secondary" onclick="runDockerPrune();" style="justify-content:center; padding:0.75rem; font-size:0.82rem; display:flex; flex-direction:column; gap:0.35rem; text-align:center;">
                        <i class="fa-solid fa-broom" style="color:var(--accent-amber); font-size:1.15rem;"></i>
                        <span>Clean Docker${dockerSubtext}</span>
                    </button>
                    <button class="btn btn-secondary" onclick="triggerUpdateAll();" style="justify-content:center; padding:0.75rem; font-size:0.82rem; display:flex; flex-direction:column; gap:0.35rem; text-align:center;">
                        <i class="fa-solid fa-arrows-rotate" style="color:var(--accent-cyan); font-size:1.15rem;"></i>
                        <span>Update System</span>
                    </button>
                </div>

                <!-- Settings & Navigation -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem;">
                    <button class="btn btn-secondary" onclick="openAlertsModal();" style="justify-content:center; padding:0.75rem; font-size:0.82rem; display:flex; flex-direction:column; gap:0.35rem; text-align:center;">
                        <i class="fa-solid fa-bell" style="color:#a855f7; font-size:1.15rem;"></i>
                        <span>Alerts & Settings</span>
                    </button>
                    <button class="btn btn-secondary" onclick="switchCategory('smart-storage-tab'); closeModal();" style="justify-content:center; padding:0.75rem; font-size:0.82rem; display:flex; flex-direction:column; gap:0.35rem; text-align:center;">
                        <i class="fa-solid fa-hard-drive" style="color:#06b6d4; font-size:1.15rem;"></i>
                        <span>SMART Storage</span>
                    </button>
                </div>

                <!-- Tablet / Kiosk Mode -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem;">
                    <a href="/lite" target="_blank" class="btn btn-secondary" style="justify-content:center; padding:0.75rem; font-size:0.82rem; display:flex; flex-direction:column; gap:0.35rem; text-align:center; text-decoration:none; color:var(--text-primary); border-color:rgba(16,185,129,0.35);">
                        <i class="fa-solid fa-tablet-screen-button" style="color:#10b981; font-size:1.15rem;"></i>
                        <span>Open Wall Kiosk</span>
                    </a>
                    <button class="btn btn-secondary" onclick="remoteReloadKiosk();" style="justify-content:center; padding:0.75rem; font-size:0.82rem; display:flex; flex-direction:column; gap:0.35rem; text-align:center; border-color:rgba(59,130,246,0.35);">
                        <i class="fa-solid fa-arrows-rotate" style="color:#3b82f6; font-size:1.15rem;"></i>
                        <span>Reload Tablet Screen</span>
                    </button>
                </div>
            </div>
        `;
        modal.classList.add('active');
    }

    async function remoteReloadKiosk() {
        try {
            const res = await fetch('/api/kiosk/reload', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('🔄 Signal sent! Wall tablet screen will reload momentarily.', 'success');
            } else {
                showToast('Failed to trigger tablet reload', 'error');
            }
        } catch (e) {
            showToast('Error sending reload signal', 'error');
        }
    }

    // Smart Polling: Pause when page is hidden/minimized to save mobile battery & CPU
    setInterval(() => {
        if (document.hidden) return;
        loadScripts(false);
    }, 6000);

    setInterval(() => {
        if (document.hidden) return;
        loadStats();
    }, 5000);

    setInterval(() => {
        if (document.hidden) return;
        if (currentCategory === 'Video Automation Studio' || videoRenderCheckTimer) {
            loadVideoFiles();
        }
    }, 4000);
