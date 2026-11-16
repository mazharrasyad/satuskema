#!/usr/bin/env node
// SatuSkema MCP server over stdio (newline-delimited JSON-RPC), for local MCP clients.
// Usage in a client config: { "command": "node", "args": ["/path/to/satuskema/mcp-stdio.js"] }
'use strict';

const readline = require('readline');
const { handle } = require('./lib/mcp');

const rl = readline.createInterface({ input: process.stdin, terminal: false });
const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
  const out = await handle(msg);
  if (out) write(out);
});
