const state = {
  currentUser: null,
  currentPage: 'dashboard',
  arsipPage: 1, arsipLimit: 20,
  kategoriMap: {}, lokasiMap: {}, unitMap: {}, instansiMap: {}, userMap: {}, userList: null, dispMap: {},
  filters: { search: '', kategori: '', status: '', dari: '', sampai: '', lokasi: '', instansi: '' },
  masterTab: 'lokasi',
  bgJenis: 'masuk', bgMap: {},
  kalYear: 0, kalMonth: 0, selectedDay: null,
  settings: null, kegMap: {}, kegMapLoaded: false,
  notifTimer: null, detailId: null, arsipOptions: null, arsipOptionMap: {}
};

const PAGE_META = {
  dashboard: ['Dashboard', 'Ringkasan data arsip kantor Anda'],
  arsip: ['Data Arsip', 'Kelola seluruh dokumen dan surat kantor'],
  'buku-agenda': ['Buku Agenda', 'Agenda surat masuk dan keluar'],
  disposisi: ['Disposisi', 'Alur disposisi kegiatan & instruksi'],
  peminjaman: ['Peminjaman', 'Tracking peminjaman dan pengembalian arsip'],
  kalender: ['Kalender', 'Agenda kegiatan dan jadwal kantor'],
  kategori: ['Kategori Arsip', 'Jenis dan klasifikasi dokumen'],
  master: ['Data Master', 'Kelola lokasi, unit, dan instansi'],
  users: ['Pengguna', 'Manajemen akun dan hak akses'],
  laporan: ['Laporan & Ekspor', 'Rekap arsip dan unduhan data'],
  sampah: ['Tempat Sampah', 'Arsip yang dihapus (dapat dipulihkan)'],
  log: ['Log Aktivitas', 'Riwayat seluruh kegiatan pengguna'],
  profil: ['Profil Kantor', 'Identitas instansi, kop surat, dan cadangan data']
};

/* ============ API ============ */
// STATIC_MODE aktif hanya di hosting statis (GitHub Pages / file://).
// Alamat lokal & jaringan privat (LAN) tetap memakai server Express.
const HOSTNAME = location.hostname;
const IS_PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(HOSTNAME);
const STATIC_MODE = !IS_PRIVATE_HOST;

if (STATIC_MODE) {
  const note = document.getElementById('staticModeNote'); if (note) note.style.display = 'block';
  const foot = document.getElementById('footNote'); if (foot) foot.textContent = 'Mode statis · data tersimpan di browser ini';
}

async function api(url, options = {}) {
  if (STATIC_MODE && window.__mockApi) {
    try { return await window.__mockApi(url, options); }
    catch (e) { if (e && e.status === 401) showLogin(); throw e; }
  }
  const opts = { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options };
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  let res;
  try { res = await fetch(url, opts); }
  catch (e) { throw new Error('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.'); }
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) { try { data = await res.json(); } catch (e) { data = null; } }
  if (res.status === 401) {
    showLogin(true);
    throw new Error((data && data.error) || 'Sesi berakhir, silakan masuk kembali');
  }
  if (!res.ok) throw new Error((data && data.error) || `Permintaan gagal (${res.status})`);
  if (data === null) { try { data = await res.json(); } catch (e) { throw new Error('Respons server tidak valid'); } }
  return data;
}

/* Unduh lampiran / backup — menyesuaikan mode statis maupun server */
window.downloadLamp = function (id) {
  if (STATIC_MODE) { window.__mockDownloadLampiran(id); }
  else { window.open('/api/lampiran/' + id + '/download', '_blank'); }
};
window.downloadBackup = function () {
  if (STATIC_MODE) { window.__mockBackup(); }
  else { window.open('/api/backup', '_blank'); }
};

/* ============ HELPERS ============ */
function esc(s) {
  if (s === null || s === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function todayLocal(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Timestamp dari server berupa UTC tanpa penanda zona; parse sebagai UTC.
function parseServerDate(dt) {
  if (dt instanceof Date) return dt;
  const s = String(dt || '').trim();
  if (!s) return new Date(NaN);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(s.replace(' ', 'T') + 'Z');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) return new Date(s + 'Z');
  return new Date(s);
}
const ICONS = {
  eye:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
  clip:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
  trash:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  qr:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z"/></svg>',
  plus:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  restore:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  search:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  bell:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
};

function toast(message, type = 'info', ms = 3200) {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div'); el.className = `toast ${type}`;
  el.innerHTML = `${esc(message)}<span class="t-progress" style="animation-duration:${ms}ms"></span>`;
  c.appendChild(el);
  setTimeout(() => { el.classList.add('hiding'); setTimeout(() => el.remove(), 260); }, ms);
}
function formatDate(d) { if (!d) return '-'; const p = String(d).split('-'); if (p.length !== 3) return d; const n=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']; return `${p[2]} ${n[parseInt(p[1])-1]} ${p[0]}`; }
function formatBytes(b) { if (!b) return '-'; if (b < 1024) return b+' B'; if (b < 1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }
function formatDateTime(dt) { if (!dt) return '-'; const d = parseServerDate(dt); if (isNaN(d)) return dt; return d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
const STATUS_LABEL = { aktif:'Aktif', arsip:'Arsip', dipinjam:'Dipinjam', hilang:'Hilang', rusak:'Rusak' };

/* ============ NAVIGATION ============ */
function isAdmin(){ return state.currentUser && state.currentUser.role === 'admin'; }
function canManage(){ return state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'staff'); }
function canAccessPage(page){
  if (page === 'users' || page === 'log') return isAdmin();
  if (page === 'sampah') return canManage();
  return true;
}
function applyRoleVisibility(){
  document.querySelectorAll('.nav-admin').forEach(n => { n.style.display = isAdmin() ? '' : 'none'; });
  document.querySelectorAll('.nav-item[data-page="sampah"]').forEach(n => { n.style.display = canManage() ? '' : 'none'; });
}
async function showPage(page) {
  if (!canAccessPage(page)) { page = 'dashboard'; }
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => { p.style.display = 'none'; p.classList.remove('entering', 'active'); });
  const target = document.getElementById('page-' + page);
  if (!target) return;
  const [t, s] = PAGE_META[page] || [page, ''];
  document.getElementById('pageTitle').textContent = t;
  document.getElementById('pageSub').textContent = s;
  const actionEl = document.getElementById('pageHeadAction');
  actionEl.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'dashboard') { loadDashboard(); }
  else if (page === 'arsip') {
    actionEl.innerHTML = `<button id="btnTambahArsip" class="btn btn-primary">${ICONS.plus} Tambah Arsip</button>` + (canManage()?`<button id="btnImportArsip" class="btn btn-gold">Import CSV</button>`:'');
    document.getElementById('btnTambahArsip').onclick = openTambahArsip;
    const ib=document.getElementById('btnImportArsip'); if(ib) ib.onclick=openImportModal;
    await ensureDropdowns(); if (state.currentPage !== 'arsip') return;
    buildArsipLayout(); loadArsip();
  }
  else if (page === 'buku-agenda') { actionEl.innerHTML = `<button id="btnTambahBg" class="btn btn-primary">${ICONS.plus} Catat Agenda</button>`; document.getElementById('btnTambahBg').onclick = ()=>openBukuAgendaModal(); buildBukuAgendaLayout(); loadBukuAgenda(); }
  else if (page === 'disposisi') { actionEl.innerHTML = `<button id="btnTambahDisp" class="btn btn-primary">${ICONS.plus} Buat Disposisi</button>`; document.getElementById('btnTambahDisp').onclick = ()=>openDisposisiModal(); buildDisposisiLayout(); loadDisposisi(); }
  else if (page === 'peminjaman') { actionEl.innerHTML = `<button id="btnTambahPinjam" class="btn btn-primary">${ICONS.plus} Catat Peminjaman</button>`; document.getElementById('btnTambahPinjam').onclick = ()=>openPeminjamanModal(); buildPeminjamanLayout(); loadPeminjaman(); }
  else if (page === 'kalender') { actionEl.innerHTML = `<button id="btnTambahKegiatan" class="btn btn-primary">${ICONS.plus} Tambah Kegiatan</button>`; document.getElementById('btnTambahKegiatan').onclick = ()=>openKegiatanModal(); buildKalenderLayout(); loadKalenderPage(); }
  else if (page === 'kategori') { if (isAdmin()) actionEl.innerHTML = `<button id="btnTambahKategori" class="btn btn-primary">${ICONS.plus} Tambah Kategori</button>`; const b=document.getElementById('btnTambahKategori'); if(b)b.onclick=openTambahKategori; buildKategoriLayout(); loadKategoriPage(); }
  else if (page === 'master') { buildMasterLayout(); loadMaster(); }
  else if (page === 'users') { buildUsersLayout(); if (isAdmin()) actionEl.innerHTML = `<button id="btnTambahUser" class="btn btn-primary">${ICONS.plus} Tambah Pengguna</button>`; const b=document.getElementById('btnTambahUser'); if(b)b.onclick=openTambahUser; loadUsersPage(); }
  else if (page === 'laporan') { await ensureDropdowns(); if (state.currentPage !== 'laporan') return; loadLaporanPage(); }
  else if (page === 'sampah') { buildSampahLayout(); loadSampah(); }
  else if (page === 'log') { buildLogLayout(); loadLogPage(); }
  else if (page === 'profil') { loadProfilPage(); }

  target.style.display = 'block';
  void target.offsetWidth;
  target.classList.add('active', 'entering');
  document.getElementById('sidebar').classList.remove('open');
  applyRoleVisibility();
}

/* ============ AUTH ============ */
function showLogin(silent){
  clearInterval(state.notifTimer); state.notifTimer = null;
  state.currentUser = null;
  state.userList = null; state.arsipOptions = null; state.arsipOptionMap = {};
  state.dispMap = {}; state.userMap = {}; state.detailId = null;
  closeUserDropdown(); closeNotifDropdown();
  document.querySelectorAll('.modal').forEach(m => { m.style.display = 'none'; m.classList.remove('closing','open'); });
  document.body.classList.remove('modal-open', 'print-detail');
  document.getElementById('loginPage').style.display = 'grid';
  document.getElementById('appPage').style.display = 'none';
  if (!silent) { const el = document.getElementById('loginError'); if (el) el.style.display = 'none'; }
}
function showApp(user){
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appPage').style.display = 'flex';
  state.currentUser = user;
  document.getElementById('userName').textContent = user.nama;
  document.getElementById('userAvatar').textContent = (user.nama||'?').charAt(0).toUpperCase();
  const roleNames={admin:'Administrator',staff:'Staf',kepala:'Kepala'};
  document.getElementById('userRole').textContent = roleNames[user.role]||user.role;
  document.getElementById('udName').textContent = user.nama;
  document.getElementById('udRole').textContent = roleNames[user.role]||user.role;
  applyRoleVisibility();
  loadNotifikasi();
  clearInterval(state.notifTimer);
  state.notifTimer = setInterval(()=>{ if(state.currentUser) loadNotifikasi(true); }, 30000);
}
document.getElementById('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const errEl=document.getElementById('loginError'); errEl.style.display='none';
  const btn=e.target.querySelector('button[type="submit"]');
  if(btn){ btn.disabled=true; btn.classList.add('loading'); }
  try{
    const data = await api('/api/login',{method:'POST',body:{username:document.getElementById('loginUser').value.trim(),password:document.getElementById('loginPass').value}});
    document.getElementById('loginPass').value='';
    showApp(data.user); showPage('dashboard');
    toast('Selamat datang, '+data.user.nama+'!','success');
  }catch(err){
    errEl.textContent=err.message; errEl.style.display='block';
    errEl.classList.remove('shake'); void errEl.offsetWidth; errEl.classList.add('shake');
  }finally{ if(btn){ btn.disabled=false; btn.classList.remove('loading'); } }
});
document.getElementById('btnLogout').addEventListener('click', async ()=>{
  try{ await api('/api/logout',{method:'POST'}); }catch(e){ /* tetap keluar secara lokal */ }
  showLogin(); toast('Anda telah keluar','info');
  document.getElementById('loginUser').value=''; document.getElementById('loginPass').value='';
});
document.querySelectorAll('.nav-item').forEach(item=>item.addEventListener('click',e=>{ e.preventDefault(); showPage(item.dataset.page); }));
document.getElementById('menuToggle').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));

