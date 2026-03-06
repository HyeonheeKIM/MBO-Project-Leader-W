@echo off
chcp 65001 >nul
echo ============================================
echo   MBO Project Leader (Web) - EXE 빌드 스크립트
echo ============================================
echo.

:: Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    pause
    exit /b 1
)

:: 필수 패키지 설치
echo [설치] 필요한 패키지를 확인합니다...
pip install pywebview pyinstaller >nul 2>&1
echo.

:: 빌드 디렉토리 정리
if exist "dist" rmdir /s /q dist
if exist "build" rmdir /s /q build

echo [빌드] EXE 파일을 생성합니다...
echo.

pyinstaller ^
    --noconfirm ^
    --onefile ^
    --windowed ^
    --name "MBO_Project_Leader" ^
    --add-data "index.html;." ^
    --add-data "static;static" ^
    --add-data "notification.md;." ^
    --add-data "version.dat;." ^
    --hidden-import "webview" ^
    --hidden-import "sqlite3" ^
    --hidden-import "clr" ^
    app.py

if errorlevel 1 (
    echo.
    echo [오류] 빌드에 실패했습니다.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   ✅ 빌드 완료!
echo   EXE 위치: dist\MBO_Project_Leader.exe
echo ============================================
echo.
echo   사용법:
echo   1. dist\MBO_Project_Leader.exe 를 원하는 위치에 복사
echo   2. 더블클릭으로 실행
echo   3. 네이티브 윈도우에서 MBO 관리 화면이 열립니다
echo   4. 윈도우를 닫으면 프로그램이 종료됩니다
echo.
pause
