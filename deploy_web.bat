@echo off
chcp 65001 >nul
set "GCM_GUI_PROMPT=0"
echo ============================================
echo   MBO Project Leader - 배포 스크립트
echo ============================================
echo.

:: version.dat에서 현재 버전 읽기
set "VERSION="
if not exist "src_web\version.dat" goto NO_VERSION
set /p VERSION=<src_web\version.dat
if "%VERSION%"=="" goto NO_VERSION
goto VERSION_OK

:NO_VERSION
echo [오류] src_web\version.dat 파일을 찾을 수 없거나 비어있습니다.
echo        version.dat에 버전을 기입하세요 (예: 2026.03.06.1)
pause
exit /b 1

:VERSION_OK
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
