@echo off
rem ============================================================
rem  Icon Splitter - Inkscape EPS & FTPS/SFTP helper
rem  Builds the latest app bundle into dist\index.html, replaces
rem  any older helper on 127.0.0.1:47391, and starts the helper
rem  for Inkscape EPS conversion + Stock FTPS (:21) / SFTP (:22).
rem ============================================================
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found on this machine.
    echo         Install the LTS version from https://nodejs.org/
    echo         then re-run this file.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Dependencies not installed yet - running npm run setup...
    call npm run setup
    if errorlevel 1 (
        echo [ERROR] npm run setup failed.
        pause
        exit /b 1
    )
)

echo.
echo === Building latest Icon Splitter UI ===
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr "127.0.0.1:47391" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>nul
)

echo.
echo === Inkscape & FTPS/SFTP helper (http://127.0.0.1:47391) ===
echo Keep this window open while exporting EPS or uploading to stock servers.
echo.
node tools\bridge\server.mjs %*
pause
