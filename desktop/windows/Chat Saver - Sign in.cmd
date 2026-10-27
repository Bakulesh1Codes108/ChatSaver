@echo off
rem Opens Chat Saver's own browser window so you can sign in to your chat sites once.
cd /d "%~dp0.."
node chatsaver.mjs --login
pause
