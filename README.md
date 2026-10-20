# 📁 Sistem Arsip Digital — Kantor Pertanahan (v3 Lokal)

Aplikasi pengelolaan arsip digital untuk **Kantor Pertanahan / BPN**. Berjalan **100% lokal** di satu komputer atau LAN kantor — tanpa internet, tanpa biaya lisensi, tanpa akun cloud. **Rupiah pas-pasan? Tetap bisa punya sistem arsip paling canggih — gratis total.**

## ✨ Modul

| Modul | Deskripsi |
|-------|-----------|
| 📊 **Dashboard** | Statistik arsip, penyimpanan database, arsip terbaru, tren & status arsip |
| 📦 **Arsip Dokumen** | Registrasi, upload file, nomor arsip otomatis per kategori, kategori/lokasi/unit/instansi, QR code, cari & filter, edit, hapus lunak/permanen |
| 🖨️ **Scan / OCR Dokumen** 🆕 | Baca isi setiap dokumen (foto/PDF) langsung di browser, **100% offline tanpa biaya** — hasil tersimpan & bisa dicari |
| 🔎 **Cari Isi Dokumen** 🆕 | Pencarian teks penuh (FTS) ke seluruh isi arsip — termasuk hasil OCR, kata di-highlight otomatis |
| 🗄️ **Database & Cadangan** 🆕 | Penjelajah tabel, edit/tambah/hapus baris, lihat skema & indeks, konsol SQL (SELECT / INSERT / UPDATE / DROP / CREATE), backup otomatis, restore, cek integritas, vacuum — semua untuk admin |
| 🗑️ **Tempat Sampah** | Pulihkan atau hapus permanen; kosongkan sampah |
| 🔀 **Disposisi** | Penerusan arsip ke unit/seksi, tanda baca, prioritas |
| 📤 **Peminjaman** | Catat peminjaman & pengembalian arsip |
| 📖 **Buku Agenda** | Agenda surat masuk & keluar, nomor agenda otomatis |
| 📅 **Kalender** | Kalender aktivitas arsip |
| 📈 **Laporan & Ekspor** | Rekap arsip, cetak ber-kop surat, ekspor CSV / Excel (XLSX), backup database (JSON) |
| 🗂️ **Master Data** | Kategori, lokasi rak, unit/seksi, instansi |
| 👥 **Manajemen Pengguna** | Multi-akun admin / staf / kepala + email & telepon, aktif/nonaktif, reset password, mata-mata online |
| 🛡️ **Log Aktivitas** | Rekam jejak aktivitas pengguna |
| 👤 **Profil Kantor** | Kop surat untuk cetak laporan |

## 🛠️ Teknologi (Semua Gratis)

- **Backend**: Node.js + Express.js
- **Database**: SQLite bawaan Node (`node:sqlite`) + SQLite **FTS5** untuk pencarian isi dokumen — tanpa server, tanpa instalasi tambahan
- **OCR**: Tesseract.js + PDF.js **didampingi langsung** (wasm + bahasa Indonesia/Inggris) — hasil OCR diproses *di komputer Anda*, tidak ada data yang keluar
- **Frontend**: Single-Page Application vanilla JS + CSS kustom, font offline (Lora + Plus Jakarta Sans), Chart.js lokal
- **Session**: express-session + bcryptjs

## 🚀 Cara Menjalankan

