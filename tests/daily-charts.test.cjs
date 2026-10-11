const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx=vm.createContext({console});vm.runInContext(['calculations','daily','daily-charts'].map(n=>fs.readFileSync('js/'+n+'.js','utf8')).join('\n')+'\nglobalThis.C=DailyCharts;globalThis.Calc=Calc;',ctx);ctx.Calc.meterChanges=[];
const record=(date,time,n)=>({plant:'A',date,time,readings:{cebImport:String(n*100),cebExport:String(n*10),gen1:String(n*40),gen2:String(n*50),transformer:String(n*90),lt:String(n*5)}});
const rows=[record('2026-10-04','09:00',0),record('2026-10-05','09:00',1),record('2026-10-05','12:00',2),record('2026-10-07','12:00',3)];
const days=ctx.C.aggregate(rows,'day');assert.equal(days.length,2);assert.equal(days[0].values.cebImport,200);assert.equal(days[0].values.importDeviation,30);assert.equal(days[0].values.exportDeviation,10);assert.equal(days[1].gaps,1);
assert.equal(ctx.C.bucket('2026-10-04','week'),'2026-09-28');const weeks=ctx.C.aggregate(rows,'week');assert.equal(weeks.length,1);assert.equal(weeks[0].values.cebImport,300);assert.equal(ctx.C.aggregate(rows,'month')[0].values.lt,15);assert.equal(ctx.C.aggregate(rows,'year')[0].values.gen1,120);
assert.equal(ctx.C.aggregate([rows[0],{...rows[1],draft:true}],'day').length,0);
const bad={...rows[1],readings:{...rows[1].readings,transformer:'-1'}};const invalid=ctx.C.aggregate([rows[0],bad],'day')[0];assert.equal(invalid.values.importDeviation,undefined);assert.equal(invalid.values.cebImport,100);
console.log('Chart grouping, interval totals, deviations, draft and coverage checks passed');
