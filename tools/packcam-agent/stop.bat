@echo off
rem Stops Pack Cam on this PC: the hidden copy (start-hidden.vbs), any
rem start.bat window, and their camera recorders. Start it again by
rem double-clicking start-hidden.vbs, or by restarting the PC.
title Pack Cam - stop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$me = $PID; foreach ($pat in '*start-hidden.vbs*', '*start.bat*', '*packcam.mjs*') { Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $me -and $_.CommandLine -like $pat } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null } }"
echo Pack Cam is stopped. To start it again, double-click start-hidden.vbs (or restart the PC).
pause
