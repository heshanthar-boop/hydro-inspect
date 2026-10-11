/** Aggregate measured interval energy by the ending record's calendar period. */
const DailyCharts = {
  charts:[],mode:'day',signature:'',records:[],plant:'',root:null,
  bucket(date,mode) {
    if(mode==='year')return date.slice(0,4);
    if(mode==='month')return date.slice(0,7);
    if(mode==='week'){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
    return date;
  },
  aggregate(records,mode) {
    const complete=Daily.sort(records.filter(r=>!r.draft));const groups=new Map();
    for(const r of complete){const d=Daily.calculate(r,complete);if(!d.previous)continue;
      const key=this.bucket(Daily.stamp(r).slice(0,10),mode);if(!groups.has(key))groups.set(key,{key,values:{},counts:{},intervals:0,gaps:0});
      const g=groups.get(key);g.intervals++;if(d.days>1)g.gaps++;
      const add=(name,value)=>{if(value===null||value===undefined||!Number.isFinite(value))return;g.values[name]=(g.values[name]??0)+value;g.counts[name]=(g.counts[name]??0)+1;};
      Daily.channels.forEach(c=>add(c.key,d.values[c.key]));
      const v=d.values;
      if([v.cebImport,v.transformer,v.lt].every(n=>n!==null&&n!==undefined))add('importDeviation',v.cebImport-(v.transformer-v.lt));
      if([v.cebExport,v.lt].every(n=>n!==null&&n!==undefined))add('exportDeviation',v.cebExport-v.lt);
    }
    return [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
  },
  destroy(){this.charts.forEach(c=>c.destroy());this.charts=[];},
  update(root,records,plant){
    const filtered=records.filter(r=>r.plant===plant);const signature=JSON.stringify(filtered.map(r=>[r.id,r.date,r.time,r.draft,r.readings]));
    if(this.root===root && this.signature===signature)return;
    this.root=root;this.signature=signature;this.records=filtered;this.plant=plant;this.render();
  },
  render(){
    this.destroy();const root=this.root;if(!root?.isConnected)return;
    const groups=this.aggregate(this.records,this.mode);
    const specs=[
      {title:'CEB import and export',keys:['cebImport','cebExport']},
      {title:'No.1 generator meter',keys:['gen1']},
      {title:'No.2 generator meter',keys:['gen2']},
      {title:'Transformer meter',keys:['transformer']},
      {title:'LT meter consumption',keys:['lt']},
      {title:'CEB import deviation',keys:['importDeviation'],note:'CEB import − (transformer energy − LT consumption)'},
      {title:'CEB export deviation',keys:['exportDeviation'],note:'CEB export − LT consumption'}
    ];
    const names=Object.fromEntries(Daily.channels.map(c=>[c.key,c.label]));names.importDeviation='Import deviation';names.exportDeviation='Export deviation';
    root.innerHTML=`<div class="page-intro"><span class="eyebrow">METER ENERGY TRENDS</span><h2>Daily reading charts</h2><p>Measured kWh changes across ${Forms.esc(this.plant)}.</p></div><label class="form-label">Group readings<select class="form-select" id="daily-chart-period">${[['day','Day'],['week','Week (Monday–Sunday)'],['month','Month'],['year','Year']].map(([value,label])=>`<option value="${value}" ${this.mode===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <p class="form-hint">Totals use energy differences, not cumulative meter counters. Each interval belongs to its ending record’s date. Missing days are included in that interval; calendar totals can include energy from earlier periods. Drafts and invalid/decreasing counters are excluded. Deviations use only intervals where all required meters are valid.</p>
      ${groups.length?`<div class="daily-chart-grid">${specs.map((s,i)=>`<section class="chart-container"><h3>${s.title}</h3>${s.note?`<p class="form-hint">${s.note}. Signed difference in kWh; it is not a calibrated loss or meter accuracy test.</p>`:''}<div class="daily-chart-frame"><canvas id="daily-energy-chart-${i}" aria-label="${s.title}" role="img"></canvas></div></section>`).join('')}</div><section class="chart-container"><h3>Chart data and coverage</h3><div class="table-scroll"><table class="history-table"><thead><tr><th>Period${this.mode==='week'?' starts Monday':''}</th><th>Intervals</th>${[...Daily.channels.map(c=>c.key),'importDeviation','exportDeviation'].map(k=>`<th>${names[k]} kWh</th>`).join('')}<th>Coverage</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${g.key}</td><td>${g.intervals}</td>${[...Daily.channels.map(c=>c.key),'importDeviation','exportDeviation'].map(k=>`<td>${Calc.formatNumber(g.values[k])}<small class="form-hint"> (${g.counts[k]??0}/${g.intervals})</small></td>`).join('')}<td>${g.gaps?`${g.gaps} multi-day interval(s)`:'Recorded intervals'}</td></tr>`).join('')}</tbody></table></div><p class="form-hint">Coverage counts show valid intervals / all intervals for each total. A dash means unavailable; zero is a measured zero.</p></section>`:'<div class="empty-state">Save at least two complete readings to see energy charts.</div>'}`;
    root.querySelector('#daily-chart-period').addEventListener('change',e=>{this.mode=e.target.value;this.render();});
    if(!groups.length)return;
    if(typeof Chart==='undefined'){root.querySelectorAll('.daily-chart-frame').forEach(el=>el.innerHTML='<p class="form-hint">Reconnect to load charts. The values remain available in the table below.</p>');return;}
    const colors=['#087f83','#e89b24','#3b82f6','#8b5cf6','#64748b','#dc5d68'];
    specs.forEach((s,i)=>{const canvas=root.querySelector('#daily-energy-chart-'+i);this.charts.push(new Chart(canvas,{type:'bar',data:{labels:groups.map(g=>g.key),datasets:s.keys.map((key,index)=>({label:names[key],data:groups.map(g=>g.values[key]??null),backgroundColor:colors[(i+index)%colors.length],borderRadius:4}))},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:s.keys.length>1},tooltip:{callbacks:{afterLabel:context=>{const g=groups[context.dataIndex];return `${g.counts[s.keys[context.datasetIndex]]||0} valid interval(s)`;}}}},scales:{x:{ticks:{maxTicksLimit:8,maxRotation:45}},y:{beginAtZero:true,title:{display:true,text:'Interval energy (kWh)'}}}}}));});
  }
};
