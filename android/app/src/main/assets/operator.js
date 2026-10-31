/* Native bridge is exposed only to packaged assets, never to remote pages. */
(() => {
  'use strict';
  const M=OperatorModel,$=id=>document.getElementById(id),bridge=window.HydroAndroid;
  let state,draft,rows=[],step=0,page='entry',historyLimit=20,chartInstances=[],signature='';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function notify(message,error=false){$('message').textContent=message;$('message').style.background=error?'#fff0e8':'#e5f5ef';$('message').scrollIntoView({block:'nearest'});}
  function read(){
    const s=JSON.parse(bridge.state());if(s.error)throw new Error(s.error);return s;
  }
  function save(){
    draft.operator=$('operator').value;const error=bridge.saveDraft(JSON.stringify(draft));
    document.body.classList.toggle('operator-chosen',!!draft.operator);
    $('saved').textContent=error?'Save failed — retry':'Saved on this phone';if(error)notify(error,true);return !error;
  }
  function pending(){return (state.local||[]).filter(r=>r.localState!=='synced');}
  function refresh(initial=false){
    try {
      state=read();rows=M.records(state);if(initial){draft=state.draft;draft.readings=draft.readings||{};$('operator').value=draft.operator||'';$('notes').value=draft.notes||'';document.body.classList.toggle('operator-chosen',!!draft.operator);}
      const waiting=pending().length;$('connection').textContent=state.online?'● Online':'● Offline';$('connection').title='Open sync centre';
      $('queue-badge').hidden=!waiting;$('queue-badge').textContent=waiting;
      $('queue-summary').textContent=waiting?`${waiting} submitted reading${waiting===1?'':'s'} saved on this phone, waiting to sync.`:state.online?'Connected · submitted readings sync automatically.':'Offline · you can enter and submit readings as usual.';
      const nextSignature=JSON.stringify([state.local,state.remote,state.meterChanges]);
      if(signature!==nextSignature){signature=nextSignature;if(page==='history')renderHistory();if(page==='charts')renderCharts();if(page==='sync')renderSync();if(page==='entry')updateReference();}
      if(page==='sync')updateSyncCounts();
    }catch(e){notify('Could not load saved readings. '+e.message,true);}
  }
  function previous(){return rows.find(r=>M.stamp(r)<=Date.now())||null;}
  function referenceHTML(c){const r=previous();return r?`<small>Last submitted ${r.localState==='synced'?'':'· pending upload'}</small><strong>${esc(M.format(r.readings[c.key]))} <small>${c.unit}</small></strong><small>${esc(M.time(M.stamp(r)))} · ${esc(r.operator)}</small>`:'<small>No previous reading cached yet. Connect to load the shared reference.</small>';}
  function updateReference(){if($('reference'))$('reference').innerHTML=referenceHTML(M.channels[step]);updateNumber();}
  function renderMeter(){
    const c=M.channels[step];$('step-label').textContent=`METER ${step+1} OF 6`;$('progress-fill').style.width=((step+1)/6*100)+'%';
    $('previous').disabled=step===0;$('next').textContent=step===5?'Review readings →':'Next meter →';
    $('meter-card').innerHTML=`<div class="meter-top"><h2>${c.name}</h2><span class="unit">${c.unit}</span></div><p class="counter-type">Cumulative counter · use the meter’s displayed unit</p><div class="reference" id="reference">${referenceHTML(c)}</div><label class="reading-label" for="reading">CURRENT METER READING (${c.unit})</label><div class="reading-wrap"><button type="button" id="minus" aria-label="Decrease by 0.01">−</button><input id="reading" inputmode="decimal" type="text" autocomplete="off" spellcheck="false" aria-describedby="full-value delta" placeholder="0.00" value="${esc(draft.readings[c.key]||'')}"><button type="button" id="plus" aria-label="Increase by 0.01">+</button></div><div class="full-value" id="full-value"></div><div class="delta" id="delta" role="status"></div>`;
    $('reading').addEventListener('input',()=>{draft.readings[c.key]=$('reading').value;save();updateNumber();});
    $('reading').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();next();}});
    for(const id of ['minus','plus']){
      $(id).addEventListener('pointerdown',e=>e.preventDefault());
      $(id).addEventListener('click',()=>{const n=M.number($('reading').value);if(n===null&&$('reading').value!=='')return;const value=Math.max(0,Math.round(((n||0)+(id==='plus'?.01:-.01))*1e6)/1e6);$('reading').value=String(value);draft.readings[c.key]=String(value);save();updateNumber();});
    }updateNumber();
  }
  function valid(value){return /^[0-9]{1,12}(\.[0-9]{1,6})?$/.test(value||'');}
  function warning(c,value){const p=previous(),a=M.number(value),b=M.number(p?.readings[c.key]);return a!==null&&b!==null&&a<b;}
  function updateNumber(){
    if(!$('reading'))return;const c=M.channels[step],raw=draft.readings[c.key]||'',p=previous(),a=M.number(raw),b=M.number(p?.readings[c.key]);
    $('full-value').textContent=raw===''?'Enter the full cumulative reading':valid(raw)?M.format(raw)+' '+c.unit:'Check the number format';
    $('reading').setAttribute('aria-invalid',String(raw!==''&&!valid(raw)));
    const decrease=warning(c,raw);$('delta').className=decrease?'warning':'delta';
    $('delta').textContent=raw!==''&&!valid(raw)?'Use digits and a decimal point. Up to 6 decimal places.':decrease?'Counter is lower than the previous reading. Check the digits, unit, or meter replacement before submitting.':a!==null&&b!==null?'Change: +'+M.format(Math.round((a-b)*c.factor*1e8)/1e8)+' kWh':c.factor===1000?'Enter MWh exactly as displayed. Charts convert the change to kWh.':'Enter kWh exactly as displayed.';
  }
  function next(){if(!valid(draft.readings[M.channels[step].key])){notify('Enter a valid reading before continuing.',true);$('reading').focus();return;}save();if(step===5)show('review');else{step++;renderMeter();$('reading').focus({preventScroll:true});$('meter-card').scrollIntoView({block:'start'});}}
  function show(name){
    if(page==='entry'||page==='review')save();page=name;
    for(const el of document.querySelectorAll('.page'))el.hidden=el.id!==name;
    for(const el of document.querySelectorAll('nav button'))el.classList.toggle('active',el.dataset.page===(name==='review'?'entry':name));
    $('message').textContent='';if(name==='entry')renderMeter();if(name==='review')renderReview();if(name==='history')renderHistory();if(name==='charts')renderCharts();if(name==='sync')renderSync();window.scrollTo(0,0);
  }
  function renderReview(){
    const missing=M.channels.filter(c=>!valid(draft.readings[c.key]));const decreases=M.channels.filter(c=>warning(c,draft.readings[c.key]));
    $('review-content').innerHTML=`<div class="queue-summary">Operator: <strong>${esc(draft.operator||'Choose an operator first')}</strong><br>Reading time is recorded when you submit, using this phone’s clock.</div><div class="panel">${M.channels.map((c,i)=>`<div class="review-row"><div>${c.name}<button data-edit="${i}">Change reading</button></div><div class="review-number">${esc(valid(draft.readings[c.key])?M.format(draft.readings[c.key]):'Missing / invalid')}<small>${c.unit}</small></div></div>`).join('')}</div>${missing.length?'<p class="warning">Complete all six readings to submit.</p>':''}${decreases.length?'<p class="warning">Lower counters: '+decreases.map(c=>c.name).join(', ')+'. Check the unit and digits. Add a note if a meter was replaced. These intervals cannot be compared automatically.</p>':''}`;
    $('confirm').checked=false;$('submit').disabled=missing.length>0||!draft.operator;
    for(const b of document.querySelectorAll('[data-edit]'))b.addEventListener('click',()=>{step=Number(b.dataset.edit);show('entry');});
  }
  function badge(r){return `<span class="status ${r.localState==='synced'?'':r.localState==='attention'?'attention':'pending'}">${r.localState==='synced'?'Synced':r.localState==='attention'?'Needs review':'Waiting to sync'}</span>`;}
  function meterRows(r){return M.channels.map(c=>`<div class="meter-row"><span>${c.name}</span><strong>${esc(M.format(r.readings[c.key]))}<small>${c.unit}</small></strong></div>`).join('');}
  function countsHTML(){const waiting=pending().length;return `<div class="summary-grid"><div><span>Submitted rounds</span><strong>${rows.length}</strong><small>Shared and local</small></div><div><span>Waiting to upload</span><strong>${waiting}</strong><small>Safely stored on this phone</small></div></div>`;}
  function renderHistory(){
    $('history-summary').innerHTML=countsHTML();const query=$('history-search').value.toLowerCase().trim();
    const filtered=rows.filter(r=>(r.operator+' '+M.time(M.stamp(r))).toLowerCase().includes(query));
    const open=new Set([...document.querySelectorAll('[data-record][open]')].map(el=>el.dataset.record));
    $('history-list').innerHTML=filtered.slice(0,historyLimit).map(r=>{
      const i=rows.findIndex(x=>x.id===r.id),prev=rows[i+1],v=prev?M.energy(r,prev,state.meterChanges):null;
      return `<article class="panel"><div class="record-head"><div><h2>${esc(r.operator)}</h2><small>${esc(M.time(M.stamp(r)))} · Sri Lanka<br>${r.source==='android-operator'?'Phone entry time':'Reading time'}</small></div>${badge(r)}</div>${r.syncError?`<p class="warning">${esc(r.syncError)}</p>`:''}<details data-record="${esc(r.id)}" ${open.has(r.id)?'open':''}><summary>Cumulative readings · view all 6</summary>${meterRows(r)}${r.notes?`<p>${esc(r.notes)}</p>`:''}<p class="legend-note">${r.source==='android-operator'?'Phone: '+esc(r.audit?.created?.deviceLabel||'Android')+' · install '+esc(r.audit?.created?.deviceId?.slice(0,8)||'')+'. ':''}Owner-only editing.</p></details>${v?`<div class="interval">${esc(M.time(M.stamp(prev)))}<br>→ ${esc(M.time(M.stamp(r)))}<strong>CEB import − transformer: ${v.deviation===null?'Unavailable':(v.deviation>0?'+':'')+M.format(v.deviation)+' kWh'}</strong></div>`:'<p class="legend-note">Baseline reading · the next reading creates an energy interval.</p>'}</article>`;
    }).join('')||'<p class="empty">No matching readings yet. Connect to load shared records or submit your first round.</p>';
    $('more-history').hidden=filtered.length<=historyLimit;
  }
  function updateSyncCounts(){$('sync-counts').innerHTML=countsHTML();$('sync-network').textContent=state.online?'Internet available. Android will process the queue.':'Offline. Your submitted readings are safely queued.';}
  function renderSync(){
    $('sync-content').innerHTML=`<div id="sync-counts"></div><p id="sync-network"></p><div>${pending().map(r=>`<div class="panel"><div class="record-head"><div><h2>${esc(r.operator)}</h2><small>${esc(M.time(M.stamp(r)))}</small></div>${badge(r)}</div><p class="legend-note">${esc(r.syncError||'Ready to upload automatically when a working connection is available.')}</p></div>`).join('')}</div>`;updateSyncCounts();
  }
  function renderCharts(){
    chartInstances.forEach(c=>c.destroy());chartInstances=[];
    const synced=rows.filter(r=>r.localState==='synced');const intervals=M.intervals(synced,state.meterChanges),allGroups=M.aggregate(intervals,$('period').value),groups=allGroups.slice(-24);
    if(!groups.length){$('chart-content').innerHTML='<p class="empty">Charts need two synced complete readings. Submit your round and connect to update them.</p>';return;}
    const specs=[{title:'CEB import & generation',keys:['cebImport','gen1','gen2','transformer']},{title:'CEB export & LT consumption',keys:['cebExport','lt']},{title:'CEB import − transformer',keys:['deviation']}];
    $('chart-content').innerHTML=`<p class="legend-note">Synced records only · ${intervals.length} recorded intervals. Showing the latest ${groups.length} of ${allGroups.length} periods. Pending uploads appear after sync. Totals are assigned to each interval’s ending period; gaps and boundary-spanning intervals are not daily estimates.</p>${specs.map((s,i)=>`<section class="panel"><h2>${s.title}</h2><p class="chart-period">From ${esc(M.time(groups[0].start))}<br>To ${esc(M.time(groups.at(-1).end))} · Sri Lanka</p><div class="chart-overflow"><div class="chart-inner"><div class="chart-frame"><canvas id="chart-${i}" aria-label="${s.title} in kWh" role="img"></canvas></div></div></div>${i===2?'<p class="legend-note">Positive: CEB import is higher. Negative: transformer energy is higher. LT is not subtracted.</p>':''}<details><summary>View period values & coverage</summary><div class="coverage">${groups.map(g=>`<div class="interval"><b>${esc(g.key)}</b><br>${esc(M.time(g.start))}<br>→ ${esc(M.time(g.end))}${s.keys.map(k=>`<div class="meter-row"><span>${esc(M.channels.find(c=>c.key===k)?.name||'Deviation')}<small>${g.counts[k]||0} / ${g.count} valid intervals</small></span><strong>${esc(M.format(g.values[k]))}<small>kWh</small></strong></div>`).join('')}</div>`).join('')}</div></details></section>`).join('')}<p class="legend-note">A dash means missing, decreasing, or replaced counter data. Zero is a measured zero. Known meter replacements are excluded here; use the owner workspace for replacement-adjusted comparisons.</p>`;
    specs.forEach((s,i)=>{
      const canvas=$('chart-'+i);canvas.parentElement.parentElement.style.minWidth=Math.max(280,groups.length*85)+'px';
      const config={type:'bar',data:{
        labels:groups.map(g=>[g.key,'From '+M.time(g.start).slice(5,16),'To '+M.time(g.end).slice(5,16)]),
        datasets:s.keys.map(k=>({label:M.channels.find(c=>c.key===k)?.name||'Deviation',data:groups.map(g=>g.values[k]??null),backgroundColor:k==='deviation'?groups.map(g=>g.values[k]<0?'#c94c69':'#087f86'):M.channels.find(c=>c.key===k).color,borderRadius:4}))
      },options:{animation:false,responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:s.keys.length>1,labels:{boxWidth:10,font:{size:11}}},tooltip:{callbacks:{
          label:c=>c.dataset.label+': '+M.format(c.raw)+' kWh',
          afterLabel:c=>`${groups[c.dataIndex].counts[s.keys[c.datasetIndex]]||0}/${groups[c.dataIndex].count} valid intervals`
        }}},scales:{x:{ticks:{font:{size:9},maxRotation:0,autoSkip:false}},y:{beginAtZero:true,title:{display:true,text:'Energy (kWh)'},ticks:{font:{size:10}}}}
      }};
      chartInstances.push(new Chart(canvas,config));
    });
  }
  if(!bridge){$('main').innerHTML='<p class="empty">Open this screen in the HydroInspect Android app.</p>';return;}
  refresh(true);renderMeter();
  $('operator').addEventListener('change',save);$('previous').addEventListener('click',()=>{save();if(step>0)step--;renderMeter();});$('next').addEventListener('click',next);
  $('review-early').addEventListener('click',()=>show('review'));$('return-entry').addEventListener('click',()=>show('entry'));
  $('notes').addEventListener('input',()=>{draft.notes=$('notes').value;save();});
  $('submit').addEventListener('click',()=>{
    if(!$('confirm').checked){notify('Confirm you have checked all six meter readings.',true);return;}
    if(!save())return;$('submit').disabled=true;
    const error=bridge.submit(JSON.stringify(draft));if(error){notify(error,true);$('submit').disabled=false;return;}
    refresh(true);step=0;show('history');notify('Reading saved and locked. '+(state.online?'Upload has been scheduled.':'It will upload automatically when internet returns.'));
  });
  for(const b of document.querySelectorAll('nav button'))b.addEventListener('click',()=>show(b.dataset.page));
  $('history-search').addEventListener('input',()=>{historyLimit=20;renderHistory();});$('more-history').addEventListener('click',()=>{historyLimit+=20;renderHistory();});
  $('period').addEventListener('change',renderCharts);$('owner').addEventListener('click',()=>bridge.owner());$('backup').addEventListener('click',()=>bridge.backup());
  $('connection').addEventListener('click',()=>show('sync'));$('sync-now').addEventListener('click',()=>{bridge.sync();notify(state.online?'Sync scheduled. The queue will update after the server confirms.':'You are offline. Sync is scheduled for when internet returns.');});
  window.operatorBack=()=>{if(page!=='entry'){show('entry');return;}save();bridge.close();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)save();else refresh();});
  setInterval(()=>refresh(),2500);
})();
