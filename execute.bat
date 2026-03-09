@echo off
setlocal enabledelayedexpansion

set "BASE_DIR=%~dp0"
if "!BASE_DIR:~-1!"=="\" set "BASE_DIR=!BASE_DIR:~0,-1!"
set "CONFIG=!BASE_DIR!\update\update_config.txt"

:: Read line 2 from update_config.txt (EXE_PATH)
set "EXE_PATH="
set "SKIP="
<"!CONFIG!" (
    set /p SKIP=
    set /p EXE_PATH=
)

if "!EXE_PATH!"=="" exit /b 1

:: Delete update folder
rd /s /q "!BASE_DIR!\update" 2>nul

:: Wait for filesystem to fully settle
ping 127.0.0.1 -n 3 >nul

:: Run the program via explorer (same as double-click, avoids Defender DLL block)
explorer.exe "!EXE_PATH!"
exit /b 0
