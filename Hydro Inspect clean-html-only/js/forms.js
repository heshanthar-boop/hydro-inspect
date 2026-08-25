/**
 * forms.js - Inspection form rendering and data binding
 * All async — store operations use IndexedDB.
 */
const Forms = {
  currentInspection: null,
  previousInspection: null,
  diffs: null,
  photos: [],       // loaded from IndexedDB for current inspection
  _saveTimeout: null,

  // Initialize a new or existing inspection form
  async init(inspection, container) {
    this.currentInspection = inspection;
    await Calc.loadMeterConfig();
    this.previousInspection = await Store.getPreviousInspection(inspection.general.date);
    this.diffs = this.previousInspection
      ? Calc.calculateKWhDiffs(inspection, this.previousInspection)
      : null;
    this.photos = await Store.getPhotosForInspection(inspection.id);
    container.innerHTML = this.renderForm();
    this.bindEvents(container);
    this.bindAutoSave(container);
  },

  renderForm() {
    const insp = this.currentInspection;
    const prev = this.previousInspection;
    const diffs = this.diffs;
    const prevDate = prev ? Calc.formatDateFull(prev.general.date) : null;
    const prevLabel = prevDate ? `<span class="form-hint">Previous visit: ${prevDate}</span>` : '';

    return `
      ${this.renderSessionInfo(insp)}
      ${this.renderGeneralInfo(insp)}
      ${this.renderOperatorStatement(insp)}
      ${this.renderCEBMeter(insp, prev, diffs, prevLabel)}
      ${this.renderPowerAnalyzers(insp, prev, diffs, prevLabel)}
      ${this.renderSwitchgear(insp, prev, diffs)}
      ${this.renderBatteryBank(insp)}
      ${this.renderGenerators(insp, prev, diffs)}
      ${this.renderRelayEvents(insp)}
      ${this.renderRelayFileUpload(insp)}
      ${this.renderIncidents(insp)}
      ${this.renderControlSystems(insp)}
      ${this.renderObservations(insp)}
      ${this.renderFormActions()}
    `;
  },

  // ===== Section: Session Info =====

  renderSessionInfo(insp) {
    const s = insp.session || {};
    return `
    <div class="card card-session">
      <div class="card-header" data-toggle="session">
        <h3>&#9200; Inspection Session</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-session">
        <div class="backfill-toggle-row">
          <label class="toggle-label">
            <input type="checkbox" id="backfill-toggle" ${s.backfill ? 'checked' : ''}>
            <span class="toggle-slider"></span>
            Backfill past visit
          </label>
          <span class="form-hint" id="backfill-hint">${s.backfill ? 'Entering historical data — date is editable' : 'Live inspection — date auto-set to today'}</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Start Time</label>
            <input type="time" class="form-input" data-field="session.startTime" value="${this.esc(s.startTime)}">
          </div>
          <div class="form-group">
            <label class="form-label">End Time</label>
            <div class="flex gap-8">
              <input type="time" class="form-input" data-field="session.endTime" value="${this.esc(s.endTime)}" id="session-end-time">
              <button class="btn btn-outline btn-sm" id="btn-end-now" title="Set to now">Now</button>
            </div>
          </div>
        </div>
        ${s.startTime && s.endTime ? `<div class="session-duration-badge">Duration: ${this._calcDuration(s.startTime, s.endTime)}</div>` : ''}
      </div>
    </div>`;
  },

  _calcDuration(start, end) {
    if (!start || !end) return '';
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  },

  // ===== Section: General Info =====

  renderGeneralInfo(insp) {
    const s = insp.session || {};
    const dateReadonly = !s.backfill ? 'readonly' : '';
    return `
    <div class="card">
      <div class="card-header" data-toggle="general">
        <h3>I. General Information</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-general">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Plant Name</label>
            <input type="text" class="form-input" data-field="general.plantName" value="${this.esc(insp.general.plantName)}">
          </div>
          <div class="form-group">
            <label class="form-label">Date ${s.backfill ? '<span class="badge-backfill">BACKFILL</span>' : ''}</label>
            <input type="date" class="form-input" data-field="general.date" value="${insp.general.date}" ${dateReadonly}>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Inspector</label>
            <input type="text" class="form-input" data-field="general.inspectorName" value="${this.esc(insp.general.inspectorName)}">
          </div>
          <div class="form-group">
            <label class="form-label">Location</label>
            <input type="text" class="form-input" data-field="general.plantLocation" value="${this.esc(insp.general.plantLocation)}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Weather Conditions</label>
            <input type="text" class="form-input" data-field="general.weatherConditions" value="${this.esc(insp.general.weatherConditions)}" placeholder="e.g. Sunny morning / Rainy afternoon">
          </div>
          <div class="form-group">
            <label class="form-label">Time of Inspection</label>
            <input type="text" class="form-input" data-field="general.timeOfInspection" value="${this.esc(insp.general.timeOfInspection)}" placeholder="e.g. 9 am to 2 pm">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">General Notes</label>
          <textarea class="form-textarea" data-field="general.generalNotes" placeholder="Overall plant status, discussions with operator...">${this.esc(insp.general.generalNotes)}</textarea>
        </div>
      </div>
    </div>`;
  },

  // ===== Section: Operator Statement =====

  renderOperatorStatement(insp) {
    const op = insp.operatorStatement || {};
    return `
    <div class="card">
      <div class="card-header" data-toggle="operator">
        <h3>Operator Statement</h3>
        <span class="toggle-icon collapsed">&#9660;</span>
      </div>
      <div class="card-body collapsed" id="section-operator">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Operator / Attendant Name</label>
            <input type="text" class="form-input" data-field="operatorStatement.operatorName" value="${this.esc(op.operatorName)}" placeholder="Full name of plant operator present">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Operator's Statement / Verbal Report</label>
          <textarea class="form-textarea" data-field="operatorStatement.statement" placeholder="Record what the operator said — plant issues, recent trips, unusual events, maintenance done since last visit...">${this.esc(op.statement)}</textarea>
        </div>
      </div>
    </div>`;
  },

  // ===== Section: CEB Meter =====

  renderCEBMeter(insp, prev, diffs, prevLabel) {
    const d = diffs?.ceb || {};
    return `
    <div class="card">
      <div class="card-header" data-toggle="ceb">
        <h3>II. CEB Meter Readings</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-ceb">
        ${prevLabel}
        <div class="form-group">
          <label class="form-label">Meter Reading Time</label>
          <input type="text" class="form-input" data-field="cebMeter.meterTime" value="${this.esc(insp.cebMeter.meterTime)}" placeholder="e.g. 10.37 - 29/11/2023">
        </div>

        <div class="section-title">Cumulative Imported</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RU (Total) ${Calc.diffBadgeHTML(d.importedTotal)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedTotal" value="${insp.cebMeter.importedTotal}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R1 ${Calc.diffBadgeHTML(d.importedR1)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedR1" value="${insp.cebMeter.importedR1}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">R2 ${Calc.diffBadgeHTML(d.importedR2)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedR2" value="${insp.cebMeter.importedR2}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R3 ${Calc.diffBadgeHTML(d.importedR3)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedR3" value="${insp.cebMeter.importedR3}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Max Demand</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedMaxDemandKVA" value="${insp.cebMeter.importedMaxDemandKVA}" step="0.01"><span class="input-unit">KVA</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Max Demand Date/Time</label>
            <input type="text" class="form-input" data-field="cebMeter.importedMaxDemandDate" value="${this.esc(insp.cebMeter.importedMaxDemandDate)}">
          </div>
        </div>

        <div class="section-title">Cumulative Imported History</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RU (Total)</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedHistoryTotal" value="${insp.cebMeter.importedHistoryTotal}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R1</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedHistoryR1" value="${insp.cebMeter.importedHistoryR1}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">R2</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedHistoryR2" value="${insp.cebMeter.importedHistoryR2}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R3</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedHistoryR3" value="${insp.cebMeter.importedHistoryR3}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Max Demand History</label>
          <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.importedHistoryMaxDemand" value="${insp.cebMeter.importedHistoryMaxDemand}" step="0.01"><span class="input-unit">KVA</span></div>
        </div>

        <div class="section-title">Cumulative Export</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RU (Total) ${Calc.diffBadgeHTML(d.exportTotal)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportTotal" value="${insp.cebMeter.exportTotal}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R1 ${Calc.diffBadgeHTML(d.exportR1)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportR1" value="${insp.cebMeter.exportR1}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">R2 ${Calc.diffBadgeHTML(d.exportR2)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportR2" value="${insp.cebMeter.exportR2}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R3 ${Calc.diffBadgeHTML(d.exportR3)}</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportR3" value="${insp.cebMeter.exportR3}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Export Max Demand</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportMaxDemandKVA" value="${insp.cebMeter.exportMaxDemandKVA}" step="0.01"><span class="input-unit">KVA</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Export Max Demand Date</label>
            <input type="text" class="form-input" data-field="cebMeter.exportMaxDemandDate" value="${this.esc(insp.cebMeter.exportMaxDemandDate)}">
          </div>
        </div>

        <div class="section-title">Cumulative Export History</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">RU (Total)</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportHistoryTotal" value="${insp.cebMeter.exportHistoryTotal}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R1</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportHistoryR1" value="${insp.cebMeter.exportHistoryR1}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">R2</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportHistoryR2" value="${insp.cebMeter.exportHistoryR2}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">R3</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportHistoryR3" value="${insp.cebMeter.exportHistoryR3}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Export Max Demand History</label>
          <div class="input-with-unit"><input type="number" class="form-input" data-field="cebMeter.exportHistoryMaxDemand" value="${insp.cebMeter.exportHistoryMaxDemand}" step="0.01"><span class="input-unit">KVA</span></div>
        </div>
      </div>
    </div>`;
  },

  // ===== Section: Power Analyzers =====

  renderPowerAnalyzers(insp, prev, diffs, prevLabel) {
    const field = (key) => {
      const meta = Calc.channelMeta(key);
      return this.renderAnalyzerField(insp, prev, diffs, key, meta.label, meta.path);
    };
    return `
    <div class="card">
      <div class="card-header" data-toggle="analyzers">
        <h3>Power Analyzers</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-analyzers">
        ${prevLabel}
        <div class="form-row">
          ${field('transformerPanel')}
          ${field('gen1Panel')}
        </div>
        <div class="form-row">
          ${field('gen2Panel')}
          ${field('cebLVPanel')}
        </div>
      </div>
    </div>`;
  },

  // One analyzer reading, with the period difference bridged across any meter swap
  renderAnalyzerField(insp, prev, diffs, key, label, path) {
    const value = Calc._valueAt(insp, path) ?? '';
    const d = diffs?.powerAnalyzers?.[key];
    const detail = diffs?.analyzerMeters?.[key];
    const crossed = detail?.changes || [];
    const onNewMeter = Calc.isNewMeter(key, insp.general.date);

    let chip = '';
    if (crossed.length) chip = '<span class="meter-chip meter-chip-new">NEW METER</span>';
    else if (onNewMeter) chip = '<span class="meter-chip">New meter</span>';

    let note = '';
    if (crossed.length) {
      const change = crossed[crossed.length - 1];
      const prevReading = prev ? Calc._num(Calc._valueAt(prev, path)) : null;
      const closing = Calc.oldFinalOf(change, prevReading);
      note = `
        <div class="meter-change-note">
          <strong>Meter replaced after ${Calc.formatDateFull(change.date)} reading.</strong>
          Old meter closed at ${Calc.formatNumber(closing)} kWh; new meter started at ${Calc.formatNumber(Calc.newStartOf(change))} kWh.
          <br>Period consumption bridged: ${Calc.formatNumber(detail.oldRun)} (old) + ${Calc.formatNumber(detail.newRun)} (new)
          = <strong>${Calc.formatNumber(detail.value)} kWh</strong>
        </div>`;
    } else if (typeof d === 'number' && d < 0) {
      note = `
        <div class="meter-change-warn">
          &#9888; Reading is below the previous visit. If this meter was replaced, add the swap
          under Settings &rarr; Meter Replacements so the difference is bridged.
        </div>`;
    }

    return `
      <div class="form-group">
        <label class="form-label">${label} ${Calc.diffBadgeHTML(d)} ${chip}</label>
        <div class="input-with-unit"><input type="number" class="form-input" data-field="${path}" value="${value}" step="0.01"><span class="input-unit">kWh</span></div>
        ${note}
      </div>`;
  },

  // ===== Section: Switchgear (with trip count sync) =====

  renderSwitchgear(insp, prev, diffs) {
    const tripDiff = diffs?.switchgear?.tripCount;
    const gen1TripDiff = diffs?.switchgear?.gen1TripCount;
    const gen2TripDiff = diffs?.switchgear?.gen2TripCount;

    const tripAlert = (diff, threshold = 5) => {
      if (diff === null || diff === undefined) return '';
      if (diff >= threshold) return `<span class="trip-alert">&#9888; +${diff} trips since last visit</span>`;
      return '';
    };

    return `
    <div class="card">
      <div class="card-header" data-toggle="switchgear">
        <h3>III. Switchgear &amp; Transformers</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-switchgear">
        <div class="section-title">33 kV Outdoor Breaker</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Total Trip Count ${Calc.diffBadgeHTML(tripDiff, 'trips')}</label>
            <input type="number" class="form-input" data-field="switchgear.outdoorBreakerTripCount" value="${insp.switchgear.outdoorBreakerTripCount}">
            ${tripAlert(tripDiff)}
          </div>
          <div class="form-group">
            <label class="form-label">SF6 Pressure</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="switchgear.sf6Pressure" value="${insp.switchgear.sf6Pressure}" step="0.1"><span class="input-unit">kg/cm²</span></div>
          </div>
        </div>

        <div class="section-title">Generator Circuit Breakers</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Gen 1 CB Trip Count ${Calc.diffBadgeHTML(gen1TripDiff, 'trips')}</label>
            <input type="number" class="form-input" data-field="switchgear.gen1BreakerTripCount" value="${insp.switchgear.gen1BreakerTripCount || ''}">
            ${tripAlert(gen1TripDiff)}
          </div>
          <div class="form-group">
            <label class="form-label">Gen 2 CB Trip Count ${Calc.diffBadgeHTML(gen2TripDiff, 'trips')}</label>
            <input type="number" class="form-input" data-field="switchgear.gen2BreakerTripCount" value="${insp.switchgear.gen2BreakerTripCount || ''}">
            ${tripAlert(gen2TripDiff)}
          </div>
        </div>

        <div class="section-title">Main Transformer</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Oil Level</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="switchgear.mainTransformerOilLevel" value="${insp.switchgear.mainTransformerOilLevel}" step="1" min="0" max="100"><span class="input-unit">%</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Temperature (Meter 1)</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="switchgear.mainTransformerTemp1" value="${insp.switchgear.mainTransformerTemp1}" step="0.1"><span class="input-unit">°C</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Temperature (Meter 2)</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="switchgear.mainTransformerTemp2" value="${insp.switchgear.mainTransformerTemp2}" step="0.1"><span class="input-unit">°C</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Aux Transformer Oil Level</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="switchgear.auxTransformerOilLevel" value="${insp.switchgear.auxTransformerOilLevel}" step="1" min="0" max="100"><span class="input-unit">%</span></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label checkbox-label">
              <input type="checkbox" data-field="switchgear.mainTransformerOilLeaks" ${insp.switchgear.mainTransformerOilLeaks ? 'checked' : ''}>
              Visual Oil Leaks Detected
            </label>
          </div>
          <div class="form-group">
            <label class="form-label checkbox-label">
              <input type="checkbox" data-field="switchgear.mainTransformerExcessiveHeat" ${insp.switchgear.mainTransformerExcessiveHeat ? 'checked' : ''}>
              Excessive Heat Indication
            </label>
          </div>
        </div>
      </div>
    </div>`;
  },

  // ===== Section: Battery Bank =====

  renderBatteryBank(insp) {
    const bat = insp.batteryBank;
    return `
    <div class="card">
      <div class="card-header" data-toggle="battery">
        <h3>IV. Battery Bank</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-battery">
        <div class="section-title">Main Battery Monitor</div>
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">System Voltage</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="batteryBank.systemVoltage" value="${bat.systemVoltage}" step="0.1"><span class="input-unit">V</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Charging Current</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="batteryBank.chargingCurrent" value="${bat.chargingCurrent}" step="0.1"><span class="input-unit">mA</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Power Consumption</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="batteryBank.powerConsumption" value="${bat.powerConsumption}" step="0.01"><span class="input-unit">W</span></div>
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">Battery Energy</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="batteryBank.batteryEnergy" value="${bat.batteryEnergy}" step="0.01"><span class="input-unit">kWh</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Battery Capacity</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="batteryBank.batteryCapacity" value="${bat.batteryCapacity}" step="0.1"><span class="input-unit">AH</span></div>
          </div>
          <div class="form-group">
            <label class="form-label">Running Hours</label>
            <div class="input-with-unit"><input type="number" class="form-input" data-field="batteryBank.runningHours" value="${bat.runningHours}" step="0.01"><span class="input-unit">Hr</span></div>
          </div>
        </div>
        <div class="section-title">Battery Equalizer</div>
        <div class="battery-grid">
          ${bat.batteries.map((b, i) => `
            <div class="battery-card">
              <label>Battery ${b.id}</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="batteryBank.batteries.${i}.voltage" value="${b.voltage}" step="0.1" placeholder="V"><span class="input-unit">V</span></div>
              <div class="input-with-unit mt-8"><input type="number" class="form-input" data-field="batteryBank.batteries.${i}.capacity" value="${b.capacity}" step="1" placeholder="%"><span class="input-unit">%</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
  },

  // ===== Section: Generators (with hours snapshot) =====

  renderGenerators(insp, prev, diffs) {
    const d = diffs?.generators || {};
    const prevGen1Hours = prev?.generators?.gen1?.runningHoursOnline;
    const prevGen2Hours = prev?.generators?.gen2?.runningHoursOnline;

    const genHoursCard = (num, key, gen, prevHours, hoursDiff) => {
      const limit = parseFloat(gen.runningHourAlarmLimit) || parseFloat(gen.runningHourLimit);
      const current = parseFloat(gen.runningHoursOnline);
      const remaining = (limit && current) ? (limit - current) : null;
      const remainingClass = remaining !== null && remaining < 1000 ? 'warn-red' : remaining !== null && remaining < 2000 ? 'warn-amber' : '';

      return `
        <div class="section-title">No.${num} Generator — Running Hours Snapshot</div>
        <div class="gen-hours-snapshot">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Hours Online (Current) ${Calc.diffBadgeHTML(hoursDiff, 'hrs')}</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="generators.${key}.runningHoursOnline" value="${gen.runningHoursOnline}" step="1"><span class="input-unit">hrs</span></div>
              ${prevHours ? `<span class="form-hint">Previous: ${Calc.formatNumber(prevHours)} hrs</span>` : ''}
            </div>
            <div class="form-group">
              <label class="form-label">Gen Run Hour Limit (from relay)</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="generators.${key}.runningHourLimit" value="${gen.runningHourLimit}" step="1"><span class="input-unit">hrs</span></div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Initial Running Hour</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="generators.${key}.initialRunningHour" value="${gen.initialRunningHour || ''}" step="1"><span class="input-unit">hrs</span></div>
            </div>
            <div class="form-group">
              <label class="form-label">Alarm Limit (override)</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="generators.${key}.runningHourAlarmLimit" value="${gen.runningHourAlarmLimit || ''}" step="1"><span class="input-unit">hrs</span></div>
            </div>
          </div>
          ${remaining !== null ? `<div class="hours-remaining ${remainingClass}">Hours to alarm limit: <strong>${Calc.formatNumber(remaining)} hrs</strong></div>` : ''}
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Thrust Bearing Temp</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="generators.${key}.trustBearingTemp" value="${gen.trustBearingTemp}" step="0.1"><span class="input-unit">°C</span></div>
            </div>
            <div class="form-group">
              <label class="form-label">Stator RTD Temp</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="generators.${key}.statorRTDTemp" value="${gen.statorRTDTemp || ''}" step="0.1"><span class="input-unit">°C</span></div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Bearing RTD Temp</label>
              <div class="input-with-unit"><input type="number" class="form-input" data-field="generators.${key}.bearingRTDTemp" value="${gen.bearingRTDTemp || ''}" step="0.1"><span class="input-unit">°C</span></div>
            </div>
            <div class="form-group">
              <label class="form-label">Notes</label>
              <input type="text" class="form-input" data-field="generators.${key}.notes" value="${this.esc(gen.notes)}" placeholder="Any observations...">
            </div>
          </div>
        </div>`;
    };

    return `
    <div class="card">
      <div class="card-header" data-toggle="generators">
        <h3>V. Generators</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-generators">
        ${genHoursCard(1, 'gen1', insp.generators.gen1, prevGen1Hours, d.gen1Hours)}
        ${genHoursCard(2, 'gen2', insp.generators.gen2, prevGen2Hours, d.gen2Hours)}
      </div>
    </div>`;
  },

  // ===== Section: Relay Events (manual entry) =====

  renderRelayEvents(insp) {
    const causeOptions = [
      'Neut. U/V (3rd) Trip', 'Negative Seq. Alarm', 'Reactive Power Trip',
      'Reactive Power Alarm', 'Overvoltage Trip', 'Overvoltage Alarm',
      'HiSet Phase O/C Trip', 'Overfrequency', 'Underfrequency',
      'W1 Phase Time OC', 'W2 Phase Time OC', 'W1 Neg Seq Time OC',
      'W2 Neg Seq Time OC', 'W1 Neutral Time OC', 'W2 Neutral Time OC',
      'RTD Alarm', 'Control Power Lost', 'Cont. Power Applied', 'Other'
    ].map(c => `<option value="${c}">${c}</option>`).join('');

    return `
    <div class="card">
      <div class="card-header" data-toggle="relay">
        <h3>VI. Relay Event History (Manual)</h3>
        <span class="toggle-icon collapsed">&#9660;</span>
      </div>
      <div class="card-body collapsed" id="section-relay">
        ${this.renderEventSection('No.1 Machine Events', 'gen1Events', insp.relayEvents.gen1Events, causeOptions)}
        ${this.renderEventSection('No.2 Machine Events', 'gen2Events', insp.relayEvents.gen2Events, causeOptions)}
        ${this.renderEventSection('Transformer Events', 'transformerEvents', insp.relayEvents.transformerEvents, causeOptions)}
      </div>
    </div>`;
  },

  renderEventSection(title, key, events, causeOptions) {
    const rows = events.map((e, i) => `
      <tr>
        <td>${this.esc(e.eventNumber)}</td>
        <td>${this.esc(e.date)}</td>
        <td>${this.esc(e.time)}</td>
        <td>${this.esc(e.cause)}</td>
        <td><button class="btn btn-danger btn-sm" data-remove-event="${key}" data-index="${i}">X</button></td>
      </tr>
    `).join('');

    return `
      <div class="section-title">${title} (${events.length})</div>
      ${events.length > 0 ? `
        <div class="event-table-wrapper">
          <table class="event-table">
            <thead><tr><th>#</th><th>Date</th><th>Time</th><th>Cause</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      ` : '<p class="text-muted text-sm mb-8">No events recorded</p>'}
      <div class="event-row-add">
        <input type="text" class="form-input" placeholder="Event #" id="evt-num-${key}" style="max-width:80px">
        <input type="date" class="form-input" id="evt-date-${key}" style="max-width:140px">
        <input type="text" class="form-input" placeholder="Time" id="evt-time-${key}" style="max-width:110px">
        <select class="form-select" id="evt-cause-${key}" style="max-width:200px">
          <option value="">Select cause...</option>
          ${causeOptions}
        </select>
        <button class="btn btn-primary btn-sm" data-add-event="${key}">+ Add</button>
      </div>`;
  },

  // ===== Section: Relay CSV File Upload & Parse =====

  renderRelayFileUpload(insp) {
    const rf = insp.relayFiles || {};
    const renderParsed = (label, parsed) => {
      if (!parsed) return `<p class="text-muted text-sm">No file uploaded yet</p>`;
      const tripBadge = parsed.tripCount > 0 ? `<span class="badge-trip">${parsed.tripCount} trips</span>` : '';
      return `
        <div class="relay-file-summary">
          <div class="relay-file-name">&#128196; ${this.esc(parsed.filename)}</div>
          <div class="relay-file-stats">
            <span>Total events: <strong>${parsed.totalEvents}</strong></span>
            <span>Trips: <strong class="${parsed.tripCount > 0 ? 'text-danger' : ''}">${parsed.tripCount}</strong> ${tripBadge}</span>
            <span>Alarms: <strong>${parsed.alarmCount}</strong></span>
            <span>Parsed: ${parsed.parsedAt ? new Date(parsed.parsedAt).toLocaleDateString('en-GB') : '-'}</span>
          </div>
          ${parsed.lastTrip ? `<div class="relay-last-trip">Last trip: <strong>${this.esc(parsed.lastTrip.cause)}</strong> on ${this.esc(parsed.lastTrip.date)} ${this.esc(parsed.lastTrip.time)}</div>` : ''}
          ${this.renderEventTypeBreakdown(parsed.eventTypes)}
        </div>`;
    };

    return `
    <div class="card">
      <div class="card-header" data-toggle="relayfile">
        <h3>VI-B. 489 Relay CSV File Analysis</h3>
        <span class="toggle-icon collapsed">&#9660;</span>
      </div>
      <div class="card-body collapsed" id="section-relayfile">
        <p class="text-sm text-muted mb-8">Upload the event recorder CSV exported from the 489 relay. App extracts trip/alarm summary automatically.</p>

        <div class="section-title">No.1 Generator Relay File</div>
        ${renderParsed('Gen1', rf.gen1)}
        <div class="relay-upload-row">
          <input type="file" id="relay-file-gen1" accept=".csv" class="hidden">
          <button class="btn btn-outline btn-sm" data-upload-relay="gen1">&#128196; Upload Gen1 CSV</button>
          ${rf.gen1 ? `<button class="btn btn-danger btn-sm" data-clear-relay="gen1">Clear</button>` : ''}
        </div>

        <div class="section-title">No.2 Generator Relay File</div>
        ${renderParsed('Gen2', rf.gen2)}
        <div class="relay-upload-row">
          <input type="file" id="relay-file-gen2" accept=".csv" class="hidden">
          <button class="btn btn-outline btn-sm" data-upload-relay="gen2">&#128196; Upload Gen2 CSV</button>
          ${rf.gen2 ? `<button class="btn btn-danger btn-sm" data-clear-relay="gen2">Clear</button>` : ''}
        </div>
      </div>
    </div>`;
  },

  renderEventTypeBreakdown(eventTypes) {
    if (!eventTypes || Object.keys(eventTypes).length === 0) return '';
    const sorted = Object.entries(eventTypes).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return `
      <div class="event-type-breakdown">
        <div class="text-sm text-muted mb-4">Top event types:</div>
        ${sorted.map(([type, count]) => `
          <div class="event-type-row">
            <span class="event-type-name">${this.esc(type)}</span>
            <span class="event-type-count">${count}</span>
          </div>
        `).join('')}
      </div>`;
  },

  // ===== Section: Incidents =====

  renderIncidents(insp) {
    const incidents = insp.incidents || [];
    const severityColors = { Low: '#10b981', Medium: '#f59e0b', High: '#ef4444', Critical: '#7c3aed' };

    const incidentCards = incidents.map((inc, i) => {
      const photoIds = new Set(Array.isArray(inc.photoIds) ? inc.photoIds : []);
      const photos = this.photos.filter(p =>
        (inc.id && p.incidentId === inc.id) ||
        photoIds.has(p.id)
      );
      const photoThumbs = photos.map(p => `
        <div class="incident-photo-thumb">
          <img src="${p.dataUrl}" alt="Incident photo" loading="lazy">
          <button class="photo-delete-btn" data-delete-photo="${p.id}" title="Delete photo">&times;</button>
        </div>`).join('');

      return `
        <div class="incident-card" data-incident="${i}">
          <div class="incident-card-header">
            <span class="incident-severity-dot" style="background:${severityColors[inc.severity] || '#64748b'}"></span>
            <span class="incident-category">${this.esc(inc.category)}</span>
            <span class="incident-severity">${this.esc(inc.severity)}</span>
            <button class="btn btn-danger btn-sm ml-auto" data-remove-incident="${i}">Remove</button>
          </div>
          <div class="incident-desc">${this.esc(inc.description)}</div>
          ${inc.location ? `<div class="incident-location text-sm text-muted">&#128205; ${this.esc(inc.location)}</div>` : ''}
          <div class="incident-photos">
            ${photoThumbs}
            <label class="photo-add-btn" for="incident-photo-${i}" title="Add photo">
              <span>&#43; Photo</span>
              <input type="file" id="incident-photo-${i}" accept="image/*" capture="environment" class="hidden" data-incident-photo-id="${this.esc(inc.id)}">
            </label>
          </div>
        </div>`;
    });

    return `
    <div class="card">
      <div class="card-header" data-toggle="incidents">
        <h3>Incident Notices ${incidents.length > 0 ? `<span class="badge-count">${incidents.length}</span>` : ''}</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-incidents">
        ${incidents.length === 0 ? '<p class="text-muted text-sm mb-8">No incidents recorded for this visit</p>' : incidentCards.join('')}

        <div class="incident-add-form">
          <div class="section-title">Add New Incident</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Category</label>
              <select class="form-select" id="inc-category">
                <option value="Electrical">Electrical</option>
                <option value="Mechanical">Mechanical</option>
                <option value="Civil">Civil</option>
                <option value="Safety">Safety</option>
                <option value="Environmental">Environmental</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Severity</label>
              <select class="form-select" id="inc-severity">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description</label>
            <textarea class="form-textarea" id="inc-desc" placeholder="Describe the incident, defect, or observation..." style="min-height:80px"></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Location / Equipment</label>
            <input type="text" class="form-input" id="inc-location" placeholder="e.g. Gen1 main CB, Transformer HV side...">
          </div>
          <button class="btn btn-primary" id="add-incident">+ Add Incident</button>
        </div>
      </div>
    </div>`;
  },

  // ===== Section: Control Systems =====

  renderControlSystems(insp) {
    return `
    <div class="card">
      <div class="card-header" data-toggle="control">
        <h3>VII. Control Systems</h3>
        <span class="toggle-icon collapsed">&#9660;</span>
      </div>
      <div class="card-body collapsed" id="section-control">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">PLC &amp; SCADA Status</label>
            <select class="form-select" data-field="controlSystems.plcScadaStatus">
              <option value="Working Fine" ${insp.controlSystems.plcScadaStatus === 'Working Fine' ? 'selected' : ''}>Working Fine</option>
              <option value="Issues Found" ${insp.controlSystems.plcScadaStatus === 'Issues Found' ? 'selected' : ''}>Issues Found</option>
              <option value="Not Checked" ${insp.controlSystems.plcScadaStatus === 'Not Checked' ? 'selected' : ''}>Not Checked</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Sensors &amp; Monitoring</label>
            <select class="form-select" data-field="controlSystems.sensorsStatus">
              <option value="Working Fine" ${insp.controlSystems.sensorsStatus === 'Working Fine' ? 'selected' : ''}>Working Fine</option>
              <option value="Issues Found" ${insp.controlSystems.sensorsStatus === 'Issues Found' ? 'selected' : ''}>Issues Found</option>
              <option value="Not Checked" ${insp.controlSystems.sensorsStatus === 'Not Checked' ? 'selected' : ''}>Not Checked</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Control System Notes</label>
          <textarea class="form-textarea" data-field="controlSystems.controlNotes" placeholder="Any control system observations...">${this.esc(insp.controlSystems.controlNotes)}</textarea>
        </div>
      </div>
    </div>`;
  },

  // ===== Section: Observations =====

  renderObservations(insp) {
    const obsList = insp.observations.items.map((o, i) => `
      <div class="flex-between mb-8">
        <span class="text-sm">${this.esc(o)}</span>
        <button class="btn btn-danger btn-sm" data-remove-obs="${i}">X</button>
      </div>`).join('');

    const recList = insp.observations.recommendations.map((r, i) => `
      <div class="flex-between mb-8">
        <span class="text-sm">${this.esc(r)}</span>
        <button class="btn btn-danger btn-sm" data-remove-rec="${i}">X</button>
      </div>`).join('');

    const actionList = insp.followUpActions.map((a, i) => `
      <div class="flex-between mb-8">
        <span class="text-sm">${this.esc(a)}</span>
        <button class="btn btn-danger btn-sm" data-remove-action="${i}">X</button>
      </div>`).join('');

    return `
    <div class="card">
      <div class="card-header" data-toggle="observations">
        <h3>VIII. Observations &amp; Recommendations</h3>
        <span class="toggle-icon">&#9660;</span>
      </div>
      <div class="card-body" id="section-observations">
        <div class="section-title">Observations</div>
        ${obsList || '<p class="text-muted text-sm mb-8">No observations yet</p>'}
        <div class="flex gap-8">
          <input type="text" class="form-input" id="new-obs" placeholder="Add observation...">
          <button class="btn btn-primary btn-sm" id="add-obs">+ Add</button>
        </div>

        <div class="section-title">Recommendations</div>
        ${recList || '<p class="text-muted text-sm mb-8">No recommendations yet</p>'}
        <div class="flex gap-8">
          <input type="text" class="form-input" id="new-rec" placeholder="Add recommendation...">
          <button class="btn btn-primary btn-sm" id="add-rec">+ Add</button>
        </div>

        <div class="section-title">Follow-up Actions</div>
        ${actionList || '<p class="text-muted text-sm mb-8">No follow-up actions yet</p>'}
        <div class="flex gap-8">
          <input type="text" class="form-input" id="new-action" placeholder="Add follow-up action...">
          <button class="btn btn-primary btn-sm" id="add-action">+ Add</button>
        </div>
      </div>
    </div>`;
  },

  // ===== Form Actions =====

  renderFormActions() {
    return `
    <div class="btn-group">
      <button class="btn btn-success btn-block" id="save-inspection">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save Inspection
      </button>
    </div>
    <div class="btn-group">
      <button class="btn btn-outline" id="generate-pdf">Generate PDF Report</button>
      <button class="btn btn-outline" id="email-report">Email Report</button>
    </div>`;
  },

  // ===== Event Binding =====

  bindEvents(container) {
    // Toggle sections
    container.querySelectorAll('.card-header[data-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        const icon = header.querySelector('.toggle-icon');
        body.classList.toggle('collapsed');
        icon.classList.toggle('collapsed');
      });
    });

    // Session: End Now button
    const endNowBtn = container.querySelector('#btn-end-now');
    if (endNowBtn) endNowBtn.addEventListener('click', () => {
      const now = new Date();
      const t = now.toTimeString().slice(0, 5);
      const endInput = container.querySelector('[data-field="session.endTime"]');
      if (endInput) { endInput.value = t; }
      this.currentInspection.session.endTime = t;
      this._autoSaveNow();
      this.saveAndRefresh(container);
    });

    // Backfill toggle
    const backfillToggle = container.querySelector('#backfill-toggle');
    if (backfillToggle) backfillToggle.addEventListener('change', () => {
      this.currentInspection.session.backfill = backfillToggle.checked;
      this._autoSaveNow();
      this.saveAndRefresh(container);
    });

    // Relay CSV upload
    container.querySelectorAll('[data-upload-relay]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.uploadRelay;
        container.querySelector(`#relay-file-${key}`).click();
      });
    });
    container.querySelectorAll('input[type=file][id^=relay-file-]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const key = input.id.replace('relay-file-', '');
        try {
          const text = await file.text();
          const parsed = Relay489.parseCSV(text, file.name);
          if (!this.currentInspection.relayFiles) this.currentInspection.relayFiles = {};
          this.currentInspection.relayFiles[key] = parsed;
          await Store.saveInspection(this.currentInspection);
          App.toast(`Gen${key === 'gen1' ? '1' : '2'} relay file parsed: ${parsed.totalEvents} events, ${parsed.tripCount} trips`, 'success');
          this.saveAndRefresh(container);
        } catch (err) {
          App.toast('Failed to parse relay CSV: ' + err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-clear-relay]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.clearRelay;
        this.currentInspection.relayFiles[key] = null;
        this.saveAndRefresh(container);
      });
    });

    // Incident: add
    const addIncidentBtn = container.querySelector('#add-incident');
    if (addIncidentBtn) addIncidentBtn.addEventListener('click', () => {
      const desc = container.querySelector('#inc-desc').value.trim();
      if (!desc) { App.toast('Enter incident description', 'error'); return; }
      const incident = {
        id: 'inc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        category: container.querySelector('#inc-category').value,
        severity: container.querySelector('#inc-severity').value,
        description: desc,
        location: container.querySelector('#inc-location').value.trim(),
        timestamp: new Date().toISOString(),
        photoIds: [],
      };
      if (!this.currentInspection.incidents) this.currentInspection.incidents = [];
      this.currentInspection.incidents.push(incident);
      this.saveAndRefresh(container);
    });

    // Incident: remove
    container.querySelectorAll('[data-remove-incident]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.removeIncident);
        const incidents = this.currentInspection.incidents || [];
        const removed = incidents[idx];
        const removedId = removed && removed.id;
        const removedPhotoIds = new Set(Array.isArray(removed && removed.photoIds) ? removed.photoIds : []);
        const photosToDelete = this.photos.filter(p =>
          (removedId && p.incidentId === removedId) ||
          removedPhotoIds.has(p.id)
        );
        for (const photo of photosToDelete) {
          await Store.deletePhoto(photo.id);
        }
        const deletedIds = new Set(photosToDelete.map(p => p.id));
        this.photos = this.photos.filter(p => !deletedIds.has(p.id));
        this.currentInspection.incidents.splice(idx, 1);
        // Remove deleted photo references from remaining incidents
        (this.currentInspection.incidents || []).forEach(inc => {
          if (inc.photoIds) inc.photoIds = inc.photoIds.filter(id => !deletedIds.has(id));
        });
        await Store.saveInspection(this.currentInspection);
        this.saveAndRefresh(container);
      });
    });

    // Incident: photo upload
    container.querySelectorAll('[data-incident-photo-id]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const incidentId = input.dataset.incidentPhotoId;
        const incident = (this.currentInspection.incidents || []).find(inc => inc.id === incidentId);
        if (!incident) {
          App.toast('Incident not found for photo upload', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const dataUrl = ev.target.result;
          const photo = {
            id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            inspectionId: this.currentInspection.id,
            incidentId,
            dataUrl,
            caption: '',
            timestamp: new Date().toISOString(),
          };
          await Store.savePhoto(photo);
          if (!incident.photoIds) incident.photoIds = [];
          incident.photoIds.push(photo.id);
          await Store.saveInspection(this.currentInspection);
          this.photos.push(photo);
          this.saveAndRefresh(container);
        };
        reader.readAsDataURL(file);
      });
    });

    // Photo delete
    container.querySelectorAll('[data-delete-photo]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const photoId = btn.dataset.deletePhoto;
        await Store.deletePhoto(photoId);
        this.photos = this.photos.filter(p => p.id !== photoId);
        // Remove from all incident photoIds
        (this.currentInspection.incidents || []).forEach(inc => {
          if (inc.photoIds) inc.photoIds = inc.photoIds.filter(id => id !== photoId);
        });
        await Store.saveInspection(this.currentInspection);
        this.saveAndRefresh(container);
      });
    });

    // Add relay events (manual)
    container.querySelectorAll('[data-add-event]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.addEvent;
        const num = document.getElementById(`evt-num-${key}`).value;
        const date = document.getElementById(`evt-date-${key}`).value;
        const time = document.getElementById(`evt-time-${key}`).value;
        const cause = document.getElementById(`evt-cause-${key}`).value;
        if (!cause) { App.toast('Please select a cause', 'error'); return; }
        this.currentInspection.relayEvents[key].push({ eventNumber: num, date, time, cause });
        this.saveAndRefresh(container);
      });
    });

    container.querySelectorAll('[data-remove-event]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.removeEvent;
        const idx = parseInt(btn.dataset.index);
        this.currentInspection.relayEvents[key].splice(idx, 1);
        this.saveAndRefresh(container);
      });
    });

    // Observations
    const addObs = container.querySelector('#add-obs');
    if (addObs) addObs.addEventListener('click', () => {
      const input = container.querySelector('#new-obs');
      if (input.value.trim()) { this.currentInspection.observations.items.push(input.value.trim()); this.saveAndRefresh(container); }
    });
    const addRec = container.querySelector('#add-rec');
    if (addRec) addRec.addEventListener('click', () => {
      const input = container.querySelector('#new-rec');
      if (input.value.trim()) { this.currentInspection.observations.recommendations.push(input.value.trim()); this.saveAndRefresh(container); }
    });
    const addAction = container.querySelector('#add-action');
    if (addAction) addAction.addEventListener('click', () => {
      const input = container.querySelector('#new-action');
      if (input.value.trim()) { this.currentInspection.followUpActions.push(input.value.trim()); this.saveAndRefresh(container); }
    });
    container.querySelectorAll('[data-remove-obs]').forEach(btn => btn.addEventListener('click', () => {
      this.currentInspection.observations.items.splice(parseInt(btn.dataset.removeObs), 1);
      this.saveAndRefresh(container);
    }));
    container.querySelectorAll('[data-remove-rec]').forEach(btn => btn.addEventListener('click', () => {
      this.currentInspection.observations.recommendations.splice(parseInt(btn.dataset.removeRec), 1);
      this.saveAndRefresh(container);
    }));
    container.querySelectorAll('[data-remove-action]').forEach(btn => btn.addEventListener('click', () => {
      this.currentInspection.followUpActions.splice(parseInt(btn.dataset.removeAction), 1);
      this.saveAndRefresh(container);
    }));

    // Save button
    const saveBtn = container.querySelector('#save-inspection');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
      this.collectFormData(container);
      const v = this.validateInspection(this.currentInspection);
      if (!v.valid) {
        App.toast('Cannot save: ' + v.errors.join(', '), 'error');
        return;
      }
      try {
        await Store.saveInspection(this.currentInspection);
        App.toast('Inspection saved!', 'success');
      } catch (err) {
        console.error('Save failed:', err);
        App.toast('Save failed: ' + (err && err.message ? err.message : 'unknown error'), 'error');
      }
    });

    // PDF
    const pdfBtn = container.querySelector('#generate-pdf');
    if (pdfBtn) pdfBtn.addEventListener('click', async () => {
      this.collectFormData(container);
      const photos = await Store.getPhotosForInspection(this.currentInspection.id);
      Reports.generatePDF(this.currentInspection, photos);
    });

    // Email
    const emailBtn = container.querySelector('#email-report');
    if (emailBtn) emailBtn.addEventListener('click', () => {
      this.collectFormData(container);
      Reports.emailReport(this.currentInspection);
    });
  },

  // Auto-save on field change with debounce
  bindAutoSave(container) {
    container.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', () => {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = setTimeout(() => {
          this.collectFormData(container);
          Store.saveInspection(this.currentInspection);
        }, 1200);
      });
    });
  },

  _autoSaveNow() {
    clearTimeout(this._saveTimeout);
    Store.saveInspection(this.currentInspection);
  },

  // Collect all [data-field] inputs into inspection object
  collectFormData(container) {
    container.querySelectorAll('[data-field]').forEach(input => {
      const path = input.dataset.field.split('.');
      let obj = this.currentInspection;
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i]];
      }
      const key = path[path.length - 1];
      if (input.type === 'checkbox') {
        obj[key] = input.checked;
      } else {
        obj[key] = input.value;
      }
    });
  },

  async saveAndRefresh(container) {
    this.collectFormData(container);
    await Store.saveInspection(this.currentInspection);
    // Preserve scroll position
    const scrollY = container.scrollTop || window.scrollY;
    await this.init(this.currentInspection, container);
    container.scrollTop = scrollY;
    window.scrollTo(0, scrollY);
  },

  esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // Validate required fields before save
  validateInspection(insp) {
    const errors = [];
    if (!insp || !insp.general) {
      return { valid: false, errors: ['inspection data missing'] };
    }
    const g = insp.general;
    if (!g.date || !String(g.date).trim()) errors.push('inspection date is required');
    if (!g.plantName || !String(g.plantName).trim()) errors.push('plant name is required');
    if (!g.inspectorName || !String(g.inspectorName).trim()) errors.push('inspector name is required');

    // Sanity check on date — must be a real, parseable date, not in the far future
    if (g.date) {
      const d = new Date(g.date);
      if (isNaN(d.getTime())) {
        errors.push('inspection date is not valid');
      } else {
        const now = new Date();
        const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        if (d > oneYearAhead) errors.push('inspection date is more than a year in the future');
      }
    }
    return { valid: errors.length === 0, errors };
  },
};
