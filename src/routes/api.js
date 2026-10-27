const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const qrcode = require('qrcode');
const ExcelJS = require('exceljs');
const q = require('../db/queries');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  }
});

// Tanggal lokal (bukan UTC) untuk nilai default tanggal di server
function todayLocal(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function monthLocal(d = new Date()) { return todayLocal(d).slice(0, 7); }
function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
const ARSIP_STATUS = ['aktif', 'arsip', 'dipinjam', 'hilang', 'rusak'];
const DISPOSISI_STATUS = ['proses', 'diterima', 'selesai', 'ditolak'];
const ROLE_VALID = ['admin', 'staff', 'kepala'];

/* ============ AUTH HELPERS ============ */
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali' });
  const user = q.getUserById.get(req.session.userId);
  if (!user || !user.aktif) {
    // Akun dihapus/dinonaktifkan → akhiri sesi yang masih berjalan
    return req.session.destroy(() => res.status(401).json({ error: 'Sesi berakhir, silakan login kembali' }));
  }
  req.user = user;
  req.session.userRole = user.role;
  req.session.userName = user.nama;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali' });
    const user = q.getUserById.get(req.session.userId);
    if (!user || !user.aktif) {
      return req.session.destroy(() => res.status(401).json({ error: 'Sesi berakhir, silakan login kembali' }));
    }
    req.user = user;
    req.session.userRole = user.role;
    if (!roles.includes(user.role)) return res.status(403).json({ error: 'Anda tidak memiliki akses untuk tindakan ini' });
    next();
  };
}
function parseId(v) { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; }
function fkError(res, e, pesan) {
  return res.status(400).json({ error: pesan || 'Data masih dipakai pada tabel lain sehingga tidak bisa dihapus' });
}
// Pembungkus multer agar error batas ukuran/jenis file menjadi JSON yang ramah
function runUpload(mw) {
  return (req, res, next) => mw(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Ukuran file melebihi batas 50 MB' });
    return res.status(400).json({ error: 'File tidak didukung atau gagal diunggah' });
  });
}

/* ============ AUTH ============ */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = q.getUserByUsername.get(String(username || '').trim());
  if (!user || !user.aktif) return res.status(401).json({ error: 'Username/password salah atau akun nonaktif' });
  if (!bcrypt.compareSync(String(password || ''), user.password_hash)) return res.status(401).json({ error: 'Username/password salah' });

  q.setLastLogin.run(q.nowIso(), user.id);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Gagal membuat sesi' });
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.nama;
    q.buatNotifikasi(user.id, 'Login berhasil', `Selamat datang kembali, ${user.nama}`, 'info', null, null);
    res.json({ user: { id: user.id, username: user.username, nama: user.nama, role: user.role } });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* ============ PROFIL / GANTI PASSWORD ============ */
router.post('/ganti-password', requireAuth, (req, res) => {
  const { passwordLama, passwordBaru } = req.body || {};
  const user = q.getUserById.get(req.session.userId);
  const full = q.getUserByUsername.get(user.username);
  if (!bcrypt.compareSync(String(passwordLama || ''), full.password_hash)) return res.status(400).json({ error: 'Password lama salah' });
  if (!passwordBaru || String(passwordBaru).length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  q.updatePassword.run(bcrypt.hashSync(String(passwordBaru), 10), user.id);
  q.logAktivitas(user.id, 'PASSWORD', 'users', user.id, 'Ganti password sendiri');
  res.json({ ok: true });
});

/* ============ NOTIFIKASI ============ */
router.get('/notifikasi', requireAuth, (req, res) => {
  const list = q.getNotifikasiUser.all(req.session.userId);
  const unread = q.getUnreadCount.get(req.session.userId).cnt;
  res.json({ list, unread });
});
router.post('/notifikasi/read', requireAuth, (req, res) => {
  const { id, all } = req.body || {};
  if (all) q.markAllRead.run(req.session.userId);
  else if (id) q.markNotifRead.run(id, req.session.userId);
  res.json({ ok: true });
});

/* ============ USERS (admin) ============ */
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json(q.getAllUsers.all());
});
// Daftar ringkas untuk dropdown disposisi (semua pengguna aktif, tanpa data sensitif)
router.get('/users/ringkas', requireAuth, (req, res) => {
  res.json(q.getUserRingkas.all().filter(u => u.aktif));
});
router.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const { username, nama, role, password } = req.body || {};
  if (!String(username || '').trim() || !String(nama || '').trim() || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Data tidak lengkap / password minimal 6 karakter' });
  }
  if (!ROLE_VALID.includes(role || 'staff')) return res.status(400).json({ error: 'Role tidak valid' });
  try {
    const namaBersih = String(nama).trim();
    const r = q.insertUser.run(String(username).trim(), bcrypt.hashSync(String(password), 10), namaBersih, role || 'staff');
    q.logAktivitas(req.session.userId, 'USER_CREATE', 'users', r.lastInsertRowid, `User: ${username}`);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Username sudah dipakai' }); }
});
router.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = parseId(req.params.id);
  const target = id && q.getUserById.get(id);
  if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  const { nama, role, aktif } = req.body || {};
  if (!String(nama || '').trim()) return res.status(400).json({ error: 'Nama tidak boleh kosong' });
  if (!ROLE_VALID.includes(role)) return res.status(400).json({ error: 'Role tidak valid' });
  const jadiAktif = aktif ? 1 : 0;
  if (id === req.session.userId && (!jadiAktif || role !== 'admin')) {
    return res.status(400).json({ error: 'Anda tidak dapat menonaktifkan atau menurunkan role akun sendiri' });
  }
  if (target.role === 'admin' && target.aktif && (!jadiAktif || role !== 'admin') && q.countActiveAdmins.get().c <= 1) {
    return res.status(400).json({ error: 'Harus tersisa minimal satu admin aktif' });
  }
  q.updateUser.run(String(nama).trim(), role, jadiAktif, id);
  q.logAktivitas(req.session.userId, 'USER_UPDATE', 'users', id, `User id ${id}`);
  res.json({ ok: true });
});
router.post('/users/:id/reset-password', requireAuth, requireRole('admin'), (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter' });
  if (!q.getUserById.get(req.params.id)) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  q.updatePassword.run(bcrypt.hashSync(String(password), 10), req.params.id);
  q.logAktivitas(req.session.userId, 'USER_RESET', 'users', req.params.id, 'Reset password');
  res.json({ ok: true });
});

