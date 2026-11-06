// Jednorazowy, diagnostyczny odczyt głębszej listy 86 OVR FUT.GG.
// Read-only. Zero zmian w scrape.mjs, refresh.yml, data.json i archiwach.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "https://www.fut.gg/players/?market_players=true&overall__gte=86&overall__lte=86&sorts=current_price";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const browser = await chromium.launch(process.env.FUT_CHROMIUM ? { executablePath: process.env.FUT_CHROMIUM } : {});
const started = Date.now();
const raport = { test: "głębsza lista 86 OVR", at: new Date().toISOString(),
  note: "Kandydaci cenowi NIE są automatycznie uznaną ceną; konieczna kontrola kontekstu DOM.",
  platformy: {}, blad: null };

async function pobierz(platform, pageNo) {
  const context = await browser.newContext({ userAgent: UA, locale: "en-GB" });
  try {
    await context.addCookies([{ name: "futgg_platform", value: platform === "ps" ? "ps5" : "pc",
      domain: ".fut.gg", path: "/" }]);
    const page = await context.newPage();
    const url = BASE + (pageNo > 1 ? "&page=" + pageNo : "");
    const before = Date.now();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(4000);
    const dane = await page.evaluate(() => {
      const cookie = (document.cookie.split(";").map(x => x.trim())
        .find(x => x.startsWith("futgg_platform=")) || "").split("=")[1] || "";
      const linki = [...document.querySelectorAll("a[href]")].filter(a => {
        try { return /^\/players\/\d+(?:\/|$)/.test(new URL(a.href).pathname); }
        catch { return false; }
      });
      const seen = new Set();
      const karty = [];
      for (const a of linki) {
        const href = new URL(a.href).pathname;
        if (seen.has(href)) continue;
        seen.add(href);
        const tekst = (a.innerText || "").replace(/\s+/g, " ").trim();
        const blisko = (a.parentElement?.innerText || "").replace(/\s+/g, " ").trim();
        karty.push({
          id: (href.match(/\/players\/(\d+)/) || [])[1] || null,
          url: href,
          tekst: tekst.slice(0, 200),
          okolica: blisko.slice(0, 280),
          alt: a.querySelector("img[alt]")?.alt?.slice(0, 150) || ""
        });
      }
      const visibleText = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n");
      const pageLinks = [...document.querySelectorAll('a[href*="page="]')]
        .slice(0, 15).map(a => ({ text: a.innerText?.trim(), href: a.getAttribute("href") }));
      return {
        title: document.title, cookie, linkCount: linki.length,
        uniqueCards: karty.length, examples: karty.slice(0, 12),
        ids: karty.map(c => c.id).filter(Boolean),
        pagination: pageLinks,
        trailingText: visibleText.slice(-1700),
        bodyCharacters: visibleText.length,
        priceTokensInExamples: karty.filter(k => /\b(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?[KM])\b/i.test(k.tekst + " " + k.okolica)).length
      };
    });
    const expected = platform === "ps" ? "ps5" : "pc";
    return {
      platform, page: pageNo, url, http: response?.status() || null,
      ms: Date.now()-before, ...dane,
      cookieCorrect: dane.cookie === expected
    };
  } finally {
    await context.close();
  }
}

try {
  for (const platform of ["ps", "pc"]) {
    const first = await pobierz(platform, 1);
    const second = await pobierz(platform, 2);
    const set1 = new Set(first.ids);
    const overlap = second.ids.filter(id => set1.has(id)).length;
    raport.platformy[platform] = {
      first, second, overlapPage1Page2: overlap,
      uniqueAcrossPages: new Set([...first.ids, ...second.ids]).size
    };
    for (const r of [first,second]) {
      console.log("DIAGNOSTYKA " + platform + " strona " + r.page + ": " + JSON.stringify({
        http: r.http, cookie: r.cookie, title: r.title, bodyCharacters: r.bodyCharacters,
        pagination: r.pagination, visibleTail: r.trailingText?.slice(-1100),
        links: r.linkCount, cards: r.uniqueCards
      }));
    }
    console.log(platform.toUpperCase() + ": page1=" + first.uniqueCards + ", page2=" +
      second.uniqueCards + ", wspólne ID=" + overlap + ", poprawne cookies=" +
      first.cookieCorrect + "/" + second.cookieCorrect +
      ", czas=" + (first.ms+second.ms) + "ms");
  }
} catch (e) {
  raport.blad = String(e?.stack || e).slice(0, 1200);
  console.error("Błąd testu: " + raport.blad);
  process.exitCode = 1;
} finally {
  raport.totalMs = Date.now() - started;
  writeFileSync("glebokosc-86-raport.json", JSON.stringify(raport, null, 2));
  await browser.close();
}
