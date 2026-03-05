@echo off
chcp 65001 >nul
echo ============================================
echo   MBO Project Leader (Web) - 개발 모드 실행
echo ============================================
echo.

:: Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    pause
    exit /b 1
)

:: pywebview 설치 확인
pip show pywebview >nul 2>&1
if errorlevel 1 (
    echo [설치] pywebview를 설치합니다...
    pip install pywebview
    echo.
)

echo [실행] pywebview 앱을 시작합니다...
echo.
python app.py
pause
