# Run from an elevated PowerShell on the counter. Only the local subnet on
# Private Windows networks is allowed; no public/internet exposure is added.
$ErrorActionPreference = 'Stop'
$captainIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$captainPrincipal = New-Object Security.Principal.WindowsPrincipal($captainIdentity)
if (!$captainPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run PowerShell as administrator to add the private-LAN firewall rules.' }
foreach ($captainRule in @(@{ Name = 'BhojPatra Captain Private TCP'; Protocol = 'TCP'; Port = 3000 }, @{ Name = 'BhojPatra Captain Discovery Private UDP'; Protocol = 'UDP'; Port = 3001 })) {
    $captainExisting = Get-NetFirewallRule -DisplayName $captainRule.Name -ErrorAction SilentlyContinue
    if (!$captainExisting) {
        New-NetFirewallRule -DisplayName $captainRule.Name -Direction Inbound -Action Allow -Protocol $captainRule.Protocol -LocalPort $captainRule.Port -RemoteAddress LocalSubnet -Profile Private | Out-Null
    }
}
Write-Output 'Captain LAN access allowed on the private local subnet (TCP 3000 and UDP 3001).'
