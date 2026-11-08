@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version, then double-click this file again.
  start "" https://nodejs.org/
  pause
  exit /b 1
)
node launcher.cjs
if errorlevel 1 pause
