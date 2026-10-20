const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', '..', 'data', 'arsip.db');
const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nama TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'kepala')),
    aktif INTEGER NOT NULL DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS kategori_arsip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    deskripsi TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lokasi_arsip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    keterangan TEXT,
    aktif INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS unit_bidang (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode TEXT UNIQUE NOT NULL,
    nama TEXT NOT NULL,
    aktif INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS instansi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT UNIQUE NOT NULL,
    singkatan TEXT,
    alamat TEXT,
    aktif INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS arsip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor_arsip TEXT UNIQUE NOT NULL,
    kategori_id INTEGER NOT NULL,
    judul TEXT NOT NULL,
    nomor_surat TEXT,
    tanggal_surat DATE,
    tanggal_arsip DATE NOT NULL,
    pengirim TEXT,
    instansi_id INTEGER,
    penerima TEXT,
    unit_id INTEGER,
    perihal TEXT,
    ringkasan TEXT,
    status TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif', 'arsip', 'dipinjam', 'hilang', 'rusak')),
    lokasi_fisik TEXT,
    lokasi_id INTEGER,
    kode_qr TEXT,
    created_by INTEGER NOT NULL,
    updated_by INTEGER,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kategori_id) REFERENCES kategori_arsip(id),
    FOREIGN KEY (instansi_id) REFERENCES instansi(id),
    FOREIGN KEY (unit_id) REFERENCES unit_bidang(id),
    FOREIGN KEY (lokasi_id) REFERENCES lokasi_arsip(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS lampiran (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arsip_id INTEGER NOT NULL,
    nama_file TEXT NOT NULL,
    nama_original TEXT NOT NULL,
    mime_type TEXT,
    ukuran INTEGER,
    path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (arsip_id) REFERENCES arsip(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS disposisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arsip_id INTEGER NOT NULL,
    dari_user INTEGER,
    kepada_user INTEGER,
    instruksi TEXT,
    status TEXT NOT NULL DEFAULT 'proses' CHECK(status IN ('proses', 'diterima', 'selesai', 'ditolak')),
    tanggal_disposisi DATE NOT NULL,
    catatan TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (arsip_id) REFERENCES arsip(id) ON DELETE CASCADE,
    FOREIGN KEY (dari_user) REFERENCES users(id),
    FOREIGN KEY (kepada_user) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS peminjaman (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arsip_id INTEGER NOT NULL,
    peminjam TEXT NOT NULL,
    unit_peminjam TEXT,
    alasan TEXT,
    tanggal_pinjam DATE NOT NULL,
    tanggal_jatuh_tempo DATE NOT NULL,
    tanggal_kembali DATE,
    status TEXT NOT NULL DEFAULT 'dipinjam' CHECK(status IN ('dipinjam', 'dikembalikan', 'terlambat')),
    catatan TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (arsip_id) REFERENCES arsip(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS log_aktivitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    aksi TEXT NOT NULL,
    tabel TEXT NOT NULL,
    record_id INTEGER,
    detail TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifikasi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    judul TEXT NOT NULL,
    pesan TEXT,
    tipe TEXT NOT NULL DEFAULT 'info',
    is_read INTEGER NOT NULL DEFAULT 0,
    ref_tabel TEXT,
    ref_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    kunci TEXT PRIMARY KEY,
    nilai TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS buku_agenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jenis TEXT NOT NULL CHECK(jenis IN ('masuk', 'keluar')),
    tahun INTEGER NOT NULL,
    nomor_urut INTEGER NOT NULL,
    tanggal DATE NOT NULL,
    nomor_surat TEXT,
    asal_tujuan TEXT,
    perihal TEXT,
    keterangan TEXT,
    arsip_id INTEGER,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (arsip_id) REFERENCES arsip(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS agenda_kegiatan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    judul TEXT NOT NULL,
    tanggal DATE NOT NULL,
    jam_mulai TEXT,
    jam_selesai TEXT,
    lokasi TEXT,
    tipe TEXT NOT NULL DEFAULT 'kegiatan',
    keterangan TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_arsip_kategori ON arsip(kategori_id);
  CREATE INDEX IF NOT EXISTS idx_arsip_tanggal ON arsip(tanggal_arsip);
  CREATE INDEX IF NOT EXISTS idx_arsip_status ON arsip(status);
  CREATE INDEX IF NOT EXISTS idx_arsip_nomor ON arsip(nomor_arsip);
  CREATE INDEX IF NOT EXISTS idx_arsip_deleted ON arsip(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_lampiran_arsip ON lampiran(arsip_id);
  CREATE INDEX IF NOT EXISTS idx_disposisi_arsip ON disposisi(arsip_id);
  CREATE INDEX IF NOT EXISTS idx_peminjaman_arsip ON peminjaman(arsip_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifikasi(user_id, is_read);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_urutan ON buku_agenda(jenis, tahun, nomor_urut);
  CREATE INDEX IF NOT EXISTS idx_agenda_tanggal ON agenda_kegiatan(tanggal);
`);

/* ---------- SEED DATA ---------- */
const kategoriDefault = [
  ['SKM', 'Surat Keputusan Menteri', 'Surat keputusan dari tingkat menteri'],
  ['SKG', 'Surat Keputusan Gubernur', 'Surat keputusan dari tingkat gubernur'],
  ['SKB', 'Surat Keputusan Bupati/Walikota', 'Surat keputusan dari tingkat bupati/walikota'],
  ['SKK', 'Surat Keputusan Kepala BPN', 'Surat keputusan dari kepala BPN'],
  ['SM', 'Surat Masuk', 'Surat masuk dari instansi lain'],
  ['SKL', 'Surat Keluar', 'Surat keluar ke instansi lain'],
  ['SHM', 'Sertifikak Hak Milik', 'Sertifikat hak milik tanah'],
  ['SHG', 'Sertifikat Hak Guna', 'Sertifikat hak guna bangunan/usaha'],
  ['HGB', 'Hak Guna Bangunan', 'Dokumen hak guna bangunan'],
  ['HGU', 'Hak Guna Usaha', 'Dokumen hak guna usaha'],
  ['LPJ', 'Laporan Pertanggungjawaban', 'Laporan pertanggungjawaban keuangan/kegiatan'],
  ['LKN', 'Laporan Kinerja', 'Laporan kinerja bulanan/tahunan'],
  ['LAIN', 'Lainnya', 'Kategori arsip lainnya']
];

const unitDefault = [
  ['UMUM', 'Subbagian Umum & Kepegawaian'],
  ['PENG', 'Seksi Pengukuran & Pemetaan'],
  ['HAK', 'Seksi Hak Tanah & Pendaftaran Tanah'],
  ['PENET', 'Seksi Penetapan & Pemberdayaan'],
  ['SRV', 'Seksi Survei & Pemetaan'],
  ['INF', 'Seksi Infrastruktur Pertanahan']
];

const instansiDefault = [
  ['Kementerian ATR/BPN', 'ATR/BPN'],
  ['Pemerintah Kabupaten/Kota', 'PEMKAB'],
  ['Badan Pertanahan Pusat', 'BPP'],
  ['Kejaksaan Negeri', 'KEJARI'],
  ['Kepolisian', 'POLRI'],
  ['Pengadilan Negeri', 'PN']
];

const lokasiDefault = [
  ['RAK-A1', 'Rak Arsip A - Baris 1'],
  ['RAK-A2', 'Rak Arsip A - Baris 2'],
  ['RAK-B1', 'Rak Arsip B - Baris 1'],
  ['LEM-1', 'Lemari Arsip 1'],
  ['BOX-1', 'Box Arsip 1']
];

const insKategori = db.prepare('INSERT OR IGNORE INTO kategori_arsip (kode, nama, deskripsi) VALUES (?, ?, ?)');
for (const k of kategoriDefault) insKategori.run(...k);

const insUnit = db.prepare('INSERT OR IGNORE INTO unit_bidang (kode, nama) VALUES (?, ?)');
for (const u of unitDefault) insUnit.run(...u);

const insInst = db.prepare('INSERT OR IGNORE INTO instansi (nama, singkatan) VALUES (?, ?)');
for (const i of instansiDefault) insInst.run(...i);

const insLok = db.prepare('INSERT OR IGNORE INTO lokasi_arsip (kode, nama) VALUES (?, ?)');
for (const l of lokasiDefault) insLok.run(...l);

/* ---------- SETTING / PROFIL KANTOR ---------- */
const settingsDefault = {
  'nama_kantor': 'Kantor Pertanahan',
  'sub_nama': 'Badan Pertanahan Nasional',
  'alamat': 'Jl. Merdeka No. 1, Kota Contoh',
  'telepon': '(021) 1234-5678',
  'email': 'kantor@pertanahan.go.id',
  'website': 'www.pertanahan.go.id',
  'kepala_nama': 'Ir. Contoh Surya, M.Si.',
  'kepala_nip': '19600101 198501 1 001',
  'kota_kop': 'Jakarta',
  'motto': 'Mewujudkan Pelayanan Pertanahan yang Prima dan Terpercaya'
};
const insSetting = db.prepare('INSERT OR IGNORE INTO settings (kunci, nilai) VALUES (?, ?)');
for (const k of Object.keys(settingsDefault)) insSetting.run(k, settingsDefault[k]);

/* ---------- USERS (password ter-hash) ---------- */
const password = 'password123';
const hash = bcrypt.hashSync(password, 10);
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash, nama, role) VALUES (?, ?, ?, ?)');
insertUser.run('admin', hash, 'Administrator', 'admin');
insertUser.run('staff1', hash, 'Staff Arsip', 'staff');
insertUser.run('kepala1', hash, 'Kepala Bidang', 'kepala');

const count = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
console.log('Database initialized at:', dbPath);
console.log(`Kategori: ${kategoriDefault.length}, Unit: ${unitDefault.length}, Instansi: ${instansiDefault.length}, Lokasi: ${lokasiDefault.length}`);
console.log(`Users siap: ${count} (admin / staff1 / kepala1, password: password123)`);

db.close();