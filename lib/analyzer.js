// Cross-system schema analysis: concept tagging, entity detection, findings, canonical model.
'use strict';

const { ABBREV, CONCEPTS, ENTITIES, EN, ENTITY_EN, ROLE_EN } = require('./concepts');

// Output language for labels, findings and SQL comments ('id' | 'en'). analyze() is synchronous,
// so a module-level setting is safe.
let LANG = 'id';
const isEn = () => LANG === 'en';
const cLabel = (k) => (isEn() && EN[k] ? EN[k][0] : CONCEPT_BY_KEY[k].label);
const cDesc = (k) => (isEn() && EN[k] ? EN[k][1] : CONCEPT_BY_KEY[k].desc);
const eLabel = (e) => (isEn() && ENTITY_EN[e.key] ? ENTITY_EN[e.key][0] : e.label);
const eDesc = (e) => (isEn() && ENTITY_EN[e.key] ? ENTITY_EN[e.key][1] : e.desc);
const roleName = (r) => (isEn() && ROLE_EN[r] ? ROLE_EN[r] : r);
const { parseDDL } = require('./parser');

const CONCEPT_BY_KEY = Object.fromEntries(CONCEPTS.map((c) => [c.key, c]));
const ALIAS_INDEX = new Map();
for (const c of CONCEPTS) {
  ALIAS_INDEX.set(c.key, c.key);
  for (const a of c.aliases) if (!ALIAS_INDEX.has(a)) ALIAS_INDEX.set(a, c.key);
}

// Suffix tokens that mean "this person is NOT the subject of the row" (e.g. nik_ibu on a balita table).
const ROLES = new Set(['ibu', 'ayah', 'pemilik', 'pelapor', 'atasan', 'penilai', 'suami', 'istri', 'wali', 'kepala', 'petugas', 'penanggung_jawab', 'pj', 'pendamping', 'verifikator']);

