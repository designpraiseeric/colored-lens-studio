// Builds the panels into dist/: one bundle of ui/ + core/ per host, plus the content they ship with
// (so they work offline from the first launch; newer content then arrives from GitHub Pages).
// Usage: node tools/build_hosts.mjs [web|premiere|resolve ...]   (needs `npm run content` first)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'studio.config.json'), 'utf8'));
const SITE = path.join(ROOT, 'site', 'content');
if (!fs.existsSync(path.join(SITE, 'manifest.json'))) { console.error('Run `npm run content` first.'); process.exit(1); }
const which = process.argv.slice(2).length ? process.argv.slice(2) : ['web', 'premiere', 'aftereffects', 'resolve'];
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.cpSync(a, b, { recursive: true }); };

function copyContent(dest, { frames = false } = {}) {
  for (const f of ['encyclopedia.json', 'refs.json', 'looks.json', 'manifest.json']) cp(path.join(SITE, f), path.join(dest, 'content', f));
  cp(path.join(SITE, 'luts'), path.join(dest, 'content', 'luts'));
  if (frames) cp(path.join(SITE, 'frames'), path.join(dest, 'content', 'frames'));
}
const html = (title, script, extraHead = '') => `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="style.css">${extraHead}</head>\n<body><div id="root"></div><script src="${script}"></script></body></html>\n`;
async function bundle(entry, out, platform = 'browser') {
  await esbuild.build({ entryPoints: [entry], outfile: out, bundle: true, format: 'iife', target: ['es2020'], platform, minify: false, sourcemap: false, legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' }, external: ['premierepro', 'aftereffects', 'uxp', 'os', 'fs', 'electron'], logLevel: 'warning' });
}

for (const h of which) {
  const D = path.join(ROOT, 'dist', h); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
  if (h === 'web') {
    await bundle(path.join(ROOT, 'hosts/web/host.js'), path.join(D, 'app.js'));
    cp(path.join(ROOT, 'ui/style.css'), path.join(D, 'style.css'));
    fs.writeFileSync(path.join(D, 'index.html'), html('Colored Lens', 'app.js'));
    copyContent(D, { frames: false });
  }
  if (h === 'premiere') {
    await bundle(path.join(ROOT, 'hosts/premiere/host.js'), path.join(D, 'app.js'));
    cp(path.join(ROOT, 'ui/style.css'), path.join(D, 'style.css'));
    fs.writeFileSync(path.join(D, 'index.html'), html('Colored Lens', 'app.js'));
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'hosts/premiere/manifest.json'), 'utf8'));
    man.version = pkg.version; man.id = cfg.ids.premierePlugin;
    fs.writeFileSync(path.join(D, 'manifest.json'), JSON.stringify(man, null, 2));
    cp(path.join(ROOT, 'hosts/premiere/icons'), path.join(D, 'icons'));
    copyContent(D);
  }
  if (h === 'aftereffects') { // a sibling UXP plugin for After Effects 2027+, same panel, its own host adapter
    await bundle(path.join(ROOT, 'hosts/aftereffects/host.js'), path.join(D, 'app.js'));
    cp(path.join(ROOT, 'ui/style.css'), path.join(D, 'style.css'));
    fs.writeFileSync(path.join(D, 'index.html'), html('Colored Lens', 'app.js'));
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'hosts/aftereffects/manifest.json'), 'utf8'));
    man.version = pkg.version; man.id = cfg.ids.aePlugin;
    fs.writeFileSync(path.join(D, 'manifest.json'), JSON.stringify(man, null, 2));
    cp(path.join(ROOT, 'hosts/premiere/icons'), path.join(D, 'icons'));
    copyContent(D);
  }
  if (h === 'resolve') {
    const P = path.join(D, cfg.ids.resolvePlugin);
    await bundle(path.join(ROOT, 'hosts/resolve/renderer.js'), path.join(P, 'app.js'));
    for (const f of ['main.js', 'preload.js', 'package.json']) cp(path.join(ROOT, 'hosts/resolve', f), path.join(P, f));
    const mx = fs.readFileSync(path.join(ROOT, 'hosts/resolve/manifest.xml'), 'utf8').replace(/__VERSION__/g, pkg.version).replace(/__ID__/g, cfg.ids.resolvePlugin);
    fs.writeFileSync(path.join(P, 'manifest.xml'), mx);
    const pj = JSON.parse(fs.readFileSync(path.join(P, 'package.json'), 'utf8')); pj.version = pkg.version; fs.writeFileSync(path.join(P, 'package.json'), JSON.stringify(pj, null, 2));
    cp(path.join(ROOT, 'ui/style.css'), path.join(P, 'style.css'));
    fs.writeFileSync(path.join(P, 'index.html'), html('Colored Lens', 'app.js', `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data: ${cfg.pagesBase} https://github.com https://objects.githubusercontent.com; img-src * data:">`));
    copyContent(P);
  }
  console.log(`built dist/${h}`);
}