/* ---- User menu & dropdown ---- */
document.getElementById('userMenu').addEventListener('click', e=>{ e.stopPropagation(); toggleUserDropdown(); });
document.getElementById('btnGantiPass').addEventListener('click',()=>{ closeUserDropdown(); openGantiPass(); });
document.addEventListener('click',()=>{ closeUserDropdown(); closeNotifDropdown(); });
function setDropdown(el, open){
  if(!el) return;
  if(open){ el.style.display='block'; requestAnimationFrame(()=>el.classList.add('open')); }
  else { el.classList.remove('open'); el.style.display='none'; }
}
function toggleUserDropdown(){
  const d=document.getElementById('userDropdown'); if(!d) return;
  const open=!d.classList.contains('open');
  closeNotifDropdown(); setDropdown(d, open);
}
function closeUserDropdown(){ setDropdown(document.getElementById('userDropdown'), false); }
function openGantiPass(){ document.getElementById('gpLama').value='';document.getElementById('gpBaru').value='';document.getElementById('gpUlangi').value=''; openModal('modalGantiPass'); }
document.getElementById('btnGantiPassSubmit').addEventListener('click', async ()=>{
  const lama=document.getElementById('gpLama').value, baru=document.getElementById('gpBaru').value, ulangi=document.getElementById('gpUlangi').value;
  if(!lama||!baru){ toast('Lengkapi semua field','error'); return; }
  if(baru.length<6){ toast('Password baru minimal 6 karakter','error'); return; }
  if(baru!==ulangi){ toast('Password baru tidak sama','error'); return; }
  const btn=document.getElementById('btnGantiPassSubmit'); const old=btn.textContent; btn.disabled=true; btn.textContent='Menyimpan...';
  try{ await api('/api/ganti-password',{method:'POST',body:{passwordLama:lama,passwordBaru:baru}}); toast('Password berhasil diganti','success'); closeModal('modalGantiPass'); }
  catch(err){ toast(err.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=old; }
});

/* ---- Notifikasi ---- */
async function loadNotifikasi(silent){
  try{
    const data=await api('/api/notifikasi');
    const badge=document.getElementById('notifBadge');
    if(data.unread>0){ badge.style.display='flex'; badge.textContent=data.unread; } else badge.style.display='none';
    const list=document.getElementById('notifList');
    if(!data.list||!data.list.length){ list.innerHTML='<div class="notif-empty">Tidak ada notifikasi</div>'; return; }
    list.innerHTML=data.list.map(n=>`
      <div class="notif-item ${n.is_read?'':'unread'}" onclick="notifClick(${n.id},${n.ref_id||0})">
        <div class="notif-ic">${ICONS.bell}</div>
        <div class="notif-item-body">
          <strong>${esc(n.judul)}</strong>
          ${n.pesan?`<p>${esc(n.pesan)}</p>`:''}
          <time>${formatDateTime(n.created_at)}</time>
        </div>
        ${n.is_read?'':'<span class="notif-dot"></span>'}
      </div>`).join('');
  }catch(e){ if(!silent) toast(e.message,'error'); }
}
window.notifClick=async function(id,refId){
  try{ await api('/api/notifikasi/read',{method:'POST',body:{id}}); loadNotifikasi(true); }
  catch(e){}
  if(refId){ closeNotifDropdown(); showPage('arsip'); openDetail(refId); }
};
document.getElementById('btnNotif').addEventListener('click', e=>{ e.stopPropagation(); const d=document.getElementById('notifDropdown'); if(!d) return; const open=!d.classList.contains('open'); closeUserDropdown(); setDropdown(d, open); });
function closeNotifDropdown(){ setDropdown(document.getElementById('notifDropdown'), false); }
document.getElementById('btnMarkReadAll').addEventListener('click', async e=>{ e.stopPropagation(); try{ await api('/api/notifikasi/read',{method:'POST',body:{all:true}}); loadNotifikasi(true); }catch(err){} });

/* ============ MODAL ============ */
let modalReturnFocus = null;
function openModal(id){
  const m=document.getElementById(id); if(!m) return;
  modalReturnFocus = document.activeElement;
  m.classList.remove('closing');
  m.style.display='flex';
  m.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  requestAnimationFrame(()=>m.classList.add('open'));
  const f=m.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
  if(f) setTimeout(()=>{ try{ f.focus({ preventScroll:true }); }catch(e){} }, 140);
}
function closeModal(id){
  const m=document.getElementById(id);
  if(!m || m.style.display==='none' || m.classList.contains('closing')) return;
  m.classList.add('closing');
  setTimeout(()=>{
    m.style.display='none';
    m.classList.remove('closing','open');
    m.setAttribute('aria-hidden','true');
    const anyOpen=[...document.querySelectorAll('.modal')].some(x=>x.style.display!=='none' && !x.classList.contains('closing'));
    if(!anyOpen) document.body.classList.remove('modal-open');
    if(modalReturnFocus && document.body.contains(modalReturnFocus)){
      try{ modalReturnFocus.focus({ preventScroll:true }); }catch(e){}
      modalReturnFocus=null;
    }
  }, 190);
}
document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{ if(e.target.classList.contains('modal-close')||e.target.classList.contains('modal-overlay')) closeModal(m.id); }));
document.addEventListener('keydown', e=>{
  if(e.key!=='Escape') return;
  const open=[...document.querySelectorAll('.modal')].filter(m=>m.style.display!=='none' && !m.classList.contains('closing'));
  if(open.length){ closeModal(open[open.length-1].id); return; }
  closeUserDropdown(); closeNotifDropdown();
});

/* ============ MASTER DATA DROPDOWNS ============ */
async function ensureDropdowns(){
  try{
    const [k,l,u,i] = await Promise.all([api('/api/kategori'),api('/api/lokasi'),api('/api/unit'),api('/api/instansi')]);
    state.kategoriMap={}; k.forEach(x=>state.kategoriMap[x.id]=x);
    state.lokasiMap={}; l.forEach(x=>state.lokasiMap[x.id]=x);
    state.unitMap={}; u.forEach(x=>state.unitMap[x.id]=x);
    state.instansiMap={}; i.forEach(x=>state.instansiMap[x.id]=x);
    fillSelect('arsipKategori',k,x=>`${x.kode} — ${x.nama}`);
    fillSelect('arsipInstansi',i,x=>x.nama);
    fillSelect('arsipUnit',u,x=>`${x.kode} — ${x.nama}`);
    fillSelect('arsipLokasiSel',l,x=>`${x.kode} — ${x.nama}`);
    fillSelect('pinjamUnit',u,x=>`${x.kode} — ${x.nama}`);
    fillSelect('filterKategori',k,x=>`${x.kode} — ${x.nama}`);
    fillSelect('filterInstansi',i,x=>x.nama);
    fillSelect('filterLokasi',l,x=>`${x.kode} — ${x.nama}`);
  }catch(e){ toast(e.message,'error'); }
}
function fillSelect(id, arr, labelFn, placeholder=''){ const sel=document.getElementById(id); if(!sel) return; const cur=sel.value; sel.innerHTML=`<option value="">${placeholder||'— Pilih —'}</option>`+arr.map(x=>`<option value="${x.id}">${esc(labelFn(x))}</option>`).join(''); if(cur) sel.value=cur; }

/* Daftar pengguna aktif untuk dropdown disposisi (tidak butuh akses admin) */
async function ensureUserList(force){
  if(!force && state.userList){ fillSelect('dispKepada', state.userList, x=>x.nama); return state.userList; }
  try{
    const list=await api('/api/users/ringkas');
    state.userList=Array.isArray(list)?list:[];
    fillSelect('dispKepada', state.userList, x=>x.nama);
    return state.userList;
  }catch(e){ toast(e.message,'error'); return state.userList||[]; }
}
/* Cache daftar arsip untuk selector disposisi/peminjaman */
async function loadArsipOptions(force){
  if(!force && state.arsipOptions) return state.arsipOptions;
  const d=await api('/api/arsip?limit=500');
  state.arsipOptions=d.data||[];
  state.arsipOptionMap={};
  state.arsipOptions.forEach(a=>{ state.arsipOptionMap[a.id]=a; });
  return state.arsipOptions;
}
function renderArsipInfo(arsipId, infoId, emptyTitle, emptySub){
  const el=document.getElementById(infoId); if(!el) return;
  const a=arsipId?(state.arsipOptionMap||{})[arsipId]:null;
  el.innerHTML=a?`<strong>${esc(a.nomor_arsip)}</strong><span>${esc(a.judul)}</span>`:`<strong>${esc(emptyTitle)}</strong><span>${esc(emptySub)}</span>`;
}
function bindArsipSelect(selId, hiddenId, infoId, emptyTitle, emptySub){
  const sel=document.getElementById(selId); if(!sel || sel.dataset.bound) return;
  sel.dataset.bound='1';
  sel.addEventListener('change',()=>{
    document.getElementById(hiddenId).value=sel.value;
    renderArsipInfo(sel.value, infoId, emptyTitle, emptySub);
  });
}
function refreshArsipIfBuilt(){ if(document.getElementById('arsipTableBody')) loadArsip(); }
function refreshDashboardIfActive(){ if(state.currentPage==='dashboard') loadDashboard(); }

/* ============ ANIMASI & UTIL ============ */
function countUp(el, target, dur=950){
  if(!el) return; target=target||0; const start=performance.now(); const from=parseInt(String(el.textContent).replace(/\D/g,''))||0;
  function step(now){ const p=Math.min((now-start)/dur,1); const eased=1-Math.pow(1-p,3); el.textContent=Math.round(from+(target-from)*eased).toLocaleString('id-ID'); if(p<1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}
const BULAN_ID=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function formatBulan(b){ if(!b)return '-'; const [y,m]=b.split('-'); return BULAN_ID[parseInt(m)-1]+' '+y; }
function namaHariTanggal(now){
  const hari=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  return hari[now.getDay()]+', '+now.getDate()+' '+BULAN_ID[now.getMonth()]+' '+now.getFullYear();
}
function greetingJam(){ const h=new Date().getHours(); if(h<11)return 'Selamat pagi'; if(h<15)return 'Selamat siang'; if(h<18)return 'Selamat sore'; return 'Selamat malam'; }
function startClock(){
  const pad=n=>String(n).padStart(2,'0');
  function tick(){
    const now=new Date(), t=pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
    const tc=document.getElementById('topClock'); if(tc&&tc.querySelector('.tc-time')){ tc.querySelector('.tc-time').textContent=t; tc.querySelector('.tc-date').textContent=namaHariTanggal(now); }
    const lc=document.getElementById('loginClock'); if(lc) lc.textContent=t;
  }
  tick(); setInterval(tick,1000);
}
const revealObserver=new IntersectionObserver(entries=>{ entries.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('in'); revealObserver.unobserve(en.target); } }); },{threshold:.08});
function observeReveals(root){ (root||document).querySelectorAll('.rv:not(.in)').forEach(el=>revealObserver.observe(el)); }
function renderHBar(id,data,lab,val,cls){ const el=document.getElementById(id); if(!el)return; if(!data||!data.length){el.innerHTML='<div class="hbar-row-empty">Belum ada data</div>';return;} const max=Math.max(...data.map(val),1);
  el.innerHTML=data.map(d=>{const pct=Math.round(val(d)/max*100);return `<div class="hbar"><div class="hbar-label" title="${esc(lab(d))}">${esc(lab(d))}</div><div class="hbar-track"><div class="hbar-fill ${cls||''} animate" data-w="${Math.max(pct,2)}%"></div></div><div class="hbar-value">${val(d)}</div></div>`;}).join('');
  const fills=el.querySelectorAll('.hbar-fill'); requestAnimationFrame(()=>{ fills.forEach(f=>{ const w=f.dataset.w; f.style.transition='width .7s cubic-bezier(.22,.8,.3,1)'; requestAnimationFrame(()=>{ f.style.width=w||'2%'; }); }); });
}
const STATUS_COLOR={aktif:['#1d8468','#dcf3e9'],arsip:['#c9a24b','#f6edd7'],dipinjam:['#c24b5e','#fbeef0'],terlambat:['#e05c47','#fdeaea'],hilang:['#37474f','#eceff1'],rusak:['#7d5bc6','#f1ecfb']};
function renderDonut(elId, legendId, data, lab, val){
  const el=document.getElementById(elId), lg=document.getElementById(legendId); if(!el)return;
  if(!data||!data.length){ el.innerHTML='<div style="color:var(--muted-2);font-size:13px">Belum ada data</div>'; if(lg)lg.innerHTML=''; return; }
  const total=Math.max(data.reduce((s,d)=>s+val(d),0),1);
  const colorOf=d=>{ const key=String(lab(d)).toLowerCase(); return (STATUS_COLOR[key]&&STATUS_COLOR[key][0])||'#7d8b83'; };
  const R=70, C=2*Math.PI*R; let acc=0;
  const segs=data.map(d=>{ const len=C*(val(d)/total); const off=acc; acc+=len;
    return `<circle cx="100" cy="100" r="${R}" fill="none" stroke="${colorOf(d)}" stroke-width="22" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}"/>`; }).join('');
  el.innerHTML=`<svg viewBox="0 0 200 200" width="188" height="188" style="transform:rotate(-90deg)">${segs}</svg>
    <div class="donut-center"><strong>${total}</strong><span>Total Arsip</span></div>`;
  if(lg) lg.innerHTML=data.map(d=>{ const pct=Math.round(val(d)/total*100); return `<div class="lg-row"><span class="lg-dot" style="background:${colorOf(d)}"></span><span class="lg-name">${esc(lab(d))}</span><span class="lg-pct">${pct}%</span><span class="lg-val">${val(d)}</span></div>`; }).join('');
}

