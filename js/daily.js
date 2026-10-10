/** Daily operator cumulative meter readings, stored separately from inspections. */
const Daily = {
  channels: [
    {key:'cebImport',label:'CEB import'}, {key:'cebExport',label:'CEB export'},
    {key:'gen1',label:'No.1 generator panel',meter:'gen1Panel'},
    {key:'gen2',label:'No.2 generator panel',meter:'gen2Panel'},
    {key:'transformer',label:'Transformer panel',meter:'transformerPanel'},
    {key:'lt',label:'LT meter (CEB LV panel)',meter:'cebLVPanel'}
  ],
  previous(record, records) { return records.find(r=>r.plant===record.plant && !r.draft && r.date<record.date) || null; },
  calculate(record, records) {
    const previous=this.previous(record, [...records].sort((a,b)=>b.date.localeCompare(a.date)));
    const values={},warnings=[];
    if(!previous) return {previous:null,days:null,values,warnings};
    const days=(new Date(record.date)-new Date(previous.date))/86400000;
    for(const ch of this.channels) {
      const c=Calc._num(record.readings[ch.key]),p=Calc._num(previous.readings[ch.key]);
      let value=c===null || p===null ? null : c-p;
      if(ch.meter && Calc.crossedChanges(ch.meter,previous.date,record.date).length) {
        const changes=Calc.crossedChanges(ch.meter,previous.date,record.date);
        if(changes.some(change=>Calc._num(change.oldFinal)===null)) { value=null; warnings.push(`${ch.label}: meter replacement needs an explicit closing reading in Settings.`); }
        else value=Calc.meterDiff(ch.meter,c,p,record.date,previous.date).value;
      }
      if(value!==null && value<0) { warnings.push(`${ch.label}: counter decreased; verify the entry or meter replacement.`); value=null; }
      values[ch.key]=value;
    }
    values.generation=values.gen1!==null && values.gen2!==null ? values.gen1+values.gen2 : null;
    values.netImport=values.cebImport!==null && values.cebExport!==null ? values.cebImport-values.cebExport : null;
    return {previous,days,values,warnings};
  },
  async render(container) {
    const settings=await Store.getSettings();
    await Calc.loadMeterConfig();
    let records=await Store.getDailyReadings();
    const plants=[...new Set([settings.plantName,...records.map(r=>r.plant)])];
    container.innerHTML=`<div class="page-intro"><span class="eyebrow">OPERATOR DAILY LOG</span><h1>Daily meter readings</h1><p>Enter cumulative kWh readings at a consistent time each day. Daily differences are calculated automatically.</p></div>
      <form id="daily-form" class="chart-container"><div class="form-row"><div class="form-group"><label class="form-label">Plant</label><input class="form-input" id="daily-plant" list="daily-plants" required value="${Forms.esc(settings.plantName)}"><datalist id="daily-plants">${plants.map(p=>`<option value="${Forms.esc(p)}">`).join('')}</datalist></div><div class="form-group"><label class="form-label">Operator</label><input class="form-input" id="daily-operator" required placeholder="Operator name"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Reading date</label><input class="form-input" type="date" id="daily-date" required value="${DateEntry.localDate()}"></div><div class="form-group"><label class="form-label">Reading time</label><input class="form-input" type="time" id="daily-time" required value="${DateEntry.localTime()}"></div></div>
      <div class="daily-save-bar"><span id="daily-auto-state" role="status">Ready for entry</span><span id="daily-progress">0 / 6 readings</span></div><p id="daily-existing" class="form-hint" role="status"></p><div class="form-row daily-meter-grid">${this.channels.map(ch=>`<div class="form-group"><label class="form-label">${ch.label} — cumulative</label><div class="input-with-unit"><input type="number" class="form-input" data-daily="${ch.key}" min="0" step="0.01" required placeholder="0.00"><span class="input-unit">kWh</span></div></div>`).join('')}</div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="daily-notes" placeholder="Meter change, outage, unusual reading…"></textarea></div>
      <div id="daily-preview"></div><button type="submit" class="btn btn-primary btn-block" id="daily-save">Finish daily entry</button><p class="form-hint">Changes save automatically on this device. Incomplete entries stay as drafts. One entry per plant per day. Selecting an existing day loads its readings for correction. Saved locally; sign in to sync with the same account on another device.</p></form>
      <div class="chart-container"><div class="flex-between"><h3>Daily history</h3><button type="button" class="btn btn-outline btn-sm" id="daily-csv">Download CSV</button></div><div id="daily-history"></div></div>`;
    const form=container.querySelector('#daily-form');
    const collect=()=>({id:'daily_'+encodeURIComponent(form.querySelector('#daily-plant').value.trim())+'_'+form.querySelector('#daily-date').value,plant:form.querySelector('#daily-plant').value.trim(),date:form.querySelector('#daily-date').value,time:form.querySelector('#daily-time').value,operator:form.querySelector('#daily-operator').value.trim(),notes:form.querySelector('#daily-notes').value,readings:Object.fromEntries([...form.querySelectorAll('[data-daily]')].map(el=>[el.dataset.daily,el.value]))});
    let queue=Promise.resolve();
    let debounce;
    const state=form.querySelector('#daily-auto-state');
    const autosave=()=>{
      clearTimeout(debounce);
      const r=collect();
      const fingerprint=JSON.stringify(r);
      if(!r.plant || !r.date || r.date>DateEntry.localDate()) { state.textContent='Choose a valid plant and reading date'; return queue; }
      const invalid=[...form.querySelectorAll('input[type=number]')].find(el=>el.validity.badInput || el.validity.rangeUnderflow || el.validity.rangeOverflow || el.validity.stepMismatch);
      if(invalid){ invalid.setAttribute('aria-invalid','true'); state.textContent='Check the highlighted reading — changes not saved'; return queue; }
      form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
      if(!records.some(x=>x.id===r.id) && !r.operator && !r.notes && Object.values(r.readings).every(v=>v==='')) { state.textContent='Ready for entry'; return queue; }
      r.draft=!r.operator || !r.time || Object.values(r.readings).some(value=>value==='');
      records=[r,...records.filter(x=>x.id!==r.id)].sort((a,b)=>b.date.localeCompare(a.date));
      state.textContent='Saving…';
      queue=queue.catch(()=>{}).then(()=>Store.saveDailyReading(r)).then(()=>{
        if(form.isConnected) { if(JSON.stringify(collect())===fingerprint) state.textContent=r.draft ? 'Draft saved on this device' : 'Saved on this device'; refresh(); }
      }).catch(error=>{state.textContent='Save failed — tap Finish to retry';App.toast('Daily save failed: '+error.message,'error');});
      return queue;
    };
    this.flush=autosave;
    const refresh=()=>{
      const r=collect();form.querySelector('#daily-progress').textContent=`${Object.values(r.readings).filter(v=>v!=='').length} / 6 readings`;container.querySelector('#daily-preview').innerHTML=this.summary(r,records);
      container.querySelector('#daily-history').innerHTML=this.history(records.filter(x=>x.plant===r.plant));
    };
    const load=()=>{
      clearTimeout(debounce);
      const r=collect(),existing=records.find(x=>x.id===r.id);
      form.querySelectorAll('[data-daily]').forEach(el=>el.value=existing?.readings[el.dataset.daily] ?? '');
      form.querySelector('#daily-time').value=existing?.time || DateEntry.localTime();
      form.querySelector('#daily-notes').value=existing?.notes || '';
      if(existing) form.querySelector('#daily-operator').value=existing.operator || '';
      form.querySelector('#daily-existing').textContent=existing ? 'Saved entry loaded. Saving will update this day.' : 'New daily entry.';
      state.textContent=existing ? (existing.draft ? 'Saved draft loaded' : 'Saved entry loaded') : 'Ready for entry';
      refresh();
    };
    form.querySelector('#daily-date').addEventListener('change',load);form.querySelector('#daily-plant').addEventListener('change',load);
    form.querySelectorAll('[data-daily]').forEach(el=>{el.addEventListener('input',refresh);el.addEventListener('change',refresh);});
    form.querySelectorAll('input:not(#daily-date):not(#daily-plant),textarea').forEach(el=>{
      el.addEventListener('input',()=>{state.textContent='Unsaved changes';clearTimeout(debounce);debounce=setTimeout(autosave,800);});
      el.addEventListener('change',autosave);
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault(); if(!form.reportValidity()) return;
      const r=collect(); r.draft=false; if(!r.plant || !r.operator) { App.toast('Enter plant and operator names','error');return; }
      if(r.date>DateEntry.localDate()) { App.toast('Reading date cannot be in the future','error');return; }
      const btn=form.querySelector('#daily-save');btn.disabled=true;
      try { clearTimeout(debounce); await queue; await Store.saveDailyReading(r);records=await Store.getDailyReadings();load();App.toast('Daily readings saved','success'); }
      catch(error){App.toast('Save failed: '+error.message,'error');} finally {btn.disabled=false;}
    });
    container.querySelector('#daily-csv').addEventListener('click',()=>this.exportCSV(records.filter(r=>r.plant===collect().plant)));
    load();
  },
  summary(record,records) {
    const d=this.calculate(record,records);
    if(!d.previous)return '<p class="form-hint mb-16">First entry sets the baseline. Save the next day to calculate daily energy.</p>';
    const metrics=[['CEB import',d.values.cebImport],['CEB export',d.values.cebExport],['Generator total',d.values.generation],['LT consumption',d.values.lt]];
    return `<div class="daily-summary"><h3>${d.days===1 ? 'Since yesterday' : `Since previous reading (${d.days} days)`}</h3><p class="form-hint">${Calc.formatDateFull(d.previous.date)} ${Forms.esc(d.previous.time)} → ${Calc.formatDateFull(record.date)} ${Forms.esc(record.time)}. ${d.days>1?'Includes missing days; this is a period total.':'Differences between daily readings; time intervals may vary.'}</p><div class="stat-grid">${metrics.map(([label,value])=>`<div class="stat-card"><div class="stat-value">${Calc.formatNumber(value)}</div><div class="stat-label">${label} kWh</div></div>`).join('')}</div><p class="form-hint">No.1: ${Calc.formatNumber(d.values.gen1)} · No.2: ${Calc.formatNumber(d.values.gen2)} · Transformer: ${Calc.formatNumber(d.values.transformer)} · Net CEB import: ${Calc.formatNumber(d.values.netImport)} kWh</p>${d.warnings.map(w=>`<p class="text-danger">${Forms.esc(w)}</p>`).join('')}</div>`;
  },
  history(records) {
    if(!records.length)return '<p class="form-hint">No daily readings saved for this plant.</p>';
    return `<div class="table-scroll"><table class="history-table"><thead><tr><th>Date / time</th><th>Operator</th><th>Days</th>${this.channels.map(c=>`<th>${c.label} Δ kWh</th>`).join('')}<th>Status</th></tr></thead><tbody>${records.map(r=>{const d=this.calculate(r,records);return `<tr><td>${Calc.formatDateFull(r.date)} ${Forms.esc(r.time)}</td><td>${Forms.esc(r.operator)}</td><td>${d.days ?? 'Baseline'}</td>${this.channels.map(c=>`<td>${Calc.formatNumber(d.values[c.key])}</td>`).join('')}<td>${r.draft?'Draft — incomplete':d.warnings.length?'Review counters':r._pendingSync?'Saved locally':'Synced'}</td></tr>`;}).join('')}</tbody></table></div><p class="form-hint">Δ = difference from the previous saved date. Select a date above to see or correct its cumulative readings.</p>`;
  },
  exportCSV(records) {
    const escape=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const headers=['Plant','Date','Time','Operator','Entry status','Period days',...this.channels.map(c=>c.label+' cumulative kWh'),...this.channels.map(c=>c.label+' period kWh'),'Generator total kWh','LT consumption kWh','Review notes','Notes'];
    const rows=records.map(r=>{const d=this.calculate(r,records);return [r.plant,r.date,r.time,r.operator,r.draft?'Draft':'Complete',d.days,...this.channels.map(c=>r.readings[c.key]),...this.channels.map(c=>d.values[c.key]),d.values.generation,d.values.lt,d.warnings.join('; '),r.notes];});
    const safe=v=>typeof v==='string' && /^[=+@-]/.test(v) ? "'"+v : v;
    const url=URL.createObjectURL(new Blob(['\ufeff'+[headers,...rows].map(row=>row.map(v=>escape(safe(v))).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='HydroInspect_daily_readings.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
};
