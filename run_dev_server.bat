@echo off
rem ============================================================
rem  Icon Splitter - Development server (live reload)
rem  Starts the Vite dev server and opens the browser at
rem  http://localhost:5173/  - useful while editing code.
rem  Press Ctrl+C in this window to stop the server.
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
echo === Starting dev server (Ctrl+C to stop) ===
rem Open the browser a few seconds after the server starts.
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:5173/"
call npm run dev
