# Chat Saver for Windows - installer
# Right-click this file > "Run with PowerShell".
# Installs Node.js if needed (via winget), installs Chat Saver's one dependency,
# and adds "Chat Saver" to the Start menu and Desktop.
$ErrorActionPreference = 'Stop'
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = Split-Path -Parent $here
Write-Host "`n  Chat Saver for Windows`n" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "  Node.js is needed. Installing it with winget..." -ForegroundColor Yellow
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "  winget is not available. Install Node.js LTS from https://nodejs.org and run this again." -ForegroundColor Red
    Read-Host "  Press Enter to close"; exit 1
  }
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
Write-Host "  Node.js $(node --version) found."

Push-Location $desktop
Write-Host "  Installing Chat Saver..."
npm install --no-audit --no-fund --silent
Pop-Location

$browsers = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe", "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe")
if (-not ($browsers | Where-Object { Test-Path $_ })) {
  Write-Host "  Note: no Edge/Chrome/Brave found. Chat Saver needs one of them." -ForegroundColor Yellow
}

$shell = New-Object -ComObject WScript.Shell
$targets = @(
  @{ Dir = [Environment]::GetFolderPath('Programs'); Name = 'Chat Saver' },
  @{ Dir = [Environment]::GetFolderPath('Desktop');  Name = 'Chat Saver' }
)
foreach ($t in $targets) {
  $lnk = $shell.CreateShortcut((Join-Path $t.Dir "$($t.Name).lnk"))
  $lnk.TargetPath = Join-Path $here 'Chat Saver.cmd'
  $lnk.WorkingDirectory = $desktop
  $lnk.IconLocation = (Join-Path $here 'chatsaver.ico') + ',0'
  $lnk.Description = 'Save an AI chat as PDF, TXT and Markdown'
  $lnk.Save()
}
$lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Chat Saver - Sign in.lnk'))
$lnk.TargetPath = Join-Path $here 'Chat Saver - Sign in.cmd'; $lnk.WorkingDirectory = $desktop
$lnk.IconLocation = (Join-Path $here 'chatsaver.ico') + ',0'; $lnk.Save()

Write-Host "`n  Done! 'Chat Saver' is on your Desktop and in the Start menu." -ForegroundColor Green
Write-Host "  First time: open 'Chat Saver - Sign in' from the Start menu and sign in to your chat sites."
Write-Host "  Then open Chat Saver, paste a chat link, press Enter.`n"
Read-Host "  Press Enter to close"
