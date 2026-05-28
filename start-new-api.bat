@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-new-api.ps1"
pause
