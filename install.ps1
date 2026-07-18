# OA-cli installer for Windows (PowerShell).
# Usage:  irm https://openagentic.id/cli/install.ps1 | iex
# Downloads the latest oa-cli-windows-<arch> release, installs oa-cli.exe to
# %LOCALAPPDATA%\oa-cli\bin, and adds it to the user PATH.
$ErrorActionPreference = "Stop"

$repo = "Wahidila/oa-cli"
$app  = "oa-cli"

# Detect architecture (arm64 vs x64).
$archRaw = "$env:PROCESSOR_ARCHITECTURE $env:PROCESSOR_ARCHITEW6432"
$arch = if ($archRaw -match "ARM64") { "arm64" } else { "x64" }
$asset = "$app-windows-$arch.zip"

# Resolve version: honor a pinned $env:OA_CLI_VERSION, else use the latest tag.
if ($env:OA_CLI_VERSION) {
  $version = $env:OA_CLI_VERSION.TrimStart("v")
  $url = "https://github.com/$repo/releases/download/v$version/$asset"
} else {
  $url = "https://github.com/$repo/releases/latest/download/$asset"
}

$dir = Join-Path $env:LOCALAPPDATA "$app\bin"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$tmp = Join-Path $env:TEMP "$app-install.zip"
Write-Host "Downloading $asset ..."
Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing

Write-Host "Installing to $dir ..."
Expand-Archive -Path $tmp -DestinationPath $dir -Force
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

# Add the install dir to the user PATH if it isn't already there.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $dir) {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$dir", "User")
  $env:Path = "$env:Path;$dir"
  Write-Host "Added $dir to your PATH."
}

Write-Host ""
Write-Host "oa-cli installed. Open a NEW terminal, then run:  oa-cli" -ForegroundColor Green
