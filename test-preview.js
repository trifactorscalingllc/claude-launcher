// End-to-end test for preview.js — run with: node test-preview.js
// Builds throwaway projects in TEMP, then proves detect() finds them and
// launch() actually serves real bytes over HTTP.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const preview = require('./preview');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-preview-test-'));
let failures = 0;

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}
function check(label, cond, extra) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}${extra ? ' — ' + extra : ''}`); }
}
function mk(rel, content) {
  const f = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

async function testNestedHtmlNoIndex() {
  console.log('\n[1] nested page.html (no index.html, depth 2)');
  const proj = path.join(tmp, 'p1');
  mk('p1/site/pages/page.html', '<h1>hello-from-nested-page</h1>');
  mk('p1/README.md', 'not html');
  const d = preview.detect(proj);
  check('detected as static', d.launchable && d.type === 'static', JSON.stringify(d));
  const r = await preview.launch(proj, 'p1', 'window');
  check('launch ok', r.ok, r.error);
  const res = await get(r.url);
  check('served 200 with content', res.status === 200 && res.body.includes('hello-from-nested-page'), `status=${res.status}`);
  preview.stop(proj);
}

async function testNestedIndexBeatsOtherHtml() {
  console.log('\n[2] nested index.html preferred over other html');
  const proj = path.join(tmp, 'p2');
  mk('p2/docs/aaa.html', '<h1>wrong</h1>');
  mk('p2/web/index.html', '<h1>right-index</h1>');
  const d = preview.detect(proj);
  check('picked index.html', d.file && /^index\.html$/i.test(d.file), JSON.stringify(d));
  const r = await preview.launch(proj, 'p2', 'window');
  const res = await get(r.url);
  check('serves the index', res.status === 200 && res.body.includes('right-index'), res.body.slice(0, 60));
  preview.stop(proj);
}

async function testNestedDevServer() {
  console.log('\n[3] nested package.json dev script (depth 1) actually boots');
  const proj = path.join(tmp, 'p3');
  mk('p3/app/server.js', `
    const http = require('http');
    const s = http.createServer((req, res) => res.end('hello-from-dev-server'));
    s.listen(0, '127.0.0.1', () => console.log('Listening on http://localhost:' + s.address().port + '/'));
  `);
  mk('p3/app/package.json', JSON.stringify({ name: 'p3app', scripts: { dev: 'node server.js' } }));
  const d = preview.detect(proj);
  check('detected as server with nested cwd', d.launchable && d.type === 'server' && d.cwd && d.cwd.endsWith('app'), JSON.stringify(d));
  const ready = new Promise((resolve) => preview.bus.once('ready', resolve));
  const r = preview.launch(proj, 'p3', 'window');
  const ev = await Promise.race([ready, new Promise((res) => setTimeout(() => res(null), 20000))]);
  check('dev server URL captured', !!(ev && ev.url), 'no ready event in 20s');
  if (ev && ev.url) {
    const res = await get(ev.url);
    check('dev server responds', res.status === 200 && res.body.includes('hello-from-dev-server'), res.body.slice(0, 60));
  }
  const info = preview.get(proj);
  check('default server launch carries entryId', !!info && info.entryId === 'app/package.json#dev', info && info.entryId);
  preview.stop(proj);
}

async function testRootIndexBeatsNestedApp() {
  console.log('\n[4] root index.html outranks a deeper dev app');
  const proj = path.join(tmp, 'p4');
  mk('p4/index.html', '<h1>root-site</h1>');
  mk('p4/tools/gen/package.json', JSON.stringify({ scripts: { start: 'node x.js' } }));
  const d = preview.detect(proj);
  check('root static wins', d.type === 'static' && d.dir === proj, JSON.stringify(d));
}

async function testNotLaunchable() {
  console.log('\n[5] plain folder is not launchable');
  const proj = path.join(tmp, 'p5');
  mk('p5/notes.txt', 'nothing here');
  const d = preview.detect(proj);
  check('not launchable', !d.launchable, JSON.stringify(d));
}

async function testDetectAllInventory() {
  console.log('\n[6] detectAll: inventory, skip-dirs, depth cap, BFS order');
  const proj = path.join(tmp, 'p6');
  mk('p6/index.html', '<html><head><title>  My Root\n Site </title></head><h1>root</h1></html>');
  mk('p6/docs/extra.html', '<h1>extra</h1>');
  mk('p6/app/package.json', JSON.stringify({ name: 'sidecar-app', scripts: { dev: 'node server.js' } }));
  mk('p6/tools/package.json', JSON.stringify({ scripts: { build: 'tsc' } }));
  mk('p6/node_modules/pkg/index.html', '<h1>junk</h1>');
  mk('p6/.cache/index.html', '<h1>hidden</h1>');
  mk('p6/a/b/c/d/deep.html', '<h1>too deep</h1>');
  const ids = preview.detectAll(proj).map((i) => i.id);
  check('finds root index.html', ids.includes('index.html'), ids.join(' '));
  check('finds nested html', ids.includes('docs/extra.html'), ids.join(' '));
  check('finds nested dev script with #script id', ids.includes('app/package.json#dev'), ids.join(' '));
  check('skips package.json with no dev/start/serve/preview', !ids.includes('tools/package.json#build'), ids.join(' '));
  check('prunes node_modules + dot-dirs', !ids.some((i) => i.includes('node_modules') || i.includes('.cache')), ids.join(' '));
  check('respects maxDepth (depth-4 file invisible)', !ids.some((i) => i.endsWith('deep.html')), ids.join(' '));
  check('BFS: root entry first', ids[0] === 'index.html', ids.join(' '));
  const items = preview.detectAll(proj);
  const idx = items.find((i) => i.id === 'index.html');
  check('html label is its <title>, whitespace collapsed', idx && idx.label === 'My Root Site', JSON.stringify(idx));
  const extra = items.find((i) => i.id === 'docs/extra.html');
  check('no <title> falls back to file name', extra && extra.label === 'extra.html', JSON.stringify(extra));
  const srv = items.find((i) => i.id === 'app/package.json#dev');
  check('server label is the package name', srv && srv.label === 'sidecar-app', JSON.stringify(srv));
}

async function testDetectAllCaps() {
  console.log('\n[7] detectAll: maxItems cap and missing folder');
  const proj = path.join(tmp, 'p7');
  for (let i = 0; i < 20; i++) mk(`p7/page-${String(i).padStart(2, '0')}.html`, '<h1>x</h1>');
  check('caps at 12 items', preview.detectAll(proj).length === 12, String(preview.detectAll(proj).length));
  check('honors a custom cap', preview.detectAll(proj, 3, 5).length === 5);
  check('nonexistent folder gives []', preview.detectAll(path.join(tmp, 'no-such')).length === 0);
}

async function testEntryLaunchSwapAndStale() {
  console.log('\n[8] launch(entryId): exact file, already, swap, stale id');
  const proj = path.join(tmp, 'p8');
  mk('p8/one.html', '<h1>page-one</h1>');
  mk('p8/two.html', '<h1>page-two</h1>');
  const r1 = await preview.launch(proj, 'p8', 'window', 'two.html');
  check('entry launch ok, entryId echoed', r1.ok && r1.entryId === 'two.html', JSON.stringify(r1));
  let res = await get(r1.url);
  check('serves the chosen file at /', res.status === 200 && res.body.includes('page-two'), res.body.slice(0, 60));
  const r2 = await preview.launch(proj, 'p8', 'window', 'two.html');
  check('same entry returns already', r2.ok && r2.already === true, JSON.stringify(r2));
  const r3 = await preview.launch(proj, 'p8', 'window', '');
  check('no entryId while running returns already (no restart)', r3.ok && r3.already === true && r3.entryId === 'two.html', JSON.stringify(r3));
  const r4 = await preview.launch(proj, 'p8', 'window', 'one.html');
  check('different entry swaps the preview', r4.ok && !r4.already && r4.entryId === 'one.html', JSON.stringify(r4));
  res = await get(r4.url);
  check('swapped preview serves the new file', res.status === 200 && res.body.includes('page-one'), res.body.slice(0, 60));
  check('registry holds exactly one entry for the project', Object.keys(preview.snapshot()).filter((k) => k === proj).length === 1);
  const r5 = await preview.launch(proj, 'p8', 'window', 'gone.html');
  check('stale entryId gives friendly error', !r5.ok && /no longer in the project/.test(r5.error || ''), JSON.stringify(r5));
  const after = preview.get(proj);
  check('stale entryId did NOT kill the running preview', !!after && after.entryId === 'one.html', JSON.stringify(after));
  preview.stop(proj);
}

async function testServerEntryLaunch() {
  console.log('\n[9] server entry: profileFor server branch boots the right app');
  const proj = path.join(tmp, 'p9');
  mk('p9/app/server.js', `
    const http = require('http');
    const s = http.createServer((req, res) => res.end('hello-from-entry-server'));
    s.listen(0, '127.0.0.1', () => console.log('Listening on http://localhost:' + s.address().port + '/'));
  `);
  mk('p9/app/package.json', JSON.stringify({ name: 'p9app', scripts: { dev: 'node server.js' } }));
  const ready = new Promise((resolve) => preview.bus.once('ready', resolve));
  const r = await preview.launch(proj, 'p9', 'window', 'app/package.json#dev');
  check('entry server launch starts with entryId', r.ok && r.entryId === 'app/package.json#dev', JSON.stringify(r));
  const ev = await Promise.race([ready, new Promise((res) => setTimeout(() => res(null), 20000))]);
  check('entry server URL captured', !!(ev && ev.url), 'no ready event in 20s');
  if (ev && ev.url) {
    const res = await get(ev.url);
    check('entry server responds', res.status === 200 && res.body.includes('hello-from-entry-server'), res.body.slice(0, 60));
  }
  preview.stop(proj);
}

async function testDefaultLaunchCarriesEntryId() {
  console.log('\n[10] default launch records the id detectAll would give it (idOf)');
  const proj = path.join(tmp, 'p10');
  mk('p10/web/index.html', '<h1>p10</h1>');
  const r = await preview.launch(proj, 'p10', 'window');
  check('static default launch carries entryId', r.ok && r.entryId === 'web/index.html', JSON.stringify(r));
  check('entryId matches a detectAll id', preview.detectAll(proj).some((i) => i.id === r.entryId));
  preview.stop(proj);
}

(async () => {
  try {
    await testNestedHtmlNoIndex();
    await testNestedIndexBeatsOtherHtml();
    await testNestedDevServer();
    await testRootIndexBeatsNestedApp();
    await testNotLaunchable();
    await testDetectAllInventory();
    await testDetectAllCaps();
    await testEntryLaunchSwapAndStale();
    await testServerEntryLaunch();
    await testDefaultLaunchCarriesEntryId();
  } catch (e) {
    failures++;
    console.log('  FAIL  unexpected error — ' + e.message);
  } finally {
    preview.stopAll();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL TESTS PASSED');
  process.exit(failures ? 1 : 0);
})();
