@echo off
rem ============================================================
rem  Icon Splitter - Run as browser app THROUGH the Inkscape helper
rem  Builds the app, starts the local Inkscape helper and opens
rem  the app from the helper's own address (http://127.0.0.1:47391/),
rem  so the EPS converter "Inkscape CLI (local helper)" works with
rem  no cross-origin step at all. Keep the helper window open.
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
    echo Dependencies not installed yet - running npm install...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo.
echo === Building Icon Splitter ===
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo === Starting the Inkscape helper and opening the app ===
start "Icon Splitter - Inkscape helper" cmd /k node tools\bridge\server.mjs %*
timeout /t 2 >nul
start "" "http://127.0.0.1:47391/"
echo.
echo The app is open at http://127.0.0.1:47391/ - keep the helper window open.
echo You can close THIS window.
timeout /t 5 >nul
