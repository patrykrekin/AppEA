import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const runtime=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=await import(runtime?pathToFileURL(runtime+'/playwright/index.mjs'): 'playwright');
const root=new URL('../../',import.meta.url),here=new URL('.',import.meta.url);
const before=execFileSync('git',['show','5082cbca3689862b229a692bd9a496fb185ff0f7:index.html'],{cwd:root,encoding:'utf8',maxBuffer:2**20});
const after=readFileSync(new URL('index.html',root),'utf8');
function body(source,name){const start=source.indexOf('  function '+name+'('),end=source.indexOf('\n  function ',start+1);return source.slice(start,end);}
for(const name of ['obsPlan','obsTrend','wGoreSiatki'])assert.equal(body(after,name),body(before,name),name+' unchanged');
const base=JSON.parse(execFileSync('python',['-c',"import zipfile,sys;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read('cycle1/data.json'))",new URL('../stage15j/evidence.zip',here).pathname],{maxBuffer:2**20}));
const now=base.atFast||base.at;
// Explicit synthetic watchlist, not transplanted investment candidates or live offers.
const cards={};
for(const [key,cena,zmiana24] of [['Poza limitem 89',93000,-6],['W limicie 89',44000,-20],['Bez planu 89',50000,1]])cards[key]={klucz:key,cena,zmiana24,ostatnio:now,hist:[],krok:500};
const fixture={...base,obserwacja:{platforma:'console',at:now,karty:cards}};
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url.startsWith('/data.json')?'application/json':'text/html');res.end(req.url.startsWith('/data.json')?JSON.stringify(fixture):req.url.startsWith('/before')?before:after);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.FUT_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  let previous;
  for(const version of ['before','after']){
   const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   await context.addInitScript(()=>{localStorage.setItem('fut.obs.affordable','0');localStorage.setItem('fut.budget','2000000');localStorage.setItem('fut.platform','ps');});
   await page.goto(origin+'/'+version);await page.waitForSelector('#obs-list .obs-row:not(.head)');
   const snapshot=await page.locator('#obs-list .obs-row:not(.head)').evaluateAll(rows=>rows.map(row=>({name:row.querySelector('.obs-nazwa').childNodes[0].textContent,numbers:[...row.querySelectorAll('.obs-val')].map(x=>x.childNodes[0].textContent),state:row.querySelectorAll('.obs-val')[1].innerText})));
   assert.equal(snapshot.length,3);assert.deepEqual(errors,[]);
   if(version==='before')previous=snapshot;
   else{
    assert.deepEqual(snapshot,previous,'same values, order and market status');
    await page.locator('#obs-box .obs-note').waitFor({state:'visible'});
    const rows=page.locator('#obs-list .obs-row:not(.head)');
    for(let i=0;i<3;i++){
     const row=rows.nth(i),values=row.locator('.obs-val'),limit=(await values.nth(1).evaluate(x=>x.childNodes[0].textContent));
     if(snapshot[i].name==='Bez planu 89'){assert.equal(await row.locator('.netto-limit').count(),0);continue;}
     assert.equal(await row.locator('.netto-limit').innerText(),'przy zakupie za '+limit);
     assert.ok(await row.locator('.netto-limit').isVisible());
     if(snapshot[i].name==='Poza limitem 89')assert.equal(await values.nth(2).locator('small.ok').count(),0);
    }
    const overflow=await page.locator('#obs-box').evaluate(el=>({section:el.scrollWidth>el.clientWidth+1,conditions:[...el.querySelectorAll('.netto-limit')].some(x=>x.scrollWidth>x.clientWidth+1)}));
    assert.deepEqual(overflow,{section:false,conditions:false});
    await page.locator('#obs-box').screenshot({path:new URL('preview-'+viewport.width+'.png',here).pathname});
    await page.locator('#pc').click();assert.match(await page.locator('#obs-list').innerText(),/Nie przenosimy cen ani celów na PC/);assert.equal(await page.locator('#obs-list .netto-limit').count(),0);
    await page.locator('#ps').click();assert.equal(await page.locator('#obs-list .netto-limit').count(),2);
    results.push({viewport:viewport.width,cases:3,valuesAndOrderUnchanged:true,explicitLimitVisible:true,noOverflow:true,platformIsolation:true,pageErrors:errors});
   }
   await context.close();
  }
 }
 const result={status:'PASS',baselineCommit:'5082cbca3689862b229a692bd9a496fb185ff0f7',baselineHtmlSha256:createHash('sha256').update(before).digest('hex'),afterHtmlSha256:createHash('sha256').update(after).digest('hex'),mathFunctionsUnchanged:['obsPlan','obsTrend','wGoreSiatki'],fixture:'synthetic watchlist on archived 15J data envelope; not actual 15K signals',results,externalRequestsBlocked:true,scope:'presentation only; no efficacy or full accessibility claim'};
 writeFileSync(new URL('ui-result.json',here),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
