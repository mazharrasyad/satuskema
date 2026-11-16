-- SI-UMKM: Direktori UMKM Kota (PostgreSQL 13) — data sintetis untuk demo
CREATE TABLE public.pelaku_usaha (
  id SERIAL PRIMARY KEY,
  no_ktp VARCHAR(16) NOT NULL UNIQUE,
  nama VARCHAR(120) NOT NULL,
  tempat_lahir VARCHAR(60),
  tanggal_lahir DATE,
  jenis_kelamin VARCHAR(10),
  telp VARCHAR(15),
  email VARCHAR(100)
);

CREATE TABLE public.usaha (
  id SERIAL PRIMARY KEY,
  pelaku_id INTEGER NOT NULL REFERENCES public.pelaku_usaha(id),
  nib VARCHAR(13),
  nama_usaha VARCHAR(150) NOT NULL,
  sektor VARCHAR(50),
  alamat_usaha TEXT,
  kd_kel VARCHAR(13),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  omzet_tahunan NUMERIC(15,2)
);
COMMENT ON COLUMN public.usaha.kd_kel IS 'kode kelurahan lokasi usaha';
COMMENT ON TABLE public.usaha IS 'Unit usaha milik pelaku UMKM';
