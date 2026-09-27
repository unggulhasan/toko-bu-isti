@echo off
REM Tutup Kasir -- stops the POS backend and frontend windows started by
REM buka-kasir.bat. Double-click this at the end of the day, or just close
REM both console windows manually -- either works.

title Tutup Kasir

echo Menutup kasir...

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /pid %%p /t /f >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /pid %%p /t /f >nul 2>&1
)

echo.
echo Kasir sudah ditutup.
echo.
pause
