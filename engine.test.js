const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CodexEngine } = require('./codex-engine');
const { safePath, toolsFor, run, verify } = require('./api-engine');
const { Store } = require('./store');
test('Codex events complete only after actual turn completion', async () => {
  const c = new CodexEngine(); c.threadId = 't'; c.rpc = async () => ({ turn: { id: 'a' } }); const events = []; c.on('event', e => events.push(e));
  const promise = c.send('hello');
  c.receive({ method: 'item/agentMessage/delta', params: { threadId: 't', delta: 'Hello' } });
  assert.ok(c.active);
  c.receive({ method: 'turn/completed', params: { threadId: 't', turn: { status: 'completed' } } });
  assert.equal(await promise, 'Hello'); assert.equal(events[0].text, 'Hello');
});
test('Codex approval denial and unsupported requests fail closed', () => {
  const c = new CodexEngine(); const writes = []; c.write = value => writes.push(value);
  c.receive({ id: 12, method: 'item/fileChange/requestApproval', params: { reason: 'edit' } });
  c.respond('12', false); assert.equal(writes[0].result.decision, 'decline');
  c.receive({ id: 13, method: 'unknown/request', params: {} }); assert.equal(writes[1].error.code, -32601);
});
test('stop before turn/start response still interrupts', async () => {
  const c = new CodexEngine(); c.threadId = 't'; let release; const calls = [];
  c.rpc = (method) => { calls.push(method); return method === 'turn/start' ? new Promise(r => { release = r; }) : Promise.resolve({}); };
  const p = c.send('hello'); await c.stop(); release({ turn: { id: 'a' } }); await new Promise(r => setImmediate(r));
  assert.ok(calls.includes('turn/interrupt')); c.receive({ method: 'turn/completed', params: { threadId: 't', turn: { status: 'interrupted' } } }); await p;
});
test('API paths reject traversal, credentials and alternate streams', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-test-'));
  for (const target of ['../outside', '.env', '.env.example', '.git/config', 'a.txt:stream', 'credentials.json', 'file.key', 'folder./x']) assert.throws(() => safePath(root, target, true));
  assert.equal(safePath(root, 'src/app.js', true), path.join(root, 'src/app.js'));
});
test('API writes require approval, current read and correct mode', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-test-')); fs.writeFileSync(path.join(root, 'a.txt'), 'old');
  const opts = { project: root, mode: 'workspace-write', signal: new AbortController().signal, emit: () => {}, approve: async () => true };
  const run = toolsFor(opts);
  await assert.rejects(run('write_file', { path: 'a.txt', content: 'new' }), /Read/);
  await run('read_file', { path: 'a.txt' }); const result = JSON.parse(await run('write_file', { path: 'a.txt', content: 'new' }));
  assert.equal(fs.readFileSync(result.backup, 'utf8'), 'old'); assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'new');
  await assert.rejects(toolsFor({ ...opts, mode: 'read-only' })('write_file', { path: 'b.txt', content: 'x' }), /Read-only/);
  await assert.rejects(toolsFor({ ...opts, approve: async () => false })('write_file', { path: 'b.txt', content: 'x' }), /declined/);
  assert.equal(fs.existsSync(path.join(root, 'b.txt')), false);
});
test('project history isolated and keys encrypted at rest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-store-test-'));
  const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('encrypted:' + value), decryptString: value => value.toString().slice(10) };
  const store = new Store(root, encryption); store.saveHistory('project-a', 'codex', { messages: ['a'] });
  assert.deepEqual(store.history('project-b', 'codex').messages, []); assert.deepEqual(store.history('project-a', 'gemini').messages, []);
  store.key('gemini', 'test-secret'); assert.equal(store.key('gemini'), 'test-secret'); assert.ok(!fs.readFileSync(path.join(root, 'credentials.json'), 'utf8').includes('test-secret'));
});
test('Gemini loop executes real read and preserves function response', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-api-test-')); fs.writeFileSync(path.join(root, 'hello.txt'), 'fixture evidence');
  const original = global.fetch; const requests = []; const events = [];
  global.fetch = async (_url, options) => { const body = JSON.parse(options.body); requests.push(body); return { ok: true, json: async () => ({ candidates: [{ content: requests.length === 1 ? { role: 'model', parts: [{ functionCall: { name: 'read_file', args: { path: 'hello.txt' } }, thoughtSignature: 'preserved' }] } : { role: 'model', parts: [{ text: 'Read verified fixture.' }] }, finishReason: 'STOP' }] }) }; };
  try {
    const result = await run({ provider: 'gemini', key: 'fake-test-key', model: 'fixture-model', project: root, messages: [{ role: 'user', text: 'read hello' }], mode: 'read-only', signal: new AbortController().signal, emit: e => events.push(e), approve: async () => false });
    assert.equal(result, 'Read verified fixture.'); assert.equal(requests[1].contents[1].parts[0].thoughtSignature, 'preserved'); assert.equal(requests[1].contents[2].parts[0].functionResponse.response.result, 'fixture evidence'); assert.ok(events.some(e => e.role === 'explorer' && e.status === 'completed'));
  } finally { global.fetch = original; }
});
test('Gemini HTTP errors do not expose keys and abort prevents tools', async () => {
  const original = global.fetch; global.fetch = async () => ({ ok: false, status: 401 });
  try { await assert.rejects(verify('gemini', 'secret-not-in-error'), error => !error.message.includes('secret-not-in-error') && error.message.includes('401')); } finally { global.fetch = original; }
  const signal = AbortSignal.abort(); const execute = toolsFor({ signal }); await assert.rejects(execute('list_files', { path: '.' }), /abort/i);
});
test('Claude SDK streaming uses caching and forwards actual text', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-claude-test-')); const original = global.fetch; let request;
  global.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    const events = [
      { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', content: [], model: 'claude-opus-4-7', stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Fixture reply.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } },
      { type: 'message_stop' }
    ];
    return new Response(events.map(e => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const result = await run({ provider: 'claude', key: 'fixture-only', model: 'claude-opus-4-7', project: root, messages: [{ role: 'user', text: 'hello' }], mode: 'read-only', signal: new AbortController().signal, emit: () => {}, approve: async () => false });
    assert.equal(result, 'Fixture reply.'); assert.equal(request.system[0].cache_control.type, 'ephemeral'); assert.equal(request.thinking.type, 'adaptive');
  } finally { global.fetch = original; }
});
