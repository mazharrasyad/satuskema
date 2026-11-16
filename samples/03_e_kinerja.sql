-- E-KINERJA: Penilaian Kinerja Pegawai (MySQL 8) — data sintetis untuk demo
CREATE TABLE pegawai (
  nip VARCHAR(18) NOT NULL PRIMARY KEY,
  nik BIGINT(16) NULL,
  nama VARCHAR(100) NOT NULL,
  gelar_depan VARCHAR(20),
  gelar_belakang VARCHAR(30),
  tgl_lahir DATE,
  jk CHAR(1),
  jabatan VARCHAR(150),
  opd VARCHAR(150),
  gol VARCHAR(5),
  email VARCHAR(100),
  no_hp VARCHAR(20)
);

CREATE TABLE skp (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  nip_pegawai VARCHAR(18) NOT NULL,
  nip_penilai VARCHAR(18),
  tahun YEAR NOT NULL,
  nilai_akhir DECIMAL(5,2),
  predikat VARCHAR(20),
  FOREIGN KEY (nip_pegawai) REFERENCES pegawai(nip)
);

CREATE TABLE realisasi_harian (
  nip VARCHAR(18),
  tanggal DATE,
  uraian TEXT,
  volume INT,
  satuan VARCHAR(20)
);
