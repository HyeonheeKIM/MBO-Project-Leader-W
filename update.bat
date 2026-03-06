@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================
::   MBO Project Leader - Auto Update
:: ============================================

set "BASE_DIR=%~dp0"
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"
set "UPDATE_DIR=!BASE_DIR!\update"
set "LOG=!UPDATE_DIR!\update_log.txt"
set "CONFIG=!UPDATE_DIR!\update_config.txt"

:: Initialize log
echo ============================================> "!LOG!"
echo   MBO Project Leader - Update Log>> "!LOG!"
echo   Started: %date% %time%>> "!LOG!"
echo ============================================>> "!LOG!"
echo.>> "!LOG!"

:: ──── Read Config ────
echo [INPUT] Reading config: !CONFIG!>> "!LOG!"
if not exist "!CONFIG!" (
    echo [FAIL] Config file not found>> "!LOG!"
    goto ERROR
)
set "EXE_URL="
set "EXE_PATH="
set "LINE_NUM=0"
for /f "usebackq delims=" %%a in ("!CONFIG!") do (
    set /a LINE_NUM+=1
    if !LINE_NUM!==1 set "EXE_URL=%%a"
    if !LINE_NUM!==2 set "EXE_PATH=%%a"
)
if "!EXE_URL!"=="" (
    echo [FAIL] EXE_URL is empty>> "!LOG!"
    goto ERROR
)
if "!EXE_PATH!"=="" (
    echo [FAIL] EXE_PATH is empty>> "!LOG!"
    goto ERROR
)
echo [RESULT] EXE_URL=!EXE_URL!>> "!LOG!"
echo [RESULT] EXE_PATH=!EXE_PATH!>> "!LOG!"
echo.>> "!LOG!"

:: Extract exe filename
for %%F in ("!EXE_PATH!") do set "EXE_NAME=%%~nxF"
set "DOWNLOAD_PATH=!UPDATE_DIR!\!EXE_NAME!"

:: ──── Wait for app to close ────
echo [INPUT] Waiting for !EXE_NAME! to close...>> "!LOG!"
set "WAIT_COUNT=0"
:WAIT_LOOP
tasklist /FI "IMAGENAME eq !EXE_NAME!" 2>nul | find /I "!EXE_NAME!" >nul
if not errorlevel 1 (
    set /a WAIT_COUNT+=1
    if !WAIT_COUNT! GEQ 30 (
        echo [FAIL] App did not close after 30 seconds>> "!LOG!"
        goto ERROR
    )
    timeout /t 1 /nobreak >nul
    goto WAIT_LOOP
)
echo [RESULT] App closed (waited !WAIT_COUNT! seconds)>> "!LOG!"
echo.>> "!LOG!"

:: ──── Step 1: Download latest exe ────
echo ---- Step 1: Download ---->> "!LOG!"
echo [INPUT] URL: !EXE_URL!>> "!LOG!"
echo [INPUT] Save to: !DOWNLOAD_PATH!>> "!LOG!"
echo [TRY] Downloading...>> "!LOG!"
powershell -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { (New-Object Net.WebClient).DownloadFile('!EXE_URL!','!DOWNLOAD_PATH!'); 'OK' } catch { $_.Exception.Message }" > "!UPDATE_DIR!\dl_result.txt" 2>&1
set /p DL_RESULT=<"!UPDATE_DIR!\dl_result.txt"
del "!UPDATE_DIR!\dl_result.txt" 2>nul
if /I not "!DL_RESULT!"=="OK" (
    echo [FAIL] Download failed: !DL_RESULT!>> "!LOG!"
    goto ERROR
)
if not exist "!DOWNLOAD_PATH!" (
    echo [FAIL] Downloaded file not found>> "!LOG!"
    goto ERROR
)
for %%F in ("!DOWNLOAD_PATH!") do echo [RESULT] Downloaded: %%~zF bytes>> "!LOG!"
echo [SUCCESS] Download complete>> "!LOG!"
echo.>> "!LOG!"

:: ──── Step 2: Delete existing program ────
echo ---- Step 2: Delete existing ---->> "!LOG!"
echo [INPUT] Target: !EXE_PATH!>> "!LOG!"
echo [TRY] Deleting...>> "!LOG!"
if exist "!EXE_PATH!" (
    del /f /q "!EXE_PATH!" 2>>"!LOG!"
    if exist "!EXE_PATH!" (
        echo [FAIL] Could not delete existing program>> "!LOG!"
        goto ERROR
    )
    echo [SUCCESS] Existing program deleted>> "!LOG!"
) else (
    echo [RESULT] Existing program not found, skipping>> "!LOG!"
)
echo.>> "!LOG!"

:: ──── Step 3: Move downloaded program ────
echo ---- Step 3: Move to target ---->> "!LOG!"
echo [INPUT] From: !DOWNLOAD_PATH!>> "!LOG!"
echo [INPUT] To: !EXE_PATH!>> "!LOG!"
echo [TRY] Moving...>> "!LOG!"
move /Y "!DOWNLOAD_PATH!" "!EXE_PATH!" >>"!LOG!" 2>&1
if not exist "!EXE_PATH!" (
    echo [FAIL] Move failed>> "!LOG!"
    goto ERROR
)
echo [SUCCESS] Move complete>> "!LOG!"
echo.>> "!LOG!"

:: ──── Step 4: Run the new program ────
echo ---- Step 4: Run new program ---->> "!LOG!"
echo [TRY] Starting: !EXE_PATH!>> "!LOG!"
start "" "!EXE_PATH!"
echo [SUCCESS] New program started>> "!LOG!"
echo.>> "!LOG!"

:: ──── Step 5: Kill update_message.hta ────
echo ---- Step 5: Kill HTA ---->> "!LOG!"
echo [TRY] Killing mshta.exe...>> "!LOG!"
taskkill /F /IM mshta.exe >nul 2>&1
echo [SUCCESS] HTA killed>> "!LOG!"
echo.>> "!LOG!"

:: ──── Step 6: Cleanup ────
echo ---- Step 6: Cleanup ---->> "!LOG!"
echo [TRY] Deleting update folder...>> "!LOG!"
echo ============================================>> "!LOG!"
echo   Update completed: %date% %time%>> "!LOG!"
echo ============================================>> "!LOG!"
timeout /t 2 /nobreak >nul
rd /s /q "!UPDATE_DIR!" 2>nul
exit /b 0

:ERROR
echo.>> "!LOG!"
echo ============================================>> "!LOG!"
echo   UPDATE FAILED: %date% %time%>> "!LOG!"
echo ============================================>> "!LOG!"
taskkill /F /IM mshta.exe >nul 2>&1
exit /b 1