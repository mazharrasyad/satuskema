// Model Context Protocol (MCP) server for SatuSkema, transport-agnostic and dependency-free.
// handle() takes one parsed JSON-RPC message (or a batch) and returns the response object(s),
// or null for notifications. server.js serves it over Streamable HTTP at /mcp; mcp-stdio.js over stdio.
'use strict';

const fs = require('fs');
const path = require('path');
const { analyze } = require('./analyzer');
const { search } = require('./search');
const llm = require('./llm');
const pkg = require('../package.json');

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_SYSTEMS = 12;
const MAX_SQL_CHARS = 2 * 1024 * 1024;
const SAMPLES = path.join(__dirname, '..', 'samples');
const SAMPLE_NAMES = { '01': 'SIPOS Posyandu', '02': 'SI-UMKM', '03': 'E-Kinerja', '04': 'SI-DBD' };

const SYSTEMS_SCHEMA = {
  type: 'array', minItems: 1, maxItems: MAX_SYSTEMS,
  description: 'Source systems to analyse. Each item is one application database: a display name plus its DDL (CREATE TABLE statements, MySQL or PostgreSQL). Structure only, never row data.',
  items: {
    type: 'object', required: ['name', 'sql'], additionalProperties: false,
    properties: {
      name: { type: 'string', description: 'System name, e.g. "SIPOS Posyandu"' },
      sql: { type: 'string', description: 'DDL of the system (CREATE TABLE ..., COMMENT ON ...)' },
    },
  },
};
const LANG_SCHEMA = { type: 'string', enum: ['en', 'id'], default: 'en', description: 'Language of labels, findings and SQL comments (English or Indonesian).' };

