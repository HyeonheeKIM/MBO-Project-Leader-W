@echo off
chcp 65001 >nul
echo ============================================
echo   MBO Project Leader - 배포 스크립트
echo ============================================
echo.

:: app.py에서 현재 버전 읽기
set "VERSION="
for /f "tokens=2 delims== " %%a in ('findstr /c:"__version__ =" src_web\app.py') do set "VERSION=%%a"
set "VERSION=%VERSION:"=%"
if "%VERSION%"=="" (
    echo [오류] src_web\app.py에서 __version__을 읽을 수 없습니다.
    echo        __version__ = "x.x.x" 형식으로 설정되어 있는지 확인하세요.
    pause
    exit /b 1
)
echo https://github.com/HyeonheeKIM/MBO-Project-Leader-W/actions
echo 현재 버전: v%VERSION%
echo.

:: 변경 내용 입력
set /p MSG="변경 내용을 입력하세요: "
if "%MSG%"=="" set MSG=업데이트

echo.
echo ────────────────────────────────
echo  버전: v%VERSION%
echo  메시지: %MSG%
echo ────────────────────────────────
echo.
set /p CONFIRM="배포하시겠습니까? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo 취소되었습니다.
    pause
    exit /b 0
)

echo.
echo [1/4] git add ...
git add .

echo [2/4] git commit ...
git commit -m "v%VERSION% - %MSG%"

:: 기존 태그가 있으면 삭제 후 재생성
echo [3/4] git tag ...
git tag -d v%VERSION% 2>nul
git push origin :refs/tags/v%VERSION% 2>nul
git tag v%VERSION%

echo [4/4] git push ...
git push origin main --tags

echo.
if errorlevel 1 (
    echo [오류] 푸시에 실패했습니다.
    pause
    exit /b 1
)

echo ============================================
echo   배포 완료! v%VERSION%
echo ============================================
echo.
echo   GitHub Actions가 자동으로 EXE를 빌드합니다.
echo   확인: https://github.com/HyeonheeKIM/MBO-Project-Leader-W/actions
echo.
pause
