const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({console});
vm.runInContext(fs.readFileSync('js/calculations.js','utf8') + '\nglobalThis.Calc = Calc;',ctx);
const c = ctx.Calc;
assert.equal(c.diff('0','0'),0);
assert.equal(c.diff('12oops','1'),null);
assert.equal(c.diff('Infinity','1'),null);
assert.equal(c.diff(' ','1'),null);
assert.equal(c.dailyAverage(0,30),0);
assert.equal(c.dailyAverage(null,30),null);
assert.equal(c.dailyAverage(-10,30),null);
c.meterChanges = [{channel:'gen1Panel',date:'2026-08-06',oldFinal:'120',newStart:'0'}];
assert.equal(c.meterDiff('gen1Panel',30,100,'2026-09-06','2026-08-01').value,50);
const records = [
 {general:{date:'2026-01-01'},cebMeter:{importedTotal:'100'}},
 {general:{date:'2026-01-11'},cebMeter:{importedTotal:'100'}},
 {general:{date:'2026-01-21'},cebMeter:{importedTotal:'20'}}
];
const trend = c.getMonthlyGeneration(records);
assert.equal(trend.monthlyKwh.length,1);
assert.equal(trend.monthlyKwh[0],0);
assert.equal(trend.dailyAvg[0],0);
console.log('Calculation regression checks passed');
