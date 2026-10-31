const assert=require('node:assert/strict');
const M=require('../android/app/src/main/assets/model.js');
function row(id,date,readings,extra={}){return {id,date,time:'12:00:00',plant:'Kumburutheniwela Mini Hydro Power',draft:false,readings,localState:'synced',...extra};}
const a=row('a','2026-10-11',{cebImport:'22293030',cebExport:'4896',gen1:'225.38',gen2:'740.62',transformer:'954.7',lt:'73059'});
const b=row('b','2026-10-12',{cebImport:'22307310',cebExport:'4896',gen1:'229.11',gen2:'752.83',transformer:'970.4',lt:'73090'});
const energy=M.energy(b,a);
assert.deepEqual(energy,{cebImport:14280,cebExport:0,gen1:3730,gen2:12210,transformer:15700,lt:31,deviation:-1420});
assert.equal(M.energy(a,b).deviation,null,'decreasing counters are unavailable, not zero');
assert.equal(M.energy({...b,readings:{...b.readings,transformer:''}},a).deviation,null);
assert.equal(M.energy(b,a,[{channel:'transformerPanel',date:'2026-10-11'}]).transformer,null);
const queued={...b,id:'queued',localState:'pending',capturedAtMillis:Date.parse('2026-10-13T01:00:00Z')};
const deleted={...a,_deleted:true};
assert.deepEqual(M.records({remote:[deleted,b],local:[a,queued]}).map(r=>r.id),['queued','b'],'cloud tombstones override synced local copies');
const offline={...b,capturedAtMillis:Date.parse('2026-10-12T01:00:00Z'),readingAt:{seconds:Date.parse('2026-10-20T01:00:00Z')/1000}};
assert.equal(M.time(M.stamp(offline)),'2026-10-12 06:30:00','offline captured time must not become upload time');
const intervals=M.intervals([b,a]);assert.equal(intervals.length,1);
for(const p of ['reading','day','week','month','year']){const groups=M.aggregate(intervals,p);assert.equal(groups[0].values.deviation,-1420);assert.equal(groups[0].counts.cebExport,1);assert.ok(groups[0].start<groups[0].end);}
assert.equal(M.format(''), '—');assert.equal(M.format(0),'0');
assert.equal(M.format('999999999999.123456'),'999,999,999,999.123456','Counter displays preserve all entered digits');
console.log('Android model: native units, signed deviation, missing/replaced meters, offline chronology, tombstones, and aggregation pass.');
