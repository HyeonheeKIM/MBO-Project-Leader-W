@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

set "BASE_DIR=%~dp0"
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"
set "UPDATE_DIR=!BASE_DIR!\update"
set "CONFIG=!UPDATE_DIR!\update_config.txt"

:: config 읽기 (1줄: EXE_URL, 2줄: EXE_PATH)
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

:: exe 파일명 추출
for %%F in ("!EXE_PATH!") do set "EXE_NAME=%%~nxF"
set "DOWNLOAD_PATH=!UPDATE_DIR!\!EXE_NAME!"

:: 앱 강제 종료
taskkill /F /IM "!EXE_NAME!" >nul 2>&1
ping 127.0.0.1 -n 3 >nul

:: 1. 최신 exe 다운로드 (update 폴더 안에)
curl -L -o "!DOWNLOAD_PATH!" "!EXE_URL!" --ssl-no-revoke -s
if errorlevel 1 goto ERROR
if not exist "!DOWNLOAD_PATH!" goto ERROR

:: 2. 기존 프로그램 삭제
if exist "!EXE_PATH!" (
    del /f /q "!EXE_PATH!" 2>nul
    if exist "!EXE_PATH!" goto ERROR
)

:: 3. 다운받은 exe를 원래 경로로 이동
move /Y "!DOWNLOAD_PATH!" "!EXE_PATH!" >nul 2>&1
if not exist "!EXE_PATH!" goto ERROR

:: 4. update 폴더 삭제
rd /s /q "!UPDATE_DIR!" 2>nul

:: 5. 새 프로그램 실행
start "" "!EXE_PATH!"

:: HTA 종료
taskkill /F /IM mshta.exe >nul 2>&1
exit /b 0

:ERROR
taskkill /F /IM mshta.exe >nul 2>&1
exit /b 1
