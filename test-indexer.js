// Tests for the transcript indexer's dedup + accuracy logic.
// Claude Code writes one JSONL line per assistant content block (each repeating
// the same message id + usage), and continuation/fork session files replay the
// parent session's lines verbatim (same uuids). The indexer must count each
// line and each API call exactly once. Run: node test-indexer.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Indexer, dayKey } = require('./indexer');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ', name); }
  else { fail++; console.log('  FAIL ', name, extra !== undefined ? `(got ${JSON.stringify(extra)})` : ''); }
}
function approx(a, b) { return Math.abs(a - b) < 1e-9; }

// ---- fixture transcripts ----
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-idx-'));
const projDir = path.join(root, 'C--test-proj');
fs.mkdirSync(projDir);
const CWD = 'C:\\test\\proj';
const T0 = Date.parse('2026-06-10T10:00:00.000Z');
const iso = (offSec) => new Date(T0 + offSec * 1000).toISOString();

const usageA = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000 };
const usageB = { input_tokens: 10, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 500 };
const usageC = { input_tokens: 200, output_tokens: 80, cache_creation_input_tokens: 4000, cache_read_input_tokens: 9000 };
const usageD = { input_tokens: 40, output_tokens: 20, cache_creation_input_tokens: 300, cache_read_input_tokens: 700 };
const FABLE = 'claude-fable-5[1m]';
const SONNET = 'claude-sonnet-4-6';

const line = (uuid, offSec, type, msg, extra) => JSON.stringify({
  uuid, sessionId: extra && extra.sessionId, cwd: CWD, type,
  timestamp: iso(offSec), message: msg, ...(extra || {}),
});

// Session A: one user turn; msg_AAA logged as 3 lines (text + 2 tool blocks);
// a sidechain call msg_BBB; then a final main-chain msg_CCC.
// uuids mimic real v4s: random throughout, distinct from the first character.
const sessALines = (sid) => [
  line('1a2b3c4d-1111-4abc-9def-000000000001', 0, 'user', { role: 'user', content: 'hi' }, { sessionId: sid }),
  line('2b3c4d5e-2222-4abc-9def-000000000002', 10, 'assistant', { id: 'msg_01AAAAAAAAAAAAAAAAAAAAAAAA', model: FABLE, usage: usageA, stop_reason: 'tool_use', content: [{ type: 'text', text: 'working' }] }, { sessionId: sid }),
  line('3c4d5e6f-3333-4abc-9def-000000000003', 11, 'assistant', { id: 'msg_01AAAAAAAAAAAAAAAAAAAAAAAA', model: FABLE, usage: usageA, stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'C:\\test\\proj\\x.js' } }] }, { sessionId: sid }),
  line('4d5e6f7a-4444-4abc-9def-000000000004', 12, 'assistant', { id: 'msg_01AAAAAAAAAAAAAAAAAAAAAAAA', model: FABLE, usage: usageA, stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'mcp__srv__doit', input: {} }] }, { sessionId: sid }),
  line('5e6f7a8b-5555-4abc-9def-000000000005', 20, 'assistant', { id: 'msg_01BBBBBBBBBBBBBBBBBBBBBBBB', model: SONNET, usage: usageB, stop_reason: 'end_turn', content: [{ type: 'text', text: 'side' }] }, { sessionId: sid, isSidechain: true }),
  line('6f7a8b9c-6666-4abc-9def-000000000006', 30, 'user', { role: 'user', content: 'go on' }, { sessionId: sid }),
  line('7a8b9c0d-7777-4abc-9def-000000000007', 40, 'assistant', { id: 'msg_01CCCCCCCCCCCCCCCCCCCCCCCC', model: FABLE, usage: usageC, stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] }, { sessionId: sid }),
];
fs.writeFileSync(path.join(projDir, 'sess-a.jsonl'), sessALines('sess-a').join('\n') + '\n');

// Session B: a continuation — replays ALL of session A's lines verbatim (same
// uuids + message ids + ORIGINAL timestamps, but rewritten sessionId, exactly
// as Claude Code writes them), then adds one new turn (msg_DDD, 2 dup lines).
const sessB = [
  ...sessALines('sess-b'),
  line('8b9c0d1e-8888-4abc-9def-000000000008', 3600, 'user', { role: 'user', content: 'more' }, { sessionId: 'sess-b' }),
  line('9c0d1e2f-9999-4abc-9def-000000000009', 3610, 'assistant', { id: 'msg_01DDDDDDDDDDDDDDDDDDDDDDDD', model: FABLE, usage: usageD, stop_reason: 'end_turn', content: [{ type: 'text', text: 'tail' }] }, { sessionId: 'sess-b' }),
  line('0d1e2f3a-aaaa-4abc-9def-00000000000a', 3611, 'assistant', { id: 'msg_01DDDDDDDDDDDDDDDDDDDDDDDD', model: FABLE, usage: usageD, stop_reason: 'end_turn', content: [{ type: 'tool_use', name: 'Write', input: { file_path: 'C:\\test\\proj\\y.js' } }] }, { sessionId: 'sess-b' }),
];
fs.writeFileSync(path.join(projDir, 'sess-b.jsonl'), sessB.join('\n') + '\n');

