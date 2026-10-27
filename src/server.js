const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Buat database + data awal otomatis saat pertama kali dijalankan
const dbFile = path.join(dataDir, 'arsip.db');
if (!fs.existsSync(dbFile)) {
  console.log('Database belum ada — menyiapkan database dan data awal...');
  require('./db/init');
}

const apiRoutes = require('./routes/api');

app.disable('x-powered-by');

// Header keamanan dasar (setara helmet ringan)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Session secret: persisten di disk agar relogin tidak hilang saat restart
const secretFile = path.join(dataDir, '.session-secret');
let secret;
try { secret = fs.readFileSync(secretFile, 'utf8').trim(); } catch (e) { /* belum ada */ }
if (!secret) { secret = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, secret); }

app.use(session({
  secret,
  resave: false,
  saveUninitialized: false,
  name: 'bsa.sid',
  cookie: {
    maxAge: 12 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false, // lokal via http
    sameSite: 'lax'
  }
}));

app.use('/api', apiRoutes);

// Penanganan error global → JSON
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400))) {
    return res.status(400).json({ error: 'Format data yang dikirim tidak valid' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Data yang dikirim terlalu besar' });
  }
  console.error('Server error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status < 500 ? (err.message || 'Permintaan tidak valid') : 'Terjadi kesalahan server' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const server = app.listen(PORT, HOST, () => {
  const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log('============================================');
  console.log('  SISTEM ARSIP — KANTOR PERTANAHAN');
  console.log('============================================');
  console.log(`  Server : ${url}`);
  console.log('  Login  : admin / password123');
  console.log('============================================');
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} sudah dipakai. Hentikan proses lain atau jalankan dengan PORT lain, misal: PORT=3001 npm start`);
    process.exit(1);
  }
  throw err;
});

function shutdown() {
  console.log('\nMenghentikan server...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);