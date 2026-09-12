$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "tools\native-print-bridge\BhojPatra.NativePrintBridge.cs"
$manifest = Join-Path $root "tools\native-print-bridge\bridge.manifest"
$icon = Join-Path $root "release\assets\bhojpatra.ico"
$releaseDir = Join-Path $root "release"
$out = Join-Path $releaseDir "bhojpatra-native-bridge.exe"

$candidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework64\v3.5\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v3.5\csc.exe"
)
$csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$csc) {
  throw "Could not find the built-in .NET Framework C# compiler. Install .NET Framework 4.x or the .NET SDK."
}

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

& $csc `
  /nologo `
  /target:winexe `
  /optimize+ `
  /platform:anycpu `
  /win32manifest:$manifest `
  /win32icon:$icon `
  /out:$out `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Drawing.dll `
  /reference:System.Management.dll `
  /reference:System.ServiceProcess.dll `
  /reference:System.Web.Extensions.dll `
  $source

if ($LASTEXITCODE -ne 0) {
  throw "Native print bridge compilation failed with exit code $LASTEXITCODE."
}

& (Join-Path $root "tools\sign-windows-artifacts.ps1") -Path $out

Write-Host "Built $out"
