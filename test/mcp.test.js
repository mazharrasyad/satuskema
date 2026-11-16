'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const { handle } = require('../lib/mcp');
const { server } = require('../server');

const call = (name, args, id = 1) => handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

test('mcp: initialize negotiates version and advertises tools', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
  assert.strictEqual(r.result.protocolVersion, '2025-03-26');
  assert.ok(r.result.capabilities.tools);
  assert.strictEqual(r.result.serverInfo.name, 'satuskema');
  const unknown = await handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.strictEqual(unknown.result.protocolVersion, '2025-06-18');
  assert.strictEqual(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const list = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
  assert.deepStrictEqual(list.result.tools.map((t) => t.name).sort(),
    ['analyze_schemas', 'ask_schema', 'generate_consolidation_sql', 'get_data_dictionary', 'get_sample_schemas']);
});

test('mcp: tools work end-to-end on the samples', async () => {
  const systems = (await call('get_sample_schemas', {})).result.structuredContent.systems;
  assert.strictEqual(systems.length, 4);
  const a = (await call('analyze_schemas', { systems })).result;
  assert.strictEqual(a.isError, false);
  assert.strictEqual(a.structuredContent.stats.tables, 11);
  assert.strictEqual(a.structuredContent.findings[0].severity, 'kritis');
  assert.match(a.content[0].text, /stored as a number in SIPOS Posyandu\.tb_balita\.nik_ibu/);
  const sql = (await call('generate_consolidation_sql', { systems, lang: 'id' })).result;
  assert.match(sql.content[0].text, /CREATE OR REPLACE VIEW "v_penduduk_gabungan"/);
  assert.match(sql.content[0].text, /skema kanonik/);
  const dict = (await call('get_data_dictionary', { systems, filter: 'nik_ibu' })).result;
  assert.strictEqual(dict.structuredContent.rows.length, 1);
  assert.strictEqual(dict.structuredContent.rows[0].role, 'mother');
  const ask = (await call('ask_schema', { systems, question: 'Which tables hold toddler data?' })).result;
  assert.match(ask.content[0].text, /tb_balita/);
});

test('mcp: errors are reported, not thrown', async () => {
  const bad = (await call('analyze_schemas', { systems: [] })).result;
  assert.strictEqual(bad.isError, true);
  const unknownTool = await call('drop_database', {});
  assert.strictEqual(unknownTool.error.code, -32602);
  const unknownMethod = await handle({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
  assert.strictEqual(unknownMethod.error.code, -32601);
  const batch = await handle([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }]);
  assert.strictEqual(batch.length, 1);
});

test('mcp: Streamable HTTP endpoint', async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/mcp`;
  try {
    const post = (body) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) });
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    assert.strictEqual(init.status, 200);
    assert.strictEqual((await init.json()).result.serverInfo.name, 'satuskema');
    const note = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.strictEqual(note.status, 202);
    const get = await fetch(base);
    assert.strictEqual(get.status, 405);
    const garbage = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    assert.strictEqual((await garbage.json()).error.code, -32700);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('mcp: stdio transport', async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'mcp-stdio.js')]);
  const lines = [];
  child.stdout.on('data', (d) => lines.push(...String(d).split('\n').filter(Boolean)));
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  for (let i = 0; i < 50 && lines.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  child.kill();
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(JSON.parse(lines[1]).result.tools.length, 5);
});
