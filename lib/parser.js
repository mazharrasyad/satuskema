// Deterministic SQL DDL parser (MySQL / PostgreSQL / generic). No LLM involved.
'use strict';

function stripComments(sql) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (quote) {
      out += c;
      if (c === quote && sql[i - 1] !== '\\') quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '-' && n === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (c === '#') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

// Split on a delimiter at paren depth 0, outside quotes.
function splitTop(text, delim) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === quote && text[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; continue; }
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === delim && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function unquote(id) {
  return String(id || '').trim().replace(/^[`"[]|[`"\]]$/g, '');
}

// "db"."schema"."table" -> table
function lastIdent(raw) {
  const parts = String(raw).split('.').map(unquote);
  return parts[parts.length - 1].toLowerCase();
}

function identList(raw) {
  return String(raw).split(',').map((s) => unquote(s.trim()).toLowerCase()).filter(Boolean);
}

const IDENT = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|[\\w$]+)';
const QUALIFIED = `${IDENT}(?:\\s*\\.\\s*${IDENT})*`;

function matchingParen(text, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== '\\') quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth++;
    if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function parseColumn(item) {
  const m = item.match(new RegExp(`^(${IDENT})\\s+(.*)$`, 's'));
  if (!m) return null;
  const name = unquote(m[1]).toLowerCase();
  const rest = m[2];
  // Base word + known multi-word continuations ("character varying", "double precision",
  // "timestamp with time zone"), optional (args), optional trailing modifiers.
  const tm = rest.match(/^([a-zA-Z_]\w*(?:\s+(?:varying|precision))?)(?:\s*(\([^)]*\)))?((?:\s+(?:with|without)\s+time\s+zone)|(?:\s+unsigned)|(?:\s+zerofill))*/i);
  const type = tm ? tm[0].replace(/\s+/g, ' ').trim() : rest.split(/\s+/)[0];
  const upper = rest.toUpperCase();
  const col = {
    name,
    type: type.toLowerCase(),
    nullable: !/\bNOT\s+NULL\b/.test(upper),
    pk: /\bPRIMARY\s+KEY\b/.test(upper),
    unique: /\bUNIQUE\b/.test(upper),
    autoIncrement: /\bAUTO_INCREMENT\b|\bSERIAL\b|\bIDENTITY\b/.test(upper) || /serial/i.test(type),
    comment: null,
    ref: null,
  };
  const cm = rest.match(/\bCOMMENT\s+'((?:[^'\\]|\\.|'')*)'/i);
  if (cm) col.comment = cm[1].replace(/''/g, "'");
  const rm = rest.match(new RegExp(`\\bREFERENCES\\s+(${QUALIFIED})\\s*\\(([^)]+)\\)`, 'i'));
  if (rm) col.ref = { table: lastIdent(rm[1]), column: identList(rm[2])[0] };
  return col;
}

