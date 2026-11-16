'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- i18n ----------
const I18N = {
  en: {
    tagline: 'One data starts with one schema.',
    heroTitle: 'Dozens of government systems, one citizen identity.',
    heroText: 'Paste the database schemas (DDL) of several legacy apps: health posts, small-business registry, civil-service performance, disease surveillance and more. SatuSkema reads their structure, finds the same data stored again and again (residents, civil servants, businesses, regions), then builds a data dictionary, a canonical model and the consolidation SQL.',
    heroContext: 'Context: Indonesian agencies run hundreds of separate apps. Each one re-creates its own "resident" table keyed by NIK (the 16-digit national ID), so the same person exists in many inconsistent copies. National policy (Satu Data Indonesia) requires them to be unified.',
    step1: '1. Source schemas', loadSample: 'Load 4 sample systems', addSystem: '+ Add system',
    optAi: 'Enrich column descriptions with AI', analyze: 'Analyze schemas', analyzing: 'Analyzing…', analyzingAi: 'Analyzing + AI…',
    hint: 'Nothing is stored on the server. Upload only the <em>structure</em> (CREATE TABLE), not the data. MySQL and PostgreSQL are supported.',
    step2: '2. Analysis results',
    tabFindings: 'Findings', tabEntities: 'Cross-system entities', tabErd: 'ERD before / after', tabDict: 'Data dictionary', tabSql: 'Consolidation SQL', tabAsk: 'Ask the schema',
    before: 'Before', after: 'After: canonical model', pickSystem: 'Pick a system',
    dictFilter: 'Filter: nik, alamat, tb_balita…', dictFilterAria: 'Filter data dictionary', dlCsv: 'Download CSV', dlMd: 'Download Markdown',
    copy: 'Copy', copied: 'Copied ✓', copyFail: 'Copy failed', dlSql: 'Download .sql',
    askPh: "Which systems store residents' addresses?", askAria: 'Question', ask: 'Ask', searching: 'Searching…', answerSource: 'Answer source',
    footer: 'SatuSkema · Vibe-a-thon 2026 · Team HackRasaz · All sample schemas are synthetic.',
    sysNamePh: 'System name, e.g. SIPOS Posyandu', sysNameAria: 'System name', upload: 'Upload .sql', removeSys: 'Remove system',
    fileTooBig: 'File is larger than 2 MB.', systemN: 'System {n}', needSchema: 'Paste at least one SQL schema, or click "Load 4 sample systems".',
    analyzeFail: 'Analysis failed: ',
    stSystems: 'Systems', stTables: 'Tables', stColumns: 'Columns', stMapped: 'Columns recognised', stDup: 'Duplicated entities', stSevere: 'Critical/high findings',
    aiOff: 'Deterministic mode (no AI).', aiUnused: 'AI not used: ', aiAdded: 'AI {p} ({m}) added {n} column descriptions.',
    noFindings: 'No findings. The schemas are clean.', fix: 'Recommendation:',
    sev: { kritis: 'critical', tinggi: 'high', sedang: 'medium', rendah: 'low' },
    confTitle: 'match confidence', noEntities: 'No master entities (resident/civil servant/business) detected yet.',
    as: 'as', via: 'via', key: 'key', sources: 'sources', canonAttr: 'Canonical attribute', referencedBy: 'Referenced by transaction tables: ',
    erdFail: 'Could not draw the ERD: ',
    dictCols: ['System', 'Table', 'Column', 'Type', 'Keys', 'Concept', 'Confidence', 'Description'], noDesc: 'no description yet',
    csvHead: ['system', 'table', 'column', 'type', 'pk', 'fk', 'concept', 'role', 'confidence', 'description', 'description_source'], yes: 'yes',
    mdTitle: '# Data Dictionary — SatuSkema', mdHead: '| Column | Type | Keys | Concept | Description |',
    fileDict: 'satuskema-data-dictionary', fileSql: 'satuskema-consolidation.sql',
    examples: ['Which systems store NIK?', 'Where are residents\' addresses stored?', 'Which tables hold toddler data?', 'Which columns hold names of people other than the row\'s subject?'],
    aiBadgeOff: 'AI: off (deterministic)', aiBadgeUnknown: 'AI: unknown',
  },
  id: {
    tagline: 'Satu data dimulai dari satu skema.',
    heroTitle: 'Puluhan sistem pemerintahan, satu identitas warga.',
    heroText: 'Tempel skema database (DDL) dari beberapa aplikasi lama: posyandu, UMKM, kepegawaian, surveilans, dan lain-lain. SatuSkema membaca strukturnya, menemukan data yang sama yang disimpan berulang (penduduk, pegawai, usaha, wilayah), lalu menyusun kamus data, model kanonik, dan SQL konsolidasinya.',
    heroContext: 'Konteks: instansi pemerintah menjalankan ratusan aplikasi terpisah. Masing-masing membuat ulang tabel "penduduk" dengan kunci NIK, sehingga satu orang tersimpan dalam banyak salinan yang tidak konsisten. Kebijakan Satu Data Indonesia menuntut semuanya disatukan.',
    step1: '1. Skema sumber', loadSample: 'Muat contoh 4 sistem', addSystem: '+ Tambah sistem',
    optAi: 'Perkaya deskripsi kolom dengan AI', analyze: 'Analisis skema', analyzing: 'Menganalisis…', analyzingAi: 'Menganalisis + AI…',
    hint: 'Data tidak disimpan di server. Cukup unggah <em>struktur</em> (CREATE TABLE), bukan isi data. Mendukung MySQL dan PostgreSQL.',
    step2: '2. Hasil analisis',
    tabFindings: 'Temuan', tabEntities: 'Entitas lintas sistem', tabErd: 'ERD sebelum / sesudah', tabDict: 'Kamus data', tabSql: 'SQL konsolidasi', tabAsk: 'Tanya skema',
    before: 'Sebelum', after: 'Sesudah: model kanonik', pickSystem: 'Pilih sistem',
    dictFilter: 'Saring: nik, alamat, tb_balita…', dictFilterAria: 'Saring kamus data', dlCsv: 'Unduh CSV', dlMd: 'Unduh Markdown',
    copy: 'Salin', copied: 'Tersalin ✓', copyFail: 'Gagal menyalin', dlSql: 'Unduh .sql',
    askPh: 'Sistem mana saja yang menyimpan alamat warga?', askAria: 'Pertanyaan', ask: 'Tanya', searching: 'Mencari…', answerSource: 'Sumber jawaban',
    footer: 'SatuSkema · Vibe-a-thon 2026 · Tim HackRasaz · Semua contoh skema adalah data sintetis.',
    sysNamePh: 'Nama sistem, mis. SIPOS Posyandu', sysNameAria: 'Nama sistem', upload: 'Unggah .sql', removeSys: 'Hapus sistem',
    fileTooBig: 'Berkas lebih dari 2 MB.', systemN: 'Sistem {n}', needSchema: 'Tempel minimal satu skema SQL, atau klik "Muat contoh 4 sistem".',
    analyzeFail: 'Gagal menganalisis: ',
    stSystems: 'Sistem', stTables: 'Tabel', stColumns: 'Kolom', stMapped: 'Kolom dikenali', stDup: 'Entitas berulang', stSevere: 'Temuan kritis/tinggi',
    aiOff: 'Mode deterministik (tanpa AI).', aiUnused: 'AI tidak dipakai: ', aiAdded: 'AI {p} ({m}) menambahkan {n} deskripsi kolom.',
    noFindings: 'Tidak ada temuan. Skema sudah rapi.', fix: 'Rekomendasi:',
    sev: { kritis: 'kritis', tinggi: 'tinggi', sedang: 'sedang', rendah: 'rendah' },
    confTitle: 'keyakinan pencocokan', noEntities: 'Belum ada entitas master (penduduk/pegawai/usaha) yang terdeteksi.',
    as: 'sebagai', via: 'via', key: 'kunci', sources: 'sumber', canonAttr: 'Atribut kanonik', referencedBy: 'Dirujuk oleh tabel transaksi: ',
    erdFail: 'Gagal menggambar ERD: ',
    dictCols: ['Sistem', 'Tabel', 'Kolom', 'Tipe', 'Kunci', 'Konsep', 'Keyakinan', 'Deskripsi'], noDesc: 'belum ada deskripsi',
    csvHead: ['sistem', 'tabel', 'kolom', 'tipe', 'pk', 'fk', 'konsep', 'peran', 'keyakinan', 'deskripsi', 'sumber_deskripsi'], yes: 'ya',
    mdTitle: '# Kamus Data — SatuSkema', mdHead: '| Kolom | Tipe | Kunci | Konsep | Deskripsi |',
    fileDict: 'kamus-data-satuskema', fileSql: 'satuskema-konsolidasi.sql',
    examples: ['Sistem mana saja yang menyimpan NIK?', 'Di mana alamat warga disimpan?', 'Tabel apa yang berisi data balita?', 'Kolom mana yang berisi nama orang selain subjeknya?'],
    aiBadgeOff: 'AI: nonaktif (deterministik)', aiBadgeUnknown: 'AI: tidak diketahui',
  },
};

function initialLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'en' || q === 'id') return q;
  try { const s = localStorage.getItem('satuskema.lang'); if (s === 'en' || s === 'id') return s; } catch { /* storage blocked */ }
  return 'en';
}
let LANG = initialLang();
const t = (k, vars) => {
  let v = I18N[LANG][k] ?? I18N.en[k] ?? k;
  if (vars && typeof v === 'string') for (const [a, b] of Object.entries(vars)) v = v.replace(`{${a}}`, b);
  return v;
};

let lastResult = null;
let lastSystems = null;
let llmConfig = 'pending'; // 'pending' | null (no AI) | { provider, model } | undefined (unknown)

function applyStatic() {
  document.documentElement.lang = LANG;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $$('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === LANG)));
  $$('.system').forEach(localizeSystem);
  $('#ask-chips').innerHTML = t('examples').map((q) => `<button type="button">${esc(q)}</button>`).join('');
  $$('#ask-chips button').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
  renderBadge();
}

function localizeSystem(node) {
  $('.sys-name', node).placeholder = t('sysNamePh');
  $('.sys-name', node).setAttribute('aria-label', t('sysNameAria'));
  $('.file-label', node).textContent = t('upload');
  $('.remove', node).setAttribute('aria-label', t('removeSys'));
}

async function setLang(lang) {
  if (lang === LANG) return;
  LANG = lang;
  try { localStorage.setItem('satuskema.lang', lang); } catch { /* storage blocked */ }
  applyStatic();
  $('#ask-out').innerHTML = '';
  // Findings, labels and SQL comments come from the server in the chosen language: re-run the analysis.
  if (lastSystems) await runAnalyze(lastSystems, { scroll: false });
}

// ---------- input ----------
function addSystem(name = '', sql = '') {
  const node = $('#system-tpl').content.firstElementChild.cloneNode(true);
  localizeSystem(node);
  $('.sys-name', node).value = name;
  $('.sys-sql', node).value = sql;
  $('.remove', node).addEventListener('click', () => {
    node.remove();
    if (!$$('.system').length) addSystem();
  });
  $('input[type=file]', node).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { alert(t('fileTooBig')); return; }
    $('.sys-sql', node).value = await f.text();
    if (!$('.sys-name', node).value) $('.sys-name', node).value = f.name.replace(/\.[^.]+$/, '');
  });
  $('#systems').append(node);
  return node;
}

