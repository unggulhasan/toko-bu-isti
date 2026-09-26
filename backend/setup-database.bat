@echo off
REM Setup Database -- creates the .fdb file and applies the schema.
REM Run this ONCE on a fresh server PC, after configuring backend\.env and
REM before the first buka-kasir.bat. Safe to re-run: it refuses to touch a
REM database that already exists.

cd /d %~dp0

echo Step 1/3: creating the database file...
uv run python -m app.create_db
if errorlevel 1 goto :error

echo.
echo Step 2/3: applying the schema...
uv run python -m app.schema_bootstrap
if errorlevel 1 goto :error

echo.
echo Step 3/3: verifying...
uv run python -m app.healthcheck
if errorlevel 1 goto :error

echo.
echo Database is ready. You can now run buka-kasir.bat.
pause
exit /b 0

:error
echo.
echo Setup failed -- see the error above.
pause
exit /b 1
