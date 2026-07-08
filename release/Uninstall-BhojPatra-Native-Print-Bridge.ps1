$ErrorActionPreference = "SilentlyContinue"

Unregister-ScheduledTask -TaskName "BhojPatra Native Print Bridge" -Confirm:$false
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra Native Print Bridge.lnk") -Force
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Programs")) "BhojPatra") -Recurse -Force

function Get-BhojPatraProcesses {
  try {
    if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
      return @(Get-CimInstance Win32_Process -ErrorAction Stop)
    }
  } catch {}
  try {
    return @(Get-WmiObject Win32_Process -ErrorAction Stop)
  } catch {
    return @()
  }
}

Get-BhojPatraProcesses | Where-Object {
  $_.Name -ieq "bhojpatra-native-bridge.exe" -or $_.CommandLine -match "bhojpatra-native-bridge.exe"
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
}

Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "BhojPatra\bhojpatra-native-bridge.exe") -Force
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "BhojPatra\README-BhojPatra-Native-Print-Bridge.txt") -Force
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "BhojPatra\Uninstall-BhojPatra-Native-Print-Bridge.ps1") -Force
Write-Host "BhojPatra Native Print Bridge removed."
