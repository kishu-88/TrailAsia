<#
.SYNOPSIS
    One-time setup for TrailAsia: installs dependencies, writes server\.env,
    runs the migrations and seeds the database.

.DESCRIPTION
    Run this once after cloning. Afterwards use .\start.ps1 for day-to-day work.

    It is safe to run again — an existing .env is left alone unless you pass
    -Force, and the seeders skip records that already exist.

    What it does NOT do is create the MySQL database or user. That needs your
    root credentials and varies with how MySQL was installed, so the script
    prints the SQL and stops rather than guessing.

.PARAMETER Force
    Overwrite an existing server\.env with a fresh one.

.PARAMETER SkipSeed
    Run the migrations but not the seeders.

.EXAMPLE
    .\setup.ps1
#>

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$SkipSeed
)

$ErrorActionPreference = 'Stop'

$Root   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Server = Join-Path $Root 'server'
$Client = Join-Path $Root 'client'

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    $m" -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "    $m" -ForegroundColor Red }

# --- Node ------------------------------------------------------------------

Write-Step 'Checking Node.js'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail 'Node.js is not installed, or not on your PATH.'
    Write-Host '    Install Node 20 LTS from https://nodejs.org, then reopen this terminal.'
    exit 1
}

$nodeVersion = (node -v).TrimStart('v')
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 20) {
    Write-Fail "Node $nodeVersion found, but this project needs 20 or newer."
    exit 1
}
Write-Ok "Node $nodeVersion"

# --- Dependencies ----------------------------------------------------------
# Two installs, because this is a monorepo with separate package.json files.
# There is no package.json at the root, which is the usual first surprise.

Write-Step 'Installing server dependencies (this takes a minute)'
Push-Location $Server
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed in server' }
} finally {
    Pop-Location
}
Write-Ok 'Server dependencies installed.'

Write-Step 'Installing client dependencies'
Push-Location $Client
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed in client' }
} finally {
    Pop-Location
}
Write-Ok 'Client dependencies installed.'

# --- Environment file ------------------------------------------------------

Write-Step 'Configuring server\.env'

$envFile    = Join-Path $Server '.env'
$envExample = Join-Path $Server '.env.example'

if ((Test-Path $envFile) -and -not $Force) {
    Write-Warn 'server\.env already exists — leaving it as it is.'
    Write-Host '    Pass -Force to replace it.'
} else {
    $dbPassword = Read-Host 'MySQL password for the trailasia_app user'

    # Generated with Node''s crypto module rather than Get-Random, which is not
    # a cryptographic source and should never produce a signing key.
    $jwtSecret = node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

    # `$` is special on the right-hand side of -replace, so it has to be doubled
    # or a password containing one would be silently mangled.
    $safePassword = $dbPassword -replace '\$', '$$$$'
    $safeSecret   = $jwtSecret  -replace '\$', '$$$$'

    $content = Get-Content $envExample -Raw
    $content = $content -replace '(?m)^DB_PASSWORD=.*$', "DB_PASSWORD=$safePassword"
    $content = $content -replace '(?m)^JWT_SECRET=.*$',  "JWT_SECRET=$safeSecret"
    Set-Content -Path $envFile -Value $content -Encoding UTF8

    Write-Ok 'Wrote server\.env with a freshly generated JWT secret.'
    Write-Host '    It is git-ignored and stays on this machine.'
}

# --- Database --------------------------------------------------------------

Write-Step 'Creating the database schema'
Write-Host '    If this fails, the database itself probably does not exist yet.'

Push-Location $Server
try {
    npm run db:migrate
    $migrateFailed = ($LASTEXITCODE -ne 0)
} finally {
    Pop-Location
}

if ($migrateFailed) {
    Write-Host ''
    Write-Fail 'Migrations did not run.'
    Write-Host ''
    Write-Host '    If the error mentions ECONNREFUSED, MySQL is not running.'
    Write-Host '    If it mentions an unknown database, create it first — in MySQL'
    Write-Host '    Workbench, or with:  mysql -u root -p'
    Write-Host ''
    Write-Host '      CREATE DATABASE trailasia CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;' -ForegroundColor White
    Write-Host "      CREATE USER 'trailasia_app'@'localhost' IDENTIFIED BY 'your-password';" -ForegroundColor White
    Write-Host "      GRANT ALL PRIVILEGES ON trailasia.* TO 'trailasia_app'@'localhost';" -ForegroundColor White
    Write-Host '      FLUSH PRIVILEGES;' -ForegroundColor White
    Write-Host ''
    Write-Host '    Then run .\setup.ps1 again.'
    exit 1
}

Write-Ok 'Tables created.'

# --- Seed ------------------------------------------------------------------

if (-not $SkipSeed) {
    Write-Step 'Seeding staff accounts and destinations'
    Push-Location $Server
    try {
        npm run db:seed
        if ($LASTEXITCODE -ne 0) { Write-Warn 'Seeding reported a problem — see above.' }
    } finally {
        Pop-Location
    }
}

# --- Done ------------------------------------------------------------------

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host ''
Write-Host '  Start everything with:'
Write-Host '      .\start.ps1' -ForegroundColor White
Write-Host ''
