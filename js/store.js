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
          // photos: { id, inspectionId, incidentIndex, dataUrl, thumb }
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

  async saveInspection(inspection) {
    const db = await this.open();
    inspection.updatedAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('inspections', 'readwrite');
      const req = tx.objectStore('inspections').put(inspection);
      req.onsuccess = () => resolve(inspection);
      req.onerror = () => reject(req.error);
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
    // photo: { id, inspectionId, incidentIndex, dataUrl, caption, timestamp }
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readonly');
      const idx = tx.objectStore('photos').index('inspectionId');
      const req = idx.getAll(inspectionId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
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
    if (!insp.relayFiles) insp.relayFiles = { gen1: null, gen2: null };
    if (!insp.switchgear.gen1BreakerTripCount) insp.switchgear.gen1BreakerTripCount = '';
    if (!insp.switchgear.gen2BreakerTripCount) insp.switchgear.gen2BreakerTripCount = '';
    if (!insp.generators.gen1.initialRunningHour) insp.generators.gen1.initialRunningHour = '';
    if (!insp.generators.gen2.initialRunningHour) insp.generators.gen2.initialRunningHour = '';
    if (!insp.generators.gen1.runningHourAlarmLimit) insp.generators.gen1.runningHourAlarmLimit = '';
    if (!insp.generators.gen2.runningHourAlarmLimit) insp.generators.gen2.runningHourAlarmLimit = '';
    if (!insp.generators.gen1.statorRTDTemp) insp.generators.gen1.statorRTDTemp = '';
    if (!insp.generators.gen2.statorRTDTemp) insp.generators.gen2.statorRTDTemp = '';
    if (!insp.generators.gen1.bearingRTDTemp) insp.generators.gen1.bearingRTDTemp = '';
    if (!insp.generators.gen2.bearingRTDTemp) insp.generators.gen2.bearingRTDTemp = '';
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
