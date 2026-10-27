const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', '..', 'data', 'arsip.db');
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

function nowIso() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
function stamp() { return Date.now(); }

function generateNomorArsip(kategoriKode) {
  const year = new Date().getFullYear();
  const stmt = db.prepare('SELECT COUNT(*) as cnt FROM arsip WHERE nomor_arsip LIKE ?');
  const result = stmt.get(`${kategoriKode}/${year}/%`);
  const nextNum = (result.cnt || 0) + 1;
  return `${kategoriKode}/${year}/${String(nextNum).padStart(4, '0')}`;
}

function logAktivitas(userId, aksi, tabel, recordId, detail) {
  try {
    db.prepare('INSERT INTO log_aktivitas (user_id, aksi, tabel, record_id, detail) VALUES (?, ?, ?, ?, ?)')
      .run(userId, aksi, tabel, recordId, detail);
  } catch (e) { /* ignore */ }
}

function buatNotifikasi(userId, judul, pesan, tipe, refTabel, refId) {
  try {
    db.prepare('INSERT INTO notifikasi (user_id, judul, pesan, tipe, ref_tabel, ref_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, judul, pesan, tipe, refTabel, refId);
  } catch (e) { /* ignore */ }
}

const ARSIP_SELECT = `
  SELECT a.*, k.kode AS kategori_kode, k.nama AS kategori_nama,
         COALESCE(u.nama, '') AS creator_nama,
         COALESCE(i.nama, '') AS instansi_nama, i.singkatan AS instansi_singkatan,
         COALESCE(ub.nama, '') AS unit_nama, ub.kode AS unit_kode,
         COALESCE(la.nama, '') AS lokasi_nama, la.kode AS lokasi_kode
  FROM arsip a
  JOIN kategori_arsip k ON a.kategori_id = k.id
  LEFT JOIN users u ON a.created_by = u.id
  LEFT JOIN instansi i ON a.instansi_id = i.id
  LEFT JOIN unit_bidang ub ON a.unit_id = ub.id
  LEFT JOIN lokasi_arsip la ON a.lokasi_id = la.id
`;

module.exports = {
  db, nowIso, stamp, generateNomorArsip, logAktivitas, buatNotifikasi,

  /* ---------- USERS ---------- */
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  getUserById: db.prepare('SELECT id, username, nama, role, aktif, last_login, created_at FROM users WHERE id = ?'),
  getAllUsers: db.prepare('SELECT id, username, nama, role, aktif, last_login, created_at FROM users ORDER BY created_at DESC'),
  insertUser: db.prepare('INSERT INTO users (username, password_hash, nama, role) VALUES (?, ?, ?, ?)'),
  updateUser: db.prepare('UPDATE users SET nama = ?, role = ?, aktif = ? WHERE id = ?'),
  updatePassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  setLastLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
  getUserRingkas: db.prepare('SELECT id, nama, role, aktif FROM users ORDER BY nama'),
  countActiveAdmins: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND aktif = 1"),

  /* ---------- KATEGORI ---------- */
  getAllKategori: db.prepare('SELECT * FROM kategori_arsip ORDER BY kode'),
  getKategoriById: db.prepare('SELECT * FROM kategori_arsip WHERE id = ?'),
  getKategoriByKode: db.prepare('SELECT * FROM kategori_arsip WHERE kode = ?'),
  insertKategori: db.prepare('INSERT INTO kategori_arsip (kode, nama, deskripsi) VALUES (?, ?, ?)'),
  updateKategori: db.prepare('UPDATE kategori_arsip SET nama = ?, deskripsi = ? WHERE id = ?'),
  deleteKategori: db.prepare('DELETE FROM kategori_arsip WHERE id = ?'),

  /* ---------- LOKASI ---------- */
  getAllLokasi: db.prepare('SELECT * FROM lokasi_arsip ORDER BY kode'),
  insertLokasi: db.prepare('INSERT INTO lokasi_arsip (kode, nama, keterangan) VALUES (?, ?, ?)'),
  updateLokasi: db.prepare('UPDATE lokasi_arsip SET kode = ?, nama = ?, keterangan = ?, aktif = ? WHERE id = ?'),
  deleteLokasi: db.prepare('DELETE FROM lokasi_arsip WHERE id = ?'),

  /* ---------- UNIT ---------- */
  getAllUnit: db.prepare('SELECT * FROM unit_bidang ORDER BY kode'),
  insertUnit: db.prepare('INSERT INTO unit_bidang (kode, nama) VALUES (?, ?)'),
  updateUnit: db.prepare('UPDATE unit_bidang SET kode = ?, nama = ?, aktif = ? WHERE id = ?'),
  deleteUnit: db.prepare('DELETE FROM unit_bidang WHERE id = ?'),

  /* ---------- INSTANSI ---------- */
  getAllInstansi: db.prepare('SELECT * FROM instansi ORDER BY nama'),
  insertInstansi: db.prepare('INSERT INTO instansi (nama, singkatan, alamat) VALUES (?, ?, ?)'),
  updateInstansi: db.prepare('UPDATE instansi SET nama = ?, singkatan = ?, alamat = ?, aktif = ? WHERE id = ?'),
  deleteInstansi: db.prepare('DELETE FROM instansi WHERE id = ?'),

  /* ---------- ARSIP (aktif, soft-delete-aware) ---------- */
  getArsipList: db.prepare(`
    ${ARSIP_SELECT}
    WHERE a.deleted_at IS NULL AND (:search = '' OR (a.nomor_arsip LIKE :search OR a.judul LIKE :search OR a.nomor_surat LIKE :search OR a.perihal LIKE :search OR a.ringkasan LIKE :search))
      AND (:kategori = '' OR a.kategori_id = :kategori)
      AND (:status = '' OR a.status = :status)
      AND (:dari = '' OR a.tanggal_arsip >= :dari)
      AND (:sampai = '' OR a.tanggal_arsip <= :sampai)
      AND (:lokasi = '' OR a.lokasi_id = :lokasi)
      AND (:instansi = '' OR a.instansi_id = :instansi)
    ORDER BY a.tanggal_arsip DESC, a.created_at DESC
    LIMIT :limit OFFSET :offset
  `),
  getArsipCount: db.prepare('SELECT COUNT(*) as cnt FROM arsip WHERE deleted_at IS NULL'),
  searchArsipCount: db.prepare(`
    SELECT COUNT(*) as cnt FROM arsip a
    WHERE a.deleted_at IS NULL
      AND (:search = '' OR (a.nomor_arsip LIKE :search OR a.judul LIKE :search OR a.nomor_surat LIKE :search OR a.perihal LIKE :search OR a.ringkasan LIKE :search))
      AND (:kategori = '' OR a.kategori_id = :kategori)
      AND (:status = '' OR a.status = :status)
      AND (:dari = '' OR a.tanggal_arsip >= :dari)
      AND (:sampai = '' OR a.tanggal_arsip <= :sampai)
      AND (:lokasi = '' OR a.lokasi_id = :lokasi)
      AND (:instansi = '' OR a.instansi_id = :instansi)
  `),
  getArsipById: db.prepare(`${ARSIP_SELECT} WHERE a.id = ?`),
  getArsipByNomor: db.prepare(`${ARSIP_SELECT} WHERE a.nomor_arsip = ? AND a.deleted_at IS NULL`),
  getArsipByKodeQr: db.prepare(`${ARSIP_SELECT} WHERE a.kode_qr = ? AND a.deleted_at IS NULL`),
  insertArsip: db.prepare(`
    INSERT INTO arsip (nomor_arsip, kategori_id, judul, nomor_surat, tanggal_surat, tanggal_arsip, pengirim, instansi_id, penerima, unit_id, perihal, ringkasan, status, lokasi_fisik, lokasi_id, kode_qr, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateArsip: db.prepare(`
    UPDATE arsip SET kategori_id = ?, judul = ?, nomor_surat = ?, tanggal_surat = ?, tanggal_arsip = ?,
    pengirim = ?, instansi_id = ?, penerima = ?, unit_id = ?, perihal = ?, ringkasan = ?, status = ?,
    lokasi_fisik = ?, lokasi_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  softDeleteArsip: db.prepare('UPDATE arsip SET deleted_at = ?, updated_by = ? WHERE id = ?'),
  restoreArsip: db.prepare('UPDATE arsip SET deleted_at = NULL, updated_by = ? WHERE id = ?'),
  hardDeleteArsip: db.prepare('DELETE FROM arsip WHERE id = ?'),

  getTrashList: db.prepare(`
    ${ARSIP_SELECT}
    WHERE a.deleted_at IS NOT NULL
    ORDER BY a.deleted_at DESC
  `),

  /* ---------- STATISTIK ---------- */
  getArsipStats: db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END), 0) AS total,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'aktif' THEN 1 ELSE 0 END), 0) AS aktif,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'arsip' THEN 1 ELSE 0 END), 0) AS diarsipkan,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'dipinjam' THEN 1 ELSE 0 END), 0) AS dipinjam,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'hilang' THEN 1 ELSE 0 END), 0) AS hilang,
      COALESCE(SUM(CASE WHEN deleted_at IS NULL AND status = 'rusak' THEN 1 ELSE 0 END), 0) AS rusak,
      COALESCE(SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS sampah
    FROM arsip
  `),
  getStatsByKategori: db.prepare(`
    SELECT k.kode, k.nama, COUNT(a.id) AS jumlah
    FROM kategori_arsip k LEFT JOIN arsip a ON k.id = a.kategori_id AND a.deleted_at IS NULL
    GROUP BY k.id ORDER BY jumlah DESC
  `),
  getStatsByBulan: db.prepare(`
    SELECT strftime('%Y-%m', tanggal_arsip) AS bulan, COUNT(*) AS jumlah
    FROM arsip WHERE tanggal_arsip >= date('now', 'localtime', '-12 months') AND deleted_at IS NULL
    GROUP BY bulan ORDER BY bulan
  `),
  getStatsByStatus: db.prepare(`
    SELECT status, COUNT(*) AS jumlah FROM arsip WHERE deleted_at IS NULL GROUP BY status
  `),

  /* ---------- DISPOSISI ---------- */
  getDisposisiByArsip: db.prepare(`
    SELECT d.*, u.nama AS dari_nama, k.nama AS kepada_nama
    FROM disposisi d
    LEFT JOIN users u ON d.dari_user = u.id
    LEFT JOIN users k ON d.kepada_user = k.id
    WHERE d.arsip_id = ? ORDER BY d.created_at DESC
  `),
  getAllDisposisi: db.prepare(`
    SELECT d.*, u.nama AS dari_nama, k.nama AS kepada_nama,
           a.nomor_arsip, a.judul AS arsip_judul, a.deleted_at AS arsip_deleted_at,
           kk.nama AS kategori_nama, kk.kode AS kategori_kode
    FROM disposisi d
    LEFT JOIN users u ON d.dari_user = u.id
    LEFT JOIN users k ON d.kepada_user = k.id
    JOIN arsip a ON d.arsip_id = a.id
    JOIN kategori_arsip kk ON a.kategori_id = kk.id
    ORDER BY d.created_at DESC
  `),
  getDisposisiById: db.prepare('SELECT * FROM disposisi WHERE id = ?'),
  insertDisposisi: db.prepare(`
    INSERT INTO disposisi (arsip_id, dari_user, kepada_user, instruksi, status, tanggal_disposisi, catatan, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateDisposisi: db.prepare(`
    UPDATE disposisi SET kepada_user = ?, instruksi = ?, status = ?, tanggal_disposisi = ?, catatan = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),
  deleteDisposisi: db.prepare('DELETE FROM disposisi WHERE id = ?'),

  /* ---------- PEMINJAMAN ---------- */
  getPeminjamanList: db.prepare(`
    SELECT p.*, a.nomor_arsip, a.judul, a.tanggal_arsip, k.nama AS kategori_nama, k.kode AS kategori_kode,
           COALESCE(ub.nama, p.unit_peminjam) AS unit_nama
    FROM peminjaman p
    JOIN arsip a ON p.arsip_id = a.id
    JOIN kategori_arsip k ON a.kategori_id = k.id
    LEFT JOIN unit_bidang ub ON ub.id = CAST(p.unit_peminjam AS INTEGER)
    WHERE a.deleted_at IS NULL
    ORDER BY p.created_at DESC
  `),
  getPeminjamanByArsip: db.prepare(`
    SELECT p.*, COALESCE(ub.nama, p.unit_peminjam) AS unit_nama
    FROM peminjaman p
    JOIN arsip a ON p.arsip_id = a.id
    LEFT JOIN unit_bidang ub ON ub.id = CAST(p.unit_peminjam AS INTEGER)
    WHERE p.arsip_id = ? ORDER BY p.created_at DESC
  `),
  getPeminjamanById: db.prepare('SELECT * FROM peminjaman WHERE id = ?'),
  getActiveLoanByArsip: db.prepare(`
    SELECT * FROM peminjaman WHERE arsip_id = ? AND status IN ('dipinjam', 'terlambat') ORDER BY created_at DESC LIMIT 1
  `),
  insertPeminjaman: db.prepare(`
    INSERT INTO peminjaman (arsip_id, peminjam, unit_peminjam, alasan, tanggal_pinjam, tanggal_jatuh_tempo, tanggal_kembali, status, catatan, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updatePeminjaman: db.prepare('UPDATE peminjaman SET status = ?, tanggal_kembali = ?, catatan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
  deletePeminjaman: db.prepare('DELETE FROM peminjaman WHERE id = ?'),
  checkOverdue: db.prepare(`
    SELECT * FROM peminjaman WHERE tanggal_kembali IS NULL AND tanggal_jatuh_tempo < date('now', 'localtime') AND status = 'dipinjam'
  `),
  markOverdue: db.prepare("UPDATE peminjaman SET status = 'terlambat', updated_at = CURRENT_TIMESTAMP WHERE id = ?"),

  /* ---------- LAMPIRAN ---------- */
  getLampiranByArsip: db.prepare('SELECT * FROM lampiran WHERE arsip_id = ? ORDER BY created_at DESC'),
  insertLampiran: db.prepare('INSERT INTO lampiran (arsip_id, nama_file, nama_original, mime_type, ukuran, path) VALUES (?, ?, ?, ?, ?, ?)'),
  deleteLampiran: db.prepare('DELETE FROM lampiran WHERE id = ?'),
  getLampiranById: db.prepare('SELECT * FROM lampiran WHERE id = ?'),

  /* ---------- LOG ---------- */
  getLogAktivitas: db.prepare(`
    SELECT l.*, u.nama AS user_nama FROM log_aktivitas l JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC LIMIT ? OFFSET ?
  `),

  /* ---------- NOTIFIKASI ---------- */
  getNotifikasiUser: db.prepare('SELECT * FROM notifikasi WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'),
  getUnreadCount: db.prepare('SELECT COUNT(*) AS cnt FROM notifikasi WHERE user_id = ? AND is_read = 0'),
  markNotifRead: db.prepare('UPDATE notifikasi SET is_read = 1 WHERE id = ? AND user_id = ?'),
  markAllRead: db.prepare('UPDATE notifikasi SET is_read = 1 WHERE user_id = ?'),

  /* ---------- SETTINGS / PROFIL KANTOR ---------- */
  getAllSettings: db.prepare('SELECT kunci, nilai FROM settings'),
  setSetting: db.prepare(`INSERT INTO settings (kunci, nilai) VALUES (?, ?)
    ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai, updated_at = CURRENT_TIMESTAMP`),

  /* ---------- BUKU AGENDA ---------- */
  getBukuAgendaList: db.prepare(`
    SELECT ba.*, a.nomor_arsip, u.nama AS petugas
    FROM buku_agenda ba
    LEFT JOIN arsip a ON ba.arsip_id = a.id
    LEFT JOIN users u ON ba.created_by = u.id
    WHERE ba.jenis = ?
    ORDER BY ba.tahun DESC, ba.nomor_urut DESC
  `),
  getBukuAgendaLastUrut: db.prepare('SELECT COALESCE(MAX(nomor_urut), 0) AS m FROM buku_agenda WHERE jenis = ? AND tahun = ?'),
  getBukuAgendaCount: db.prepare('SELECT COUNT(*) AS c FROM buku_agenda WHERE jenis = ? AND tahun = ?'),
  getBukuAgendaById: db.prepare('SELECT * FROM buku_agenda WHERE id = ?'),
  insertBukuAgenda: db.prepare(`
    INSERT INTO buku_agenda (jenis, tahun, nomor_urut, tanggal, nomor_surat, asal_tujuan, perihal, keterangan, arsip_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateBukuAgenda: db.prepare(`
    UPDATE buku_agenda SET tanggal = ?, nomor_surat = ?, asal_tujuan = ?, perihal = ?, keterangan = ?, arsip_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),
  deleteBukuAgenda: db.prepare('DELETE FROM buku_agenda WHERE id = ?'),

  /* ---------- AGENDA KEGIATAN (KALENDER) ---------- */
  getAgendaBulan: db.prepare("SELECT * FROM agenda_kegiatan WHERE strftime('%Y-%m', tanggal) = ? ORDER BY tanggal, jam_mulai"),
  getAgendaHariIni: db.prepare("SELECT * FROM agenda_kegiatan WHERE tanggal = date('now', 'localtime') ORDER BY jam_mulai"),
  getAgendaById: db.prepare('SELECT * FROM agenda_kegiatan WHERE id = ?'),
  insertAgendaKegiatan: db.prepare(`
    INSERT INTO agenda_kegiatan (judul, tanggal, jam_mulai, jam_selesai, lokasi, tipe, keterangan, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateAgendaKegiatan: db.prepare(`
    UPDATE agenda_kegiatan SET judul = ?, tanggal = ?, jam_mulai = ?, jam_selesai = ?, lokasi = ?, tipe = ?, keterangan = ? WHERE id = ?
  `),
  deleteAgendaKegiatan: db.prepare('DELETE FROM agenda_kegiatan WHERE id = ?'),

  /* ---------- DASHBOARD AKTIVITAS ---------- */
  getRecentAktivitas: db.prepare(`
    SELECT l.*, u.nama AS user_nama FROM log_aktivitas l JOIN users u ON l.user_id = u.id
    ORDER BY l.created_at DESC LIMIT ?
  `),
  getArsipTerbaru: db.prepare(`${ARSIP_SELECT} WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT ?`),
  getPeminjamanAktif: db.prepare(`
    SELECT p.*, a.nomor_arsip, a.judul FROM peminjaman p
    JOIN arsip a ON p.arsip_id = a.id
    WHERE p.status IN ('dipinjam', 'terlambat') AND a.deleted_at IS NULL
    ORDER BY p.tanggal_jatuh_tempo ASC
  `),
  getDisposisiTerbaru: db.prepare(`
    SELECT d.*, u.nama AS dari_nama, k.nama AS kepada_nama, a.nomor_arsip, a.judul AS arsip_judul
    FROM disposisi d
    LEFT JOIN users u ON d.dari_user = u.id
    LEFT JOIN users k ON d.kepada_user = k.id
    JOIN arsip a ON d.arsip_id = a.id
    ORDER BY d.created_at DESC LIMIT ?
  `),
  getDisposisiProsesCount: db.prepare(`
    SELECT COUNT(*) AS jumlah FROM disposisi d
    JOIN arsip a ON d.arsip_id = a.id
    WHERE d.status = 'proses' AND a.deleted_at IS NULL
  `)
};