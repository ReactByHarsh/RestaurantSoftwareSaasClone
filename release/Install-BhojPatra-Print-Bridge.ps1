$ErrorActionPreference = "Stop"

$sourceExe = Join-Path $PSScriptRoot "bhojpatra.exe"
if (!(Test-Path $sourceExe)) {
  throw "bhojpatra.exe was not found next to this installer."
}

$installDir = Join-Path $env:LOCALAPPDATA "BhojPatra"
$targetExe = Join-Path $installDir "bhojpatra.exe"
$taskName = "BhojPatra Print Bridge"
$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra Print Bridge.lnk"

function Get-BhojPatraProcesses {
  try {
    if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
      return @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.CommandLine -match "print-bridge|BhojPatra-Print-Bridge|bhojpatra.exe"
      })
    }
  } catch {}
  try {
    return @(Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object {
      $_.CommandLine -match "print-bridge|BhojPatra-Print-Bridge|bhojpatra.exe"
    })
  } catch {
    return @()
  }
}

function Register-BhojPatraStartup {
  try {
    if (
      (Get-Command New-ScheduledTaskAction -ErrorAction SilentlyContinue) -and
      (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)
    ) {
      $action = New-ScheduledTaskAction -Execute $targetExe
      $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)
      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Runs the local BhojPatra POS printer bridge for USB, LAN, and Bluetooth receipt printers." -Force | Out-Null
      return
    }
  } catch {
    Write-Host "Scheduled Task registration failed; using Startup shortcut fallback. $($_.Exception.Message)" -ForegroundColor Yellow
  }

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($startupShortcut)
  $shortcut.TargetPath = $targetExe
  $shortcut.WorkingDirectory = $installDir
  $shortcut.WindowStyle = 7
  $shortcut.Save()
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null

Get-BhojPatraProcesses | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force

Register-BhojPatraStartup

$process = Start-Process -FilePath $targetExe -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8181/health" -TimeoutSec 5
  Write-Host ""
  Write-Host "BhojPatra installed and running." -ForegroundColor Green
  Write-Host "Bridge URL: http://127.0.0.1:8181"
  Write-Host "Status: $($health.service) $($health.version)"
} catch {
  Write-Host ""
  Write-Host "Installed, but the health check did not respond yet." -ForegroundColor Yellow
  Write-Host "Restart the PC or run this installer again. Error: $($_.Exception.Message)"
}

Start-Process "http://127.0.0.1:8181/health"
