/**
 * Jednorazowy audyt ceny na indywidualnej karcie FUT.GG.
 * Tylko 8 stron, bez zapisu danych rynku i zmian w produkcyjnym scraperze.
 * 6 kart znikajacych z poprawnych migawek 07:38–07:50 i 2 kontrole.
 * Nie wolno czytac ratingu/statystyki jako ceny.
 */
import { writeFileSync } from "node:fs";
import { open } from "./lib/browser.mjs";

const cards=[
  {test:"zniknela",side:"ps",ovr:84,id:"237678",name:"Konaté",historical:850,slug:"ibrahima-konate"},
  {test:"zniknela",side:"ps",ovr:86,id:"233731",name:"Isak",historical:5000,slug:"alexander-isak"},
  {test:"zniknela",side:"ps",ovr:87,id:"232075",name:"Lavelle",historical:7200,slug:"rose-lavelle"},
  {test:"zniknela",side:"pc",ovr:86,id:"247851",name:"Bruno Guimarães",historical:5400,slug:"bruno-guimaraes"},
  {test:"zniknela",side:"pc",ovr:87,id:"256790",name:"Musiala",historical:6900,slug:"jamal-musiala"},
  {test:"zniknela",side:"pc",ovr:88,id:"212622",name:"Kimmich",historical:12500,slug:"joshua-kimmich"},
  {test:"kontrola",side:"ps",ovr:83,id:"234236",name:"Schick",historical:700,slug:"patrik-schick"},
  {test:"kontrola",side:"pc",ovr:88,id:"220901",name:"David Raya",historical:12750,slug:"david-raya"}
];
const report={created:new Date().toISOString(),archiveWindow:"2026-11-06 06:38:32–06:50:40 UTC",
  method:"Playwright Chrome, exact player/item ID + rating, no unconfirmed numbers",
  disclaimer:"FUT.GG listing prices are estimates, not proof of filled trades",
  items:[]};
const {browser,page}=await open();
try {
  for(const c of cards){
    const requested="https://www.fut.gg/players/"+c.id+"-"+c.slug+"/27-"+c.id+"/";
    const started=Date.now();
    const result={...c,requested,status:"unknown"};
    try {
      await page.context().clearCookies();
      await page.context().addCookies([{name:"futgg_platform",value:c.side==="ps"?"ps5":"pc",url:"https://www.fut.gg/"}]);
      const response=await page.goto(requested,{waitUntil:"domcontentloaded",timeout:11000});
      await page.waitForTimeout(650);
      const snapshot=await page.evaluate(()=>{
        const body=document.body?.innerText||"";
        const find=(key,n=180)=>{const i=body.toLowerCase().indexOf(key.toLowerCase());return i>=0?body.slice(i,i+n).replace(/\s+/g," ").trim():null;};
        return {
          title:document.title,
          url:location.href,
          cookie:(document.cookie.match(/(?:^|;\s*)futgg_platform=([^;]+)/)||[])[1]||null,
          heading:document.querySelector("h1")?.innerText?.trim()||null,
          playerId:(body.match(/Player ID\s+(\d+)/)||[])[1]||null,
          itemId:(body.match(/Item ID\s+(\d+)/)||[])[1]||null,
          lowestBin:find("Lowest BIN",135),
          priceContext:find("Price:",135),
          recentSales:find("Recent Sales",95),
          liveAuctions:find("Live Auctions",95),
          bodyHead:body.slice(0,130).replace(/\s+/g," ").trim()
        };
      });
      Object.assign(result,snapshot,{http:response?.status()||null,ms:Date.now()-started});
      const identityOk=snapshot.playerId===c.id
        && !!snapshot.heading?.includes(String(c.ovr))
        && !/prediction/i.test(snapshot.title||"")
        && snapshot.itemId===c.id;
      const platformOk=snapshot.cookie===(c.side==="ps"?"ps5":"pc");
      result.identityVerified=identityOk;
      result.platformVerified=platformOk;
      const sections=[snapshot.lowestBin,snapshot.priceContext].filter(Boolean);
      let numericCandidate=null;
      for(const part of sections){
        const m=part.match(/^(?:Lowest BIN|Price:)\s*(?:FC Coin\s*)?([\d,.]+(?:[KM])?)\b/i);
        if(m){numericCandidate=m[1];break;}
      }
      if(identityOk&&platformOk&&numericCandidate){
        result.priceText=numericCandidate;result.status="numeric-on-detail-needs-cross-check";
      }else if(!identityOk)result.status="version-or-identity-unverified";
      else if(!platformOk)result.status="platform-unverified";
      else result.status="no-exact-price-on-detail";
    }catch(e){
      result.status="request-error";
      result.error=String(e.message||e).slice(0,200);
      result.ms=Date.now()-started;
    }
    report.items.push(result);
    console.log(c.side+" "+c.name+" "+c.ovr+" "+c.test+" => "+result.status+" / "+(result.priceContext||result.lowestBin||"")+" "+result.ms+"ms");
  }
}finally{await browser.close();}
report.totals={
  checked:report.items.length,
  numericCandidates:report.items.filter(x=>x.status==="numeric-on-detail-needs-cross-check").length,
  noExactPrice:report.items.filter(x=>x.status==="no-exact-price-on-detail").length,
  problems:report.items.filter(x=>/unverified|request-error/.test(x.status)).length
};
writeFileSync("probe-odpadlych-wynik.json",JSON.stringify(report,null,2)+"\n");
console.log("PODSUMOWANIE:",JSON.stringify(report.totals));
