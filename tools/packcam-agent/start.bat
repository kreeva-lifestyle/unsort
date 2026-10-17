@echo off
rem Pack Cam agent: keeps running, restarts itself if it ever stops.
title Pack Cam
cd /d "%~dp0"
:loop
node packcam.mjs config.json
if %errorlevel%==3 goto running
echo Pack Cam stopped - starting again in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
:running
echo.
echo Pack Cam is already running on this PC - nothing else to do. You can close this window.
pause
