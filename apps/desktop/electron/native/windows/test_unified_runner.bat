@echo off
setlocal enabledelayedexpansion
title Sony Camera Remote SDK 2.02.00 - Unified Runner Automated Test (Phase 8J-1)

cd /d "%~dp0"

echo =================================================================
echo   SONY UNIFIED NATIVE RUNNER - COMMAND PROTOCOL TEST (PHASE 8J-1)
echo   Target: Sony ILCE-7CM2 (VID 054C / PID 0E8C)
echo =================================================================
echo.

if not exist "build\Release\sony_camera_runner_win.exe" (
    echo [ERROR] Executable not found at build\Release\sony_camera_runner_win.exe!
    echo Please run build_poc.bat first.
    exit /b 1
)

if not exist "build\Release\test_captures" (
    mkdir "build\Release\test_captures"
)

echo [TEST MODE]
echo You can run the unified runner interactively, or feed commands:
echo.
echo COMMANDS SUPPORTED:
echo   START_LIVEVIEW
echo   STOP_LIVEVIEW
echo   CAPTURE test_captures\test_unified_shot.JPG
echo   STATUS
echo   QUIT
echo.

cd build\Release
sony_camera_runner_win.exe "test_captures"
set RUNNER_EXIT=%ERRORLEVEL%
cd /d "%~dp0"

echo.
echo =================================================================
echo   Unified runner exited with code: %RUNNER_EXIT%
echo =================================================================
exit /b %RUNNER_EXIT%
