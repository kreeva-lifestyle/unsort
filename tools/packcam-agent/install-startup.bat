@echo off
rem Starts Pack Cam every time this Windows user signs in (run once).
schtasks /create /tn "Pack Cam" /tr "\"%~dp0start.bat\"" /sc onlogon /rl highest /f
if %errorlevel%==0 (echo Pack Cam will now start when you sign in.) else (echo Could not add it - right-click this file and choose "Run as administrator".)
pause
