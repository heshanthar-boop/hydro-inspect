/**
 * store.js - IndexedDB storage for inspection records, photos, and settings
 * Replaces localStorage with IndexedDB for photo support and larger capacity.
 * On first load, migrates any existing localStorage data automatically.
 */
const Store = {
  DB_NAME: 'hydroinspect',
  DB_VERSION: 2,
  db: null,

  defaultSettings: {
    plantName: 'Kumburutheniwela Mini Hydro Power',
    plantLocation: 'Belihul Oya',
    inspectorName: 'Heshantha Rajapaksha',
    inspectorPhone: '071 514 5866',
    inspectorEmail: 'Heshantha.r@gmail.com',
    googleSheetId: '',
    googleApiKey: '',
    emailRecipients: '',
    breakerTripAlertThreshold: 5,
    genHoursAlertMargin: 1000,

    // Panel meters that were physically swapped. `date` is the last reading taken on the
    // old meter — anything recorded after it belongs to the new one. Leave `oldFinal`
    // blank to use the reading already stored for that date.
    meterChanges: [
      { id: 'mc_2026_08_06_transformer', channel: 'transformerPanel', date: '2026-08-06', oldFinal: '', newStart: '0', note: 'New meter fitted after 06 Aug 2026 reading' },
      { id: 'mc_2026_08_06_gen1',        channel: 'gen1Panel',        date: '2026-08-06', oldFinal: '', newStart: '0', note: 'New meter fitted after 06 Aug 2026 reading' },
      { id: 'mc_2026_08_06_gen2',        channel: 'gen2Panel',        date: '2026-08-06', oldFinal: '', newStart: '0', note: 'New meter fitted after 06 Aug 2026 reading' },
    ],
  },

  // Open (or upgrade) the database
  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('inspections')) {
          const store = db.createObjectStore('inspections', { keyPath: 'id' });
          store.createIndex('date', 'general.date');
        }
        if (!db.objectStoreNames.contains('photos')) {
          // photos: { id, inspectionId, incidentId, dataUrl, thumb }
          const photos = db.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('inspectionId', 'inspectionId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  },

  // ===== Inspection CRUD =====

  async getInspections() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('inspections', 'readonly');
      const req = tx.objectStore('inspections').getAll();
      req.onsuccess = () => {
        const results = (req.result || []).sort(
          (a, b) => new Date(b.general.date) - new Date(a.general.date)
        );
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getInspection(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('inspections', 'readonly');
      const req = tx.objectStore('inspections').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async saveInspection(inspection, opts) {
    const silent = opts && opts.silent;
    const db = await this.open();
    // Preserve the record's own updatedAt when saving silently (e.g. from a cloud pull)
    if (!silent) inspection.updatedAt = new Date().toISOString();
    // Mark unsynced until Firebase confirms push. Cleared by FirebaseSync on success.
    if (!silent) inspection._pendingSync = true;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('inspections', 'readwrite');
      const req = tx.objectStore('inspections').put(inspection);
      req.onsuccess = () => {
        if (!silent && typeof FirebaseSync !== 'undefined') FirebaseSync.onInspectionSaved(inspection);
        resolve(inspection);
      };
      req.onerror = () => reject(req.error);
    });
  },

  // Clear the pending-sync flag without re-triggering a push (used by sync layer)
  async markSynced(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('inspections', 'readwrite');
      const store = tx.objectStore('inspections');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (!rec) return resolve(false);
        rec._pendingSync = false;
        rec._syncedAt = new Date().toISOString();
        const putReq = store.put(rec);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  async deleteInspection(id) {
    const db = await this.open();
    // Also delete all photos for this inspection
    await this.deletePhotosForInspection(id);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('inspections', 'readwrite');
      const req = tx.objectStore('inspections').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getPreviousInspection(currentDate) {
    const all = await this.getInspections();
    const current = new Date(currentDate);
    return all.find(i => new Date(i.general.date) < current) || null;
  },

  // ===== Photo CRUD =====

  async savePhoto(photo) {
    // photo: { id, inspectionId, incidentId, dataUrl, caption, timestamp }
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const req = tx.objectStore('photos').put(photo);
      req.onsuccess = () => resolve(photo);
      req.onerror = () => reject(req.error);
    });
  },

  async getPhotosForInspection(inspectionId) {
    const db = await this.open();
    const photos = await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const idx = tx.objectStore('photos').index('inspectionId');
      const req = idx.getAll(inspectionId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    try {
      return await this._migrateLegacyPhotoLinks(inspectionId, photos);
    } catch (err) {
      console.warn('Legacy photo-link migration skipped:', err);
      return photos;
    }
  },

  // One-time migration: convert legacy photo.incidentIndex links to photo.incidentId.
  async _migrateLegacyPhotoLinks(inspectionId, photos) {
    if (!Array.isArray(photos) || photos.length === 0) return photos;
    const needsMigration = photos.some(p => !p.incidentId && p.incidentIndex !== undefined && p.incidentIndex !== null);
    if (!needsMigration) return photos;

    const inspection = await this.getInspection(inspectionId);
    if (!inspection || !Array.isArray(inspection.incidents) || inspection.incidents.length === 0) return photos;

    let inspectionChanged = false;
    const incidents = inspection.incidents;
    const incidentById = new Map();
    const photoIdToIncidentId = new Map();

    for (let i = 0; i < incidents.length; i++) {
      const inc = incidents[i] && typeof incidents[i] === 'object' ? incidents[i] : {};
      if (!inc.id) {
        inc.id = `inc_${inspection.id || 'legacy'}_${i}`;
        inspectionChanged = true;
      }
      if (!Array.isArray(inc.photoIds)) {
        inc.photoIds = [];
        inspectionChanged = true;
      }
      incidents[i] = inc;
      incidentById.set(inc.id, inc);
      for (const photoId of inc.photoIds) {
        if (!photoIdToIncidentId.has(photoId)) photoIdToIncidentId.set(photoId, inc.id);
      }
    }

    const updates = [];
    const migratedPhotos = photos.map(photo => {
      if (photo.incidentId) return photo;

      let targetIncidentId = photoIdToIncidentId.get(photo.id);
      if (!targetIncidentId) {
        const legacyIdx = Number.parseInt(photo.incidentIndex, 10);
        if (!Number.isNaN(legacyIdx) && legacyIdx >= 0 && legacyIdx < incidents.length) {
          targetIncidentId = incidents[legacyIdx].id;
        }
      }
      if (!targetIncidentId) return photo;

      const targetIncident = incidentById.get(targetIncidentId);
      if (targetIncident && !targetIncident.photoIds.includes(photo.id)) {
        targetIncident.photoIds.push(photo.id);
        inspectionChanged = true;
      }

      const migrated = { ...photo, incidentId: targetIncidentId };
      delete migrated.incidentIndex;
      updates.push(migrated);
      return migrated;
    });

    if (updates.length > 0) {
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('photos', 'readwrite');
        const store = tx.objectStore('photos');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Photo migration transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('Photo migration transaction aborted'));
        for (const photo of updates) {
          store.put(photo);
        }
      });
    }

    if (inspectionChanged) {
      await this.saveInspection(inspection, { silent: true });
    }

    return migratedPhotos;
  },

  async deletePhoto(photoId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const req = tx.objectStore('photos').delete(photoId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async deletePhotosForInspection(inspectionId) {
    const photos = await this.getPhotosForInspection(inspectionId);
    for (const p of photos) await this.deletePhoto(p.id);
  },

  // ===== Settings =====

  async getSettings() {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get('main');
      req.onsuccess = () => {
        resolve(req.result ? { ...this.defaultSettings, ...req.result.value } : { ...this.defaultSettings });
      };
      req.onerror = () => resolve({ ...this.defaultSettings });
    });
  },

  async saveSettings(settings) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const req = tx.objectStore('settings').put({ key: 'main', value: settings });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  // ===== Migration from localStorage =====

  async migrateFromLocalStorage() {
    const OLD_KEY = 'hydroinspect_inspections';
    const OLD_SETTINGS = 'hydroinspect_settings';
    const migrated = localStorage.getItem('hydroinspect_migrated_v2');
    if (migrated) return;

    const inspData = localStorage.getItem(OLD_KEY);
    if (inspData) {
      try {
        const inspections = JSON.parse(inspData);
        for (const insp of inspections) {
          // Ensure new fields exist on old records
          this._upgradeInspectionSchema(insp);
          await this.saveInspection(insp);
        }
        console.log(`Migrated ${inspections.length} inspections from localStorage`);
      } catch (e) {
        console.error('Migration error:', e);
      }
    }

    const settingsData = localStorage.getItem(OLD_SETTINGS);
    if (settingsData) {
      try {
        await this.saveSettings({ ...this.defaultSettings, ...JSON.parse(settingsData) });
      } catch (e) {}
    }

    localStorage.setItem('hydroinspect_migrated_v2', '1');
  },

  // Add missing fields to old inspection records
  _upgradeInspectionSchema(insp) {
    if (!insp.session) insp.session = { startTime: '', endTime: '', duration: '', backfill: false };
    if (!insp.operatorStatement) insp.operatorStatement = { operatorName: '', statement: '' };
    if (!insp.incidents) insp.incidents = [];
    if (Array.isArray(insp.incidents)) {
      insp.incidents = insp.incidents.map((inc, idx) => {
        const incident = (inc && typeof inc === 'object') ? inc : {};
        if (!incident.id) incident.id = `inc_${insp.id || 'legacy'}_${idx}`;
        if (!Array.isArray(incident.photoIds)) incident.photoIds = [];
        return incident;
      });
    }
    if (!insp.switchgear) insp.switchgear = {};
    if (!insp.generators) insp.generators = {};
    if (!insp.generators.gen1) insp.generators.gen1 = {};
    if (!insp.generators.gen2) insp.generators.gen2 = {};
    if (!insp.relayFiles) insp.relayFiles = { gen1: null, gen2: null };
    if (insp.switchgear.gen1BreakerTripCount == null) insp.switchgear.gen1BreakerTripCount = '';
    if (insp.switchgear.gen2BreakerTripCount == null) insp.switchgear.gen2BreakerTripCount = '';
    if (insp.generators.gen1.initialRunningHour == null) insp.generators.gen1.initialRunningHour = '';
    if (insp.generators.gen2.initialRunningHour == null) insp.generators.gen2.initialRunningHour = '';
    if (insp.generators.gen1.runningHourAlarmLimit == null) insp.generators.gen1.runningHourAlarmLimit = '';
    if (insp.generators.gen2.runningHourAlarmLimit == null) insp.generators.gen2.runningHourAlarmLimit = '';
    if (insp.generators.gen1.statorRTDTemp == null) insp.generators.gen1.statorRTDTemp = '';
    if (insp.generators.gen2.statorRTDTemp == null) insp.generators.gen2.statorRTDTemp = '';
    if (insp.generators.gen1.bearingRTDTemp == null) insp.generators.gen1.bearingRTDTemp = '';
    if (insp.generators.gen2.bearingRTDTemp == null) insp.generators.gen2.bearingRTDTemp = '';
  },

  // Clear inspection and photo data in a single transaction
  async clearAllData() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['inspections', 'photos'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to clear data'));
      tx.onabort = () => reject(tx.error || new Error('Data clear transaction aborted'));
      tx.objectStore('inspections').clear();
      tx.objectStore('photos').clear();
    });
  },

  // ===== Blank inspection template =====

  async createBlankInspection() {
    const settings = await this.getSettings();
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    return {
      id: 'insp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),

      session: {
        startTime: timeStr,
        endTime: '',
        duration: '',
        backfill: false,
      },

      general: {
        plantName: settings.plantName,
        date: now.toISOString().split('T')[0],
        inspectorName: settings.inspectorName,
        plantLocation: settings.plantLocation,
        weatherConditions: '',
        timeOfInspection: '',
        generalNotes: '',
      },

      operatorStatement: {
        operatorName: '',
        statement: '',
      },

      cebMeter: {
        meterTime: '',
        importedTotal: '', importedR1: '', importedR2: '', importedR3: '',
        importedMaxDemandKVA: '', importedMaxDemandDate: '',
        importedHistoryTotal: '', importedHistoryR1: '', importedHistoryR2: '', importedHistoryR3: '',
        importedHistoryMaxDemand: '',
        exportTotal: '', exportR1: '', exportR2: '', exportR3: '',
        exportMaxDemandKVA: '', exportMaxDemandDate: '',
        exportHistoryTotal: '', exportHistoryR1: '', exportHistoryR2: '', exportHistoryR3: '',
        exportHistoryMaxDemand: '',
      },

      powerAnalyzers: {
        transformerPanelKWh: '', gen1PanelKWh: '', gen2PanelKWh: '', cebLVPanelKWh: '',
      },

      switchgear: {
        outdoorBreakerTripCount: '',
        gen1BreakerTripCount: '',
        gen2BreakerTripCount: '',
        sf6Pressure: '',
        mainTransformerOilLevel: '', mainTransformerTemp1: '', mainTransformerTemp2: '',
        mainTransformerOilLeaks: false, mainTransformerExcessiveHeat: false,
        auxTransformerOilLevel: '',
      },

      batteryBank: {
        systemVoltage: '', chargingCurrent: '', powerConsumption: '',
        batteryEnergy: '', batteryCapacity: '', runningHours: '',
        batteries: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, voltage: '', capacity: '' })),
      },

      generators: {
        gen1: {
          runningHoursOnline: '', runningHourLimit: '',
          initialRunningHour: '', runningHourAlarmLimit: '',
          trustBearingTemp: '', statorRTDTemp: '', bearingRTDTemp: '',
          notes: '',
        },
        gen2: {
          runningHoursOnline: '', runningHourLimit: '',
          initialRunningHour: '', runningHourAlarmLimit: '',
          trustBearingTemp: '', statorRTDTemp: '', bearingRTDTemp: '',
          notes: '',
        },
      },

      relayEvents: {
        gen1Events: [], gen2Events: [], transformerEvents: [],
      },

      relayFiles: {
        gen1: null,  // { filename, parsedAt, totalEvents, tripCount, alarmCount, eventTypes, lastTrip }
        gen2: null,
      },

      incidents: [],
      // Each incident: { id, category, severity, description, location, timestamp, photoIds: [] }

      controlSystems: {
        plcScadaStatus: 'Working Fine', sensorsStatus: 'Working Fine', controlNotes: '',
      },

      observations: {
        items: [], recommendations: [],
      },

      followUpActions: [],
    };
  },

  // ===== Export / Import =====

  async exportData() {
    const inspections = await this.getInspections();
    const settings = await this.getSettings();
    return JSON.stringify({
      inspections,
      settings,
      exportedAt: new Date().toISOString(),
      version: 2,
    }, null, 2);
  },

  async importData(jsonString) {
    const data = JSON.parse(jsonString);
    if (data.inspections) {
      for (const insp of data.inspections) {
        this._upgradeInspectionSchema(insp);
        await this.saveInspection(insp);
      }
    }
    if (data.settings) {
      await this.saveSettings(data.settings);
    }
  },
};
