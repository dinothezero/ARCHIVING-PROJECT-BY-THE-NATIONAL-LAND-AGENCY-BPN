# Sistem Arsip — Kantor Pertanahan (Lokal / Zero Cost)

Aplikasi web pengarsipan dokumen untuk **Kantor Pertanahan** (bekas BPN).
Berjalan 100% lokal di komputer Anda, **tanpa biaya** dan tanpa internet (data tidak dikirim ke mana-mana).

## Fitur

- **Login & Role** — admin, staf, kepala (hak akses berbeda)
- **Password aman (bcrypt)** — password di-hash, tersedia fitur ganti password & reset password
- **CRUD Arsip** — tambah, lihat, ubah, hapus arsip (surat masuk/keluar, sertifikat, SK, dll) dengan status (aktif, arsip, dipinjam, hilang, rusak)
- **Nomor arsip otomatis** — format `KODE/TAHUN/0001` berdasarkan kategori
- **Kategori Arsip** — kelola kategori (SKM, SKG, SKB, SM, SKL, SHM, HGB, HGU, LPJ, dll)
- **Master Data** — kelola lokasi arsip (rak/lemari), unit/bidang, dan instansi pengirim/penerima
- **Disposisi** — alihkan arsip ke pejabat/petugas dengan instruksi, status, dan notifikasi otomatis
- **Peminjaman** — catat peminjaman, jatuh tempo, penanda arsip dipinjam, dan deteksi keterlambatan
- **Upload/Download lampiran** — PDF, JPG, PNG, DOC, DOCX, XLS, TXT (maks 50MB) via klik atau drag-and-drop
- **Barcode / QR** — setiap arsip punya kode QR yang bisa dicetak untuk pelacakan fisik
- **Pencarian & filter** — by nomor, judul, perihal, kategori, status, instansi, lokasi, rentang tanggal
- **Tempat Sampah** — hapus lunak (soft delete), pulihkan, atau hapus permanen
- **Dashboard statistik** — hero sapaan + jam realtime, kartu animasi (count-up), donat status arsip, arsip per kategori, tren 12 bulan, agenda hari ini, peminjaman aktif, disposisi & aktivitas terbaru
- **Buku Agenda** — agenda surat masuk/keluar dengan nomor urut otomatis per tahun, filter tahun & jenis
- **Kalender Kegiatan** — agenda kegiatan (rapat/verifikasi/pelayanan/dll) tampilan kalender bulanan + daftar + tambah cepat
- **Profil Kantor & Kop Surat** — atur identitas instansi, kepala, kontak; dipakai pada cetakan laporan bertanda kop
- **Laporan & Ekspor (CSV, Excel .xlsx)** — rekap arsip per tanggal/kategori, cetak laporan dengan kop surat, ekspor Excel bergaya (header hijau BPN)
- **Import CSV** — masukkan arsip massal dari berkas CSV dengan laporan berhasil/gagal per baris
- **Backup JSON** — unduh cadangan seluruh database (profil, pengguna, arsip, disposisi, peminjaman, agenda, log) sekali klik
- **Notifikasi** — pemberitahuan disposisi & peminjaman (badge + dropdown)
- **Log aktivitas** — riwayat semua aksi pengguna
- **Manajemen Pengguna** — tambah/ubah user, aktif/nonaktif, reset password (khusus admin)
- **Mode responsif** — bisa dipakai di HP/tablet
- **Tampilan pemerintah modern** — warna hijau/toska + aksen emas, panel warna "gov-stripe", header & footer resmi kantor
- **Animasi halus** — splash screen, transisi halaman, angka berjalan, donat chart, bar animasi, scroll-reveal, modal & toast
- **Font offline** — semua font (Lora & Plus Jakarta Sans) disimpan lokal di `public/fonts/`

## Kebutuhan

- **Node.js versi 22.5 atau lebih baru** (memakai SQLite bawaan `node:sqlite`, tidak perlu install database/driver tambahan)
- Tidak perlu Python, tidak perlu compiler, tidak perlu install apa-apa lagi.

## Cara Menjalankan

### 1. Buka folder proyek lalu install dependency (sekali saja):
```bash
npm install
```

### 2. Inisialisasi database (sekali saja):
```bash
npm run init-db
```

### 3. (Opsional) Tambah data contoh:
```bash
npm run seed
```

### 4. Jalankan server:
```bash
npm start
```

Lalu buka browser ke: **http://localhost:3000**

> Untuk stop server: tekan `Ctrl+C` di terminal.
> Atau jalankan via **klik dua kali `start.bat`** (Windows) atau **`start.ps1`** (PowerShell).

### Perintah npm yang tersedia:

| Perintah         | Keterangan                                    |
|------------------|-----------------------------------------------|
| `npm start`      | Jalankan server (production)                  |
| `npm run dev`    | Jalankan server dengan auto-reload (watch)    |
| `npm run init-db`| Inisialisasi database (buat tabel & data awal)|
| `npm run seed`   | Tambah data contoh                            |
| `npm run migrate`| Migrasi database lama                         |
| `npm run setup`  | init-db + migrate (setup lengkap)             |

