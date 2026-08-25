/**
 * calculations.js - kWh difference calculations and utility functions
 */
const Calc = {
  // Calculate difference between current and previous reading
  diff(current, previous) {
    const c = parseFloat(current);
    const p = parseFloat(previous);
    if (isNaN(c) || isNaN(p)) return null;
    return c - p;
  },

  // Format number with commas
  formatNumber(num) {
    if (num === null || num === undefined || num === '') return '-';
    const n = parseFloat(num);
    if (isNaN(n)) return '-';
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  },

  // ===== Meter replacement handling =====
  // When a panel meter is physically swapped the new unit's counter restarts (normally
  // at 0), so a raw `current - previous` across the swap gives a large negative number.
  // Each swap is recorded in settings and the period consumption is bridged across the
  // old and new counters instead.

  METER_CHANNELS: [
    { key: 'transformerPanel', path: 'powerAnalyzers.transformerPanelKWh', label: 'Transformer Panel (Total)' },
    { key: 'gen1Panel',        path: 'powerAnalyzers.gen1PanelKWh',        label: 'No.1 Generator Panel' },
    { key: 'gen2Panel',        path: 'powerAnalyzers.gen2PanelKWh',        label: 'No.2 Generator Panel' },
    { key: 'cebLVPanel',       path: 'powerAnalyzers.cebLVPanelKWh',       label: 'CEB LV Panel' },
  ],

  meterChanges: [],

  _num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  },

  _valueAt(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  },

  channelMeta(channel) {
    return this.METER_CHANNELS.find(c => c.key === channel) || null;
  },

  // Pull the configured swaps from settings and fill in any blank closing readings
  async loadMeterConfig() {
    try {
      const settings = await Store.getSettings();
      this.meterChanges = Array.isArray(settings.meterChanges) ? settings.meterChanges : [];
      this.resolveMeterChanges(await Store.getInspections());
    } catch (e) {
      console.warn('Meter config load failed:', e);
      if (!Array.isArray(this.meterChanges)) this.meterChanges = [];
    }
    return this.meterChanges;
  },

  // All swaps recorded for one channel, oldest first
  changesFor(channel) {
    return (this.meterChanges || [])
      .filter(c => c && c.channel === channel && c.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  },

  // A swap dated D means readings up to and including D are on the old meter;
  // anything dated after D is on the new meter.
  isNewMeter(channel, date) {
    if (!date) return false;
    return this.changesFor(channel).some(c => String(date) > String(c.date));
  },

  // Swaps that fall between two visits (previous on the old meter, current on the new)
  crossedChanges(channel, prevDate, currDate) {
    if (!prevDate || !currDate) return [];
    return this.changesFor(channel).filter(
      c => String(c.date) >= String(prevDate) && String(c.date) < String(currDate)
    );
  },

  // Closing reading of the old meter: explicit value, else the one resolved from records
  oldFinalOf(change, fallback) {
    const explicit = this._num(change.oldFinal);
    if (explicit !== null) return explicit;
    const resolved = this._num(change._resolvedOldFinal);
    if (resolved !== null) return resolved;
    return fallback;
  },

  newStartOf(change) {
    const v = this._num(change.newStart);
    return v === null ? 0 : v;
  },

  // Resolve blank closing readings from the last inspection on or before the swap date
  resolveMeterChanges(inspections) {
    const sorted = [...(inspections || [])].sort(
      (a, b) => String(a.general.date).localeCompare(String(b.general.date))
    );
    (this.meterChanges || []).forEach(change => {
      const meta = this.channelMeta(change.channel);
      if (!meta) return;
      let closing = null;
      sorted.forEach(insp => {
        if (String(insp.general.date) <= String(change.date)) {
          const v = this._num(this._valueAt(insp, meta.path));
          if (v !== null) closing = v;
        }
      });
      change._resolvedOldFinal = closing;
    });
    return this.meterChanges;
  },

  // Consumption between two readings, bridged across any meter swap in between.
  // Returns { value, changes, oldRun, newRun }.
  meterDiff(channel, current, previous, currDate, prevDate) {
    const c = this._num(current);
    const p = this._num(previous);
    if (c === null || p === null) return { value: null, changes: [] };

    const crossed = this.crossedChanges(channel, prevDate, currDate);
    if (!crossed.length) return { value: c - p, changes: [] };

    // Walk each counter in turn: what the old meter still ran, then the new meter's own total
    let oldRun = 0;
    let cursor = p;
    crossed.forEach(change => {
      oldRun += this.oldFinalOf(change, cursor) - cursor;
      cursor = this.newStartOf(change);
    });
    const newRun = c - cursor;
    return { value: oldRun + newRun, changes: crossed, oldRun, newRun };
  },

  // Cumulative reading rebased onto one continuous scale, so trend charts stay smooth
  normalizedReading(channel, value, date) {
    const v = this._num(value);
    if (v === null) return null;
    let offset = 0;
    this.changesFor(channel).forEach(change => {
      if (date && String(date) > String(change.date)) {
        offset += this.oldFinalOf(change, 0) - this.newStartOf(change);
      }
    });
    return v + offset;
  },

  // Calculate all kWh diffs between two inspections
  calculateKWhDiffs(current, previous) {
    if (!previous) return null;

    const currDate = current.general.date;
    const prevDate = previous.general.date;

    // Panel meters can be replaced mid-life, so these go through the bridging diff
    const analyzers = {};
    const analyzerMeters = {};
    this.METER_CHANNELS.forEach(ch => {
      const r = this.meterDiff(
        ch.key,
        this._valueAt(current, ch.path),
        this._valueAt(previous, ch.path),
        currDate, prevDate
      );
      analyzers[ch.key] = r.value;
      analyzerMeters[ch.key] = r;
    });

    return {
      ceb: {
        importedTotal: this.diff(current.cebMeter.importedTotal, previous.cebMeter.importedTotal),
        importedR1: this.diff(current.cebMeter.importedR1, previous.cebMeter.importedR1),
        importedR2: this.diff(current.cebMeter.importedR2, previous.cebMeter.importedR2),
        importedR3: this.diff(current.cebMeter.importedR3, previous.cebMeter.importedR3),
        exportTotal: this.diff(current.cebMeter.exportTotal, previous.cebMeter.exportTotal),
        exportR1: this.diff(current.cebMeter.exportR1, previous.cebMeter.exportR1),
        exportR2: this.diff(current.cebMeter.exportR2, previous.cebMeter.exportR2),
        exportR3: this.diff(current.cebMeter.exportR3, previous.cebMeter.exportR3),
      },
      powerAnalyzers: analyzers,
      // Per-channel detail for any meter swap crossed in this period
      analyzerMeters,
      generators: {
        gen1Hours: this.diff(current.generators.gen1.runningHoursOnline, previous.generators.gen1.runningHoursOnline),
        gen2Hours: this.diff(current.generators.gen2.runningHoursOnline, previous.generators.gen2.runningHoursOnline),
      },
      switchgear: {
        tripCount: this.diff(current.switchgear.outdoorBreakerTripCount, previous.switchgear.outdoorBreakerTripCount),
        gen1TripCount: this.diff(current.switchgear.gen1BreakerTripCount, previous.switchgear.gen1BreakerTripCount),
        gen2TripCount: this.diff(current.switchgear.gen2BreakerTripCount, previous.switchgear.gen2BreakerTripCount),
      },
      daysBetween: Math.round((new Date(current.general.date) - new Date(previous.general.date)) / (1000 * 60 * 60 * 24)),
    };
  },

  // Calculate daily average generation
  dailyAverage(totalKwh, days) {
    if (!totalKwh || !days || days <= 0) return null;
    return totalKwh / days;
  },

  // Get trip event summary from relay events
  tripSummary(events) {
    const summary = {};
    events.forEach(e => {
      const cause = e.cause || 'Unknown';
      summary[cause] = (summary[cause] || 0) + 1;
    });
    return Object.entries(summary)
      .sort((a, b) => b[1] - a[1])
      .map(([cause, count]) => ({ cause, count }));
  },

  // Render a diff badge HTML
  diffBadgeHTML(value, unit = 'kWh') {
    if (value === null) return '';
    const cls = value >= 0 ? 'positive' : 'negative';
    const sign = value >= 0 ? '+' : '';
    return `<span class="diff-badge ${cls}">${sign}${this.formatNumber(value)} ${unit}</span>`;
  },

  // Count events by type for analytics
  countEventTypes(inspections) {
    const counts = {};
    inspections.forEach(insp => {
      const allEvents = [
        ...(insp.relayEvents.gen1Events || []),
        ...(insp.relayEvents.gen2Events || []),
        ...(insp.relayEvents.transformerEvents || []),
      ];
      allEvents.forEach(e => {
        const cause = e.cause || 'Unknown';
        counts[cause] = (counts[cause] || 0) + 1;
      });
    });
    return counts;
  },

  // Get generation trend data for charts
  getGenerationTrend(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = [];
    const cebImported = [];
    const gen1 = [];
    const gen2 = [];
    const transformer = [];

    sorted.forEach(insp => {
      labels.push(this.formatDateShort(insp.general.date));
      cebImported.push(parseFloat(insp.cebMeter.importedTotal) || 0);
      const date = insp.general.date;
      gen1.push(this.normalizedReading('gen1Panel', insp.powerAnalyzers.gen1PanelKWh, date) || 0);
      gen2.push(this.normalizedReading('gen2Panel', insp.powerAnalyzers.gen2PanelKWh, date) || 0);
      transformer.push(this.normalizedReading('transformerPanel', insp.powerAnalyzers.transformerPanelKWh, date) || 0);
    });

    return { labels, cebImported, gen1, gen2, transformer };
  },

  // Get monthly generation (diff between consecutive months)
  getMonthlyGeneration(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = [];
    const monthlyKwh = [];
    const dailyAvg = [];

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = sorted[i - 1];
      const diff = this.diff(curr.cebMeter.importedTotal, prev.cebMeter.importedTotal);
      const days = Math.round((new Date(curr.general.date) - new Date(prev.general.date)) / 86400000);
      if (diff !== null && days > 0) {
        labels.push(this.formatDateShort(curr.general.date));
        monthlyKwh.push(diff);
        dailyAvg.push(Math.round(diff / days));
      }
    }
    return { labels, monthlyKwh, dailyAvg };
  },

  // Get trip count trend
  getTripTrend(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = [];
    const gen1Trips = [];
    const gen2Trips = [];
    const transformerTrips = [];

    sorted.forEach(insp => {
      labels.push(this.formatDateShort(insp.general.date));
      gen1Trips.push((insp.relayEvents.gen1Events || []).length);
      gen2Trips.push((insp.relayEvents.gen2Events || []).length);
      transformerTrips.push((insp.relayEvents.transformerEvents || []).length);
    });

    return { labels, gen1Trips, gen2Trips, transformerTrips };
  },

  formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  },

  formatDateFull(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  },
};
