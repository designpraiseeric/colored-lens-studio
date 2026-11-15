// Pulls the encyclopedia data out of Colored Lens (chroma-encyclopedia/src/colored_lens.html)
// into content/encyclopedia.json. The HTML stays the single source of truth.
// Usage: node tools/extract_encyclopedia.mjs <path-to-colored_lens.html> <out.json>
import fs from 'node:fs';
import vm from 'node:vm';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: extract_encyclopedia.mjs <colored_lens.html> <out.json>'); process.exit(2); }
const html = fs.readFileSync(src, 'utf8');
const start = html.indexOf('/* ===================== DATA');
const end = html.indexOf('/* ===================== RENDER');
if (start < 0 || end < 0) throw new Error('Could not find the DATA/RENDER markers in colored_lens.html');
const names = [...html.slice(start, end).matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)].map(m => m[1]);
const code = html.slice(start, end) + `\n;globalThis.__out={${names.join(',')}};`;
const ctx = { console, document: { querySelector: () => null }, window: {} };
vm.createContext(ctx);
vm.runInContext(code, ctx, { timeout: 5000 });
const data = JSON.parse(JSON.stringify(ctx.__out)); // drop functions

// The skin section is written as HTML in the render code; keep its text.
const skinStart = html.indexOf('$("#skinbody").innerHTML=`');
let skinHtml = '';
if (skinStart >= 0) { const a = skinStart + '$("#skinbody").innerHTML=`'.length; skinHtml = html.slice(a, html.indexOf('`', a)); }
data.SKIN_HTML = skinHtml;
const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || 'Colored Lens';
const stamp = (html.match(/Compiled ([A-Z][a-z]+ \d{4})/) || [])[1] || '';
const result = { source: 'designpraiseeric/chroma-encyclopedia', title, compiled: stamp, keys: Object.keys(data), ...data };
fs.writeFileSync(out, JSON.stringify(result));
console.log(`encyclopedia: ${Object.keys(data).length} tables -> ${out} (${(fs.statSync(out).size/1024).toFixed(0)} KB)`);
