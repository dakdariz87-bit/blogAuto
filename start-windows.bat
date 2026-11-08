@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js LTS from https://nodejs.org/ and run again.
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  call npm install
  if errorlevel 1 goto fail
)
call npm start
pause
exit /b
:fail
echo Setup failed. Send the error message to your assistant.
pause
exit /b 1
