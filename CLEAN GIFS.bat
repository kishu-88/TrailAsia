@echo off
if "%~1"=="__go__" goto begin
cmd /k ""%~f0" __go__"
exit /b

:begin
setlocal EnableDelayedExpansion
title Remove rope from GIFs
cd /d "%~dp0"

set "FOLDER=%~dp0"
if "%FOLDER:~-1%"=="\" set "FOLDER=%FOLDER:~0,-1%"

echo Folder: %FOLDER%
echo.

set "PY="
call :try "py -3"
if not defined PY call :try "python"
if not defined PY call :try "python3"
if not defined PY call :scan "%LOCALAPPDATA%\Programs\Python"
if not defined PY call :scan "%ProgramFiles%\Python313"
if not defined PY call :scan "%ProgramFiles%\Python312"
if defined PY goto found

echo   Python is not installed.
echo   Get it from https://www.python.org/downloads/
echo   Tick "Add python.exe to PATH" during setup, then run this again.
goto done

:found
echo Using: %PY%
echo.

%PY% -c "import numpy,cv2,PIL,imageio_ffmpeg" >nul 2>&1
if not errorlevel 1 goto libs_ok

echo Downloading libraries ^(about 150 MB, first run only^)...
echo If the connection drops, just run this file again - it resumes.
echo.
%PY% -m pip install --disable-pip-version-check --retries 10 --timeout 60 numpy opencv-python-headless pillow imageio-ffmpeg
echo.
%PY% -c "import numpy,cv2,PIL,imageio_ffmpeg" >nul 2>&1
if not errorlevel 1 goto libs_ok

echo.
echo   [ERROR] Libraries did not finish downloading. Check your
echo   internet connection and run this file again.
goto done

:libs_ok
echo Libraries ready.
echo.
%PY% "%FOLDER%\derope_gifs.py" "%FOLDER%"

:done
echo.
echo ==== finished - close this window when done ====
exit /b

:try
%~1 -c "import sys;print(sys.version_info[0])" >"%TEMP%\pychk.txt" 2>nul
if errorlevel 1 exit /b
set /p V=<"%TEMP%\pychk.txt"
if "%V%"=="3" set "PY=%~1"
exit /b

:scan
if not exist "%~1" exit /b
for /f "delims=" %%P in ('dir /b /s "%~1\python.exe" 2^>nul') do (
    if not defined PY set "PY=%%P"
)
exit /b
