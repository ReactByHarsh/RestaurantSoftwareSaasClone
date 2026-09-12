param(
  [Parameter(Mandatory = $true)]
  [string[]]$Path,
  [switch]$RequireAuthenticodeSigning
)

$ErrorActionPreference = "Stop"

$certificateThumbprint = [string]$env:BHOJPATRA_SIGNING_CERT_THUMBPRINT
$certificateThumbprint = $certificateThumbprint.Replace(" ", "").Trim()
$certificatePath = [string]$env:BHOJPATRA_SIGNING_CERT_PATH
$certificatePath = $certificatePath.Trim()
$certificatePassword = $env:BHOJPATRA_SIGNING_CERT_PASSWORD
$timestampUrl = [string]$env:BHOJPATRA_TIMESTAMP_URL
if ([string]::IsNullOrWhiteSpace($timestampUrl)) {
  $timestampUrl = "http://timestamp.digicert.com"
}
$timestampUrl = $timestampUrl.Trim()

if ([string]::IsNullOrWhiteSpace($certificateThumbprint) -and [string]::IsNullOrWhiteSpace($certificatePath)) {
  if ($RequireAuthenticodeSigning) {
    throw "Authenticode signing is required for release artifacts. Set BHOJPATRA_SIGNING_CERT_THUMBPRINT (recommended) or BHOJPATRA_SIGNING_CERT_PATH before publishing."
  }
  Write-Warning "Authenticode signing was skipped. Configure BHOJPATRA_SIGNING_CERT_THUMBPRINT or BHOJPATRA_SIGNING_CERT_PATH before distributing Windows artifacts."
  return
}

$signTool = (Get-Command signtool.exe -ErrorAction SilentlyContinue).Source
if (!$signTool) {
  $sdkRoots = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
    "$env:ProgramFiles\Windows Kits\10\bin",
    "${env:ProgramFiles(x86)}\Windows Kits\8.1\bin",
    "$env:ProgramFiles\Windows Kits\8.1\bin"
  ) | Where-Object { $_ -and (Test-Path $_) }
  $signTool = Get-ChildItem -Path $sdkRoots -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (!$signTool) {
  throw "signtool.exe was not found. Install the Windows SDK or Visual Studio signing tools."
}

if ($certificatePath -and !(Test-Path -LiteralPath $certificatePath)) {
  throw "Authenticode certificate was not found: $certificatePath"
}

foreach ($artifact in $Path) {
  if (!(Test-Path -LiteralPath $artifact)) {
    throw "Artifact to sign was not found: $artifact"
  }

  $arguments = @("sign", "/fd", "SHA256", "/tr", $timestampUrl, "/td", "SHA256")
  if ($certificateThumbprint) {
    $arguments += @("/sha1", $certificateThumbprint, "/s", "My")
  } else {
    $arguments += @("/f", $certificatePath)
    if ($null -ne $certificatePassword) {
      $arguments += @("/p", $certificatePassword)
    }
  }
  $arguments += $artifact

  & $signTool @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Authenticode signing failed for $artifact with exit code $LASTEXITCODE."
  }

  & $signTool verify /pa /all $artifact
  if ($LASTEXITCODE -ne 0) {
    throw "Authenticode verification failed for $artifact with exit code $LASTEXITCODE."
  }
  Write-Host "Authenticode signed and verified $artifact"
}
