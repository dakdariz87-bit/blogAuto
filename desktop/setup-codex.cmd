@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS first: https://nodejs.org/
  pause
  exit /b 1
)
where codex >nul 2>nul
if errorlevel 1 (
  call npm install -g @openai/codex
  if errorlevel 1 (
    echo Codex installation failed. Send only the error text.
    pause
    exit /b 1
  )
)
echo Sign in in the browser. Do not paste tokens or passwords into chat.
call codex login
pause