(async () => {
  const storePath = path.join(root, 'store.json');
  const idx = new Indexer(root, storePath);
  await idx.indexAll();

  const proj = idx.store.projects[CWD];
  console.log('[1] per-message usage dedup (3 lines of one API call count once)');
  const a = proj.sessions['sess-a'];
  check('sess-a turns = 3 (AAA, BBB sidechain, CCC)', a.turns === 3, a.turns);
  check('sess-a tokens.in counted once per msg', a.tokens.in === 100 + 10 + 200, a.tokens.in);
  check('sess-a tokens.out counted once per msg', a.tokens.out === 50 + 30 + 80, a.tokens.out);
  check('sess-a cache tokens counted once per msg', a.tokens.cw === 5000 && a.tokens.cr === 11500, a.tokens);
  const fableCost = (inc, out, cw, cr) => inc * 10 / 1e6 + out * 50 / 1e6 + cw * 12.5 / 1e6 + cr * 1 / 1e6;
  const sonnetCost = (inc, out, cw, cr) => inc * 3 / 1e6 + out * 15 / 1e6 + cw * 3.75 / 1e6 + cr * 0.3 / 1e6;
  const expACost = fableCost(100, 50, 1000, 2000) + sonnetCost(10, 30, 0, 500) + fableCost(200, 80, 4000, 9000);
  check('sess-a cost counted once per msg', approx(a.cost, expACost), a.cost);
  check('sess-a models: fable 2 turns, sonnet 1', a.models[FABLE] === 2 && a.models[SONNET] === 1, a.models);
  check('tool blocks still counted per line (Edit 1, mcp 1)', a.tools.Edit === 1 && a.tools.mcp__srv__doit === 1, a.tools);

  console.log('[2] context gauge from last MAIN-chain call, real window size');
  check('lastContextTokens = msg_CCC prompt+output', a.lastContextTokens === 200 + 4000 + 9000 + 80, a.lastContextTokens);
  check('sidechain did not steal the gauge', a.lastContextTokens !== 10 + 0 + 500 + 30);
  check('contextWindow 1M for [1m] model', a.contextWindow === 1000000, a.contextWindow);
  check('lastStop from main chain', a.lastStop === 'end_turn', a.lastStop);

  console.log('[3] continuation file: copied lines fully skipped, only the new tail counts');
  const b = proj.sessions['sess-b'];
  check('sess-b exists', !!b);
  check('sess-b turns = 1 (only msg_DDD)', b.turns === 1, b.turns);
  check('sess-b tokens = only msg_DDD', b.tokens.in === 40 && b.tokens.out === 20 && b.tokens.cw === 300 && b.tokens.cr === 700, b.tokens);
  check('sess-b cost = only msg_DDD', approx(b.cost, fableCost(40, 20, 300, 700)), b.cost);
  check('sess-b activeMs = only new-tail gaps (11s)', b.activeMs === 11000, b.activeMs);
  check('sess-b firstTs at the new tail, not the copied history', b.firstTs === T0 + 3600000, b.firstTs);
  check('sess-b tools only from new lines (Write 1, no Edit)', b.tools.Write === 1 && !b.tools.Edit, b.tools);
  check('mcp call counted once globally (copy skipped)', idx.store.mcp.servers.srv.calls === 1, idx.store.mcp.servers.srv && idx.store.mcp.servers.srv.calls);

  console.log('[4] daily buckets: project day = every unique call once');
  const day = proj.daily[dayKey(T0)];
  const dayTokensIn = Object.values(proj.daily).reduce((n, d) => n + (d.tokensIn || 0), 0);
  const dayTurns = Object.values(proj.daily).reduce((n, d) => n + (d.turns || 0), 0);
  check('daily turns total = 4 unique calls', dayTurns === 4, dayTurns);
  check('daily tokensIn = unique calls only', dayTokensIn === (100 + 1000 + 2000) + (10 + 0 + 500) + (200 + 4000 + 9000) + (40 + 300 + 700), dayTokensIn);
  check('daily bucket exists for the local day', !!day);

  console.log('[5] re-index is idempotent (offsets + seen survive a second pass)');
  const before = JSON.stringify([a.tokens, a.turns, b.tokens, b.turns]);
  await idx.indexAll();
  const a2 = idx.store.projects[CWD].sessions['sess-a'];
  const b2 = idx.store.projects[CWD].sessions['sess-b'];
  check('second indexAll changes nothing', JSON.stringify([a2.tokens, a2.turns, b2.tokens, b2.turns]) === before);

  console.log('[6] seen-store survives reload (restart-safe dedup)');
  await idx.save();
  const idx2 = new Indexer(root, storePath);
  idx2.load();
  // wipe file offsets to simulate a re-read of the same content after restart
  idx2.store.files = {};
  await idx2.indexAll();
  const a3 = idx2.store.projects[CWD].sessions['sess-a'];
  check('re-reading old lines after restart adds nothing', a3.turns === 3 && a3.tokens.in === 310, { turns: a3.turns, in: a3.tokens.in });

  fs.rmSync(root, { recursive: true, force: true });
  console.log(fail === 0 ? '\nALL INDEXER TESTS PASSED' : `\n${fail} FAILED`);
  process.exit(fail === 0 ? 0 : 1);
})();
