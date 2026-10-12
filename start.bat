@echo off
setlocal enabledelayedexpansion
REM ---------------------------------------------------------------------------
REM  TrailAsia — starts the API and the web client, each in its own window.
REM  Double-click from Explorer, or run from cmd.
REM
REM  Starts the API first and waits until it actually answers on /health
REM  before starting the client. The order matters: the client calls the API
REM  the moment it loads, so starting them together means the first request
REM  sometimes lands before the server is listening, and you get a login
REM  screen that fails once for no visible reason.
REM
REM  Safe to run twice — if something is already listening on a port, it is
REM  checked (not just assumed) to actually be the right process before being
REM  left alone rather than started again. A port held by something else, or
REM  by a stale process left over from a previous run, fails loudly with a
REM  way to clear it rather than silently skipping that window.
REM ---------------------------------------------------------------------------

set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "CLIENT=%ROOT%client"
set "API_PORT=4000"
set "CLIENT_PORT=5173"

REM --- Checks ------------------------------------------------------------
REM Fail here with something actionable, rather than letting a window open
REM and immediately die with a stack trace the reader has to interpret.

echo ==^> Checking the project

where node >nul 2>&1
if errorlevel 1 (
    echo     Node.js is not installed, or not on your PATH.
    echo     Install Node 20 LTS from https://nodejs.org and reopen this terminal.
    goto :fail
)

where curl >nul 2>&1
if errorlevel 1 (
    echo     curl.exe was not found on your PATH. It ships with Windows 10/11 by
    echo     default; if it is genuinely missing, install it or update Windows.
    goto :fail
)

if not exist "%SERVER%\node_modules" (
    echo     Server dependencies are not installed.
    echo     Run this once first: setup.bat
    goto :fail
)
if not exist "%CLIENT%\node_modules" (
    echo     Client dependencies are not installed.
    echo     Run this once first: setup.bat
    goto :fail
)
if not exist "%SERVER%\.env" (
    echo     server\.env is missing — the API cannot start without it.
    echo     Run this once first: setup.bat
    goto :fail
)

echo     Dependencies and configuration look fine.

REM --- API -----------------------------------------------------------------

echo.
echo ==^> Starting the API on port %API_PORT%

set "PORT_BUSY="
netstat -ano | findstr ":%API_PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 set "PORT_BUSY=1"

if defined PORT_BUSY (
    call :check_health "http://localhost:%API_PORT%/api/v1/health"
    if not errorlevel 1 (
        echo     Already running on %API_PORT% — reusing it.
    ) else (
        call :port_conflict %API_PORT% "the TrailAsia API's /health endpoint"
        goto :fail
    )
) else (
    start "TrailAsia API" cmd /k "cd /d "%SERVER%" && npm run dev"
    echo     waiting for it to answer
    call :wait_for "http://localhost:%API_PORT%/api/v1/health" 60
    if errorlevel 1 (
        echo.
        echo     The API did not respond on port %API_PORT% within 60 seconds.
        echo     Check the "TrailAsia API" window. The usual causes are:
        echo       - MySQL is not running        ^(ECONNREFUSED 127.0.0.1:3306^)
        echo       - the database does not exist  ^(run setup.bat^)
        echo       - DB_PASSWORD or JWT_SECRET is missing from server\.env
        goto :fail
    )
    echo.
    echo     API is up at http://localhost:%API_PORT%/api/v1
)

REM --- Client ----------------------------------------------------------------

echo.
echo ==^> Starting the web client on port %CLIENT_PORT%

set "PORT_BUSY="
netstat -ano | findstr ":%CLIENT_PORT% " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 set "PORT_BUSY=1"

if defined PORT_BUSY (
    call :check_health "http://localhost:%CLIENT_PORT%/"
    if not errorlevel 1 (
        echo     Already running on %CLIENT_PORT% — reusing it.
    ) else (
        call :port_conflict %CLIENT_PORT% "like the TrailAsia client"
        goto :fail
    )
) else (
    start "TrailAsia client" cmd /k "cd /d "%CLIENT%" && npm run dev"
    echo     waiting for it to answer
    call :wait_for "http://localhost:%CLIENT_PORT%/" 30
    if errorlevel 1 (
        echo.
        echo     The client did not respond on port %CLIENT_PORT% within 30 seconds.
        echo     Check the "TrailAsia client" window for the actual error.
        goto :fail
    )
    echo.
    echo     Client is up at http://localhost:%CLIENT_PORT%
)

REM --- Done ------------------------------------------------------------------

echo.
echo TrailAsia is running.
echo.
echo   Web client   http://localhost:%CLIENT_PORT%
echo   API          http://localhost:%API_PORT%/api/v1
echo.
echo   Sign in with a seeded account ^(password: trailasia-dev-password^)
echo     admin@trailasia.local        full access, manages staff
echo     coordinator@trailasia.local  verifies documents, edits destinations
echo     consultant@trailasia.local   bookings and travellers, cannot verify
echo     finance@trailasia.local      read-only, passport numbers stay masked
echo.
echo   Close the two terminal windows to stop.
echo.

timeout /t 2 /nobreak >nul
start "" "http://localhost:%CLIENT_PORT%"

exit /b 0

:fail
echo.
pause
exit /b 1

REM --- Subroutines -------------------------------------------------------

REM %1 = url (quoted). Returns errorlevel 0 if it answers with 2xx/3xx,
REM non-zero otherwise (connection refused, timeout, or an error status).
:check_health
curl -s -o nul -m 3 --fail %1 >nul 2>&1
exit /b %errorlevel%

REM %1 = port, %2 = what should be answering there (quoted). Prints the
REM standard "something else is on this port" message.
:port_conflict
echo     Port %~1 is in use, but nothing there is answering %~2.
echo     This is usually a process left over from an earlier run whose window
echo     you closed without stopping it, or a different app using the same port.
echo     Find and stop it, then run this again:
echo         netstat -ano ^| findstr :%~1
echo         taskkill /PID ^(the PID from the line above^) /F
exit /b 0

REM %1 = url (quoted), %2 = timeout in seconds. Polls once a second.
:wait_for
set "WAIT_URL=%~1"
set /a "WAIT_TRIES=%~2"
:wait_for_loop
call :check_health "%WAIT_URL%"
if not errorlevel 1 exit /b 0
set /a "WAIT_TRIES-=1"
if %WAIT_TRIES% leq 0 exit /b 1
<nul set /p "=."
timeout /t 1 /nobreak >nul
goto :wait_for_loop
