$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "release"
$bridgeExe = Join-Path $releaseDir "bhojpatra-native-bridge.exe"
$setupSource = Join-Path $root "tools\native-print-bridge\BhojPatra.NativePrintBridgeSetup.cs"
$setupManifest = Join-Path $root "tools\native-print-bridge\setup.manifest"
$setupExe = Join-Path $releaseDir "BhojPatra-Native-Print-Bridge-Setup.exe"

& (Join-Path $root "tools\build-native-print-bridge.ps1")

$candidates = @(
  "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
  "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$csc = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (!$csc) {
  throw "Could not find the built-in .NET Framework 4 C# compiler."
}

& $csc `
  /nologo `
  /target:winexe `
  /optimize+ `
  /platform:anycpu `
  /win32manifest:$setupManifest `
  /out:$setupExe `
  /resource:$bridgeExe,BhojPatra.NativePrintBridge.exe `
  /reference:System.dll `
  /reference:System.Core.dll `
  /reference:System.Windows.Forms.dll `
  $setupSource

if ($LASTEXITCODE -ne 0 -or !(Test-Path $setupExe)) {
  throw "Native setup compilation failed with exit code $LASTEXITCODE."
}

Write-Host "Built $setupExe"
