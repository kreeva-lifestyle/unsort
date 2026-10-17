@echo off
rem Pack Cam agent: keeps running, restarts itself if it ever stops.
title Pack Cam
cd /d "%~dp0"
:loop
node packcam.mjs config.json
echo Pack Cam stopped - starting again in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
