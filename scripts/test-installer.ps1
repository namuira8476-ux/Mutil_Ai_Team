$ErrorActionPreference='Stop'
$global:agentStudioTestBadHash=$false
function Invoke-RestMethod { param($Uri,$Headers) return @{tag_name='v0.1.15';assets=@(@{name='AgentStudio-0.1.15-win-x64-setup.exe';browser_download_url='https://example.invalid/setup.exe'},@{name='SHA256SUMS.txt';browser_download_url='https://example.invalid/SHA256SUMS.txt'})} }
function Invoke-WebRequest { param($Uri,$OutFile,[switch]$UseBasicParsing)
 if($Uri.EndsWith('setup.exe')){[IO.File]::WriteAllText($OutFile,'installer fixture')}else{$file=Join-Path (Split-Path $OutFile) 'AgentStudio-0.1.15-win-x64-setup.exe';$hash=(Get-FileHash $file).Hash;if($global:agentStudioTestBadHash){$hash='0'*64};Set-Content $OutFile "$hash  AgentStudio-0.1.15-win-x64-setup.exe"}
}
& "$PSScriptRoot/../install.ps1" -DownloadOnly
$global:agentStudioTestBadHash=$true
$rejected=$false
try { & "$PSScriptRoot/../install.ps1" -DownloadOnly } catch { if($_.Exception.Message -match 'Checksum mismatch'){$rejected=$true}else{throw} }
if(-not $rejected){throw 'Corrupt download was accepted'}
Write-Host 'Installer tests passed: valid checksum accepted; corrupt download rejected; no installer launched.'

