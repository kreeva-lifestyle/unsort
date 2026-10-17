# Run once, as administrator (install-startup.bat). Stops any Pack Cam that is
# running (a start.bat window, an older version), then makes Pack Cam run in the
# background with no window: a "Pack Cam" task that starts start-hidden.vbs
# when this user signs in, with no time limit (the schtasks default stops a
# task after 3 days) and without admin rights (so stop.bat can stop it).
# Starts it right away.
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host 'Right-click install-startup.bat and choose "Run as administrator".'; exit 1 }
$dir = $PSScriptRoot
& (Join-Path $dir 'stop.ps1') -Quiet
if ($LASTEXITCODE -eq 1) { exit 1 }
$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B "' + (Join-Path $dir 'start-hidden.vbs') + '"') -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Pack Cam' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'Pack Cam'
Write-Host 'Pack Cam now runs in the background (no window) and starts by itself when you sign in.'
Write-Host 'Check it in DailyOffice: Settings -> Pack Cam. To stop it, double-click stop.bat.'
