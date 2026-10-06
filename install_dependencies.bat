@echo off
rem ============================================================
rem  Icon Splitter - Install dependencies
rem  Requires: Node.js (LTS) from https://nodejs.org/
rem ============================================================
setlocal
cd /d "%~dp0"

echo.
echo === Icon Splitter: installing dependencies ===
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was not found on this machine.
    echo         Install the LTS version from https://nodejs.org/
    echo         then re-run this file.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do set NODE_VER=%%v
echo Using Node.js %NODE_VER%

echo.
echo Running: npm install
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check the messages above.
    pause
    exit /b 1
)

echo.
echo === Done. Dependencies installed into node_modules\ ===
echo     You can now run "run_app.bat" to start the app.
echo.
pause