## Menjalankan di GitHub Pages (Online)

Selain dijalankan lokal, aplikasi ini juga bisa dipublikasikan ke **GitHub Pages**
sebagai situs statis. Karena GitHub Pages tidak bisa menjalankan server Node.js,
aplikasi otomatis beralih ke **backend tiruan di sisi browser** (`public/mock-api.js`)
saat dijalankan di luar `localhost`.

**Cara mengaktifkan:**

1. Pastikan seluruh perubahan sudah di-push ke branch `main`.
2. Buka **Settings → Pages** pada repository, lalu pada **Source** pilih
   **GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` akan otomatis mempublikasikan folder
   `public/` setiap ada push ke `main`.
4. Setelah workflow selesai, situs dapat diakses di
   `https://<username>.github.io/<nama-repo>/`.

**Catatan penting mode GitHub Pages:**

- Data disimpan **di browser masing-masing pengguna** (localStorage untuk data,
  IndexedDB untuk lampiran). Data **tidak dibagikan** antar-pengguna/perangkat,
  dan akan hilang bila cache browser dibersihkan. Gunakan tombol
  **Unduh Backup JSON** untuk cadangan.
- Akun default tetap sama: `admin`, `staff1`, `kepala1` (password `password123`).
- Library QR & Excel dimuat dari CDN. Bila CDN tidak dapat diakses, QR memakai
  fallback SVG dan ekspor Excel otomatis jatuh ke CSV.
- Mode ini terdeteksi otomatis: selama diakses dari `localhost`/`127.0.0.1`
  aplikasi memakai server Express asli; di tempat lain (mis. GitHub Pages)
  aplikasi memakai backend tiruan.

## Akun Default

| Username | Password    | Role        |
|----------|-------------|-------------|
| admin    | password123 | Administrator |
| staff1   | password123 | Staf        |
| kepala1  | password123 | Kepala      |

> **PENTING:** Ganti password segera setelah pertama kali login (menu nama pengguna di pojok kanan atas → Ganti Password).

## Hak Akses

| Aksi                       | Admin | Staf | Kepala |
|----------------------------|:-----:|:----:|:------:|
| Kelola arsip & impor CSV   | ✔     | ✔    | ✔      |
| Disposisi & peminjaman     | ✔     | ✔    | ✔      |
| Buku agenda & kalender     | ✔     | ✔    | ✔      |
| Laporan & ekspor           | ✔     | ✔    | ✔      |
| Kelola master data         | ✔     | ✔    | –      |
| Ubah profil kantor/settings| ✔     | –    | –      |
| Backup JSON                | ✔     | –    | –      |
| Kelola kategori            | ✔     | –    | –      |
| Kelola pengguna            | ✔     | –    | –      |
| Hapus permanen / restore   | ✔     | –    | –      |

## Struktur Folder

```
bpn-arsip/
├── public/               # Frontend (HTML, CSS, JS, font lokal)
│   ├── index.html        # Halaman utama
│   ├── app.js            # Logika frontend (SPA)
│   ├── style.css         # Styling
│   └── fonts/            # Font offline (Lora, Plus Jakarta Sans)
│       ├── Lora-500.ttf
│       ├── Lora-600.ttf
│       ├── PJS-400.ttf
│       ├── PJS-500.ttf
│       ├── PJS-600.ttf
│       └── PJS-700.ttf
├── src/
│   ├── server.js         # Entry server (Express)
│   ├── routes/
│   │   └── api.js        # Endpoint API
│   └── db/
│       ├── init.js       # Buat tabel & data awal
│       ├── migrate.js    # Migrasi database lama
│       ├── seed.js       # Data contoh
│       └── queries.js    # Query database (prepared statements)
├── data/                 # Data lokal (dibuat otomatis)
│   ├── arsip.db          # File database SQLite
│   ├── uploads/          # File lampiran
│   └── .session-secret   # Kunci sesi (dibuat otomatis)
├── .gitignore            # File/folder yang diabaikan git
├── package.json          # Dependency & script npm
├── package-lock.json     # Lock file dependency
├── start.bat             # Script jalankan (Windows CMD)
├── start.ps1             # Script jalankan (PowerShell)
└── README.md             # Dokumentasi proyek
```

## Backup Data

Cukup **copy folder `data/`** ke tempat lain. Semua data arsip + lampiran ada di sana.
Atau gunakan menu **Profil Kantor → Unduh Backup JSON** untuk cadangan database lengkap (arsip, pengguna, disposisi, peminjaman, agenda, dan log) dalam satu berkas.

## Keamanan

- Password di-hash dengan **bcrypt** (tidak pernah disimpan plaintext).
- Sesi dilindungi cookie `httpOnly` + secret acak persisten.
- Semua keluaran HTML di-escape (anti XSS).
- Header keamanan dasar (CSP, X-Content-Type-Options, dll) aktif.
- Aplikasi hanya berjalan di mesin lokal (`localhost`), tidak ada akses dari luar jaringan.

## Lisensi

Dibuat 100% lokal, tanpa biaya. Bebas dipakai/diubah.