@echo off
setlocal
cd /d "%~dp0"
set "BLOGAUTO_RUNTIME_ROOT=%LOCALAPPDATA%\DakdarizBlogAuto\runtime"
set "BLOGAUTO_USER_DATA=%LOCALAPPDATA%\DakdarizBlogAuto\app-data"
where node >nul 2>nul
if errorlevel 1 goto neednode
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)"
if errorlevel 1 goto neednode
echo [1/4] Checking packages. First setup can take several minutes.
if not exist node_modules\electron\dist\electron.exe (
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto failed
)
echo [2/4] Preparing the test profile.
node scripts\seed-test-profile.cjs
if errorlevel 1 goto failed
echo [3/4] Checking Codex CLI. No AI request is made here.
where codex >nul 2>nul
if errorlevel 1 (
  echo Codex CLI was not found. The app can open, but generation needs Codex login.
  echo Open the README for installation and login steps.
)
echo [4/4] Opening the desktop application.
call npm start
if errorlevel 1 goto failed
exit /b 0
:neednode
echo Install Node.js 24 LTS or newer from https://nodejs.org/ then run again.
pause
exit /b 1
:failed
echo Setup or startup failed. Send the error text without passwords or tokens.
pause
exit /b 1
