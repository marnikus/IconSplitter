@echo off
rem ============================================================
rem  Icon Splitter - Local FTPS/SFTP & Inkscape helper
rem  Builds the latest app bundle into dist\index.html, then
rem  starts the local loopback helper on 127.0.0.1:47391 so the
rem  browser app's "Upload" tab is always up-to-date and can
rem  transfer files over FTPS (:21) and SFTP (:22).
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

echo.
echo === Local FTPS/SFTP helper (http://127.0.0.1:47391) ===
echo Keep this window open while uploading to Shutterstock (FTPS :21) or Adobe Stock (SFTP :22).
echo.
node tools\bridge\server.mjs %*
pause