/* ============ KATEGORI ============ */
router.get('/kategori', requireAuth, (req, res) => res.json(q.getAllKategori.all()));
router.post('/kategori', requireAuth, requireRole('admin'), (req, res) => {
  const { kode, nama, deskripsi } = req.body || {};
  if (!String(kode || '').trim() || !String(nama || '').trim()) return res.status(400).json({ error: 'Kode dan nama kategori wajib diisi' });
  try {
    const r = q.insertKategori.run(String(kode).toUpperCase().trim(), String(nama).trim(), deskripsi);
    q.logAktivitas(req.session.userId, 'CREATE', 'kategori_arsip', r.lastInsertRowid, `Kategori: ${nama}`);
    res.json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Kode kategori sudah ada' }); }
});
router.put('/kategori/:id', requireAuth, requireRole('admin'), (req, res) => {
  q.updateKategori.run(req.body.nama, req.body.deskripsi, req.params.id);
  res.json({ ok: true });
});
router.delete('/kategori/:id', requireAuth, requireRole('admin'), (req, res) => {
  try { q.deleteKategori.run(req.params.id); res.json({ ok: true }); }
  catch (e) { fkError(res, e, 'Kategori masih dipakai oleh arsip, pindahkan arsip terlebih dahulu'); }
});

/* ============ LOKASI ============ */
router.get('/lokasi', requireAuth, (req, res) => res.json(q.getAllLokasi.all()));
router.post('/lokasi', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const { kode, nama, keterangan } = req.body || {};
  if (!String(kode || '').trim() || !String(nama || '').trim()) return res.status(400).json({ error: 'Kode dan nama lokasi wajib diisi' });
  try { const r = q.insertLokasi.run(String(kode).toUpperCase().trim(), String(nama).trim(), keterangan); res.json({ id: r.lastInsertRowid }); }
  catch (e) { res.status(400).json({ error: 'Kode lokasi sudah ada' }); }
});
router.put('/lokasi/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  q.updateLokasi.run(req.body.kode, req.body.nama, req.body.keterangan, req.body.aktif ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
router.delete('/lokasi/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  try { q.deleteLokasi.run(req.params.id); res.json({ ok: true }); }
  catch (e) { fkError(res, e, 'Lokasi masih dipakai oleh arsip'); }
});

/* ============ UNIT ============ */
router.get('/unit', requireAuth, (req, res) => res.json(q.getAllUnit.all()));
router.post('/unit', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const { kode, nama } = req.body || {};
  if (!String(kode || '').trim() || !String(nama || '').trim()) return res.status(400).json({ error: 'Kode dan nama unit wajib diisi' });
  try { const r = q.insertUnit.run(String(kode).toUpperCase().trim(), String(nama).trim()); res.json({ id: r.lastInsertRowid }); }
  catch (e) { res.status(400).json({ error: 'Kode unit sudah ada' }); }
});
router.put('/unit/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  q.updateUnit.run(req.body.kode, req.body.nama, req.body.aktif ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
router.delete('/unit/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  try { q.deleteUnit.run(req.params.id); res.json({ ok: true }); }
  catch (e) { fkError(res, e, 'Unit masih dipakai oleh arsip'); }
});

/* ============ INSTANSI ============ */
router.get('/instansi', requireAuth, (req, res) => res.json(q.getAllInstansi.all()));
router.post('/instansi', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const { nama, singkatan, alamat } = req.body || {};
  if (!String(nama || '').trim()) return res.status(400).json({ error: 'Nama instansi wajib diisi' });
  try { const r = q.insertInstansi.run(String(nama).trim(), singkatan, alamat); res.json({ id: r.lastInsertRowid }); }
  catch (e) { res.status(400).json({ error: 'Nama instansi sudah ada' }); }
});
router.put('/instansi/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  q.updateInstansi.run(req.body.nama, req.body.singkatan, req.body.alamat, req.body.aktif ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
router.delete('/instansi/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  try { q.deleteInstansi.run(req.params.id); res.json({ ok: true }); }
  catch (e) { fkError(res, e, 'Instansi masih dipakai oleh arsip'); }
});

