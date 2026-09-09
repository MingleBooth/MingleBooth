@echo off
setlocal enabledelayedexpansion
title MingleBooth Camera Communication Diagnostic Suite

echo ================================================================
echo   MINGLEBOOTH WINDOWS CAMERA ENGINE DIAGNOSTIC TOOL
echo ================================================================
echo.

:: 1. Locate Node.js or run bundled commands
where node >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [Diagnostic] Node.js found. Running comprehensive diagnostic script...
  node "%~dp0validate-camera-driver.cjs"
  goto :end
)

:: If Node.js is not globally in PATH, check bundled electron directory
echo [Diagnostic] Running standalone CMD diagnostic using bundled gphoto2...
set "WIN_BIN=%~dp0..\electron\bin\win"
if not exist "%WIN_BIN%\gphoto2.exe" (
  set "WIN_BIN=%~dp0bin\win"
)
if not exist "%WIN_BIN%\gphoto2.exe" (
  set "WIN_BIN=%~dp0..\resources\app.asar.unpacked\electron\bin\win"
)

if not exist "%WIN_BIN%\gphoto2.exe" (
  echo [ERROR] Bundled gphoto2.exe not found!
  echo Searched in: %WIN_BIN%
  pause
  exit /b 1
)

set "PATH=%WIN_BIN%;%PATH%"
set "CAMLIBS=%WIN_BIN%\camlibs"
set "IOLIBS=%WIN_BIN%\iolibs"
set "LC_ALL=C"
set "LANG=C"

echo Bundled Executable: %WIN_BIN%\gphoto2.exe
echo CAMLIBS: %CAMLIBS%
echo IOLIBS : %IOLIBS%
echo.

echo [1/4] Running gphoto2.exe --version
"%WIN_BIN%\gphoto2.exe" --version
echo.

echo [2/4] Running Windows PnP Device Check (PowerShell)
powershell -NoProfile -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @('Camera','Image','WPD','USB') -and ($_.InstanceId -match 'VID_054C|VID_04A9|VID_04B0') } | Select-Object FriendlyName, InstanceId, Service, Class, Status | Format-Table -AutoSize"
echo.

echo [3/4] Running gphoto2.exe --auto-detect
"%WIN_BIN%\gphoto2.exe" --auto-detect
echo.

echo [3b/4] Running gphoto2.exe --usbid 0x054c:0x0eaa=0x054c:0x0d56 --auto-detect
"%WIN_BIN%\gphoto2.exe" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --auto-detect
echo.

echo [4/4] Running PTP summary test
"%WIN_BIN%\gphoto2.exe" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --summary
echo.

:end
echo.
echo ================================================================
echo Diagnostic complete. Copy and review the log above.
echo ================================================================
pause
