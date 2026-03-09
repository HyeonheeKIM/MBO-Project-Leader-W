@echo off
setlocal enabledelayedexpansion

set "BASE_DIR=%~dp0"
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"
set "UPDATE_DIR=!BASE_DIR!\update"
set "CONFIG=!UPDATE_DIR!\update_config.txt"

echo ==============================
echo   MBO Project Leader Update
echo ==============================
echo.

:: Read config (line 1: EXE_URL, line 2: EXE_PATH)
echo [1/7] Reading config...
if not exist "!CONFIG!" (
    echo [FAIL] Config not found: !CONFIG!
    goto ERROR
)
set "EXE_URL="
set "EXE_PATH="
<"!CONFIG!" (
    set /p EXE_URL=
    set /p EXE_PATH=
)
if "!EXE_URL!"=="" (
    echo [FAIL] EXE_URL is empty
    goto ERROR
)
if "!EXE_PATH!"=="" (
    echo [FAIL] EXE_PATH is empty
    goto ERROR
)
echo   URL: !EXE_URL!
echo   EXE: !EXE_PATH!
echo.

:: Extract exe filename
for %%F in ("!EXE_PATH!") do set "EXE_NAME=%%~nxF"
set "DOWNLOAD_PATH=!UPDATE_DIR!\!EXE_NAME!"

:: Kill app
echo [2/7] Killing app (!EXE_NAME!)...
taskkill /F /IM "!EXE_NAME!" >nul 2>&1
ping 127.0.0.1 -n 4 >nul
:: Clean orphaned _MEI* temp folders (taskkill /F skips PyInstaller cleanup)
for /d %%D in ("%TEMP%\_MEI*") do (
    rd /s /q "%%D" 2>nul
)
echo   Done
echo.

:: Download latest exe
echo [3/7] Downloading latest version...
curl -L -o "!DOWNLOAD_PATH!" "!EXE_URL!" --ssl-no-revoke -s
if errorlevel 1 (
    echo   [FAIL] Download failed
    goto ERROR
)
if not exist "!DOWNLOAD_PATH!" (
    echo   [FAIL] Downloaded file not found
    goto ERROR
)
echo   Done
echo.

:: Download execute.bat
echo [4/7] Downloading execute.bat...
set "EXECUTE_URL=https://raw.githubusercontent.com/HyeonheeKIM/MBO-Project-Leader-W/main/execute.bat"
curl -L -o "!BASE_DIR!\execute.bat" "!EXECUTE_URL!" --ssl-no-revoke -s
if errorlevel 1 (
    echo   [FAIL] execute.bat download failed
    goto ERROR
)
if not exist "!BASE_DIR!\execute.bat" (
    echo   [FAIL] execute.bat not found
    goto ERROR
)
echo   Done
echo.

:: Delete existing program
echo [5/7] Deleting old program...
if exist "!EXE_PATH!" (
    del /f /q "!EXE_PATH!" 2>nul
    if exist "!EXE_PATH!" (
        echo   [FAIL] Cannot delete
        goto ERROR
    )
)
echo   Done
echo.

:: Move downloaded exe to target path
echo [6/7] Moving new program...
move /Y "!DOWNLOAD_PATH!" "!EXE_PATH!" >nul 2>&1
if not exist "!EXE_PATH!" (
    echo   [FAIL] Move failed
    goto ERROR
)
:: Verify file size - new exe must be larger than 1MB
for %%A in ("!EXE_PATH!") do set "NEW_SIZE=%%~zA"
if !NEW_SIZE! LSS 1000000 (
    echo   [FAIL] File too small: !NEW_SIZE! bytes
    goto ERROR
)
:: Remove Zone.Identifier (Mark of the Web) to prevent SmartScreen popup
echo>nul 2>nul & del /f "!EXE_PATH!:Zone.Identifier" 2>nul
echo   Done (!NEW_SIZE! bytes)
echo.

:: Flush filesystem before launch
ping 127.0.0.1 -n 2 >nul

:: Launch via execute.bat
echo [7/7] Launching new program...
start "" "!BASE_DIR!\execute.bat"
echo   Done
echo.

echo ==============================
echo   Update Success!
echo ==============================

:: Kill HTA
taskkill /F /IM mshta.exe >nul 2>&1
exit /b 0

:ERROR
echo.
echo ==============================
echo   Update Failed!
echo ==============================
taskkill /F /IM mshta.exe >nul 2>&1
pause
exit /b 1
