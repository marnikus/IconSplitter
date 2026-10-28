@echo off
rem ============================================================
rem  Icon Splitter - Build & Open through Local FTPS/SFTP Helper
rem  Builds the app, starts the local loopback helper, and opens
rem  http://127.0.0.1:47391/ so Stock FTPS (:21) + SFTP (:22)
rem  uploads and Inkscape EPS conversion work from one origin.
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

echo.
echo === Starting local FTPS helper and opening Icon Splitter ===
start "Icon Splitter - Local Helper" cmd /k node tools\bridge\server.mjs %*
timeout /t 2 >nul
start "" "http://127.0.0.1:47391/"
echo.
echo The app is open at http://127.0.0.1:47391/ - keep the helper window open.
timeout /t 5 >nul
