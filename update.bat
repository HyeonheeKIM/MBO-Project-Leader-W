@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

:: ============================================
::   MBO Project Leader - Auto Update
:: ============================================

set "BASE_DIR=%~dp0"
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"
set "UPDATE_DIR=!BASE_DIR!\update"
set "CONFIG=!UPDATE_DIR!\update_config.txt"

:: Ensure update directory exists
if not exist "!UPDATE_DIR!" mkdir "!UPDATE_DIR!" 2>nul

:: ──── Read Config ────
if not exist "!CONFIG!" goto ERROR
set "EXE_URL="
set "EXE_PATH="
set "LINE_NUM=0"
for /f "usebackq delims=" %%a in ("!CONFIG!") do (
    set /a LINE_NUM+=1
    if !LINE_NUM!==1 set "EXE_URL=%%a"
    if !LINE_NUM!==2 set "EXE_PATH=%%a"
)
if "!EXE_URL!"=="" goto ERROR
if "!EXE_PATH!"=="" goto ERROR

:: Extract exe filename
for %%F in ("!EXE_PATH!") do set "EXE_NAME=%%~nxF"
set "DOWNLOAD_PATH=!UPDATE_DIR!\!EXE_NAME!"

:: ──── Wait for app to close ────
set "WAIT_COUNT=0"
:WAIT_LOOP
tasklist /FI "IMAGENAME eq !EXE_NAME!" 2>nul | find /I "!EXE_NAME!" >nul
if not errorlevel 1 (
    set /a WAIT_COUNT+=1
    if !WAIT_COUNT! GEQ 30 goto ERROR
    ping 127.0.0.1 -n 2 >nul
    goto WAIT_LOOP
)

:: ──── Step 1: Download latest exe ────
powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { (New-Object Net.WebClient).DownloadFile('!EXE_URL!','!DOWNLOAD_PATH!'); 'OK' } catch { $_.Exception.Message }" > "!UPDATE_DIR!\dl_result.txt" 2>&1
set /p DL_RESULT=<"!UPDATE_DIR!\dl_result.txt"
del "!UPDATE_DIR!\dl_result.txt" 2>nul
if /I not "!DL_RESULT!"=="OK" goto ERROR
if not exist "!DOWNLOAD_PATH!" goto ERROR

:: ──── Step 2: Delete existing program ────
if exist "!EXE_PATH!" (
    del /f /q "!EXE_PATH!" 2>nul
    if exist "!EXE_PATH!" goto ERROR
)

:: ──── Step 3: Move downloaded program ────
move /Y "!DOWNLOAD_PATH!" "!EXE_PATH!" >nul 2>&1
if not exist "!EXE_PATH!" goto ERROR

:: ──── Step 4: Run the new program ────
start "" "!EXE_PATH!"

:: ──── Step 5: Kill update_message.hta ────
taskkill /F /IM mshta.exe >nul 2>&1

:: ──── Step 6: Cleanup ────
ping 127.0.0.1 -n 3 >nul
rd /s /q "!UPDATE_DIR!" 2>nul
exit /b 0

:ERROR
taskkill /F /IM mshta.exe >nul 2>&1
exit /b 1