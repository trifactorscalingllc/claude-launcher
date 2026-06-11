// Tests for transcript.js — session .jsonl parsing + Markdown export.
// Run: node test-transcript.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseTranscript, transcriptToMarkdown } = require('./transcript');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ', name); }
  else { fail++; console.log('  FAIL ', name, extra !== undefined ? `(got ${JSON.stringify(extra)})` : ''); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-md-'));
const file = path.join(tmp, 'sess.jsonl');
const T0 = Date.parse('2026-06-10T15:30:00.000Z');
const iso = (s) => new Date(T0 + s * 1000).toISOString();
const big = 'x'.repeat(9000); // beyond the 6000-char viewer cap

const lines = [
  JSON.stringify({ type: 'ai-title', aiTitle: 'Fix the flux capacitor', sessionId: 'sess-1' }),
  JSON.stringify({ type: 'user', cwd: 'C:\\projects\\timemachine', sessionId: 'sess-1', timestamp: iso(0), message: { role: 'user', content: 'please fix it' } }),
  JSON.stringify({ type: 'assistant', sessionId: 'sess-1', timestamp: iso(10), message: { role: 'assistant', content: [
    { type: 'thinking', thinking: 'hmm\nlet me think' },
    { type: 'text', text: 'On it. ' + big },
    { type: 'tool_use', name: 'Edit', input: { file_path: 'C:\\projects\\timemachine\\flux.js' } },
  ] } }),
  JSON.stringify({ type: 'user', sessionId: 'sess-1', timestamp: iso(20), message: { role: 'user', content: [
    { type: 'tool_result', content: 'a result with ``` fences inside\nline2', is_error: false },
  ] } }),
  JSON.stringify({ type: 'assistant', sessionId: 'sess-1', timestamp: iso(30), message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } }),
];
fs.writeFileSync(file, lines.join('\n') + '\n');

(async () => {
  console.log('[1] viewer parse (display caps apply)');
  const v = await parseTranscript(file);
  check('4 messages parsed', v.messages.length === 4, v.messages.length);
  check('title picked up', v.title === 'Fix the flux capacitor', v.title);
  check('project from cwd', v.project === 'C:\\projects\\timemachine', v.project);
  check('viewer text capped at 6000', v.messages[1].blocks.find((b) => b.kind === 'text').text.length === 6000);

  console.log('[2] markdown export (no caps — it is a file)');
  const d = await parseTranscript(file, { maxMessages: Infinity, textCap: Infinity, resultCap: Infinity, thinkCap: Infinity });
  d.sessionId = 'sess-1';
  const { markdown, suggestedName } = transcriptToMarkdown(d, { thinking: false });
  check('full text not capped', markdown.includes(big));
  check('header has project + title', markdown.startsWith('# timemachine — Fix the flux capacitor'));
  check('meta line has session + count', markdown.includes('session `sess-1`') && markdown.includes('4 messages'));
  check('You / Claude headings present', markdown.includes('### You') && markdown.includes('### Claude'));
  check('tool block rendered', markdown.includes('`tool: Edit` — C:\\projects\\timemachine\\flux.js'));
  check('result fenced with 4 backticks (``` inside survives)', markdown.includes('````\na result with ``` fences inside\nline2\n````'));
  check('thinking excluded by default', !markdown.includes('_thinking_'));
  const withThink = transcriptToMarkdown(d, { thinking: true }).markdown;
  check('thinking included as blockquote when asked', withThink.includes('> _thinking_') && withThink.includes('> hmm'));
  check('suggestedName pattern', /^timemachine-\d{4}-\d{2}-\d{2}-sess-1\.md$/.test(suggestedName), suggestedName);

  console.log('[3] edge cases');
  const missing = await parseTranscript(path.join(tmp, 'nope.jsonl'));
  check('missing file → error, empty messages', !!missing.error && missing.messages.length === 0);
  const emptyFile = path.join(tmp, 'empty.jsonl');
  fs.writeFileSync(emptyFile, JSON.stringify({ type: 'mode', sessionId: 'x' }) + '\n');
  const empty = await parseTranscript(emptyFile);
  check('no readable messages → empty list, no error', !empty.error && empty.messages.length === 0);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fail === 0 ? '\nALL TRANSCRIPT TESTS PASSED' : `\n${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})();
