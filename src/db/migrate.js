const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', '..', 'data', 'arsip.db');

if (!fs.existsSync(dbPath)) {
  console.log('Database belum ada. Jalankan `npm run init-db` terlebih dahulu.');
  process.exit(0);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

function columnExists(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === col);
}

// ---- users: tambah kolom baru jika belum ada
if (columnExists('users', 'password') && !columnExists('users', 'password_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  const users = db.prepare('SELECT id, password FROM users').all();
  const setHash = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const hash = bcrypt.hashSync('password123', 10);
  for (const u of users) setHash.run(u.password === 'password123' ? hash : bcrypt.hashSync(u.password || 'password123', 10), u.id);
}
if (!columnExists('users', 'aktif')) db.exec('ALTER TABLE users ADD COLUMN aktif INTEGER NOT NULL DEFAULT 1');
if (!columnExists('users', 'last_login')) db.exec('ALTER TABLE users ADD COLUMN last_login DATETIME');

// ---- arsip: tambah kolom baru jika belum ada
if (!columnExists('arsip', 'instansi_id')) db.exec('ALTER TABLE arsip ADD COLUMN instansi_id INTEGER');
if (!columnExists('arsip', 'unit_id')) db.exec('ALTER TABLE arsip ADD COLUMN unit_id INTEGER');
if (!columnExists('arsip', 'lokasi_id')) db.exec('ALTER TABLE arsip ADD COLUMN lokasi_id INTEGER');
if (!columnExists('arsip', 'kode_qr')) db.exec('ALTER TABLE arsip ADD COLUMN kode_qr TEXT');
if (!columnExists('arsip', 'updated_by')) db.exec('ALTER TABLE arsip ADD COLUMN updated_by INTEGER');
if (!columnExists('arsip', 'deleted_at')) db.exec('ALTER TABLE arsip ADD COLUMN deleted_at DATETIME');

// ---- tabel baru (idempoten)
db.exec(`
  CREATE TABLE IF NOT EXISTS lokasi_arsip (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kode TEXT UNIQUE NOT NULL, nama TEXT NOT NULL,
    keterangan TEXT, aktif INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS unit_bidang (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kode TEXT UNIQUE NOT NULL, nama TEXT NOT NULL,
    aktif INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS instansi (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nama TEXT UNIQUE NOT NULL, singkatan TEXT,
    alamat TEXT, aktif INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS disposisi (
    id INTEGER PRIMARY KEY AUTOINCREMENT, arsip_id INTEGER NOT NULL,
    dari_user INTEGER, kepada_user INTEGER, instruksi TEXT,
    status TEXT NOT NULL DEFAULT 'proses', tanggal_disposisi DATE NOT NULL,
    catatan TEXT, created_by INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (arsip_id) REFERENCES arsip(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS peminjaman (
    id INTEGER PRIMARY KEY AUTOINCREMENT, arsip_id INTEGER NOT NULL,
    peminjam TEXT NOT NULL, unit_peminjam TEXT, alasan TEXT,
    tanggal_pinjam DATE NOT NULL, tanggal_jatuh_tempo DATE NOT NULL, tanggal_kembali DATE,
    status TEXT NOT NULL DEFAULT 'dipinjam', catatan TEXT, created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (arsip_id) REFERENCES arsip(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS notifikasi (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    judul TEXT NOT NULL, pesan TEXT, tipe TEXT NOT NULL DEFAULT 'info',
    is_read INTEGER NOT NULL DEFAULT 0, ref_tabel TEXT, ref_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS settings (
    kunci TEXT PRIMARY KEY, nilai TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS buku_agenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jenis TEXT NOT NULL CHECK(jenis IN ('masuk', 'keluar')),
    tahun INTEGER NOT NULL, nomor_urut INTEGER NOT NULL,
    tanggal DATE NOT NULL, nomor_surat TEXT, asal_tujuan TEXT, perihal TEXT, keterangan TEXT,
    arsip_id INTEGER, created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (arsip_id) REFERENCES arsip(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS agenda_kegiatan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    judul TEXT NOT NULL, tanggal DATE NOT NULL, jam_mulai TEXT, jam_selesai TEXT,
    lokasi TEXT, tipe TEXT NOT NULL DEFAULT 'kegiatan', keterangan TEXT,
    created_by INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_arsip_deleted ON arsip(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_disposisi_arsip ON disposisi(arsip_id);
  CREATE INDEX IF NOT EXISTS idx_peminjaman_arsip ON peminjaman(arsip_id);
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifikasi(user_id, is_read);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_urutan ON buku_agenda(jenis, tahun, nomor_urut);
  CREATE INDEX IF NOT EXISTS idx_agenda_tanggal ON agenda_kegiatan(tanggal);
`);

// ---- seed default master data
const seedUnit = [[ 'UMUM','Subbagian Umum & Kepegawaian'],['PENG','Seksi Pengukuran & Pemetaan'],['HAK','Seksi Hak Tanah & Pendaftaran Tanah'],['PENET','Seksi Penetapan & Pemberdayaan'],['SRV','Seksi Survei & Pemetaan'],['INF','Seksi Infrastruktur Pertanahan']];
const seedInst = [['Kementerian ATR/BPN','ATR/BPN'],['Pemerintah Kabupaten/Kota','PEMKAB'],['Badan Pertanahan Pusat','BPP'],['Kejaksaan Negeri','KEJARI'],['Kepolisian','POLRI'],['Pengadilan Negeri','PN']];
const seedLok = [['RAK-A1','Rak Arsip A - Baris 1'],['RAK-A2','Rak Arsip A - Baris 2'],['RAK-B1','Rak Arsip B - Baris 1'],['LEM-1','Lemari Arsip 1'],['BOX-1','Box Arsip 1']];
const iu = db.prepare('INSERT OR IGNORE INTO unit_bidang (kode, nama) VALUES (?, ?)');
const ii = db.prepare('INSERT OR IGNORE INTO instansi (nama, singkatan) VALUES (?, ?)');
const il = db.prepare('INSERT OR IGNORE INTO lokasi_arsip (kode, nama) VALUES (?, ?)');
seedUnit.forEach(u => iu.run(...u)); seedInst.forEach(i => ii.run(...i)); seedLok.forEach(l => il.run(...l));

// ---- pastikan admin user punya password_hash
if (columnExists('users', 'password_hash')) {
  const admin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
  if (admin && !admin.password_hash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync('password123', 10), admin.id);
  }
}

// ---- seed setting profil kantor (jika kosong)
const setDef = {
  'nama_kantor': 'Kantor Pertanahan', 'sub_nama': 'Badan Pertanahan Nasional',
  'alamat': 'Jl. Merdeka No. 1, Kota Contoh', 'telepon': '(021) 1234-5678',
  'email': 'kantor@pertanahan.go.id', 'website': 'www.pertanahan.go.id',
  'kepala_nama': 'Ir. Contoh Surya, M.Si.', 'kepala_nip': '19600101 198501 1 001',
  'kota_kop': 'Jakarta', 'motto': 'Mewujudkan Pelayanan Pertanahan yang Prima dan Terpercaya'
};
const insSet = db.prepare('INSERT OR IGNORE INTO settings (kunci, nilai) VALUES (?, ?)');
for (const k of Object.keys(setDef)) insSet.run(k, setDef[k]);

console.log('Migrasi selesai. Database sudah diperbarui ke skema terbaru.');
db.close();