/* ============ DASHBOARD ============ */
async function loadDashboard(){
  const sec=document.getElementById('page-dashboard');
  sec.innerHTML=`<div class="dash-hero rv">
      <div class="dash-hero-left">
        <h3 id="dhGreet">${greetingJam()}, ${esc((state.currentUser&&state.currentUser.nama)||'')}</h3>
        <div class="dh-date">${namaHariTanggal(new Date())}</div>
        <div class="dh-msg" id="dhMsg">Ringkasan arsip, disposisi, peminjaman, dan agenda kegiatan kantor Anda hari ini.</div>
      </div>
      <div class="dash-hero-right">
        <div class="hero-chip"><strong id="hcKeg">0</strong><span>Kegiatan Hari Ini</span></div>
        <div class="hero-chip"><strong id="hcPinjam">0</strong><span>Peminjaman Aktif</span></div>
        <div class="hero-chip"><strong id="hcAgenda">0</strong><span>Agenda Bulan Ini</span></div>
      </div>
    </div>
    <div class="stats-grid rv">
      <div class="stat-card"><div class="stat-icon stat-ic-total"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div><div class="stat-info"><span class="stat-label">Total Arsip</span><strong class="stat-number" id="sTotal">0</strong><span class="stat-caption">seluruh dokumen</span></div></div>
      <div class="stat-card"><div class="stat-icon stat-ic-aktif"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.5 12l2 2 3.5-4"/></svg></div><div class="stat-info"><span class="stat-label">Aktif</span><strong class="stat-number" id="sAktif">0</strong><span class="stat-caption">penanganan</span></div></div>
      <div class="stat-card"><div class="stat-icon stat-ic-arsip2"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div><div class="stat-info"><span class="stat-label">Diarsipkan</span><strong class="stat-number" id="sArsip">0</strong><span class="stat-caption">tersimpan</span></div></div>
      <div class="stat-card"><div class="stat-icon stat-ic-pinjam"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="stat-info"><span class="stat-label">Dipinjam</span><strong class="stat-number" id="sPinjam">0</strong><span class="stat-caption">peminjaman</span></div></div>
    </div>
    <div class="stat-mini-grid rv">
      <div class="stat-mini"><div class="sm-num" id="smSampah">0</div><div class="sm-label">Di Tempat Sampah</div></div>
      <div class="stat-mini"><div class="sm-num" id="smHilang">0</div><div class="sm-label">Hilang</div></div>
      <div class="stat-mini"><div class="sm-num" id="smRusak">0</div><div class="sm-label">Rusak</div></div>
    </div>
    <div class="dash-grid-3">
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Distribusi Status</h3><p class="panel-sub">Komposisi berdasarkan status</p></div></div><div class="panel-body" style="display:flex;align-items:center;gap:20px;flex-wrap:wrap"><div class="donut-wrap" id="donutStatus"></div><div class="donut-legend" id="lgStatus"></div></div></div>
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Arsip per Kategori</h3><p class="panel-sub">Distribusi berdasarkan jenis</p></div></div><div class="panel-body"><div id="chartKategori" class="hbar-list"></div></div></div>
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Arsip 12 Bulan Terakhir</h3><p class="panel-sub">Tren masuk tiap bulan</p></div></div><div class="panel-body"><div id="chartBulan" class="hbar-list"></div></div></div>
    </div>
    <div class="dash-grid">
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Agenda Kegiatan Hari Ini</h3><p class="panel-sub">Jadwal yang terjadwal hari ini</p></div></div><div class="panel-body"><div id="dashKegiatan" class="chip-list"></div></div></div>
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Peminjaman Aktif</h3><p class="panel-sub">Prioritas berdasarkan jatuh tempo</p></div></div><div class="panel-body"><div id="dashPinjam" class="list-rows"></div></div></div>
    </div>
    <div class="dash-grid">
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Aktivitas Terbaru</h3><p class="panel-sub">Riwayat terakhir pengguna</p></div></div><div class="panel-body"><div id="dashAktivitas" class="feed-list"></div></div></div>
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Arsip Terbaru</h3><p class="panel-sub">Dokumen paling baru dimasukkan</p></div></div><div class="panel-body"><div id="dashArsipBaru" class="list-rows"></div></div></div>
    </div>`;
  observeReveals(sec);
  try{
    const d=await api('/api/dashboard'); const s=d.stats;
    countUp(document.getElementById('sTotal'), s.total); countUp(document.getElementById('sAktif'), s.aktif); countUp(document.getElementById('sArsip'), s.diarsipkan); countUp(document.getElementById('sPinjam'), s.dipinjam);
    countUp(document.getElementById('smSampah'), s.sampah); countUp(document.getElementById('smHilang'), s.hilang); countUp(document.getElementById('smRusak'), s.rusak);
    countUp(document.getElementById('hcKeg'), (d.kegiatanHariIni||[]).length); countUp(document.getElementById('hcPinjam'), (d.pinjamanAktif||[]).length); countUp(document.getElementById('hcAgenda'), d.agendaCount||0);
    renderHBar('chartKategori',d.byKategori,x=>x.nama,x=>x.jumlah);
    renderHBar('chartBulan',d.byBulan,x=>formatBulan(x.bulan),x=>x.jumlah,'gold');
    renderDonut('donutStatus','lgStatus',d.byStatus,x=>STATUS_LABEL[x.status]||x.status,x=>x.jumlah);
    renderDashKegiatan(d.kegiatanHariIni||[]);
    renderDashPinjam(d.pinjamanAktif||[]);
    renderDashAktivitas(d.aktivitas||[]);
    renderDashArsipBaru(d.arsipTerbaru||[]);
  }catch(e){ toast(e.message,'error'); }
}
function renderDashKegiatan(list){ const el=document.getElementById('dashKegiatan'); if(!el)return;
  if(!list.length){ el.innerHTML='<div class="empty-row">Tidak ada kegiatan terjadwal hari ini</div>'; return; }
  el.innerHTML=list.map(k=>{ const t1=k.jam_mulai?k.jam_mulai.slice(0,5):'--:--'; return `<div class="agenda-chip" onclick="showPage('kalender')"><div class="agenda-time"><strong>${t1}</strong><span>${k.jam_selesai?k.jam_selesai.slice(0,5):''}</span></div><div class="agenda-chip-body"><strong>${esc(k.judul)}</strong><span>${k.lokasi?esc(k.lokasi):'—'}</span></div></div>`; }).join('');
}
function renderDashPinjam(list){ const el=document.getElementById('dashPinjam'); if(!el)return;
  if(!list.length){ el.innerHTML='<div class="empty-row">Tidak ada peminjaman aktif</div>'; return; }
  el.innerHTML=list.map(x=>{ const jt=x.tanggal_jatuh_tempo?Math.ceil((new Date(x.tanggal_jatuh_tempo+'T00:00')-new Date())/86400000):0; const late=jt<0;
    const cls=(x.status==='terlambat'||late)?'msq-red':(jt<=2?'msq-gold':'msq-blue');
    const ttxt=late?(-jt)+' hari lewat':(jt<=2?(jt===0?'jatuh tempo hari ini':jt+' hari lagi'):'jatuh '+formatDate(x.tanggal_jatuh_tempo));
    return `<div class="mini-row" onclick="showPage('peminjaman')"><div class="mini-sq ${cls}">${esc((x.peminjam||'?').charAt(0).toUpperCase())}</div><div class="mini-row-body"><strong title="${esc(x.judul)}">${esc(x.peminjam)}</strong><span class="mono">${esc(x.nomor_arsip||'')}</span></div><div class="mc-right"><span class="tdays" style="${late?'color:#e05c47':''}">${ttxt}</span><span class="badge badge-${x.status}">${STATUS_LABEL[x.status]||x.status}</span></div></div>`; }).join('');
}
function renderDashAktivitas(list){ const el=document.getElementById('dashAktivitas'); if(!el)return;
  if(!list.length){ el.innerHTML='<div class="empty-row">Belum ada aktivitas</div>'; return; }
  el.innerHTML=list.map(a=>`<div class="feed-item"><div class="feed-ic">${ICONS.bell}</div><div class="feed-body"><span class="feed-tag">${esc(a.aksi||'')}</span><p>${esc(a.detail||'')} <b>${esc(a.user_nama||'')}</b></p><time>${formatDateTime(a.created_at)}</time></div></div>`).join('');
}
function renderDashArsipBaru(list){ const el=document.getElementById('dashArsipBaru'); if(!el)return;
  if(!list.length){ el.innerHTML='<div class="empty-row">Belum ada arsip</div>'; return; }
  el.innerHTML=list.map(a=>`<div class="mini-row" onclick="showPage('arsip')"><div class="mini-sq msq-green">${esc((a.kategori_kode||'A').charAt(0))}</div><div class="mini-row-body"><strong title="${esc(a.judul)}">${esc(a.judul)}</strong><span class="mono">${esc(a.nomor_arsip||'')} · ${formatDate(a.tanggal_arsip)}</span></div><span class="badge badge-${a.status}">${STATUS_LABEL[a.status]||a.status}</span></div>`).join('');
}

