@echo off
REM Perbarui Kasir -- rebuilds the backend/frontend after the app's code has
REM been updated on this PC (e.g. new files copied in). Does NOT pull from
REM git -- that's assumed to have happened separately, or not apply here.
REM
REM Stops the till first (rebuilding while npm run start still holds the old
REM .next build open doesn't take effect), reinstalls dependencies, and
REM rebuilds the frontend. Run buka-kasir.bat afterwards to reopen the till.

title Perbarui Kasir

echo Menutup kasir sebelum memperbarui...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-kasir.ps1"

echo.
echo Memperbarui backend...
cd /d "%~dp0backend"
call uv sync
if errorlevel 1 (
    echo.
    echo Gagal memperbarui backend. Perbarui dibatalkan.
    echo.
    pause
    exit /b 1
)

echo.
echo Memperbarui frontend...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo.
    echo Gagal menjalankan npm install. Perbarui dibatalkan.
    echo.
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo.
    echo Gagal build frontend. Perbarui dibatalkan.
    echo.
    pause
    exit /b 1
)

echo.
echo Kasir sudah diperbarui. Jalankan buka-kasir.bat untuk membuka kasir.
echo.
pause