function collectSystems() {
  return $$('.system').map((n, i) => ({ name: $('.sys-name', n).value.trim() || t('systemN', { n: i + 1 }), sql: $('.sys-sql', n).value }))
    .filter((s) => s.sql.trim());
}

async function loadSamples() {
  const res = await fetch('api/samples');
  const samples = await res.json();
  $('#systems').innerHTML = '';
  for (const s of samples) addSystem(s.name, s.sql);
}

async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, lang: LANG }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function runAnalyze(systemsArg, { scroll = true } = {}) {
  const systems = Array.isArray(systemsArg) ? systemsArg : collectSystems();
  if (!systems.length) { alert(t('needSchema')); return; }
  const btn = $('#btn-analyze');
  btn.disabled = true;
  btn.textContent = $('#opt-ai').checked ? t('analyzingAi') : t('analyzing');
  try {
    const result = await api('api/analyze', { systems, enrich: $('#opt-ai').checked });
    lastResult = result;
    lastSystems = systems;
    render(result);
    $('#results').hidden = false;
    if (scroll) $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    alert(t('analyzeFail') + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t('analyze');
  }
}

// ---------- render ----------
function render(r) {
  const sev = (s) => r.findings.filter((f) => f.severity === s).length;
  const pct = r.stats.columns ? Math.round((r.stats.mapped / r.stats.columns) * 100) : 0;
  $('#stats').innerHTML = [
    [t('stSystems'), r.stats.systems],
    [t('stTables'), r.stats.tables],
    [t('stColumns'), r.stats.columns],
    [t('stMapped'), `${pct}%`],
    [t('stDup'), r.entities.filter((e) => e.sources.length > 1).length],
    [t('stSevere'), sev('kritis') + sev('tinggi'), sev('kritis') ? 'alert' : ''],
  ].map(([k, v, cls]) => `<div class="stat ${cls || ''}"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('');

  const ai = r.ai;
  $('#ai-note').textContent = !ai ? t('aiOff')
    : ai.error ? t('aiUnused') + ai.error : t('aiAdded', { p: ai.provider, m: ai.model, n: ai.filled });

  renderFindings(r);
  renderEntities(r);
  renderErd(r);
  renderDictionary(r);
  $('#sql-out').textContent = r.sql;
  const warns = r.systems.flatMap((s) => s.warnings.map((w) => `${s.name}: ${w}`));
  if (warns.length) $('#tab-findings').insertAdjacentHTML('afterbegin', `<p class="error small">${warns.map(esc).join('<br>')}</p>`);
}

function renderFindings(r) {
  if (!r.findings.length) { $('#tab-findings').innerHTML = `<p class="muted">${esc(t('noFindings'))}</p>`; return; }
  const sevNames = t('sev');
  $('#tab-findings').innerHTML = r.findings.map((f) => `
    <article class="finding sev-${esc(f.severity)}">
      <h4><span class="sev">${esc(sevNames[f.severity] || f.severity)}</span>${esc(f.title)}</h4>
      <p>${esc(f.detail)}</p>
      <p class="fix"><strong>${esc(t('fix'))}</strong> ${esc(f.fix)}</p>
    </article>`).join('');
}

function confChip(c) {
  return `<span class="conf ${c < 0.75 ? 'low' : ''}" title="${esc(t('confTitle'))}">${Math.round(c * 100)}%</span>`;
}

function renderEntities(r) {
  if (!r.entities.length) { $('#tab-entities').innerHTML = `<p class="muted">${esc(t('noEntities'))}</p>`; return; }
  $('#tab-entities').innerHTML = r.entities.map((e) => {
    const canon = r.canonical.tables.find((x) => x.name === e.key);
    const cols = canon ? canon.columns : [];
    const head = e.sources.map((s) => `<th>${esc(s.system)}<br><code>${esc(s.table)}</code>${s.via ? ` <span class="tag">${esc(t('as'))} ${esc(s.via)}</span>` : ''}</th>`).join('');
    const rows = cols.map((c) => `<tr><td><strong>${esc(c.label)}</strong><br><code>${esc(c.name)}</code></td>${e.sources.map((s) => {
      const m = s.mapping[c.name];
      if (!m) return '<td class="empty">—</td>';
      const via = m.join ? `<br><span class="tag">${esc(t('via'))} ${esc(m.join.fkColumn)} → ${esc(m.join.table)}</span>` : '';
      return `<td><code>${esc(m.column)}</code> ${confChip(m.confidence)}<br><span class="muted small">${esc(m.type)}</span>${via}</td>`;
    }).join('')}</tr>`).join('');
    const refs = e.references.length ? `<p class="small">${esc(t('referencedBy'))}${e.references.map((x) => `<code>${esc(x.system)}.${esc(x.table)}.${esc(x.column)}</code>`).join(', ')}</p>` : '';
    return `<section class="entity">
      <h3>${esc(e.label)} <span class="tag">${esc(t('key'))}: ${esc(e.anchor.toUpperCase())}</span> <span class="tag">${e.sources.length} ${esc(t('sources'))}</span></h3>
      <p>${esc(e.desc)}</p>
      <div class="table-scroll"><table><thead><tr><th>${esc(t('canonAttr'))}</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      ${refs}
    </section>`;
  }).join('');
}

let mermaidReady = false;
let renderSeq = 0;
function initMermaid() {
  if (!window.mermaid || mermaidReady) return;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict', er: { useMaxWidth: true } });
  mermaidReady = true;
}

async function drawMermaid(el, code) {
  initMermaid();
  if (!window.mermaid) { el.innerHTML = `<pre class="code">${esc(code)}</pre>`; return; }
  try {
    const { svg } = await mermaid.render(`m${++renderSeq}`, code);
    el.innerHTML = svg;
  } catch (e) {
    el.innerHTML = `<p class="error small">${esc(t('erdFail'))}${esc(e.message || e)}</p><pre class="code">${esc(code)}</pre>`;
  }
}

let erdPending = false;
function renderErd(r) {
  const sel = $('#erd-system');
  const prev = sel.value;
  sel.innerHTML = r.mermaid.before.map((b, i) => `<option value="${i}">${esc(b.system)}</option>`).join('');
  if (prev && r.mermaid.before[prev]) sel.value = prev;
  sel.onchange = () => drawMermaid($('#erd-before'), r.mermaid.before[sel.value].code);
  erdPending = true;
  if (!$('#tab-erd').hidden) drawErdNow();
}
function drawErdNow() {
  if (!erdPending || !lastResult) return;
  erdPending = false;
  drawMermaid($('#erd-before'), lastResult.mermaid.before[$('#erd-system').value || 0].code);
  drawMermaid($('#erd-after'), lastResult.mermaid.after);
}

function dictRows(r, filter = '') {
  const q = filter.toLowerCase();
  return r.dictionary.filter((d) => !q || [d.system, d.table, d.column, d.concept, d.conceptLabel, d.description].join(' ').toLowerCase().includes(q));
}
function renderDictionary(r) {
  const draw = () => {
    const rows = dictRows(r, $('#dict-filter').value);
    $('#dict-table').innerHTML = `<thead><tr>${t('dictCols').map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((d) => `<tr>
      <td>${esc(d.system)}</td><td><code>${esc(d.table)}</code></td><td><code>${esc(d.column)}</code></td><td><code>${esc(d.type)}</code></td>
      <td>${[d.pk ? 'PK' : '', d.fk ? 'FK→' + esc(d.fk) : ''].filter(Boolean).join(' ')}</td>
      <td>${d.conceptLabel ? esc(d.conceptLabel) + (d.role ? ` <span class="tag">${esc(d.role)}</span>` : '') : '<span class="muted">—</span>'}</td>
      <td>${d.concept ? confChip(d.confidence) : ''}</td>
      <td>${d.description ? esc(d.description) + (d.descriptionSource && d.descriptionSource.startsWith('AI') ? ` <span class="src-ai">· ${esc(d.descriptionSource)}</span>` : '') : `<span class="muted">${esc(t('noDesc'))}</span>`}</td>
    </tr>`).join('')}</tbody>`;
  };
  $('#dict-filter').oninput = draw;
  draw();
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function dictCsv(r) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [t('csvHead').join(',')];
  for (const d of r.dictionary) lines.push([d.system, d.table, d.column, d.type, d.pk ? t('yes') : '', d.fk, d.concept, d.role, d.confidence || '', d.description, d.descriptionSource].map(q).join(','));
  return '﻿' + lines.join('\r\n');
}
function dictMd(r) {
  const out = [t('mdTitle'), ''];
  for (const s of r.systems) {
    out.push(`## ${s.name}`, '');
    for (const tb of s.tables) {
      out.push(`### \`${tb.name}\`${tb.entity ? ` (${tb.entity})` : ''}`, '');
      if (tb.comment || tb.aiDescription) out.push(tb.comment || tb.aiDescription, '');
      out.push(t('mdHead'), '|---|---|---|---|---|');
      for (const d of r.dictionary.filter((x) => x.system === s.name && x.table === tb.name)) {
        const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
        out.push(`| \`${cell(d.column)}\` | ${cell(d.type)} | ${[d.pk ? 'PK' : '', d.fk ? 'FK→' + d.fk : ''].filter(Boolean).join(' ')} | ${cell(d.conceptLabel || '')}${d.role ? ' (' + d.role + ')' : ''} | ${cell(d.description || '')} |`);
      }
      out.push('');
    }
  }
  return out.join('\n');
}

// ---------- ask ----------
function miniMarkdown(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const li = line.match(/^\s*[-*•]\s+(.*)$/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

async function ask(question) {
  if (!lastSystems) return;
  $('#ask-input').value = question;
  $('#ask-out').innerHTML = `<p class="muted">${esc(t('searching'))}</p>`;
  try {
    const r = await api('api/ask', { question, systems: lastSystems });
    $('#ask-out').innerHTML = miniMarkdown(r.answer) + `<p class="muted small">${esc(t('answerSource'))}: ${esc(r.provider)}${r.model ? ' / ' + esc(r.model) : ''}${r.note ? ' · ' + esc(r.note) : ''}</p>`;
  } catch (e) {
    $('#ask-out').innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}

function renderBadge() {
  const b = $('#ai-badge');
  if (llmConfig === 'pending') { b.textContent = 'AI: …'; return; }
  if (llmConfig === undefined) { b.textContent = t('aiBadgeUnknown'); return; }
  if (llmConfig) { b.textContent = `AI: ${llmConfig.provider}`; b.classList.add('on'); }
  else if (llmConfig === null) b.textContent = t('aiBadgeOff');
}

// ---------- wiring ----------
$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  $$('.tab').forEach((tab) => { tab.hidden = tab.id !== `tab-${b.dataset.tab}`; });
  if (b.dataset.tab === 'erd') drawErdNow();
}));
$$('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
$('#btn-add').addEventListener('click', () => addSystem().querySelector('.sys-name').focus());
$('#btn-sample').addEventListener('click', loadSamples);
$('#btn-analyze').addEventListener('click', () => runAnalyze());
$('#dl-csv').addEventListener('click', () => lastResult && download(`${t('fileDict')}.csv`, dictCsv(lastResult), 'text/csv;charset=utf-8'));
$('#dl-md').addEventListener('click', () => lastResult && download(`${t('fileDict')}.md`, dictMd(lastResult), 'text/markdown;charset=utf-8'));
$('#dl-sql').addEventListener('click', () => lastResult && download(t('fileSql'), lastResult.sql, 'text/plain;charset=utf-8'));
$('#copy-sql').addEventListener('click', async () => {
  if (!lastResult) return;
  try { await navigator.clipboard.writeText(lastResult.sql); $('#copy-sql').textContent = t('copied'); } catch { $('#copy-sql').textContent = t('copyFail'); }
  setTimeout(() => { $('#copy-sql').textContent = t('copy'); }, 1500);
});
$('#ask-form').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#ask-input').value.trim(); if (q) ask(q); });

fetch('api/config').then((r) => r.json()).then((c) => {
  llmConfig = c.llm || null;
  if (!c.llm) { $('#opt-ai').checked = false; $('#opt-ai').disabled = true; }
  renderBadge();
}).catch(() => { llmConfig = undefined; renderBadge(); });

addSystem();
applyStatic();
