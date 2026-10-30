@echo off
rem ============================================================
rem  Icon Splitter - Run as browser app THROUGH the local helper
rem  Builds the latest app, replaces any older helper on
rem  127.0.0.1:47391, and opens http://127.0.0.1:47391/.
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
echo === Building Icon Splitter ===
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":47391 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>nul
)

echo.
echo === Starting the local helper and opening the app ===
start "Icon Splitter - Local Helper" cmd /k node tools\bridge\server.mjs %*
timeout /t 2 >nul
start "" "http://127.0.0.1:47391/"
echo.
echo The app is open at http://127.0.0.1:47391/ - keep the helper window open.
echo You can close THIS window.
timeout /t 5 >nul