const TOOLS = [
  {
    name: 'analyze_schemas',
    title: 'Analyze government database schemas',
    description: 'Parse the DDL of several legacy government systems, recognise Indonesian public-data concepts (NIK national ID, KK, NIP, NIB, region codes, name, birth date...), detect master entities (residents, civil servants, businesses) duplicated across systems, and report data-quality findings with concrete fixes. Deterministic: no AI involved, results are repeatable.',
    inputSchema: { type: 'object', required: ['systems'], additionalProperties: false, properties: { systems: SYSTEMS_SCHEMA, lang: LANG_SCHEMA } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'generate_consolidation_sql',
    title: 'Generate consolidation SQL',
    description: 'Return PostgreSQL that consolidates the duplicated entities: canonical master tables with CHECK constraints, union views that normalise types across systems, and INSERT ... ON CONFLICT statements. Meant for a database engineer to review, not to run blindly.',
    inputSchema: { type: 'object', required: ['systems'], additionalProperties: false, properties: { systems: SYSTEMS_SCHEMA, lang: LANG_SCHEMA } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_data_dictionary',
    title: 'Get data dictionary',
    description: 'Return the column-level data dictionary of all systems: table, column, type, keys, recognised concept, role (e.g. nik_ibu = mother), match confidence and description.',
    inputSchema: {
      type: 'object', required: ['systems'], additionalProperties: false,
      properties: {
        systems: SYSTEMS_SCHEMA, lang: LANG_SCHEMA,
        filter: { type: 'string', description: 'Optional case-insensitive filter on system, table, column, concept or description, e.g. "nik".' },
      },
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'ask_schema',
    title: 'Ask the schema',
    description: 'Answer a natural-language question about the systems, e.g. "Which tables hold toddler data?". Answers are grounded only in the parsed schema catalogue (LLM when configured on the server, keyword search otherwise).',
    inputSchema: {
      type: 'object', required: ['question', 'systems'], additionalProperties: false,
      properties: { question: { type: 'string', maxLength: 500 }, systems: SYSTEMS_SCHEMA, lang: LANG_SCHEMA },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_sample_schemas',
    title: 'Get sample schemas',
    description: 'Return four synthetic sample systems (health post, small-business registry, civil-service performance, dengue surveillance) to try the other tools with.',
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

class ToolInputError extends Error {}

function readSamples() {
  return fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => ({ name: SAMPLE_NAMES[f.slice(0, 2)] || f, sql: fs.readFileSync(path.join(SAMPLES, f), 'utf8') }));
}

function cleanSystems(systems) {
  if (!Array.isArray(systems) || !systems.length) throw new ToolInputError('"systems" must be a non-empty array of { name, sql }.');
  if (systems.length > MAX_SYSTEMS) throw new ToolInputError(`At most ${MAX_SYSTEMS} systems per call.`);
  let total = 0;
  const out = systems.map((s, i) => {
    if (!s || typeof s.sql !== 'string' || !s.sql.trim()) throw new ToolInputError(`systems[${i}].sql must be a non-empty DDL string.`);
    total += s.sql.length;
    return { name: String(s.name || `System ${i + 1}`).slice(0, 60), sql: s.sql };
  });
  if (total > MAX_SQL_CHARS) throw new ToolInputError('Total DDL is larger than 2 MB.');
  return out;
}
const langOf = (a) => (a && a.lang === 'id' ? 'id' : 'en');

function summaryText(r) {
  const pct = r.stats.columns ? Math.round((r.stats.mapped / r.stats.columns) * 100) : 0;
  const lines = [
    `${r.stats.systems} systems, ${r.stats.tables} tables, ${r.stats.columns} columns, ${pct}% recognised as public-data concepts.`,
    '',
    'Entities:',
    ...r.entities.map((e) => `- ${e.label} (key ${e.anchor.toUpperCase()}): ${e.sources.map((s) => `${s.system}.${s.table}`).join(', ')}${e.references.length ? `; referenced by ${e.references.map((x) => `${x.system}.${x.table}.${x.column}`).join(', ')}` : ''}`),
    '',
    `Findings (${r.findings.length}):`,
    ...r.findings.map((f) => `- [${f.severity}] ${f.title}. Fix: ${f.fix}`),
  ];
  return lines.join('\n');
}

async function callTool(name, args, ctx) {
  args = args || {};
  switch (name) {
    case 'get_sample_schemas': {
      const samples = readSamples();
      return { text: `Synthetic sample systems: ${samples.map((s) => s.name).join(', ')}. Pass them as "systems" to the other tools.`, data: { systems: samples } };
    }
    case 'analyze_schemas': {
      const r = analyze(cleanSystems(args.systems), { lang: langOf(args) });
      return {
        text: summaryText(r),
        data: {
          stats: r.stats,
          entities: r.entities.map((e) => ({ key: e.key, label: e.label, anchor: e.anchor, sources: e.sources.map((s) => ({ system: s.system, table: s.table, via: s.via || null, mapping: s.mapping })), references: e.references })),
          findings: r.findings,
          canonical: r.canonical,
          erd: r.mermaid,
          warnings: r.systems.flatMap((s) => s.warnings.map((w) => `${s.name}: ${w}`)),
        },
      };
    }
    case 'generate_consolidation_sql': {
      const r = analyze(cleanSystems(args.systems), { lang: langOf(args) });
      return { text: r.sql, data: { sql: r.sql, entities: r.entities.map((e) => e.key) } };
    }
    case 'get_data_dictionary': {
      const r = analyze(cleanSystems(args.systems), { lang: langOf(args) });
      const q = String(args.filter || '').toLowerCase();
      const rows = r.dictionary.filter((d) => !q || [d.system, d.table, d.column, d.concept, d.conceptLabel, d.description].join(' ').toLowerCase().includes(q));
      const text = rows.map((d) => `${d.system}.${d.table}.${d.column} ${d.type}${d.pk ? ' PK' : ''}${d.fk ? ' FK->' + d.fk : ''}${d.conceptLabel ? ` = ${d.conceptLabel}${d.role ? ' (' + d.role + ')' : ''} ${Math.round(d.confidence * 100)}%` : ''}${d.description ? ' : ' + d.description : ''}`).join('\n');
      return { text: text || 'No matching columns.', data: { rows } };
    }
    case 'ask_schema': {
      const question = String(args.question || '').slice(0, 500).trim();
      if (!question) throw new ToolInputError('"question" is required.');
      const lang = langOf(args);
      const r = analyze(cleanSystems(args.systems), { lang });
      const fallback = search(question, r, lang);
      if (llm.provider() && (!ctx.llmAllowed || ctx.llmAllowed())) {
        try {
          const a = await llm.ask(question, r, lang);
          return { text: a.answer, data: { answer: a.answer, source: `${a.provider}/${a.model}`, hits: fallback.hits } };
        } catch { /* fall through to keyword search */ }
      }
      return { text: fallback.answer, data: { answer: fallback.answer, source: 'keyword', hits: fallback.hits } };
    }
    default:
      return null;
  }
}

const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

async function handleOne(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid Request');
  const isNotification = msg.id === undefined || msg.id === null;
  const { id, method, params = {} } = msg;
  switch (method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'satuskema', title: 'SatuSkema', version: pkg.version },
        instructions: 'SatuSkema analyses database schemas (DDL only) of siloed Indonesian government systems. Start with get_sample_schemas if you have no DDL, then analyze_schemas; use generate_consolidation_sql, get_data_dictionary or ask_schema for details.',
      });
    }
    case 'ping':
      return isNotification ? null : rpcResult(id, {});
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS });
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params.name}`);
      try {
        const out = await callTool(params.name, params.arguments, ctx);
        return rpcResult(id, { content: [{ type: 'text', text: out.text }], structuredContent: out.data, isError: false });
      } catch (e) {
        if (e instanceof ToolInputError) return rpcResult(id, { content: [{ type: 'text', text: e.message }], isError: true });
        return rpcResult(id, { content: [{ type: 'text', text: 'Internal error while running the tool.' }], isError: true });
      }
    }
    default:
      if (isNotification) return null; // e.g. notifications/initialized, notifications/cancelled
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// Returns a response object, an array of responses (batch), or null when nothing must be sent back.
async function handle(payload, ctx = {}) {
  if (Array.isArray(payload)) {
    if (!payload.length) return rpcError(null, -32600, 'Invalid Request');
    const out = (await Promise.all(payload.map((m) => handleOne(m, ctx)))).filter(Boolean);
    return out.length ? out : null;
  }
  return handleOne(payload, ctx);
}

module.exports = { handle, TOOLS, PROTOCOL_VERSIONS };
