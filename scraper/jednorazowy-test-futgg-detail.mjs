/**
 * One-shot, read-only test: does the individual FUT.GG page show a quote when a
 * card has fallen out of AppEA's published TOP 5? Does NOT assert tradeability.
 * Note: TOP 5 dropout is not the same as leaving Fut.gg's longer source list.
 */
import {open} from "./lib/browser.mjs";
const TARGETS=[
 {p:"ps",rating:86,id:"222665",slug:"martin-odegaard",name:"Ødegaard",old:4800},
 {p:"ps",rating:85,id:"204935",slug:"jordan-pickford",name:"Pickford",old:2300},
 {p:"ps",rating:85,id:"245956",slug:"christiane-endler",name:"Endler",old:2300},
 {p:"ps",rating:88,id:"212622",slug:"joshua-kimmich",name:"Kimmich",old:12500},
 {p:"pc",rating:85,id:"246104",slug:"ryan-gravenberch",name:"Gravenberch",old:2600},
 {p:"pc",rating:85,id:"215441",slug:"serhou-guirassy",name:"Guirassy",old:2600},
 {p:"pc",rating:87,id:"213331",slug:"jonathan-tah",name:"Tah",old:7400},
 {p:"pc",rating:87,id:"247819",slug:"nico-schlotterbeck",name:"Schlotterbeck",old:7400}
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {browser,newPage}=await open();
let results=[];
const check=async(target)=>{
 const page=await newPage();
 const url="https://www.fut.gg/players/"+target.id+"-"+target.slug+"/27-"+target.id+"/";
 let row={p:target.p,name:target.name,playerId:target.id,rating:target.rating,
  lastTop5Price:target.old,source:"FUT.GG individual base item page",url};
 try{
  await page.context().addCookies([{name:"futgg_platform",value:target.p==="pc"?"pc":"ps5",
    domain:".fut.gg",path:"/",sameSite:"Lax"}]);
  const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:18000});
  await page.waitForTimeout(1800);
  row={...row,...await page.evaluate(()=>{
    const txt=document.body?.innerText||"";
    const around=(marker,range=175)=>{let i=txt.toLowerCase().indexOf(marker.toLowerCase());
      return i<0?"":txt.slice(Math.max(0,i-45),i+range).replace(/\s+/g," ").trim()};
    const match=txt.match(/\bItem ID\s*(\d+)/i);
    let cookie=(document.cookie.match(/(?:^|;\s*)futgg_platform=([^;]+)/)||[])[1]||"";
    return {title:document.title,h1:document.querySelector("h1")?.innerText||"",
      itemId:match?.[1]||null,cookie,priceText:around("Price:"),
      hasPriceLabel:/\bPrice:\s*/i.test(txt),
      noPrice:/Could not load prices|No price history available/i.test(txt),
      priceSnippet:around("Prices"),
      bodyLength:txt.length};
  }),status:response?.status()||null,landed:page.url()};
 }catch(e){row.error=String(e.message||e).slice(0,240);}
 finally{await page.close();}
 return row;
};
try{
 for(let start=0;start<TARGETS.length;start+=2){
  const batch=await Promise.all(TARGETS.slice(start,start+2).map(check));
  results.push(...batch);
 }
}finally{await browser.close();}
const ok=results.filter(x=>x.status===200);
const valid=ok.filter(x=>x.itemId===x.playerId);
const price=valid.filter(x=>x.hasPriceLabel&&!/Price:\s*(?:—|-|N\/A|Unavailable)/i.test(x.priceText));
console.log("TEST SUMMARY: "+JSON.stringify({requested:TARGETS.length,http200:ok.length,
 baseVersionMatched:valid.length,hasLabel:price.length,byMarket:{
  ps:results.filter(x=>x.p==="ps").length,pc:results.filter(x=>x.p==="pc").length
}}));
for(const x of results)console.log("RESULT_JSON="+JSON.stringify(x));
console.log("Only a direct displayed PRICE is a page quote, NOT a completed sale or independently verified BIN.");
if(results.length!==TARGETS.length)process.exitCode=1;
