// Reference vocabulary for Indonesian public-sector data (Satu Data Indonesia / SPBE flavoured).
// Each concept: canonical column name, label, description, canonical SQL type, alias names (after normalisation).
'use strict';

const ABBREV = {
  tgl: 'tanggal', tg: 'tanggal', kd: 'kode', kdx: 'kode', no: 'nomor', nmr: 'nomor', num: 'nomor',
  nm: 'nama', kel: 'kelurahan', kelur: 'kelurahan', kec: 'kecamatan', kab: 'kabupaten', kota: 'kabkota',
  kabkot: 'kabkota', prov: 'provinsi', propinsi: 'provinsi', jk: 'jenis_kelamin', jenkel: 'jenis_kelamin',
  almt: 'alamat', telp: 'telepon', tlp: 'telepon', hp: 'telepon', phone: 'telepon', wa: 'telepon',
  lhr: 'lahir', tmp: 'tempat', tmpt: 'tempat', pgw: 'pegawai', peg: 'pegawai', usr: 'user',
  ds: 'desa', desa: 'kelurahan', name: 'nama', address: 'alamat', birth: 'lahir', date: 'tanggal',
  dob: 'tanggal_lahir', gender: 'jenis_kelamin', sex: 'jenis_kelamin', ktp: 'nik', mail: 'email',
};

