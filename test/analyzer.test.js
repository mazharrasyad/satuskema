'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseDDL } = require('../lib/parser');
const { analyze, tagColumn } = require('../lib/analyzer');
const { search } = require('../lib/search');

const SAMPLES = path.join(__dirname, '..', 'samples');
const samples = () => fs.readdirSync(SAMPLES).map((f) => ({ name: f.replace(/\.sql$/, ''), sql: fs.readFileSync(path.join(SAMPLES, f), 'utf8') }));

test('parser: MySQL backticks, inline & constraint keys, comments', () => {
  const { tables } = parseDDL(`
    -- komentar
    CREATE TABLE IF NOT EXISTS \`db\`.\`warga\` (
      \`id\` int(11) NOT NULL AUTO_INCREMENT,
      \`nik\` char(16) NOT NULL COMMENT 'Nomor induk; wajib',
      \`kel_id\` int REFERENCES kelurahan(id),
      harga decimal(10,2),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY uk_nik (nik)
    ) ENGINE=InnoDB COMMENT='data warga';
    ALTER TABLE warga ADD CONSTRAINT fk1 FOREIGN KEY (harga) REFERENCES x(y);`);
  assert.strictEqual(tables.length, 1);
  const t = tables[0];
  assert.strictEqual(t.name, 'warga');
  assert.strictEqual(t.comment, 'data warga');
  assert.deepStrictEqual(t.columns.map((c) => c.name), ['id', 'nik', 'kel_id', 'harga']);
  assert.ok(t.columns[0].pk);
  assert.strictEqual(t.columns[1].comment, 'Nomor induk; wajib');
  assert.ok(t.columns[1].unique);
  assert.deepStrictEqual(t.columns[2].ref, { table: 'kelurahan', column: 'id' });
  assert.strictEqual(t.columns[3].type, 'decimal(10,2)');
  assert.deepStrictEqual(t.columns[3].ref, { table: 'x', column: 'y' });
});

test('parser: PostgreSQL schema-qualified names and COMMENT ON', () => {
  const { tables } = parseDDL(`CREATE TABLE public.usaha (id SERIAL PRIMARY KEY, kd_kel VARCHAR(13), dibuat timestamp with time zone);
    COMMENT ON COLUMN public.usaha.kd_kel IS 'kode kelurahan';`);
  assert.strictEqual(tables[0].name, 'usaha');
  assert.strictEqual(tables[0].columns[1].comment, 'kode kelurahan');
  assert.strictEqual(tables[0].columns[2].type, 'timestamp with time zone');
});

test('tagging: abbreviations, roles, and no false positives', () => {
  const t = (name, type = 'varchar(50)') => tagColumn({ name, type });
  assert.strictEqual(t('no_ktp').concept, 'nik');
  assert.strictEqual(t('tgl_lhr', 'date').concept, 'tanggal_lahir');
  assert.strictEqual(t('kd_kel').concept, 'kode_kelurahan');
  assert.strictEqual(t('noTelpRumah').concept, 'telepon');
  const ibu = t('nik_ibu');
  assert.strictEqual(ibu.concept, 'nik');
  assert.strictEqual(ibu.role, 'ibu');
  assert.strictEqual(t('nama_posyandu').concept, null);
  assert.strictEqual(t('tanggal_periksa', 'date').concept, null);
});

test('analyze samples: entities, findings, SQL', () => {
  const r = analyze(samples());
  const penduduk = r.entities.find((e) => e.key === 'penduduk');
  assert.strictEqual(penduduk.sources.length, 4, 'penduduk spans 4 systems');
  const pegawai = r.entities.find((e) => e.key === 'pegawai');
  assert.strictEqual(pegawai.sources.length, 1, 'skp/realisasi are references, not masters');
  assert.strictEqual(pegawai.references.length, 2);
  const usaha = r.entities.find((e) => e.key === 'badan_usaha');
  assert.ok(usaha.sources[0].mapping.nik.join, 'owner NIK resolved through FK');
  assert.strictEqual(r.findings[0].severity, 'kritis');
  assert.match(r.findings[0].title, /nik_ibu/);
  assert.ok(r.findings.some((f) => f.kind === 'tanpa-kunci-identitas'));
  assert.ok(r.findings.some((f) => f.kind === 'tanpa-pk' && /realisasi_harian/.test(f.title)));
  assert.match(r.sql, /CREATE OR REPLACE VIEW "v_penduduk_gabungan"/);
  assert.match(r.sql, /LEFT JOIN "02_si_umkm"\."pelaku_usaha"|LEFT JOIN "\w+"\."pelaku_usaha"/);
  assert.match(r.sql, /LPAD\(CAST\(src\."nik" AS VARCHAR\(16\)\), 16, '0'\)/);
  assert.doesNotMatch(r.sql, /"jenis_kelamin" ~ '\^\[0-9\]/);
  assert.match(r.mermaid.after, /penduduk \|\|--o\{ pegawai/);
});

test('search fallback finds NIK columns', () => {
  const r = analyze(samples());
  const s = search('Sistem mana saja yang menyimpan NIK?', r);
  const where = s.hits.map((h) => h.where).join(' ');
  assert.match(where, /tb_balita/);
  assert.match(where, /pegawai/);
  assert.match(where, /kasus_dbd/);
});

test('robustness: garbage input does not throw', () => {
  const r = analyze([{ name: 'x', sql: 'SELECT 1; CREATE TABLE ( ; DROP TABLE y;' }]);
  assert.strictEqual(r.stats.tables, 0);
});
