<#
.SYNOPSIS
    Starts the TrailAsia API and web client in two terminal windows.

.DESCRIPTION
    Runs the API first, waits until it actually answers on /health, and only then
    starts the client. The order matters: the client calls the API as soon as it
    loads, so starting them together means the first request sometimes lands
    before the server is listening and you get a login screen that fails once for
    no visible reason.

    Safe to run twice — if something is already listening on a port, it is
    checked (not just assumed) to actually be the right process before being
    left alone rather than started again. A port held by something else, or by
    a stale process left over from a previous run, fails loudly with a way to
    clear it rather than silently skipping that window.

.PARAMETER ApiPort
    Port the API listens on. Default 4000, matching server/.env.

.PARAMETER ClientPort
    Port the Vite dev server listens on. Default 5173.

.PARAMETER NoBrowser
    Skip opening the browser at the end.

.EXAMPLE
    .\start.ps1

.EXAMPLE
    .\start.ps1 -NoBrowser
#>

[CmdletBinding()]
param(
    [int]$ApiPort = 4000,
    [int]$ClientPort = 5173,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$Root   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Server = Join-Path $Root 'server'
$Client = Join-Path $Root 'client'

function Write-Step  { param($m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "    $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "    $m" -ForegroundColor Yellow }
function Write-Fail  { param($m) Write-Host "    $m" -ForegroundColor Red }

# --- Checks ----------------------------------------------------------------
# Fail here with something actionable, rather than letting two terminals open
# and immediately die with a stack trace the reader has to interpret.

Write-Step 'Checking the project'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Fail 'Node.js is not installed, or not on your PATH.'
    Write-Host '    Install Node 20 LTS from https://nodejs.org and reopen this terminal.'
    exit 1
}

$missing = @()
if (-not (Test-Path (Join-Path $Server 'node_modules'))) { $missing += 'server' }
if (-not (Test-Path (Join-Path $Client 'node_modules'))) { $missing += 'client' }

if ($missing.Count -gt 0) {
    Write-Fail "Dependencies are not installed for: $($missing -join ', ')"
    Write-Host '    Run this once first:'
    Write-Host '        .\setup.ps1' -ForegroundColor White
    exit 1
}

if (-not (Test-Path (Join-Path $Server '.env'))) {
    Write-Fail 'server\.env is missing — the API cannot start without it.'
    Write-Host '    Run this once first:'
    Write-Host '        .\setup.ps1' -ForegroundColor White
    exit 1
}

Write-Ok 'Dependencies and configuration look fine.'

# --- Helpers ---------------------------------------------------------------

# Prefer PowerShell 7 when it is installed, fall back to Windows PowerShell.
$Shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

function Test-PortListening {
    param([int]$Port)
    try {
        $null = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        return $true
    } catch {
        # Get-NetTCPConnection is missing on some older systems; fall back to a
        # plain connection attempt rather than wrongly reporting the port free.
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect('127.0.0.1', $Port)
            $tcp.Close()
            return $true
        } catch {
            return $false
        }
    }
}

function Start-InNewTerminal {
    param([string]$Title, [string]$WorkingDirectory, [string]$Command)

    # -NoExit keeps the window open so the dev-server output stays readable, and
    # so a crash leaves its error on screen instead of vanishing.
    $inner = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$WorkingDirectory'; $Command"
    Start-Process -FilePath $Shell -ArgumentList @('-NoExit', '-Command', $inner) | Out-Null
}

function Test-ApiHealthy {
    param([int]$Port, [int]$TimeoutSeconds = 3)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/api/v1/health" `
                                      -UseBasicParsing -TimeoutSec $TimeoutSeconds
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-ForApi {
    param([int]$Port, [int]$TimeoutSeconds = 60)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-ApiHealthy -Port $Port -TimeoutSeconds 2) { return $true }
        Start-Sleep -Milliseconds 700
        Write-Host '.' -NoNewline
    }
    Write-Host ''
    return $false
}

# Vite has no /health endpoint, but it does answer a plain GET on / with 200
# once it is actually serving — good enough to tell "Vite is up" apart from
# "something else is holding this port".
function Test-ClientHealthy {
    param([int]$Port, [int]$TimeoutSeconds = 3)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/" `
                                      -UseBasicParsing -TimeoutSec $TimeoutSeconds
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-ForClient {
    param([int]$Port, [int]$TimeoutSeconds = 30)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-ClientHealthy -Port $Port -TimeoutSeconds 2) { return $true }
        Start-Sleep -Milliseconds 500
        Write-Host '.' -NoNewline
    }
    Write-Host ''
    return $false
}

