# FORT BEER ERP — subir ambiente após reinício (WSL + Docker)
# Execute no PowerShell:  .\scripts\start-dev.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:Path = "C:\Program Files\Docker\Docker\resources\bin;C:\Program Files\nodejs;" + $env:Path

Write-Host "==> Aguardando Docker Engine..." -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(5)
$ready = $false
while ((Get-Date) -lt $deadline) {
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 5
}
if (-not $ready) {
  Write-Host "Docker ainda não está pronto. Abra o Docker Desktop e rode este script de novo." -ForegroundColor Yellow
  exit 1
}

Write-Host "==> Subindo Postgres + Redis..." -ForegroundColor Cyan
docker compose -f docker/docker-compose.yml up -d db redis

Write-Host "==> Aguardando healthchecks..." -ForegroundColor Cyan
Start-Sleep -Seconds 8
docker compose -f docker/docker-compose.yml ps

Set-Location "$root\apps\api"
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
}

Write-Host "==> Prisma migrate + seed..." -ForegroundColor Cyan
npx prisma migrate deploy
npm run prisma:seed

Write-Host "==> Inicie em dois terminais:" -ForegroundColor Green
Write-Host "  cd $root\apps\api ; npm run start:dev"
Write-Host "  cd $root\apps\web ; npm run dev"
Write-Host ""
Write-Host "Login: http://localhost:3000  |  gestor / 1234"