/* ============ ARSIP ============ */
router.get('/arsip', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 20));
  const base = {
    search: `%${req.query.search || ''}%`, kategori: req.query.kategori || '', status: req.query.status || '',
    dari: req.query.tanggal_dari || '', sampai: req.query.tanggal_sampai || '',
    lokasi: req.query.lokasi || '', instansi: req.query.instansi || ''
  };
  const total = q.searchArsipCount.get(base).cnt;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const data = q.getArsipList.all({ ...base, limit, offset: (page - 1) * limit });
  res.json({ data, total, page, limit, totalPages });
});

router.get('/arsip/stats', requireAuth, (req, res) => {
  res.json({ stats: q.getArsipStats.get(), byKategori: q.getStatsByKategori.all(), byBulan: q.getStatsByBulan.all(), byStatus: q.getStatsByStatus.all() });
});

router.get('/arsip/:id', requireAuth, (req, res) => {
  const arsip = q.getArsipById.get(req.params.id);
  if (!arsip) return res.status(404).json({ error: 'Arsip tidak ditemukan' });
  arsip.lampiran = q.getLampiranByArsip.all(req.params.id);
  arsip.disposisi = q.getDisposisiByArsip.all(req.params.id);
  arsip.peminjaman = q.getPeminjamanByArsip.all(req.params.id);
  res.json(arsip);
});

function makeKodeQr(nomorArsip) {
  return `${nomorArsip}|a&s|${crypto.randomBytes(4).toString('hex')}`;
}

router.post('/arsip', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!String(b.judul || '').trim()) return res.status(400).json({ error: 'Judul arsip wajib diisi' });
  if (!validDate(b.tanggal_arsip)) return res.status(400).json({ error: 'Tanggal arsip wajib diisi dengan format YYYY-MM-DD' });
  const kategori = q.getKategoriById.get(b.kategori_id);
  if (!kategori) return res.status(400).json({ error: 'Kategori tidak valid' });
  if (b.status && !ARSIP_STATUS.includes(b.status)) return res.status(400).json({ error: 'Status arsip tidak valid' });
  const nomor = q.generateNomorArsip(kategori.kode);
  const kodeQr = makeKodeQr(nomor);
  const r = q.insertArsip.run(nomor, b.kategori_id, String(b.judul).trim(), b.nomor_surat || null, b.tanggal_surat || null, b.tanggal_arsip,
    b.pengirim || null, b.instansi_id || null, b.penerima || null, b.unit_id || null, b.perihal || null, b.ringkasan || null,
    b.status || 'aktif', b.lokasi_fisik || null, b.lokasi_id || null, kodeQr, req.session.userId);
  q.logAktivitas(req.session.userId, 'CREATE', 'arsip', r.lastInsertRowid, `Arsip: ${nomor} - ${b.judul}`);
  res.json({ id: r.lastInsertRowid, nomor_arsip: nomor, kode_qr: kodeQr });
});

router.put('/arsip/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const lama = q.getArsipById.get(req.params.id);
  if (!lama) return res.status(404).json({ error: 'Arsip tidak ditemukan' });
  if (!String(b.judul || '').trim()) return res.status(400).json({ error: 'Judul arsip wajib diisi' });
  if (!validDate(b.tanggal_arsip)) return res.status(400).json({ error: 'Tanggal arsip wajib diisi dengan format YYYY-MM-DD' });
  if (!q.getKategoriById.get(b.kategori_id)) return res.status(400).json({ error: 'Kategori tidak valid' });
  if (b.status && !ARSIP_STATUS.includes(b.status)) return res.status(400).json({ error: 'Status arsip tidak valid' });
  q.updateArsip.run(b.kategori_id, String(b.judul).trim(), b.nomor_surat || null, b.tanggal_surat || null, b.tanggal_arsip,
    b.pengirim || null, b.instansi_id || null, b.penerima || null, b.unit_id || null, b.perihal || null, b.ringkasan || null,
    b.status || 'aktif', b.lokasi_fisik || null, b.lokasi_id || null, req.session.userId, req.params.id);
  q.logAktivitas(req.session.userId, 'UPDATE', 'arsip', req.params.id, `Arsip: ${b.judul}`);
  res.json({ ok: true });
});

