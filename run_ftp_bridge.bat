@echo off
rem ============================================================
rem  Icon Splitter - Local FTPS/SFTP & Inkscape helper
rem  Builds the latest app bundle into dist\index.html, stops any
rem  older helper on 127.0.0.1:47391, and starts the fresh helper
rem  so the "Upload" tab always has Shutterstock FTPS (:21) and
rem  Adobe Stock SFTP (:22). It also restarts itself when a `git pull`
rem  brings new helper code, so an update never needs the window closed.
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
echo === Building latest Icon Splitter UI ===
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
echo === Local FTPS/SFTP helper (http://127.0.0.1:47391) ===
echo Keep this window open while uploading to Shutterstock (FTPS :21), Adobe Stock (SFTP :22)
echo or Getty Images (web upload).
echo Getty web sign-in: run  run_ftp_bridge.bat --getty-headed  once to watch the browser,
echo   run  run_ftp_bridge.bat --getty-check  to test the Getty browser on its own,
echo   run  run_ftp_bridge.bat --getty-reset --getty-profile "%LOCALAPPDATA%\IconSplitter\getty-profile"  to free a stuck profile.
echo   add  --getty-profile "%LOCALAPPDATA%\IconSplitter\getty-profile"  to keep that sign-in.
echo.
rem The launcher keeps the helper alive: when a `git pull` changes the
rem helper's own code it restarts itself here with the new build (no window
rem to close), and it never restarts while an upload is moving. A pull that
rem changes only the APP is rebuilt in place by the helper, and the open
rem page reloads itself onto the new bundle -- no F5, no window to close.
rem --build: a restart is a FULL restart — the app bundle is rebuilt first, then
rem the helper starts on the new code, with the same flags this window got
rem (--getty-headed, --getty-profile ...).
node tools\bridge\supervise.mjs --build %*
pause
