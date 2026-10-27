@echo off
rem ============================================================
rem  Icon Splitter - Local FTPS & Inkscape helper
rem  Starts the local loopback helper on 127.0.0.1:47391 so the
rem  browser app's "Upload" tab can transfer files over Explicit
rem  FTPS (e.g. ftps.shutterstock.com:21). Keep this window open
rem  while uploading; Ctrl+C stops it.
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

echo.
echo === Local FTPS helper (http://127.0.0.1:47391) ===
echo Keep this window open while uploading to stock FTPS servers.
echo.
node tools\bridge\server.mjs %*
pause
