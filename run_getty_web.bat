@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it and run install_dependencies.bat first.
  pause
  exit /b 1
)
if not exist "node_modules\playwright" (
  echo Install dependencies first with install_dependencies.bat.
  pause
  exit /b 1
)
echo Getty web helper: sign in yourself in the opened browser.
echo First use requires: npx playwright install chromium
echo.
node tools\getty-web\run.mjs
pause
