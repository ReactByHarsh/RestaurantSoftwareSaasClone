$ErrorActionPreference = "SilentlyContinue"
$currentPid = $PID

Unregister-ScheduledTask -TaskName "BhojPatra" -Confirm:$false
Unregister-ScheduledTask -TaskName "BhojPatra Print Bridge" -Confirm:$false
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra.lnk") -Force
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
  $_.ProcessId -ne $currentPid -and (
    $_.Name -ieq "bhojpatra.exe" -or
    $_.Name -ieq "BhojPatra-Print-Bridge.exe" -or
    $_.CommandLine -match "tools[\\/]+print-bridge|pnpm(.+)?print-bridge"
  )
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force
}

Start-Sleep -Milliseconds 900
