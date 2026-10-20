' Pack Cam with no window. This is what the "Pack Cam" sign-in task runs
' (install-startup.bat). Double-click it to start Pack Cam by hand; stop.bat
' stops it. It keeps Pack Cam running the way start.bat does, only hidden:
' check it from DailyOffice -> Settings -> Pack Cam, or http://localhost:8765.
' If Pack Cam is already running (a start.bat window), it waits and takes
' over when that one stops. A start that fails at once (Node.js
' missing) is written to startup-errors.log in this
' folder and tried again every minute.
Option Explicit
Dim sh, fso, here, rc, began
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
Do
  began = Now
  rc = sh.Run("cmd.exe /c node packcam.mjs config.json 1>nul 2>>startup-errors.log", 0, True)
  ' 3: another Pack Cam is running; anything quick: a start that failed.
  If rc = 3 Or DateDiff("s", began, Now) < 30 Then WScript.Sleep 60000 Else WScript.Sleep 10000
Loop
