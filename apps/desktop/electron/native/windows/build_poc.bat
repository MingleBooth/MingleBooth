@echo off
setlocal enabledelayedexpansion
title Sony Camera Remote SDK 2.02.00 - Windows POC Builder

echo =================================================================
echo   SONY CAMERA REMOTE SDK 2.02.00 - WINDOWS POC BUILDER (PHASE 8)
echo   Target: Sony ILCE-7CM2 (VID 054C / PID 0E8C)
echo   Platform: Windows 10 Pro x64 (MSVC 2022 / C++17)
echo =================================================================

cd /d "%~dp0"

echo [1/3] Checking prerequisites...
where cmake >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] CMake is not found in PATH!
    echo Please install CMake or run from Visual Studio Command Prompt with CMake installed.
    exit /b 1
)

echo       CMake found. Creating build directory...
if not exist "build" mkdir build

echo [2/3] Configuring CMake project (Release x64)...
cmake -B build -A "x64" -T "host=x64" .
if %ERRORLEVEL% neq 0 (
    echo [WARN] -A x64 with host=x64 failed, falling back to default x64 configuration...
    cmake -B build -A "x64" .
    if %ERRORLEVEL% neq 0 (
        echo [WARN] Multi-config generator failed, attempting standard generator...
        cmake -B build -DCMAKE_BUILD_TYPE=Release .
        if %ERRORLEVEL% neq 0 (
            echo [ERROR] CMake configuration failed! Ensure MSVC C++ tools are installed.
            exit /b 2
        )
    )
)

echo [3/3] Compiling Release binary...
cmake --build build --config Release
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Compilation failed!
    exit /b 3
)

REM Verify DLL deployment to output directory
if exist "build\Release" (
    if not exist "build\Release\Cr_Core.dll" (
        echo Deploying Cr_Core.dll to build\Release...
        copy /y "lib\Cr_Core.dll" "build\Release\" >nul
    )
    if not exist "build\Release\CrAdapter" (
        echo Deploying CrAdapter to build\Release...
        xcopy /e /i /y "lib\CrAdapter" "build\Release\CrAdapter\" >nul
    )
    if exist "build\Release\sony_camera_runner_win.exe" (
        copy /y "build\Release\sony_camera_runner_win.exe" "build\Release\sony_camera_runner.exe" >nul
        copy /y "build\Release\sony_camera_runner_win.exe" "sony_camera_runner.exe" >nul
    )
)

echo =================================================================
echo   BUILD SUCCESSFUL!
echo   Executable: build\Release\sony_camera_runner_win.exe
echo   Alias:      build\Release\sony_camera_runner.exe
echo =================================================================
exit /b 0
