// preview.js — detect, run, and manage live previews of a project's app or website.
//
// Two kinds of project are launchable:
//   • "server"  — package.json has a dev/start/serve script (Vite, Next, CRA, Express…).
//                 We spawn the dev command, watch its output for the first localhost URL
//                 it prints, then hand that URL back so the launcher can open it.
//   • "static"  — a folder with an index.html and no dev script. We spin up a tiny built-in
//                 HTTP server rooted at that folder (so fetch / ES-modules / routing all work,
//                 unlike a raw file://) and hand back http://localhost:PORT.
//
// Everything we start is tracked in `running` and torn down on stopAll() (called at quit).

const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');

// Emits:
//   'change'              — the running registry changed (start/stop/exit). Payload: none.
//   'ready' {projectPath, url, name, target}  — a preview now has a URL ready to open.
//   'log'   {projectPath} — new output captured (registry entry's logTail updated).
const bus = new EventEmitter();

// projectPath -> { projectPath, name, type, status, url, port, server?, child?, startedAt, logTail, target }
const running = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.map': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.xml': 'application/xml',
};

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function detectPackageManager(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun';
  return 'npm';
}

// Directories that never contain the user's launchable app.
const SKIP_DIRS = new Set(['node_modules', 'vendor', 'venv', '.venv', '__pycache__', 'coverage', 'tmp', 'temp']);

// Walk the project (breadth-first, shallow-wins) looking for anything launchable:
//   • a package.json with a dev/start/serve/preview script  → "server" app, cwd = that folder
//   • an index.html anywhere                                 → "static" site, served from its folder
//   • failing both, ANY *.html file                          → "static", served from its folder
// Depth-limited and junk-dir-pruned so it stays cheap even on big repos.
function scanLaunchable(projectPath, maxDepth = 3) {
  let server = null, index = null, anyHtml = null;
  const queue = [{ dir: projectPath, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
        if (depth < maxDepth) queue.push({ dir: path.join(dir, e.name), depth: depth + 1 });
        continue;
      }
      if (!e.isFile()) continue;
      if (e.name === 'package.json' && !server) {
        const pkg = readJSON(path.join(dir, 'package.json'));
        const scripts = (pkg && pkg.scripts) || {};
        const scriptName = ['dev', 'start', 'serve', 'preview'].find((s) => scripts[s]);
        if (scriptName) server = { dir, scriptName, depth };
      } else if (/^index\.html?$/i.test(e.name)) {
        if (!index) index = { dir, file: e.name, depth };
      } else if (/\.html?$/i.test(e.name)) {
        if (!anyHtml) anyHtml = { dir, file: e.name, depth };
      }
    }
    // BFS is shallowest-first — once a server app is found nothing deeper can outrank it
    if (server) break;
  }
  return { server, index, anyHtml };
}

// Profile used to decide whether to show a Launch button (and what it runs).
// Shallower wins (a root index.html is the project's face, not a nested tool);
// at equal depth a dev-server app outranks a static page.
function detect(projectPath) {
  try {
    const { server, index, anyHtml } = scanLaunchable(projectPath);
    if (server && index && index.depth < server.depth) {
      return { launchable: true, type: 'static', label: 'Launch site', dir: index.dir, file: index.file };
    }
    if (server) {
      const pm = detectPackageManager(server.dir);
      const runner = pm === 'npm' ? 'npm run' : pm === 'yarn' ? 'yarn' : pm === 'bun' ? 'bun run' : 'pnpm';
      return {
        launchable: true,
        type: 'server',
        label: 'Launch app',
        script: server.scriptName,
        cwd: server.dir,
        command: `${runner} ${server.scriptName}`,
      };
    }
    const stat = index || anyHtml;
    if (stat) {
      return { launchable: true, type: 'static', label: 'Launch site', dir: stat.dir, file: stat.file };
    }
  } catch {}
  return { launchable: false };
}

// A page's real name: its <title> tag (first 4KB is plenty — titles live in <head>).
function htmlTitle(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const m = buf.toString('utf8', 0, n).match(/<title[^>]*>([^<]{1,80})/i);
    if (m) return m[1].replace(/\s+/g, ' ').trim();
  } catch {}
  return '';
}