// Order matters: first match wins.
const CONCEPTS = [
  { key: 'nik', label: 'NIK', type: 'char(16)', group: 'orang', ref: 'Dukcapil',
    desc: 'Nomor Induk Kependudukan, 16 digit, kunci identitas penduduk (Dukcapil).',
    aliases: ['nik', 'nomor_nik', 'nik_warga', 'nik_penduduk', 'nik_ibu', 'nik_pemilik', 'nik_pelapor', 'nik_pasien', 'nik_pegawai', 'nomor_induk_kependudukan', 'nomor_nik_ktp'] },
  { key: 'no_kk', label: 'Nomor KK', type: 'char(16)', group: 'orang', ref: 'Dukcapil',
    desc: 'Nomor Kartu Keluarga, 16 digit.',
    aliases: ['no_kk', 'nomor_kk', 'kk', 'nomor_kartu_keluarga', 'nkk'] },
  { key: 'nip', label: 'NIP', type: 'char(18)', group: 'pegawai', ref: 'BKN',
    desc: 'Nomor Induk Pegawai ASN, 18 digit (BKN).',
    aliases: ['nip', 'nomor_nip', 'nip_pegawai', 'nomor_induk_pegawai', 'nip_baru', 'nip_atasan', 'nip_penilai'] },
  { key: 'nib', label: 'NIB', type: 'char(13)', group: 'usaha', ref: 'OSS',
    desc: 'Nomor Induk Berusaha, 13 digit (OSS-RBA).',
    aliases: ['nib', 'nomor_nib', 'nomor_induk_berusaha'] },
  { key: 'npwp', label: 'NPWP', type: 'varchar(16)', group: 'usaha', ref: 'DJP',
    desc: 'Nomor Pokok Wajib Pajak.',
    aliases: ['npwp', 'nomor_npwp', 'npwp_usaha'] },
  { key: 'kode_kelurahan', label: 'Kode Kelurahan/Desa', type: 'varchar(13)', group: 'wilayah', ref: 'Kepmendagri kode wilayah',
    desc: 'Kode wilayah administrasi kelurahan/desa (format Kemendagri, mis. 31.74.01.1001).',
    aliases: ['kode_kelurahan', 'kelurahan_id', 'id_kelurahan', 'kelurahan_kode', 'kode_kelurahan_desa', 'wilayah_id', 'kode_wilayah', 'village_id'] },
  { key: 'kode_kecamatan', label: 'Kode Kecamatan', type: 'varchar(8)', group: 'wilayah', ref: 'Kepmendagri kode wilayah',
    desc: 'Kode wilayah administrasi kecamatan (format Kemendagri).',
    aliases: ['kode_kecamatan', 'kecamatan_id', 'id_kecamatan', 'kecamatan_kode', 'district_id'] },
  { key: 'kode_kabkota', label: 'Kode Kabupaten/Kota', type: 'varchar(5)', group: 'wilayah', ref: 'Kepmendagri kode wilayah',
    desc: 'Kode wilayah administrasi kabupaten/kota.',
    aliases: ['kode_kabkota', 'kabkota_id', 'id_kabkota', 'kode_kabupaten', 'kabupaten_id', 'id_kabupaten', 'regency_id'] },
  { key: 'kode_provinsi', label: 'Kode Provinsi', type: 'varchar(2)', group: 'wilayah', ref: 'Kepmendagri kode wilayah',
    desc: 'Kode wilayah administrasi provinsi.',
    aliases: ['kode_provinsi', 'provinsi_id', 'id_provinsi', 'province_id'] },
  { key: 'nama_kelurahan', label: 'Nama Kelurahan/Desa (teks)', type: 'varchar(100)', group: 'wilayah', ref: null,
    desc: 'Nama kelurahan/desa sebagai teks bebas. Sebaiknya diganti kode_kelurahan.',
    aliases: ['kelurahan', 'nama_kelurahan', 'kelurahan_nama'] },
  { key: 'nama_kecamatan', label: 'Nama Kecamatan (teks)', type: 'varchar(100)', group: 'wilayah', ref: null,
    desc: 'Nama kecamatan sebagai teks bebas. Sebaiknya diganti kode_kecamatan.',
    aliases: ['kecamatan', 'nama_kecamatan', 'kecamatan_nama'] },
  { key: 'rt', label: 'RT', type: 'varchar(3)', group: 'wilayah', ref: null, desc: 'Rukun Tetangga.', aliases: ['rt', 'nomor_rt'] },
  { key: 'rw', label: 'RW', type: 'varchar(3)', group: 'wilayah', ref: null, desc: 'Rukun Warga.', aliases: ['rw', 'nomor_rw'] },
  { key: 'nama_lengkap', label: 'Nama Lengkap', type: 'varchar(150)', group: 'orang', ref: null,
    desc: 'Nama lengkap orang sesuai KTP.',
    aliases: ['nama', 'nama_lengkap', 'nama_warga', 'nama_penduduk', 'nama_pegawai', 'nama_pasien', 'nama_anak', 'nama_balita', 'nama_ibu', 'nama_pemilik', 'nama_pelapor', 'full_name', 'fullname'] },
  { key: 'tempat_lahir', label: 'Tempat Lahir', type: 'varchar(100)', group: 'orang', ref: null,
    desc: 'Kota/kabupaten tempat lahir.', aliases: ['tempat_lahir', 'tempatlahir', 'birthplace', 'lahir_tempat'] },
  { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date', group: 'orang', ref: null,
    desc: 'Tanggal lahir.', aliases: ['tanggal_lahir', 'tanggallahir', 'lahir_tanggal', 'tanggal_lahir_anak', 'tanggal_lahir_balita', 'birthdate', 'birth_date'] },
  { key: 'jenis_kelamin', label: 'Jenis Kelamin', type: 'char(1)', group: 'orang', ref: 'L/P',
    desc: 'Jenis kelamin, kode L/P.', aliases: ['jenis_kelamin', 'kelamin', 'jenis_kelamin_anak'] },
  { key: 'alamat', label: 'Alamat', type: 'text', group: 'orang', ref: null,
    desc: 'Alamat jalan/tempat tinggal (teks).', aliases: ['alamat', 'alamat_lengkap', 'alamat_rumah', 'alamat_domisili', 'alamat_usaha', 'alamat_kantor'] },
  { key: 'telepon', label: 'Nomor Telepon', type: 'varchar(20)', group: 'orang', ref: null,
    desc: 'Nomor telepon/HP.', aliases: ['telepon', 'nomor_telepon', 'telepon_seluler', 'nomor_handphone', 'handphone', 'telepon_pemilik', 'nomor_wa'] },
  { key: 'email', label: 'Email', type: 'varchar(150)', group: 'orang', ref: null,
    desc: 'Surel (e-mail) untuk korespondensi.', aliases: ['email', 'e_mail', 'alamat_email'] },
  { key: 'nama_usaha', label: 'Nama Usaha', type: 'varchar(150)', group: 'usaha', ref: null,
    desc: 'Nama usaha/badan usaha.', aliases: ['nama_usaha', 'nama_umkm', 'nama_toko', 'nama_perusahaan', 'nama_badan_usaha'] },
  { key: 'jabatan', label: 'Jabatan', type: 'varchar(150)', group: 'pegawai', ref: null,
    desc: 'Nama jabatan pegawai.', aliases: ['jabatan', 'nama_jabatan', 'jabatan_pegawai'] },
  { key: 'unit_kerja', label: 'Unit Kerja', type: 'varchar(150)', group: 'pegawai', ref: null,
    desc: 'Unit organisasi/perangkat daerah.', aliases: ['unit_kerja', 'opd', 'skpd', 'satker', 'nama_opd', 'nama_unit', 'instansi', 'perangkat_daerah'] },
  { key: 'golongan', label: 'Golongan/Pangkat', type: 'varchar(10)', group: 'pegawai', ref: 'BKN',
    desc: 'Golongan ruang ASN (mis. III/a).', aliases: ['golongan', 'pangkat_golongan', 'gol', 'golongan_ruang', 'pangkat'] },
  { key: 'latitude', label: 'Lintang', type: 'decimal(10,7)', group: 'wilayah', ref: null, desc: 'Koordinat lintang.', aliases: ['latitude', 'lat', 'lintang'] },
  { key: 'longitude', label: 'Bujur', type: 'decimal(10,7)', group: 'wilayah', ref: null, desc: 'Koordinat bujur.', aliases: ['longitude', 'lng', 'lon', 'long', 'bujur'] },
];

