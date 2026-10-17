@echo off
rem Stops Pack Cam on this PC (see stop.ps1). Start it again by double-clicking
rem start-hidden.vbs, or by restarting the PC.
title Pack Cam - stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
pause
