# Sistem Arsip - Kantor Pertanahan (Windows PowerShell launcher)
Set-Location $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  SISTEM ARSIP - KANTOR PERTANAHAN" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (-not (Test-Path 'node_modules')) {
    Write-Host "Menginstall dependensi pertama kali..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Gagal install. Pastikan Node.js 22.5+ terpasang." -ForegroundColor Red
        Read-Host "Tekan Enter untuk keluar"
        exit 1
    }
}

if (-not (Test-Path 'data\arsip.db')) {
    Write-Host "Inisialisasi database..." -ForegroundColor Yellow
    npm run init-db
}

Write-Host ""
Write-Host "Memulai server... buka http://localhost:3000 di browser" -ForegroundColor Green
Write-Host "(Tekan Ctrl+C untuk menghentikan)" -ForegroundColor DarkGray
Write-Host ""
npm start