/* TEMPAT SAMPAH */
router.delete('/arsip/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const a = q.getArsipById.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arsip tidak ditemukan' });
  if (a.deleted_at) return res.status(400).json({ error: 'Arsip sudah berada di tempat sampah' });
  q.softDeleteArsip.run(q.nowIso(), req.session.userId, req.params.id);
  q.logAktivitas(req.session.userId, 'DELETE', 'arsip', req.params.id, `Arsip ke tempat sampah: ${a.nomor_arsip}`);
  res.json({ ok: true });
});
router.post('/arsip/:id/restore', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const a = q.getArsipById.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arsip tidak ditemukan' });
  q.restoreArsip.run(req.session.userId, req.params.id);
  q.logAktivitas(req.session.userId, 'RESTORE', 'arsip', req.params.id, `Arsip dipulihkan: ${a.nomor_arsip}`);
  res.json({ ok: true });
});
router.delete('/arsip/:id/permanen', requireAuth, requireRole('admin'), (req, res) => {
  const a = q.getArsipById.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Arsip tidak ditemukan' });
  if (!a.deleted_at) return res.status(400).json({ error: 'Pindahkan arsip ke tempat sampah sebelum menghapus permanen' });
  const lampiran = q.getLampiranByArsip.all(req.params.id);
  for (const l of lampiran) { const p = path.join(uploadsDir, l.nama_file); if (fs.existsSync(p)) fs.unlinkSync(p); }
  q.hardDeleteArsip.run(req.params.id);
  q.logAktivitas(req.session.userId, 'PURGE', 'arsip', req.params.id, `Arsip dihapus permanen: ${a.nomor_arsip}`);
  res.json({ ok: true });
});
router.get('/trash', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  res.json(q.getTrashList.all());
});

/* QR */
router.get('/arsip/:id/qr', requireAuth, async (req, res) => {
  const a = q.getArsipById.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Tidak ditemukan' });
  try {
    const dataUrl = await qrcode.toDataURL(a.kode_qr || a.nomor_arsip, { width: 220, margin: 1 });
    res.json({ dataUrl, nomor_arsip: a.nomor_arsip });
  } catch (e) { res.status(500).json({ error: 'Gagal generate QR' }); }
});

/* ============ DISPOSISI ============ */
router.get('/disposisi', requireAuth, (req, res) => {
  res.json(q.getAllDisposisi.all().filter(d => !d.arsip_deleted_at));
});
router.post('/disposisi', requireAuth, (req, res) => {
  const b = req.body || {};
  const arsip = q.getArsipById.get(b.arsip_id);
  if (!arsip || arsip.deleted_at) return res.status(400).json({ error: 'Arsip tujuan disposisi tidak ditemukan' });
  if (b.kepada_user) {
    const target = q.getUserById.get(b.kepada_user);
    if (!target || !target.aktif) return res.status(400).json({ error: 'Penerima disposisi tidak valid' });
  }
  if (b.status && !DISPOSISI_STATUS.includes(b.status)) return res.status(400).json({ error: 'Status disposisi tidak valid' });
  const r = q.insertDisposisi.run(b.arsip_id, req.session.userId, b.kepada_user || null, b.instruksi || null,
    b.status || 'proses', validDate(b.tanggal) ? b.tanggal : todayLocal(), b.catatan || null, req.session.userId);
  if (b.kepada_user) {
    const target = q.getUserById.get(b.kepada_user);
    q.buatNotifikasi(b.kepada_user, 'Disposisi baru', `Anda menerima disposisi arsip ${arsip.nomor_arsip} dari ${req.user.nama}`, 'disposisi', 'arsip', b.arsip_id);
  }
  q.logAktivitas(req.session.userId, 'DISPOSISI', 'arsip', b.arsip_id, `Disposisi arsip: ${b.instruksi || '-'}`);
  res.json({ id: r.lastInsertRowid });
});
router.put('/disposisi/:id', requireAuth, (req, res) => {
  const lama = q.getDisposisiById.get(req.params.id);
  if (!lama) return res.status(404).json({ error: 'Disposisi tidak ditemukan' });
  if (req.user.role !== 'admin' && lama.dari_user !== req.user.id && lama.kepada_user !== req.user.id) {
    return res.status(403).json({ error: 'Anda tidak berhak mengubah disposisi ini' });
  }
  const b = req.body || {};
  const kepada = b.kepada_user !== undefined ? (b.kepada_user || null) : lama.kepada_user;
  if (kepada) {
    const target = q.getUserById.get(kepada);
    if (!target || !target.aktif) return res.status(400).json({ error: 'Penerima disposisi tidak valid' });
  }
  const status = b.status || lama.status;
  if (!DISPOSISI_STATUS.includes(status)) return res.status(400).json({ error: 'Status disposisi tidak valid' });
  const tanggal = validDate(b.tanggal || b.tanggal_disposisi) ? (b.tanggal || b.tanggal_disposisi) : lama.tanggal_disposisi;
  q.updateDisposisi.run(kepada, b.instruksi !== undefined ? (b.instruksi || null) : lama.instruksi,
    status, tanggal, b.catatan !== undefined ? (b.catatan || null) : lama.catatan, req.params.id);
  if (kepada && kepada !== lama.kepada_user) {
    const arsip = q.getArsipById.get(lama.arsip_id);
    q.buatNotifikasi(kepada, 'Disposisi baru', `Anda menerima disposisi arsip ${arsip ? arsip.nomor_arsip : ''}`, 'disposisi', 'arsip', lama.arsip_id);
  }
  q.logAktivitas(req.session.userId, 'DISPOSISI_UPDATE', 'disposisi', req.params.id, `Status: ${status}`);
  res.json({ ok: true });
});
router.delete('/disposisi/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  q.deleteDisposisi.run(req.params.id); res.json({ ok: true });
});

