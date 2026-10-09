@echo off
rem ============================================================
rem  Icon Splitter - Inkscape EPS helper
rem  Starts the local helper that lets the browser app run
rem  Inkscape on THIS machine (SVG to upload -> EPS converter
rem  "Inkscape CLI (local helper)"). Listens on 127.0.0.1:47391
rem  only. Keep this window open while exporting; Ctrl+C stops it.
rem  Inkscape 1.x must be installed (https://inkscape.org) or
rem  set INKSCAPE_PATH to inkscape.com.
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
echo === Inkscape helper (http://127.0.0.1:47391) ===
echo Keep this window open while exporting EPS through Inkscape.
echo.
node tools\bridge\server.mjs %*
pause
