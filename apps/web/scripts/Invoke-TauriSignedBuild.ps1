param(
  [string]$Target = "",
  [string]$Config = "",
  [string]$Bundles = "nsis",
  [string]$SigningKeyPath = "$env:USERPROFILE\.tauri\bhojpatra-updater.key",
  [AllowEmptyString()]
  [string]$SigningKeyPassword = ""
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