/* ============ ARSIP ============ */
function buildArsipLayout(){
  const sec=document.getElementById('page-arsip'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`
    <div class="panel filter-bar"><div class="filter-row">
      <input type="text" id="searchInput" class="ctl filter-search" placeholder="Cari nomor, judul, perihal...">
      <select id="filterKategori" class="ctl"></select>
      <select id="filterStatus" class="ctl"><option value="">Semua Status</option><option value="aktif">Aktif</option><option value="arsip">Arsip</option><option value="dipinjam">Dipinjam</option><option value="hilang">Hilang</option><option value="rusak">Rusak</option></select>
      <select id="filterInstansi" class="ctl"></select>
      <select id="filterLokasi" class="ctl"></select>
      <input type="date" id="filterDari" class="ctl" title="Dari">
      <input type="date" id="filterSampai" class="ctl" title="Sampai">
      <button id="btnFilter" class="btn btn-ghost">${ICONS.search} Cari</button>
    </div></div>
    <div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>No</th><th>Nomor</th><th>Kat</th><th>Judul</th><th>Tanggal</th><th>Lokasi</th><th>Status</th><th class="th-actions">Aksi</th></tr></thead><tbody id="arsipTableBody"><tr><td colspan="8" class="empty-state">Memuat...</td></tr></tbody></table></div>
    <div class="table-foot"><span class="table-info" id="arsipInfo"></span><div class="pagination" id="arsipPagination"></div></div></div>`;
  document.getElementById('btnFilter').addEventListener('click',()=>{ applyFilter(); });
  document.getElementById('searchInput').addEventListener('keypress',e=>{ if(e.key==='Enter') applyFilter(); });
  fillSelect('filterKategori',Object.values(state.kategoriMap),x=>`${x.kode} — ${x.nama}`);
  fillSelect('filterInstansi',Object.values(state.instansiMap),x=>x.nama);
  fillSelect('filterLokasi',Object.values(state.lokasiMap),x=>`${x.kode} — ${x.nama}`);
}
function applyFilter(){
  state.filters.search=document.getElementById('searchInput').value.trim();
  state.filters.kategori=document.getElementById('filterKategori').value;
  state.filters.status=document.getElementById('filterStatus').value;
  state.filters.instansi=document.getElementById('filterInstansi').value;
  state.filters.lokasi=document.getElementById('filterLokasi').value;
  state.filters.dari=document.getElementById('filterDari').value;
  state.filters.sampai=document.getElementById('filterSampai').value;
  state.arsipPage=1; loadArsip();
}
async function loadArsip(){
  const f=state.filters;
  const p=new URLSearchParams({page:state.arsipPage,limit:state.arsipLimit,search:f.search,kategori:f.kategori,status:f.status,tanggal_dari:f.dari,tanggal_sampai:f.sampai,lokasi:f.lokasi,instansi:f.instansi});
  try{
    const d=await api('/api/arsip?'+p); const tb=document.getElementById('arsipTableBody'); if(!tb) return; const canDel=canManage();
    if(d.total>0 && state.arsipPage>(d.totalPages||1)){ state.arsipPage=d.totalPages||1; return loadArsip(); }
    const rows=d.data||[];
    if(!rows.length){ tb.innerHTML='<tr><td colspan="8" class="empty-state">Tidak ada data arsip</td></tr>'; }
    else{ let i=(state.arsipPage-1)*state.arsipLimit+1;
      tb.innerHTML=rows.map(a=>`<tr><td>${i++}</td><td class="mono strong">${esc(a.nomor_arsip)}</td><td><span class="tag">${esc(a.kategori_kode)}</span></td><td style="max-width:240px;overflow:hidden;text-overflow:ellipsis" title="${esc(a.judul)}">${esc(a.judul)}</td><td>${formatDate(a.tanggal_arsip)}</td><td>${esc(a.lokasi_kode||'-')}</td><td><span class="badge badge-${a.status}">${STATUS_LABEL[a.status]||a.status}</span></td><td class="th-actions"><div class="cell-actions">
        <button class="icon-btn" onclick="openDetail(${a.id})" title="Detail">${ICONS.eye}</button>
        <button class="icon-btn" onclick="editArsip(${a.id})" title="Edit">${ICONS.edit}</button>
        <button class="icon-btn" onclick="showQr(${a.id})" title="QR">${ICONS.qr}</button>
        <button class="icon-btn" onclick="openLampiran(${a.id})" title="Lampiran">${ICONS.clip}</button>
        ${canDel?`<button class="icon-btn danger" onclick="delArsip(${a.id})" title="Hapus">${ICONS.trash}</button>`:''}
      </div></td></tr>`).join('');
    }
    const from=(state.arsipPage-1)*state.arsipLimit+1, to=Math.min(state.arsipPage*state.arsipLimit,d.total);
    document.getElementById('arsipInfo').textContent=d.total===0?'Tidak ada data':`Menampilkan ${from}–${to} dari ${d.total}`;
    renderPagination('arsipPagination',d.totalPages,state.arsipPage,pp=>{state.arsipPage=pp;loadArsip();});
  }catch(e){ toast(e.message,'error'); }
}
function renderPagination(id,tp,cur,cb){ const el=document.getElementById(id); if(!el)return; if(tp<=1){el.innerHTML='';return;} let h=`<button class="pg-btn" data-n="${cur-1}" ${cur<=1?'disabled':''}>‹</button>`;
  for(let i=1;i<=tp;i++){ if(i===1||i===tp||(i>=cur-1&&i<=cur+1)) h+=`<button class="pg-btn ${i===cur?'active':''}" data-n="${i}">${i}</button>`; else if(!h.endsWith('<span class="pg-ellipsis">…</span>')) h+='<span class="pg-ellipsis">…</span>'; }
  h+=`<button class="pg-btn" data-n="${cur+1}" ${cur>=tp?'disabled':''}>›</button>`; el.innerHTML=h;
  el.querySelectorAll('button[data-n]').forEach(b=>b.addEventListener('click',()=>cb(parseInt(b.dataset.n)))); }

function openTambahArsip(){ document.getElementById('formArsip').reset(); document.getElementById('arsipId').value=''; document.getElementById('arsipTanggalArsip').value=todayLocal(); document.getElementById('modalArsipTitle').textContent='Tambah Arsip'; openModal('modalArsip'); }
window.editArsip=async function(id){ try{ const d=await api('/api/arsip/'+id);
  document.getElementById('arsipId').value=d.id; document.getElementById('arsipKategori').value=d.kategori_id; document.getElementById('arsipStatus').value=d.status;
  document.getElementById('arsipJudul').value=d.judul; document.getElementById('arsipNomorSurat').value=d.nomor_surat||''; document.getElementById('arsipTanggalSurat').value=d.tanggal_surat||'';
  document.getElementById('arsipTanggalArsip').value=d.tanggal_arsip||''; document.getElementById('arsipPengirim').value=d.pengirim||''; document.getElementById('arsipInstansi').value=d.instansi_id||'';
  document.getElementById('arsipPenerima').value=d.penerima||''; document.getElementById('arsipUnit').value=d.unit_id||''; document.getElementById('arsipLokasiSel').value=d.lokasi_id||'';
  document.getElementById('arsipLokasi').value=d.lokasi_fisik||''; document.getElementById('arsipPerihal').value=d.perihal||''; document.getElementById('arsipRingkasan').value=d.ringkasan||'';
  document.getElementById('modalArsipTitle').textContent='Edit Arsip'; openModal('modalArsip'); }catch(e){ toast(e.message,'error'); } };
document.getElementById('btnSimpanArsip').addEventListener('click', async ()=>{
  const id=document.getElementById('arsipId').value;
  const b={ kategori_id:document.getElementById('arsipKategori').value, judul:document.getElementById('arsipJudul').value.trim(), nomor_surat:document.getElementById('arsipNomorSurat').value.trim(),
    tanggal_surat:document.getElementById('arsipTanggalSurat').value, tanggal_arsip:document.getElementById('arsipTanggalArsip').value, pengirim:document.getElementById('arsipPengirim').value.trim(),
    instansi_id:document.getElementById('arsipInstansi').value, penerima:document.getElementById('arsipPenerima').value.trim(), unit_id:document.getElementById('arsipUnit').value,
    perihal:document.getElementById('arsipPerihal').value.trim(), ringkasan:document.getElementById('arsipRingkasan').value.trim(), status:document.getElementById('arsipStatus').value,
    lokasi_fisik:document.getElementById('arsipLokasi').value.trim(), lokasi_id:document.getElementById('arsipLokasiSel').value };
  if(!b.kategori_id||!b.judul||!b.tanggal_arsip){ toast('Kategori, judul, dan tanggal wajib','error'); return; }
  try{ if(id){ await api('/api/arsip/'+id,{method:'PUT',body:b}); toast('Arsip diperbarui','success'); } else { const r=await api('/api/arsip',{method:'POST',body:b}); toast('Arsip dibuat: '+r.nomor_arsip,'success'); }
    state.arsipOptions=null; closeModal('modalArsip'); loadArsip(); }catch(e){ toast(e.message,'error'); }
});
window.delArsip=async function(id){ if(!confirm('Pindahkan arsip ini ke tempat sampah?'))return; try{ await api('/api/arsip/'+id,{method:'DELETE'}); toast('Dipindah ke tempat sampah','success'); state.arsipOptions=null; loadArsip(); }catch(e){ toast(e.message,'error'); } };

/* ---- DETAIL ---- */
window.openDetail=async function(id){
  try{
    const d=await api('/api/arsip/'+id); const can=canManage();
    state.detailId=d.id;
    const lampiran=Array.isArray(d.lampiran)?d.lampiran:[];
    const disp=d.disposisi&&d.disposisi.length?d.disposisi.map(x=>`<div class="file-item"><div style="min-width:0;flex:1"><div style="font-weight:600;font-size:14px">${esc(x.instruksi||'Disposisi')}</div><div style="font-size:12.5px;color:var(--muted)">${formatDate(x.tanggal_disposisi)} · ${esc(x.dari_nama||'-')} → ${esc(x.kepada_nama||'-')}</div></div><span class="badge badge-${x.status}">${esc(x.status)}</span></div>`).join(''):'<div class="empty-state">Belum ada disposisi</div>';
    const pinj=d.peminjaman&&d.peminjaman.length?d.peminjaman.map(x=>`<div class="file-item"><div style="min-width:0;flex:1"><div style="font-weight:600;font-size:14px">${esc(x.peminjam)}</div><div style="font-size:12.5px;color:var(--muted)">${formatDate(x.tanggal_pinjam)} → ${formatDate(x.tanggal_jatuh_tempo)}${x.tanggal_kembali?' · kembali '+formatDate(x.tanggal_kembali):''}</div></div><span class="badge badge-${x.status}">${esc(x.status)}</span></div>`).join(''):'<div class="empty-state">Belum ada peminjaman</div>';
    const kategoriKode=d.kategori_kode||'?';
    document.getElementById('detailContent').innerHTML=`
    <div class="detail-hero"><div class="user-avatar" style="flex-shrink:0">${esc(String(kategoriKode).charAt(0))}</div><div><div class="dh-title">${esc(d.judul)}</div><div class="dh-sub">${esc(d.nomor_arsip)}</div></div></div>
    <div class="detail-grid">
      <div class="detail-label">Nomor Arsip</div><div class="detail-value mono strong">${esc(d.nomor_arsip)}</div>
      <div class="detail-label">Kategori</div><div class="detail-value">${esc(kategoriKode)} — ${esc(d.kategori_nama||'-')}</div>
      <div class="detail-label">Nomor Surat</div><div class="detail-value">${esc(d.nomor_surat||'-')}</div>
      <div class="detail-label">Tanggal Surat</div><div class="detail-value">${formatDate(d.tanggal_surat)}</div>
      <div class="detail-label">Tanggal Arsip</div><div class="detail-value">${formatDate(d.tanggal_arsip)}</div>
      <div class="detail-label">Pengirim</div><div class="detail-value">${esc(d.pengirim||'-')}${d.instansi_nama?' <span class="chip">'+esc(d.instansi_nama)+'</span>':''}</div>
      <div class="detail-label">Penerima</div><div class="detail-value">${esc(d.penerima||'-')}${d.unit_nama?' <span class="chip">'+esc(d.unit_nama)+'</span>':''}</div>
      <div class="detail-label">Perihal</div><div class="detail-value">${esc(d.perihal||'-')}</div>
      <div class="detail-label">Ringkasan</div><div class="detail-value">${esc(d.ringkasan||'-')}</div>
      <div class="detail-label">Status</div><div class="detail-value"><span class="badge badge-${d.status}">${STATUS_LABEL[d.status]||esc(d.status)}</span></div>
      <div class="detail-label">Lokasi</div><div class="detail-value">${d.lokasi_nama?esc(d.lokasi_nama):esc(d.lokasi_fisik||'-')}</div>
      <div class="detail-label">Dibuat</div><div class="detail-value">oleh ${esc(d.creator_nama||'-')} · ${formatDateTime(d.created_at)}</div>
    </div>
    <div class="detail-actions no-print" style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="showQr(${d.id})">${ICONS.qr} QR</button>
      <button class="btn btn-ghost" onclick="openLampiran(${d.id})">${ICONS.clip} Lampiran</button>
      <button class="btn btn-ghost" onclick="openDisposisiModal(${d.id})">${ICONS.plus} Disposisi</button>
      <button class="btn btn-ghost" onclick="openPeminjamanModal(${d.id})">${ICONS.plus} Pinjam</button>
      <button class="btn btn-ghost" onclick="printDetail()">Cetak</button>
    </div>
    <div class="detail-section"><h4>Disposisi</h4>${disp}</div>
    <div class="detail-section"><h4>Riwayat Peminjaman</h4>${pinj}</div>
    <div class="detail-section"><h4>Lampiran (${lampiran.length})</h4>${lampiran.length===0?'<div class="empty-state">Belum ada lampiran</div>':lampiran.map(l=>`<div class="file-item"><svg class="file-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span class="file-item-name" title="${esc(l.nama_original)}">${esc(l.nama_original)}</span><span class="file-item-size">${formatBytes(l.ukuran)}</span><div class="file-item-actions no-print"><a class="icon-btn" href="javascript:void(0)" onclick="downloadLamp(${l.id})" title="Unduh">${ICONS.eye}</a>${can?`<button class="icon-btn danger" onclick="delLamp(${l.id},${d.id})" title="Hapus">${ICONS.trash}</button>`:''}</div></div>`).join('')}</div>`;
    openModal('modalDetail');
  }catch(e){ toast(e.message,'error'); }
};
window.printDetail=function(){
  document.body.classList.add('print-detail');
  const done=()=>{ document.body.classList.remove('print-detail'); window.removeEventListener('afterprint',done); };
  window.addEventListener('afterprint',done);
  setTimeout(()=>window.print(),60);
};
window.delLamp=async function(id, arsipId){ if(!confirm('Hapus lampiran?'))return; try{ await api('/api/lampiran/'+id,{method:'DELETE'}); toast('Lampiran dihapus','success'); if(arsipId && state.detailId) openDetail(arsipId); }catch(e){ toast(e.message,'error'); } };

/* ---- DISPOSISI ---- */
function buildDisposisiLayout(){ const sec=document.getElementById('page-disposisi'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Tanggal</th><th>Arsip</th><th>Dari</th><th>Kepada</th><th>Instruksi</th><th>Status</th><th class="th-actions">Aksi</th></tr></thead><tbody id="disposisiBody"><tr><td colspan="7" class="empty-state">Memuat...</td></tr></tbody></table></div></div>`; }
async function loadDisposisi(){
  try{
    const rows=(await api('/api/disposisi'))||[];
    state.dispMap={}; rows.forEach(r=>state.dispMap[r.id]=r);
    const tb=document.getElementById('disposisiBody'); if(!tb) return;
    if(!rows.length){ tb.innerHTML='<tr><td colspan="7" class="empty-state">Belum ada disposisi</td></tr>'; return; }
    const me=state.currentUser&&state.currentUser.id;
    tb.innerHTML=rows.map(x=>{
      const bolehEdit=isAdmin()||x.dari_user===me||x.kepada_user===me;
      const aksi=`${bolehEdit?`<button class="icon-btn" onclick="openDisposisiModal(0,${x.id})" title="Edit">${ICONS.edit}</button>`:''}${canManage()?`<button class="icon-btn danger" onclick="delDisp(${x.id})" title="Hapus">${ICONS.trash}</button>`:''}`;
      return `<tr><td>${formatDate(x.tanggal_disposisi)}</td><td><span class="mono strong">${esc(x.nomor_arsip||'-')}</span><div style="font-size:12px;color:var(--muted);max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${esc(x.arsip_judul||'')}">${esc(x.arsip_judul||'')}</div></td><td>${esc(x.dari_nama||'-')}</td><td>${esc(x.kepada_nama||'-')}</td><td style="max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${esc(x.instruksi||'')}">${esc(x.instruksi||'-')}</td><td><span class="badge badge-${x.status}">${esc(x.status)}</span></td><td class="th-actions"><div class="cell-actions">${aksi||'<span style="color:var(--muted-2)">—</span>'}</div></td></tr>`;
    }).join('');
  }catch(e){ toast(e.message,'error'); }
}
window.delDisp=async function(id){ if(!confirm('Hapus disposisi?'))return; try{ await api('/api/disposisi/'+id,{method:'DELETE'}); toast('Disposisi dihapus','success'); loadDisposisi(); if(state.detailId) openDetail(state.detailId); }catch(e){ toast(e.message,'error'); } };
async function openDisposisiModal(arsipId, x){
  if(typeof x==='number') x=state.dispMap&&state.dispMap[x];
  const edit=!!(x&&x.id);
  const setVal=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  setVal('dispId', edit?x.id:'');
  setVal('dispInstruksi', x&&x.instruksi?x.instruksi:'');
  setVal('dispCatatan', x&&x.catatan?x.catatan:'');
  setVal('dispTanggal', x&&x.tanggal_disposisi?x.tanggal_disposisi:todayLocal());
  setVal('dispStatus', x&&x.status?x.status:'proses');
  const title=document.querySelector('#modalDisposisi .modal-head h3'); if(title) title.textContent=edit?'Edit Disposisi':'Disposisi Arsip';
  try{
    const list=await loadArsipOptions();
    const sel=document.getElementById('dispArsipSel'), field=document.getElementById('dispArsipField');
    if(sel){ fillSelect('dispArsipSel',list,a=>`${a.nomor_arsip} — ${a.judul}`,'— Pilih arsip —'); sel.disabled=edit; }
    const aid=edit?x.arsip_id:(arsipId||'');
    if(sel && aid) sel.value=String(aid);
    document.getElementById('dispArsipId').value=aid||'';
    if(field) field.style.display=edit?'none':'';
    bindArsipSelect('dispArsipSel','dispArsipId','dispArsipInfo','Pilih Arsip','Disposisi baru');
  }catch(e){ toast(e.message,'error'); }
  await ensureUserList();
  const kepadaEl=document.getElementById('dispKepada');
  if(kepadaEl) kepadaEl.value=(x&&x.kepada_user)?String(x.kepada_user):'';
  const aidFinal=(x&&x.arsip_id)||arsipId;
  renderArsipInfo(aidFinal,'dispArsipInfo','Pilih Arsip','Disposisi baru');
  if(edit) document.getElementById('dispArsipInfo').innerHTML=`<strong>${esc(x.nomor_arsip||'-')}</strong><span>${esc(x.arsip_judul||'')}</span>`;
  openModal('modalDisposisi');
}

/* ---- PEMINJAMAN ---- */
function buildPeminjamanLayout(){ const sec=document.getElementById('page-peminjaman'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Arsip</th><th>Peminjam</th><th>Unit</th><th>Pinjam</th><th>Jatuh Tempo</th><th>Kembali</th><th>Status</th><th class="th-actions">Aksi</th></tr></thead><tbody id="peminjamanBody"><tr><td colspan="8" class="empty-state">Memuat...</td></tr></tbody></table></div></div>`; }
async function loadPeminjaman(){ try{ const list=(await api('/api/peminjaman'))||[]; const tb=document.getElementById('peminjamanBody'); if(!tb) return; if(!list.length){tb.innerHTML='<tr><td colspan="8" class="empty-state">Belum ada peminjaman</td></tr>';return;}
  tb.innerHTML=list.map(x=>`<tr><td><span class="mono strong">${esc(x.nomor_arsip)}</span><div style="font-size:12px;color:var(--muted);max-width:220px;overflow:hidden;text-overflow:ellipsis" title="${esc(x.judul||'')}">${esc(x.judul||'')}</div></td><td>${esc(x.peminjam)}</td><td>${esc(x.unit_nama||x.unit_peminjam||'-')}</td><td>${formatDate(x.tanggal_pinjam)}</td><td>${formatDate(x.tanggal_jatuh_tempo)}</td><td>${x.tanggal_kembali?formatDate(x.tanggal_kembali):'-'}</td><td><span class="badge badge-${x.status}">${STATUS_LABEL[x.status]||esc(x.status)}</span></td><td class="th-actions"><div class="cell-actions">
    ${x.status==='dipinjam'||x.status==='terlambat'?`<button class="btn btn-sm btn-success" onclick="kembaliPinjam(${x.id})">Kembalikan</button>`:''}
    ${canManage()?`<button class="icon-btn danger" onclick="delPinjam(${x.id})" title="Hapus">${ICONS.trash}</button>`:''}
  </div></td></tr>`).join(''); }catch(e){ toast(e.message,'error'); } }
window.delPinjam=async function(id){ if(!confirm('Hapus catatan peminjaman?'))return; try{ await api('/api/peminjaman/'+id,{method:'DELETE'}); toast('Dihapus','success'); loadPeminjaman(); refreshArsipIfBuilt(); if(state.detailId) openDetail(state.detailId); }catch(e){ toast(e.message,'error'); } };
window.kembaliPinjam=async function(id){ if(!confirm('Tandai arsip telah dikembalikan?'))return; try{ await api('/api/peminjaman/'+id,{method:'PUT',body:{status:'dikembalikan'}}); toast('Arsip dikembalikan','success'); loadPeminjaman(); refreshArsipIfBuilt(); if(state.detailId) openDetail(state.detailId); }catch(e){ toast(e.message,'error'); } };
async function openPeminjamanModal(arsipId){
  const setVal=(id,v)=>{ const el=document.getElementById(id); if(el) el.value=v; };
  setVal('pinjamArsipId',arsipId||'');
  setVal('pinjamNama',''); setVal('pinjamAlasan',''); setVal('pinjamCatatan','');
  const plus=new Date(); plus.setDate(plus.getDate()+7);
  setVal('pinjamTglPinjam',todayLocal());
  setVal('pinjamTglTempo',todayLocal(plus));
  try{
    const list=await loadArsipOptions();
    const sel=document.getElementById('pinjamArsipSel');
    if(sel){ fillSelect('pinjamArsipSel',list,a=>`${a.nomor_arsip} — ${a.judul}`,'— Pilih arsip —'); if(arsipId) sel.value=String(arsipId); }
    bindArsipSelect('pinjamArsipSel','pinjamArsipId','pinjamArsipInfo','Pilih Arsip','Catat peminjaman baru');
  }catch(e){ toast(e.message,'error'); }
  await ensureDropdowns();
  setVal('pinjamUnit','');
  renderArsipInfo(arsipId,'pinjamArsipInfo','Pilih Arsip','Catat peminjaman baru');
  openModal('modalPeminjaman');
}

/* ---- KATEGORI ---- */
function buildKategoriLayout(){ const sec=document.getElementById('page-kategori'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Kode</th><th>Nama Kategori</th><th>Deskripsi</th><th class="th-actions">Aksi</th></tr></thead><tbody id="kategoriTableBody"><tr><td colspan="4" class="empty-state">Memuat...</td></tr></tbody></table></div></div>`; }
async function loadKategoriPage(){ try{ const d=await getKategori(); const tb=document.getElementById('kategoriTableBody'); if(!tb)return; if(!d.length){tb.innerHTML='<tr><td colspan="4" class="empty-state">Belum ada kategori</td></tr>';return;}
  tb.innerHTML=d.map(k=>`<tr><td><span class="tag">${esc(k.kode)}</span></td><td class="strong">${esc(k.nama)}</td><td style="max-width:320px;overflow:hidden;text-overflow:ellipsis">${esc(k.deskripsi||'-')}</td><td class="th-actions"><div class="cell-actions">${isAdmin()?`<button class="icon-btn" onclick="editKategori(${k.id})" title="Edit">${ICONS.edit}</button><button class="icon-btn danger" onclick="delKategori(${k.id})" title="Hapus">${ICONS.trash}</button>`:'<span style="color:var(--muted-2)">—</span>'}</div></td></tr>`).join('');
  }catch(e){ toast(e.message,'error'); }
}
async function getKategori(){ const d=await api('/api/kategori'); state.kategoriMap={}; d.forEach(k=>state.kategoriMap[k.id]=k); return d; }
window.editKategori=function(id){ const k=state.kategoriMap[id]; if(!k)return; document.getElementById('kategoriId').value=k.id;document.getElementById('kategoriKode').value=k.kode;document.getElementById('kategoriKode').disabled=true;document.getElementById('kategoriNama').value=k.nama;document.getElementById('kategoriDeskripsi').value=k.deskripsi||'';document.getElementById('modalKategoriTitle').textContent='Edit Kategori';openModal('modalKategori'); };
window.delKategori=async function(id){ if(!confirm('Hapus kategori?'))return; try{ await api('/api/kategori/'+id,{method:'DELETE'}); loadKategoriPage(); toast('Kategori dihapus','success'); }catch(e){ toast(e.message,'error'); } };
function openTambahKategori(){ document.getElementById('formKategori').reset();document.getElementById('kategoriId').value='';document.getElementById('kategoriKode').disabled=false;document.getElementById('modalKategoriTitle').textContent='Tambah Kategori';openModal('modalKategori'); }
document.getElementById('btnSimpanKategori').addEventListener('click',async()=>{ const id=document.getElementById('kategoriId').value; const b={kode:document.getElementById('kategoriKode').value.trim(),nama:document.getElementById('kategoriNama').value.trim(),deskripsi:document.getElementById('kategoriDeskripsi').value.trim()}; if(!b.kode||!b.nama){toast('Kode & nama wajib','error');return;}
  try{ if(id){await api('/api/kategori/'+id,{method:'PUT',body:{nama:b.nama,deskripsi:b.deskripsi}});toast('Diperbarui','success');}else{await api('/api/kategori',{method:'POST',body:b});toast('Ditambahkan','success');} closeModal('modalKategori'); loadKategoriPage(); ensureDropdowns(); }catch(e){toast(e.message,'error');} });

/* ============ MASTER DATA ============ */
function buildMasterLayout(){ const sec=document.getElementById('page-master'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="tabs" id="masterTabs">
      <button class="tab active" data-t="lokasi">Lokasi Arsip</button>
      <button class="tab" data-t="unit">Unit / Bidang</button>
      <button class="tab" data-t="instansi">Instansi</button>
    </div>
    <div id="masterListArea"></div>`;
  sec.querySelectorAll('#masterTabs .tab').forEach(t=>t.addEventListener('click',()=>{ sec.querySelectorAll('#masterTabs .tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); state.masterTab=t.dataset.t; loadMaster(); }));
}
async function loadMaster(){ const t=state.masterTab; const area=document.getElementById('masterListArea'); if(!area)return;
  try{
    let data, fields='';
    if(t==='lokasi'){ data=await api('/api/lokasi'); state.lokasiMap={}; data.forEach(x=>state.lokasiMap[x.id]=x); }
    else if(t==='unit'){ data=await api('/api/unit'); state.unitMap={}; data.forEach(x=>state.unitMap[x.id]=x); }
    else { data=await api('/api/instansi'); state.instansiMap={}; data.forEach(x=>state.instansiMap[x.id]=x); }
    const can=canManage();
    const rows=data.map(x=>{
      let name=x.nama, sub=''; if(t==='lokasi'){name=`${x.kode} — ${x.nama}`; sub=x.keterangan||'';} else if(t==='unit'){name=`${x.kode} — ${x.nama}`;} else {name=x.nama; sub=x.singkatan||'';}
      const statusTxt=x.aktif?'Aktif':'Nonaktif';
      return `<div class="master-row"><div style="min-width:0"><div class="m-name">${esc(name)}</div>${sub?`<div class="m-sub">${esc(sub)}</div>`:''}</div><div style="display:flex;align-items:center;gap:8px">
        ${can?`<button class="icon-btn" onclick="editMaster(${x.id})" title="Edit">${ICONS.edit}</button><button class="icon-btn danger" onclick="delMaster(${x.id})" title="Hapus">${ICONS.trash}</button>`:`<span class="m-status" style="color:var(--muted-2)">${statusTxt}</span>`}
      </div></div>`;
    }).join('');
    fields=can?`<button id="btnAddMaster" class="btn btn-primary" onclick="openMasterModal()">${ICONS.plus} Tambah ${t==='lokasi'?'Lokasi':t==='unit'?'Unit':'Instansi'}</button>`:'';
    area.innerHTML=fields+`<div style="margin-top:14px">${data.length?rows:'<div class="empty-state" style="background:#fff;border:1px solid var(--line);border-radius:10px">Belum ada data</div>'}</div>`;
  }catch(e){ toast(e.message,'error'); }
}
window.editMaster=function(id){
  const t=state.masterTab; let x;
  if(t==='lokasi') x=state.lokasiMap[id]; else if(t==='unit') x=state.unitMap[id]; else x=state.instansiMap[id];
  if(!x)return;
  document.getElementById('masterId').value=id; document.getElementById('masterType').value=t;
  document.getElementById('masterTitle').textContent='Edit '+(t==='lokasi'?'Lokasi':t==='unit'?'Unit':'Instansi');
  let fields='';
  if(t==='lokasi') fields=`<div class="field"><label>Kode</label><input id="mKode" class="ctl" value="${esc(x.kode)}"></div><div class="field"><label>Nama</label><input id="mNama" class="ctl" value="${esc(x.nama)}"></div><div class="field"><label>Keterangan</label><input id="mKet" class="ctl" value="${esc(x.keterangan||'')}"></div><label class="switch" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="mAktif" ${x.aktif?'checked':''}><span class="slider"></span> Aktif</label>`;
  else if(t==='unit') fields=`<div class="field"><label>Kode</label><input id="mKode" class="ctl" value="${esc(x.kode)}"></div><div class="field"><label>Nama</label><input id="mNama" class="ctl" value="${esc(x.nama)}"></div><label class="switch" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="mAktif" ${x.aktif?'checked':''}><span class="slider"></span> Aktif</label>`;
  else fields=`<div class="field"><label>Nama Instansi</label><input id="mNama" class="ctl" value="${esc(x.nama)}"></div><div class="field"><label>Singkatan</label><input id="mKode" class="ctl" value="${esc(x.singkatan||'')}"></div><div class="field"><label>Alamat</label><input id="mKet" class="ctl" value="${esc(x.alamat||'')}"></div><label class="switch" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="mAktif" ${x.aktif?'checked':''}><span class="slider"></span> Aktif</label>`;
  document.getElementById('masterFields').innerHTML=fields; openModal('modalMaster');
};
window.openMasterModal=function(){ document.getElementById('masterId').value=''; document.getElementById('masterType').value=state.masterTab; document.getElementById('masterTitle').textContent='Tambah '+(state.masterTab==='lokasi'?'Lokasi':state.masterTab==='unit'?'Unit':'Instansi');
  let fields; if(state.masterTab==='lokasi')fields=`<div class="field"><label>Kode</label><input id="mKode" class="ctl" placeholder="RAK-X"></div><div class="field"><label>Nama</label><input id="mNama" class="ctl" placeholder="Nama lokasi"></div><div class="field"><label>Keterangan</label><input id="mKet" class="ctl"></div>`;
  else if(state.masterTab==='unit')fields=`<div class="field"><label>Kode</label><input id="mKode" class="ctl" placeholder="UMUM"></div><div class="field"><label>Nama</label><input id="mNama" class="ctl" placeholder="Nama unit"></div>`;
  else fields=`<div class="field"><label>Nama Instansi</label><input id="mNama" class="ctl" placeholder="Nama instansi"></div><div class="field"><label>Singkatan</label><input id="mKode" class="ctl" placeholder="SINGKAT"></div><div class="field"><label>Alamat</label><input id="mKet" class="ctl"></div>`;
  document.getElementById('masterFields').innerHTML=fields; openModal('modalMaster');
};
window.delMaster=async function(id){ if(!confirm('Hapus data master ini?'))return; const t=state.masterTab; try{ await api('/api/'+t+'/'+id,{method:'DELETE'}); loadMaster(); ensureDropdowns(); toast('Dihapus','success'); }catch(e){ toast(e.message,'error'); } };
document.getElementById('btnSimpanMaster').addEventListener('click',async()=>{ const id=document.getElementById('masterId').value, t=document.getElementById('masterType').value;
  const get=v=>document.getElementById(v)&&document.getElementById(v).value; const aktifEl=document.getElementById('mAktif');
  let b,url;
  if(t==='lokasi'){ b={kode:get('mKode'),nama:get('mNama'),keterangan:get('mKet'),aktif:aktifEl?aktifEl.checked:true}; url='/api/lokasi'; }
  else if(t==='unit'){ b={kode:get('mKode'),nama:get('mNama'),aktif:aktifEl?aktifEl.checked:true}; url='/api/unit'; }
  else { b={nama:get('mNama'),singkatan:get('mKode'),alamat:get('mKet'),aktif:aktifEl?aktifEl.checked:true}; url='/api/instansi'; }
  try{ if(id){ await api(url+'/'+id,{method:'PUT',body:b}); } else { await api(url,{method:'POST',body:b}); } closeModal('modalMaster'); loadMaster(); ensureDropdowns(); toast('Tersimpan','success'); }catch(e){ toast(e.message,'error'); }
});

/* ============ USERS ============ */
async function loadUsersPage(){ if(!isAdmin()) return; try{ const d=(await api('/api/users'))||[]; const tb=document.getElementById('usersBody'); if(!tb)return; state.userMap={}; d.forEach(u=>state.userMap[u.id]=u);
  const roleNames={admin:'Administrator',staff:'Staf',kepala:'Kepala'};
  tb.innerHTML=d.map(u=>`<tr><td class="strong">${esc(u.nama)}</td><td class="mono">${esc(u.username)}</td><td><span class="chip">${roleNames[u.role]||esc(u.role)}</span></td><td><span class="badge ${u.aktif?'badge-aktif':'badge-hilang'}">${u.aktif?'Aktif':'Nonaktif'}</span></td><td>${u.last_login?formatDateTime(u.last_login):'-'}</td><td class="th-actions"><div class="cell-actions">
    <button class="btn btn-sm btn-ghost" onclick="resetPass(${u.id})">Reset Pass</button>
    <button class="icon-btn" onclick="editUser(${u.id})" title="Edit">${ICONS.edit}</button>
  </div></td></tr>`).join('');
  }catch(e){ toast(e.message,'error'); } }
function buildUsersLayout(){ const sec=document.getElementById('page-users'); if(sec.innerHTML.trim())return; sec.innerHTML=`<div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Nama</th><th>Username</th><th>Role</th><th>Status</th><th>Login Terakhir</th><th class="th-actions">Aksi</th></tr></thead><tbody id="usersBody"></tbody></table></div></div>`; }
function openTambahUser(){
  document.getElementById('userId').value='';
  const un=document.getElementById('uUsername'); un.value=''; un.disabled=false;
  document.getElementById('uNama').value=''; document.getElementById('uRole').value='staff'; document.getElementById('uPassword').value='';
  document.getElementById('userTitle').textContent='Tambah Pengguna';
  document.getElementById('uPassField').style.display='block'; document.getElementById('uAktifField').style.display='none';
  openModal('modalUser');
}
window.editUser=function(id){ const u=state.userMap[id]; if(!u)return;
  document.getElementById('userId').value=u.id;
  const un=document.getElementById('uUsername'); un.value=u.username; un.disabled=true;
  document.getElementById('uNama').value=u.nama; document.getElementById('uRole').value=u.role;
  document.getElementById('uAktif').value=String(u.aktif);
  document.getElementById('userTitle').textContent='Edit Pengguna';
  document.getElementById('uPassField').style.display='none'; document.getElementById('uAktifField').style.display='block';
  openModal('modalUser');
};
window.resetPass=async function(id){ const p=prompt('Password baru (min 6 karakter):'); if(!p) return; if(p.length<6){ toast('Password minimal 6 karakter','error'); return; }
  try{ await api('/api/users/'+id+'/reset-password',{method:'POST',body:{password:p}}); toast('Password direset','success'); loadUsersPage(); }catch(e){ toast(e.message,'error'); } };
document.getElementById('btnSimpanUser').addEventListener('click',async()=>{
  const id=document.getElementById('userId').value;
  const nama=document.getElementById('uNama').value.trim();
  if(!nama){ toast('Nama lengkap wajib diisi','error'); return; }
  const btn=document.getElementById('btnSimpanUser'); const old=btn.textContent; btn.disabled=true; btn.textContent='Menyimpan...';
  try{
    if(id){
      const b={nama,role:document.getElementById('uRole').value,aktif:document.getElementById('uAktif').value==='1'};
      await api('/api/users/'+id,{method:'PUT',body:b}); toast('Pengguna diperbarui','success');
    } else {
      const username=document.getElementById('uUsername').value.trim();
      const password=document.getElementById('uPassword').value;
      if(!username){ toast('Username wajib diisi','error'); return; }
      if(password.length<6){ toast('Password minimal 6 karakter','error'); return; }
      await api('/api/users',{method:'POST',body:{username,nama,role:document.getElementById('uRole').value,password}});
      toast('Pengguna ditambahkan','success');
    }
    state.userList=null;
    closeModal('modalUser'); loadUsersPage();
  }catch(e){ toast(e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=old; }
});
window.initUsersPage=buildUsersLayout;

/* ============ LAPORAN ============ */
function buildLaporanLayout(){ const sec=document.getElementById('page-laporan'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel filter-bar"><div class="filter-row">
      <input type="date" id="repDari" class="ctl" title="Dari"> <input type="date" id="repSampai" class="ctl" title="Sampai">
      <select id="repKategori" class="ctl"></select>
      <button id="repFilter" class="btn btn-ghost">${ICONS.search} Tampilkan</button>
      <button id="repPrint" class="btn btn-primary">Cetak</button>
    </div></div>
    <div class="report-actions">
      <button id="repExport" class="btn btn-ghost">Ekspor CSV</button>
      <button id="repExportXlsx" class="btn btn-gold">Ekspor Excel (.xlsx)</button>
      ${canManage()?`<button id="repImport" class="btn btn-ghost">Import CSV</button>`:''}
    </div>
    <div class="no-print panel filter-bar" style="background:var(--gold-soft);border-color:#eadfbe;padding:10px 16px"><span style="font-size:12.5px;color:#8a6d2f">Laporan dicetak dengan kop surat sesuai Profil Kantor. Kelola di menu <b>Profil Kantor</b>.</span></div>
    <div id="repArea"></div>`;
  fillSelect('repKategori',Object.values(state.kategoriMap),x=>`${x.kode} — ${x.nama}`);
  document.getElementById('repFilter').addEventListener('click',loadLaporanPage);
  document.getElementById('repPrint').addEventListener('click',()=>window.print());
  document.getElementById('repExport').addEventListener('click',()=>exportCsv());
  document.getElementById('repExportXlsx').addEventListener('click',exportXlsx);
  const ib=document.getElementById('repImport'); if(ib) ib.addEventListener('click',openImportModal);
}
function exportXlsx(){ try{ const dari=document.getElementById('repDari').value||'',sampai=document.getElementById('repSampai').value||'',kategori=document.getElementById('repKategori').value||'';
  if(STATIC_MODE){ window.__mockExportXlsx(dari,sampai,kategori); } else { window.open('/api/ekspor/xlsx?dari='+encodeURIComponent(dari)+'&sampai='+encodeURIComponent(sampai)+'&kategori='+encodeURIComponent(kategori),'_blank'); } }catch(e){ toast(e.message,'error'); } }
async function loadLaporanPage(){ buildLaporanLayout();
  const dari=document.getElementById('repDari').value||'', sampai=document.getElementById('repSampai').value||'', kategori=document.getElementById('repKategori').value||'';
  try{ const d=await api('/api/laporan?dari='+encodeURIComponent(dari)+'&sampai='+encodeURIComponent(sampai)+'&kategori='+encodeURIComponent(kategori));
    const s=state.settings||{};
    const area=document.getElementById('repArea');
    area.innerHTML=`<div class="print-kop"><h4>${esc(s.nama_kantor||'Kantor Pertanahan')}</h4><div class="kp-sub">${esc(s.sub_nama||'Badan Pertanahan Nasional')}</div><p>${esc(s.alamat||'')}</p><hr></div>
    <div class="stat-mini-grid"><div class="stat-mini"><div class="sm-num">${d.rows.length}</div><div class="sm-label">Arsip terfilter</div></div><div class="stat-mini"><div class="sm-num">${d.total}</div><div class="sm-label">Total arsip</div></div></div>
    <div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Nomor</th><th>Tanggal</th><th>Kategori</th><th>Judul</th><th>Perihal</th><th>Status</th></tr></thead><tbody>
    ${d.rows.length?d.rows.map(r=>`<tr><td class="mono strong">${esc(r.nomor_arsip)}</td><td>${formatDate(r.tanggal_arsip)}</td><td>${esc(r.kategori_kode)}</td><td style="max-width:240px;overflow:hidden;text-overflow:ellipsis" title="${esc(r.judul)}">${esc(r.judul)}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${esc(r.perihal||'-')}</td><td><span class="badge badge-${r.status}">${STATUS_LABEL[r.status]||r.status}</span></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">Tidak ada data</td></tr>'}
    </tbody></table></div></div>`;
  }catch(e){ toast(e.message,'error'); }
}
async function exportCsv(){ try{ const dari=document.getElementById('repDari').value||'',sampai=document.getElementById('repSampai').value||'',kategori=document.getElementById('repKategori').value||'';
  if(STATIC_MODE){ window.__mockExportCsv(dari,sampai,kategori); } else { window.open('/api/ekspor/csv?dari='+encodeURIComponent(dari)+'&sampai='+encodeURIComponent(sampai)+'&kategori='+encodeURIComponent(kategori),'_blank'); } }catch(e){ toast(e.message,'error'); } }

/* ============ SAMPAH ============ */
function buildSampahLayout(){ const sec=document.getElementById('page-sampah'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Nomor</th><th>Judul</th><th>Dihapus Pada</th><th class="th-actions">Aksi</th></tr></thead><tbody id="sampahBody"><tr><td colspan="4" class="empty-state">Memuat...</td></tr></tbody></table></div></div>`; }
async function loadSampah(){ try{ const d=(await api('/api/trash'))||[]; const tb=document.getElementById('sampahBody'); if(!tb)return; if(!d.length){tb.innerHTML='<tr><td colspan="4" class="empty-state">Tempat sampah kosong</td></tr>';return;}
  tb.innerHTML=d.map(a=>`<tr><td class="mono strong">${esc(a.nomor_arsip)}</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis" title="${esc(a.judul)}">${esc(a.judul)}</td><td>${formatDateTime(a.deleted_at)}</td><td class="th-actions"><div class="cell-actions">
    <button class="btn btn-sm btn-ghost" onclick="restoreArsip(${a.id})">${ICONS.restore} Pulihkan</button>
    ${isAdmin()?`<button class="btn btn-sm btn-danger" onclick="permanentDel(${a.id})">Hapus Permanen</button>`:''}
  </div></td></tr>`).join('');
  }catch(e){ toast(e.message,'error'); } }
window.restoreArsip=async function(id){ try{ await api('/api/arsip/'+id+'/restore',{method:'POST',body:{}}); toast('Arsip dipulihkan','success'); state.arsipOptions=null; loadSampah(); refreshArsipIfBuilt(); refreshDashboardIfActive(); }catch(e){ toast(e.message,'error'); } };
window.permanentDel=async function(id){ if(!confirm('Hapus PERMANEN? Tindakan tidak dapat dibatalkan.'))return; try{ await api('/api/arsip/'+id+'/permanen',{method:'DELETE'}); toast('Dihapus permanen','success'); loadSampah(); }catch(e){ toast(e.message,'error'); } };

/* ============ LOG ============ */
function buildLogLayout(){ const sec=document.getElementById('page-log'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Tabel</th><th>Detail</th></tr></thead><tbody id="logBody"><tr><td colspan="5" class="empty-state">Memuat...</td></tr></tbody></table></div></div>`; }
async function loadLogPage(){ try{ const d=await api('/api/log'); const tb=document.getElementById('logBody'); if(!tb||!d.data)return; if(!d.data.length){tb.innerHTML='<tr><td colspan="5" class="empty-state">Belum ada aktivitas</td></tr>';return;}
  tb.innerHTML=d.data.map(l=>`<tr><td>${formatDateTime(l.created_at)}</td><td class="strong">${esc(l.user_nama)}</td><td><span class="chip">${esc(l.aksi)}</span></td><td style="color:var(--muted)">${esc(l.tabel)}</td><td style="max-width:320px;overflow:hidden;text-overflow:ellipsis" title="${esc(l.detail||'')}">${esc(l.detail||'-')}</td></tr>`).join('');
  }catch(e){ toast(e.message,'error'); } }

/* ============ LAMPIRAN ============ */
window.openLampiran=async function(id){
  document.getElementById('lampiranArsipId').value=id;
  try{ const d=await api('/api/arsip/'+id); renderFileList(d.lampiran||[]); openModal('modalLampiran'); }
  catch(e){ toast(e.message,'error'); }
};
function renderFileList(files){ const el=document.getElementById('fileList'); if(!el) return; const can=canManage();
  if(!files||!files.length){ el.innerHTML='<div class="empty-state">Belum ada lampiran</div>'; return; }
  el.innerHTML=files.map(l=>`<div class="file-item"><svg class="file-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><span class="file-item-name" title="${esc(l.nama_original)}">${esc(l.nama_original)}</span><span class="file-item-size">${formatBytes(l.ukuran)}</span><div class="file-item-actions"><a class="icon-btn" href="javascript:void(0)" onclick="downloadLamp(${l.id})" title="Unduh">${ICONS.eye}</a>${can?`<button class="icon-btn danger" onclick="delLampModal(${l.id})" title="Hapus">${ICONS.trash}</button>`:''}</div></div>`).join('');
}
window.delLampModal=async function(id){ if(!confirm('Hapus lampiran?'))return; try{
  await api('/api/lampiran/'+id,{method:'DELETE'});
  const aid=document.getElementById('lampiranArsipId').value;
  const d=await api('/api/arsip/'+aid); renderFileList(d.lampiran||[]);
  toast('Lampiran dihapus','success');
  if(state.detailId) openDetail(state.detailId);
}catch(e){ toast(e.message,'error'); } };
const uploadZone=document.getElementById('uploadZone'), fileInput=document.getElementById('fileInput');
if(uploadZone && fileInput){
  uploadZone.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',()=>uploadFiles(fileInput.files));
  uploadZone.addEventListener('dragover',e=>{e.preventDefault();uploadZone.classList.add('dragover');});
  uploadZone.addEventListener('dragleave',()=>uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop',e=>{e.preventDefault();uploadZone.classList.remove('dragover'); if(e.dataTransfer.files.length)uploadFiles(e.dataTransfer.files);});
}
async function uploadFiles(files){
  const aid=document.getElementById('lampiranArsipId').value;
  if(!aid || !files || !files.length) return;
  const zone=document.getElementById('uploadZone'); if(zone) zone.classList.add('uploading');
  try{
    let d;
    if(STATIC_MODE){ d = await window.__mockUploadLampiran(aid, files); }
    else {
      const fd=new FormData(); for(const f of files) fd.append('files',f);
      const r=await fetch('/api/arsip/'+aid+'/lampiran',{method:'POST',body:fd});
      const ct=r.headers.get('content-type')||'';
      d = ct.includes('application/json') ? await r.json() : null;
      if(!r.ok) throw new Error((d&&d.error)||'Gagal mengunggah file');
    }
    toast(`${d.files.length} file diunggah`,'success');
    state.arsipOptions=null;
    const up=await api('/api/arsip/'+aid); renderFileList(up.lampiran||[]);
    if(state.detailId) openDetail(state.detailId);
  }catch(e){ toast(e.message||'Gagal mengunggah file','error'); }
  finally{ fileInput.value=''; if(zone) zone.classList.remove('uploading'); }
}

/* ============ QR ============ */
window.showQr=async function(id){ try{ const d=await api('/api/arsip/'+id+'/qr'); document.getElementById('qrImage').innerHTML=`<img src="${d.dataUrl}" alt="QR">`; document.getElementById('qrNomor').textContent=d.nomor_arsip; openModal('modalQr'); }catch(e){ toast(e.message,'error'); } };
document.getElementById('btnPrintQr').addEventListener('click',()=>{ const d=document.getElementById('qrImage').innerHTML; const n=document.getElementById('qrNomor').textContent;
  const w=window.open('','_blank','width=400,height=500'); w.document.write(`<html><head><title>QR ${n}</title><style>body{font-family:sans-serif;text-align:center;padding:30px}h1{font-size:18px;margin-bottom:20px}.qr{display:inline-block;border:2px solid #333;padding:10px}</style></head><body><h1>Kantor Pertanahan</h1><div class="qr">${d}</div><p style="font-weight:bold;font-size:18px">${n}</p><script>window.onload=function(){setTimeout(function(){window.print()},300)}</scr`+`ipt></body></html>`); w.document.close(); });

/* ============ DISPOSISI SAVE ============ */
document.getElementById('btnSimpanDisposisi').addEventListener('click',async()=>{
  const dispId=document.getElementById('dispId').value;
  const sel=document.getElementById('dispArsipSel');
  const arsipId=document.getElementById('dispArsipId').value||(sel?sel.value:'');
  const b={ kepada_user:document.getElementById('dispKepada').value||null,
    instruksi:document.getElementById('dispInstruksi').value.trim(),
    tanggal:document.getElementById('dispTanggal').value||todayLocal(),
    status:document.getElementById('dispStatus').value,
    catatan:document.getElementById('dispCatatan').value.trim() };
  if(!dispId && !arsipId){ toast('Pilih arsip yang akan didisposisi','error'); return; }
  const btn=document.getElementById('btnSimpanDisposisi'); const old=btn.textContent; btn.disabled=true; btn.textContent='Menyimpan...';
  try{
    if(dispId){ await api('/api/disposisi/'+dispId,{method:'PUT',body:b}); toast('Disposisi diperbarui','success'); }
    else { await api('/api/disposisi',{method:'POST',body:{...b, arsip_id:arsipId}}); toast('Disposisi dibuat','success'); }
    state.dispMap={};
    closeModal('modalDisposisi');
    if(document.getElementById('disposisiBody')) loadDisposisi();
    if(state.detailId) openDetail(state.detailId);
    refreshDashboardIfActive();
  }catch(e){ toast(e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=old; }
});
document.getElementById('btnSimpanPeminjaman').addEventListener('click',async()=>{
  const sel=document.getElementById('pinjamArsipSel');
  const aid=document.getElementById('pinjamArsipId').value||(sel?sel.value:'');
  const b={ arsip_id:aid, peminjam:document.getElementById('pinjamNama').value.trim(),
    unit_peminjam:document.getElementById('pinjamUnit').value||null,
    alasan:document.getElementById('pinjamAlasan').value.trim(),
    tanggal_pinjam:document.getElementById('pinjamTglPinjam').value,
    tanggal_jatuh_tempo:document.getElementById('pinjamTglTempo').value,
    catatan:document.getElementById('pinjamCatatan').value.trim() };
  if(!aid||!b.peminjam){ toast('Arsip dan nama peminjam wajib dipilih/diisi','error'); return; }
  if(!b.tanggal_pinjam||!b.tanggal_jatuh_tempo){ toast('Tanggal pinjam dan jatuh tempo wajib diisi','error'); return; }
  if(b.tanggal_jatuh_tempo < b.tanggal_pinjam){ toast('Jatuh tempo tidak boleh sebelum tanggal pinjam','error'); return; }
  const btn=document.getElementById('btnSimpanPeminjaman'); const old=btn.textContent; btn.disabled=true; btn.textContent='Menyimpan...';
  try{
    await api('/api/peminjaman',{method:'POST',body:b});
    toast('Peminjaman dicatat','success');
    state.arsipOptions=null;
    closeModal('modalPeminjaman');
    loadPeminjaman(); refreshArsipIfBuilt(); refreshDashboardIfActive();
    if(state.detailId) openDetail(state.detailId);
  }catch(e){ toast(e.message,'error'); }
  finally{ btn.disabled=false; btn.textContent=old; }
});

/* ============ USER DROPDOWN helpers (re-index users body) ============ */
window.initUsersPageActive = function(){};

/* ============ SETTINGS / PROFIL KANTOR ============ */
function applySettings(s){
  const t1=document.querySelector('.topbar-brand-text strong'), t2=document.querySelector('.topbar-brand-text span');
  if(t1&&s.nama_kantor) t1.textContent=s.nama_kantor;
  if(t2&&s.sub_nama) t2.textContent=s.sub_nama;
  const lbh=document.querySelector('.login-brand-panel h1'); if(lbh&&s.nama_kantor) lbh.textContent=s.nama_kantor;
  const lbs=document.querySelector('.brand-sub'); if(lbs&&s.sub_nama) lbs.textContent=s.sub_nama;
  const fb=document.getElementById('footBrand'); if(fb) fb.textContent=(s.nama_kantor||'Kantor Pertanahan')+' — '+(s.sub_nama||'Badan Pertanahan Nasional');
}
function kopsHTML(s){
  const addr=[s.alamat||'', s.telepon?('Telepon: '+s.telepon):'', s.email?('Email: '+s.email):''].filter(Boolean).map(esc).join('<br>');
  return `<h4>${esc(s.nama_kantor||'Kantor Pertanahan')}</h4><div class="kp-sub">${esc(s.sub_nama||'Badan Pertanahan Nasional')}</div><div class="kp-addr">${addr}</div><div class="kp-motto">${esc(s.motto||'')}</div><div class="kp-kepala">${esc(s.kepala_nama||'')}${s.kepala_nip?'<br>NIP. '+esc(s.kepala_nip):''}</div>`;
}
async function loadProfilPage(){
  const sec=document.getElementById('page-profil');
  try{
    const s=await api('/api/settings'); state.settings=s;
    sec.innerHTML=`<div class="profil-grid">
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Identitas &amp; Kop Surat</h3><p class="panel-sub">Dipakai pada laporan cetak dan ekspor</p></div>${isAdmin()?`<button id="btnEditProfil" class="btn btn-ghost btn-sm">${ICONS.edit} Edit</button>`:''}</div><div class="panel-body"><div class="kop-preview">${kopsHTML(s)}</div></div></div>
      <div class="panel rv"><div class="panel-head"><div><h3 class="panel-title">Cadangan Data</h3><p class="panel-sub">Full backup seluruh database</p></div></div><div class="panel-body backup-card"><div class="bc-ic"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div><h4>Unduh Backup</h4><p>Mengunduh keseluruhan data (profil, pengguna, arsip, disposisi, peminjaman, agenda, dan log) dalam satu berkas JSON.</p>${isAdmin()?`<button id="btnBackup" class="btn btn-primary">Unduh Backup JSON</button>`:`<span class="table-info">Hanya Administrator</span>`}</div></div>
    </div>`;
    observeReveals(sec);
    const eb=document.getElementById('btnEditProfil'); if(eb) eb.onclick=openProfilEdit;
    const bb=document.getElementById('btnBackup'); if(bb) bb.onclick=()=>downloadBackup();
  }catch(e){ toast(e.message,'error'); }
}
function openProfilEdit(){
  const s=state.settings||{};
  const set=(id,key)=>document.getElementById(id).value=s[key]||'';
  set('setNamaKantor','nama_kantor'); set('setSubNama','sub_nama'); set('setAlamat','alamat'); set('setTelepon','telepon');
  set('setEmail','email'); set('setWebsite','website'); set('setKepalaNama','kepala_nama'); set('setKepalaNip','kepala_nip'); set('setKota','kota_kop'); set('setMotto','motto');
  const pv=()=>{ const now={nama_kantor:document.getElementById('setNamaKantor').value,sub_nama:document.getElementById('setSubNama').value,alamat:document.getElementById('setAlamat').value,telepon:document.getElementById('setTelepon').value,email:document.getElementById('setEmail').value,kepala_nama:document.getElementById('setKepalaNama').value,kepala_nip:document.getElementById('setKepalaNip').value,motto:document.getElementById('setMotto').value}; document.getElementById('profilKopPreview').innerHTML=kopsHTML(now); };
  document.querySelectorAll('#modalProfil input.ctl').forEach(inp=>{ inp.oninput=pv; });
  pv();
  openModal('modalProfil');
}
document.getElementById('btnSimpanProfil').addEventListener('click',async()=>{ const g=id=>document.getElementById(id).value.trim();
  const b={ nama_kantor:g('setNamaKantor'), sub_nama:g('setSubNama'), alamat:g('setAlamat'), telepon:g('setTelepon'), email:g('setEmail'), website:g('setWebsite'), kepala_nama:g('setKepalaNama'), kepala_nip:g('setKepalaNip'), kota_kop:g('setKota'), motto:g('setMotto') };
  if(!b.nama_kantor){ toast('Nama kantor wajib','error'); return; }
  try{ await api('/api/settings',{method:'PUT',body:b}); toast('Profil kantor disimpan','success'); state.settings=b; applySettings(b); closeModal('modalProfil'); loadProfilPage(); }catch(e){ toast(e.message,'error'); }
});

/* ============ IMPORT CSV ============ */
let importFile = null;
function openImportModal(){
  if(!canManage()){ toast('Hanya admin/staf yang dapat mengimpor data','error'); return; }
  importFile=null;
  document.getElementById('importResult').innerHTML='';
  document.getElementById('csvFileName').textContent='';
  document.getElementById('csvInput').value='';
  openModal('modalImport');
}
function setImportFile(f){ importFile=f||null; document.getElementById('csvFileName').textContent=f?('Tersedia: '+f.name+' ('+formatBytes(f.size)+')'):''; }
document.getElementById('btnPilihCsv').addEventListener('click',e=>{ e.stopPropagation(); document.getElementById('csvInput').click(); });
const importZone=document.getElementById('importZone');
importZone.addEventListener('click',e=>{ if(e.target.id!=='btnPilihCsv') document.getElementById('csvInput').click(); });
importZone.addEventListener('dragover',e=>{ e.preventDefault(); importZone.classList.add('dragover'); });
importZone.addEventListener('dragleave',()=>importZone.classList.remove('dragover'));
importZone.addEventListener('drop',e=>{ e.preventDefault(); importZone.classList.remove('dragover'); const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) setImportFile(f); });
document.getElementById('csvInput').addEventListener('change',()=>{ const f=document.getElementById('csvInput').files[0]; setImportFile(f); });
document.getElementById('btnImportSubmit').addEventListener('click',async()=>{
  const inp=document.getElementById('csvInput');
  const file=importFile||inp.files[0];
  if(!file){ toast('Pilih file CSV dulu','error'); return; }
  const btn=document.getElementById('btnImportSubmit'); const old=btn.textContent; btn.textContent='Memproses...'; btn.disabled=true;
  try{
    let d;
    if(STATIC_MODE){ d = await window.__mockImport(file); }
    else {
      const fd=new FormData(); fd.append('file',file);
      const res=await fetch('/api/import/arsip',{method:'POST',body:fd});
      const ct=res.headers.get('content-type')||'';
      d=ct.includes('application/json')?await res.json():null;
      if(!res.ok) throw new Error((d&&d.error)||'Import gagal');
    }
    const masuk=d.masuk||0, gagal=d.gagal||0;
    document.getElementById('importResult').innerHTML=`<div class="imp-sum"><div><strong class="ok">${masuk}</strong><span>Berhasil</span></div><div><strong class="bad">${gagal}</strong><span>Gagal</span></div><div><strong>${masuk+gagal}</strong><span>Total</span></div></div>`+(d.eror&&d.eror.length?`<div class="imp-errors">${d.eror.map(er=>`<div class="imp-err">${esc(er)}</div>`).join('')}</div>`:'');
    toast(masuk>0?('Import selesai: '+masuk+' berhasil'):'Tidak ada data berhasil diimpor', masuk>0?'success':'info');
    state.arsipOptions=null;
    refreshArsipIfBuilt(); refreshDashboardIfActive();
  }catch(e){ toast(e.message||'Import gagal','error'); }
  finally{ btn.textContent=old; btn.disabled=false; }
});

/* ============ BUKU AGENDA ============ */
function buildBukuAgendaLayout(){ const sec=document.getElementById('page-buku-agenda'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel filter-bar"><div class="filter-row agenda-toolbar">
      <div class="tabs" id="bgTabs" style="margin-bottom:0"><button class="tab active" data-j="masuk">Surat Masuk</button><button class="tab" data-j="keluar">Surat Keluar</button></div>
      <select id="bgTahunFilter" class="ctl"></select>
      <span class="table-info" id="bgInfo" style="margin-left:auto"></span>
    </div></div>
    <div class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>No. Urut</th><th>Tanggal</th><th>Nomor Surat</th><th>Asal / Tujuan</th><th>Perihal</th><th>Arsip</th><th class="th-actions">Aksi</th></tr></thead><tbody id="bgBody"><tr><td colspan="7" class="empty-state">Memuat...</td></tr></tbody></table></div></div>`;
  sec.querySelectorAll('#bgTabs .tab').forEach(t=>t.addEventListener('click',()=>{ sec.querySelectorAll('#bgTabs .tab').forEach(x=>x.classList.remove('active')); t.classList.add('active'); state.bgJenis=t.dataset.j; loadBukuAgenda(); }));
  const now=new Date().getFullYear();
  document.getElementById('bgTahunFilter').innerHTML=`<option value="${now}">${now}</option>`;
  document.getElementById('bgTahunFilter').addEventListener('change',()=>{ loadBukuAgenda(); });
}
function updateBgTahunFilter(years, selected){
  const sel=document.getElementById('bgTahunFilter'); if(!sel) return;
  const now=new Date().getFullYear();
  const all=[...new Set([now, ...(years||[]).map(Number), Number(selected)||0])].filter(y=>y>0).sort((a,b)=>b-a);
  sel.innerHTML=all.map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value=String(selected||now);
}
async function loadBukuAgenda(){
  const jenis=state.bgJenis||'masuk';
  const selTahun=document.getElementById('bgTahunFilter');
  const tahun=(selTahun&&selTahun.value)?selTahun.value:String(new Date().getFullYear());
  const qs='/api/buku-agenda?jenis='+encodeURIComponent(jenis)+'&tahun='+encodeURIComponent(tahun);
  try{
    const d=await api(qs); const tb=document.getElementById('bgBody'); if(!tb)return;
    updateBgTahunFilter(d.tahunTersedia, tahun);
    const rows=d.rows||[];
    state.bgMap={}; rows.forEach(r=>state.bgMap[r.id]=r);
    const info=document.getElementById('bgInfo'); if(info) info.textContent=(Number(d.tahun)===Number(tahun))?`${d.jumlahTahunIni} catatan tahun ${d.tahun}`:'';
    if(!rows.length){ tb.innerHTML='<tr><td colspan="7" class="empty-state">Belum ada catatan agenda</td></tr>'; return; }
    tb.innerHTML=rows.map(x=>`<tr><td><span class="agenda-no ${jenis==='keluar'?'out':''}">${x.nomor_urut}/${x.tahun}</span></td><td>${formatDate(x.tanggal)}</td><td class="mono">${esc(x.nomor_surat||'-')}</td><td style="max-width:180px;overflow:hidden;text-overflow:ellipsis" title="${esc(x.asal_tujuan||'')}">${esc(x.asal_tujuan||'-')}</td><td style="max-width:230px;overflow:hidden;text-overflow:ellipsis" title="${esc(x.perihal||'')}">${esc(x.perihal||'-')}</td><td>${x.nomor_arsip?`<span class="mono" style="color:var(--green-700)">${esc(x.nomor_arsip)}</span>`:'-'}</td>
      <td class="th-actions"><div class="cell-actions">${canManage()?`<button class="icon-btn" onclick="editBukuAgenda(${x.id})" title="Edit">${ICONS.edit}</button><button class="icon-btn danger" onclick="delBukuAgenda(${x.id})" title="Hapus">${ICONS.trash}</button>`:''}</div></td></tr>`).join('');
  }catch(e){ toast(e.message,'error'); }
}
function fillBgTahun(selected){
  const sel=document.getElementById('bgTahun'); if(!sel)return;
  const now=new Date().getFullYear();
  const atas=Math.max(now+1, Number(selected)||0);
  let opts=''; for(let y=atas;y>=2018;y--) opts+=`<option value="${y}">${y}</option>`;
  sel.innerHTML=opts;
  sel.value=String(Number(selected)||now);
}
async function fillBgArsip(){ const sel=document.getElementById('bgArsip'); if(!sel)return; try{ const list=await loadArsipOptions(); sel.innerHTML='<option value="">— tanpa arsip —</option>'+list.map(a=>`<option value="${a.id}">${esc(a.nomor_arsip+' — '+a.judul)}</option>`).join(''); }catch(e){} }
async function openBukuAgendaModal(x){
  const filterTahun=(()=>{ const s=document.getElementById('bgTahunFilter'); return s&&s.value?Number(s.value):null; })();
  fillBgTahun(x?Number(x.tahun):filterTahun); await fillBgArsip();
  const jenisEl=document.getElementById('bgJenis'), tahunEl=document.getElementById('bgTahun');
  jenisEl.disabled=!!x; tahunEl.disabled=!!x;
  if(x){
    document.getElementById('bgId').value=x.id; jenisEl.value=x.jenis||'masuk'; tahunEl.value=String(x.tahun);
    document.getElementById('bgTanggal').value=x.tanggal||''; document.getElementById('bgNomor').value=x.nomor_surat||'';
    document.getElementById('bgAsalTujuan').value=x.asal_tujuan||''; document.getElementById('bgPerihal').value=x.perihal||'';
    document.getElementById('bgKet').value=x.keterangan||''; document.getElementById('bgArsip').value=x.arsip_id||'';
    document.getElementById('agendaModalTitle').textContent='Edit Agenda';
  }
  else {
    document.getElementById('bgId').value=''; jenisEl.value=state.bgJenis||'masuk';
    document.getElementById('bgTanggal').value=todayLocal(); document.getElementById('bgNomor').value='';
    document.getElementById('bgAsalTujuan').value=''; document.getElementById('bgPerihal').value='';
    document.getElementById('bgKet').value=''; document.getElementById('bgArsip').value='';
    document.getElementById('agendaModalTitle').textContent='Catat Agenda';
  }
  openModal('modalBukuAgenda');
}
window.editBukuAgenda=function(id){ const x=state.bgMap[id]; if(x) openBukuAgendaModal(x); };
window.delBukuAgenda=async function(id){ if(!confirm('Hapus catatan agenda ini?'))return; try{ await api('/api/buku-agenda/'+id,{method:'DELETE'}); toast('Catatan dihapus','success'); loadBukuAgenda(); }catch(e){ toast(e.message,'error'); } };
document.getElementById('btnSimpanBukuAgenda').addEventListener('click',async()=>{
  const id=document.getElementById('bgId').value;
  const b={ jenis:document.getElementById('bgJenis').value, tahun:document.getElementById('bgTahun').value, tanggal:document.getElementById('bgTanggal').value, nomor_surat:document.getElementById('bgNomor').value.trim(), asal_tujuan:document.getElementById('bgAsalTujuan').value.trim(), perihal:document.getElementById('bgPerihal').value.trim(), keterangan:document.getElementById('bgKet').value.trim(), arsip_id:document.getElementById('bgArsip').value||null };
  if(!b.tanggal||!b.perihal){ toast('Tanggal dan perihal wajib','error'); return; }
  try{ if(id){ await api('/api/buku-agenda/'+id,{method:'PUT',body:b}); toast('Agenda diperbarui','success'); }
    else { const r=await api('/api/buku-agenda',{method:'POST',body:b}); toast('Agenda no. '+r.nomor_urut+'/'+b.tahun+' tercatat','success'); }
    closeModal('modalBukuAgenda'); loadBukuAgenda(); }catch(e){ toast(e.message,'error'); }
});

/* ============ KALENDER / AGENDA KEGIATAN ============ */
function toYMD(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function buildKalenderLayout(){ const sec=document.getElementById('page-kalender'); if(sec.dataset.built)return; sec.dataset.built=1;
  sec.innerHTML=`<div class="panel" style="padding:20px"><div class="kal-toolbar">
      <div class="kal-nav"><button class="kal-ico-btn" id="kalPrev" title="Sebelumnya">‹</button><div class="kal-title" id="kalTitle">-</div><button class="kal-ico-btn" id="kalNext" title="Berikutnya">›</button></div>
      <button class="btn btn-ghost btn-sm" id="kalToday">Hari Ini</button>
    </div>
    <div class="kal-week"><span>Min</span><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span></div>
    <div class="kal-grid" id="kalGrid"></div>
    <div class="kal-legend"><span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)"><i style="width:11px;height:11px;border-radius:3px;background:#176a54;display:inline-block"></i> Rapat</span><span><i style="background:#2aa07e"></i> Kegiatan</span><span><i style="background:#3a6eb5"></i> Verifikasi</span><span><i style="background:#c9a24b"></i> Pelayanan</span><span><i style="background:#8e44ad"></i> Sosialisasi</span><span><i style="background:#7f8c8d"></i> Lainnya</span></div>
    <div class="dash-grid" style="margin-top:18px">
      <div class="panel" style="border:1px solid var(--line)"><div class="panel-head"><div><h3 class="panel-title">Daftar Agenda</h3><p class="panel-sub">Semua kegiatan pada periode ini</p></div></div><div class="panel-body"><div id="kalList" class="kal-side"></div></div></div>
      <div class="panel" style="border:1px solid var(--line)"><div class="panel-head"><div><h3 class="panel-title">Tambah Cepat</h3><p class="panel-sub">Catat jadwal pada tanggal terpilih</p></div></div><div class="panel-body"><div id="kalQuick"></div></div></div>
    </div></div>`;
  const d=new Date(); state.kalYear=d.getFullYear(); state.kalMonth=d.getMonth(); state.selectedDay=null;
  document.getElementById('kalPrev').addEventListener('click',()=>{ state.kalMonth--; if(state.kalMonth<0){ state.kalMonth=11; state.kalYear--; } state.selectedDay=null; loadKalenderPage(); });
  document.getElementById('kalNext').addEventListener('click',()=>{ state.kalMonth++; if(state.kalMonth>11){ state.kalMonth=0; state.kalYear++; } state.selectedDay=null; loadKalenderPage(); });
  document.getElementById('kalToday').addEventListener('click',()=>{ const x=new Date(); state.kalYear=x.getFullYear(); state.kalMonth=x.getMonth(); state.selectedDay=null; loadKalenderPage(); });
}
async function loadKalenderPage(){
  const sec=document.getElementById('page-kalender'); if(!sec.dataset.built) buildKalenderLayout();
  const periode=state.kalYear+'-'+String(state.kalMonth+1).padStart(2,'0');
  document.getElementById('kalTitle').textContent=BULAN_ID[state.kalMonth]+' '+state.kalYear;
  try{
    const d=await api('/api/agenda?bulan='+periode); const rows=d.rows||[];
    state.kegMap={}; rows.forEach(r=>state.kegMap[r.id]=r); state.kegMapLoaded=true;
    renderKalGrid(rows, periode);
    renderKalList(rows);
    renderKalQuick();
  }catch(e){ toast(e.message,'error'); }
}
function renderKalGrid(rows, periode){
  const grid=document.getElementById('kalGrid'); const byDate={}; rows.forEach(r=>{ (byDate[r.tanggal]=byDate[r.tanggal]||[]).push(r); });
  const first=new Date(state.kalYear,state.kalMonth,1); const startDow=first.getDay(); const daysIn=new Date(state.kalYear,state.kalMonth+1,0).getDate();
  const todayStr=toYMD(new Date()); let h='';
  for(let i=0;i<startDow;i++){ const p=new Date(state.kalYear,state.kalMonth,1-startDow+i); h+=`<div class="kal-day other"><span class="kal-day-no">${p.getDate()}</span></div>`; }
  for(let day=1;day<=daysIn;day++){ const dateStr=periode+'-'+String(day).padStart(2,'0'); const evs=byDate[dateStr]||[]; const isToday=dateStr===todayStr;
    h+=`<div class="kal-day ${evs.length?'has':''} ${isToday?'today':''} ${state.selectedDay===dateStr?'selected':''}" data-date="${dateStr}" onclick="selectKalDay(this)" title="${dateStr}"><span class="kal-day-no">${day}</span><div class="kal-evs">${evs.slice(0,3).map(e=>`<div class="kal-ev kg-${e.tipe}" title="${esc(e.judul)}" onclick="event.stopPropagation();openKegiatanModalById(${e.id})">${esc(e.judul)}</div>`).join('')}</div></div>`; }
  grid.innerHTML=h;
}
window.selectKalDay=function(el){ if(!el)return; const dateStr=el.dataset.date; state.selectedDay=dateStr; document.querySelectorAll('#kalGrid .kal-day').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); renderKalQuick(); };
function renderKalQuick(){
  const el=document.getElementById('kalQuick'); if(!el)return;
  const dateStr=state.selectedDay||toYMD(new Date());
  el.innerHTML=`<span class="table-info" style="color:var(--green-700);font-weight:600">Tanggal: ${formatDate(dateStr)}</span>
    <input type="text" id="kqJudul" class="ctl" placeholder="Nama kegiatan / rapat">
    <div class="form-row"><select id="kqTipe" class="ctl"><option value="rapat">Rapat</option><option value="kegiatan">Kegiatan</option><option value="verifikasi">Verifikasi</option><option value="pelayanan">Pelayanan</option><option value="sosialisasi">Sosialisasi</option><option value="lainnya">Lainnya</option></select><input type="time" id="kqJam" class="ctl" title="Jam mulai"></div>
    <button id="kqSimpan" class="btn btn-primary">${ICONS.plus} Simpan Agenda</button>`;
  document.getElementById('kqSimpan').addEventListener('click',async()=>{ const judul=document.getElementById('kqJudul').value.trim(); if(!judul){ toast('Nama kegiatan wajib','error'); return; }
    try{ await api('/api/agenda',{method:'POST',body:{ judul, tanggal:dateStr, tipe:document.getElementById('kqTipe').value, jam_mulai:document.getElementById('kqJam').value||null }}); toast('Agenda ditambahkan','success'); state.kegMapLoaded=false; loadKalenderPage(); }catch(e){ toast(e.message,'error'); } });
}
function renderKalList(rows){ const el=document.getElementById('kalList'); if(!el)return;
  if(!rows.length){ el.innerHTML='<div class="empty-row">Tidak ada agenda pada periode ini</div>'; return; }
  const sorted=[...rows].sort((a,b)=>a.tanggal<b.tanggal?-1:1);
  el.innerHTML=sorted.slice(0,40).map(x=>{ const c={rapat:'#176a54',kegiatan:'#2aa07e',verifikasi:'#3a6eb5',pelayanan:'#c9a24b',sosialisasi:'#8e44ad',lainnya:'#7f8c8d'}[x.tipe]||'#7f8c8d';
    return `<div class="kg-item"><span class="kg-accent" style="background:${c}"></span><div class="kg-item-body"><strong>${esc(x.judul)}</strong><span>${formatDate(x.tanggal)}${x.jam_mulai?' · '+x.jam_mulai.slice(0,5):''}${x.jam_selesai?'–'+x.jam_selesai.slice(0,5):''}${x.lokasi?' · '+esc(x.lokasi):''}</span></div><div class="kg-item-actions">${canManage()?`<button class="icon-btn" onclick="openKegiatanModalById(${x.id})" title="Edit">${ICONS.edit}</button><button class="icon-btn danger" onclick="delKegiatan(${x.id})" title="Hapus">${ICONS.trash}</button>`:''}</div></div>`; }).join('');
}
async function populateKegMap(){ if(!state.kegMapLoaded){ const d=await api('/api/agenda?bulan='+state.kalYear+'-'+String(state.kalMonth+1).padStart(2,'0')); state.kegMap={}; (d.rows||[]).forEach(r=>state.kegMap[r.id]=r); state.kegMapLoaded=true; } }
window.openKegiatanModalById=async function(id){ try{ await populateKegMap(); }catch(e){ toast(e.message,'error'); return; }
  const x=state.kegMap[id]; if(!x){ toast('Kegiatan tidak ditemukan, memuat ulang kalender','info'); state.kegMapLoaded=false; loadKalenderPage(); return; }
  openKegiatanModal(x); };
function openKegiatanModal(x){
  if(x){ document.getElementById('kgId').value=x.id; document.getElementById('kgJudul').value=x.judul; document.getElementById('kgTanggal').value=x.tanggal; document.getElementById('kgTipe').value=x.tipe||'kegiatan'; document.getElementById('kgJamMulai').value=x.jam_mulai||''; document.getElementById('kgJamSelesai').value=x.jam_selesai||''; document.getElementById('kgLokasi').value=x.lokasi||''; document.getElementById('kgKet').value=x.keterangan||''; document.getElementById('kegiatanModalTitle').textContent='Edit Kegiatan'; }
  else { document.getElementById('kgId').value=''; document.getElementById('kgJudul').value=''; document.getElementById('kgTanggal').value=toYMD(new Date()); document.getElementById('kgTipe').value='rapat'; document.getElementById('kgJamMulai').value=''; document.getElementById('kgJamSelesai').value=''; document.getElementById('kgLokasi').value=''; document.getElementById('kgKet').value=''; document.getElementById('kegiatanModalTitle').textContent='Tambah Kegiatan'; }
  openModal('modalKegiatan');
}
window.delKegiatan=async function(id){ if(!confirm('Hapus agenda kegiatan ini?'))return; try{ await api('/api/agenda/'+id,{method:'DELETE'}); toast('Agenda dihapus','success'); state.kegMapLoaded=false; loadKalenderPage(); }catch(e){ toast(e.message,'error'); } };
document.getElementById('btnSimpanKegiatan').addEventListener('click',async()=>{ const id=document.getElementById('kgId').value;
  const b={ judul:document.getElementById('kgJudul').value.trim(), tanggal:document.getElementById('kgTanggal').value, jam_mulai:document.getElementById('kgJamMulai').value||null, jam_selesai:document.getElementById('kgJamSelesai').value||null, lokasi:document.getElementById('kgLokasi').value.trim(), tipe:document.getElementById('kgTipe').value, keterangan:document.getElementById('kgKet').value.trim() };
  if(!b.judul||!b.tanggal){ toast('Judul dan tanggal wajib','error'); return; }
  try{ if(id){ await api('/api/agenda/'+id,{method:'PUT',body:b}); toast('Kegiatan diperbarui','success'); } else { await api('/api/agenda',{method:'POST',body:b}); toast('Kegiatan ditambahkan','success'); }
    closeModal('modalKegiatan'); state.kegMapLoaded=false; loadKalenderPage(); }catch(e){ toast(e.message,'error'); }
});

/* ============ INIT ============ */
function hideSplash(){ const sp=document.getElementById('splashScreen'); if(sp) sp.classList.add('hide'); }
async function init(){
  startClock();
  document.getElementById('footerYear').textContent=new Date().getFullYear();
  buildUsersLayout();
  try{
    const [d, settings] = await Promise.all([api('/api/me'), api('/api/settings').catch(()=>null)]);
    if(settings){ state.settings=settings; applySettings(settings); }
    showApp(d.user);
    await ensureDropdowns();
    showPage('dashboard');
    setTimeout(hideSplash, 650);
  }catch(e){ hideSplash(); showLogin(); }
}
init();
setTimeout(hideSplash, 5000);