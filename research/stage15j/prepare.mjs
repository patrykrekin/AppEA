import {readFileSync,writeFileSync,cpSync,mkdirSync,symlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function instrument(original){
 const b=Buffer.from(original),blob=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
 assert.equal(blob,'88912b6f7b8cdc679d1a94ba62510e465d7adac6','only reviewed exact scraper source');
 const edits=[
  ['import { open }', 'import { recordRead, recordGoAttempt, captureContext, finishCapture } from "../research/stage15j/capture.mjs";\nimport { open }'],
  ['      await page.goto(url,', '      recordGoAttempt(url);\n      await page.goto(url,'],
  ['  const ps = await zbierz();','  const ps = await zbierz();\n  const stage15iPsMs = Date.now(), stage15iPsMono = process.hrtime.bigint();\n  recordRead("ps", ps, stage15iPsMs, stage15iPsMono, await czytajCiastko(page));'],
  ['  const pc = await zbierz();','  const pc = await zbierz();\n  const stage15iPcMs = Date.now(), stage15iPcMono = process.hrtime.bigint();\n  recordRead("pc", pc, stage15iPcMs, stage15iPcMono, await czytajCiastko(page));'],
  ['    okazjePc.trwalosc = trwaloscPc;','    okazjePc.trwalosc = trwaloscPc;\n    captureContext({cycleAt:at,bands,preFast:poprzPoziomy,preSlow:poprzD,persistenceAfter:{ps:trwaloscPs,pc:trwaloscPc},decisions:inwestycje,levelsAfter:{ps:okazjePs.poziomyD,pc:okazjePc.poziomyD}});'],
  ['  if (browser) await browser.close();','  if (browser) await browser.close();\n  finishCapture();']
 ];
 let code=original;
 for(const [from,to] of edits){assert.equal(code.split(from).length-1,1,'unique capture anchor');code=code.replace(from,to);}
 let restored=code;for(const [from,to] of [...edits].reverse())restored=restored.replace(to,from);
 assert.equal(restored,original,'instrumentation must be insertion-only and reversible');
 return code;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const target=path.resolve(process.argv[2]??''),output=path.resolve(process.argv[3]??'');
 assert.ok(path.relative(root,target).startsWith('..')&&path.relative(root,output).startsWith('..'),'temporary destinations outside checkout');
 assert.ok(!existsSync(target),'fresh code copy only');
 const source=readFileSync(path.join(root,'scraper/scrape.mjs'),'utf8'),prepared=instrument(source);
 cpSync(root,target,{recursive:true,filter:src=>!path.relative(root,src).split(path.sep).some(p=>p==='.git'||p==='node_modules')});
 mkdirSync(output,{recursive:true});
 symlinkSync(path.join(root,'scraper/node_modules'),path.join(target,'scraper/node_modules'),'dir');
 writeFileSync(path.join(target,'scraper/scrape.mjs'),prepared);
 assert.equal(readFileSync(path.join(root,'scraper/scrape.mjs'),'utf8'),source);
 console.log('Prepared insertion-only temp scraper; checkout unchanged');
}
