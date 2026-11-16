// Optional LLM layer (free tiers only): Gemini Developer API or Groq.
// Everything in SatuSkema works without it; the LLM only adds descriptions for columns
// the deterministic vocabulary does not know, and answers natural-language questions.
'use strict';

function provider() {
  if (process.env.GEMINI_API_KEY) return { name: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' };
  if (process.env.GROQ_API_KEY) return { name: 'groq', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' };
  return null;
}

async function complete(prompt, { json = false, timeoutMs = 25000 } = {}) {
  const p = provider();
  if (!p) throw new Error('LLM tidak dikonfigurasi');
  if (p.name === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return { text: data.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '', provider: p };
  }
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: p.model, temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content || '', provider: p };
}

function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Adds Indonesian descriptions for tables and for columns that the vocabulary did not recognise.
async function enrich(result, lang = 'id') {
  const en = lang === 'en';
  const tables = [];
  for (const s of result.systems) {
    for (const t of s.tables) {
      tables.push({ system: s.name, table: t.name, columns: t.columns.map((c) => (c.concept ? `${c.name}:${c.type}=${c.concept}` : `${c.name}:${c.type}`)) });
    }
  }
  const prompt = [
    'Anda adalah arsitek data senior untuk sistem informasi pemerintahan Indonesia.',
    en ? 'For every table below, write a short description (max 15 words, in clear English) of what the table holds,'
      : 'Untuk setiap tabel di bawah, tulis deskripsi singkat (maks 15 kata, Bahasa Indonesia baku) tentang isi tabel,',
    en ? 'and a short description (max 12 words, English) for EVERY column without a concept label (no "=").'
      : 'dan deskripsi singkat (maks 12 kata) untuk SETIAP kolom yang belum punya label konsep (yang tidak memiliki "=").',
    en ? 'Do not invent legal rules. If unsure, write "needs confirmation from data owner". Keep Indonesian column names as-is.'
      : 'Jangan mengarang aturan hukum. Jika ragu, tulis "perlu konfirmasi pemilik data".',
    'Balas HANYA JSON: {"tables":[{"system":"","table":"","description":"","columns":{"nama_kolom":"deskripsi"}}]}',
    '',
    JSON.stringify(tables.slice(0, 60)),
  ].join('\n');
  const { text, provider: p } = await complete(prompt, { json: true });
  const data = parseJson(text);
  if (!data || !Array.isArray(data.tables)) throw new Error('Format jawaban LLM tidak valid');
  const source = `AI (${p.name})`;
  let filled = 0;
  for (const t of data.tables) {
    const sys = result.systems.find((s) => s.name === t.system);
    const tbl = sys && sys.tables.find((x) => x.name === t.table);
    if (!tbl) continue;
    if (t.description && !tbl.comment) tbl.aiDescription = String(t.description).slice(0, 200);
    for (const [col, desc] of Object.entries(t.columns || {})) {
      const row = result.dictionary.find((d) => d.system === t.system && d.table === t.table && d.column === col);
      if (row && !row.description && desc) {
        row.description = String(desc).slice(0, 200);
        row.descriptionSource = source;
        filled++;
      }
    }
  }
  return { provider: p.name, model: p.model, filled };
}

function contextLines(result) {
  const lines = [];
  for (const s of result.systems) {
    for (const t of s.tables) {
      lines.push(`# ${s.name}.${t.name}${t.entity ? ` [${t.entity}]` : ''}${t.comment || t.aiDescription ? ' — ' + (t.comment || t.aiDescription) : ''}`);
      for (const c of t.columns) {
        const d = result.dictionary.find((x) => x.system === s.name && x.table === t.name && x.column === c.name);
        lines.push(`  - ${c.name} ${c.type}${c.pk ? ' PK' : ''}${c.ref ? ` FK->${c.ref.table}.${c.ref.column}` : ''}${c.concept ? ` =${c.concept}${c.role ? '(' + c.role + ')' : ''}` : ''}${d && d.description ? ' : ' + d.description : ''}`);
      }
    }
  }
  return lines.join('\n');
}

async function ask(question, result, lang = 'id') {
  const prompt = [
    'Anda adalah asisten arsitektur data pemerintahan. Jawab pertanyaan HANYA berdasarkan katalog skema di bawah.',
    'Sebutkan sistem.tabel.kolom yang relevan secara eksplisit. Jika tidak ada di katalog, katakan tidak ditemukan.',
    lang === 'en' ? 'Answer in English, concisely, as bullet points. Keep Indonesian table/column names as-is.' : 'Jawab dalam Bahasa Indonesia, ringkas, berupa poin.',
    '',
    'KATALOG:',
    contextLines(result).slice(0, 24000),
    '',
    'TEMUAN KUALITAS DATA:',
    result.findings.map((f) => `- [${f.severity}] ${f.title}`).join('\n'),
    '',
    `PERTANYAAN: ${question}`,
  ].join('\n');
  const { text, provider: p } = await complete(prompt);
  return { answer: text.trim(), provider: p.name, model: p.model };
}

module.exports = { provider, enrich, ask, contextLines };
