/**
 * analytics.js - Data visualization and pattern analysis
 * All render calls are async since store is IndexedDB.
 */
const Analytics = {
  charts: [],

  destroyCharts() {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  },

  async render(container) {
    this.destroyCharts();
    await Calc.loadMeterConfig();
    const inspections = await Store.getInspections();

    if (inspections.length < 2) {
      container.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <p>Need at least 2 inspections for analytics.</p>
          <p class="text-sm text-muted mt-8">Record more inspections to see trends and analysis.</p>
        </div>`;
      return;
    }

    const monthly = Calc.getMonthlyGeneration(inspections);
    const trips = Calc.getTripTrend(inspections);
    const eventTypes = Calc.countEventTypes(inspections);
    const latest = inspections[0];
    const prev = inspections[1];
    const diffs = Calc.calculateKWhDiffs(latest, prev);

    container.innerHTML = `
      ${this.renderSummaryStats(latest, diffs, inspections)}
      <div class="chart-container">
        <h3>Monthly Generation (CEB Import kWh)</h3>
        <canvas id="chart-monthly-gen"></canvas>
      </div>
      <div class="chart-container">
        <h3>Daily Average Generation</h3>
        <canvas id="chart-daily-avg"></canvas>
      </div>
      <div class="chart-container">
        <h3>Generator Running Hours (Cumulative)</h3>
        <canvas id="chart-gen-hours"></canvas>
      </div>
      <div class="chart-container">
        <h3>Hours Run Per Inspection Period</h3>
        <canvas id="chart-gen-hours-period"></canvas>
      </div>
      <div class="chart-container">
        <h3>Breaker Trip Count Trend</h3>
        <canvas id="chart-breaker-trips"></canvas>
      </div>
      <div class="chart-container">
        <h3>Relay Events per Inspection</h3>
        <canvas id="chart-trips"></canvas>
      </div>
      <div class="chart-container">
        <h3>Event Type Distribution (All Time)</h3>
        <canvas id="chart-event-types"></canvas>
      </div>
      <div class="chart-container">
        <h3>Temperature Trends (Transformer &amp; Generator)</h3>
        <canvas id="chart-temp"></canvas>
      </div>
      <div class="chart-container">
        <h3>Generator RTD Temperatures</h3>
        <canvas id="chart-rtd"></canvas>
      </div>
      <div class="chart-container">
        <h3>Battery Voltages (Latest Inspection)</h3>
        <canvas id="chart-battery"></canvas>
      </div>
    `;

    this.renderMonthlyGenChart(monthly);
    this.renderDailyAvgChart(monthly);
    this.renderGenHoursChart(inspections);
    this.renderGenHoursPeriodChart(inspections);
    this.renderBreakerTripChart(inspections);
    this.renderTripsChart(trips);
    this.renderEventTypesChart(eventTypes);
    this.renderTempChart(inspections);
    this.renderRTDChart(inspections);
    this.renderBatteryChart(latest);
  },

  renderSummaryStats(latest, diffs, inspections) {
    const totalInspections = inspections.length;
    const monthlyGen = diffs?.ceb?.importedTotal;
    const dailyAvg = diffs && diffs.daysBetween > 0 ? Math.round(monthlyGen / diffs.daysBetween) : null;
    const totalTrips = latest.switchgear.outdoorBreakerTripCount;
    const newTrips = diffs?.switchgear?.tripCount;
    const gen1Hours = latest.generators.gen1.runningHoursOnline;
    const gen2Hours = latest.generators.gen2.runningHoursOnline;
    const gen1Limit = parseFloat(latest.generators.gen1.runningHourAlarmLimit) || parseFloat(latest.generators.gen1.runningHourLimit);
    const gen1Remaining = (gen1Limit && gen1Hours) ? (gen1Limit - parseFloat(gen1Hours)) : null;

    return `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${totalInspections}</div>
        <div class="stat-label">Total Inspections</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${monthlyGen !== null && monthlyGen !== undefined ? Calc.formatNumber(monthlyGen) : '-'}</div>
        <div class="stat-label">Last Period kWh</div>
        ${dailyAvg ? `<div class="stat-sublabel">${Calc.formatNumber(dailyAvg)} kWh/day avg</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-value">${Calc.formatNumber(totalTrips) || '-'}</div>
        <div class="stat-label">33kV Breaker Trips</div>
        ${newTrips !== null && newTrips !== undefined ? `<div class="stat-sublabel">+${newTrips} since last</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-value">${diffs?.daysBetween || '-'}</div>
        <div class="stat-label">Days Between Visits</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${Calc.formatNumber(gen1Hours) || '-'}</div>
        <div class="stat-label">Gen 1 Hours Online</div>
        ${gen1Remaining !== null ? `<div class="stat-sublabel ${gen1Remaining < 1000 ? 'text-danger' : ''}">${Calc.formatNumber(gen1Remaining)} hrs to limit</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-value">${Calc.formatNumber(gen2Hours) || '-'}</div>
        <div class="stat-label">Gen 2 Hours Online</div>
      </div>
    </div>`;
  },

  renderMonthlyGenChart(data) {
    if (!data.labels.length) return;
    const ctx = document.getElementById('chart-monthly-gen');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'CEB Import kWh',
          data: data.monthlyKwh,
          backgroundColor: 'rgba(30, 64, 175, 0.7)',
          borderColor: '#1e40af',
          borderWidth: 1,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh' } } }
      }
    }));
  },

  renderDailyAvgChart(data) {
    if (!data.labels.length) return;
    const ctx = document.getElementById('chart-daily-avg');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Daily Avg kWh',
          data: data.dailyAvg,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh/day' } } }
      }
    }));
  },

  renderGenHoursChart(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = sorted.map(i => Calc.formatDateShort(i.general.date));
    const gen1 = sorted.map(i => parseFloat(i.generators.gen1.runningHoursOnline) || null);
    const gen2 = sorted.map(i => parseFloat(i.generators.gen2.runningHoursOnline) || null);

    const ctx = document.getElementById('chart-gen-hours');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Gen 1', data: gen1, borderColor: '#3b82f6', tension: 0.3, pointRadius: 4 },
          { label: 'Gen 2', data: gen2, borderColor: '#f59e0b', tension: 0.3, pointRadius: 4 },
        ]
      },
      options: {
        responsive: true,
        scales: { y: { title: { display: true, text: 'Cumulative Hours' } } }
      }
    }));
  },

  renderGenHoursPeriodChart(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = [];
    const gen1Period = [];
    const gen2Period = [];

    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = sorted[i - 1];
      const h1 = Calc.diff(curr.generators.gen1.runningHoursOnline, prev.generators.gen1.runningHoursOnline);
      const h2 = Calc.diff(curr.generators.gen2.runningHoursOnline, prev.generators.gen2.runningHoursOnline);
      if (h1 !== null || h2 !== null) {
        labels.push(Calc.formatDateShort(curr.general.date));
        gen1Period.push(h1);
        gen2Period.push(h2);
      }
    }

    const ctx = document.getElementById('chart-gen-hours-period');
    if (!ctx || !labels.length) return;
    this.charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Gen 1 hrs/period', data: gen1Period, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 3 },
          { label: 'Gen 2 hrs/period', data: gen2Period, backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 3 },
        ]
      },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } }
      }
    }));
  },

  renderBreakerTripChart(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = sorted.map(i => Calc.formatDateShort(i.general.date));
    const outdoor = sorted.map(i => parseFloat(i.switchgear.outdoorBreakerTripCount) || null);
    const gen1cb = sorted.map(i => parseFloat(i.switchgear.gen1BreakerTripCount) || null);
    const gen2cb = sorted.map(i => parseFloat(i.switchgear.gen2BreakerTripCount) || null);

    const ctx = document.getElementById('chart-breaker-trips');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '33kV Outdoor', data: outdoor, borderColor: '#ef4444', tension: 0.3, pointRadius: 5 },
          { label: 'Gen 1 CB', data: gen1cb, borderColor: '#3b82f6', tension: 0.3, pointRadius: 4 },
          { label: 'Gen 2 CB', data: gen2cb, borderColor: '#f59e0b', tension: 0.3, pointRadius: 4 },
        ]
      },
      options: {
        responsive: true,
        scales: { y: { title: { display: true, text: 'Cumulative Trip Count' } } }
      }
    }));
  },

  renderTripsChart(data) {
    if (!data.labels.length) return;
    const ctx = document.getElementById('chart-trips');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [
          { label: 'Gen 1 Events', data: data.gen1Trips, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 3 },
          { label: 'Gen 2 Events', data: data.gen2Trips, backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 3 },
          { label: 'Transformer Events', data: data.transformerTrips, backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 3 },
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Events' } }
        }
      }
    }));
  },

  renderEventTypesChart(eventTypes) {
    const entries = Object.entries(eventTypes).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!entries.length) return;
    const ctx = document.getElementById('chart-event-types');
    if (!ctx) return;
    const colors = ['#1e40af','#3b82f6','#60a5fa','#f59e0b','#fbbf24','#ef4444','#10b981','#8b5cf6','#ec4899','#64748b'];
    this.charts.push(new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: entries.map(e => e[0]),
        datasets: [{ data: entries.map(e => e[1]), backgroundColor: colors.slice(0, entries.length) }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }
      }
    }));
  },

  renderTempChart(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = sorted.map(i => Calc.formatDateShort(i.general.date));
    const temp1 = sorted.map(i => parseFloat(i.switchgear.mainTransformerTemp1) || null);
    const temp2 = sorted.map(i => parseFloat(i.switchgear.mainTransformerTemp2) || null);
    const gen1Bearing = sorted.map(i => parseFloat(i.generators.gen1.trustBearingTemp) || null);
    const gen2Bearing = sorted.map(i => parseFloat(i.generators.gen2.trustBearingTemp) || null);

    const ctx = document.getElementById('chart-temp');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Transformer M1', data: temp1, borderColor: '#ef4444', tension: 0.3, pointRadius: 4 },
          { label: 'Transformer M2', data: temp2, borderColor: '#f59e0b', tension: 0.3, pointRadius: 4 },
          { label: 'Gen 1 Bearing', data: gen1Bearing, borderColor: '#3b82f6', tension: 0.3, pointRadius: 4, borderDash: [5,5] },
          { label: 'Gen 2 Bearing', data: gen2Bearing, borderColor: '#10b981', tension: 0.3, pointRadius: 4, borderDash: [5,5] },
        ]
      },
      options: {
        responsive: true,
        scales: { y: { title: { display: true, text: '°C' } } }
      }
    }));
  },

  renderRTDChart(inspections) {
    const sorted = [...inspections].sort((a, b) => new Date(a.general.date) - new Date(b.general.date));
    const labels = sorted.map(i => Calc.formatDateShort(i.general.date));
    const gen1Stator = sorted.map(i => parseFloat(i.generators.gen1.statorRTDTemp) || null);
    const gen1BearingRTD = sorted.map(i => parseFloat(i.generators.gen1.bearingRTDTemp) || null);
    const gen2Stator = sorted.map(i => parseFloat(i.generators.gen2.statorRTDTemp) || null);
    const gen2BearingRTD = sorted.map(i => parseFloat(i.generators.gen2.bearingRTDTemp) || null);

    const ctx = document.getElementById('chart-rtd');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Gen 1 Stator RTD', data: gen1Stator, borderColor: '#3b82f6', tension: 0.3, pointRadius: 4 },
          { label: 'Gen 1 Bearing RTD', data: gen1BearingRTD, borderColor: '#93c5fd', tension: 0.3, pointRadius: 4, borderDash: [4,4] },
          { label: 'Gen 2 Stator RTD', data: gen2Stator, borderColor: '#f59e0b', tension: 0.3, pointRadius: 4 },
          { label: 'Gen 2 Bearing RTD', data: gen2BearingRTD, borderColor: '#fcd34d', tension: 0.3, pointRadius: 4, borderDash: [4,4] },
        ]
      },
      options: {
        responsive: true,
        scales: { y: { title: { display: true, text: '°C' } } }
      }
    }));
  },

  renderBatteryChart(inspection) {
    const bats = inspection.batteryBank.batteries.filter(b => b.voltage);
    if (!bats.length) return;
    const ctx = document.getElementById('chart-battery');
    if (!ctx) return;
    this.charts.push(new Chart(ctx, {
      type: 'bar',
      data: {
        labels: bats.map(b => `Bat ${b.id}`),
        datasets: [
          {
            label: 'Voltage (V)',
            data: bats.map(b => parseFloat(b.voltage) || 0),
            backgroundColor: bats.map(b => {
              const v = parseFloat(b.voltage) || 0;
              return v < 12 ? 'rgba(239,68,68,0.7)' : v < 13 ? 'rgba(245,158,11,0.7)' : 'rgba(16,185,129,0.7)';
            }),
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Capacity (%)',
            data: bats.map(b => parseFloat(b.capacity) || 0),
            type: 'line',
            borderColor: '#3b82f6',
            pointRadius: 5,
            yAxisID: 'y1',
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: { position: 'left', title: { display: true, text: 'Voltage (V)' }, min: 10, max: 15 },
          y1: { position: 'right', title: { display: true, text: 'Capacity (%)' }, min: 0, max: 100, grid: { drawOnChartArea: false } },
        }
      }
    }));
  },
};
