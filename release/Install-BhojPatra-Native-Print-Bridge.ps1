$ErrorActionPreference = "Stop"

$sourceExe = Join-Path $PSScriptRoot "bhojpatra-native-bridge.exe"
if (!(Test-Path $sourceExe)) {
  throw "bhojpatra-native-bridge.exe was not found next to this installer. Run tools\build-native-print-bridge.ps1 first."
}
$sourceUninstall = Join-Path $PSScriptRoot "Uninstall-BhojPatra-Native-Print-Bridge.ps1"
$sourceReadme = Join-Path $PSScriptRoot "README-BhojPatra-Native-Print-Bridge.txt"

$installDir = Join-Path $env:LOCALAPPDATA "BhojPatra"
$targetExe = Join-Path $installDir "bhojpatra-native-bridge.exe"
$targetUninstall = Join-Path $installDir "Uninstall-BhojPatra-Native-Print-Bridge.ps1"
$targetReadme = Join-Path $installDir "README-BhojPatra-Native-Print-Bridge.txt"
$taskName = "BhojPatra Native Print Bridge"
$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra Native Print Bridge.lnk"
$startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "BhojPatra"
$currentPid = $PID

function Get-BhojPatraProcesses {
  try {
    if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
      return @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.ProcessId -ne $currentPid -and (
          $_.Name -ieq "bhojpatra.exe" -or
          $_.Name -ieq "bhojpatra-native-bridge.exe" -or
          $_.Name -ieq "BhojPatra-Print-Bridge.exe" -or
          $_.CommandLine -match "tools[\\/]+print-bridge|pnpm(.+)?print-bridge"
        )
      })
    }
  } catch {}
  try {
    return @(Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object {
      $_.ProcessId -ne $currentPid -and (
        $_.Name -ieq "bhojpatra.exe" -or
        $_.Name -ieq "bhojpatra-native-bridge.exe" -or
        $_.Name -ieq "BhojPatra-Print-Bridge.exe" -or
        $_.CommandLine -match "tools[\\/]+print-bridge|pnpm(.+)?print-bridge"
      )
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
      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Runs the native BhojPatra local POS printer bridge." -Force | Out-Null
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

function New-BhojPatraShortcut($path, $targetPath, $arguments, $workingDirectory) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($path)
  $shortcut.TargetPath = $targetPath
  if ($arguments) { $shortcut.Arguments = $arguments }
  if ($workingDirectory) { $shortcut.WorkingDirectory = $workingDirectory }
  $shortcut.WindowStyle = 7
  $shortcut.Save()
}

function Install-BhojPatraShortcuts {
  New-Item -ItemType Directory -Path $startMenuDir -Force | Out-Null
  New-BhojPatraShortcut `
    (Join-Path $startMenuDir "Start Native Print Bridge.lnk") `
    $targetExe `
    "" `
    $installDir
  New-BhojPatraShortcut `
    (Join-Path $startMenuDir "Bridge Health Check.lnk") `
    "http://127.0.0.1:8181/health" `
    "" `
    ""
  New-BhojPatraShortcut `
    (Join-Path $startMenuDir "Bridge Diagnostics.lnk") `
    "http://127.0.0.1:8181/diagnostics" `
    "" `
    ""
  if (Test-Path $targetUninstall) {
    New-BhojPatraShortcut `
      (Join-Path $startMenuDir "Uninstall Native Print Bridge.lnk") `
      "powershell.exe" `
      "-NoProfile -ExecutionPolicy Bypass -File `"$targetUninstall`"" `
      $installDir
  }
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Unregister-ScheduledTask -TaskName "BhojPatra" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "BhojPatra Print Bridge" -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) "BhojPatra Print Bridge.lnk") -Force -ErrorAction SilentlyContinue
Get-BhojPatraProcesses | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force
if (Test-Path $sourceUninstall) {
  Copy-Item -LiteralPath $sourceUninstall -Destination $targetUninstall -Force
}
if (Test-Path $sourceReadme) {
  Copy-Item -LiteralPath $sourceReadme -Destination $targetReadme -Force
}
Register-BhojPatraStartup
Install-BhojPatraShortcuts

$process = Start-Process -FilePath $targetExe -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8181/health" -TimeoutSec 5
  Write-Host ""
  Write-Host "BhojPatra Native Print Bridge installed and running." -ForegroundColor Green
  Write-Host "Bridge URL: http://127.0.0.1:8181"
  Write-Host "Status: $($health.service) $($health.version)"
  Write-Host "Diagnostics: http://127.0.0.1:8181/diagnostics"
} catch {
  Write-Host ""
  Write-Host "Installed, but the health check did not respond yet." -ForegroundColor Yellow
  Write-Host "Restart the PC or run this installer again. Error: $($_.Exception.Message)"
}

Start-Process "http://127.0.0.1:8181/diagnostics"
