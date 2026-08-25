/**
 * reports.js - PDF report generation and email sharing
 * generatePDF now accepts photos array from IndexedDB.
 */
const Reports = {
  async generatePDF(inspection, photos) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = 15;
    await Calc.loadMeterConfig();
    const prev = await Store.getPreviousInspection(inspection.general.date);
    const diffs = prev ? Calc.calculateKWhDiffs(inspection, prev) : null;
    const settings = await Store.getSettings();
    photos = photos || [];

    const checkPage = (needed = 20) => {
      if (y + needed > 275) { doc.addPage(); y = 15; }
    };

    const addTitle = (text) => {
      checkPage(15);
      doc.setFillColor(30, 64, 175);
      doc.rect(margin, y, contentWidth, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(text, margin + 3, y + 5.5);
      y += 12;
      doc.setTextColor(0, 0, 0);
    };

    const addSubTitle = (text) => {
      checkPage(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 64, 175);
      doc.text(text, margin, y);
      y += 5;
      doc.setTextColor(0, 0, 0);
    };

    const addRow = (label, value, unit = '') => {
      checkPage(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      doc.text(label + ':', margin + 2, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      const val = (value !== undefined && value !== '' && value !== null)
        ? `${Calc.formatNumber(value)} ${unit}`.trim() : '-';
      doc.text(val, margin + 75, y);
      y += 5;
    };

    const addRowWithDiff = (label, value, diff, unit = 'kWh') => {
      checkPage(6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      doc.text(label + ':', margin + 2, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      const val = (value !== undefined && value !== '' && value !== null)
        ? `${Calc.formatNumber(value)} ${unit}` : '-';
      doc.text(val, margin + 75, y);
      if (diff !== null && diff !== undefined) {
        const sign = diff >= 0 ? '+' : '';
        doc.setFontSize(7.5);
        if (diff >= 0) doc.setTextColor(22, 163, 74);
        else doc.setTextColor(220, 38, 38);
        doc.text(`(${sign}${Calc.formatNumber(diff)} ${unit})`, margin + 130, y);
        doc.setTextColor(0, 0, 0);
      }
      y += 5;
    };

    const addText = (text) => {
      if (!text) return;
      checkPage(8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(String(text), contentWidth - 4);
      doc.text(lines, margin + 2, y);
      y += lines.length * 4 + 2;
    };

    const addNote = (text) => {
      if (!text) return;
      checkPage(8);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 53, 15);
      const lines = doc.splitTextToSize(String(text), contentWidth - 8);
      doc.text(lines, margin + 6, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      y += lines.length * 3.6 + 2;
    };

    const addAlertRow = (label, value, unit = '') => {
      checkPage(6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(220, 38, 38);
      doc.text('! ' + label + ':', margin + 2, y);
      doc.text(`${Calc.formatNumber(value)} ${unit}`.trim(), margin + 75, y);
      doc.setTextColor(0, 0, 0);
      y += 5;
    };

    // ===== Report Header =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 64, 175);
    doc.text('Monthly Mini Hydro Plant', pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.text('Electrical and Electronic Inspection Report', pageWidth / 2, y, { align: 'center' });
    y += 8;
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // ===== Session Info =====
    const session = inspection.session || {};
    const sessionLine = [
      session.startTime ? `Start: ${session.startTime}` : '',
      session.endTime ? `End: ${session.endTime}` : '',
      session.duration ? `Duration: ${session.duration}` : '',
      session.backfill ? '[BACKFILL - Historical Data]' : '',
    ].filter(Boolean).join('   ');
    if (sessionLine) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(sessionLine, margin, y);
      y += 5;
      doc.setTextColor(0, 0, 0);
    }

    // ===== General Info =====
    addTitle('I. General Information');
    addRow('Plant Name', inspection.general.plantName);
    addRow('Date', Calc.formatDateFull(inspection.general.date));
    addRow('Inspector', inspection.general.inspectorName);
    addRow('Location', inspection.general.plantLocation);
    addRow('Weather', inspection.general.weatherConditions);
    addRow('Time of Inspection', inspection.general.timeOfInspection);
    if (session.startTime || session.endTime) {
      const dur = (session.startTime && session.endTime)
        ? `${session.startTime} - ${session.endTime}` : session.startTime || session.endTime;
      addRow('Inspection Time (Actual)', dur);
    }
    if (inspection.general.generalNotes) { y += 2; addText(inspection.general.generalNotes); }

    // ===== Operator Statement =====
    const op = inspection.operatorStatement || {};
    if (op.operatorName || op.statement) {
      addTitle('Operator Statement');
      if (op.operatorName) addRow('Operator Present', op.operatorName);
      if (op.statement) { y += 2; addText(op.statement); }
    }

    // ===== CEB Meter =====
    addTitle('II. CEB Meter Readings');
    if (diffs) { addRow('Days since last inspection', diffs.daysBetween, 'days'); y += 2; }
    addSubTitle('Cumulative Imported');
    const d = diffs?.ceb || {};
    addRowWithDiff('RU (Total)', inspection.cebMeter.importedTotal, d.importedTotal);
    addRowWithDiff('R1', inspection.cebMeter.importedR1, d.importedR1);
    addRowWithDiff('R2', inspection.cebMeter.importedR2, d.importedR2);
    addRowWithDiff('R3', inspection.cebMeter.importedR3, d.importedR3);
    addRow('Max Demand', inspection.cebMeter.importedMaxDemandKVA, 'KVA');

    addSubTitle('Cumulative Export');
    addRowWithDiff('RU (Total)', inspection.cebMeter.exportTotal, d.exportTotal);
    addRowWithDiff('R1', inspection.cebMeter.exportR1, d.exportR1);
    addRowWithDiff('R2', inspection.cebMeter.exportR2, d.exportR2);
    addRowWithDiff('R3', inspection.cebMeter.exportR3, d.exportR3);
    addRow('Export Max Demand', inspection.cebMeter.exportMaxDemandKVA, 'KVA');

    addSubTitle('Power Analyzers');
    const pa = diffs?.powerAnalyzers || {};
    const paMeters = diffs?.analyzerMeters || {};
    Calc.METER_CHANNELS.forEach(ch => {
      addRowWithDiff(ch.label, Calc._valueAt(inspection, ch.path), pa[ch.key]);
      // Explain any bridged difference so the figure can be checked against the meters
      const detail = paMeters[ch.key];
      const crossed = detail?.changes || [];
      if (crossed.length) {
        const change = crossed[crossed.length - 1];
        const prevReading = prev ? Calc._num(Calc._valueAt(prev, ch.path)) : null;
        addNote(`Meter replaced after ${Calc.formatDateFull(change.date)}: old closed at `
          + `${Calc.formatNumber(Calc.oldFinalOf(change, prevReading))} kWh, new started at `
          + `${Calc.formatNumber(Calc.newStartOf(change))} kWh. Difference bridged `
          + `(${Calc.formatNumber(detail.oldRun)} old + ${Calc.formatNumber(detail.newRun)} new).`);
      }
    });

    // ===== Switchgear =====
    addTitle('III. Switchgear & Transformers');
    addSubTitle('33 kV Outdoor Breaker');
    addRowWithDiff('Total Trip Count', inspection.switchgear.outdoorBreakerTripCount, diffs?.switchgear?.tripCount, 'trips');
    addRow('SF6 Pressure', inspection.switchgear.sf6Pressure, 'kg/cm²');
    addSubTitle('Generator Circuit Breakers');
    addRowWithDiff('Gen 1 CB Trip Count', inspection.switchgear.gen1BreakerTripCount, diffs?.switchgear?.gen1TripCount, 'trips');
    addRowWithDiff('Gen 2 CB Trip Count', inspection.switchgear.gen2BreakerTripCount, diffs?.switchgear?.gen2TripCount, 'trips');
    addSubTitle('Main Transformer');
    addRow('Oil Level', inspection.switchgear.mainTransformerOilLevel, '%');
    addRow('Temperature (Meter 1)', inspection.switchgear.mainTransformerTemp1, '°C');
    addRow('Temperature (Meter 2)', inspection.switchgear.mainTransformerTemp2, '°C');
    if (inspection.switchgear.mainTransformerOilLeaks) addAlertRow('Oil Leaks', 'DETECTED');
    else addRow('Oil Leaks', 'No');
    if (inspection.switchgear.mainTransformerExcessiveHeat) addAlertRow('Excessive Heat', 'DETECTED');
    else addRow('Excessive Heat', 'No');
    addRow('Aux Transformer Oil Level', inspection.switchgear.auxTransformerOilLevel, '%');

    // ===== Battery Bank =====
    addTitle('IV. Battery Bank');
    addRow('System Voltage', inspection.batteryBank.systemVoltage, 'V');
    addRow('Charging Current', inspection.batteryBank.chargingCurrent, 'mA');
    addRow('Power Consumption', inspection.batteryBank.powerConsumption, 'W');
    addRow('Battery Energy', inspection.batteryBank.batteryEnergy, 'kWh');
    addRow('Battery Capacity', inspection.batteryBank.batteryCapacity, 'AH');
    addRow('Running Hours', inspection.batteryBank.runningHours, 'Hr');
    if (inspection.batteryBank.batteries.some(b => b.voltage)) {
      checkPage(30);
      const batData = inspection.batteryBank.batteries
        .filter(b => b.voltage)
        .map(b => [`Battery ${b.id}`, `${b.voltage} V`, `${b.capacity || '-'}%`]);
      doc.autoTable({
        startY: y, margin: { left: margin + 2 },
        head: [['Battery', 'Voltage', 'Capacity']],
        body: batData,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 64, 175] },
        tableWidth: 90,
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    // ===== Generators =====
    addTitle('V. Generator Running Hours Snapshot');
    const gd = diffs?.generators || {};

    const addGenSection = (label, gen, hoursDiff) => {
      addSubTitle(label);
      addRowWithDiff('Running Hours Online', gen.runningHoursOnline, hoursDiff, 'hrs');
      addRow('Running Hour Limit (from relay)', gen.runningHourLimit, 'hrs');
      if (gen.runningHourAlarmLimit) addRow('Alarm Limit', gen.runningHourAlarmLimit, 'hrs');
      if (gen.initialRunningHour) addRow('Initial Running Hour', gen.initialRunningHour, 'hrs');
      // Remaining hours warning
      const limit = parseFloat(gen.runningHourAlarmLimit) || parseFloat(gen.runningHourLimit);
      const current = parseFloat(gen.runningHoursOnline);
      if (limit && current) {
        const remaining = limit - current;
        if (remaining < 2000) {
          addAlertRow('Hours to Alarm Limit', remaining, 'hrs');
        } else {
          addRow('Hours to Alarm Limit', remaining, 'hrs');
        }
      }
      addRow('Thrust Bearing Temp', gen.trustBearingTemp, '°C');
      if (gen.statorRTDTemp) addRow('Stator RTD Temp', gen.statorRTDTemp, '°C');
      if (gen.bearingRTDTemp) addRow('Bearing RTD Temp', gen.bearingRTDTemp, '°C');
      if (gen.notes) addText('Notes: ' + gen.notes);
    };

    addGenSection('No.1 Generator', inspection.generators.gen1, gd.gen1Hours);
    addGenSection('No.2 Generator', inspection.generators.gen2, gd.gen2Hours);

    // ===== Relay CSV File Summary =====
    const rf = inspection.relayFiles || {};
    if (rf.gen1 || rf.gen2) {
      addTitle('VI-A. 489 Relay File Analysis');
      if (rf.gen1) {
        addSubTitle('No.1 Generator Relay');
        addText(Relay489.summaryText(rf.gen1));
        if (rf.gen1.lastTrip) addText(`Last Trip: ${rf.gen1.lastTrip.cause} on ${rf.gen1.lastTrip.date} ${rf.gen1.lastTrip.time}`);
        if (rf.gen1.eventTypes && Object.keys(rf.gen1.eventTypes).length) {
          checkPage(30);
          const evtData = Object.entries(rf.gen1.eventTypes).sort((a,b)=>b[1]-a[1]).slice(0, 10)
            .map(([cause, count]) => [cause, String(count)]);
          doc.autoTable({
            startY: y, margin: { left: margin + 2 },
            head: [['Event Type', 'Count']],
            body: evtData,
            styles: { fontSize: 7.5, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 64, 175] },
            tableWidth: contentWidth - 10,
          });
          y = doc.lastAutoTable.finalY + 5;
        }
      }
      if (rf.gen2) {
        addSubTitle('No.2 Generator Relay');
        addText(Relay489.summaryText(rf.gen2));
        if (rf.gen2.lastTrip) addText(`Last Trip: ${rf.gen2.lastTrip.cause} on ${rf.gen2.lastTrip.date} ${rf.gen2.lastTrip.time}`);
        if (rf.gen2.eventTypes && Object.keys(rf.gen2.eventTypes).length) {
          checkPage(30);
          const evtData = Object.entries(rf.gen2.eventTypes).sort((a,b)=>b[1]-a[1]).slice(0, 10)
            .map(([cause, count]) => [cause, String(count)]);
          doc.autoTable({
            startY: y, margin: { left: margin + 2 },
            head: [['Event Type', 'Count']],
            body: evtData,
            styles: { fontSize: 7.5, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 64, 175] },
            tableWidth: contentWidth - 10,
          });
          y = doc.lastAutoTable.finalY + 5;
        }
      }
    }

    // ===== Manual Relay Events =====
    const renderEvtTable = (title, events) => {
      if (!events || events.length === 0) return;
      addTitle(title);
      checkPage(40);
      const evtData = events.map(e => [e.eventNumber || '-', e.date || '-', e.time || '-', e.cause || '-']);
      doc.autoTable({
        startY: y, margin: { left: margin },
        head: [['Event #', 'Date', 'Time', 'Cause']],
        body: evtData,
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 64, 175] },
        columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 28 }, 2: { cellWidth: 28 } },
        tableWidth: contentWidth,
      });
      y = doc.lastAutoTable.finalY + 5;
    };
    renderEvtTable('VI-B. No.1 Machine Relay Events (Manual)', inspection.relayEvents.gen1Events);
    renderEvtTable('No.2 Machine Relay Events (Manual)', inspection.relayEvents.gen2Events);
    renderEvtTable('Transformer Relay Events (Manual)', inspection.relayEvents.transformerEvents);

    // ===== Incidents =====
    const incidents = inspection.incidents || [];
    if (incidents.length > 0) {
      addTitle(`VII. Incident Notices (${incidents.length})`);
      for (let i = 0; i < incidents.length; i++) {
        const inc = incidents[i];
        checkPage(40);
        // Incident header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        const sevColor = inc.severity === 'Critical' ? [124,58,237] : inc.severity === 'High' ? [220,38,38] : inc.severity === 'Medium' ? [245,158,11] : [16,185,129];
        doc.setTextColor(...sevColor);
        doc.text(`#${i+1} [${inc.severity}] ${inc.category}`, margin + 2, y);
        y += 5;
        doc.setTextColor(0,0,0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        if (inc.location) { addText('Location: ' + inc.location); }
        addText(inc.description);

        // Photos for this incident
        const incPhotoIds = new Set(Array.isArray(inc.photoIds) ? inc.photoIds : []);
        const incPhotos = photos.filter(p =>
          (inc.id && p.incidentId === inc.id) ||
          incPhotoIds.has(p.id)
        );
        if (incPhotos.length > 0) {
          checkPage(70);
          let px = margin;
          const photoW = (contentWidth - 8) / 2;
          const photoH = 45;
          for (const photo of incPhotos.slice(0, 4)) {
            try {
              if (px + photoW > pageWidth - margin) { px = margin; y += photoH + 4; checkPage(photoH + 4); }
              doc.addImage(photo.dataUrl, 'JPEG', px, y, photoW, photoH, undefined, 'FAST');
              px += photoW + 4;
            } catch(e) { /* skip unreadable image */ }
          }
          y += photoH + 6;
        }
        y += 3;
      }
    }

    // ===== Control Systems =====
    addTitle('VIII. Control Systems');
    addRow('PLC & SCADA', inspection.controlSystems.plcScadaStatus);
    addRow('Sensors & Monitoring', inspection.controlSystems.sensorsStatus);
    if (inspection.controlSystems.controlNotes) addText(inspection.controlSystems.controlNotes);

    // ===== Observations =====
    addTitle('IX. Observations & Recommendations');
    if (inspection.observations.items.length > 0) {
      addSubTitle('Observations');
      inspection.observations.items.forEach(o => addText('- ' + o));
    }
    if (inspection.observations.recommendations.length > 0) {
      addSubTitle('Recommendations');
      inspection.observations.recommendations.forEach(r => addText('- ' + r));
    }
    if (inspection.followUpActions.length > 0) {
      addSubTitle('Follow-up Actions');
      inspection.followUpActions.forEach(a => addText('- ' + a));
    }

    // ===== Signature =====
    checkPage(30);
    y += 10;
    doc.setDrawColor(0);
    doc.line(margin, y, margin + 60, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(settings.inspectorName || inspection.general.inspectorName, margin, y);
    y += 4;
    doc.setFontSize(8);
    doc.text(`Phone: ${settings.inspectorPhone || ''}`, margin, y);
    y += 4;
    doc.text(`Email: ${settings.inspectorEmail || ''}`, margin, y);

    const dateStr = inspection.general.date.replace(/-/g, '');
    const filename = `Inspection_Report_${dateStr}_${inspection.general.plantName.replace(/\s+/g,'_').substring(0,20)}.pdf`;
    doc.save(filename);
    App.toast('PDF report generated!', 'success');
  },

  async emailReport(inspection) {
    const settings = await Store.getSettings();
    const date = Calc.formatDateFull(inspection.general.date);
    const subject = encodeURIComponent(`Monthly Inspection Report - ${inspection.general.plantName} - ${date}`);
    const op = inspection.operatorStatement || {};
    const session = inspection.session || {};
    const incidents = inspection.incidents || [];

    let body = `Monthly Mini Hydro Plant Electrical Inspection Report\n\n`;
    body += `Plant: ${inspection.general.plantName}\n`;
    body += `Date: ${date}\n`;
    body += `Inspector: ${inspection.general.inspectorName}\n`;
    body += `Location: ${inspection.general.plantLocation}\n`;
    body += `Weather: ${inspection.general.weatherConditions}\n`;
    if (session.startTime) body += `Session: ${session.startTime}${session.endTime ? ' - ' + session.endTime : ''}\n`;
    if (op.operatorName) body += `Operator: ${op.operatorName}\n`;
    body += '\n';

    body += `--- CEB Meter (Cumulative Imported) ---\n`;
    body += `Total: ${Calc.formatNumber(inspection.cebMeter.importedTotal)} kWh\n`;
    body += `R1: ${Calc.formatNumber(inspection.cebMeter.importedR1)} kWh\n\n`;

    body += `--- Power Analyzers ---\n`;
    body += `Transformer Panel: ${Calc.formatNumber(inspection.powerAnalyzers.transformerPanelKWh)} kWh\n`;
    body += `Gen 1 Panel: ${Calc.formatNumber(inspection.powerAnalyzers.gen1PanelKWh)} kWh\n`;
    body += `Gen 2 Panel: ${Calc.formatNumber(inspection.powerAnalyzers.gen2PanelKWh)} kWh\n\n`;

    body += `--- Generator Hours ---\n`;
    body += `Gen 1: ${Calc.formatNumber(inspection.generators.gen1.runningHoursOnline)} hrs (limit: ${inspection.generators.gen1.runningHourLimit || '-'})\n`;
    body += `Gen 2: ${Calc.formatNumber(inspection.generators.gen2.runningHoursOnline)} hrs (limit: ${inspection.generators.gen2.runningHourLimit || '-'})\n\n`;

    body += `--- Switchgear ---\n`;
    body += `33kV Trip Count: ${inspection.switchgear.outdoorBreakerTripCount}\n`;
    body += `Gen1 CB Trips: ${inspection.switchgear.gen1BreakerTripCount || '-'}\n`;
    body += `Gen2 CB Trips: ${inspection.switchgear.gen2BreakerTripCount || '-'}\n`;
    body += `SF6 Pressure: ${inspection.switchgear.sf6Pressure} kg/cm2\n\n`;

    if (incidents.length > 0) {
      body += `--- Incidents (${incidents.length}) ---\n`;
      incidents.forEach((inc, i) => body += `#${i+1} [${inc.severity}] ${inc.category}: ${inc.description}\n`);
      body += '\n';
    }

    if (op.statement) { body += `--- Operator Statement ---\n${op.statement}\n\n`; }

    if (inspection.observations.items.length > 0) {
      body += `--- Observations ---\n`;
      inspection.observations.items.forEach(o => body += `- ${o}\n`);
      body += '\n';
    }
    if (inspection.observations.recommendations.length > 0) {
      body += `--- Recommendations ---\n`;
      inspection.observations.recommendations.forEach(r => body += `- ${r}\n`);
      body += '\n';
    }

    body += `\nNote: Full PDF report attached separately.\n`;
    body += `\n${settings.inspectorName}\n${settings.inspectorPhone}\n${settings.inspectorEmail}`;

    const to = encodeURIComponent(settings.emailRecipients || '');
    window.open(`mailto:${to}?subject=${subject}&body=${encodeURIComponent(body)}`);
    App.toast('Email client opened. Attach the PDF report before sending.', 'success');
  },
};
