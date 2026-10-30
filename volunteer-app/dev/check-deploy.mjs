#!/usr/bin/env node
/**
 * Checks that the code will deploy, before merging into main (e.g. after a design update from
 * Lovable). Runs what the two GitHub workflows rely on, without the internet:
 *
 *   cd volunteer-app && node dev/check-deploy.mjs
 *
 * Website (volunteer-app-pages.yml): the offline-cache stamp in sw.js, the environment and Apps
 * Script URL placeholders in js/config.js, every file index.html and sw.js refer to, and every
 * class name the code uses being in the committed styles.css (deployed if the Tailwind build fails).
 * Backend (volunteer-app-gas.yml): every .gs file parses, no syntax Apps Script may not support,
 * appsscript.json is valid, and the tests pass (npm test).
 * Prints "ready to deploy" or what to fix, and exits 1 if anything needs fixing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import vm from 'node:vm';

const problems = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { problems.push(msg); console.log(`  ✗ ${msg}`); };
const read = (p) => fs.readFileSync(p, 'utf8');
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
});

console.log('Website (GitHub Pages)');
const sw = read('web/sw.js');
sw.includes('__BUILD__') ? ok('sw.js has the __BUILD__ stamp for a fresh offline cache') : bad('web/sw.js: __BUILD__ is missing, so phones may keep an old version');
const config = read('web/js/config.js');
/^const APP_ENVIRONMENT = '[A-Za-z]*';/m.test(config) ? ok('config.js: APP_ENVIRONMENT line') : bad("web/js/config.js: the line const APP_ENVIRONMENT = '…'; is missing or changed");
for (const ph of ['PASTE_EXP_DEPLOYMENT_ID', 'PASTE_PROD_DEPLOYMENT_ID']) {
  config.includes(`https://script.google.com/macros/s/${ph}/exec`) ? ok(`config.js: ${ph} placeholder`) : bad(`web/js/config.js: the ${ph} placeholder URL is missing, so the deploy can't set the Apps Script URL`);
}
const html = read('web/index.html');
const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1])
  .concat([...sw.matchAll(/['"]\.\/([^'"]+)['"]/g)].map((m) => m[1]))
  .filter((r) => r && r !== '/' && !/^https?:/.test(r));
const missing = refs.filter((r) => !fs.existsSync(path.join('web', r.replace(/^\.\//, ''))));
missing.length ? bad(`files referenced but missing: ${missing.join(', ')}`) : ok(`all ${refs.length} files referenced by index.html and sw.js exist`);
const css = read('web/styles.css');
const esc = (c) => `.${c.replace(/([:[\].\/%#()!,&>+~*'])/g, '\\$1')}`;
const code = walk('web/js', '.js').concat(walk('web/admin', '.js'), ['web/index.html']).map(read).join('\n');
const classes = new Set();
for (const m of code.matchAll(/class(?:Name)?\s*[:=]\s*['"]([^'"$]+)['"]/g)) m[1].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
const NOT_STYLES = new Set(['light', 'dark', 'active', 'hidden-by-js']);
const unstyled = [...classes].filter((c) => /^[a-z!\[-]/.test(c) && !NOT_STYLES.has(c) && !css.includes(esc(c)) && !css.includes(`.${c}`));
unstyled.length ? bad(`class names used but not in web/styles.css (run npm run build:css): ${unstyled.slice(0, 20).join(' ')}`) : ok(`all ${classes.size} class names used are in styles.css`);

console.log('Backend (Apps Script)');
const gas = fs.readdirSync('gas').filter((f) => f.endsWith('.gs')).sort();
let parsed = 0;
for (const f of gas) {
  const src = read(path.join('gas', f));
  try { new vm.Script(src, { filename: f }); parsed += 1; } catch (e) { bad(`gas/${f} does not parse: ${e.message}`); }
  if (/\?\.|\?\?(?!=)/.test(src.replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'|`[^`]*`|"[^"\n]*"/g, ''))) bad(`gas/${f}: uses ?. or ?? (keep to syntax Apps Script runs everywhere)`);
}
parsed === gas.length && ok(`all ${gas.length} .gs files parse (clasp pushes ${fs.readdirSync('gas').length} files)`);
try {
  const manifest = JSON.parse(read('gas/appsscript.json'));
  manifest.runtimeVersion === 'V8' ? ok('appsscript.json: V8 runtime') : bad('gas/appsscript.json: runtimeVersion must be V8');
  (manifest.webapp && manifest.webapp.access === 'ANYONE_ANONYMOUS') ? ok('appsscript.json: web app open to anyone (volunteers don\'t sign in to Google)') : bad('gas/appsscript.json: webapp.access should be ANYONE_ANONYMOUS');
} catch (e) { bad(`gas/appsscript.json is not valid JSON: ${e.message}`); }
try {
  const out = execSync('npm test 2>&1', { encoding: 'utf8' });
  const pass = (/# pass (\d+)/.exec(out) || [])[1];
  ok(`npm test: ${pass} passing`);
} catch (e) {
  bad(`npm test fails: ${((e.stdout || '').match(/not ok .*$/m) || ['see npm test'])[0]}`);
}

console.log(problems.length ? `\n${problems.length} thing(s) to fix before merging into main.` : '\nready to deploy');
process.exit(problems.length ? 1 : 0);
