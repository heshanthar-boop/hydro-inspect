/**
 * relay489.js - GE/Multilin 489 relay CSV event file parser
 * Handles the standard EVENT RECORDER CSV format from the 489 relay.
 * Format: rows 1-3 are headers, row 4 blank, row 5 column headers, row 6+ events.
 */
const Relay489 = {

  parseCSV(csvText, filename) {
    const lines = csvText.split('\n').filter(l => l.trim());

    // Find the header row (contains "Event Number")
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Event Number') || lines[i].includes('Date of Event')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) throw new Error('Not a valid 489 event recorder CSV');

    // Parse header row to get column indices
    const headers = this._parseRow(lines[headerIdx]);
    const colIdx = {
      eventNumber: this._findCol(headers, 'Event Number'),
      date: this._findCol(headers, 'Date of Event'),
      time: this._findCol(headers, 'Time of Event'),
      cause: this._findCol(headers, 'Cause of Event'),
      tachometer: this._findCol(headers, 'Tachometer'),
      phaseACurrent: this._findCol(headers, 'Phase A Current'),
      phaseBCurrent: this._findCol(headers, 'Phase B Current'),
      phaseCCurrent: this._findCol(headers, 'Phase C Current'),
      abVoltage: this._findCol(headers, 'A-B voltage'),
      frequency: this._findCol(headers, 'Frequency'),
      realPower: this._findCol(headers, 'Real Power'),
      reactivePower: this._findCol(headers, 'Reactive Power'),
      hottestStatorRTD: this._findCol(headers, 'Hottest Stator RTD Temperature'),
      hottestBearingRTD: this._findCol(headers, 'Hottest Bearing RTD Temperature'),
    };

    // Extract metadata from top rows
    let totalEventsSinceClear = 0;
    let lastClearedDate = '';
    for (let i = 0; i < Math.min(5, headerIdx); i++) {
      const line = lines[i];
      if (line.includes('Total Number of Events')) {
        const m = line.match(/(\d+)/);
        if (m) totalEventsSinceClear = parseInt(m[1]);
      }
      if (line.includes('Last Cleared Date')) {
        const m = line.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (m) lastClearedDate = m[1];
      }
    }

    // Parse event rows
    const events = [];
    const eventTypes = {};
    let tripCount = 0;
    let alarmCount = 0;
    let lastTrip = null;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = this._parseRow(lines[i]);
      if (row.length < 4) continue;

      const cause = this._cell(row, colIdx.cause);
      if (!cause) continue;

      const event = {
        eventNumber: this._cell(row, colIdx.eventNumber),
        date: this._cleanDate(this._cell(row, colIdx.date)),
        time: this._cell(row, colIdx.time),
        cause,
        tachometer: this._cell(row, colIdx.tachometer),
        phaseACurrent: this._cell(row, colIdx.phaseACurrent),
        abVoltage: this._cell(row, colIdx.abVoltage),
        frequency: this._cell(row, colIdx.frequency),
        realPower: this._cell(row, colIdx.realPower),
        statorRTD: this._cell(row, colIdx.hottestStatorRTD),
        bearingRTD: this._cell(row, colIdx.hottestBearingRTD),
      };

      events.push(event);
      eventTypes[cause] = (eventTypes[cause] || 0) + 1;

      if (cause.toLowerCase().includes('trip')) {
        tripCount++;
        if (!lastTrip) lastTrip = event; // first = most recent (events in reverse order)
      }
      if (cause.toLowerCase().includes('alarm')) {
        alarmCount++;
      }
    }

    return {
      filename,
      parsedAt: new Date().toISOString(),
      lastClearedDate,
      totalEventsSinceClear,
      totalEvents: events.length,
      tripCount,
      alarmCount,
      eventTypes,
      lastTrip: lastTrip ? { cause: lastTrip.cause, date: lastTrip.date, time: lastTrip.time } : null,
      // Store only recent 50 events to keep data lean — full CSV is not stored
      recentEvents: events.slice(0, 50),
    };
  },

  _parseRow(line) {
    // Handle quoted CSV fields
    const result = [];
    let inQuote = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  },

  _findCol(headers, name) {
    const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
    return idx >= 0 ? idx : -1;
  },

  _cell(row, idx) {
    if (idx < 0 || idx >= row.length) return '';
    return row[idx].replace(/^'/, '').trim(); // 489 prefixes dates with ' to prevent Excel date conversion
  },

  _cleanDate(dateStr) {
    // Remove leading apostrophe that 489 adds to prevent Excel date parsing
    return dateStr.replace(/^'/, '').trim();
  },

  // Get trips-only events from parsed data
  getTrips(parsed) {
    if (!parsed || !parsed.recentEvents) return [];
    return parsed.recentEvents.filter(e => e.cause && e.cause.toLowerCase().includes('trip'));
  },

  // Summary text for PDF
  summaryText(parsed) {
    if (!parsed) return 'No file uploaded';
    return `File: ${parsed.filename} | Total events: ${parsed.totalEvents} | Trips: ${parsed.tripCount} | Alarms: ${parsed.alarmCount} | Parsed: ${parsed.parsedAt ? new Date(parsed.parsedAt).toLocaleDateString('en-GB') : '-'}`;
  },
};
