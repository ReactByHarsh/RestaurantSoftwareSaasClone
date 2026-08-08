param(
  [string]$Version = "0.1.17",
  [string]$Bucket = "bhojpatra",
  [string]$PublicBaseUrl = "https://pub-99fc5ebb1fb24ce9a69d861fc420f8b2.r2.dev",
  [string]$SigningKeyPath = "$env:USERPROFILE\.tauri\bhojpatra-updater.key",
  [string]$SigningKeyPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$webDir = Join-Path $repoRoot "apps\web"
$tauriConfigPath = Join-Path $webDir "src-tauri\tauri.conf.json"
$tauriWindows7ConfigPath = Join-Path $webDir "src-tauri\tauri.windows7.conf.json"
$x64BundleDir = Join-Path $webDir "src-tauri\target\release\bundle\nsis"
$x86BundleDir = Join-Path $webDir "src-tauri\target\i686-pc-windows-msvc\release\bundle\nsis"
$x64SourceInstaller = Join-Path $x64BundleDir "BhojPatra Desk_$($Version)_x64-setup.exe"
$x86SourceInstaller = Join-Path $x86BundleDir "BhojPatra Desk_$($Version)_x86-setup.exe"
$x64SourceSignature = "$x64SourceInstaller.sig"
$x86SourceSignature = "$x86SourceInstaller.sig"
$releaseDir = Join-Path $repoRoot "release\r2-updates"
$x64UploadName = "BhojPatra-Desk_$($Version)_x64-setup.exe"
$x86UploadName = "BhojPatra-Desk_$($Version)_x86-setup.exe"
$authenticodeScript = Join-Path $repoRoot "tools\sign-windows-artifacts.ps1"

if (!(Test-Path $SigningKeyPath)) {
  throw "Updater signing key not found: $SigningKeyPath"
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
if (!(Test-Path $tauriConfigPath)) {
  throw "Tauri config not found: $tauriConfigPath"
}
if (!(Test-Path $tauriWindows7ConfigPath)) {
  throw "Windows 7 compatible Tauri config not found: $tauriWindows7ConfigPath"
}
$tauriConfig = Get-Content -Raw $tauriConfigPath | ConvertFrom-Json
if ($tauriConfig.version -ne $Version) {
  Write-Host "Updating tauri.conf.json version from $($tauriConfig.version) to $Version"
  $tauriConfig.version = $Version
  [System.IO.File]::WriteAllText($tauriConfigPath, ($tauriConfig | ConvertTo-Json -Depth 20), $utf8NoBom)
}

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw $SigningKeyPath
if ($SigningKeyPassword -ne $null) {
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $SigningKeyPassword
}
Push-Location $webDir
try {
  cargo tauri build --ci --bundles nsis -c src-tauri/tauri.windows7.conf.json
  cargo tauri build --ci --target i686-pc-windows-msvc --bundles nsis -c src-tauri/tauri.windows7.conf.json
} finally {
  Pop-Location
}

if (!(Test-Path $x64SourceInstaller) -or !(Test-Path $x64SourceSignature)) {
  throw "Signed x64 NSIS installer or updater signature was not produced."
}
if (!(Test-Path $x86SourceInstaller) -or !(Test-Path $x86SourceSignature)) {
  throw "Signed x86 NSIS installer or updater signature was not produced."
}

& $authenticodeScript -Path $x64SourceInstaller, $x86SourceInstaller -RequireAuthenticodeSigning

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Copy-Item -LiteralPath $x64SourceInstaller -Destination (Join-Path $releaseDir $x64UploadName) -Force
Copy-Item -LiteralPath $x64SourceSignature -Destination (Join-Path $releaseDir "$x64UploadName.sig") -Force
Copy-Item -LiteralPath $x86SourceInstaller -Destination (Join-Path $releaseDir $x86UploadName) -Force
Copy-Item -LiteralPath $x86SourceSignature -Destination (Join-Path $releaseDir "$x86UploadName.sig") -Force

$x64Signature = (Get-Content -Raw $x64SourceSignature).Trim()
$x86Signature = (Get-Content -Raw $x86SourceSignature).Trim()
$x64Platform = @{
  signature = $x64Signature
  url = "$PublicBaseUrl/$x64UploadName"
}
$x86Platform = @{
  signature = $x86Signature
  url = "$PublicBaseUrl/$x86UploadName"
}

$manifest = [ordered]@{
  version = $Version
  notes = "BhojPatra Desk release $Version."
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64-nsis" = $x64Platform
    "windows-x86_64" = $x64Platform
    "windows-i686-nsis" = $x86Platform
    "windows-i686" = $x86Platform
  }
}

$manifestPath = Join-Path $releaseDir "latest.json"
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), $utf8NoBom)

npx wrangler r2 object put "$Bucket/$x64UploadName" --file (Join-Path $releaseDir $x64UploadName) --remote
npx wrangler r2 object put "$Bucket/$x64UploadName.sig" --file (Join-Path $releaseDir "$x64UploadName.sig") --remote
npx wrangler r2 object put "$Bucket/$x86UploadName" --file (Join-Path $releaseDir $x86UploadName) --remote
npx wrangler r2 object put "$Bucket/$x86UploadName.sig" --file (Join-Path $releaseDir "$x86UploadName.sig") --remote
npx wrangler r2 object put "$Bucket/latest.json" --file $manifestPath --remote

Write-Host "Published BhojPatra Desk $Version x64/x86 to $PublicBaseUrl/latest.json"
