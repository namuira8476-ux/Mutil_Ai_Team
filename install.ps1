[CmdletBinding()]
param(
  [string]$Version = 'latest',
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\Agent Studio'),
  [switch]$DownloadOnly,
  [switch]$NoLaunch
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
  throw 'Agent Studio currently supports Windows x64 only.'
}
if ($Version -ne 'latest' -and $Version -notmatch '^v?\d+\.\d+\.\d+$') { throw 'Invalid version.' }
if (-not [IO.Path]::IsPathRooted($InstallDir) -or $InstallDir -match '["\r\n]') { throw 'Use an absolute installation path.' }
if (-not $DownloadOnly -and (Get-Process 'Agent Workroom' -ErrorAction SilentlyContinue)) {
  throw 'Close Agent Studio after finishing active work, then run this command again.'
}
$repo = 'namuira8476-ux/Mutil_Ai_Team'
$endpoint = if ($Version -eq 'latest') { 'latest' } else { 'tags/v' + $Version.TrimStart('v') }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/$endpoint" -Headers @{ 'User-Agent'='AgentStudio-Installer' }
$asset = @($release.assets | Where-Object name -Match '^AgentStudio-\d+\.\d+\.\d+-win-x64-setup\.exe$')
$checksums = @($release.assets | Where-Object name -EQ 'SHA256SUMS.txt')
if ($asset.Count -ne 1 -or $checksums.Count -ne 1) { throw 'This release does not contain a complete Windows installer.' }
$folder = Join-Path ([IO.Path]::GetTempPath()) ('AgentStudio-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $folder | Out-Null
$installer = Join-Path $folder $asset[0].name
$sums = Join-Path $folder 'SHA256SUMS.txt'
Write-Host "Downloading Agent Studio $($release.tag_name)..."
Invoke-WebRequest $asset[0].browser_download_url -OutFile $installer -UseBasicParsing
Invoke-WebRequest $checksums[0].browser_download_url -OutFile $sums -UseBasicParsing
$line = @(Get-Content -LiteralPath $sums | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+\*?' + [regex]::Escape($asset[0].name) + '$') })
if ($line.Count -ne 1) { throw 'Installer checksum is missing.' }
$expected = ($line[0] -split '\s+')[0]
if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expected) { throw 'Checksum mismatch. Installation stopped.' }
Write-Host "SHA-256 verified: $installer"
if ($DownloadOnly) { return }
# Keep the previous location when updating an installation made during preview.
$legacy = Join-Path $env:LOCALAPPDATA 'Programs\Agent Workroom Preview'
if (-not $PSBoundParameters.ContainsKey('InstallDir') -and (Test-Path (Join-Path $legacy 'Agent Workroom.exe'))) { $InstallDir = $legacy }
$process = Start-Process -FilePath $installer -ArgumentList ('/S /D=' + $InstallDir) -WindowStyle Hidden -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Installer exited with code $($process.ExitCode)." }
$exe = Join-Path $InstallDir 'Agent Workroom.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Installed executable was not found.' }
Write-Host "Agent Studio installed: $InstallDir"
Write-Host 'Open Settings to discover CLI paths or open the official CLI installation terminal. Complete provider login yourself.'
if (-not $NoLaunch) { Start-Process -FilePath $exe }