function tokens(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function normalize(name) {
  const out = [];
  for (const t of tokens(name)) out.push(...(ABBREV[t] || t).split('_'));
  // collapse "nomor_nik" style duplicates produced by expansion (no_ktp -> nomor_nik)
  return out.join('_');
}

function baseType(type) {
  const t = String(type).toLowerCase();
  if (/^(tiny|small|medium|big)?int|^integer|^serial|^bigserial|^smallserial|^number/.test(t)) return /^big/.test(t) || /bigserial/.test(t) ? 'bigint' : 'int';
  if (/^(decimal|numeric|float|double|real)/.test(t)) return 'desimal';
  if (/^(date|datetime|timestamp|time)/.test(t)) return 'tanggal';
  if (/^(bool)/.test(t)) return 'boolean';
  if (/^enum|^set/.test(t)) return 'enum';
  if (/char|text|string|uuid|clob/.test(t)) return 'teks';
  return t || '?';
}

function typeCompatible(conceptKey, type) {
  const b = baseType(type);
  const c = CONCEPT_BY_KEY[conceptKey];
  const ct = baseType(c.type);
  if (ct === 'tanggal') return b === 'tanggal' || b === 'teks';
  if (['latitude', 'longitude'].includes(conceptKey)) return b === 'desimal' || b === 'teks';
  if (ct === 'teks') return b !== 'tanggal' && b !== 'boolean' && b !== 'desimal';
  return true;
}

function tagColumn(col) {
  const norm = normalize(col.name);
  const toks = norm.split('_');
  let role = null;
  let core = norm;
  // role detection: last token(s) in ROLES and the rest is a known concept
  for (let k = 1; k <= 2 && k < toks.length; k++) {
    const suffix = toks.slice(-k).join('_');
    const rest = toks.slice(0, -k).join('_');
    if (ROLES.has(suffix) && ALIAS_INDEX.has(rest)) { role = suffix; core = rest; break; }
  }
  let key = ALIAS_INDEX.get(core) || null;
  let confidence = key ? (core === key ? 0.97 : 0.9) : 0;
  let method = key ? 'alias' : null;

  if (!key) {
    // fuzzy: a multi-token alias fully contained in the column name with at most one extra token
    // (nomor_telepon_rumah -> telepon). Single-token aliases are excluded to avoid nama_posyandu -> nama orang.
    let best = { key: null, score: 0 };
    const set = new Set(toks);
    for (const c of CONCEPTS) {
      for (const a of [c.key, ...c.aliases]) {
        const at = a.split('_');
        if (at.length < 2 || !at.every((t) => set.has(t)) || toks.length - at.length > 1) continue;
        const score = at.length / toks.length;
        if (score > best.score) best = { key: c.key, score };
      }
    }
    if (best.key) { key = best.key; confidence = Math.round((0.55 + best.score * 0.2) * 100) / 100; method = 'fuzzy'; }
  }

  if (!key && col.comment) {
    const cm = normalize(col.comment);
    for (const c of CONCEPTS) {
      if (cm.includes(c.key) || cm.includes(normalize(c.label))) { key = c.key; confidence = 0.7; method = 'komentar'; break; }
    }
  }

  if (key && !typeCompatible(key, col.type)) { confidence = Math.max(0.3, confidence - 0.35); method += '+tipe-meragukan'; }
  if (!key) return { concept: null, role: null, confidence: 0, method: null, normalized: norm };
  return { concept: key, role, confidence: Math.round(confidence * 100) / 100, method, normalized: norm };
}

function classifyTable(table) {
  const subject = new Set(table.columns.filter((c) => c.tag.concept && !c.tag.role).map((c) => c.tag.concept));
  const has = (k) => subject.has(k);
  let entity = null;
  if (has('nip')) entity = 'pegawai';
  else if (has('nib') || has('nama_usaha') || has('npwp')) entity = 'badan_usaha';
  else if (has('nik') || (has('nama_lengkap') && (has('tanggal_lahir') || has('jenis_kelamin') || has('no_kk')))) entity = 'penduduk';
  if (!entity) return { entity: null, score: 0, kind: null };
  const def = ENTITIES.find((e) => e.key === entity);
  const descriptive = [...subject].filter((k) => k !== def.anchor && (def.members.includes(k) || PERSON_ATTRS.includes(k))).length;
  // Anchor only (e.g. skp.nip, realisasi_harian.nip): a transaction table that references the entity.
  if (descriptive < 2) {
    const anchorCol = table.columns.find((c) => c.tag.concept === def.anchor && !c.tag.role);
    return { entity, score: 0, kind: 'referensi', via: anchorCol ? anchorCol.name : null };
  }
  const hit = def.members.filter((m) => subject.has(m)).length;
  const score = Math.min(1, (hit + (subject.has(def.anchor) ? 2 : 0)) / Math.min(def.members.length, 7));
  return { entity, score: Math.round(score * 100) / 100, kind: 'master' };
}

const PERSON_ATTRS = ['nama_lengkap', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin', 'alamat', 'no_kk'];

function sqlType(t) {
  return t.replace(/^char\((\d+)\)$/, 'varchar($1)').toUpperCase();
}

function analyze(systems, opts = {}) {
  LANG = opts.lang === 'en' ? 'en' : 'id';
  const parsed = systems.map((s, i) => {
    const name = String(s.name || `sistem_${i + 1}`).trim() || `sistem_${i + 1}`;
    const { tables, warnings } = parseDDL(s.sql);
    for (const t of tables) for (const c of t.columns) c.tag = tagColumn(c);
    for (const t of tables) t.classification = classifyTable(t);
    return { name, slug: slugify(name), tables, warnings };
  });

  const dictionary = [];
  for (const s of parsed) {
    for (const t of s.tables) {
      for (const c of t.columns) {
        const concept = c.tag.concept ? CONCEPT_BY_KEY[c.tag.concept] : null;
        dictionary.push({
          system: s.name, table: t.name, column: c.name, type: c.type,
          pk: c.pk, fk: c.ref ? `${c.ref.table}.${c.ref.column}` : null,
          concept: c.tag.concept, conceptLabel: concept ? cLabel(concept.key) : null,
          role: c.tag.role ? roleName(c.tag.role) : null, confidence: c.tag.confidence, method: c.tag.method,
          description: c.comment || (concept ? describe(concept, c.tag.role) : null),
          descriptionSource: c.comment ? (isEn() ? 'DDL comment' : 'komentar DDL') : concept ? (isEn() ? 'SatuSkema vocabulary' : 'kosakata SatuSkema') : null,
        });
      }
    }
  }

  // Entity clusters across systems
  const entities = ENTITIES.map((e) => ({
    key: e.key, label: eLabel(e), desc: eDesc(e), anchor: e.anchor,
    sources: [], references: [],
  }));
  const penduduk = entities.find((e) => e.key === 'penduduk');
  const pendudukDef = ENTITIES.find((e) => e.key === 'penduduk');
  for (const s of parsed) {
    for (const t of s.tables) {
      const cl = t.classification;
      if (!cl.entity) continue;
      const ent = entities.find((e) => e.key === cl.entity);
      if (cl.kind === 'referensi') {
        ent.references.push({ system: s.name, table: t.name, column: cl.via });
        continue;
      }
      const mapping = {};
      for (const c of t.columns) {
        if (c.tag.concept && !c.tag.role && !mapping[c.tag.concept]) mapping[c.tag.concept] = { column: c.name, type: c.type, confidence: c.tag.confidence };
      }
      // Owner identity through a foreign key (usaha.pelaku_id -> pelaku_usaha.no_ktp).
      if (cl.entity !== 'penduduk' && !mapping.nik) {
        for (const c of t.columns) {
          if (!c.ref) continue;
          const target = s.tables.find((x) => x.name === c.ref.table);
          const nikCol = target && target.columns.find((x) => x.tag.concept === 'nik' && !x.tag.role);
          if (nikCol) {
            mapping.nik = { column: nikCol.name, type: nikCol.type, confidence: Math.min(0.85, nikCol.tag.confidence),
              join: { table: target.name, fkColumn: c.name, refColumn: c.ref.column } };
            break;
          }
        }
      }
      ent.sources.push({ system: s.name, systemSlug: s.slug, table: t.name, score: cl.score, mapping });
      // A pegawai / pelaku usaha is also a person: its personal attributes feed the penduduk master.
      if (cl.entity !== 'penduduk' && mapping.nik && !mapping.nik.join) {
        const personMap = Object.fromEntries(Object.entries(mapping).filter(([k]) => pendudukDef.members.includes(k)));
        if (Object.keys(personMap).some((k) => PERSON_ATTRS.includes(k))) {
          penduduk.sources.push({ system: s.name, systemSlug: s.slug, table: t.name, score: cl.score, mapping: personMap, via: cl.entity });
        }
      }
    }
  }
  const activeEntities = entities.filter((e) => e.sources.length);

  // Person references by role (e.g. nik_ibu): links to penduduk
  const roleRefs = [];
  for (const s of parsed) for (const t of s.tables) for (const c of t.columns) {
    if (c.tag.role && ['nik', 'nip', 'nama_lengkap'].includes(c.tag.concept)) {
      roleRefs.push({ system: s.name, table: t.name, column: c.name, concept: c.tag.concept, role: c.tag.role, hasFk: !!c.ref });
    }
  }

  const findings = buildFindings(parsed, activeEntities, roleRefs);
  const canonical = buildCanonical(parsed, activeEntities);
  const stats = {
    systems: parsed.length,
    tables: parsed.reduce((a, s) => a + s.tables.length, 0),
    columns: dictionary.length,
    mapped: dictionary.filter((d) => d.concept).length,
    duplicatedColumns: activeEntities.reduce((a, e) => a + (e.sources.length > 1 ? e.sources.reduce((b, src) => b + Object.keys(src.mapping).length, 0) : 0), 0),
  };

  return {
    systems: parsed.map((s) => ({ name: s.name, slug: s.slug, warnings: s.warnings, tables: s.tables.map(publicTable) })),
    dictionary,
    entities: activeEntities,
    roleRefs,
    findings,
    canonical,
    stats,
    mermaid: {
      before: parsed.map((s) => ({ system: s.name, code: erdForSystem(s) })),
      after: erdCanonical(canonical),
    },
    sql: migrationSql(canonical, activeEntities),
  };
}

function describe(concept, role) {
  if (!role) return cDesc(concept.key);
  return isEn() ? `${cDesc(concept.key)} Refers to the ${roleName(role)} (not the subject of this row).`
    : `${cDesc(concept.key)} Merujuk ke ${role} (bukan subjek baris ini).`;
}

function publicTable(t) {
  return {
    name: t.name, comment: t.comment, entity: t.classification.entity, entityScore: t.classification.score,
    columns: t.columns.map((c) => ({ name: c.name, type: c.type, pk: c.pk, nullable: c.nullable, ref: c.ref, comment: c.comment, ...c.tag })),
  };
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'sistem';
}

function buildFindings(parsed, entities, roleRefs) {
  const en = isEn();
  const f = [];
  // 1. Same entity stored in many systems
  for (const e of entities) {
    const lbl = en ? e.label.charAt(0).toLowerCase() + e.label.slice(1) : e.label.toLowerCase();
    const A = e.anchor.toUpperCase();
    if (e.sources.length > 1) {
      const cols = e.sources.reduce((a, s) => a + Object.keys(s.mapping).length, 0);
      const nSys = new Set(e.sources.map((s) => s.system)).size;
      const where = e.sources.map((s) => `${s.system}.${s.table}${s.via ? (en ? ` (as ${s.via})` : ` (sebagai ${s.via})`) : ''}`).join(', ');
      f.push({ severity: 'tinggi', kind: 'duplikasi-entitas',
        title: en ? `${e.label} data is stored again in ${e.sources.length} tables across ${nSys} systems`
          : `Data ${lbl} disimpan ulang di ${e.sources.length} tabel pada ${nSys} sistem`,
        detail: en ? `${cols} ${lbl} attribute columns are written repeatedly: ${where}. One change (e.g. moving house) must be updated everywhere, and the copies easily contradict each other.`
          : `${cols} kolom atribut ${lbl} ditulis berulang: ${where}. Satu perubahan (mis. pindah alamat) harus diperbarui di semua tempat dan hasilnya mudah saling bertentangan.`,
        fix: en ? `Make ${e.key} a single master table keyed by ${A}; other systems only store ${e.anchor} and read attributes from the master.`
          : `Jadikan ${e.key} master data tunggal dengan kunci ${A}; sistem lain cukup menyimpan ${e.anchor} lalu membaca atribut dari master.` });
    }
    for (const src of e.sources.filter((x) => !x.mapping[e.anchor])) {
      const ref = CONCEPT_BY_KEY[e.anchor].ref;
      f.push({ severity: 'tinggi', kind: 'tanpa-kunci-identitas',
        title: en ? `${src.system}.${src.table} stores ${lbl} without ${A}` : `${src.system}.${src.table} menyimpan ${lbl} tanpa ${A}`,
        detail: en ? 'Rows in this table cannot be linked reliably to other systems; matching is only possible by name + date of birth (prone to wrong-person matches).'
          : 'Baris di tabel ini tidak bisa dihubungkan secara pasti ke sistem lain; pencocokan hanya bisa lewat nama + tanggal lahir (rawan salah orang).',
        fix: en ? `Add a ${e.anchor} column (${sqlType(CONCEPT_BY_KEY[e.anchor].type)}) and fill it gradually by verifying against ${ref || 'the official source'}.`
          : `Tambahkan kolom ${e.anchor} (${sqlType(CONCEPT_BY_KEY[e.anchor].type)}) dan isi bertahap melalui verifikasi ke ${ref || 'sumber resmi'}.` });
    }
    const looseRefs = e.references.filter((r) => {
      const s = parsed.find((x) => x.name === r.system);
      const t = s && s.tables.find((x) => x.name === r.table);
      const c = t && t.columns.find((x) => x.name === r.column);
      return c && !c.ref;
    });
    if (looseRefs.length) {
      f.push({ severity: 'rendah', kind: 'referensi-longgar',
        title: en ? `${looseRefs.length} transaction ${looseRefs.length === 1 ? "table references" : "tables reference"} ${lbl} without a foreign key`
          : `${looseRefs.length} tabel transaksi merujuk ${lbl} tanpa foreign key`,
        detail: looseRefs.map((r) => `${r.system}.${r.table}.${r.column}`).join(', '),
        fix: en ? `Add a FOREIGN KEY to ${e.key}(${e.anchor}).` : `Tambahkan FOREIGN KEY ke ${e.key}(${e.anchor}).` });
    }
  }
  // 2. Type inconsistency per concept
  const byConcept = {};
  for (const s of parsed) for (const t of s.tables) for (const c of t.columns) {
    if (!c.tag.concept) continue;
    (byConcept[c.tag.concept] ||= []).push({ where: `${s.name}.${t.name}.${c.name}`, type: c.type, base: baseType(c.type) });
  }
  for (const [k, list] of Object.entries(byConcept)) {
    const concept = CONCEPT_BY_KEY[k];
    const label = cLabel(k);
    const bases = new Set(list.map((x) => x.base));
    if (['nik', 'no_kk', 'nip', 'nib'].includes(k)) {
      const digits = concept.type.match(/\d+/)[0];
      const numeric = list.filter((x) => x.base === 'int' || x.base === 'bigint' || x.base === 'desimal');
      for (const n of numeric) {
        const overflow = n.base === 'int';
        f.push({ severity: overflow ? 'kritis' : 'tinggi', kind: 'tipe-identitas',
          title: en ? `${label} stored as a number in ${n.where} (${n.type})` : `${label} disimpan sebagai angka di ${n.where} (${n.type})`,
          detail: overflow
            ? (en ? `${label} has ${digits} digits, while INT tops out at about 2.1 billion (10 digits). Values are certainly truncated or rejected.`
              : `${label} berisi ${digits} digit, sedangkan INT maksimal ±2,1 miliar (10 digit). Nilai pasti terpotong/gagal disimpan.`)
            : (en ? 'An identifier is not a quantity: its length cannot be validated, leading zeros are lost, and joins with systems that store it as text fail.'
              : 'Identitas bukan bilangan: tidak bisa divalidasi panjangnya, angka nol di depan hilang, dan join ke sistem lain yang memakai teks akan gagal.'),
          fix: en ? `Change to ${sqlType(concept.type)} and add CHECK length = ${digits}.` : `Ubah ke ${sqlType(concept.type)} dan tambahkan CHECK panjang = ${digits}.` });
      }
    }
    if (bases.size > 1 && !['nik', 'no_kk', 'nip', 'nib'].includes(k)) {
      f.push({ severity: 'sedang', kind: 'tipe-tidak-konsisten',
        title: en ? `${label} uses ${bases.size} different types` : `${label} memakai ${bases.size} tipe berbeda`,
        detail: list.map((x) => `${x.where}: ${x.type}`).join('; '),
        fix: en ? `Standardise to ${sqlType(concept.type)}.` : `Seragamkan ke ${sqlType(concept.type)}.` });
    }
  }
  // 3. Region as free text
  for (const s of parsed) for (const t of s.tables) {
    const subj = new Set(t.columns.map((c) => c.tag.concept));
    if ((subj.has('nama_kelurahan') || subj.has('nama_kecamatan')) && !subj.has('kode_kelurahan')) {
      f.push({ severity: 'sedang', kind: 'wilayah-teks',
        title: en ? `Region stored as free text in ${s.name}.${t.name}` : `Wilayah disimpan sebagai teks bebas di ${s.name}.${t.name}`,
        detail: en ? 'Village/district names are spelled inconsistently ("Kebayoran Baru" vs "Kby. Baru"), so per-region aggregation is inaccurate and cannot be joined with other systems.'
          : 'Ejaan nama kelurahan/kecamatan bisa berbeda-beda ("Kebayoran Baru" vs "Kby. Baru"), sehingga agregasi per wilayah tidak akurat dan tidak bisa dihubungkan ke sistem lain.',
        fix: en ? 'Add a kode_kelurahan column (official Ministry of Home Affairs code) referencing ref_wilayah.'
          : 'Tambahkan kolom kode_kelurahan (kode Kemendagri) yang merujuk ke ref_wilayah.' });
    }
  }
  // 4. Tables without PK
  for (const s of parsed) for (const t of s.tables) {
    if (!t.columns.some((c) => c.pk)) {
      f.push({ severity: 'sedang', kind: 'tanpa-pk',
        title: en ? `Table ${s.name}.${t.name} has no primary key` : `Tabel ${s.name}.${t.name} tidak punya primary key`,
        detail: en ? 'Duplicate rows cannot be prevented and replication/synchronisation between systems becomes fragile.'
          : 'Baris duplikat tidak bisa dicegah dan replikasi/sinkronisasi antarsistem menjadi rawan.',
        fix: en ? 'Add a primary key (surrogate id or a natural key such as NIK/NIP).' : 'Tambahkan primary key (surrogate id atau kunci alami seperti NIK/NIP).' });
    }
  }
  // 5. Person references without FK
  const loose = roleRefs.filter((r) => !r.hasFk && r.concept !== 'nama_lengkap');
  if (loose.length) {
    f.push({ severity: 'rendah', kind: 'referensi-longgar',
      title: en ? `${loose.length} ${loose.length === 1 ? "column references" : "columns reference"} other people without a foreign key` : `${loose.length} kolom merujuk orang lain tanpa foreign key`,
      detail: loose.map((r) => `${r.system}.${r.table}.${r.column} (${roleName(r.role)})`).join(', '),
      fix: en ? 'Once the resident/civil-servant master exists, turn these into foreign keys to it.'
        : 'Setelah master penduduk/pegawai tersedia, ubah menjadi foreign key ke master tersebut.' });
  }
  const nameRefs = roleRefs.filter((r) => r.concept === 'nama_lengkap');
  if (nameRefs.length) {
    f.push({ severity: 'rendah', kind: 'nama-tanpa-id',
      title: en ? `${nameRefs.length} ${nameRefs.length === 1 ? "column stores" : "columns store"} another person's name without an ID` : `${nameRefs.length} kolom menyimpan nama orang lain tanpa identitas`,
      detail: nameRefs.map((r) => `${r.system}.${r.table}.${r.column}`).join(', '),
      fix: en ? "Store that person's NIK and read the name from the resident master." : 'Simpan NIK orang tersebut, lalu ambil nama dari master penduduk.' });
  }
  const order = { kritis: 0, tinggi: 1, sedang: 2, rendah: 3 };
  return f.sort((a, b) => order[a.severity] - order[b.severity]);
}

function buildCanonical(parsed, entities) {
  const tables = [];
  const usesWilayah = parsed.some((s) => s.tables.some((t) => t.columns.some((c) => CONCEPT_BY_KEY[c.tag.concept]?.group === 'wilayah')));
  for (const e of entities) {
    const def = ENTITIES.find((x) => x.key === e.key);
    const present = new Set([def.anchor]);
    for (const src of e.sources) for (const k of Object.keys(src.mapping)) if (def.members.includes(k)) present.add(k);
    // region text columns collapse into kode_kelurahan
    for (const src of e.sources) if (src.mapping.nama_kelurahan || src.mapping.nama_kecamatan) present.add('kode_kelurahan');
    const cols = def.members.filter((m) => present.has(m)).map((m) => {
      const c = CONCEPT_BY_KEY[m];
      let ref = null;
      if (m === 'kode_kelurahan') ref = { table: 'ref_wilayah', column: 'kode' };
      if (m === 'nik' && e.key !== 'penduduk') ref = { table: 'penduduk', column: 'nik' };
      return { name: m, type: c.type, pk: m === def.anchor, label: cLabel(m), ref };
    });
    tables.push({ name: e.key, label: e.label, desc: e.desc, columns: cols });
  }
  if (entities.some((e) => e.key !== 'penduduk') && !tables.find((t) => t.name === 'penduduk') && tables.some((t) => t.columns.some((c) => c.name === 'nik'))) {
    tables.push({ name: 'penduduk', label: eLabel({ key: 'penduduk', label: 'Penduduk' }), desc: isEn() ? 'Resident master (NIK reference).' : 'Master penduduk (referensi NIK).', columns: [
      { name: 'nik', type: 'char(16)', pk: true, label: cLabel('nik'), ref: null },
      { name: 'nama_lengkap', type: 'varchar(150)', pk: false, label: cLabel('nama_lengkap'), ref: null },
    ] });
  }
  if (usesWilayah) {
    const en = isEn();
    tables.push({ name: 'ref_wilayah', label: en ? 'Region reference' : 'Referensi Wilayah', desc: en ? 'Official administrative region codes (Ministry of Home Affairs), province down to village.' : 'Kode wilayah administrasi Kemendagri (provinsi s.d. kelurahan/desa).', columns: [
      { name: 'kode', type: 'varchar(13)', pk: true, label: en ? 'Region code' : 'Kode Wilayah', ref: null },
      { name: 'nama', type: 'varchar(100)', pk: false, label: en ? 'Region name' : 'Nama Wilayah', ref: null },
      { name: 'tingkat', type: 'varchar(12)', pk: false, label: en ? 'Level' : 'Tingkat', ref: null },
      { name: 'kode_induk', type: 'varchar(13)', pk: false, label: en ? 'Parent code' : 'Kode Induk', ref: { table: 'ref_wilayah', column: 'kode' } },
    ] });
  }
  return { tables };
}

// ---------- Mermaid ----------
function mId(s) { return String(s).replace(/[^A-Za-z0-9_]/g, '_'); }
function mType(t) { return String(t).toLowerCase().replace(/\(.*\)/, '').replace(/[^a-z0-9_]/g, '_') || 'any'; }

function erdForSystem(s) {
  const lines = ['erDiagram'];
  const names = new Set(s.tables.map((t) => t.name));
  for (const t of s.tables) {
    lines.push(`  ${mId(t.name)} {`);
    for (const c of t.columns) {
      const keys = [c.pk ? 'PK' : null, c.ref ? 'FK' : null].filter(Boolean).join(',');
      const note = c.tag.concept ? ` "${cLabel(c.tag.concept).replace(/"/g, '')}${c.tag.role ? ' (' + roleName(c.tag.role) + ')' : ''}"` : '';
      lines.push(`    ${mType(c.type)} ${mId(c.name)}${keys ? ' ' + keys : ''}${note}`);
    }
    lines.push('  }');
  }
  for (const t of s.tables) for (const c of t.columns) {
    if (c.ref && names.has(c.ref.table)) lines.push(`  ${mId(c.ref.table)} ||--o{ ${mId(t.name)} : "${mId(c.name)}"`);
  }
  return lines.join('\n');
}

function erdCanonical(canonical) {
  const lines = ['erDiagram'];
  for (const t of canonical.tables) {
    lines.push(`  ${mId(t.name)} {`);
    for (const c of t.columns) {
      const keys = [c.pk ? 'PK' : null, c.ref ? 'FK' : null].filter(Boolean).join(',');
      lines.push(`    ${mType(c.type)} ${mId(c.name)}${keys ? ' ' + keys : ''} "${c.label.replace(/"/g, '')}"`);
    }
    lines.push('  }');
  }
  const names = new Set(canonical.tables.map((t) => t.name));
  for (const t of canonical.tables) for (const c of t.columns) {
    if (c.ref && names.has(c.ref.table)) lines.push(`  ${mId(c.ref.table)} ||--o{ ${mId(t.name)} : "${mId(c.name)}"`);
  }
  return lines.join('\n');
}

// ---------- SQL ----------
function qi(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
function ql(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

const IDENTITY_KEYS = ['nik', 'no_kk', 'nip', 'nib'];

function castExpr(col, srcType, target, conceptKey, alias = 'src') {
  const tt = sqlType(target);
  const src = `${alias}.${qi(col)}`;
  const b = baseType(srcType);
  if (conceptKey === 'jenis_kelamin') {
    return `CASE WHEN UPPER(LEFT(CAST(${src} AS VARCHAR), 1)) IN ('L', 'M', '1') THEN 'L' WHEN UPPER(LEFT(CAST(${src} AS VARCHAR), 1)) IN ('P', 'F', 'W', '2') THEN 'P' END`;
  }
  const len = (target.match(/\d+/) || [])[0];
  if (/^char\(\d+\)$/.test(target) && (b === 'int' || b === 'bigint' || b === 'desimal')) {
    return `LPAD(CAST(${src} AS VARCHAR(${len})), ${len}, '0')`;
  }
  return `CAST(${src} AS ${tt})`;
}

function migrationSql(canonical, entities) {
  const out = [
    ...(isEn() ? [
      '-- SatuSkema: canonical schema + consolidation views (PostgreSQL dialect).',
      '-- Run on an integration database that can read the source schemas (e.g. via postgres_fdw / dblink),',
      '-- where each source system is mounted as a schema with the same name.',
    ] : [
      '-- SatuSkema: skema kanonik + view konsolidasi (dialek PostgreSQL).',
      '-- Jalankan di database integrasi yang dapat membaca skema sumber (mis. via postgres_fdw / dblink),',
      '-- di mana tiap sistem sumber dipasang sebagai schema dengan nama yang sama.',
    ]),
    '',
  ];
  const ordered = [...canonical.tables].sort((a, b) => rank(a.name) - rank(b.name));
  for (const t of ordered) {
    out.push(`CREATE TABLE IF NOT EXISTS ${qi(t.name)} (`);
    const defs = t.columns.map((c) => {
      let d = `  ${qi(c.name)} ${sqlType(c.type)}${c.pk ? ' PRIMARY KEY' : ''}`;
      const len = (c.type.match(/^char\((\d+)\)$/) || [])[1];
      if (len && IDENTITY_KEYS.includes(c.name)) d += ` CHECK (char_length(${qi(c.name)}) = ${len} AND ${qi(c.name)} ~ '^[0-9]+$')`;
      if (c.name === 'jenis_kelamin') d += ` CHECK (${qi(c.name)} IN ('L','P'))`;
      if (c.ref) d += ` REFERENCES ${qi(c.ref.table)}(${qi(c.ref.column)})`;
      return d;
    });
    out.push(defs.join(',\n'));
    out.push(');');
    out.push(`COMMENT ON TABLE ${qi(t.name)} IS ${ql(t.desc)};`);
    out.push('');
  }
  for (const e of entities) {
    const target = canonical.tables.find((t) => t.name === e.key);
    if (!target) continue;
    out.push(isEn() ? `-- Union of all ${e.label} sources (${e.sources.length} tables)` : `-- Gabungan seluruh sumber ${e.label} (${e.sources.length} tabel)`);
    out.push(`CREATE OR REPLACE VIEW ${qi('v_' + e.key + '_gabungan')} AS`);
    const selects = e.sources.map((src) => {
      const cols = [`  ${ql(src.system)} AS sumber_sistem`, `  ${ql(src.table)} AS sumber_tabel`];
      const joins = [];
      for (const c of target.columns) {
        const m = src.mapping[c.name];
        if (m && m.join) {
          const alias = `j${joins.length + 1}`;
          joins.push(`LEFT JOIN ${qi(src.systemSlug)}.${qi(m.join.table)} AS ${alias} ON ${alias}.${qi(m.join.refColumn)} = src.${qi(m.join.fkColumn)}`);
          cols.push(`  ${castExpr(m.column, m.type, c.type, c.name, alias)} AS ${qi(c.name)}`);
        } else if (m) cols.push(`  ${castExpr(m.column, m.type, c.type, c.name)} AS ${qi(c.name)}`);
        else cols.push(`  CAST(NULL AS ${sqlType(c.type)}) AS ${qi(c.name)}`);
      }
      return `SELECT\n${cols.join(',\n')}\nFROM ${qi(src.systemSlug)}.${qi(src.table)} AS src${joins.length ? '\n' + joins.join('\n') : ''}`;
    });
    out.push(selects.join('\nUNION ALL\n') + ';');
    out.push('');
    if (isEn()) {
      out.push(`-- Consolidation: one row per ${e.anchor.toUpperCase()} (first row per key; adjust ORDER BY for source priority).`);
      out.push('-- Region code columns are loaded after ref_wilayah is filled from official Ministry data.');
    } else {
      out.push(`-- Konsolidasi: satu baris per ${e.anchor.toUpperCase()} (baris pertama per kunci; atur ORDER BY untuk prioritas sumber).`);
      out.push('-- Kolom kode wilayah dimuat setelah ref_wilayah diisi dari data Kemendagri.');
    }
    const colsList = target.columns.filter((c) => !c.ref || c.name === 'nik').map((c) => qi(c.name));
    out.push(`INSERT INTO ${qi(e.key)} (${colsList.join(', ')})`);
    out.push(`SELECT DISTINCT ON (${qi(e.anchor)}) ${colsList.join(', ')}`);
    out.push(`FROM ${qi('v_' + e.key + '_gabungan')}`);
    out.push(`WHERE ${qi(e.anchor)} IS NOT NULL`);
    out.push(`ORDER BY ${qi(e.anchor)}`);
    out.push(`ON CONFLICT (${qi(e.anchor)}) DO NOTHING;`);
    out.push('');
  }
  return out.join('\n');
}

function rank(name) {
  return { ref_wilayah: 0, penduduk: 1 }[name] ?? 2;
}

module.exports = { analyze, normalize, tagColumn, baseType };
