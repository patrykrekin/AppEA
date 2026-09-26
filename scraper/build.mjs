import { readFileSync, writeFileSync } from "node:fs";

/* Artefakt dostaje fragment (skeleton dokłada sam), Netlify potrzebuje pełnego dokumentu.
   Jedno źródło, dwa wyjścia — żeby nie rozjechały się przy kolejnej zmianie strony.
   node build.mjs <fragment.html> <index.html> */

const [, , src = "../fut-terminal.html", out = "../index.html"] = process.argv;
const body = readFileSync(src, "utf8");
const title = (body.match(/<title>(.*?)<\/title>/) || [, "Terminal Rynkowy FUT"])[1];

writeFileSync(out, `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Terminal inwestycyjny rynku EA FC 27 Ultimate Team — pozycje krótkie i długie dobrane do budżetu.">
<meta name="robots" content="noindex">
${body.replace(/<title>.*?<\/title>\n?/, `<title>${title}</title>\n`).split("<style>")[0].trimEnd()}
</head>
<body>
${"<style>" + body.split("<style>").slice(1).join("<style>")}
</body>
</html>
`);
console.log(`zbudowano ${out} (${title})`);
