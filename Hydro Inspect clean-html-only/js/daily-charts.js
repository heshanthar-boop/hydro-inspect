/** Aggregate measured interval energy by the ending record's calendar period. */
const DailyCharts = {
  charts:[],mode:'day',signature:'',records:[],plant:'',root:null,
  bucket(date,mode) {
    if(mode==='year')return date.slice(0,4);
    if(mode==='month')return date.slice(0,7);
    if(mode==='week'){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
    return date;
  },
  timeLabel(stamp) {return stamp.replace('T',' ');},
  axisTime(stamp) {return stamp.slice(8,10)+'/'+stamp.slice(5,7)+' '+stamp.slice(11,16);},
  aggregate(records,mode) {
    const complete=Daily.sort(records.filter(r=>!r.draft));const groups=new Map();
    for(const r of complete){const d=Daily.calculate(r,complete);if(!d.previous)continue;
      const key=this.bucket(Daily.stamp(r).slice(0,10),mode);if(!groups.has(key))groups.set(key,{key,values:{},counts:{},intervals:0,gaps:0,start:Daily.stamp(d.previous),end:Daily.stamp(r),ranges:{}});
      const g=groups.get(key);const start=Daily.stamp(d.previous),end=Daily.stamp(r);if(start<g.start)g.start=start;if(end>g.end)g.end=end;g.intervals++;if(d.days>1)g.gaps++;
      const add=(name,value)=>{if(value===null||value===undefined||!Number.isFinite(value))return;g.values[name]=(g.values[name]??0)+value;g.counts[name]=(g.counts[name]??0)+1;const range=g.ranges[name];g.ranges[name]={start:range&&range.start<start?range.start:start,end:range&&range.end>end?range.end:end};};
      Daily.channels.forEach(c=>add(c.key,d.values[c.key]));
      const v=d.values;
      if([v.cebImport,v.transformer].every(n=>n!==null&&n!==undefined))add('cebTransformerDeviation',Math.round((v.cebImport-v.transformer)*1e8)/1e8);
    }
    return [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
  },
  intervals(records) {
    const complete=Daily.sort(records.filter(r=>!r.draft&&!r._deleted));
    return [...complete].reverse().map(r=>{
      const d=Daily.calculate(r,complete);if(!d.previous)return null;
      const start=Daily.stamp(d.previous),end=Daily.stamp(r),v=d.values;
      const value=v.cebImport===null||v.transformer===null?null:Math.round((v.cebImport-v.transformer)*1e8)/1e8;
      return {key:end,start,end,intervals:1,gaps:d.days>1?1:0,values:{cebImport:v.cebImport,transformer:v.transformer,cebTransformerDeviation:value},counts:{cebTransformerDeviation:value===null?0:1},ranges:{cebTransformerDeviation:{start,end}}};
    }).filter(Boolean);
  },
  destroy(){this.charts.forEach(c=>c.destroy());this.charts=[];},
  update(root,records,plant){
    const filtered=records.filter(r=>r.plant===plant);const signature=JSON.stringify(filtered.map(r=>[r.id,r.date,r.time,r.readingAt,r.draft,r.readings]));
    if(this.root===root && this.signature===signature)return;
    this.root=root;this.signature=signature;this.records=filtered;this.plant=plant;this.render();
  },
  render(){
    this.destroy();const root=this.root;if(!root?.isConnected)return;
    const groups=this.aggregate(this.records,this.mode);
    const chartStart=groups.length?groups.reduce((v,g)=>g.start<v?g.start:v,groups[0].start):'';
    const chartEnd=groups.length?groups.reduce((v,g)=>g.end>v?g.end:v,groups[0].end):'';
    const periodIntervals=this.intervals(this.records);
    const specs=[
      {title:'CEB import vs generator and transformer meters',keys:['cebImport','gen1','gen2','transformer'],comparison:true},
      {title:'CEB export vs LT meter consumption',keys:['cebExport','lt'],comparison:true},
      {title:'CEB import − transformer deviation',keys:['cebTransformerDeviation'],deviation:true,note:'CEB import interval kWh minus transformer interval kWh. Positive: CEB import is higher. Negative: transformer is higher. LT is not deducted. Day view shows each reading period; week/month/year views sum the signed period differences.'},
    ];
    const names=Object.fromEntries(Daily.channels.map(c=>[c.key,c.label]));names.cebTransformerDeviation='CEB import − transformer';
    root.innerHTML=`<div class="page-intro"><span class="eyebrow">METER ENERGY TRENDS</span><h2>Daily reading charts</h2><p>Measured kWh changes across ${Forms.esc(this.plant)}.</p></div><label class="form-label">Group readings<select class="form-select" id="daily-chart-period">${[['day','Day'],['week','Week (Monday–Sunday)'],['month','Month'],['year','Year']].map(([value,label])=>`<option value="${value}" ${this.mode===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <p class="form-hint">Panel readings are MWh; CEB and LT readings are kWh. Panel differences are converted once using 1 MWh = 1,000 kWh. All chart totals are kWh. Totals use energy differences, not cumulative meter counters. Each interval belongs to its ending record’s date. Missing days are included in that interval; calendar totals can include energy from earlier periods. Drafts and invalid/decreasing counters are excluded.</p>
      ${groups.length?`<div class="daily-chart-grid">${specs.map((s,i)=>`<section class="chart-container ${s.comparison?'meter-comparison-chart':''}"><h3>${s.title}</h3>${s.comparison?`<p class="form-hint">${s.keys.length} side-by-side bars per period on the same kWh scale. Tap a period to compare values; swipe horizontally if needed.</p>`:''}<p class="chart-time-span"><strong>Start</strong> ${this.timeLabel(chartStart)}<br><strong>End</strong> ${this.timeLabel(chartEnd)} <span>(Sri Lanka)</span></p>${s.note?`<p class="form-hint">${s.note} Signed difference in kWh; it is not a calibrated loss or meter accuracy test.</p>`:''}<div class="chart-scroll"><div class="daily-chart-frame" ${s.comparison||s.deviation?`style="min-width:${Math.max(400,(s.deviation&&this.mode==='day'?periodIntervals.length:groups.length)*110)}px"`: ""}><canvas id="daily-energy-chart-${i}" aria-label="${s.title}" role="img"></canvas></div></div></section>`).join('')}</div><section class="chart-container"><h3>Chart data and coverage</h3><div class="table-scroll"><table class="history-table"><thead><tr><th>Period${this.mode==='week'?' starts Monday':''}</th><th>Start reading time</th><th>End reading time</th><th>Intervals</th>${[...Daily.channels.map(c=>c.key),'cebTransformerDeviation'].map(k=>`<th>${names[k]} kWh</th>`).join('')}<th>Coverage</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${g.key}</td><td>${this.timeLabel(g.start)}</td><td>${this.timeLabel(g.end)}</td><td>${g.intervals}</td>${[...Daily.channels.map(c=>c.key),'cebTransformerDeviation'].map(k=>`<td>${Calc.formatNumber(g.values[k])}<small class="form-hint"> (${g.counts[k]??0}/${g.intervals})</small></td>`).join('')}<td>${g.gaps?`${g.gaps} multi-day interval(s)`:'Recorded intervals'}</td></tr>`).join('')}</tbody></table></div><p class="form-hint">Start/end show the grouped reading span, not calendar boundaries. Each meter tooltip shows its valid contributing span. Gaps may exist within the span. Coverage counts show valid intervals / all intervals for each total. A dash means unavailable; zero is a measured zero.</p></section>`:'<div class="empty-state">Save at least two complete readings to see energy charts.</div>'}`;
    root.querySelector('#daily-chart-period').addEventListener('change',e=>{this.mode=e.target.value;this.render();});
    if(!groups.length)return;
    if(typeof Chart==='undefined'){root.querySelectorAll('.daily-chart-frame').forEach(el=>el.innerHTML='<p class="form-hint">Reconnect to load charts. The values remain available in the table below.</p>');return;}
    const colors={cebImport:'#087f83',gen1:'#3b82f6',gen2:'#e89b24',transformer:'#8b5cf6',cebExport:'#dc5d68',lt:'#64748b',cebTransformerDeviation:'#087f83'};
    specs.forEach((s,i)=>{const data=s.deviation&&this.mode==='day'?periodIntervals:groups;const canvas=root.querySelector('#daily-energy-chart-'+i);this.charts.push(new Chart(canvas,{type:'bar',data:{labels:data.map(g=>[s.deviation&&this.mode==='day'?g.end.slice(0,10):g.key,'From '+this.axisTime(g.start),'To '+this.axisTime(g.end)]),datasets:s.keys.map((key,index)=>({label:names[key],data:data.map(g=>g.values[key]??null),backgroundColor:s.deviation?data.map(g=>g.values[key]<0?'#dc5d68':g.values[key]>0?'#087f83':'#64748b'):colors[key],borderRadius:4,grouped:true,barPercentage:.9,categoryPercentage:.78}))},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:s.keys.length>1},tooltip:{mode:'index',intersect:false,callbacks:{label:context=>`${context.dataset.label}: ${s.deviation&&context.raw>0?'+':''}${Calc.formatNumber(context.raw)} kWh`,afterLabel:context=>{const g=data[context.dataIndex];const key=s.keys[context.datasetIndex],range=g.ranges[key];return range?[`Start: ${this.timeLabel(range.start)}`,`End: ${this.timeLabel(range.end)}`,`${g.counts[key]||0} valid interval(s) · Sri Lanka`]:['No valid interval'];}}}},scales:{x:{stacked:false,ticks:{maxTicksLimit:4,maxRotation:0}},y:{stacked:false,beginAtZero:true,grid:{color:context=>context.tick.value===0?'#476577':'#e7edf2',lineWidth:context=>context.tick.value===0?2:1},title:{display:true,text:'Interval energy (kWh)'}}}}}));});
  }
};
