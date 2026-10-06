@echo off
rem ============================================================
rem  Icon Splitter - Run as browser app
rem  Builds the app and opens it in your default browser.
rem  The build output is a single self-contained HTML file
rem  (dist\index.html), so it runs with NO server.
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
echo === Opening app in your default browser ===
start "" "dist\index.html"
echo.
echo The app is running fully offline from dist\index.html
echo You can close this window.
timeout /t 5 >nul
