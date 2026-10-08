@echo off
rem ============================================================
rem  Icon Splitter - Install dependencies
rem  Requires: Node.js (LTS) from https://nodejs.org/
rem  Pinned toolchain: .nvmrc + package.json "engines" (20.19+/22.12+)
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
if exist package-lock.json (
    echo Running: npm ci  ^(clean install from package-lock.json^)
    call npm ci --prefer-offline --no-audit --no-fund
) else (
    echo Running: npm install  ^(no package-lock.json found^)
    call npm install
)
if errorlevel 1 (
    echo.
    echo [ERROR] Dependency install failed. Check the messages above.
    echo         Node must satisfy package.json "engines": 20.19+ or 22.12+.
    pause
    exit /b 1
)

echo.
echo === Done. Dependencies installed into node_modules\ ===
echo     You can now run "run_app.bat" to start the app.
echo.
pause
