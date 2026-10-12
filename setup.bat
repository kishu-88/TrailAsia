@echo off
setlocal enabledelayedexpansion
REM ---------------------------------------------------------------------------
REM  TrailAsia — one-time setup. Double-click from Explorer, or run from cmd.
REM
REM  Installs dependencies, writes server\.env, runs the migrations and seeds
REM  the database. Run this once after cloning; afterwards use start.bat for
REM  day-to-day work.
REM
REM  Safe to run again — an existing .env is left alone unless you pass
REM  -Force, and the seeders skip records that already exist.
REM
REM  What this does NOT do is create the MySQL database or user. That needs
REM  your root credentials and varies with how MySQL was installed, so it
REM  prints the SQL and stops rather than guessing.
REM
REM  Usage:
REM      setup.bat             normal run
REM      setup.bat -Force      overwrite an existing server\.env
REM      setup.bat -SkipSeed   run the migrations but not the seeders
REM
REM  Note on passwords: unlike the PowerShell version this replaced, plain
REM  cmd has no masked input, so the MySQL password you type is echoed to the
REM  screen. It is also written into server\.env as plain text either way —
REM  that file is git-ignored and stays on this machine. Avoid using %%, ^,
REM  &, |, <, >, ", or ! in that password; batch's string handling does not
REM  round-trip them reliably. If your MySQL password already has one of
REM  those characters, skip the prompt (Ctrl+C) and edit server\.env by hand
REM  instead — copy server\.env.example and fill in DB_PASSWORD and
REM  JWT_SECRET yourself.
REM ---------------------------------------------------------------------------

set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "CLIENT=%ROOT%client"

set "FORCE=0"
set "SKIPSEED=0"
:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="-Force"    set "FORCE=1"
if /i "%~1"=="-SkipSeed" set "SKIPSEED=1"
shift
goto :parse_args
:args_done

REM --- Node --------------------------------------------------------------

echo ==^> Checking Node.js

where node >nul 2>&1
if errorlevel 1 (
    echo     Node.js is not installed, or not on your PATH.
    echo     Install Node 20 LTS from https://nodejs.org, then reopen this terminal.
    goto :fail
)

for /f "tokens=1 delims=v." %%V in ('node -v') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% lss 20 (
    for /f "delims=" %%V in ('node -v') do set "NODE_VERSION=%%V"
    echo     Node !NODE_VERSION! found, but this project needs 20 or newer.
    goto :fail
)
echo     Node OK.

REM --- Dependencies --------------------------------------------------------
REM Two installs, because this is a monorepo with separate package.json
REM files. There is no package.json at the root, which is the usual first
REM surprise.

echo.
echo ==^> Installing server dependencies ^(this takes a minute^)
pushd "%SERVER%"
call npm install
if errorlevel 1 (
    popd
    echo     npm install failed in server — see the output above.
    goto :fail
)
popd
echo     Server dependencies installed.

echo.
echo ==^> Installing client dependencies
pushd "%CLIENT%"
call npm install
if errorlevel 1 (
    popd
    echo     npm install failed in client — see the output above.
    goto :fail
)
popd
echo     Client dependencies installed.

REM --- Environment file ------------------------------------------------------

echo.
echo ==^> Configuring server\.env

set "ENV_FILE=%SERVER%\.env"
set "ENV_EXAMPLE=%SERVER%\.env.example"

REM Computed as a flag rather than a chained "if exist ... if ... () else ()" —
REM that construct's else binds to the second if, so when the file does not
REM exist at all the whole thing, else included, is skipped and nothing
REM writes .env. A flag sidesteps the ambiguity.
set "SKIP_ENV=0"
if exist "%ENV_FILE%" if "%FORCE%"=="0" set "SKIP_ENV=1"

if "%SKIP_ENV%"=="1" (
    echo     server\.env already exists — leaving it as it is.
    echo     Pass -Force to replace it.
) else (
    call :write_env
    if errorlevel 1 goto :fail
    echo     Wrote server\.env with a freshly generated JWT secret.
    echo     It is git-ignored and stays on this machine.
)

REM --- Database --------------------------------------------------------------

echo.
echo ==^> Creating the database schema
echo     If this fails, the database itself probably does not exist yet.

pushd "%SERVER%"
call npm run db:migrate
set "MIGRATE_FAILED=%errorlevel%"
popd

if not "%MIGRATE_FAILED%"=="0" (
    echo.
    echo     Migrations did not run.
    echo.
    echo     If the error mentions ECONNREFUSED, MySQL is not running.
    echo     If it mentions an unknown database, create it first — in MySQL
    echo     Workbench, or with:  mysql -u root -p
    echo.
    echo       CREATE DATABASE trailasia CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
    echo       CREATE USER 'trailasia_app'@'localhost' IDENTIFIED BY 'your-password';
    echo       GRANT ALL PRIVILEGES ON trailasia.* TO 'trailasia_app'@'localhost';
    echo       FLUSH PRIVILEGES;
    echo.
    echo     Then run setup.bat again.
    goto :fail
)

echo     Tables created.

REM --- Seed ------------------------------------------------------------------

if "%SKIPSEED%"=="0" (
    echo.
    echo ==^> Seeding staff accounts and destinations
    pushd "%SERVER%"
    call npm run db:seed
    if errorlevel 1 echo     Seeding reported a problem — see above.
    popd
)

REM --- Done ------------------------------------------------------------------

echo.
echo Setup complete.
echo.
echo   Start everything with:
echo       start.bat
echo.

pause
exit /b 0

:fail
echo.
pause
exit /b 1

REM --- Subroutines -------------------------------------------------------

REM Prompts for the MySQL password, generates a JWT secret, and writes
REM server\.env from server\.env.example with those two lines replaced.
REM Kept as its own subroutine, with its own setlocal, so DB_PASSWORD does
REM not linger in the environment once this returns.
:write_env
setlocal
set /p "DB_PASSWORD=MySQL password for the trailasia_app user: "

for /f "delims=" %%S in ('node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"') do set "JWT_SECRET=%%S"
if not defined JWT_SECRET (
    echo     Could not generate a JWT secret — is node on your PATH?
    endlocal
    exit /b 1
)

REM Rebuilt line by line rather than a single find-and-replace, so every
REM other setting, including blank lines, passes through unchanged.
REM findstr /n /r numbers every line, blank ones included, which a plain
REM for /f would otherwise silently skip.
> "%ENV_FILE%" (
    for /f "usebackq tokens=1* delims=:" %%A in (`findstr /n /r "^" "%ENV_EXAMPLE%"`) do (
        set "LINE=%%B"
        set "ISDB="
        set "ISJWT="
        echo(!LINE!| findstr /b "DB_PASSWORD=" >nul && set "ISDB=1"
        echo(!LINE!| findstr /b "JWT_SECRET=" >nul && set "ISJWT=1"
        if defined ISDB (
            echo DB_PASSWORD=!DB_PASSWORD!
        ) else if defined ISJWT (
            echo JWT_SECRET=!JWT_SECRET!
        ) else (
            echo(!LINE!
        )
    )
)

endlocal
exit /b 0
