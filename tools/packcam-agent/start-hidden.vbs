' Pack Cam with no window. This is what the "Pack Cam" sign-in task runs
' (install-startup.bat). Double-click it to start Pack Cam by hand; stop.bat
' stops it. It keeps Pack Cam running the way start.bat does, only hidden:
' check it from DailyOffice -> Settings -> Pack Cam, or http://localhost:8765.
' A start that fails at once (no key in config.json, Node.js missing) is
' written to startup-errors.log in this folder and tried again every minute.
Option Explicit
Dim sh, fso, here, rc, began
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
Do
  began = Timer
  rc = sh.Run("cmd.exe /c node packcam.mjs config.json 1>nul 2>>startup-errors.log", 0, True)
  If rc = 3 Then Exit Do   ' Pack Cam is already running on this PC
  If Timer - began < 30 Then WScript.Sleep 60000 Else WScript.Sleep 10000
Loop
