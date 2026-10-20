@echo off
cd /d "%~dp0"

echo ==========================================
echo   SISTEM ARSIP - KANTOR PERTANAHAN
echo ==========================================
echo.

if not exist node_modules (
  echo Menginstall dependensi pertama kali...
  call npm install
  if errorlevel 1 (
    echo Gagal install. Pastikan Node.js 22.5+ terpasang.
    pause
    exit /b 1
  )
)

if not exist data\arsip.db (
  echo Inisialisasi database...
  call npm run init-db
)

echo.
echo Memulai server... buka http://localhost:3000 di browser
echo (Tekan Ctrl+C untuk menghentikan)
echo.
call npm start