/* ============ PEMINJAMAN ============ */
router.get('/peminjaman', requireAuth, (req, res) => {
  const overdue = q.checkOverdue.all();
  for (const o of overdue) q.markOverdue.run(o.id);
  res.json(q.getPeminjamanList.all());
});
router.post('/peminjaman', requireAuth, (req, res) => {
  const b = req.body || {};
  const arsip = q.getArsipById.get(b.arsip_id);
  if (!arsip || arsip.deleted_at) return res.status(400).json({ error: 'Arsip yang dipinjam tidak ditemukan' });
  if (arsip.status === 'hilang' || arsip.status === 'rusak') return res.status(400).json({ error: 'Arsip hilang/rusak tidak dapat dipinjam' });
  if (q.getActiveLoanByArsip.get(b.arsip_id)) return res.status(400).json({ error: 'Arsip ini masih dipinjam dan belum dikembalikan' });
  if (!String(b.peminjam || '').trim()) return res.status(400).json({ error: 'Nama peminjam wajib diisi' });
  if (!validDate(b.tanggal_pinjam) || !validDate(b.tanggal_jatuh_tempo)) {
    return res.status(400).json({ error: 'Tanggal pinjam dan jatuh tempo wajib diisi' });
  }
  if (b.tanggal_jatuh_tempo < b.tanggal_pinjam) return res.status(400).json({ error: 'Jatuh tempo tidak boleh sebelum tanggal pinjam' });
  const r = q.insertPeminjaman.run(b.arsip_id, String(b.peminjam).trim(), b.unit_peminjam || null, b.alasan || null,
    b.tanggal_pinjam, b.tanggal_jatuh_tempo, null, 'dipinjam', b.catatan || null, req.session.userId);
  q.db.prepare("UPDATE arsip SET status = 'dipinjam', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(b.arsip_id);
  q.logAktivitas(req.session.userId, 'PINJAM', 'arsip', b.arsip_id, `Peminjaman: ${b.peminjam} (${arsip.nomor_arsip})`);
  res.json({ id: r.lastInsertRowid });
});
router.put('/peminjaman/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const p = q.getPeminjamanById.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Data peminjaman tidak ditemukan' });
  const status = b.status || p.status;
  if (!['dipinjam', 'dikembalikan', 'terlambat'].includes(status)) return res.status(400).json({ error: 'Status peminjaman tidak valid' });
  const kembali = status === 'dikembalikan' ? (validDate(b.tanggal_kembali) ? b.tanggal_kembali : todayLocal()) : null;
  q.updatePeminjaman.run(status, kembali, b.catatan !== undefined ? (b.catatan || null) : p.catatan, req.params.id);
  if (status === 'dikembalikan') {
    q.db.prepare("UPDATE arsip SET status = 'aktif', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'dipinjam'").run(p.arsip_id);
    q.buatNotifikasi(p.created_by, 'Peminjaman dikembalikan', `Arsip telah dikembalikan`, 'info', 'arsip', p.arsip_id);
  } else {
    q.db.prepare("UPDATE arsip SET status = 'dipinjam', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(p.arsip_id);
  }
  q.logAktivitas(req.session.userId, 'PEMINJAMAN_UPDATE', 'peminjaman', req.params.id, `Status: ${status}`);
  res.json({ ok: true });
});
router.delete('/peminjaman/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const p = q.getPeminjamanById.get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Data peminjaman tidak ditemukan' });
  q.deletePeminjaman.run(req.params.id);
  if (p.status === 'dipinjam' || p.status === 'terlambat') {
    q.db.prepare("UPDATE arsip SET status = 'aktif', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'dipinjam'").run(p.arsip_id);
  }
  q.logAktivitas(req.session.userId, 'PEMINJAMAN_DELETE', 'peminjaman', req.params.id, 'Hapus data peminjaman');
  res.json({ ok: true });
});

/* ============ LAMPIRAN ============ */
router.post('/arsip/:id/lampiran', requireAuth, runUpload(upload.array('files')), (req, res) => {
  const arsip = q.getArsipById.get(req.params.id);
  if (!arsip) {
    if (req.files) req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
    return res.status(404).json({ error: 'Arsip tidak ditemukan' });
  }
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Tidak ada file yang diunggah (format tidak didukung?)' });
  const out = [];
  for (const f of req.files) {
    const r = q.insertLampiran.run(req.params.id, f.filename, f.originalname, f.mimetype, f.size, f.path);
    out.push({ id: r.lastInsertRowid, nama_original: f.originalname });
  }
  q.logAktivitas(req.session.userId, 'UPLOAD', 'lampiran', req.params.id, `${out.length} file diunggah`);
  res.json({ files: out });
});
router.delete('/lampiran/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  const l = q.getLampiranById.get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Lampiran tidak ditemukan' });
  const p = path.join(uploadsDir, l.nama_file); if (fs.existsSync(p)) fs.unlinkSync(p);
  q.deleteLampiran.run(req.params.id);
  q.logAktivitas(req.session.userId, 'LAMPIRAN_DELETE', 'lampiran', req.params.id, `Hapus file ${l.nama_original}`);
  res.json({ ok: true });
});
router.get('/lampiran/:id/download', requireAuth, (req, res) => {
  const l = q.getLampiranById.get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Tidak ditemukan' });
  const p = path.join(uploadsDir, l.nama_file);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File fisik tidak ditemukan' });
  res.download(p, l.nama_original);
});

