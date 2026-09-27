import { chromium } from "playwright";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/* Na czystym VPS-ie wystarczy `npx playwright install --with-deps chromium`.
   Jeśli Chromium siedzi gdzie indziej, wskaż go przez FUT_CHROMIUM. */
export async function open(){
  const exe = process.env.FUT_CHROMIUM;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const newPage = () => browser.newPage({ userAgent: UA, locale: "en-GB" });
  const page = await newPage();
  return { browser, page, newPage };
}
