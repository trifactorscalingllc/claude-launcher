// Transcript parsing + Markdown export, shared by main.js IPC handlers and
// the test suite (plain Node, no Electron deps).

const fsp = require('fs').promises;

function summarizeToolInput(b) {
  const i = b.input || {};
  if (i.file_path) return i.file_path;
  if (i.path) return i.path;
  if (i.command) return String(i.command).replace(/\s+/g, ' ').slice(0, 140);
  if (i.pattern) return String(i.pattern).slice(0, 100);
  if (i.query) return String(i.query).slice(0, 100);
  if (i.url) return String(i.url).slice(0, 120);
  if (i.description) return String(i.description).slice(0, 120);
  const s = JSON.stringify(i);
  return s.length > 2 ? s.slice(0, 120) : '';
}

function resultText(b) {
  const c = b.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (x && x.text) || '').join('\n');
  return '';
}

// Parse a session .jsonl into { messages, title, project, truncated }. The
// viewer uses display caps; the Markdown export passes Infinity (it's a file).
async function parseTranscript(file, caps) {
  const { maxMessages = 2000, textCap = 6000, resultCap = 2000, thinkCap = 4000 } = caps || {};
  let content;
  try { content = await fsp.readFile(file, 'utf8'); } catch (err) { return { error: err.message, messages: [] }; }

  const messages = [];
  let title = '';
  let project = '';
  let truncated = false;

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (o.aiTitle && !title) title = o.aiTitle;
    if (o.cwd && !project) project = o.cwd;
    if (o.type !== 'user' && o.type !== 'assistant') continue;
    const ts = o.timestamp ? Date.parse(o.timestamp) : 0;
    const c = o.message && o.message.content;
    const blocks = [];
    if (typeof c === 'string') {
      if (c.trim()) blocks.push({ kind: 'text', text: c.slice(0, textCap) });
    } else if (Array.isArray(c)) {
      for (const b of c) {
        if (!b) continue;
        if (b.type === 'text' && b.text && b.text.trim()) blocks.push({ kind: 'text', text: b.text.slice(0, textCap) });
        else if (b.type === 'tool_use') blocks.push({ kind: 'tool', name: b.name, summary: summarizeToolInput(b) });
        else if (b.type === 'tool_result') { const t = resultText(b).trim(); if (t) blocks.push({ kind: 'result', text: t.slice(0, resultCap), error: !!b.is_error, truncated: t.length > resultCap }); }
        else if (b.type === 'thinking' && b.thinking && b.thinking.trim()) blocks.push({ kind: 'thinking', text: b.thinking.slice(0, thinkCap) });
      }
    }
    if (!blocks.length) continue;
    messages.push({ role: o.type, ts, blocks });
    if (messages.length >= maxMessages) { truncated = true; break; }
  }

  return { messages, title, project, truncated, error: null };
}

const mdPad2 = (n) => String(n).padStart(2, '0');

// Serialize a parsed transcript to Markdown. Returns { markdown, suggestedName }.
function transcriptToMarkdown(d, opts) {
  const { thinking = false } = opts || {};
  const projName = (d.project || '').split(/[\\/]/).pop() || 'session';
  const firstTs = (d.messages.find((m) => m.ts) || {}).ts || Date.now();
  const dt = new Date(firstTs);
  const dateStr = `${dt.getFullYear()}-${mdPad2(dt.getMonth() + 1)}-${mdPad2(dt.getDate())}`;
  const lines = [];
  lines.push(`# ${projName} — ${d.title || 'Claude Code session'}`);
  lines.push('');
  lines.push(`> ${dateStr}${d.sessionId ? ` · session \`${d.sessionId}\`` : ''} · ${d.messages.length} messages`);
  for (const m of d.messages) {
    const when = m.ts ? new Date(m.ts).toLocaleString() : '';
    lines.push('', `### ${m.role === 'user' ? 'You' : 'Claude'}${when ? ` — ${when}` : ''}`);
    for (const b of m.blocks) {
      if (b.kind === 'text') lines.push('', b.text);
      else if (b.kind === 'thinking') { if (thinking) lines.push('', '> _thinking_', ...b.text.split('\n').map((l) => `> ${l}`)); }
      else if (b.kind === 'tool') lines.push('', `\`tool: ${b.name}\`${b.summary ? ` — ${b.summary}` : ''}`);
      // 4-backtick fence so result bodies containing ``` don't break out
      else if (b.kind === 'result') lines.push('', '````' + (b.error ? ' (error)' : ''), b.text + (b.truncated ? '\n…' : ''), '````');
    }
  }
  lines.push('');
  const short = (d.sessionId || '').slice(0, 8) || 'session';
  const safeName = projName.replace(/[^\w.-]+/g, '-');
  return { markdown: lines.join('\n'), suggestedName: `${safeName}-${dateStr}-${short}.md` };
}

module.exports = { parseTranscript, transcriptToMarkdown, summarizeToolInput, resultText };
