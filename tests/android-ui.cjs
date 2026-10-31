/* Optional browser QA: set PLAYWRIGHT_MODULE to your Playwright installation. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.HYDRO_QA_URL||'http://localhost:8765/android/app/src/main/assets/';
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try{
    for(const width of [320,390,768]){
      const context=await browser.newContext({viewport:{width,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        function initial(){const plant='Kumburutheniwela Mini Hydro Power';return {online:false,version:'1.0.0',draft:{id:'draft-1',operator:'',readings:{}},local:[],remote:[
          {id:'previous-1',plant,operator:'Priyantha',date:'2026-10-11',time:'21:43:39',draft:false,readings:{cebImport:'22293030',cebExport:'4896',gen1:'225.38',gen2:'740.62',transformer:'954.7',lt:'73059'}},
          {id:'previous-2',plant,operator:'Athula',date:'2026-10-12',time:'09:39:16',draft:false,readings:{cebImport:'22307310',cebExport:'4896',gen1:'229.11',gen2:'752.83',transformer:'970.4',lt:'73090'}}]};}
        const read=()=>JSON.parse(localStorage.getItem('qa')||JSON.stringify(initial()));const write=s=>localStorage.setItem('qa',JSON.stringify(s));
        window.HydroAndroid={state:()=>JSON.stringify(read()),saveDraft:json=>{const s=read();s.draft=JSON.parse(json);write(s);return '';},submit:json=>{const s=read(),d=JSON.parse(json);if(s.local.some(r=>r.id===d.id))return 'Duplicate';s.local.push({...d,plant:'Kumburutheniwela Mini Hydro Power',draft:false,localState:'pending',date:'2026-10-31',time:'12:00:00',capturedAtMillis:1793428200000});s.draft={id:'draft-2',operator:d.operator,readings:{}};write(s);return '';},sync:()=>{},owner:()=>{},close:()=>{}};
      });
      await page.goto(base,{waitUntil:'load'});await page.selectOption('#operator','Hirusha');
      await page.fill('#reading','22308000');await page.reload();assert.equal(await page.inputValue('#reading'),'22308000');assert.equal(await page.inputValue('#operator'),'Hirusha');
      for(const value of ['22308000','4896','230.10','753.20','971.2','73100']){await page.fill('#reading',value);await page.click('#next');}
      await page.waitForSelector('#review:not([hidden])');assert.match(await page.textContent('#review-content'),/971.2/);
      await page.fill('#notes','Offline QA draft');await page.check('#confirm');await page.click('#submit');
      await page.waitForSelector('#history:not([hidden])');assert.equal(await page.locator('.status.pending').count(),1);
      assert.equal(await page.locator('#history [data-edit]').count(),0);assert.equal(await page.locator('#history details[open]').count(),0);
      await page.locator('#history details summary').first().click();assert.equal(await page.locator('#history details[open] .meter-row').count(),6);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow at '+width);
      await page.click('nav [data-page=charts]');assert.equal(await page.locator('canvas').count(),3);
      for(const period of ['day','week','month','year','reading'])await page.selectOption('#period',period);
      await page.click('nav [data-page=entry]');assert.equal(await page.inputValue('#reading'),'');assert.equal(await page.inputValue('#operator'),'Hirusha');
      if(width===390)await page.screenshot({path:'output/qa/android-entry.png',fullPage:true});
      await page.click('nav [data-page=sync]');assert.match(await page.textContent('#sync-content'),/Offline/);
      assert.deepEqual(errors,[]);await context.close();console.log('Android UI '+width+'px: draft restart, six meters, submit lock, offline queue, charts and layout pass.');
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
