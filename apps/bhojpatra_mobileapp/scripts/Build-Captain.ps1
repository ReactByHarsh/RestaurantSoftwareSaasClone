param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$captainRoot = Split-Path -Parent $PSScriptRoot
$captainSecrets = Join-Path $env:USERPROFILE '.tauri'
$captainKey = Join-Path $captainSecrets 'bhojpatra-captain-release.jks'
$captainPassword = Join-Path $captainSecrets 'bhojpatra-captain-password.dpapi'
if (!(Test-Path -LiteralPath $captainKey) -or !(Test-Path -LiteralPath $captainPassword)) {
    throw 'Captain signing key or protected password missing. Restore the existing signing material; do not regenerate keys for an already distributed app.'
}
$captainProtected = (Get-Content -LiteralPath $captainPassword -Raw).Trim() | ConvertTo-SecureString
$captainPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($captainProtected)
try {
    $env:BHOJPATRA_ANDROID_KEYSTORE = $captainKey
    $env:BHOJPATRA_ANDROID_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($captainPointer)
    Push-Location $captainRoot
    try {
        & flutter pub get
        if ($LASTEXITCODE -ne 0) { throw 'Flutter dependencies failed' }
        if (!$SkipTests) {
            & flutter analyze
            if ($LASTEXITCODE -ne 0) { throw 'Flutter analysis failed' }
            & flutter test
            if ($LASTEXITCODE -ne 0) { throw 'Flutter tests failed' }
        }
        & flutter build apk --release --target lib/main_captain.dart --split-per-abi
        if ($LASTEXITCODE -ne 0) { throw 'Captain APK build failed' }
        $captainVersion = ((Get-Content pubspec.yaml | Select-String '^version:').ToString().Split(':')[1].Trim().Split('+')[0])
        $captainOutput = [IO.Path]::GetFullPath((Join-Path $captainRoot '../../release/captain'))
        New-Item -ItemType Directory -Path $captainOutput -Force | Out-Null
        foreach ($captainAbi in @('arm64-v8a', 'armeabi-v7a', 'x86_64')) {
            $captainApk = Join-Path $captainRoot "build/app/outputs/flutter-apk/app-$captainAbi-release.apk"
            Copy-Item -LiteralPath $captainApk -Destination (Join-Path $captainOutput "BhojPatra-$captainVersion-$captainAbi.apk")
        }
        Get-ChildItem -LiteralPath $captainOutput -Filter "BhojPatra-$captainVersion-*.apk" | Select-Object Name, Length
    } finally { Pop-Location }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($captainPointer)
    Remove-Item Env:BHOJPATRA_ANDROID_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:BHOJPATRA_ANDROID_KEYSTORE -ErrorAction SilentlyContinue
}
