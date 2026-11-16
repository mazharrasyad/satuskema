// Deterministic "tanya skema" fallback: keyword search over the data dictionary.
'use strict';

const { normalize } = require('./analyzer');

const STOP = new Set(['yang', 'mana', 'saja', 'apa', 'di', 'ke', 'dari', 'dan', 'atau', 'data', 'sistem', 'tabel', 'kolom',
  'menyimpan', 'simpan', 'disimpan', 'ada', 'berapa', 'siapa', 'bagaimana', 'the', 'which', 'store', 'stores', 'where', 'is', 'are',
  'warga', 'orang', 'punya', 'memiliki', 'berisi', 'tentang', 'untuk', 'dengan', 'ini', 'itu', 'semua', 'adalah', 'apakah', 'dimana',
  'what', 'who', 'how', 'do', 'does', 'in', 'of', 'a', 'an', 'and', 'or', 'systems', 'tables', 'table', 'column', 'columns',
  'stored', 'contain', 'contains', 'holds', 'hold', 'keep', 'keeps', 'with', 'about', 'all', 'any', 'other', 'than', 'their',
  'people', 'person', 'persons', 'citizen', 'citizens', 'besides', 'subject', 'its', 'has', 'have', 'row', 'rows']);

// English question words -> Indonesian vocabulary used in schemas.
const SYNONYMS = { toddler: 'balita', toddlers: 'balita', child: 'anak', children: 'anak', baby: 'balita', mother: 'ibu',
  father: 'ayah', owner: 'pemilik', employee: 'pegawai', employees: 'pegawai', staff: 'pegawai', business: 'usaha',
  businesses: 'usaha', resident: 'penduduk', residents: 'penduduk', village: 'kelurahan', district: 'kecamatan',
  case: 'kasus', cases: 'kasus', dengue: 'dbd', national: 'nik', addresses: 'alamat', names: 'nama',
  position: 'jabatan', reporter: 'pelapor', patient: 'pasien' };

function search(question, result, lang = 'id') {
  const en = lang === 'en';
  const q = [...new Set(normalize(question).split('_').filter((t) => t.length > 1 && !STOP.has(t)).map((t) => SYNONYMS[t] || t))];
  if (!q.length) return { answer: en ? 'Type a keyword, e.g. "NIK", "toddler", "address" or "employee".' : 'Tulis kata kunci, mis. "NIK", "balita", "alamat", atau "pegawai".', hits: [] };
  const groups = new Map();
  for (const d of result.dictionary) {
    // Structural fields are normalised (tgl -> tanggal); free-text descriptions are matched literally
    // so "sesuai KTP" in a name description does not count as a NIK column.
    const hay = [normalize(d.column), normalize(d.table), d.concept || '', normalize(d.conceptLabel || ''), d.role || ''].join('_');
    const toks = new Set(hay.split('_'));
    const desc = new Set(String(d.description || '').toLowerCase().split(/[^a-z0-9]+/));
    const score = q.reduce((a, t) => a + (toks.has(t) ? 2 : desc.has(t) ? 1 : 0), 0);
    if (!score) continue;
    const key = `${d.system}.${d.table}`;
    const g = groups.get(key) || { where: key, score: 0, columns: [] };
    g.score += score;
    g.columns.push(`${d.column}${d.conceptLabel ? ` (${d.conceptLabel}${d.role ? ', ' + d.role : ''})` : ''}`);
    groups.set(key, g);
  }
  const hits = [...groups.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  if (!hits.length) return { answer: en ? `No column matches: ${q.join(', ')}.` : `Tidak ada kolom yang cocok dengan: ${q.join(', ')}.`, hits };
  const answer = hits.map((h) => `- **${h.where}**: ${h.columns.slice(0, 6).join(', ')}`).join('\n');
  return { answer: en ? `Found in ${hits.length} ${hits.length === 1 ? "table" : "tables"} (keyword search):\n${answer}` : `Ditemukan di ${hits.length} tabel (pencarian kata kunci):\n${answer}`, hits };
}

module.exports = { search };
