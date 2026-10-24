# One-command local Docker run (Windows PowerShell).  Usage:  .\scripts\docker-local.ps1 [-Prod] [-Down]
# Requires Docker Desktop to be installed and running.
param([switch]$Prod, [switch]$Down)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker not found. Install Docker Desktop first (see docs/LOCAL_SETUP.md).' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker is installed but not running. Start Docker Desktop and retry.' }

$envName = if ($Prod) { 'prod' } else { 'dev' }
$file = if ($Prod) { 'docker-compose.prod.yml' } else { 'docker-compose.yml' }
$envFile = "config/$envName.env"

if ($Down) { docker compose -f $file down; return }

if (-not (Test-Path $envFile)) {
  Copy-Item "config/$envName.env.example" $envFile
  Write-Host "Created $envFile from the template."
  if ($Prod) { throw "Edit $envFile and set JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, BUSINESS_PHONE, then re-run." }
}

docker compose -f $file up -d --build
Write-Host "`nRunning. Site: http://localhost:3000   Admin: http://localhost:3000/admin"
if (-not $Prod) { Write-Host "Admin password (if ADMIN_PASSWORD is blank) is in the logs:  docker compose logs web | Select-String 'admin password'" }
Write-Host "Stop with: .\scripts\docker-local.ps1 $(if ($Prod) {'-Prod '})-Down"
