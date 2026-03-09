@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

set "BASE_DIR=%~dp0"
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"
set "UPDATE_DIR=!BASE_DIR!\update"
set "CONFIG=!UPDATE_DIR!\update_config.txt"

echo ==============================
echo   MBO Project Leader Update
echo ==============================
echo.

:: config 읽기 (1줄: EXE_URL, 2줄: EXE_PATH)
echo [1/6] config 읽는 중...
if not exist "!CONFIG!" (
    echo [실패] config 파일 없음: !CONFIG!
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
    echo [실패] EXE_URL 비어있음
    goto ERROR
)
if "!EXE_PATH!"=="" (
    echo [실패] EXE_PATH 비어있음
    goto ERROR
)
echo   URL: !EXE_URL!
echo   EXE: !EXE_PATH!
echo.

:: exe 파일명 추출
for %%F in ("!EXE_PATH!") do set "EXE_NAME=%%~nxF"
set "DOWNLOAD_PATH=!UPDATE_DIR!\!EXE_NAME!"

:: 앱 강제 종료
echo [2/6] 앱 종료 중 (!EXE_NAME!)...
taskkill /F /IM "!EXE_NAME!" >nul 2>&1
ping 127.0.0.1 -n 3 >nul
echo   완료
echo.

:: 1. 최신 exe 다운로드 (update 폴더 안에)
echo [3/6] 최신 버전 다운로드 중...
curl -L -o "!DOWNLOAD_PATH!" "!EXE_URL!" --ssl-no-revoke -s
if errorlevel 1 (
    echo   [실패] 다운로드 실패
    goto ERROR
)
if not exist "!DOWNLOAD_PATH!" (
    echo   [실패] 다운로드 파일 없음
    goto ERROR
)
echo   완료
echo.

:: 2. 기존 프로그램 삭제
echo [4/6] 기존 프로그램 삭제 중...
if exist "!EXE_PATH!" (
    del /f /q "!EXE_PATH!" 2>nul
    if exist "!EXE_PATH!" (
        echo   [실패] 삭제 불가
        goto ERROR
    )
)
echo   완료
echo.

:: 3. 다운받은 exe를 원래 경로로 이동
echo [5/6] 새 프로그램 이동 중...
move /Y "!DOWNLOAD_PATH!" "!EXE_PATH!" >nul 2>&1
if not exist "!EXE_PATH!" (
    echo   [실패] 이동 실패
    goto ERROR
)
echo   완료
echo.

:: 4. update 폴더 삭제
rd /s /q "!UPDATE_DIR!" 2>nul

:: 5. 새 프로그램 실행
echo [6/6] 새 프로그램 실행 중...
start "" "!EXE_PATH!"
echo   완료
echo.

echo ==============================
echo   업데이트 성공!
echo ==============================

:: HTA 종료
taskkill /F /IM mshta.exe >nul 2>&1
exit /b 0

:ERROR
echo.
echo ==============================
echo   업데이트 실패!
echo ==============================
taskkill /F /IM mshta.exe >nul 2>&1
pause
exit /b 1
