@echo off
rem Chat Saver for Windows: paste a chat link (or pass links as arguments / drop them here).
setlocal
title Chat Saver
cd /d "%~dp0.."
where node >nul 2>nul || (
  echo.
  echo   Node.js is not installed. Run "Install Chat Saver.ps1" first.
  echo.
  pause & exit /b 1
)
if not exist "node_modules\playwright-core" (
  echo   First run: installing Chat Saver ^(one time^)...
  call npm install --no-audit --no-fund --silent || (echo   npm install failed. & pause & exit /b 1)
)
node chatsaver.mjs %*
echo.
pause
