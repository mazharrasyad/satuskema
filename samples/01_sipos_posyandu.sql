-- SIPOS: Sistem Informasi Posyandu (MySQL 5.7) — data sintetis untuk demo
CREATE TABLE `tb_posyandu` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama_posyandu` varchar(100) NOT NULL,
  `kelurahan` varchar(50) DEFAULT NULL,
  `kecamatan` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='Daftar posyandu';

CREATE TABLE `tb_balita` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama_balita` varchar(100) NOT NULL,
  `tgl_lhr` date NOT NULL,
  `jk` enum('L','P') NOT NULL,
  `nik_ibu` int(16) DEFAULT NULL COMMENT 'NIK ibu kandung',
  `nama_ibu` varchar(100) DEFAULT NULL,
  `nama_ayah` varchar(100) DEFAULT NULL,
  `alamat` text,
  `rt` char(3) DEFAULT NULL,
  `rw` char(3) DEFAULT NULL,
  `kelurahan` varchar(50) DEFAULT NULL,
  `posyandu_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_balita_posyandu` FOREIGN KEY (`posyandu_id`) REFERENCES `tb_posyandu` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `tb_penimbangan` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `balita_id` int(11) NOT NULL,
  `tgl_timbang` date NOT NULL,
  `berat_badan` decimal(5,2) DEFAULT NULL COMMENT 'kg',
  `tinggi_badan` decimal(5,2) DEFAULT NULL COMMENT 'cm',
  `status_gizi` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_balita` (`balita_id`),
  CONSTRAINT `fk_timbang_balita` FOREIGN KEY (`balita_id`) REFERENCES `tb_balita` (`id`)
) ENGINE=InnoDB;

CREATE TABLE `tb_kader` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nama` varchar(100) NOT NULL,
  `no_hp` varchar(15) DEFAULT NULL,
  `posyandu_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;
