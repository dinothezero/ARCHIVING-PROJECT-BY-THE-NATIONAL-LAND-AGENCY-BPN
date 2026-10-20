/* =====================================================================
   mock-api.js — Backend tiruan di sisi browser (untuk GitHub Pages).

   GitHub Pages hanya menyajikan file statis, sehingga server Node/Express
   tidak dapat dijalankan di sana. File ini menyediakan lapisan API yang
   kompatibel dengan src/routes/api.js, menyimpan data di localStorage,
   dan menyimpan lampiran di IndexedDB.

   Lapisan ini HANYA dipakai saat STATIC_MODE aktif di app.js (yaitu saat
   halaman dijalankan di GitHub Pages / hosting statis, bukan via `npm start`).
   ===================================================================== */
(function () {
  'use strict';

  var LS_KEY = 'bpnarsip.staticdb.v1';
  var SESSION_KEY = 'bpnarsip.session';
  var DB = null;
  var READY = null;

  /* ===================== UTIL ===================== */
  function pad(n) { return String(n).padStart(2, '0'); }
  function nowIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function today() { return nowIso().slice(0, 10); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function nextId(arr) { return arr.reduce(function (m, x) { return Math.max(m, x.id || 0); }, 0) + 1; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (String(arr[i].id) === String(id)) return arr[i]; return null; }
  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return null; } }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(DB)); }
  function sessionGet() { return parseInt(localStorage.getItem(SESSION_KEY) || '0', 10); }
  function sessionSet(id) { localStorage.setItem(SESSION_KEY, String(id)); }
  function sessionClear() { localStorage.removeItem(SESSION_KEY); }

  /* ===================== PASSWORD ===================== */
  async function hashPassword(pw) {
    var s = 'bpnarsip::' + pw;
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      try {
        var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        var arr = new Uint8Array(buf), hex = '';
        for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
        return 'sha256:' + hex;
      } catch (e) { /* lanjut fallback */ }
    }
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var j = 0; j < s.length; j++) { var ch = s.charCodeAt(j); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'fnv:' + ((h2 >>> 0).toString(16) + (h1 >>> 0).toString(16));
  }
  async function checkPassword(pw, hash) {
    if (!hash) return false;
    return (await hashPassword(pw)) === hash;
  }

  /* ===================== DATA AWAL ===================== */
  var KATEGORI = [
    ['SKM', 'Surat Keputusan Menteri', 'Surat keputusan dari tingkat menteri'],
    ['SKG', 'Surat Keputusan Gubernur', 'Surat keputusan dari tingkat gubernur'],
    ['SKB', 'Surat Keputusan Bupati/Walikota', 'Surat keputusan dari tingkat bupati/walikota'],
    ['SKK', 'Surat Keputusan Kepala BPN', 'Surat keputusan dari kepala BPN'],
    ['SM', 'Surat Masuk', 'Surat masuk dari instansi lain'],
    ['SKL', 'Surat Keluar', 'Surat keluar ke instansi lain'],
    ['SHM', 'Sertifikat Hak Milik', 'Sertifikat hak milik tanah'],
    ['SHG', 'Sertifikat Hak Guna', 'Sertifikat hak guna bangunan/usaha'],
    ['HGB', 'Hak Guna Bangunan', 'Dokumen hak guna bangunan'],
    ['HGU', 'Hak Guna Usaha', 'Dokumen hak guna usaha'],
    ['LPJ', 'Laporan Pertanggungjawaban', 'Laporan pertanggungjawaban keuangan/kegiatan'],
    ['LKN', 'Laporan Kinerja', 'Laporan kinerja bulanan/tahunan'],
    ['LAIN', 'Lainnya', 'Kategori arsip lainnya']
  ];
  var UNIT = [
    ['UMUM', 'Subbagian Umum & Kepegawaian'],
    ['PENG', 'Seksi Pengukuran & Pemetaan'],
    ['HAK', 'Seksi Hak Tanah & Pendaftaran Tanah'],
    ['PENET', 'Seksi Penetapan & Pemberdayaan'],
    ['SRV', 'Seksi Survei & Pemetaan'],
    ['INF', 'Seksi Infrastruktur Pertanahan']
  ];
  var INSTANSI = [
    ['Kementerian ATR/BPN', 'ATR/BPN'],
    ['Pemerintah Kabupaten/Kota', 'PEMKAB'],
    ['Badan Pertanahan Pusat', 'BPP'],
    ['Kejaksaan Negeri', 'KEJARI'],
    ['Kepolisian', 'POLRI'],
    ['Pengadilan Negeri', 'PN']
  ];
  var LOKASI = [
    ['RAK-A1', 'Rak Arsip A - Baris 1'],
    ['RAK-A2', 'Rak Arsip A - Baris 2'],
    ['RAK-B1', 'Rak Arsip B - Baris 1'],
    ['LEM-1', 'Lemari Arsip 1'],
    ['BOX-1', 'Box Arsip 1']
  ];
  var SETTINGS = {
    nama_kantor: 'Kantor Pertanahan',
    sub_nama: 'Badan Pertanahan Nasional',
    alamat: 'Jl. Merdeka No. 1, Kota Contoh',
    telepon: '(021) 1234-5678',
    email: 'kantor@pertanahan.go.id',
    website: 'www.pertanahan.go.id',
    kepala_nama: 'Ir. Contoh Surya, M.Si.',
    kepala_nip: '19600101 198501 1 001',
    kota_kop: 'Jakarta',
    motto: 'Mewujudkan Pelayanan Pertanahan yang Prima dan Terpercaya'
  };

  async function seed() {
    if (DB) return DB;
    var existing = load();
    if (existing && existing.users && existing.users.length) { DB = existing; return DB; }

    var hash = await hashPassword('password123');
    DB = {
      users: [
        { id: 1, username: 'admin', password_hash: hash, nama: 'Administrator', role: 'admin', aktif: 1, last_login: null, created_at: nowIso() },
        { id: 2, username: 'staff1', password_hash: hash, nama: 'Staff Arsip', role: 'staff', aktif: 1, last_login: null, created_at: nowIso() },
        { id: 3, username: 'kepala1', password_hash: hash, nama: 'Kepala Bidang', role: 'kepala', aktif: 1, last_login: null, created_at: nowIso() }
      ],
      kategori: KATEGORI.map(function (k, i) { return { id: i + 1, kode: k[0], nama: k[1], deskripsi: k[2], created_at: nowIso() }; }),
      unit: UNIT.map(function (u, i) { return { id: i + 1, kode: u[0], nama: u[1], aktif: 1, created_at: nowIso() }; }),
      instansi: INSTANSI.map(function (x, i) { return { id: i + 1, nama: x[0], singkatan: x[1], alamat: '', aktif: 1, created_at: nowIso() }; }),
      lokasi: LOKASI.map(function (l, i) { return { id: i + 1, kode: l[0], nama: l[1], keterangan: '', aktif: 1, created_at: nowIso() }; }),
      arsip: [], lampiran: [], disposisi: [], peminjaman: [],
      log: [], notifikasi: [], bukuAgenda: [], agenda: [],
      settings: clone(SETTINGS)
    };
    save();
    return DB;
  }
  function ensureReady() { if (!READY) READY = seed(); return READY; }

  /* ===================== LOG & NOTIFIKASI ===================== */
  function logAktivitas(userId, aksi, tabel, recordId, detail) {
    DB.log.push({ id: nextId(DB.log), user_id: userId, aksi: aksi, tabel: tabel, record_id: recordId, detail: detail || '', created_at: nowIso() });
    if (DB.log.length > 5000) DB.log = DB.log.slice(-5000);
    save();
  }
  function buatNotifikasi(userId, judul, pesan, tipe, refTabel, refId) {
    DB.notifikasi.push({ id: nextId(DB.notifikasi), user_id: userId, judul: judul, pesan: pesan || '', tipe: tipe || 'info', is_read: 0, ref_tabel: refTabel || null, ref_id: refId || null, created_at: nowIso() });
    save();
  }

  /* ===================== JOIN HELPERS ===================== */
  function joinArsip(a) {
    var k = byId(DB.kategori, a.kategori_id) || {};
    var i = byId(DB.instansi, a.instansi_id) || {};
    var u = byId(DB.unit, a.unit_id) || {};
    var l = byId(DB.lokasi, a.lokasi_id) || {};
    var c = byId(DB.users, a.created_by) || {};
    var o = clone(a);
    o.kategori_kode = k.kode || '';
    o.kategori_nama = k.nama || '';
    o.creator_nama = c.nama || '';
    o.instansi_nama = i.nama || '';
    o.instansi_singkatan = i.singkatan || '';
    o.unit_nama = u.nama || '';
    o.unit_kode = u.kode || '';
    o.lokasi_nama = l.nama || '';
    o.lokasi_kode = l.kode || '';
    return o;
  }
  function joinDisposisi(d) {
    var dari = byId(DB.users, d.dari_user) || {};
    var kep = byId(DB.users, d.kepada_user) || {};
    var o = clone(d);
    o.dari_nama = dari.nama || '';
    o.kepada_nama = kep.nama || '';
    return o;
  }
  function joinPeminjaman(p) {
    var a = byId(DB.arsip, p.arsip_id) || {};
    var k = byId(DB.kategori, a.kategori_id) || {};
    var o = clone(p);
    o.nomor_arsip = a.nomor_arsip || '';
    o.judul = a.judul || '';
    o.tanggal_arsip = a.tanggal_arsip || '';
    o.kategori_nama = k.nama || '';
    o.kategori_kode = k.kode || '';
    return o;
  }

  function generateNomorArsip(kode) {
    var year = new Date().getFullYear();
    var prefix = kode + '/' + year + '/';
    var count = 0;
    for (var i = 0; i < DB.arsip.length; i++) if (String(DB.arsip[i].nomor_arsip).indexOf(prefix) === 0) count++;
    return prefix + String(count + 1).padStart(4, '0');
  }
  function makeKodeQr(nomor) { return nomor + '|a&s|' + uid(); }

  /* ===================== QR (client-side) ===================== */
  async function makeQrDataUrl(text) {
    try {
      if (typeof window.qrcode === 'function') {
        var q = window.qrcode(0, 'M');
        q.addData(text); q.make();
        return q.createDataURL(4, 0);
      }
    } catch (e) { /* fallback di bawah */ }
    // Fallback: gambar SVG sederhana berisi teks (bukan QR asli, tetap informatif)
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="250">' +
      '<rect width="220" height="250" fill="#fff"/>' +
      '<rect x="6" y="6" width="208" height="238" fill="none" stroke="#0b3b2e" stroke-width="3"/>' +
      '<text x="110" y="120" text-anchor="middle" font-family="monospace" font-size="13" fill="#0b3b2e">' +
      text.replace(/[<>&]/g, '') + '</text>' +
      '<text x="110" y="150" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#666">QR tidak tersedia (offline)</text></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /* ===================== AUTH HELPERS ===================== */
  function currentUser() {
    var id = sessionGet();
    if (!id) return null;
    return byId(DB.users, id);
  }
  function authError(msg, status) { var e = new Error(msg); e.status = status; return e; }
  function requireAuth() { if (!currentUser()) throw authError('Sesi berakhir, silakan masuk kembali', 401); }
  function requireRole() {
    var roles = Array.prototype.slice.call(arguments);
    var u = currentUser();
    if (!u) throw authError('Sesi berakhir, silakan masuk kembali', 401);
    if (roles.indexOf(u.role) === -1) throw authError('Akses ditolak', 403);
  }

  /* ===================== ROUTER ===================== */
  async function mockApi(url, options) {
    options = options || {};
    await ensureReady();
    var method = (options.method || 'GET').toUpperCase();
    var u = new URL(url, location.origin);
    var path = u.pathname.replace(/\/+$/, '') || '/';
    var query = {};
    u.searchParams.forEach(function (v, k) { query[k] = v; });
    var body = options.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    // ---- AUTH ----
    if (path === '/api/login' && method === 'POST') {
      var user = null;
      for (var i = 0; i < DB.users.length; i++) if (DB.users[i].username === String(body.username || '').trim()) user = DB.users[i];
      if (!user || !user.aktif) throw new Error('Username/password salah atau akun nonaktif');
      if (!(await checkPassword(String(body.password || ''), user.password_hash))) throw new Error('Username/password salah');
      user.last_login = nowIso();
      sessionSet(user.id);
      buatNotifikasi(user.id, 'Login berhasil', 'Selamat datang kembali, ' + user.nama, 'info', null, null);
      save();
      return { user: { id: user.id, username: user.username, nama: user.nama, role: user.role } };
    }
    if (path === '/api/logout' && method === 'POST') { sessionClear(); return { ok: true }; }
    if (path === '/api/me' && method === 'GET') {
      requireAuth();
      var me = currentUser();
      return { user: { id: me.id, username: me.username, nama: me.nama, role: me.role, aktif: me.aktif, last_login: me.last_login, created_at: me.created_at } };
    }
    if (path === '/api/ganti-password' && method === 'POST') {
      requireAuth();
      var cur = currentUser();
      if (!(await checkPassword(String(body.passwordLama || ''), cur.password_hash))) throw new Error('Password lama salah');
      if (!body.passwordBaru || String(body.passwordBaru).length < 6) throw new Error('Password baru minimal 6 karakter');
      cur.password_hash = await hashPassword(String(body.passwordBaru));
      logAktivitas(cur.id, 'PASSWORD', 'users', cur.id, 'Ganti password sendiri');
      save();
      return { ok: true };
    }

    // ---- NOTIFIKASI ----
    if (path === '/api/notifikasi' && method === 'GET') {
      requireAuth();
      var uid0 = currentUser().id;
      var list = DB.notifikasi.filter(function (n) { return n.user_id === uid0; })
        .sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; }).slice(0, 50);
      var unread = DB.notifikasi.filter(function (n) { return n.user_id === uid0 && !n.is_read; }).length;
      return { list: list, unread: unread };
    }
    if (path === '/api/notifikasi/read' && method === 'POST') {
      requireAuth();
      var uid1 = currentUser().id;
      if (body.all) DB.notifikasi.forEach(function (n) { if (n.user_id === uid1) n.is_read = 1; });
      else if (body.id) { var n1 = byId(DB.notifikasi, body.id); if (n1) n1.is_read = 1; }
      save();
      return { ok: true };
    }

    // ---- USERS ----
    if (path === '/api/users' && method === 'GET') { requireRole('admin'); return DB.users.slice().sort(function (a, b) { return b.created_at < a.created_at ? -1 : 1; }); }
    if (path === '/api/users' && method === 'POST') {
      requireRole('admin');
      var un = String(body.username || '').trim();
      if (!un || !body.nama || !body.password || String(body.password).length < 6) throw new Error('Data tidak lengkap / password min 6');
      if (DB.users.some(function (x) { return x.username === un; })) throw new Error('Username sudah dipakai');
      var nu = { id: nextId(DB.users), username: un, password_hash: await hashPassword(String(body.password)), nama: body.nama, role: body.role || 'staff', aktif: 1, last_login: null, created_at: nowIso() };
      DB.users.push(nu);
      logAktivitas(currentUser().id, 'USER_CREATE', 'users', nu.id, 'User: ' + un);
      save();
      return { id: nu.id };
    }
    var mUser = path.match(/^\/api\/users\/(\d+)$/);
    if (mUser && method === 'PUT') {
      requireRole('admin');
      var eu = byId(DB.users, mUser[1]); if (!eu) throw new Error('Tidak ditemukan');
      eu.nama = body.nama; eu.role = body.role; eu.aktif = body.aktif ? 1 : 0;
      logAktivitas(currentUser().id, 'USER_UPDATE', 'users', eu.id, 'User id ' + eu.id);
      save(); return { ok: true };
    }
    var mReset = path.match(/^\/api\/users\/(\d+)\/reset-password$/);
    if (mReset && method === 'POST') {
      requireRole('admin');
      if (!body.password || String(body.password).length < 6) throw new Error('Password minimal 6 karakter');
      var ru = byId(DB.users, mReset[1]); if (!ru) throw new Error('Tidak ditemukan');
      ru.password_hash = await hashPassword(String(body.password));
      logAktivitas(currentUser().id, 'USER_RESET', 'users', ru.id, 'Reset password');
      save(); return { ok: true };
    }

    // ---- MASTER: KATEGORI / LOKASI / UNIT / INSTANSI ----
    var mKat = path.match(/^\/api\/kategori\/(\d+)$/);
    if (path === '/api/kategori' && method === 'GET') { requireAuth(); return DB.kategori.slice().sort(function (a, b) { return a.kode < b.kode ? -1 : 1; }); }
    if (path === '/api/kategori' && method === 'POST') {
      requireAuth();
      var kd = String(body.kode || '').toUpperCase();
      if (DB.kategori.some(function (x) { return x.kode === kd; })) throw new Error('Kode kategori sudah ada');
      var nk = { id: nextId(DB.kategori), kode: kd, nama: body.nama, deskripsi: body.deskripsi || null, created_at: nowIso() };
      DB.kategori.push(nk);
      logAktivitas(currentUser().id, 'CREATE', 'kategori_arsip', nk.id, 'Kategori: ' + body.nama);
      save(); return { id: nk.id };
    }
    if (mKat && method === 'PUT') { requireRole('admin'); var ek = byId(DB.kategori, mKat[1]); if (ek) { ek.nama = body.nama; ek.deskripsi = body.deskripsi; } save(); return { ok: true }; }
    if (mKat && method === 'DELETE') { requireRole('admin'); DB.kategori = DB.kategori.filter(function (x) { return x.id !== +mKat[1]; }); save(); return { ok: true }; }

    var mLok = path.match(/^\/api\/lokasi\/(\d+)$/);
    if (path === '/api/lokasi' && method === 'GET') { requireAuth(); return DB.lokasi.slice().sort(function (a, b) { return a.kode < b.kode ? -1 : 1; }); }
    if (path === '/api/lokasi' && method === 'POST') {
      requireAuth();
      var lk = String(body.kode || '').toUpperCase();
      if (DB.lokasi.some(function (x) { return x.kode === lk; })) throw new Error('Kode lokasi sudah ada');
      var nl = { id: nextId(DB.lokasi), kode: lk, nama: body.nama, keterangan: body.keterangan || null, aktif: 1, created_at: nowIso() };
      DB.lokasi.push(nl); save(); return { id: nl.id };
    }
    if (mLok && method === 'PUT') { requireRole('admin'); var el = byId(DB.lokasi, mLok[1]); if (el) { el.kode = body.kode; el.nama = body.nama; el.keterangan = body.keterangan; el.aktif = body.aktif ? 1 : 0; } save(); return { ok: true }; }
    if (mLok && method === 'DELETE') { requireRole('admin'); DB.lokasi = DB.lokasi.filter(function (x) { return x.id !== +mLok[1]; }); save(); return { ok: true }; }

    var mUni = path.match(/^\/api\/unit\/(\d+)$/);
    if (path === '/api/unit' && method === 'GET') { requireAuth(); return DB.unit.slice().sort(function (a, b) { return a.kode < b.kode ? -1 : 1; }); }
    if (path === '/api/unit' && method === 'POST') {
      requireAuth();
      var uk = String(body.kode || '').toUpperCase();
      if (DB.unit.some(function (x) { return x.kode === uk; })) throw new Error('Kode unit sudah ada');
      var nu2 = { id: nextId(DB.unit), kode: uk, nama: body.nama, aktif: 1, created_at: nowIso() };
      DB.unit.push(nu2); save(); return { id: nu2.id };
    }
    if (mUni && method === 'PUT') { requireRole('admin'); var eu2 = byId(DB.unit, mUni[1]); if (eu2) { eu2.kode = body.kode; eu2.nama = body.nama; eu2.aktif = body.aktif ? 1 : 0; } save(); return { ok: true }; }
    if (mUni && method === 'DELETE') { requireRole('admin'); DB.unit = DB.unit.filter(function (x) { return x.id !== +mUni[1]; }); save(); return { ok: true }; }

    var mIns = path.match(/^\/api\/instansi\/(\d+)$/);
    if (path === '/api/instansi' && method === 'GET') { requireAuth(); return DB.instansi.slice().sort(function (a, b) { return a.nama < b.nama ? -1 : 1; }); }
    if (path === '/api/instansi' && method === 'POST') {
      requireAuth();
      if (DB.instansi.some(function (x) { return x.nama === body.nama; })) throw new Error('Nama instansi sudah ada');
      var ni = { id: nextId(DB.instansi), nama: body.nama, singkatan: body.singkatan || null, alamat: body.alamat || null, aktif: 1, created_at: nowIso() };
      DB.instansi.push(ni); save(); return { id: ni.id };
    }
    if (mIns && method === 'PUT') { requireRole('admin'); var ei = byId(DB.instansi, mIns[1]); if (ei) { ei.nama = body.nama; ei.singkatan = body.singkatan; ei.alamat = body.alamat; ei.aktif = body.aktif ? 1 : 0; } save(); return { ok: true }; }
    if (mIns && method === 'DELETE') { requireRole('admin'); DB.instansi = DB.instansi.filter(function (x) { return x.id !== +mIns[1]; }); save(); return { ok: true }; }

    // ---- ARSIP ----
    var mArsipId = path.match(/^\/api\/arsip\/(\d+)$/);
    var mRestore = path.match(/^\/api\/arsip\/(\d+)\/restore$/);
    var mPermanen = path.match(/^\/api\/arsip\/(\d+)\/permanen$/);
    var mQr = path.match(/^\/api\/arsip\/(\d+)\/qr$/);
    var mLamp = path.match(/^\/api\/arsip\/(\d+)\/lampiran$/);

    if (path === '/api/arsip/stats' && method === 'GET') { requireAuth(); return { stats: arsipStats(), byKategori: statsByKategori(), byBulan: statsByBulan(), byStatus: statsByStatus() }; }
    if (path === '/api/trash' && method === 'GET') { requireRole('admin', 'staff'); return DB.arsip.filter(function (a) { return a.deleted_at; }).sort(function (a, b) { return a.deleted_at < b.deleted_at ? 1 : -1; }).map(joinArsip); }
    if (path === '/api/arsip' && method === 'GET') {
      requireAuth();
      var s = String(query.search || '').toLowerCase();
      var rows = DB.arsip.filter(function (a) {
        if (a.deleted_at) return false;
        if (s) {
          var hay = [a.nomor_arsip, a.judul, a.nomor_surat, a.perihal, a.ringkasan].join(' ').toLowerCase();
          if (hay.indexOf(s) === -1) return false;
        }
        if (query.kategori && String(a.kategori_id) !== String(query.kategori)) return false;
        if (query.status && a.status !== query.status) return false;
        if (query.dari && a.tanggal_arsip < query.dari) return false;
        if (query.sampai && a.tanggal_arsip > query.sampai) return false;
        if (query.lokasi && String(a.lokasi_id) !== String(query.lokasi)) return false;
        if (query.instansi && String(a.instansi_id) !== String(query.instansi)) return false;
        return true;
      }).sort(function (a, b) {
        if (a.tanggal_arsip !== b.tanggal_arsip) return a.tanggal_arsip < b.tanggal_arsip ? 1 : -1;
        return a.created_at < b.created_at ? 1 : -1;
      });
      var total = rows.length;
      var limit = parseInt(query.limit) || 20;
      var page = parseInt(query.page) || 1;
      var start = (page - 1) * limit;
      return { data: rows.slice(start, start + limit).map(joinArsip), total: total, page: page, limit: limit, totalPages: Math.ceil(total / limit) };
    }
    if (path === '/api/arsip' && method === 'POST') {
      requireAuth();
      var kat = byId(DB.kategori, body.kategori_id);
      if (!kat) throw new Error('Kategori tidak valid');
      var nomor = generateNomorArsip(kat.kode);
      var a = {
        id: nextId(DB.arsip), nomor_arsip: nomor, kategori_id: kat.id, judul: body.judul,
        nomor_surat: body.nomor_surat || null, tanggal_surat: body.tanggal_surat || null, tanggal_arsip: body.tanggal_arsip,
        pengirim: body.pengirim || null, instansi_id: body.instansi_id || null, penerima: body.penerima || null,
        unit_id: body.unit_id || null, perihal: body.perihal || null, ringkasan: body.ringkasan || null,
        status: body.status || 'aktif', lokasi_fisik: body.lokasi_fisik || null, lokasi_id: body.lokasi_id || null,
        kode_qr: makeKodeQr(nomor), created_by: currentUser().id, updated_by: null, deleted_at: null,
        created_at: nowIso(), updated_at: nowIso()
      };
      DB.arsip.push(a);
      logAktivitas(currentUser().id, 'CREATE', 'arsip', a.id, 'Arsip: ' + nomor + ' - ' + body.judul);
      save();
      return { id: a.id, nomor_arsip: nomor, kode_qr: a.kode_qr };
    }
    if (mRestore && method === 'POST') { requireAuth(); var ra = byId(DB.arsip, mRestore[1]); if (ra) { ra.deleted_at = null; ra.updated_by = currentUser().id; } save(); return { ok: true }; }
    if (mPermanen && method === 'DELETE') {
      requireRole('admin');
      DB.lampiran = DB.lampiran.filter(function (l) { return String(l.arsip_id) !== mPermanen[1]; });
      DB.disposisi = DB.disposisi.filter(function (d) { return String(d.arsip_id) !== mPermanen[1]; });
      DB.peminjaman = DB.peminjaman.filter(function (p) { return String(p.arsip_id) !== mPermanen[1]; });
      DB.arsip = DB.arsip.filter(function (x) { return x.id !== +mPermanen[1]; });
      save(); return { ok: true };
    }
    if (mQr && method === 'GET') {
      requireAuth();
      var qa = byId(DB.arsip, mQr[1]); if (!qa) throw new Error('Tidak ditemukan');
      return { dataUrl: await makeQrDataUrl(qa.kode_qr || qa.nomor_arsip), nomor_arsip: qa.nomor_arsip };
    }
    if (mArsipId && method === 'GET') {
      requireAuth();
      var da = byId(DB.arsip, mArsipId[1]); if (!da) throw new Error('Arsip tidak ditemukan');
      var out = joinArsip(da);
      out.lampiran = DB.lampiran.filter(function (l) { return String(l.arsip_id) === mArsipId[1]; })
        .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      out.disposisi = DB.disposisi.filter(function (d) { return String(d.arsip_id) === mArsipId[1]; })
        .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).map(joinDisposisi);
      out.peminjaman = DB.peminjaman.filter(function (p) { return String(p.arsip_id) === mArsipId[1]; })
        .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).map(joinPeminjaman);
      return out;
    }
    if (mArsipId && method === 'PUT') {
      requireAuth();
      var ua = byId(DB.arsip, mArsipId[1]); if (!ua) throw new Error('Tidak ditemukan');
      ['kategori_id', 'judul', 'nomor_surat', 'tanggal_surat', 'tanggal_arsip', 'pengirim', 'instansi_id',
        'penerima', 'unit_id', 'perihal', 'ringkasan', 'status', 'lokasi_fisik', 'lokasi_id'].forEach(function (k) {
          if (k in body) ua[k] = body[k] === '' ? null : body[k];
        });
      ua.updated_by = currentUser().id; ua.updated_at = nowIso();
      logAktivitas(currentUser().id, 'UPDATE', 'arsip', ua.id, 'Arsip: ' + ua.judul);
      save(); return { ok: true };
    }
    if (mArsipId && method === 'DELETE') {
      requireRole('admin', 'staff');
      var sa = byId(DB.arsip, mArsipId[1]); if (sa) { sa.deleted_at = nowIso(); sa.updated_by = currentUser().id; }
      logAktivitas(currentUser().id, 'DELETE', 'arsip', mArsipId[1], 'Arsip ke tempat sampah: ' + (sa ? sa.nomor_arsip : ''));
      save(); return { ok: true };
    }

    // ---- DISPOSISI ----
    var mDisp = path.match(/^\/api\/disposisi\/(\d+)$/);
    if (path === '/api/disposisi' && method === 'POST') {
      requireAuth();
      var d0 = {
        id: nextId(DB.disposisi), arsip_id: body.arsip_id, dari_user: currentUser().id, kepada_user: body.kepada_user || null,
        instruksi: body.instruksi || null, status: body.status || 'proses', tanggal_disposisi: body.tanggal || today(),
        catatan: body.catatan || null, created_by: currentUser().id, created_at: nowIso(), updated_at: nowIso()
      };
      DB.disposisi.push(d0);
      if (d0.kepada_user) {
        var target = byId(DB.users, d0.kepada_user); var ar = byId(DB.arsip, d0.arsip_id);
        buatNotifikasi(d0.kepada_user, 'Disposisi baru', 'Anda menerima disposisi arsip ' + (ar ? ar.nomor_arsip : ''), 'disposisi', 'arsip', d0.arsip_id);
      }
      logAktivitas(currentUser().id, 'DISPOSISI', 'arsip', d0.arsip_id, 'Disposisi arsip: ' + d0.instruksi);
      save(); return { id: d0.id };
    }
    if (mDisp && method === 'PUT') { requireAuth(); var ud = byId(DB.disposisi, mDisp[1]); if (ud) { ud.status = body.status; ud.catatan = body.catatan || null; ud.updated_at = nowIso(); } save(); return { ok: true }; }
    if (mDisp && method === 'DELETE') { requireRole('admin'); DB.disposisi = DB.disposisi.filter(function (x) { return x.id !== +mDisp[1]; }); save(); return { ok: true }; }

    // ---- PEMINJAMAN ----
    var mPin = path.match(/^\/api\/peminjaman\/(\d+)$/);
    if (path === '/api/peminjaman' && method === 'GET') {
      requireAuth();
      markOverdue();
      return DB.peminjaman.filter(function (p) { var a = byId(DB.arsip, p.arsip_id); return a && !a.deleted_at; })
        .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).map(joinPeminjaman);
    }
    if (path === '/api/peminjaman' && method === 'POST') {
      requireAuth();
      var p0 = {
        id: nextId(DB.peminjaman), arsip_id: body.arsip_id, peminjam: body.peminjam, unit_peminjam: body.unit_peminjam || null,
        alasan: body.alasan || null, tanggal_pinjam: body.tanggal_pinjam, tanggal_jatuh_tempo: body.tanggal_jatuh_tempo,
        tanggal_kembali: body.tanggal_kembali || null, status: 'dipinjam', catatan: body.catatan || null,
        created_by: currentUser().id, created_at: nowIso(), updated_at: nowIso()
      };
      DB.peminjaman.push(p0);
      var pa = byId(DB.arsip, body.arsip_id); if (pa) { pa.status = 'dipinjam'; pa.updated_at = nowIso(); }
      logAktivitas(currentUser().id, 'PINJAM', 'arsip', body.arsip_id, 'Peminjaman: ' + body.peminjam + ' (' + (pa ? pa.nomor_arsip : '') + ')');
      save(); return { id: p0.id };
    }
    if (mPin && method === 'PUT') {
      requireAuth();
      var up = byId(DB.peminjaman, mPin[1]); if (!up) throw new Error('Tidak ditemukan');
      up.status = body.status;
      up.tanggal_kembali = body.tanggal_kembali || (body.status === 'dikembalikan' ? today() : null);
      up.catatan = body.catatan || null; up.updated_at = nowIso();
      if (body.status === 'dikembalikan') { var upa = byId(DB.arsip, up.arsip_id); if (upa) { upa.status = 'aktif'; upa.updated_at = nowIso(); } }
      save(); return { ok: true };
    }
    if (mPin && method === 'DELETE') { requireRole('admin'); DB.peminjaman = DB.peminjaman.filter(function (x) { return x.id !== +mPin[1]; }); save(); return { ok: true }; }

    // ---- LAMPIRAN ----
    if (mLamp && method === 'POST') { requireAuth(); throw new Error('Gunakan window.__mockUploadLampiran'); }
    var mLampId = path.match(/^\/api\/lampiran\/(\d+)$/);
    if (mLampId && method === 'DELETE') {
      requireAuth();
      var dl = byId(DB.lampiran, mLampId[1]);
      if (dl) { DB.lampiran = DB.lampiran.filter(function (x) { return x.id !== +mLampId[1]; }); fileDel(dl.nama_file); }
      save(); return { ok: true };
    }

    // ---- LOG ----
    if (path === '/api/log' && method === 'GET') {
      requireRole('admin');
      var lim = parseInt(query.limit) || 50, pg = parseInt(query.page) || 1;
      var logs = DB.log.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })
        .slice((pg - 1) * lim, pg * lim).map(function (l) {
          var uu = byId(DB.users, l.user_id) || {}; var o = clone(l); o.user_nama = uu.nama || ''; return o;
        });
      return { data: logs };
    }

    // ---- LAPORAN ----
    if (path === '/api/laporan' && method === 'GET') {
      requireAuth();
      var dari = query.dari || '', sampai = query.sampai || '', katq = query.kategori || '';
      var rrows = DB.arsip.filter(function (a) {
        if (a.deleted_at) return false;
        if (dari && a.tanggal_arsip < dari) return false;
        if (sampai && a.tanggal_arsip > sampai) return false;
        if (katq && String(a.kategori_id) !== String(katq)) return false;
        return true;
      }).sort(function (a, b) { return a.tanggal_arsip < b.tanggal_arsip ? 1 : -1; }).map(function (a) {
        var k = byId(DB.kategori, a.kategori_id) || {}; var i = byId(DB.instansi, a.instansi_id) || {};
        return { nomor_arsip: a.nomor_arsip, tanggal_arsip: a.tanggal_arsip, nomor_surat: a.nomor_surat, judul: a.judul, perihal: a.perihal, status: a.status, kategori_kode: k.kode || '', kategori_nama: k.nama || '', pengirim: a.pengirim || '', penerima: a.penerima || '', instansi_nama: i.nama || '' };
      });
      var totalAll = DB.arsip.filter(function (a) { return !a.deleted_at; }).length;
      return { rows: rrows, total: totalAll, filter: { dari: dari, sampai: sampai, kategori: katq } };
    }

    // ---- DASHBOARD ----
    if (path === '/api/dashboard' && method === 'GET') {
      requireAuth();
      markOverdue();
      var ym = today().slice(0, 7);
      return {
        stats: arsipStats(), byKategori: statsByKategori(), byBulan: statsByBulan(), byStatus: statsByStatus(),
        kegiatanHariIni: DB.agenda.filter(function (a) { return a.tanggal === today(); }),
        pinjamanAktif: DB.peminjaman.filter(function (p) { var a = byId(DB.arsip, p.arsip_id); return (p.status === 'dipinjam' || p.status === 'terlambat') && a && !a.deleted_at; }).sort(function (a, b) { return a.tanggal_jatuh_tempo < b.tanggal_jatuh_tempo ? -1 : 1; }).map(joinPeminjaman),
        disposisiTerbaru: DB.disposisi.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 6).map(function (d) { var o = joinDisposisi(d); var a = byId(DB.arsip, d.arsip_id) || {}; o.nomor_arsip = a.nomor_arsip || ''; o.arsip_judul = a.judul || ''; return o; }),
        arsipTerbaru: DB.arsip.filter(function (a) { return !a.deleted_at; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 6).map(joinArsip),
        aktivitas: DB.log.slice().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 8).map(function (l) { var uu = byId(DB.users, l.user_id) || {}; var o = clone(l); o.user_nama = uu.nama || ''; return o; }),
        agendaCount: DB.agenda.filter(function (a) { return (a.tanggal || '').slice(0, 7) === ym; }).length
      };
    }

    // ---- SETTINGS ----
    if (path === '/api/settings' && method === 'GET') { requireAuth(); return clone(DB.settings); }
    if (path === '/api/settings' && method === 'PUT') {
      requireRole('admin');
      Object.keys(body).forEach(function (k) { DB.settings[k] = String(body[k] == null ? '' : body[k]); });
      logAktivitas(currentUser().id, 'SETTING', 'settings', null, 'Perbarui profil kantor');
      save(); return { ok: true };
    }

    // ---- BUKU AGENDA ----
    var mBg = path.match(/^\/api\/buku-agenda\/(\d+)$/);
    if (path === '/api/buku-agenda' && method === 'GET') {
      requireAuth();
      var jenis = query.jenis === 'keluar' ? 'keluar' : 'masuk';
      var tahun = query.tahun ? parseInt(query.tahun) : new Date().getFullYear();
      var rows2 = DB.bukuAgenda.filter(function (r) { return r.jenis === jenis; })
        .filter(function (r) { return !query.tahun || r.tahun === tahun; })
        .sort(function (a, b) { if (a.tahun !== b.tahun) return a.tahun < b.tahun ? 1 : -1; return a.nomor_urut < b.nomor_urut ? 1 : -1; })
        .map(function (r) { var a = byId(DB.arsip, r.arsip_id) || {}; var uu = byId(DB.users, r.created_by) || {}; var o = clone(r); o.nomor_arsip = a.nomor_arsip || null; o.petugas = uu.nama || ''; return o; });
      var jml = DB.bukuAgenda.filter(function (r) { return r.jenis === jenis && r.tahun === tahun; }).length;
      return { rows: rows2, jenis: jenis, tahun: tahun, jumlahTahunIni: jml };
    }
    if (path === '/api/buku-agenda' && method === 'POST') {
      requireAuth();
      var jn = body.jenis === 'keluar' ? 'keluar' : 'masuk';
      var th = parseInt(body.tahun) || new Date().getFullYear();
      var last = DB.bukuAgenda.filter(function (r) { return r.jenis === jn && r.tahun === th; }).reduce(function (m, r) { return Math.max(m, r.nomor_urut); }, 0);
      var no = last + 1;
      var bg = { id: nextId(DB.bukuAgenda), jenis: jn, tahun: th, nomor_urut: no, tanggal: body.tanggal, nomor_surat: body.nomor_surat || null, asal_tujuan: body.asal_tujuan || null, perihal: body.perihal || null, keterangan: body.keterangan || null, arsip_id: body.arsip_id || null, created_by: currentUser().id, created_at: nowIso(), updated_at: nowIso() };
      DB.bukuAgenda.push(bg);
      logAktivitas(currentUser().id, 'AGENDA', 'buku_agenda', bg.id, 'Agenda ' + jn + ' no ' + no + '/' + th + ': ' + body.perihal);
      save(); return { id: bg.id, nomor_urut: no };
    }
    if (mBg && method === 'PUT') { requireAuth(); var ubg = byId(DB.bukuAgenda, mBg[1]); if (ubg) { ubg.tanggal = body.tanggal; ubg.nomor_surat = body.nomor_surat || null; ubg.asal_tujuan = body.asal_tujuan || null; ubg.perihal = body.perihal || null; ubg.keterangan = body.keterangan || null; ubg.arsip_id = body.arsip_id || null; ubg.updated_at = nowIso(); } save(); return { ok: true }; }
    if (mBg && method === 'DELETE') { requireRole('admin', 'staff'); DB.bukuAgenda = DB.bukuAgenda.filter(function (x) { return x.id !== +mBg[1]; }); save(); return { ok: true }; }

    // ---- AGENDA KEGIATAN ----
    var mAg = path.match(/^\/api\/agenda\/(\d+)$/);
    if (path === '/api/agenda' && method === 'GET') {
      requireAuth();
      var bulan = query.bulan || today().slice(0, 7);
      var arows = DB.agenda.filter(function (a) { return (a.tanggal || '').slice(0, 7) === bulan; })
        .sort(function (a, b) { if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1; return (a.jam_mulai || '') < (b.jam_mulai || '') ? -1 : 1; });
      return { rows: arows, bulan: bulan };
    }
    if (path === '/api/agenda' && method === 'POST') {
      requireAuth();
      var ag = { id: nextId(DB.agenda), judul: body.judul, tanggal: body.tanggal, jam_mulai: body.jam_mulai || null, jam_selesai: body.jam_selesai || null, lokasi: body.lokasi || null, tipe: body.tipe || 'kegiatan', keterangan: body.keterangan || null, created_by: currentUser().id, created_at: nowIso() };
      DB.agenda.push(ag);
      logAktivitas(currentUser().id, 'AGENDA', 'agenda_kegiatan', ag.id, 'Agenda: ' + body.judul);
      save(); return { id: ag.id };
    }
    if (mAg && method === 'PUT') { requireAuth(); var uag = byId(DB.agenda, mAg[1]); if (uag) { uag.judul = body.judul; uag.tanggal = body.tanggal; uag.jam_mulai = body.jam_mulai || null; uag.jam_selesai = body.jam_selesai || null; uag.lokasi = body.lokasi || null; uag.tipe = body.tipe || 'kegiatan'; uag.keterangan = body.keterangan || null; } save(); return { ok: true }; }
    if (mAg && method === 'DELETE') { requireRole('admin', 'staff'); DB.agenda = DB.agenda.filter(function (x) { return x.id !== +mAg[1]; }); save(); return { ok: true }; }

    throw new Error('Endpoint tidak dikenal: ' + method + ' ' + path);
  }

  /* ===================== STATISTIK ===================== */
  function arsipStats() {
    var aktif = 0, diarsipkan = 0, dipinjam = 0, hilang = 0, rusak = 0, sampah = 0;
    DB.arsip.forEach(function (a) {
      if (a.deleted_at) { sampah++; return; }
      if (a.status === 'aktif') aktif++; else if (a.status === 'arsip') diarsipkan++;
      else if (a.status === 'dipinjam') dipinjam++; else if (a.status === 'hilang') hilang++; else if (a.status === 'rusak') rusak++;
    });
    return { total: DB.arsip.length, aktif: aktif, diarsipkan: diarsipkan, dipinjam: dipinjam, hilang: hilang, rusak: rusak, sampah: sampah };
  }
  function statsByKategori() {
    return DB.kategori.map(function (k) {
      return { kode: k.kode, nama: k.nama, jumlah: DB.arsip.filter(function (a) { return a.kategori_id === k.id && !a.deleted_at; }).length };
    }).sort(function (a, b) { return b.jumlah - a.jumlah; });
  }
  function statsByBulan() {
    var map = {};
    DB.arsip.forEach(function (a) {
      if (a.deleted_at || !a.tanggal_arsip) return;
      var b = a.tanggal_arsip.slice(0, 7); map[b] = (map[b] || 0) + 1;
    });
    return Object.keys(map).sort().map(function (b) { return { bulan: b, jumlah: map[b] }; });
  }
  function statsByStatus() {
    var map = {};
    DB.arsip.forEach(function (a) { if (a.deleted_at) return; map[a.status] = (map[a.status] || 0) + 1; });
    return Object.keys(map).map(function (s) { return { status: s, jumlah: map[s] }; });
  }
  function markOverdue() {
    var t = today();
    DB.peminjaman.forEach(function (p) {
      if (!p.tanggal_kembali && p.tanggal_jatuh_tempo < t && p.status === 'dipinjam') { p.status = 'terlambat'; p.updated_at = nowIso(); }
    });
    save();
  }

  /* ===================== FILE STORE (IndexedDB) ===================== */
  var _idb = null;
  function idb() {
    return new Promise(function (resolve, reject) {
      if (_idb) return resolve(_idb);
      var req = indexedDB.open('bpnarsip-files', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('files'); };
      req.onsuccess = function () { _idb = req.result; resolve(_idb); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function filePut(key, blob) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(blob, key);
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function fileGet(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('files', 'readonly');
        var rq = tx.objectStore('files').get(key);
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { reject(rq.error); };
      });
    });
  }
  function fileDel(key) {
    return idb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(key);
        tx.oncomplete = resolve;
      });
    });
  }

  /* ===================== DOWNLOAD HELPERS ===================== */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 800);
  }
  function downloadText(text, filename, mime) {
    downloadBlob(new Blob([text], { type: mime || 'application/octet-stream' }), filename);
  }

  /* ===================== EKSPOR ===================== */
  function filteredRows(dari, sampai, kategori) {
    return DB.arsip.filter(function (a) {
      if (a.deleted_at) return false;
      if (dari && a.tanggal_arsip < dari) return false;
      if (sampai && a.tanggal_arsip > sampai) return false;
      if (kategori && String(a.kategori_id) !== String(kategori)) return false;
      return true;
    }).sort(function (a, b) { return a.tanggal_arsip < b.tanggal_arsip ? 1 : -1; });
  }
  function laporanRows() {
    return filteredRows().map(function (a) {
      var k = byId(DB.kategori, a.kategori_id) || {}; var i = byId(DB.instansi, a.instansi_id) || {};
      return { nomor_arsip: a.nomor_arsip, tanggal_arsip: a.tanggal_arsip, kategori: k.nama || '', nomor_surat: a.nomor_surat || '', judul: a.judul, perihal: a.perihal || '', pengirim: a.pengirim || '', penerima: a.penerima || '', instansi: i.nama || '', status: a.status };
    });
  }
  function csvEscape(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  var COLMAP = { 'Nomor Arsip': 'nomor_arsip', 'Tanggal': 'tanggal_arsip', 'Kategori': 'kategori', 'No Surat': 'nomor_surat', 'Judul': 'judul', 'Perihal': 'perihal', 'Pengirim': 'pengirim', 'Penerima': 'penerima', 'Instansi': 'instansi', 'Status': 'status' };
  function buildCsv() {
    var rows = laporanRows();
    var header = ['Nomor Arsip', 'Tanggal', 'Kategori', 'No Surat', 'Judul', 'Perihal', 'Pengirim', 'Penerima', 'Instansi', 'Status'];
    var out = [header.map(csvEscape).join(',')];
    rows.forEach(function (r) { out.push(header.map(function (h) { return csvEscape(r[COLMAP[h]]); }).join(',')); });
    return '\uFEFF' + out.join('\r\n');
  }

  /* ===================== PUBLIC (dipakai app.js) ===================== */
  window.__mockApi = mockApi;

  window.__mockUploadLampiran = async function (arsipId, files) {
    await ensureReady();
    requireAuth();
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var id = nextId(DB.lampiran);
      var buf = await f.arrayBuffer();
      await filePut(String(id), new Blob([buf], { type: f.type || 'application/octet-stream' }));
      var rec = { id: id, arsip_id: arsipId, nama_file: String(id), nama_original: f.name, mime_type: f.type || null, ukuran: f.size, path: '', created_at: nowIso() };
      DB.lampiran.push(rec);
      out.push({ id: id, nama_original: f.name });
    }
    save();
    return { files: out };
  };

  window.__mockDownloadLampiran = async function (id) {
    var l = byId(DB.lampiran, id);
    if (!l) { alert('Lampiran tidak ditemukan'); return; }
    var blob = await fileGet(l.nama_file);
    if (!blob) { alert('Berkas lampiran tidak ditemukan di penyimpanan'); return; }
    downloadBlob(blob, l.nama_original || ('lampiran-' + id));
  };

  window.__mockExportCsv = function (dari, sampai, kategori) {
    filteredRows(dari, sampai, kategori); // ensure DB
    downloadText(buildCsv(), 'rekap-arsip-' + Date.now() + '.csv', 'text/csv; charset=utf-8');
  };

  window.__mockExportXlsx = async function (dari, sampai, kategori) {
    await ensureReady();
    var rows = laporanRows();
    var header = ['Nomor Arsip', 'Tanggal', 'Kategori', 'No Surat', 'Judul', 'Perihal', 'Pengirim', 'Penerima', 'Instansi', 'Status'];
    if (typeof window.XLSX === 'undefined') {
      // Fallback ke CSV bila SheetJS tidak termuat
      window.__mockExportCsv(dari, sampai, kategori);
      return;
    }
    var data = [header].concat(rows.map(function (r) { return header.map(function (h) { return r[COLMAP[h]]; }); }));
    var ws = window.XLSX.utils.aoa_to_sheet(data);
    var wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Rekap Arsip');
    var out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'rekap-arsip-' + Date.now() + '.xlsx');
  };

  window.__mockBackup = async function () {
    await ensureReady();
    requireRole('admin');
    var tables = ['settings', 'users', 'kategori', 'unit', 'instansi', 'lokasi', 'arsip', 'lampiran', 'disposisi', 'peminjaman', 'bukuAgenda', 'agenda', 'log', 'notifikasi'];
    var data = {};
    tables.forEach(function (t) { data[t] = DB[t]; });
    var out = { aplikasi: 'Sistem Arsip Kantor Pertanahan', diekspor: new Date().toISOString(), data: data };
    downloadText(JSON.stringify(out, null, 1), 'backup-arsip-' + Date.now() + '.json', 'application/json');
  };

  /* ===================== IMPORT CSV ===================== */
  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var rows = [], row = [], field = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
      else if (c === '"') quoted = true;
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === ',' || c === ';') { row.push(field); field = ''; }
      else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  window.__mockImport = async function (file) {
    await ensureReady();
    requireAuth();
    var text = await file.text();
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('File CSV kosong (harus ada header + minimal 1 baris data)');
    var header = rows[0].map(function (h) { return String(h).trim().toLowerCase().replace(/[^a-z]/g, ''); });
    var idx = function (n) { return header.indexOf(n); };
    if (idx('judul') === -1) throw new Error('Header tidak sesuai. Minimal kolom: kategori, judul, tanggal_arsip');
    var muat = { kategori: idx('kategori'), judul: idx('judul'), nomorsurat: idx('nomorsurat'), nomor_suratCur: idx('nomor_surat'), tanggalsurat: idx('tanggalsurat'), tanggal_arsip: idx('tanggalarsip'), pengirim: idx('pengirim'), penerima: idx('penerima'), perihal: idx('perihal'), ringkasan: idx('ringkasan'), status: idx('status'), lokasi: idx('lokasifisik') };
    var masuk = 0, gagal = 0; var eror = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var g = function (k) { return (muat[k] !== -1 && muat[k] < r.length) ? String(r[muat[k]]).trim() : ''; };
      var judul = g('judul');
      var kodeKat = g('kategori').toUpperCase();
      if (!judul) { gagal++; eror.push('Baris ' + (i + 1) + ': judul kosong'); continue; }
      var kat = null;
      for (var j = 0; j < DB.kategori.length; j++) if (DB.kategori[j].kode === kodeKat || DB.kategori[j].kode === kodeKat.replace(/[^A-Z]/g, '')) kat = DB.kategori[j];
      if (!kat) { gagal++; eror.push("Baris " + (i + 1) + ": kategori '" + kodeKat + "' tidak dikenal"); continue; }
      var tanggal = g('tanggal_arsip') || today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) { gagal++; eror.push("Baris " + (i + 1) + ": tanggal_arsip '" + tanggal + "' tidak valid (YYYY-MM-DD)"); continue; }
      var nomor = generateNomorArsip(kat.kode);
      DB.arsip.push({
        id: nextId(DB.arsip), nomor_arsip: nomor, kategori_id: kat.id, judul: judul,
        nomor_surat: g('nomorsurat') || g('nomor_suratCur') || null, tanggal_surat: g('tanggalsurat') || null, tanggal_arsip: tanggal,
        pengirim: g('pengirim') || null, instansi_id: null, penerima: g('penerima') || null, unit_id: null,
        perihal: g('perihal') || null, ringkasan: g('ringkasan') || null,
        status: ['aktif', 'arsip', 'dipinjam', 'hilang', 'rusak'].indexOf(g('status')) !== -1 ? g('status') : 'aktif',
        lokasi_fisik: g('lokasi') || null, lokasi_id: null, kode_qr: makeKodeQr(nomor), created_by: currentUser().id,
        updated_by: null, deleted_at: null, created_at: nowIso(), updated_at: nowIso()
      });
      masuk++;
    }
    logAktivitas(currentUser().id, 'IMPORT', 'arsip', null, 'Import CSV: ' + masuk + ' berhasil, ' + gagal + ' gagal');
    save();
    return { masuk: masuk, gagal: gagal, eror: eror.slice(0, 20) };
  };

  /* ===================== RESET (util) ===================== */
  window.__mockReset = function () {
    localStorage.removeItem(LS_KEY); localStorage.removeItem(SESSION_KEY);
    DB = null; READY = null;
    return true;
  };
})();
