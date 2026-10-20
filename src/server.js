const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

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
  console.error('Server error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Terjadi kesalahan server' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('============================================');
  console.log('  SISTEM ARSIP — KANTOR PERTANAHAN');
  console.log('============================================');
  console.log(`  Server : http://localhost:${PORT}`);
  console.log('  Login  : admin / password123');
  console.log('============================================');
});

process.on('SIGINT', () => {
  console.log('\nMenghentikan server...');
  process.exit(0);
});