// Canonical entities (master data) built from concept signatures.
const ENTITIES = [
  { key: 'penduduk', label: 'Penduduk', anchor: 'nik', desc: 'Master data orang/penduduk, diikat oleh NIK.',
    members: ['nik', 'no_kk', 'nama_lengkap', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin', 'alamat', 'rt', 'rw', 'kode_kelurahan', 'telepon', 'email'] },
  { key: 'pegawai', label: 'Pegawai ASN', anchor: 'nip', desc: 'Master data kepegawaian, diikat oleh NIP; data pribadi (nama, lahir, kelamin) diambil dari penduduk via NIK.',
    members: ['nip', 'nik', 'jabatan', 'unit_kerja', 'golongan', 'email'] },
  { key: 'badan_usaha', label: 'Badan Usaha / UMKM', anchor: 'nib', desc: 'Master data pelaku usaha, diikat oleh NIB, pemilik merujuk ke penduduk via NIK.',
    members: ['nib', 'npwp', 'nama_usaha', 'nik', 'alamat', 'kode_kelurahan', 'telepon', 'email', 'latitude', 'longitude'] },
];

module.exports = { ABBREV, CONCEPTS, ENTITIES };

// English labels/descriptions (UI language "en"). Indonesian identifiers stay as-is because they are
// the real column/registry names judges will see in the schemas.
const EN = {
  nik: ['NIK (national ID no.)', 'Nomor Induk Kependudukan: 16-digit national population ID, the key identity of a resident (Dukcapil registry).'],
  no_kk: ['Family card no. (KK)', 'Kartu Keluarga number, 16 digits.'],
  nip: ['NIP (civil servant ID)', 'Civil servant (ASN) ID number, 18 digits (BKN).'],
  nib: ['NIB (business ID)', 'Business identification number, 13 digits (OSS-RBA).'],
  npwp: ['NPWP (tax ID)', 'Taxpayer identification number.'],
  kode_kelurahan: ['Village code', 'Official village/kelurahan code (Ministry of Home Affairs format, e.g. 31.74.01.1001).'],
  kode_kecamatan: ['District code', 'Official sub-district (kecamatan) code.'],
  kode_kabkota: ['Regency/city code', 'Official regency/city code.'],
  kode_provinsi: ['Province code', 'Official province code.'],
  nama_kelurahan: ['Village name (free text)', 'Village name as free text. Should be replaced by kode_kelurahan.'],
  nama_kecamatan: ['District name (free text)', 'Sub-district name as free text. Should be replaced by kode_kecamatan.'],
  rt: ['RT (neighbourhood unit)', 'Rukun Tetangga, the smallest neighbourhood unit.'],
  rw: ['RW (community unit)', 'Rukun Warga, a group of RTs.'],
  nama_lengkap: ['Full name', 'Full legal name as on the ID card.'],
  tempat_lahir: ['Place of birth', 'City/regency of birth.'],
  tanggal_lahir: ['Date of birth', 'Date of birth.'],
  jenis_kelamin: ['Sex', 'Sex, coded L (male) / P (female).'],
  alamat: ['Address', 'Street/home address (free text).'],
  telepon: ['Phone number', 'Phone/mobile number.'],
  email: ['Email', 'Email address for correspondence.'],
  nama_usaha: ['Business name', 'Name of the business / enterprise.'],
  jabatan: ['Position', 'Job position of the employee.'],
  unit_kerja: ['Work unit', 'Organisational unit / regional agency.'],
  golongan: ['Civil service grade', 'ASN pay grade (e.g. III/a).'],
  latitude: ['Latitude', 'Latitude coordinate.'],
  longitude: ['Longitude', 'Longitude coordinate.'],
};
const ENTITY_EN = {
  penduduk: ['Resident (penduduk)', 'Master data of people/residents, keyed by NIK.'],
  pegawai: ['Civil servant (pegawai ASN)', 'Master data of civil servants, keyed by NIP; personal data (name, birth, sex) comes from the resident master via NIK.'],
  badan_usaha: ['Business / MSME (badan usaha)', 'Master data of businesses, keyed by NIB; the owner links to the resident master via NIK.'],
};
const ROLE_EN = { ibu: 'mother', ayah: 'father', pemilik: 'owner', pelapor: 'reporter', atasan: 'supervisor', penilai: 'assessor',
  suami: 'husband', istri: 'wife', wali: 'guardian', kepala: 'head', petugas: 'officer', penanggung_jawab: 'person in charge',
  pj: 'person in charge', pendamping: 'companion', verifikator: 'verifier' };

module.exports.EN = EN;
module.exports.ENTITY_EN = ENTITY_EN;
module.exports.ROLE_EN = ROLE_EN;
