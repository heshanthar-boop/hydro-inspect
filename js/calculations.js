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

  // Calculate all kWh diffs between two inspections
  calculateKWhDiffs(current, previous) {
    if (!previous) return null;

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
      powerAnalyzers: {
        transformerPanel: this.diff(current.powerAnalyzers.transformerPanelKWh, previous.powerAnalyzers.transformerPanelKWh),
        gen1Panel: this.diff(current.powerAnalyzers.gen1PanelKWh, previous.powerAnalyzers.gen1PanelKWh),
        gen2Panel: this.diff(current.powerAnalyzers.gen2PanelKWh, previous.powerAnalyzers.gen2PanelKWh),
        cebLVPanel: this.diff(current.powerAnalyzers.cebLVPanelKWh, previous.powerAnalyzers.cebLVPanelKWh),
      },
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
      gen1.push(parseFloat(insp.powerAnalyzers.gen1PanelKWh) || 0);
      gen2.push(parseFloat(insp.powerAnalyzers.gen2PanelKWh) || 0);
      transformer.push(parseFloat(insp.powerAnalyzers.transformerPanelKWh) || 0);
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
