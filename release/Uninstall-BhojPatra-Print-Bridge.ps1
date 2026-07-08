$ErrorActionPreference = "SilentlyContinue"

Unregister-ScheduledTask -TaskName "BhojPatra Print Bridge" -Confirm:$false
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra Print Bridge.lnk") -Force

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
  $_.CommandLine -match "print-bridge|BhojPatra-Print-Bridge|bhojpatra.exe"
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
}
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA "BhojPatra") -Recurse -Force

Write-Host "BhojPatra removed."
