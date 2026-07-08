$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "release"
$exePath = Join-Path $releaseDir "bhojpatra.exe"
$blobPath = Join-Path $releaseDir "print-bridge.blob"
$configPath = Join-Path $root "tools\print-bridge-sea-config.json"

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

node --check (Join-Path $root "tools\print-bridge-sea.cjs")
node --experimental-sea-config $configPath

$nodeExe = (Get-Command node.exe).Source
Copy-Item -LiteralPath $nodeExe -Destination $exePath -Force

npx --yes postject@latest $exePath NODE_SEA_BLOB $blobPath --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

Write-Host "Built $exePath"
