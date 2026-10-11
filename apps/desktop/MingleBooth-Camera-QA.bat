@echo off
title MingleBooth Camera QA - Launcher
cd /d "%~dp0"

echo ================================================================
echo   MINGLEBOOTH CAMERA QA - TABLET HARDWARE VALIDATION LAUNCHER
echo ================================================================
echo Membuka MingleBooth Camera QA...

if exist "MingleBooth Studio.exe" (
    start "" "MingleBooth Studio.exe" --qa
    exit /b 0
)

if exist "release\win-unpacked\MingleBooth Studio.exe" (
    start "" "release\win-unpacked\MingleBooth Studio.exe" --qa
    exit /b 0
)

if exist "apps\desktop\release\win-unpacked\MingleBooth Studio.exe" (
    start "" "apps\desktop\release\win-unpacked\MingleBooth Studio.exe" --qa
    exit /b 0
)

if exist "node_modules\electron\dist\electron.exe" (
    start "" "node_modules\electron\dist\electron.exe" electron/main.cjs --qa
    exit /b 0
)

start "" "electron\main.cjs" --qa
exit /b 0
