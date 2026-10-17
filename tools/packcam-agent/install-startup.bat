@echo off
rem Makes Pack Cam run in the background (no window) and start by itself every
rem time this Windows user signs in; starts it now (see install-startup.ps1).
rem Run once, as administrator; again after replacing the program files.
title Pack Cam - install
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-startup.ps1"
pause
