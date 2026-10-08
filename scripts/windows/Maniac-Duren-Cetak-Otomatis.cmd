@echo off
setlocal DisableDelayedExpansion
title Maniac Duren - Cetak Otomatis

rem Jalankan di komputer kasir Windows. Tidak perlu Run as administrator.
rem Nama printer harus sama persis dengan nama di Printers and scanners.
set "MD_POS_EXPECTED_PRINTER=POS-80C"
set "MD_POS_CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "MD_POS_CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined MD_POS_CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "MD_POS_CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined MD_POS_CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "MD_POS_CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined MD_POS_CHROME goto chrome_missing
if not defined LOCALAPPDATA goto profile_missing

echo Memeriksa printer default Windows...
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; try { $printers=@(Get-CimInstance -ClassName Win32_Printer -Filter 'Default=True'); if($printers.Count -ne 1) { Write-Host 'Belum ada satu printer default Windows yang dapat dipakai.'; exit 2 }; $printer=$printers[0]; Write-Host ('Printer default: '+$printer.Name); if($printer.Name -ne $env:MD_POS_EXPECTED_PRINTER) { Write-Host ('Jadikan '+$env:MD_POS_EXPECTED_PRINTER+' sebagai printer default terlebih dahulu.'); exit 3 }; if($printer.WorkOffline) { Write-Host 'Printer dalam mode offline. Aktifkan printer terlebih dahulu.'; exit 4 }; exit 0 } catch { Write-Host ('Tidak dapat memeriksa printer: '+$_.Exception.Message); exit 5 }"
if errorlevel 1 goto printer_not_ready

echo Membuka POS dengan cetak otomatis ke %MD_POS_EXPECTED_PRINTER%...
start "Maniac Duren POS" "%MD_POS_CHROME%" "--user-data-dir=%LOCALAPPDATA%\ManiacDuren\Chrome-Cetak-Otomatis" --no-first-run --no-default-browser-check --kiosk-printing --use-system-default-printer --app="https://maniacduren.com/pos/"
if errorlevel 1 goto launch_failed
exit /b 0

:printer_not_ready
echo.
echo Buka Settings ^> Printers and scanners.
echo Matikan Let Windows manage my default printer.
echo Pilih %MD_POS_EXPECTED_PRINTER% ^> Set as default, lalu jalankan file ini lagi.
echo Jika nama printer berbeda, ubah MD_POS_EXPECTED_PRINTER di awal file ini.
pause
exit /b 1

:chrome_missing
echo Google Chrome tidak ditemukan pada lokasi instalasi standar.
echo Pasang Google Chrome, atau sesuaikan lokasi chrome.exe dalam file ini.
pause
exit /b 1

:profile_missing
echo Folder LOCALAPPDATA Windows tidak tersedia. Jalankan dari akun Windows biasa.
pause
exit /b 1

:launch_failed
echo POS gagal dibuka. Periksa instalasi Chrome dan coba lagi.
pause
exit /b 1
