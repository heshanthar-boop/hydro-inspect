/** Daily operator cumulative meter readings, stored separately from inspections. */
const Daily = {
  operatorNames: ['Athula','Hirusha','Lasantha','Nalinda','Priyantha','Supun','Upul'],
  ownerName() {const u=FirebaseSync.getUser();return u?.displayName || u?.email || 'Owner';},
  channels: [
    {key:'cebImport',label:'CEB import',unit:'kWh',factor:1}, {key:'cebExport',label:'CEB export',unit:'kWh',factor:1},
    {key:'gen1',label:'No.1 generator panel',meter:'gen1Panel',unit:'MWh',factor:1000},
    {key:'gen2',label:'No.2 generator panel',meter:'gen2Panel',unit:'MWh',factor:1000},
    {key:'transformer',label:'Transformer panel',meter:'transformerPanel',unit:'MWh',factor:1000},
    {key:'lt',label:'LT meter (CEB LV panel)',meter:'cebLVPanel',unit:'kWh',factor:1}
  ],
  // Android captures the actual offline entry time; readingAt remains the server receipt time.
  // Owner edits collect fresh date/time fields without carrying the capturedAt override.
  stamp(record) { const seconds=record.capturedAt?.seconds || record.readingAt?.seconds;if(seconds){return new Date(seconds*1000+19800000).toISOString().slice(0,19);} return record.date+'T'+(record.time || '00:00'); },
  sort(records) { return [...records].sort((a,b)=>this.stamp(b).localeCompare(this.stamp(a))); },
  previous(record, records) { return this.sort(records).find(r=>(!record.id || r.id!==record.id) && r.plant===record.plant && !r.draft && this.stamp(r)<this.stamp(record)) || null; },
  calculate(record, records) {
    const previous=this.previous(record, [...records].sort((a,b)=>b.date.localeCompare(a.date)));
    const values={},warnings=[];
    if(!previous) return {previous:null,days:null,values,warnings};
    const days=(new Date(this.stamp(record)+'+05:30')-new Date(this.stamp(previous)+'+05:30'))/86400000;
    for(const ch of this.channels) {
      const c=Calc._num(record.readings[ch.key]),p=Calc._num(previous.readings[ch.key]);
      let value=c===null || p===null ? null : c-p;
      if(ch.meter && Calc.crossedChanges(ch.meter,previous.date,record.date).length) {
        const changes=Calc.crossedChanges(ch.meter,previous.date,record.date);
        if(changes.some(change=>Calc._num(change.oldFinal)===null)) { value=null; warnings.push(`${ch.label}: meter replacement needs an explicit closing reading in Settings.`); }
        else value=Calc.meterDiff(ch.meter,c,p,record.date,previous.date).value;
      }
      if(value!==null && value<0) { warnings.push(`${ch.label}: counter decreased; verify the entry or meter replacement.`); value=null; }
      values[ch.key]=value===null?null:Math.round(value*ch.factor*1e8)/1e8;
    }
    values.generation=values.gen1!==null && values.gen2!==null ? values.gen1+values.gen2 : null;
    return {previous,days,values,warnings};
  },
  dispose() {this._stopWatch?.();this._stopWatch=null;this._syncController?.abort();},
  async render(container) {
    this.dispose();
    const settings=await Store.getSettings();
    await Calc.loadMeterConfig();
    let records=await Store.getDailyReadings();
    if(!container.isConnected)return;
    const plants=[...new Set([settings.plantName,...records.map(r=>r.plant)])];
    container.innerHTML=`<div class="page-intro"><span class="eyebrow">OPERATOR DAILY LOG</span><h1>Daily meter readings</h1><p>Enter each reading in the unit displayed on its meter: panels in MWh; CEB and LT in kWh. Comparisons and charts convert energy changes to kWh automatically.</p></div>
      <nav class="daily-section-nav" aria-label="Daily page sections"><button type="button" data-daily-jump="daily-form">Enter readings</button><button type="button" data-daily-jump="daily-history-section">Record history</button><button type="button" data-daily-jump="daily-charts">Meter charts</button></nav><p id="daily-live-status" class="form-hint" role="status">Showing saved readings on this device</p><div id="daily-overview"></div>
      <form id="daily-form" class="chart-container"><div class="form-row"><div class="form-group"><label class="form-label">Plant</label><input class="form-input" id="daily-plant" list="daily-plants" required value="${Forms.esc(settings.plantName)}"><datalist id="daily-plants">${plants.map(p=>`<option value="${Forms.esc(p)}">`).join('')}</datalist></div><div class="form-group"><label class="form-label">Operator</label><select class="form-select" id="daily-operator" required ${Access.isOwner()?'disabled':''}><option value="">Choose operator…</option>${[...new Set([...this.operatorNames,...(Access.isOwner()?[this.ownerName()]:[])])].sort((a,b)=>a.localeCompare(b)).map(name=>`<option value="${Forms.esc(name)}" ${Access.isOwner()&&name===this.ownerName()?'selected':''}>${Forms.esc(name)}</option>`).join('')}</select>${Access.isOwner()?'<small class="form-hint" id="operator-help">New entries use your signed-in account automatically</small>':''}</div></div>
      <div class="form-row" ${Access.isOwner()?'':'hidden'}><div class="form-group"><label class="form-label">Reading date</label><input class="form-input" type="date" id="daily-date" required value="${DateEntry.localDate()}"></div><div class="form-group"><label class="form-label">Reading time</label><input class="form-input" type="time" id="daily-time" step="1" required value="${DateEntry.localTime()}"></div></div>
      <p class="form-hint">${Access.isOwner()?'You can choose a past reading date/time when needed.':'Reading date and time are recorded automatically when you enter data.'}</p><div class="daily-save-bar"><span id="daily-auto-state" role="status">Ready for entry</span><span id="daily-progress">0 / 6 readings</span></div><p id="daily-existing" class="form-hint" role="status"></p><div class="form-row daily-meter-grid">${this.channels.map(ch=>`<div class="form-group"><label class="form-label">${ch.label} — cumulative</label><div class="daily-reference" data-daily-reference="${ch.key}"></div><div class="input-with-unit"><input type="number" class="form-input" data-daily="${ch.key}" min="0" step="0.01" required placeholder="0.00"><span class="input-unit">${ch.unit}</span></div></div>`).join('')}</div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="daily-notes" placeholder="Meter change, outage, unusual reading…"></textarea></div>
      <div id="daily-preview"></div><button type="submit" class="btn btn-primary btn-block" id="daily-save">Finish daily entry</button><p class="form-hint">Changes save automatically on this device. Incomplete entries stay as drafts. Multiple readings per day are supported. Use New reading for the next meter visit. Times are plant local time (Sri Lanka). Visitor entries are traced to this browser.</p></form>
      <div class="chart-container" id="daily-history-section"><div class="flex-between record-history-heading"><h3>Daily records</h3><button type="button" class="btn btn-primary btn-sm" id="daily-new">New reading</button><button type="button" class="btn btn-outline btn-sm" id="daily-csv">Download CSV</button></div><div id="daily-history"></div></div><div id="daily-charts"></div>`;
    container.querySelectorAll('[data-daily-jump]').forEach(btn=>btn.addEventListener('click',()=>container.querySelector('#'+btn.dataset.dailyJump)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})));
    const form=container.querySelector('#daily-form');
    let activeId='daily_'+crypto.randomUUID();
    const collect=()=>{
      const existing=records.find(r=>r.id===activeId);
      if(!Access.isOwner() && (!existing || existing.draft)){const now=new Date();const local=new Date(now.getTime()+19800000).toISOString();form.querySelector('#daily-date').value=local.slice(0,10);form.querySelector('#daily-time').value=local.slice(11,19);}
      return ({id:activeId,plant:form.querySelector('#daily-plant').value.trim(),date:form.querySelector('#daily-date').value,time:form.querySelector('#daily-time').value,operator:form.querySelector('#daily-operator').value.trim(),readingAt:existing && !existing.draft && existing.date===form.querySelector('#daily-date').value && existing.time===form.querySelector('#daily-time').value ? existing.readingAt : undefined,units:Object.fromEntries(this.channels.map(ch=>[ch.key,ch.unit])),notes:form.querySelector('#daily-notes').value,readings:Object.fromEntries([...form.querySelectorAll('[data-daily]')].map(el=>[el.dataset.daily,el.value]))});
    };
    let queue=Promise.resolve();
    let debounce;
    const state=form.querySelector('#daily-auto-state');
    const autosave=()=>{
      clearTimeout(debounce);
      const r=collect();
      const existing=records.find(x=>x.id===r.id);
      if(existing && !Access.canContinueDaily(existing)){state.textContent='Submitted reading is locked. Choose New reading.';return queue;}
      const fingerprint=JSON.stringify(r);
      if(!r.plant || !r.date || r.date>DateEntry.localDate()) { state.textContent='Choose a valid plant and reading date'; return queue; }
      const invalid=[...form.querySelectorAll('input[type=number]')].find(el=>el.validity.badInput || el.validity.rangeUnderflow || el.validity.rangeOverflow || el.validity.stepMismatch);
      if(invalid){ invalid.setAttribute('aria-invalid','true'); state.textContent='Check the highlighted reading — changes not saved'; return queue; }
      form.querySelectorAll('[aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
      if(!records.some(x=>x.id===r.id) && !r.notes && Object.values(r.readings).every(v=>v==='')) { state.textContent='Ready for entry'; return queue; }
      if(records.some(x=>x.id!==r.id && x.plant===r.plant && this.stamp(x)===this.stamp(r))) {state.textContent='A reading already exists at this time. Open it or choose another time.';return queue;}
      r.draft=Access.isOwner() ? (!r.operator || !r.time || Object.values(r.readings).some(value=>value==='')) : true;
      records=this.sort([r,...records.filter(x=>x.id!==r.id)]);
      state.textContent='Saving…';
      queue=queue.catch(()=>{}).then(()=>Store.saveDailyReading(r)).then(()=>{
        if(form.isConnected) { if(JSON.stringify(collect())===fingerprint) state.textContent=r.draft ? 'Draft saved — tap Finish when ready' : 'Saved on this device'; refresh(); }
      }).catch(error=>{state.textContent='Save failed — tap Finish to retry';App.toast('Daily save failed: '+error.message,'error');});
      return queue;
    };
    this.flush=autosave;
    const refresh=()=>{
      const r=collect();const reference=this.previous(r,records);const changes=this.calculate(r,records);
      form.querySelectorAll('[data-daily-reference]').forEach(el=>{
        const key=el.dataset.dailyReference,value=reference?.readings[key],change=changes.values[key];
        const input=form.querySelector(`[data-daily="${key}"]`);input.dataset.previousUnit=this.channels.find(c=>c.key===key).unit;input.dataset.previousValue=value??'';input.dataset.previousInfo=reference?this.stamp(reference).replace('T',' ')+' · '+reference.operator:'';
        const warning=changes.warnings.find(w=>w.startsWith(this.channels.find(c=>c.key===key).label+':'));
        el.classList.toggle('reading-review',!!warning);
        el.innerHTML=reference ? `<div><span>Previous submitted</span><strong>${Calc.formatNumber(value)} ${this.channels.find(c=>c.key===key).unit}</strong></div><small>${Forms.esc(this.stamp(reference).replace('T',' '))} · ${Forms.esc(reference.operator)}</small>${r.readings[key]!==''?`<p>${warning?Forms.esc(warning):change!==null&&change!==undefined?`Change: ${change>=0?'+':''}${Calc.formatNumber(change)} kWh`:'Comparison unavailable'}</p>`:''}` : '<span>No previous submitted reading for this meter yet.</span>';
      });
      form.querySelector('#daily-progress').textContent=`${Object.values(r.readings).filter(v=>v!=='').length} / 6 readings`;container.querySelector('#daily-preview').innerHTML=this.summary(r,records);
      const plantRecords=this.sort(records.filter(x=>x.plant===r.plant));const completed=plantRecords.filter(x=>!x.draft),latest=completed[0];
      container.querySelector('#daily-overview').innerHTML=`<div class="daily-overview-grid"><div><span>Last submitted reading</span><strong>${latest?Forms.esc(this.stamp(latest).replace('T',' ')):'Awaiting first reading'}</strong><small>${latest?Forms.esc(latest.operator):'Submit a complete entry to set a baseline'}</small></div><div><span>Submitted records</span><strong>${completed.length}</strong><small>Used in energy comparisons</small></div><div><span>Unfinished drafts</span><strong>${plantRecords.length-completed.length}</strong><small>Excluded from charts until finished</small></div></div>`;
      const openTables=[...container.querySelectorAll('.record-details[open]')].map(el=>el.dataset.table);
      container.querySelector('#daily-history').innerHTML=this.history(records.filter(x=>x.plant===r.plant));
      container.querySelectorAll('.record-details').forEach(el=>el.open=openTables.includes(el.dataset.table));
      DailyCharts.update(container.querySelector('#daily-charts'),records,r.plant);
    };
    const load=()=>{
      clearTimeout(debounce);
      const r=collect(),existing=records.find(x=>x.id===activeId);
      form.querySelectorAll('[data-daily]').forEach(el=>el.value=existing?.readings[el.dataset.daily] ?? '');
      form.querySelectorAll('[data-daily]').forEach(el=>el.refreshNumberPreview?.());
      form.querySelector('#daily-time').value=existing?.time || DateEntry.localTime();
      form.querySelector('#daily-notes').value=existing?.notes || '';
      const operator=form.querySelector('#daily-operator');
      if(Access.isOwner()){operator.disabled=!existing;form.querySelector('#operator-help').textContent=existing?'Choose the operator for this saved record. Your correction is traced to your account.':'New entries use your signed-in account automatically';}
      if(existing) {
        if(operator.tagName==='SELECT' && existing.operator && ![...operator.options].some(o=>o.value===existing.operator)){const legacy=document.createElement('option');legacy.value=existing.operator;legacy.textContent=existing.operator+' (saved entry)';operator.append(legacy);}
        operator.value=existing.operator || (Access.isOwner()?this.ownerName():'');
      } else if(Access.isOwner()) operator.value=this.ownerName();
      form.querySelector('#daily-existing').textContent=existing ? 'Saved entry loaded. Saving will update this record.' : 'New daily entry.';
      state.textContent=existing ? (existing.draft ? 'Saved draft loaded' : 'Saved entry loaded') : 'Ready for entry';
      refresh();
    };
    form.querySelector('#daily-date').addEventListener('change',autosave);form.querySelector('#daily-plant').addEventListener('change',refresh);
    container.querySelector('#daily-new').addEventListener('click',async()=>{const pending=autosave();form.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=true);await pending;activeId='daily_'+crypto.randomUUID();form.querySelector('#daily-date').value=DateEntry.localDate();load();form.querySelectorAll('input,textarea,select').forEach(el=>el.disabled=false);if(Access.isOwner())form.querySelector('#daily-operator').disabled=true;form.querySelector('[data-daily]').focus();});
    container.querySelector('#daily-history').addEventListener('click',async e=>{const remove=e.target.closest('[data-delete-daily]');if(remove){if(!Access.isOwner() || !confirm('Delete this meter reading? Period comparisons will be recalculated.'))return;clearTimeout(debounce);await queue;try{await Store.deleteDailyReading(remove.dataset.deleteDaily);if(activeId===remove.dataset.deleteDaily)activeId='daily_'+crypto.randomUUID();records=await Store.getDailyReadings();load();App.toast('Reading deleted','success');}catch(error){App.toast(error.message,'error');}return;}const btn=e.target.closest('[data-load-daily]');if(!btn)return;await autosave();const r=records.find(x=>x.id===btn.dataset.loadDaily);if(!r || !Access.canEditDaily(r))return;activeId=r.id;form.querySelector('#daily-date').value=r.date;form.querySelector('#daily-plant').value=r.plant;load();});
    form.querySelectorAll('[data-daily]').forEach(el=>{el.addEventListener('input',refresh);el.addEventListener('change',refresh);});
    form.querySelectorAll('input:not(#daily-date):not(#daily-plant),textarea,select').forEach(el=>{
      el.addEventListener('input',()=>{state.textContent='Unsaved changes';clearTimeout(debounce);debounce=setTimeout(autosave,800);});
      el.addEventListener('change',autosave);
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault(); if(!form.reportValidity()) return;
      const r=collect();
      if(records.some(x=>x.id===r.id&&!Access.canContinueDaily(x))) {App.toast('Submitted reading is locked. Choose New reading.','warning');return;}
      r.draft=false;
      if(records.some(x=>x.id!==r.id && x.plant===r.plant && this.stamp(x)===this.stamp(r))) {App.toast('A record already exists at that time','error');return;} if(!r.plant || !r.operator) { App.toast('Enter plant and operator names','error');return; }
      if(r.date>DateEntry.localDate()) { App.toast('Reading date cannot be in the future','error');return; }
      const btn=form.querySelector('#daily-save');btn.disabled=true;
      try { clearTimeout(debounce); await queue; await Store.saveDailyReading(r);records=await Store.getDailyReadings();load();if(!Access.isOwner()){form.querySelectorAll('[data-daily],#daily-operator,#daily-notes').forEach(el=>el.disabled=true);state.textContent='Submitted. Owner can correct this record; use New reading for another entry.';}App.toast('Daily readings submitted','success'); }
      catch(error){App.toast('Save failed: '+error.message,'error');} finally {btn.disabled=false;}
    });
    container.querySelector('#daily-csv').addEventListener('click',()=>this.exportCSV(records.filter(r=>r.plant===collect().plant)));
    const draft=records.find(r=>r.draft && Access.canContinueDaily(r) && (r.audit?.created?.uid===FirebaseSync.getUser()?.uid || (!r.audit?.created?.uid && r.audit?.created?.deviceId===Access.actor().deviceId)));
    if(draft){activeId=draft.id;form.querySelector('#daily-date').value=draft.date;form.querySelector('#daily-plant').value=draft.plant;}
    load();
    const reload=async()=>{
      if(!container.isConnected)return;
      await queue;
      const saved=await Store.getDailyReadings();
      if(!container.isConnected)return;
      records=saved;refresh();
      container.querySelector('#daily-live-status').textContent='Shared readings updated · '+DateEntry.localTime();
    };
    this._syncController=new AbortController();
    window.addEventListener('hydro-daily-synced',reload,{signal:this._syncController.signal});
    this._stopWatch=FirebaseSync.watchDailyReadings(reload,error=>{if(container.isConnected)container.querySelector('#daily-live-status').textContent='Live update unavailable — saved readings remain visible. Use Sync Now to retry.';});
  },
  summary(record,records) {
    const d=this.calculate(record,records);
    if(!d.previous)return '<p class="form-hint mb-16">First entry sets the baseline. Save the next day to calculate daily energy.</p>';
    const metrics=[['CEB import',d.values.cebImport],['CEB export',d.values.cebExport],['Generator total',d.values.generation],['LT consumption',d.values.lt]];
    return `<div class="daily-summary"><h3>${d.days===1 ? '24-hour comparison' : `Since previous record (${Calc.formatNumber(d.days*24)} hours)`}</h3><p class="form-hint">${Forms.esc(this.stamp(d.previous).replace('T',' '))} → ${Forms.esc(this.stamp(record).replace('T',' '))}. ${d.days>1?'Includes missing days; this is a period total.':'Differences between daily readings; time intervals may vary.'}</p><div class="stat-grid">${metrics.map(([label,value])=>`<div class="stat-card"><div class="stat-value">${Calc.formatNumber(value)}</div><div class="stat-label">${label} kWh</div></div>`).join('')}</div><p class="form-hint">No.1: ${Calc.formatNumber(d.values.gen1)} kWh · No.2: ${Calc.formatNumber(d.values.gen2)} kWh · Transformer: ${Calc.formatNumber(d.values.transformer)} kWh</p>${d.warnings.map(w=>`<p class="text-danger">${Forms.esc(w)}</p>`).join('')}</div>`;
  },
  history(records) {
    if(!records.length)return '<p class="form-hint">No readings saved for this plant.</p>';
    records=this.sort(records);
    const cumulative=`<h4>Cumulative readings</h4><div class="table-scroll"><table class="history-table"><thead><tr><th>Reading time</th>${this.channels.map(c=>`<th>${c.label} ${c.unit}</th>`).join('')}<th></th></tr></thead><tbody>${records.map(r=>`<tr><td>${Forms.esc(this.stamp(r).replace('T',' '))}</td>${this.channels.map(c=>`<td>${Calc.formatNumber(r.readings[c.key])}</td>`).join('')}<td>${Access.canEditDaily(r)?`<button type="button" class="btn btn-outline btn-sm" data-load-daily="${Forms.esc(r.id)}">Edit</button><button type="button" class="btn btn-danger btn-sm" data-delete-daily="${Forms.esc(r.id)}">Delete</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
    const differences=`<h4>Energy between consecutive records</h4><div class="table-scroll"><table class="history-table"><thead><tr><th>From</th><th>To</th><th>Hours</th>${this.channels.map(c=>`<th>${c.label} Δ kWh</th>`).join('')}<th>Generator total kWh</th><th>Status</th></tr></thead><tbody>${records.map(r=>{const d=this.calculate(r,records);return `<tr><td>${d.previous?Forms.esc(this.stamp(d.previous).replace('T',' ')):'Baseline'}</td><td>${Forms.esc(this.stamp(r).replace('T',' '))}</td><td>${Calc.formatNumber(d.days===null?null:d.days*24)}</td>${this.channels.map(c=>`<td>${Calc.formatNumber(d.values[c.key])}</td>`).join('')}<td>${Calc.formatNumber(d.values.generation)}</td><td>${r.draft?'Draft':d.warnings.length?'Review':r._pendingSync?'Local':'Synced'}</td></tr>`;}).join('')}</tbody></table></div>`;
    const rates=`<h4>Normalized daily energy (kWh / 24 hours)</h4><p class="form-hint">Rates are interval averages, not measured calendar-day totals.</p><div class="table-scroll"><table class="history-table"><thead><tr><th>Record</th>${this.channels.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${records.map(r=>{const d=this.calculate(r,records);return `<tr><td>${Forms.esc(this.stamp(r))}</td>${this.channels.map(c=>`<td>${Calc.formatNumber(d.days>0 && d.values[c.key]!==null && d.values[c.key]!==undefined ? d.values[c.key]/d.days:null)}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
    const audit=`<h4>Entry trace</h4><div class="table-scroll"><table class="history-table"><thead><tr><th>Reading time</th><th>Operator</th><th>Account / visitor</th><th>Browser device</th><th>Created (UTC)</th><th>Last edited (UTC)</th></tr></thead><tbody>${records.map(r=>`<tr><td>${Forms.esc(this.stamp(r))}</td><td>${Forms.esc(r.operator)}</td><td>${Forms.esc(r.audit?.created?.email || r.audit?.created?.uid || 'Legacy — untracked')}</td><td>${Forms.esc(r.audit?.created?.deviceLabel || '')} ${Forms.esc(r.audit?.created?.deviceId || '')}</td><td>${Forms.esc(r.audit?.created?.clientTime || '')}</td><td>${Forms.esc(r.audit?.lastEdited?.clientTime || '')}</td></tr>`).join('')}</tbody></table></div>`;
    const cards=records.slice(0,12).map(r=>{
      const d=this.calculate(r,records),stamp=this.stamp(r);
      const status=r.draft?'Draft':d.warnings.length?'Check reading':r._pendingSync?'Saved locally':r._shared?'Cloud saved':'Saved';
      return `<article class="daily-record-card"><header><div><span class="record-card-date">${Calc.formatDateFull(stamp.slice(0,10))}</span><h3>${Forms.esc(stamp.slice(11))}<small>Sri Lanka time</small></h3><p>${Forms.esc(r.operator || 'Operator not selected')}</p></div><span class="record-status ${r.draft?'is-draft':d.warnings.length?'is-review':'is-complete'}">${status}</span></header><div class="reading-value-grid">${this.channels.map(ch=>`<div><span>${ch.label}</span><strong>${Calc.formatNumber(r.readings[ch.key])} <small>${ch.unit}</small></strong></div>`).join('')}</div>${r.draft?'<p class="draft-notice">Unfinished entry — excluded from charts until submitted.</p>':d.previous?`<div class="record-period-strip"><span>${Forms.esc(this.stamp(d.previous).replace('T',' '))} → ${Forms.esc(stamp.replace('T',' '))}</span><p>Import <strong>${Calc.formatNumber(d.values.cebImport)} kWh</strong> · Export <strong>${Calc.formatNumber(d.values.cebExport)} kWh</strong> · Generator total <strong>${Calc.formatNumber(d.values.generation)} kWh</strong></p></div>`:'<p class="form-hint">Baseline reading — the next submitted record enables energy comparison.</p>'}${r.notes?`<p class="record-note">${Forms.esc(r.notes)}</p>`:''}${d.warnings.map(w=>`<p class="text-danger">${Forms.esc(w)}</p>`).join('')}${Access.isOwner()?`<footer><button type="button" class="btn btn-primary" data-load-daily="${Forms.esc(r.id)}">Edit record</button><button type="button" class="btn btn-danger" data-delete-daily="${Forms.esc(r.id)}">Delete</button></footer>`:''}</article>`;
    }).join('');
    const detail=(title,content,action='View table',count=null)=>`<details class="record-details ${title==='Entered readings'?'entered-records':''}" data-table="${title}"><summary><span class="record-section-title">${title}${count!==null?` <span class="record-count">${count}</span>`:''}</span><span class="record-section-action">${action}</span></summary><div>${content}</div></details>`;
    const entered=`<div class="daily-record-grid">${cards}</div>${records.length>12?`<p class="form-hint">Showing the latest 12 of ${records.length} records. All records are available in the tables below.</p>`:''}`;
    return `<div class="record-table-library">${detail('Entered readings',entered,'View records',records.length)}${detail('Cumulative meter readings',cumulative)}${detail('Record-to-record energy',differences)}${detail('Daily energy averages',rates)}${detail('Entry audit trail',audit)}</div>`;

  },
  exportCSV(records) {
    const escape=v=>`"${String(v??'').replace(/"/g,'""')}"`;
    const headers=['Plant','Date','Time','Operator','Entry status','Period days',...this.channels.map(c=>c.label+' cumulative '+c.unit),...this.channels.map(c=>c.label+' period kWh'),'Generator total kWh','LT consumption kWh','Review notes','Notes','Entry UID','Device ID','Device label','Created UTC','Edited UTC'];
    const rows=records.map(r=>{const d=this.calculate(r,records);return [r.plant,this.stamp(r).slice(0,10),this.stamp(r).slice(11),r.operator,r.draft?'Draft':'Complete',d.days,...this.channels.map(c=>r.readings[c.key]),...this.channels.map(c=>d.values[c.key]),d.values.generation,d.values.lt,d.warnings.join('; '),r.notes,r.audit?.created?.uid,r.audit?.created?.deviceId,r.audit?.created?.deviceLabel,r.audit?.created?.clientTime,r.audit?.lastEdited?.clientTime];});
    const safe=v=>typeof v==='string' && /^[=+@-]/.test(v) ? "'"+v : v;
    const url=URL.createObjectURL(new Blob(['\ufeff'+[headers,...rows].map(row=>row.map(v=>escape(safe(v))).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='HydroInspect_daily_readings.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
};
