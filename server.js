// SatuSkema server — zero dependencies (Node >= 20).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyze } = require('./lib/analyzer');
const llm = require('./lib/llm');
const { search } = require('./lib/search');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 3170);
const HOST = process.env.HOST || '0.0.0.0';
const BASE_PATH = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const PUBLIC = path.join(__dirname, 'public');
const SAMPLES = path.join(__dirname, 'samples');
const MAX_BODY = 2 * 1024 * 1024;
const MAX_SYSTEMS = 12;
const LLM_PER_MIN = Number(process.env.LLM_PER_MIN || 10);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.sql': 'text/plain; charset=utf-8' };

const SAMPLE_NAMES = { '01': 'SIPOS Posyandu', '02': 'SI-UMKM', '03': 'E-Kinerja', '04': 'SI-DBD' };

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const hits = new Map();
function llmAllowed(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (list.length >= LLM_PER_MIN) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  return true;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Ukuran skema melebihi 2 MB'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('JSON tidak valid'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function validSystems(body) {
  const systems = Array.isArray(body.systems) ? body.systems : [];
  const clean = systems
    .filter((s) => s && typeof s.sql === 'string' && s.sql.trim())
    .slice(0, MAX_SYSTEMS)
    .map((s, i) => ({ name: String(s.name || `Sistem ${i + 1}`).slice(0, 60), sql: s.sql }));
  if (!clean.length) throw Object.assign(new Error('Masukkan minimal satu skema SQL (CREATE TABLE ...)'), { status: 400 });
  return clean;
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}

async function api(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/config') {
    const p = llm.provider();
    return send(res, 200, { llm: p ? { provider: p.name, model: p.model } : null });
  }
  if (req.method === 'GET' && url.pathname === '/api/samples') {
    const files = fs.readdirSync(SAMPLES).filter((f) => f.endsWith('.sql')).sort();
    return send(res, 200, files.map((f) => ({ name: SAMPLE_NAMES[f.slice(0, 2)] || f, sql: fs.readFileSync(path.join(SAMPLES, f), 'utf8') })));
  }
  if (req.method === 'POST' && url.pathname === '/api/analyze') {
    const body = await readBody(req);
    const lang = body.lang === 'en' ? 'en' : 'id';
    const result = analyze(validSystems(body), { lang });
    result.ai = null;
    if (body.enrich && llm.provider()) {
      if (!llmAllowed(clientIp(req))) result.ai = { error: lang === 'en' ? 'AI rate limit per minute reached, try again shortly.' : 'Batas pemakaian AI per menit tercapai, coba lagi sebentar.' };
      else {
        try { result.ai = await llm.enrich(result, lang); } catch (e) { result.ai = { error: e.message }; }
      }
    }
    return send(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/ask') {
    const body = await readBody(req);
    const question = String(body.question || '').slice(0, 500).trim();
    if (!question) throw Object.assign(new Error('Pertanyaan kosong'), { status: 400 });
    const lang = body.lang === 'en' ? 'en' : 'id';
    const result = analyze(validSystems(body), { lang });
    const fallback = search(question, result, lang);
    if (llm.provider() && llmAllowed(clientIp(req))) {
      try {
        const r = await llm.ask(question, result, lang);
        return send(res, 200, { ...r, hits: fallback.hits });
      } catch (e) {
        return send(res, 200, { ...fallback, provider: lang === 'en' ? 'keyword' : 'kata kunci', note: (lang === 'en' ? 'AI unavailable: ' : 'AI tidak tersedia: ') + e.message });
      }
    }
    return send(res, 200, { ...fallback, provider: lang === 'en' ? 'keyword' : 'kata kunci' });
  }
  return send(res, 404, { error: 'Tidak ditemukan' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    if (path.basename(file) === 'index.html') data = Buffer.from(data.toString('utf8').replace('<base href="/">', `<base href="${BASE_PATH}">`));
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url);
    else send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Terjadi kesalahan server' });
    if (!e.status) console.error(e);
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const p = llm.provider();
    console.log(`SatuSkema berjalan di http://localhost:${PORT} (AI: ${p ? p.name + ' / ' + p.model : 'nonaktif — mode deterministik'})`);
  });
}

module.exports = { server };
