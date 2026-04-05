/**
 * app.js - Main application controller
 * All store calls are async (IndexedDB).
 */
const App = {
  currentPage: 'new-inspection',
  editingInspectionId: null,

  async init() {
    // Migrate any old localStorage data first
    await Store.migrateFromLocalStorage();
    this.bindNavigation();
    this.navigate('new-inspection');
    this.registerServiceWorker();
    this.updateSyncStatus('offline');

    // Firebase sync — sign-in button in header
    FirebaseSync.renderSignInButton(document.getElementById('header-signin'));
    FirebaseSync.init(user => {
      if (user) FirebaseSync.syncAll();
    });
  },

  // ===== Navigation =====
  bindNavigation() {
    document.getElementById('menu-btn').addEventListener('click', () => this.toggleSidebar(true));
    document.getElementById('close-menu').addEventListener('click', () => this.toggleSidebar(false));
    document.getElementById('sidebar-overlay').addEventListener('click', () => this.toggleSidebar(false));

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.navigate(item.dataset.page);
        this.toggleSidebar(false);
      });
    });

    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.addEventListener('click', () => this.navigate(item.dataset.page));
    });
  },

  toggleSidebar(show) {
    document.getElementById('sidebar').classList.toggle('open', show);
    document.getElementById('sidebar-overlay').classList.toggle('show', show);
  },

  navigate(page) {
    this.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
    document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));

    const main = document.getElementById('main-content');
    main.scrollTop = 0;
    window.scrollTo(0, 0);

    switch (page) {
      case 'new-inspection': this.renderNewInspection(main); break;
      case 'records': this.renderRecords(main); break;
      case 'analytics': Analytics.render(main); break;
      case 'settings': this.renderSettings(main); break;
    }
  },

  // ===== New Inspection Page =====
  async renderNewInspection(container) {
    container.innerHTML = '<div class="loading-spinner">Loading...</div>';
    let inspection;
    if (this.editingInspectionId) {
      inspection = await Store.getInspection(this.editingInspectionId);
      this.editingInspectionId = null;
    }
    if (!inspection) {
      inspection = await Store.createBlankInspection();
    }
    await Forms.init(inspection, container);
  },

  editInspection(id) {
    this.editingInspectionId = id;
    this.navigate('new-inspection');
  },

  // ===== Records Page =====
  async renderRecords(container) {
    container.innerHTML = '<div class="loading-spinner">Loading records...</div>';
    const inspections = await Store.getInspections();

    if (inspections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p>No inspection records yet.</p>
          <p class="text-sm text-muted mt-8">Create your first inspection to get started.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="search-bar">
        <input type="text" class="form-input" id="search-records" placeholder="Search by date, plant name...">
      </div>
      <div class="flex-between mb-16">
        <span class="text-sm text-muted">${inspections.length} record(s)</span>
        <div class="flex gap-8">
          <button class="btn btn-outline btn-sm" id="export-csv">Export CSV</button>
          <button class="btn btn-outline btn-sm" id="export-json">Export JSON</button>
        </div>
      </div>
      <div id="records-list">
        ${inspections.map(insp => this.renderRecordCard(insp, inspections)).join('')}
      </div>
    `;

    container.querySelector('#search-records').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const list = container.querySelector('#records-list');
      const filtered = inspections.filter(i =>
        i.general.date.includes(q) ||
        i.general.plantName.toLowerCase().includes(q) ||
        i.general.inspectorName.toLowerCase().includes(q)
      );
      list.innerHTML = filtered.map(insp => this.renderRecordCard(insp, inspections)).join('');
      this.bindRecordActions(container);
    });

    container.querySelector('#export-csv').addEventListener('click', () => Sheets.exportCSV());
    container.querySelector('#export-json').addEventListener('click', async () => {
      const data = await Store.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HydroInspect_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast('JSON backup exported!', 'success');
    });

    this.bindRecordActions(container);
  },

  renderRecordCard(insp, allInspections) {
    const date = Calc.formatDateFull(insp.general.date);
    const idx = allInspections.indexOf(insp);
    const prev = idx < allInspections.length - 1 ? allInspections[idx + 1] : null;
    const diffs = prev ? Calc.calculateKWhDiffs(insp, prev) : null;
    const importDiff = diffs?.ceb?.importedTotal;
    const gen1Events = (insp.relayEvents.gen1Events || []).length;
    const gen2Events = (insp.relayEvents.gen2Events || []).length;
    const incidentCount = (insp.incidents || []).length;
    const incidentBadge = incidentCount > 0
      ? `<span class="incident-badge">&#9888; ${incidentCount} incident${incidentCount > 1 ? 's' : ''}</span>` : '';
    const backfillBadge = insp.session?.backfill ? `<span class="badge-backfill-sm">Backfill</span>` : '';
    const sessionDuration = (insp.session?.startTime && insp.session?.endTime)
      ? `${insp.session.startTime}–${insp.session.endTime}` : '';

    return `
      <div class="record-card" data-id="${insp.id}">
        <div class="record-card-header">
          <div>
            <div class="record-date">${date} ${backfillBadge}</div>
            <div class="record-plant">${Forms.esc(insp.general.plantName)}</div>
            ${sessionDuration ? `<div class="record-session-time text-sm text-muted">${sessionDuration}</div>` : ''}
          </div>
          <div class="text-sm text-muted">${Forms.esc(insp.general.weatherConditions)}</div>
        </div>
        <div class="record-stats">
          <div class="record-stat">
            <span class="record-stat-label">CEB Import</span>
            <span class="record-stat-value">${Calc.formatNumber(insp.cebMeter.importedTotal)} kWh</span>
            ${importDiff !== null && importDiff !== undefined ? `<span class="text-sm" style="color:${importDiff >= 0 ? '#16a34a' : '#dc2626'}">+${Calc.formatNumber(importDiff)}</span>` : ''}
          </div>
          <div class="record-stat">
            <span class="record-stat-label">33kV Trips</span>
            <span class="record-stat-value">${insp.switchgear.outdoorBreakerTripCount || '-'}</span>
          </div>
          <div class="record-stat">
            <span class="record-stat-label">Gen1 Hrs</span>
            <span class="record-stat-value">${Calc.formatNumber(insp.generators.gen1.runningHoursOnline) || '-'}</span>
          </div>
          <div class="record-stat">
            <span class="record-stat-label">Relay Events</span>
            <span class="record-stat-value">${gen1Events + gen2Events}</span>
          </div>
        </div>
        ${incidentBadge}
        <div class="record-actions">
          <button class="btn btn-primary btn-sm" data-edit="${insp.id}">Edit</button>
          <button class="btn btn-outline btn-sm" data-pdf="${insp.id}">PDF</button>
          <button class="btn btn-outline btn-sm" data-sync="${insp.id}">Sync</button>
          <button class="btn btn-danger btn-sm" data-delete="${insp.id}">Delete</button>
        </div>
      </div>`;
  },

  bindRecordActions(container) {
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.editInspection(btn.dataset.edit); });
    });
    container.querySelectorAll('[data-pdf]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const insp = await Store.getInspection(btn.dataset.pdf);
        if (insp) {
          const photos = await Store.getPhotosForInspection(insp.id);
          Reports.generatePDF(insp, photos);
        }
      });
    });
    container.querySelectorAll('[data-sync]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const insp = await Store.getInspection(btn.dataset.sync);
        if (insp) Sheets.syncToSheet(insp);
      });
    });
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this inspection record? This cannot be undone.')) {
          await Store.deleteInspection(btn.dataset.delete);
          this.navigate('records');
          this.toast('Record deleted', 'success');
        }
      });
    });
  },

  // ===== Settings Page =====
  async renderSettings(container) {
    const settings = await Store.getSettings();
    container.innerHTML = `
      <div class="settings-group">
        <h3>Inspector Details</h3>
        <div class="form-group"><label class="form-label">Default Inspector Name</label><input type="text" class="form-input" id="set-inspector" value="${Forms.esc(settings.inspectorName)}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input type="text" class="form-input" id="set-phone" value="${Forms.esc(settings.inspectorPhone)}"></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="set-email" value="${Forms.esc(settings.inspectorEmail)}"></div>
      </div>

      <div class="settings-group">
        <h3>Default Plant Info</h3>
        <div class="form-group"><label class="form-label">Plant Name</label><input type="text" class="form-input" id="set-plant" value="${Forms.esc(settings.plantName)}"></div>
        <div class="form-group"><label class="form-label">Plant Location</label><input type="text" class="form-input" id="set-location" value="${Forms.esc(settings.plantLocation)}"></div>
      </div>

      <div class="settings-group">
        <h3>Alert Thresholds</h3>
        <div class="form-group"><label class="form-label">Breaker Trip Alert Threshold (new trips since last visit)</label><input type="number" class="form-input" id="set-trip-threshold" value="${settings.breakerTripAlertThreshold || 5}"></div>
        <div class="form-group"><label class="form-label">Gen Hours Alert Margin (hrs before limit)</label><input type="number" class="form-input" id="set-hours-margin" value="${settings.genHoursAlertMargin || 1000}"></div>
      </div>

      <div class="settings-group">
        <h3>Google Sheets Sync</h3>
        <p class="text-sm text-muted mb-8">
          Enter your Google Sheet ID and API key to enable cloud sync. The sheet must be shared with Editor access.
        </p>
        <div class="form-group"><label class="form-label">Google Sheet ID</label><input type="text" class="form-input" id="set-sheet-id" value="${Forms.esc(settings.googleSheetId)}" placeholder="From the Sheet URL: /spreadsheets/d/{THIS_ID}/edit"></div>
        <div class="form-group"><label class="form-label">Google API Key</label><input type="text" class="form-input" id="set-api-key" value="${Forms.esc(settings.googleApiKey)}" placeholder="From Google Cloud Console"></div>
      </div>

      <div class="settings-group">
        <h3>Email</h3>
        <div class="form-group"><label class="form-label">Default Email Recipients</label><input type="text" class="form-input" id="set-recipients" value="${Forms.esc(settings.emailRecipients)}" placeholder="email@example.com, another@example.com"></div>
      </div>

      <button class="btn btn-primary btn-block" id="save-settings">Save Settings</button>

      <div class="settings-group mt-16">
        <h3>Data Management</h3>
        <div class="btn-group">
          <button class="btn btn-outline" id="import-data">Import Backup</button>
          <button class="btn btn-outline" id="export-data">Export Backup</button>
        </div>
        <div class="btn-group">
          <button class="btn btn-danger btn-block" id="clear-data">Clear All Data</button>
        </div>
        <input type="file" id="import-file" accept=".json" class="hidden">
      </div>

      <div class="text-center mt-16 text-muted text-sm">
        <p>HydroInspect v2.0</p>
        <p>Mini Hydro Plant Inspection App</p>
        <p>${Forms.esc(settings.plantName)}</p>
      </div>
    `;

    container.querySelector('#save-settings').addEventListener('click', async () => {
      await Store.saveSettings({
        inspectorName: container.querySelector('#set-inspector').value,
        inspectorPhone: container.querySelector('#set-phone').value,
        inspectorEmail: container.querySelector('#set-email').value,
        plantName: container.querySelector('#set-plant').value,
        plantLocation: container.querySelector('#set-location').value,
        googleSheetId: container.querySelector('#set-sheet-id').value,
        googleApiKey: container.querySelector('#set-api-key').value,
        emailRecipients: container.querySelector('#set-recipients').value,
        breakerTripAlertThreshold: parseInt(container.querySelector('#set-trip-threshold').value) || 5,
        genHoursAlertMargin: parseInt(container.querySelector('#set-hours-margin').value) || 1000,
      });
      this.toast('Settings saved!', 'success');
    });

    container.querySelector('#export-data').addEventListener('click', async () => {
      const data = await Store.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HydroInspect_Backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast('Backup exported!', 'success');
    });

    container.querySelector('#import-data').addEventListener('click', () => {
      container.querySelector('#import-file').click();
    });
    container.querySelector('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          await Store.importData(ev.target.result);
          this.toast('Data imported successfully!', 'success');
          this.navigate('records');
        } catch (err) {
          this.toast('Invalid backup file', 'error');
        }
      };
      reader.readAsText(file);
    });

    container.querySelector('#clear-data').addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete ALL inspection data? This cannot be undone!')) {
        if (confirm('Really? This will permanently delete everything.')) {
          const db = await Store.open();
          const tx = db.transaction(['inspections', 'photos'], 'readwrite');
          tx.objectStore('inspections').clear();
          tx.objectStore('photos').clear();
          this.toast('All data cleared', 'success');
          this.navigate('records');
        }
      }
    });
  },

  // ===== Sync Status =====
  updateSyncStatus(status, label) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    if (status === 'online') {
      el.textContent = label || 'Synced';
      el.className = 'sync-badge connected';
    } else if (status === 'syncing') {
      el.textContent = 'Syncing...';
      el.className = 'sync-badge syncing';
    } else {
      el.textContent = 'Offline';
      el.className = 'sync-badge';
    }
  },

  // ===== Toast Notification =====
  toast(message, type = '') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast show ' + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
  },

  // ===== PWA Service Worker =====
  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(() => {
        console.log('Service Worker registered');
      }).catch(err => {
        console.log('SW registration failed:', err);
      });
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
