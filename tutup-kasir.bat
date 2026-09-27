@echo off
REM Tutup Kasir -- stops the POS backend and frontend windows started by
REM buka-kasir.bat. Double-click this at the end of the day, or just close
REM both console windows manually -- either works.
REM
REM Killing by window title (WINDOWTITLE eq) doesn't work here: uv/npm often
REM change the console title once they start running, so taskkill's filter
REM stops matching. Killing the PID listening on the port directly doesn't
REM work either: that PID is several levels below the console window in the
REM process tree (cmd.exe -> uv/npm -> python/node), and taskkill /t only
REM kills descendants, never ancestors -- so the window survives even though
REM the app underneath it is dead. stop-kasir.ps1 finds the listening PID,
REM walks UP to the cmd.exe window that owns it, and kills that whole tree.

title Tutup Kasir

echo Menutup kasir...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-kasir.ps1"

echo.
echo Kasir sudah ditutup.
echo.
pause