/* ============ LOG ============ */
router.get('/log', requireAuth, requireRole('admin'), (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  res.json({ data: q.getLogAktivitas.all(limit, (page - 1) * limit) });
});

/* ============ LAPORAN / EKSPOR ============ */
router.get('/laporan', requireAuth, (req, res) => {
  const { dari, sampai, kategori } = req.query;
  const rows = q.db.prepare(`
    SELECT a.nomor_arsip, a.tanggal_arsip, a.nomor_surat, a.judul, a.perihal, a.status,
           k.kode AS kategori_kode, k.nama AS kategori_nama,
           COALESCE(a.pengirim,'') AS pengirim, COALESCE(a.penerima,'') AS penerima,
           COALESCE(i.nama,'') AS instansi_nama
    FROM arsip a
    JOIN kategori_arsip k ON a.kategori_id = k.id
    LEFT JOIN instansi i ON a.instansi_id = i.id
    WHERE a.deleted_at IS NULL
      AND (? = '' OR a.tanggal_arsip >= ?)
      AND (? = '' OR a.tanggal_arsip <= ?)
      AND (? = '' OR a.kategori_id = ?)
    ORDER BY a.tanggal_arsip DESC
  `).all(dari || '', dari || '', sampai || '', sampai || '', kategori || '', kategori || '');
  const total = q.db.prepare('SELECT COUNT(*) AS c FROM arsip WHERE deleted_at IS NULL').get().c;
  res.json({ rows, total, filter: { dari, sampai, kategori } });
});

