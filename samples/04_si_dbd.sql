-- SI-DBD: Surveilans Demam Berdarah (PostgreSQL 15) — data sintetis untuk demo
CREATE TABLE kasus_dbd (
  id UUID PRIMARY KEY,
  nik CHAR(16),
  nama_pasien VARCHAR(150) NOT NULL,
  umur SMALLINT,
  jenis_kelamin CHAR(1),
  alamat TEXT,
  kode_kelurahan VARCHAR(13),
  tanggal_gejala DATE,
  status_kasus VARCHAR(20) NOT NULL DEFAULT 'suspek',
  nama_pelapor VARCHAR(100)
);

CREATE TABLE pemeriksaan_jentik (
  id BIGSERIAL PRIMARY KEY,
  kode_kelurahan VARCHAR(13) NOT NULL,
  rt VARCHAR(3),
  rw VARCHAR(3),
  tanggal DATE NOT NULL,
  jumlah_rumah INTEGER,
  rumah_positif INTEGER,
  nama_petugas VARCHAR(100)
);
