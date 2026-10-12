@echo off
title Sync to External Drive
setlocal

REM ============================================================
REM  One-way sync: PC folder  ->  external drive
REM  Copies new and changed files. NEVER deletes anything.
REM
REM  First run: it asks for the two folders and remembers them.
REM  After that: just double-click and it runs.
REM  To change the folders later: delete sync-config.txt
REM ============================================================

set "CFG=%~dp0sync-config.txt"
set "LOG=%~dp0sync-log.txt"
set "SOURCE="
set "DEST="

if not exist "%CFG%" goto setup
for /f "usebackq tokens=1* delims==" %%A in ("%CFG%") do set "%%A=%%B"
if not defined SOURCE goto setup
if not defined DEST goto setup
goto run

:setup
echo.
echo   ---------------- FIRST RUN SETUP ----------------
echo   Tip: you can drag a folder from Explorer into this
echo   window instead of typing the path.
echo.
set /p "SOURCE=  PC folder to sync FROM : "
set /p "DEST=  Folder on the drive TO  : "
set "SOURCE=%SOURCE:"=%"
set "DEST=%DEST:"=%"
if "%SOURCE%"=="" goto badinput
if "%DEST%"=="" goto badinput
if "%SOURCE:~-1%"=="\" set "SOURCE=%SOURCE:~0,-1%"
if "%DEST:~-1%"=="\" set "DEST=%DEST:~0,-1%"
> "%CFG%" echo SOURCE=%SOURCE%
>>"%CFG%" echo DEST=%DEST%
echo.
echo   Saved. Next time it will run straight away.

:run
echo.
echo   FROM : %SOURCE%
echo   TO   : %DEST%
echo.

if not exist "%SOURCE%\" goto nosource
for %%D in ("%DEST%") do set "DRIVE=%%~dD"
if not exist "%DRIVE%\" goto nodrive

echo   Syncing, please wait...
echo.
robocopy "%SOURCE%" "%DEST%" /E /XO /DCOPY:DAT /R:2 /W:2 /MT:16 /NP /TEE /LOG+:"%LOG%"

if %ERRORLEVEL% GEQ 8 goto failed
echo.
echo   [DONE] Sync complete.
goto end

:badinput
echo.
echo   [ERROR] Both folders are required. Nothing was saved.
goto end

:nosource
echo   [ERROR] PC folder not found. Delete sync-config.txt and run again.
goto end

:nodrive
echo   [ERROR] Drive %DRIVE% is not connected. Plug it in and try again.
goto end

:failed
echo.
echo   [FAILED] Some files could not be copied. See sync-log.txt
goto end

:end
echo.
pause
endlocal