/* EKSPOR CSV (kompatibel Excel) */
router.get('/ekspor/csv', requireAuth, (req, res) => {
  const { dari, sampai, kategori } = req.query;
  const rows = q.db.prepare(`
    SELECT a.nomor_arsip, a.tanggal_arsip, k.nama AS kategori,
           a.nomor_surat, a.judul, a.perihal,
           COALESCE(a.pengirim,'') AS pengirim, COALESCE(a.penerima,'') AS penerima,
           COALESCE(i.nama,'') AS instansi, a.status
    FROM arsip a JOIN kategori_arsip k ON a.kategori_id = k.id
    LEFT JOIN instansi i ON a.instansi_id = i.id
    WHERE a.deleted_at IS NULL
      AND (? = '' OR a.tanggal_arsip >= ?) AND (? = '' OR a.tanggal_arsip <= ?) AND (? = '' OR a.kategori_id = ?)
    ORDER BY a.tanggal_arsip DESC
  `).all(dari || '', dari || '', sampai || '', sampai || '', kategori || '', kategori || '');

  const header = ['Nomor Arsip', 'Tanggal', 'Kategori', 'No Surat', 'Judul', 'Perihal', 'Pengirim', 'Penerima', 'Instansi', 'Status'];
  const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = [
    header.map(esc).join(','),
    ...rows.map(r => [r.nomor_arsip, r.tanggal_arsip, r.kategori, r.nomor_surat, r.judul, r.perihal, r.pengirim, r.penerima, r.instansi, r.status].map(esc).join(','))
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rekap-arsip-' + Date.now() + '.csv"');
  res.send('\uFEFF' + csv);
});

/* ============ PANEL DASHBOARD (gabungan) ============ */
router.get('/dashboard', requireAuth, (req, res) => {
  // tandai peminjaman yang terlambat
  const overdue = q.checkOverdue.all();
  for (const o of overdue) q.markOverdue.run(o.id);
  res.json({
    stats: q.getArsipStats.get(),
    byKategori: q.getStatsByKategori.all(),
    byBulan: q.getStatsByBulan.all(),
    byStatus: q.getStatsByStatus.all(),
    kegiatanHariIni: q.getAgendaHariIni.all(),
    pinjamanAktif: q.getPeminjamanAktif.all(),
    disposisiTerbaru: q.getDisposisiTerbaru.all(6),
    arsipTerbaru: q.getArsipTerbaru.all(6),
    aktivitas: q.getRecentAktivitas.all(8),
    agendaCount: q.getAgendaBulan.all(monthLocal()).length
  });
});

/* ============ EKSPOR EXCEL (.xlsx) ============ */
router.get('/ekspor/xlsx', requireAuth, async (req, res) => {
  try {
    const { dari, sampai, kategori } = req.query;
    const header = [
      'Nomor Arsip', 'Tanggal', 'Kategori', 'No Surat', 'Judul', 'Perihal',
      'Pengirim', 'Penerima', 'Instansi', 'Status'
    ];
    const rows = q.db.prepare(`
      SELECT a.nomor_arsip, a.tanggal_arsip, k.nama AS kategori, a.nomor_surat, a.judul, a.perihal,
             COALESCE(a.pengirim,'') AS pengirim, COALESCE(a.penerima,'') AS penerima,
             COALESCE(i.nama,'') AS instansi, a.status
      FROM arsip a JOIN kategori_arsip k ON a.kategori_id = k.id
      LEFT JOIN instansi i ON a.instansi_id = i.id
      WHERE a.deleted_at IS NULL
        AND (? = '' OR a.tanggal_arsip >= ?) AND (? = '' OR a.tanggal_arsip <= ?) AND (? = '' OR a.kategori_id = ?)
      ORDER BY a.tanggal_arsip DESC
    `).all(dari || '', dari || '', sampai || '', sampai || '', kategori || '', kategori || '');

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistem Arsip Kantor Pertanahan';
    const ws = wb.addWorksheet('Rekap Arsip');
    ws.columns = header.map(h => ({ header: h, width: Math.max(h.length + 6, 14) }));
    for (const r of rows) ws.addRow(Object.values(r));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B3B2E' } };
    ws.getRow(1).height = 22;
    ws.getRow(1).alignment = { vertical: 'middle' };
    ws.eachRow((row, n) => { row.eachCell(c => { c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; }); });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="rekap-arsip-' + Date.now() + '.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { res.status(500).json({ error: 'Gagal membuat Excel: ' + e.message }); }
});

/* ============ IMPORT CSV ============ */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === ',' || c === ';') { row.push(field); field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

router.post('/import/arsip', requireAuth, requireRole('admin', 'staff'), runUpload(upload.single('file')), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tidak ada file yang diunggah' });
  try {
    const text = fs.readFileSync(req.file.path, 'utf8');
    const rows = parseCsv(text);
    if (rows.length < 2) return res.status(400).json({ error: 'File CSV kosong (harus ada header + minimal 1 baris data)' });

    const header = rows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z]/g, ''));
    const idx = name => header.indexOf(name);
    if (idx('judul') === -1) return res.status(400).json({ error: 'Header tidak sesuai. Minimal kolom: kategori, judul, tanggal_arsip' });

    const muat = {
      kategori: idx('kategori'), judul: idx('judul'), nomorsurat: idx('nomorsurat'),
      tanggalsurat: idx('tanggalsurat'), tanggalarsip: idx('tanggalarsip'), pengirim: idx('pengirim'),
      penerima: idx('penerima'), perihal: idx('perihal'), ringkasan: idx('ringkasan'),
      status: idx('status'), lokasi: idx('lokasifisik')
    };
    let masuk = 0, gagal = 0; const eror = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const g = k => (muat[k] !== -1 && muat[k] < r.length) ? String(r[muat[k]]).trim() : '';
      const judul = g('judul');
      const kodeKat = g('kategori').toUpperCase();
      if (!judul) { gagal++; eror.push(`Baris ${i + 1}: judul kosong`); continue; }
      const kat = q.getKategoriByKode.get(kodeKat) || q.getKategoriByKode.get(kodeKat.replace(/[^A-Z]/g, ''));
      if (!kat) { gagal++; eror.push(`Baris ${i + 1}: kategori '${kodeKat}' tidak dikenal`); continue; }
      const tanggal = g('tanggalarsip') || todayLocal();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) { gagal++; eror.push(`Baris ${i + 1}: tanggal_arsip '${tanggal}' tidak valid (YYYY-MM-DD)`); continue; }
      const nomor = q.generateNomorArsip(kat.kode);
      const kodeQr = `${nomor}|a&s|${crypto.randomBytes(4).toString('hex')}`;
      q.insertArsip.run(nomor, kat.id, judul, g('nomorsurat') || null, g('tanggalsurat') || null, tanggal,
        g('pengirim') || null, null, g('penerima') || null, null, g('perihal') || null, g('ringkasan') || null,
        ARSIP_STATUS.includes(g('status')) ? g('status') : 'aktif',
        g('lokasi') || null, null, kodeQr, req.session.userId);
      masuk++;
    }
    q.logAktivitas(req.session.userId, 'IMPORT', 'arsip', null, `Import CSV: ${masuk} berhasil, ${gagal} gagal`);
    res.json({ masuk, gagal, eror: eror.slice(0, 20) });
  } catch (e) { res.status(500).json({ error: 'Gagal import: ' + e.message }); }
  finally {
    if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (e) { /* abaikan */ } }
  }
});

/* ============ BACKUP JSON ============ */
router.get('/backup', requireAuth, requireRole('admin'), (req, res) => {
  const tables = ['settings', 'kategori_arsip', 'lokasi_arsip', 'unit_bidang', 'instansi', 'arsip',
    'lampiran', 'disposisi', 'peminjaman', 'buku_agenda', 'agenda_kegiatan', 'log_aktivitas', 'notifikasi'];
  const out = { aplikasi: 'Sistem Arsip Kantor Pertanahan', diekspor: new Date().toISOString(), data: {} };
  // Data pengguna tanpa hash password
  out.data.users = q.db.prepare('SELECT id, username, nama, role, aktif, last_login, created_at FROM users').all();
  for (const t of tables) out.data[t] = q.db.prepare(`SELECT * FROM ${t}`).all();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="backup-arsip-' + Date.now() + '.json"');
  res.send(JSON.stringify(out, null, 1));
});

