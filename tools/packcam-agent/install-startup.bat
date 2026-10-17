@echo off
rem Makes Pack Cam start in the background (no window) every time this Windows
rem user signs in, and starts it now. Run once, as administrator.
schtasks /create /tn "Pack Cam" /tr "wscript.exe //B \"%~dp0start-hidden.vbs\"" /sc onlogon /rl highest /f
if not %errorlevel%==0 (
  echo Could not add it - right-click this file and choose "Run as administrator".
  pause
  exit /b 1
)
schtasks /run /tn "Pack Cam" >nul
echo Pack Cam now runs in the background and will start by itself when you sign in.
echo (If a black Pack Cam window is open, close it: the background copy takes over within a minute.)
echo To stop it, double-click stop.bat.
pause
