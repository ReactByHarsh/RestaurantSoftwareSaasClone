param(
  [string]$Target = "",
  [string]$Config = "",
  [string]$Bundles = "nsis",
  [string]$SigningKeyPath = "$env:USERPROFILE\.tauri\bhojpatra-updater.key",
  [AllowEmptyString()]
  [string]$SigningKeyPassword = "",
  [switch]$RequireAuthenticodeSigning
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $SigningKeyPath)) {
  throw "Updater signing key not found: $SigningKeyPath"
}

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $SigningKeyPath

if ($PSBoundParameters.ContainsKey("SigningKeyPassword")) {
  if ($SigningKeyPassword -eq "") {
    Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $SigningKeyPassword
  }
}

$arguments = @("tauri", "build", "--ci")

if ($Bundles) {
  $arguments += @("--bundles", $Bundles)
}
if ($Target) {
  $arguments += @("--target", $Target)
}
if ($Config) {
  $arguments += @("-c", $Config)
}

Write-Host "Running: cargo $($arguments -join ' ')"
& cargo @arguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$targetRoot = Join-Path $PSScriptRoot "..\src-tauri\target"
$targetDirectory = if ($Target) {
  Join-Path $targetRoot (Join-Path $Target "release")
} else {
  Join-Path $targetRoot "release"
}
$authenticodeScript = Join-Path $PSScriptRoot "..\..\..\tools\sign-windows-artifacts.ps1"
$windowsArtifacts = @()
if (Test-Path -LiteralPath $targetDirectory) {
  $windowsArtifacts = @(Get-ChildItem -LiteralPath $targetDirectory -Recurse -File -Filter *.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "[\\/]node_modules[\\/]" })
}
if ($windowsArtifacts.Count -gt 0) {
  & $authenticodeScript -Path ($windowsArtifacts | ForEach-Object { $_.FullName }) -RequireAuthenticodeSigning:$RequireAuthenticodeSigning
}