/* ============ SETTINGS / PROFIL KANTOR ============ */
router.get('/settings', requireAuth, (req, res) => {
  const s = {};
  q.getAllSettings.all().forEach(r => s[r.kunci] = r.nilai);
  res.json(s);
});
router.put('/settings', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  for (const k of Object.keys(b)) q.setSetting.run(k, String(b[k] ?? ''));
  q.logAktivitas(req.session.userId, 'SETTING', 'settings', null, 'Perbarui profil kantor');
  res.json({ ok: true });
});

/* ============ BUKU AGENDA ============ */
router.get('/buku-agenda', requireAuth, (req, res) => {
  const jenis = req.query.jenis === 'keluar' ? 'keluar' : 'masuk';
  const tahun = req.query.tahun ? parseInt(req.query.tahun) : new Date().getFullYear();
  const rows = q.getBukuAgendaList.all(jenis).filter(r => Number(r.tahun) === tahun);
  res.json({
    rows,
    jenis,
    tahun,
    jumlahTahunIni: q.getBukuAgendaCount.get(jenis, tahun).c,
    tahunTersedia: [...new Set(q.getBukuAgendaList.all(jenis).map(r => Number(r.tahun)))].sort((a, b) => b - a)
  });
});
router.post('/buku-agenda', requireAuth, (req, res) => {
  const b = req.body || {};
  const jenis = b.jenis === 'keluar' ? 'keluar' : 'masuk';
  const tahun = parseInt(b.tahun) || new Date().getFullYear();
  if (!validDate(b.tanggal)) return res.status(400).json({ error: 'Tanggal agenda wajib diisi' });
  if (!String(b.perihal || '').trim()) return res.status(400).json({ error: 'Perihal wajib diisi' });
  if (b.arsip_id && !q.getArsipById.get(b.arsip_id)) return res.status(400).json({ error: 'Arsip terkait tidak ditemukan' });
  const no = q.getBukuAgendaLastUrut.get(jenis, tahun).m + 1;
  const r = q.insertBukuAgenda.run(jenis, tahun, no, b.tanggal, b.nomor_surat || null, b.asal_tujuan || null,
    String(b.perihal).trim(), b.keterangan || null, b.arsip_id || null, req.session.userId);
  q.logAktivitas(req.session.userId, 'AGENDA', 'buku_agenda', r.lastInsertRowid, `Agenda ${jenis} no ${no}/${tahun}: ${b.perihal}`);
  res.json({ id: r.lastInsertRowid, nomor_urut: no });
});
router.put('/buku-agenda/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!q.getBukuAgendaById.get(req.params.id)) return res.status(404).json({ error: 'Agenda tidak ditemukan' });
  if (!validDate(b.tanggal)) return res.status(400).json({ error: 'Tanggal agenda wajib diisi' });
  if (!String(b.perihal || '').trim()) return res.status(400).json({ error: 'Perihal wajib diisi' });
  q.updateBukuAgenda.run(b.tanggal, b.nomor_surat || null, b.asal_tujuan || null, String(b.perihal).trim(), b.keterangan || null, b.arsip_id || null, req.params.id);
  res.json({ ok: true });
});
router.delete('/buku-agenda/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  q.deleteBukuAgenda.run(req.params.id); res.json({ ok: true });
});

/* ============ AGENDA KEGIATAN (KALENDER) ============ */
router.get('/agenda', requireAuth, (req, res) => {
  const bulan = req.query.bulan || monthLocal();
  res.json({ rows: q.getAgendaBulan.all(bulan), bulan });
});
router.post('/agenda', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!String(b.judul || '').trim()) return res.status(400).json({ error: 'Judul kegiatan wajib diisi' });
  if (!validDate(b.tanggal)) return res.status(400).json({ error: 'Tanggal kegiatan wajib diisi' });
  const r = q.insertAgendaKegiatan.run(String(b.judul).trim(), b.tanggal, b.jam_mulai || null, b.jam_selesai || null,
    b.lokasi || null, b.tipe || 'kegiatan', b.keterangan || null, req.session.userId);
  q.logAktivitas(req.session.userId, 'AGENDA', 'agenda_kegiatan', r.lastInsertRowid, `Agenda: ${b.judul}`);
  res.json({ id: r.lastInsertRowid });
});
router.put('/agenda/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!q.getAgendaById.get(req.params.id)) return res.status(404).json({ error: 'Agenda tidak ditemukan' });
  if (!String(b.judul || '').trim()) return res.status(400).json({ error: 'Judul kegiatan wajib diisi' });
  if (!validDate(b.tanggal)) return res.status(400).json({ error: 'Tanggal kegiatan wajib diisi' });
  q.updateAgendaKegiatan.run(String(b.judul).trim(), b.tanggal, b.jam_mulai || null, b.jam_selesai || null, b.lokasi || null, b.tipe || 'kegiatan', b.keterangan || null, req.params.id);
  res.json({ ok: true });
});
router.delete('/agenda/:id', requireAuth, requireRole('admin', 'staff'), (req, res) => {
  q.deleteAgendaKegiatan.run(req.params.id); res.json({ ok: true });
});

// Endpoint API yang tidak dikenal → JSON 404 (bukan halaman HTML)
router.use((req, res) => res.status(404).json({ error: 'Endpoint API tidak ditemukan' }));

module.exports = router;