function applyConstraint(table, item) {
  const body = item.replace(new RegExp(`^CONSTRAINT\\s+${IDENT}\\s+`, 'i'), '');
  let m = body.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
  if (m) {
    for (const c of identList(m[1])) {
      const col = table.columns.find((x) => x.name === c);
      if (col) col.pk = true;
    }
    return true;
  }
  m = body.match(new RegExp(`^FOREIGN\\s+KEY\\s*\\(([^)]+)\\)\\s*REFERENCES\\s+(${QUALIFIED})\\s*\\(([^)]+)\\)`, 'i'));
  if (m) {
    const cols = identList(m[1]);
    const refCols = identList(m[3]);
    cols.forEach((c, i) => {
      const col = table.columns.find((x) => x.name === c);
      if (col) col.ref = { table: lastIdent(m[2]), column: refCols[i] || refCols[0] };
    });
    return true;
  }
  m = body.match(/^UNIQUE(?:\s+(?:KEY|INDEX))?\s*(?:[\w`"]+\s*)?\(([^)]+)\)/i);
  if (m) {
    const cols = identList(m[1]);
    if (cols.length === 1) {
      const col = table.columns.find((x) => x.name === cols[0]);
      if (col) col.unique = true;
    }
    return true;
  }
  return /^(KEY|INDEX|FULLTEXT|SPATIAL|CHECK|EXCLUDE)\b/i.test(body) || /^CONSTRAINT\b/i.test(item);
}

function parseCreateTable(stmt) {
  const head = stmt.match(new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:(?:GLOBAL|LOCAL)\\s+)?(?:TEMP(?:ORARY)?\\s+|UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${QUALIFIED})\\s*\\(`, 'i'));
  if (!head) return null;
  const open = head[0].length - 1;
  const close = matchingParen(stmt, open);
  if (close < 0) return null;
  const table = { name: lastIdent(head[1]), columns: [], comment: null };
  const tail = stmt.slice(close + 1);
  const tc = tail.match(/\bCOMMENT\s*=?\s*'((?:[^'\\]|\\.|'')*)'/i);
  if (tc) table.comment = tc[1].replace(/''/g, "'");
  const items = splitTop(stmt.slice(open + 1, close), ',');
  const constraints = [];
  for (const item of items) {
    if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\b|KEY\b|INDEX\b|FULLTEXT|SPATIAL|CHECK\b|EXCLUDE\b)/i.test(item)) {
      constraints.push(item);
      continue;
    }
    const col = parseColumn(item);
    if (col) table.columns.push(col);
  }
  for (const c of constraints) applyConstraint(table, c);
  return table;
}

function parseAlter(stmt, tables) {
  const m = stmt.match(new RegExp(`^ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(?:IF\\s+EXISTS\\s+)?(${QUALIFIED})\\s+(.*)$`, 'is'));
  if (!m) return;
  const table = tables.find((t) => t.name === lastIdent(m[1]));
  if (!table) return;
  for (const action of splitTop(m[2], ',')) {
    const a = action.replace(/^ADD\s+/i, '');
    if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE)/i.test(a)) applyConstraint(table, a);
    else if (/^ADD\s+(COLUMN\s+)?/i.test(action)) {
      const col = parseColumn(action.replace(/^ADD\s+(COLUMN\s+)?(IF\s+NOT\s+EXISTS\s+)?/i, ''));
      if (col) table.columns.push(col);
    }
  }
}

function parseComments(stmt, tables) {
  // PostgreSQL: COMMENT ON COLUMN t.c IS '...'; COMMENT ON TABLE t IS '...'
  let m = stmt.match(new RegExp(`^COMMENT\\s+ON\\s+COLUMN\\s+(${QUALIFIED})\\s+IS\\s+'((?:[^']|'')*)'`, 'i'));
  if (m) {
    const parts = m[1].split('.').map((p) => unquote(p).toLowerCase());
    const col = parts.pop();
    const tname = parts.pop();
    const t = tables.find((x) => x.name === tname);
    const c = t && t.columns.find((x) => x.name === col);
    if (c) c.comment = m[2].replace(/''/g, "'");
    return;
  }
  m = stmt.match(new RegExp(`^COMMENT\\s+ON\\s+TABLE\\s+(${QUALIFIED})\\s+IS\\s+'((?:[^']|'')*)'`, 'i'));
  if (m) {
    const t = tables.find((x) => x.name === lastIdent(m[1]));
    if (t) t.comment = m[2].replace(/''/g, "'");
  }
}

function parseDDL(sql) {
  const statements = splitTop(stripComments(String(sql || '')), ';');
  const tables = [];
  const warnings = [];
  for (const stmt of statements) {
    if (/^CREATE\s+(OR\s+REPLACE\s+)?(\w+\s+)*TABLE\b/i.test(stmt)) {
      const t = parseCreateTable(stmt);
      if (!t) { warnings.push(`Gagal mem-parse: ${stmt.slice(0, 80)}…`); continue; }
      const existing = tables.findIndex((x) => x.name === t.name);
      if (existing >= 0) tables.splice(existing, 1, t); else tables.push(t);
    } else if (/^ALTER\s+TABLE\b/i.test(stmt)) {
      parseAlter(stmt, tables);
    } else if (/^COMMENT\s+ON\b/i.test(stmt)) {
      parseComments(stmt, tables);
    }
  }
  return { tables, warnings };
}

module.exports = { parseDDL, stripComments, splitTop };
