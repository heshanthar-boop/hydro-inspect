/**
 * sheets.js - Google Sheets integration for cloud backup
 */
const Sheets = {
  // Sync inspection data to a Google Sheet using the Sheets API
  // Requires a Google API key and Sheet ID configured in settings
  async syncToSheet(inspection) {
    const settings = await Store.getSettings();
    if (!settings.googleSheetId || !settings.googleApiKey) {
      App.toast('Configure Google Sheets in Settings first', 'error');
      return false;
    }

    const sheetId = settings.googleSheetId;
    const apiKey = settings.googleApiKey;

    // Flatten inspection data into a row
    const row = this.flattenInspection(inspection);

    try {
      // Append row to sheet
      const range = 'Sheet1!A:AZ';
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: [row]
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to sync');
      }

      App.toast('Synced to Google Sheets!', 'success');
      document.getElementById('sync-status').textContent = 'Synced';
      document.getElementById('sync-status').classList.add('connected');
      return true;
    } catch (error) {
      console.error('Sheets sync error:', error);
      App.toast(`Sync failed: ${error.message}`, 'error');
      return false;
    }
  },

  // Flatten inspection data into a single row array
  flattenInspection(insp) {
    const prev = null; // async call not possible here; diffs omitted in CSV export
    const diffs = prev ? Calc.calculateKWhDiffs(insp, prev) : null;
    const d = diffs?.ceb || {};
    const pa = diffs?.powerAnalyzers || {};

    return [
      insp.id,
      insp.general.date,
      insp.general.plantName,
      insp.general.inspectorName,
      insp.general.plantLocation,
      insp.general.weatherConditions,
      insp.general.timeOfInspection,
      // CEB Meter
      insp.cebMeter.importedTotal,
      insp.cebMeter.importedR1,
      insp.cebMeter.importedR2,
      insp.cebMeter.importedR3,
      insp.cebMeter.importedMaxDemandKVA,
      insp.cebMeter.exportTotal,
      insp.cebMeter.exportR1,
      insp.cebMeter.exportR2,
      insp.cebMeter.exportR3,
      insp.cebMeter.exportMaxDemandKVA,
      // Diffs
      d.importedTotal || '',
      d.exportTotal || '',
      diffs?.daysBetween || '',
      // Power Analyzers
      insp.powerAnalyzers.transformerPanelKWh,
      insp.powerAnalyzers.gen1PanelKWh,
      insp.powerAnalyzers.gen2PanelKWh,
      insp.powerAnalyzers.cebLVPanelKWh,
      pa.transformerPanel || '',
      pa.gen1Panel || '',
      pa.gen2Panel || '',
      // Switchgear
      insp.switchgear.outdoorBreakerTripCount,
      insp.switchgear.sf6Pressure,
      insp.switchgear.mainTransformerOilLevel,
      insp.switchgear.mainTransformerTemp1,
      insp.switchgear.mainTransformerTemp2,
      insp.switchgear.auxTransformerOilLevel,
      // Battery
      insp.batteryBank.systemVoltage,
      insp.batteryBank.chargingCurrent,
      insp.batteryBank.batteryEnergy,
      insp.batteryBank.batteryCapacity,
      insp.batteryBank.runningHours,
      // Generators
      insp.generators.gen1.runningHoursOnline,
      insp.generators.gen1.runningHourLimit,
      insp.generators.gen1.trustBearingTemp,
      insp.generators.gen2.runningHoursOnline,
      insp.generators.gen2.runningHourLimit,
      insp.generators.gen2.trustBearingTemp,
      // Events count
      (insp.relayEvents.gen1Events || []).length,
      (insp.relayEvents.gen2Events || []).length,
      (insp.relayEvents.transformerEvents || []).length,
      // Observations
      insp.observations.items.join('; '),
      insp.observations.recommendations.join('; '),
      insp.followUpActions.join('; '),
    ];
  },

  // Get headers for the sheet
  getHeaders() {
    return [
      'ID', 'Date', 'Plant Name', 'Inspector', 'Location', 'Weather', 'Time',
      'CEB Import Total', 'CEB Import R1', 'CEB Import R2', 'CEB Import R3', 'Import Max Demand KVA',
      'CEB Export Total', 'CEB Export R1', 'CEB Export R2', 'CEB Export R3', 'Export Max Demand KVA',
      'Import Diff kWh', 'Export Diff kWh', 'Days Between',
      'Transformer Panel kWh', 'Gen1 Panel kWh', 'Gen2 Panel kWh', 'CEB LV Panel kWh',
      'Transformer Diff', 'Gen1 Diff', 'Gen2 Diff',
      'Breaker Trip Count', 'SF6 Pressure', 'Transformer Oil %', 'Transformer Temp1', 'Transformer Temp2', 'Aux Oil %',
      'Battery Voltage', 'Charging Current', 'Battery Energy', 'Battery Capacity', 'Battery Running Hours',
      'Gen1 Hours Online', 'Gen1 Hour Limit', 'Gen1 Bearing Temp',
      'Gen2 Hours Online', 'Gen2 Hour Limit', 'Gen2 Bearing Temp',
      'Gen1 Events Count', 'Gen2 Events Count', 'Transformer Events Count',
      'Observations', 'Recommendations', 'Follow-up Actions',
    ];
  },

  // Export all inspections as CSV for download
  async exportCSV() {
    const inspections = await Store.getInspections();
    if (inspections.length === 0) {
      App.toast('No inspections to export', 'error');
      return;
    }

    const headers = this.getHeaders();
    const rows = inspections.map(insp => this.flattenInspection(insp));

    let csv = headers.map(h => `"${h}"`).join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HydroInspect_Export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('CSV exported!', 'success');
  },
};
