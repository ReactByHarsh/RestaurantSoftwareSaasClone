$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "BhojPatra"
$targetExe = Join-Path $installDir "bhojpatra.exe"
$taskName = "BhojPatra"
$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra.lnk"

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
      $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -Command `"Start-Process -FilePath '$targetExe' -WindowStyle Hidden`""
      $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
      $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 0)
      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Runs BhojPatra local POS printer bridge." -Force | Out-Null
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

Get-BhojPatraProcesses | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Register-BhojPatraStartup

Start-Process -FilePath $targetExe -WindowStyle Hidden
Start-Sleep -Seconds 2

$health = Invoke-RestMethod -Uri "http://127.0.0.1:8181/health" -TimeoutSec 5
Write-Host "BhojPatra is running: $($health.version)"
