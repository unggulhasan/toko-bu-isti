@echo off
REM Tutup Kasir -- stops the POS backend and frontend windows started by
REM buka-kasir.bat. Double-click this at the end of the day, or just close
REM both console windows manually -- either works.

title Tutup Kasir

echo Menutup kasir...
taskkill /fi "WINDOWTITLE eq POS - Backend*" /t /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq POS - Frontend*" /t /f >nul 2>&1

echo.
echo Kasir sudah ditutup.
echo.
pause