// Every launchable thing in the project, not just the best one — feeds the
// per-project "launchables" subtree in the projects list. Each item gets a
// stable id (path relative to the project root) so the renderer can ask to
// launch that exact file/app later. Labels are friendly names — the page's
// <title> or the package's name — never raw paths (those ride along as id).
function detectAll(projectPath, maxDepth = 3, maxItems = 12) {
  const out = [];
  const queue = [{ dir: projectPath, depth: 0 }];
  try {
    while (queue.length && out.length < maxItems) {
      const { dir, depth } = queue.shift();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (out.length >= maxItems) break;
        if (e.isDirectory()) {
          if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
          if (depth < maxDepth) queue.push({ dir: path.join(dir, e.name), depth: depth + 1 });
          continue;
        }
        if (!e.isFile()) continue;
        const rel = path.relative(projectPath, path.join(dir, e.name)).split(path.sep).join('/');
        if (e.name === 'package.json') {
          const pkg = readJSON(path.join(dir, 'package.json'));
          const scripts = (pkg && pkg.scripts) || {};
          const scriptName = ['dev', 'start', 'serve', 'preview'].find((s) => scripts[s]);
          if (scriptName) {
            const pm = detectPackageManager(dir);
            const runner = pm === 'npm' ? 'npm run' : pm === 'yarn' ? 'yarn' : pm === 'bun' ? 'bun run' : 'pnpm';
            const nice = (pkg && pkg.name) || path.basename(dir === projectPath ? projectPath : dir);
            out.push({
              id: `${rel}#${scriptName}`, kind: 'server', label: nice,
              dir, script: scriptName, command: `${runner} ${scriptName}`,
            });
          }
        } else if (/\.html?$/i.test(e.name)) {
          const title = htmlTitle(path.join(dir, e.name));
          out.push({ id: rel, kind: 'static', label: title || e.name, dir, file: e.name });
        }
      }
    }
  } catch {}
  return out; // BFS — shallowest (most likely the project's face) first
}

// Resolve a detectAll() id back to a launch profile. Returns null if the
// file/script has since disappeared.
function profileFor(projectPath, entryId) {
  const it = detectAll(projectPath).find((i) => i.id === entryId);
  if (!it) return null;
  if (it.kind === 'server') {
    return { launchable: true, type: 'server', label: 'Launch app', script: it.script, cwd: it.dir, command: it.command };
  }
  return { launchable: true, type: 'static', label: 'Launch site', dir: it.dir, file: it.file };
}

// The id detect()/profileFor() would give this profile — lets the renderer
// match a running preview back to its row in the launchables subtree.
function idOf(projectPath, prof) {
  try {
    if (prof.type === 'server') {
      const rel = path.relative(projectPath, path.join(prof.cwd, 'package.json')).split(path.sep).join('/');
      return `${rel}#${prof.script}`;
    }
    return path.relative(projectPath, path.join(prof.dir, prof.file)).split(path.sep).join('/');
  } catch { return ''; }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function publicInfo(e) {
  if (!e) return null;
  return {
    projectPath: e.projectPath, name: e.name, type: e.type, status: e.status,
    url: e.url || '', port: e.port || 0, startedAt: e.startedAt, command: e.command || '',
    entryId: e.entryId || '',
  };
}

function snapshot() {
  const out = {};
  for (const [k, e] of running) out[k] = publicInfo(e);
  return out;
}

function appendLog(e, chunk) {
  e.logTail = (e.logTail + chunk).slice(-8000);
  bus.emit('log', { projectPath: e.projectPath });
}

const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/[\w\-./?%&=#]*)?)/i;
function extractUrl(text) {
  const m = text.match(URL_RE);
  if (!m) return null;
  // 0.0.0.0 is an IPv4 wildcard listener — reach it via 127.0.0.1, not
  // `localhost` (which may resolve to ::1 and miss an IPv4-only socket).
  return m[1].replace('0.0.0.0', '127.0.0.1').replace(/[).,]+$/, '');
}

// ---- static site ----
async function startStatic(projectPath, name, prof, target, entryId) {
  const port = await freePort();
  const root = path.resolve(prof.dir);
  const server = http.createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/' + prof.file;
      let filePath = path.normalize(path.join(root, urlPath));
      // path-traversal guard — never escape the served root
      if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      let st; try { st = fs.statSync(filePath); } catch { st = null; }
      if (st && st.isDirectory()) { filePath = path.join(filePath, 'index.html'); try { st = fs.statSync(filePath); } catch { st = null; } }
      if (!st) {
        // SPA fallback: extension-less misses serve index.html so client routing works
        if (!path.extname(urlPath)) {
          filePath = path.join(root, prof.file);
          try { st = fs.statSync(filePath); } catch { st = null; }
        }
        if (!st) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404 Not Found'); return; }
      }
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500); res.end('500 ' + err.message);
    }
  });
  return new Promise((resolve) => {
    server.on('error', (err) => {
      running.delete(projectPath); bus.emit('change');
      resolve({ ok: false, error: err.message });
    });
    server.listen(port, '127.0.0.1', () => {
      // URL host must match the bind address: `localhost` resolves to ::1 AND
      // 127.0.0.1 on Windows, and the IPv6 attempt against an IPv4-only listener
      // flakes (empty-message AggregateError — seen live in test-preview).
      const url = `http://127.0.0.1:${port}/`;
      const entry = {
        projectPath, name, type: 'static', status: 'running', url, port, server,
        startedAt: Date.now(), logTail: `Serving ${root} on ${url}\n`, target,
        command: `static · ${path.basename(root)}`, entryId,
      };
      running.set(projectPath, entry);
      bus.emit('change');
      bus.emit('ready', { projectPath, url, name, target });
      resolve({ ok: true, ...publicInfo(entry) });
    });
  });
}

