const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 const p=await b.newPage({serviceWorkers:'block'});await p.route('**/*',r=>new URL(r.request().url()).hostname==='localhost'?r.continue():r.abort());
 await p.goto('http://localhost:8765/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>App._pageReady);
 await p.evaluate(async()=>{
  FirebaseSync.getUser=()=>({uid:'owner',email:'heshantha.pcl@gmail.com',emailVerified:true,displayName:'Heshantha'});FirebaseSync.onDailyReadingSaved=()=>{};
  const captured=Date.parse('2026-10-12T06:30:00+05:30');
  await Store.saveDailyReading({id:'android-qa',plant:Store.defaultSettings.plantName,date:'2026-10-12',time:'06:30:00',operator:'Athula',draft:false,source:'android-operator',timestampSource:'device-clock',capturedAtMillis:captured,capturedAt:{seconds:captured/1000},readingAt:{seconds:captured/1000+86400},readings:{cebImport:'100',cebExport:'0',gen1:'1',gen2:'2',transformer:'3',lt:'0'}},{silent:true});
  await App.navigate('daily');
 });
 await p.locator('[data-table="Entered readings"] summary').click();await p.locator('[data-table="Entered readings"] [data-load-daily="android-qa"]').click();
 await p.selectOption('#daily-operator','Upul');await p.click('#daily-save');
 await p.waitForFunction(async()=> (await Store.getDailyReadings()).find(r=>r.id==='android-qa').operator==='Upul');
 let r=await p.evaluate(async()=>{const r=(await Store.getDailyReadings()).find(r=>r.id==='android-qa');return {...r,stamp:Daily.stamp(r)};});
 assert.equal(r.stamp,'2026-10-12T06:30:00');assert.ok(r.capturedAt);assert.equal(r.source,'android-operator');
 await p.fill('#daily-time','07:30:00');await p.click('#daily-save');
 await p.waitForFunction(async()=> (await Store.getDailyReadings()).find(r=>r.id==='android-qa').time.startsWith('07:30'));
 r=await p.evaluate(async()=>{const r=(await Store.getDailyReadings()).find(r=>r.id==='android-qa');return {...r,stamp:Daily.stamp(r)};});
 assert.ok(r.stamp.startsWith('2026-10-12T07:30'));assert.ok(r.capturedAt);assert.equal(r.timestampSource,'owner-entered');
 assert.equal(r.readingAt.seconds,Date.parse('2026-10-13T06:30:00+05:30')/1000,'Owner time corrections retain the original server receipt timestamp');
 console.log('Owner operator correction preserves Android capture time; explicit time correction overrides it.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
