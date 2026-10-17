# Stops Pack Cam on this PC: the background copy (start-hidden.vbs), any
# start.bat window, the agent and its camera recorders. Only processes that
# belong to this folder (and the recorders writing into its data folder) are
# touched. Used by stop.bat and by install-startup.ps1 (-Quiet).
param([switch]$Quiet)
# Native commands write to stderr (taskkill: "not found"); never stop on that.
$ErrorActionPreference = 'Continue'
$dir = [WildcardPattern]::Escape($PSScriptRoot.TrimEnd('\') + '\')
$seg = $null
try {
  $data = (Get-Content -Raw (Join-Path $PSScriptRoot 'config.json') | ConvertFrom-Json).data_dir
  if ($data) { $seg = [WildcardPattern]::Escape(($data -replace '/', '\').TrimEnd('\') + '\segments') }
} catch { }

function Find-PackCam {
  Get-CimInstance Win32_Process | Where-Object {
    $c = [string]$_.CommandLine
    $_.ProcessId -ne $PID -and (
      (($_.Name -in @('wscript.exe', 'cmd.exe')) -and ($c -like "*${dir}start-hidden.vbs*" -or $c -like "*${dir}start.bat*")) -or
      ($_.Name -eq 'node.exe' -and $c -like '*packcam.mjs*') -or
      ($seg -and $_.Name -eq 'ffmpeg.exe' -and $c -like "*$seg*"))
  }
}

# Runners first (so nothing restarts the agent), then the agent, then recorders.
foreach ($round in 1..2) {
  foreach ($p in (Find-PackCam | Sort-Object { @{ 'wscript.exe' = 0; 'cmd.exe' = 1; 'node.exe' = 2 }[$_.Name] })) {
    & taskkill.exe /PID $p.ProcessId /T /F 2>&1 | Out-Null
  }
  Start-Sleep -Seconds 1
}
$left = @(Find-PackCam)
if ($left.Count) {
  Write-Host 'Pack Cam could not be stopped completely (no permission).'
  Write-Host 'Right-click stop.bat and choose "Run as administrator".'
  exit 1
}
if (-not $Quiet) { Write-Host 'Pack Cam is stopped. To start it again, double-click start-hidden.vbs (or restart the PC).' }
exit 0