### Prasyarat
- **Node.js 22.5 atau lebih baru** (mendukung `node:sqlite` & FTS5) → unduh gratis di [nodejs.org](https://nodejs.org)

### Linux / macOS / Terminal
```bash
cd arsip-bpn
npm install      # sekali saja
npm start        # buka http://localhost:3000
```

Database + akun default dibuat otomatis saat pertama kali dijalankan.

### Windows (klik dua kali)
1. Install Node.js dari [nodejs.org](https://nodejs.org)
2. **Klik dua kali `start.bat`** (menjalankan `npm install` bila perlu, lalu memulai server)
3. Buka **http://localhost:3000**

> Jalankan `npm run seed` untuk mengisi 8 arsip contoh (opsional). Hapus `data/arsip-bpn.db` untuk memulai dari nol.

### Akun Default

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `admin123` |
| Staf | `staff1` | `password123` |
| Kepala | `kepala1` | `password123` |

> ⚠️ **Ubah password setelah pemasangan** (menu profil → Ganti Password / Profil Saya).

## 🖨️ Isi Dokumen: Cara Mengaktifkan (OCR, 3 Langkah)

1. Buka menu **Arsip Dokumen** → cari arsipnya → klik tombol **folder/scan** pada baris.
2. Di jendela *Scan / OCR*: klik **"Pakai lampiran"** (untuk file PDF/gambar arsip) atau **"Upload gambar/PDF"**.
3. Tunggu dan otomatis isi dokumen terbaca (bisa diedit dulu). Klik **Simpan Hasil OCR**.

Setelah itu cari isinya lewat menu **Cari Isi Dokumen**. Pemindaian **berjalan di browser Anda** menggunakan Tesseract.js + PDF.js yang sudah disatukan dalam proyek — **tanpa internet, tanpa layanan berbayar**.

## 🗄️ Mengelola Database (Khusus Admin)

Menu **Database & Cadangan** menyediakan:

- **Penjelajah Data** — buka tabel apa pun, tambah/ubah/hapus baris. Tabel inti (arsip, users, pengaturan, log, dll.) dikunci demi keamanan.
- **Struktur** — lihat definisi `CREATE TABLE`, indeks, foreign key, dan trigger.
- **Konsol SQL** — mode *Baca (SELECT)* / *Tulis (INSERT, UPDATE, DELETE)* / *DDL (CREATE, ALTER, DROP)*. Perubahan struktur otomatis dicadangkan dulu sebelum dieksekusi; tabel inti otomatis ditolak.
- **Cadangan** — otomatis setiap 24 jam & sebelum DDL (maks. 10 disimpan), plus tombol manual, unduh salinan `.db`.
- **Pulihkan (Restore)** — unggah `*.json` (digabung otomatis) atau `*.db` / `*.sql` (disimpan untuk diterapkan saat app dimatikan).
- **Cek Integritas & Vacuum** — pastikan database sehat dan ringkas.

> Tabel sistem / core tidak bisa diubah lewat penjelajah; gunakan menu resminya. Konsol SQL hanya untuk admin dan seluruhnya dicatat.

## 🔧 Konfigurasi

| Variable | Deskripsi |
|----------|-----------|
| `PORT` | Port server (default: `3000`) |

## 📁 Struktur Project

```
arsip-bpn/
├── start.bat            # Jalankan di Windows (klik dua kali)
├── src/
│   ├── server.js        # Entry point server (booting skema → auto-backup 24 jam)
│   ├── db/              # Koneksi, skema + trigger FTS5, query, manajemen DB, seed
│   └── routes/          # API REST (auth, arsip, OCR, search, /api/db, users)
├── public/
│   ├── index.html       # SPA shell
│   ├── css/ style.css   # Tampilan
│   ├── js/ app.js, views.js, api.js, ui.js, extra.js (OCR, cari, DB manager)
│   ├── fonts/           # Font offline (Lora, Plus Jakarta Sans)
│   └── vendor/          # Semua library lokal: tesseract (wasm + bahasa ind/eng), pdfjs, chart.js, fa
├── data/                # Database + upload + backup (dibuat otomatis, tidak di-git)
│   ├── arsip-bpn.db
│   ├── uploads/
│   ├── backups/         # Cadangan otomatis & manual (.db)
│   └── .session-secret
└── static-site/         # Demo statis lama (GitHub Pages) — dibiarkan
```

## 📌 Catatan Penting

- **Zero cost & offline** — semua library disertakan di `public/vendor/`; OCR tetap jalan tanpa internet
- **OCR aman** — dokumen tidak pernah dikirim ke server/layanan luar; diproses di browser pengguna
- **File upload** tersimpan di `data/uploads/` — sertakan folder `data/` saat backup manual (folder `data/backups/` juga berisi cadangan `.db`)
- **Backup database** — otomatis 24 jam; atau menu *Database & Cadangan* / *Laporan & Ekspor*
- **Untuk LAN kantor**: jalankan di satu PC server, kemudian akses dari PC lain via alamat IP LAN PC tersebut (contoh `http://192.168.1.10:3000`)
- Versi demo statis lama tetap tersedia online di **https://dinothezero.github.io/Arsip-BPN/** (menyimpan data di LocalStorage browser) — bukan untuk data resmi kantor

---
Dibuat untuk kebutuhan Kantor Pertanahan 😊