// ---- dev server ----
function startServer(projectPath, name, prof, target, entryId) {
  const env = { ...process.env, BROWSER: 'none', FORCE_COLOR: '1', npm_config_yes: 'true' };
  const cwd = prof.cwd || projectPath; // the dev command runs where its package.json lives
  let child;
  try {
    if (process.platform === 'win32') {
      child = spawn(prof.command, { cwd, env, shell: true, windowsHide: true });
    } else {
      // own process group so we can kill the whole tree later
      child = spawn('/bin/sh', ['-c', prof.command], { cwd, env, detached: true });
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const entry = {
    projectPath, name, type: 'server', status: 'starting', url: '', port: 0, child,
    startedAt: Date.now(), logTail: `$ ${prof.command}\n`, target, command: prof.command, opened: false, entryId,
  };
  running.set(projectPath, entry);
  bus.emit('change');

  const onData = (buf) => {
    const s = buf.toString();
    appendLog(entry, s);
    if (!entry.opened) {
      const url = extractUrl(entry.logTail);
      if (url) {
        entry.url = url; entry.status = 'running'; entry.opened = true;
        try { entry.port = Number(new URL(url).port) || 0; } catch {}
        bus.emit('change');
        bus.emit('ready', { projectPath, url, name, target });
      }
    }
  };
  if (child.stdout) child.stdout.on('data', onData);
  if (child.stderr) child.stderr.on('data', onData);

  child.on('error', (err) => { appendLog(entry, `\n[error] ${err.message}\n`); });
  child.on('exit', (code) => {
    appendLog(entry, `\n[process exited with code ${code}]\n`);
    // a swap may have already installed a replacement entry under this path —
    // only clear the registry if it's still ours, or the new preview goes untracked
    if (running.get(projectPath) === entry) {
      running.delete(projectPath);
      bus.emit('change');
    }
  });

  // If no URL appears within 30s, the app is running but we couldn't detect a URL.
  setTimeout(() => {
    if (running.get(projectPath) === entry && !entry.opened) {
      entry.status = 'running-nourl';
      bus.emit('change');
    }
  }, 30000);

  return { ok: true, ...publicInfo(entry) };
}

async function launch(projectPath, name, target, entryId) {
  const existing = running.get(projectPath);
  // same entry (or none asked for) → just hand back the running one
  if (existing && (!entryId || existing.entryId === entryId)) {
    return { ok: true, already: true, ...publicInfo(existing) };
  }
  // resolve the new target BEFORE stopping anything — a stale id must not
  // kill a healthy running preview just to report an error
  const prof = entryId ? profileFor(projectPath, entryId) : detect(projectPath);
  if (!prof) return { ok: false, error: 'That file is no longer in the project.' };
  if (!prof.launchable) return { ok: false, error: 'No app or website detected in this project.' };
  if (existing) stop(projectPath); // switching to a different launchable in the same project
  const id = entryId || idOf(projectPath, prof);
  if (prof.type === 'static') return startStatic(projectPath, name, prof, target, id);
  return startServer(projectPath, name, prof, target, id);
}

function stop(projectPath) {
  const e = running.get(projectPath);
  if (!e) return { ok: true, notRunning: true };
  try { if (e.server) e.server.close(); } catch {}
  try {
    if (e.child && e.child.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(e.child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        try { process.kill(-e.child.pid, 'SIGTERM'); } catch { try { e.child.kill('SIGTERM'); } catch {} }
      }
    }
  } catch {}
  running.delete(projectPath);
  bus.emit('change');
  return { ok: true };
}

function stopAll() {
  for (const k of [...running.keys()]) stop(k);
}

function get(projectPath) { return publicInfo(running.get(projectPath)); }
function logTail(projectPath) { const e = running.get(projectPath); return e ? e.logTail : ''; }

module.exports = { bus, detect, detectAll, launch, stop, stopAll, snapshot, get, logTail };
