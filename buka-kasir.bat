@echo off
REM Buka Kasir -- starts the POS backend and frontend, then opens the browser.
REM Double-click this file on the server PC to open the till for the day.
REM
REM Two console windows will appear (backend, frontend) -- leave them open while
REM the shop is running. Closing them (or running tutup-kasir.bat) stops the POS.

title Buka Kasir

echo Starting backend...
start "POS - Backend" cmd /k "cd /d %~dp0backend && uv run python main.py"

echo Starting frontend...
start "POS - Frontend" cmd /k "cd /d %~dp0frontend && npm run start"

echo Waiting for the frontend to come up...
timeout /t 8 /nobreak >nul

echo Opening browser...
start http://127.0.0.1:3000

echo.
echo Kasir sudah terbuka. Jangan tutup dua jendela hitam yang muncul --
echo itu yang menjalankan program di belakang layar.
echo.
pause