# --- API -------------------------------------------------------------------

Write-Step "Starting the API on port $ApiPort"

if (Test-PortListening -Port $ApiPort) {
    # Something is bound to the port, but "bound" is not "is the TrailAsia
    # API" — check before trusting it, rather than silently skipping the
    # window and leaving whoever is watching wondering why only one terminal
    # opened. The usual cause is a node process orphaned from a previous run:
    # closing the "TrailAsia API" window with the X button kills the shell,
    # but does not reliably kill the node process nodemon spawned underneath
    # it, which can keep running invisibly on the same port.
    if (Test-ApiHealthy -Port $ApiPort) {
        Write-Warn "Already running on $ApiPort — reusing it."
    } else {
        Write-Fail "Port $ApiPort is in use, but nothing there is answering the TrailAsia API's /health endpoint."
        Write-Host '    This is usually a process left over from an earlier run whose window'
        Write-Host '    you closed without stopping it, or a different app using the same port.'
        Write-Host '    Find and stop it, then run this again:'
        Write-Host "        netstat -ano | findstr :$ApiPort" -ForegroundColor White
        Write-Host '        taskkill /PID <the PID from the line above> /F' -ForegroundColor White
        exit 1
    }
} else {
    Start-InNewTerminal -Title 'TrailAsia API' -WorkingDirectory $Server -Command 'npm run dev'
    Write-Host '    waiting for it to answer' -NoNewline

    if (-not (Wait-ForApi -Port $ApiPort)) {
        Write-Fail "The API did not respond on port $ApiPort within 60 seconds."
        Write-Host '    Check the "TrailAsia API" window. The usual causes are:'
        Write-Host '      - MySQL is not running       (ECONNREFUSED 127.0.0.1:3306)'
        Write-Host '      - the database does not exist (run .\setup.ps1)'
        Write-Host '      - DB_PASSWORD or JWT_SECRET is missing from server\.env'
        exit 1
    }
    Write-Host ''
    Write-Ok "API is up at http://localhost:$ApiPort/api/v1"
}

# --- Client ----------------------------------------------------------------

Write-Step "Starting the web client on port $ClientPort"

if (Test-PortListening -Port $ClientPort) {
    if (Test-ClientHealthy -Port $ClientPort) {
        Write-Warn "Already running on $ClientPort — reusing it."
    } else {
        Write-Fail "Port $ClientPort is in use, but nothing there is answering like the TrailAsia client."
        Write-Host '    This is usually a process left over from an earlier run whose window'
        Write-Host '    you closed without stopping it, or a different app using the same port.'
        Write-Host '    Find and stop it, then run this again:'
        Write-Host "        netstat -ano | findstr :$ClientPort" -ForegroundColor White
        Write-Host '        taskkill /PID <the PID from the line above> /F' -ForegroundColor White
        exit 1
    }
} else {
    Start-InNewTerminal -Title 'TrailAsia client' -WorkingDirectory $Client -Command 'npm run dev'
    Write-Host '    waiting for it to answer' -NoNewline

    if (-not (Wait-ForClient -Port $ClientPort)) {
        Write-Fail "The client did not respond on port $ClientPort within 30 seconds."
        Write-Host '    Check the "TrailAsia client" window for the actual error.'
        exit 1
    }
    Write-Host ''
    Write-Ok "Client is up at http://localhost:$ClientPort"
}

# --- Done ------------------------------------------------------------------

Write-Host ''
Write-Host 'TrailAsia is running.' -ForegroundColor Green
Write-Host ''
Write-Host "  Web client   http://localhost:$ClientPort"
Write-Host "  API          http://localhost:$ApiPort/api/v1"
Write-Host ''
Write-Host '  Sign in with a seeded account (password: trailasia-dev-password)'
Write-Host '    admin@trailasia.local        full access, manages staff'
Write-Host '    coordinator@trailasia.local  verifies documents, edits destinations'
Write-Host '    consultant@trailasia.local   bookings and travellers, cannot verify'
Write-Host '    finance@trailasia.local      read-only, passport numbers stay masked'
Write-Host ''
Write-Host '  Close the two terminal windows to stop.'
Write-Host ''

if (-not $NoBrowser) {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:$ClientPort"
}
