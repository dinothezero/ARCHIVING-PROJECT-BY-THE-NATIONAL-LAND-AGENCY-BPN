const q = require('./queries');
const { generateNomorArsip } = q;

const samples = [
  { kata: 'SKK', judul: 'SK Kepala BPN tentang Penetapan Pejabat', no: '670/KEP/BPN/2025', ts: '2025-06-05', ta: '2025-06-10', peng: 'Kepala BPN Pusat', pen: 'Kepala Kantor', perihal: 'Penetapan pejabat', ring: 'SK penetapan pejabat struktural', st: 'aktif', unit: 'UMUM', inst: 'Kementerian ATR/BPN', lok: 'RAK-A1' },
  { kata: 'SHM', judul: 'Sertifikat Hak Milik Tanah a.n. Sdr. Budi', no: 'SHM-00512', ts: '2025-07-15', ta: '2025-07-20', peng: 'Sdr. Budi', pen: 'Seksi Pengukuran', perihal: 'Penerbitan SHM', ring: 'Penerbitan sertifikat tanah 500 m2', st: 'aktif', unit: 'HAK', inst: 'Pemerintah Kabupaten/Kota', lok: 'LEM-1' },
  { kata: 'SM', judul: 'Surat Masuk dari Bupati tentang Penataan Aset', no: '500/123/BUP/2025', ts: '2025-08-02', ta: '2025-08-05', peng: 'Bupati', pen: 'Kepala Kantor', perihal: 'Penataan aset tanah negara', ring: 'Permintaan data aset tanah', st: 'dipinjam', unit: 'PENET', inst: 'Pemerintah Kabupaten/Kota', lok: 'RAK-B1' },
  { kata: 'SKL', judul: 'Surat Keluar Undangan Rapat Koordinasi', no: '600/45/BPN/2025', ts: '2025-08-10', ta: '2025-08-11', peng: 'Kantor Pertanahan', pen: 'Seluruh Bidang', perihal: 'Undangan rakortek', ring: 'Undangan rapat koordinasi teknis', st: 'aktif', unit: 'UMUM', inst: 'Kementerian ATR/BPN', lok: 'RAK-A2' },
  { kata: 'SKG', judul: 'SK Gubernur Penetapan Lokasi', no: '188.45/78/GUB/2025', ts: '2025-09-01', ta: '2025-09-03', peng: 'Gubernur', pen: 'Seksi Penetapan', perihal: 'Penetapan lokasi pengadaan', ring: 'Penetapan lokasi untuk pengadaan tanah', st: 'arsip', unit: 'PENET', inst: 'Pemerintah Kabupaten/Kota', lok: 'BOX-1' }
];

const idUnit = {}; q.getAllUnit.all().forEach(u => idUnit[u.kode] = u.id);
const idInst = {}; q.getAllInstansi.all().forEach(i => idInst[i.nama] = i.id);
const idLok = {}; q.getAllLokasi.all().forEach(l => idLok[l.kode] = l.id);

const kodeQrFromNomor = n => `${n}|seed|${Math.floor(Math.random()*9999)}`;

let dipinjamId = null;
for (const s of samples) {
  const kode = s.kata;
  const nomor = generateNomorArsip(kode);
  const res = q.insertArsip.run(nomor, q.getKategoriByKode.get(kode).id, s.judul, s.no, s.ts, s.ta, s.peng, idInst[s.inst] || null, s.pen, idUnit[s.unit] || null,
    s.perihal, s.ring, s.st, s.lok, idLok[s.lok] || null, kodeQrFromNomor(nomor), 1);
  if (s.st === 'dipinjam') dipinjamId = Number(res.lastInsertRowid);
}

// Catatan peminjaman untuk arsip contoh yang berstatus dipinjam agar dashboard konsisten.
if (dipinjamId) {
  const now = new Date();
  const due = new Date(now.getTime() + 7 * 86400000);
  const ymd = d => d.toISOString().slice(0, 10);
  q.insertPeminjaman.run(dipinjamId, 'Bupati', idUnit['PENET'] || null, 'Permintaan data aset tanah',
    ymd(now), ymd(due), null, 'dipinjam', 'Contoh peminjaman awal', 1);
}

console.log('Seed data berhasil:', samples.length, 'arsip contoh.');
q.db.close();