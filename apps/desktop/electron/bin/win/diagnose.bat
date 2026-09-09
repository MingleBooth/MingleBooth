@echo off
setlocal enabledelayedexpansion
title MingleBooth Windows Camera Communication Diagnostic Suite

echo ================================================================
echo   MINGLEBOOTH WINDOWS CAMERA ENGINE DIAGNOSTIC TOOL
echo ================================================================
echo.

:: Locate bundled gphoto2.exe across all standard locations
set "WIN_BIN="

if exist "%~dp0gphoto2.exe" (
  set "WIN_BIN=%~dp0"
) else if exist "%~dp0..\electron\bin\win\gphoto2.exe" (
  set "WIN_BIN=%~dp0..\electron\bin\win"
) else if exist "%~dp0bin\win\gphoto2.exe" (
  set "WIN_BIN=%~dp0bin\win"
) else if exist "%~dp0resources\app.asar.unpacked\electron\bin\win\gphoto2.exe" (
  set "WIN_BIN=%~dp0resources\app.asar.unpacked\electron\bin\win"
) else if exist "%~dp0..\resources\app.asar.unpacked\electron\bin\win\gphoto2.exe" (
  set "WIN_BIN=%~dp0..\resources\app.asar.unpacked\electron\bin\win"
) else if exist "%LOCALAPPDATA%\Programs\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win\gphoto2.exe" (
  set "WIN_BIN=%LOCALAPPDATA%\Programs\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win"
) else if exist "C:\Program Files\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win\gphoto2.exe" (
  set "WIN_BIN=C:\Program Files\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win"
)

if "%WIN_BIN%"=="" (
  echo [ERROR] Bundled gphoto2.exe could not be located!
  echo Checked:
  echo   - %~dp0
  echo   - %~dp0..\electron\bin\win
  echo   - %LOCALAPPDATA%\Programs\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win
  echo   - C:\Program Files\MingleBooth Studio\resources\app.asar.unpacked\electron\bin\win
  echo.
  pause
  exit /b 1
)

:: Set exact environment used by MingleBooth
set "PATH=%WIN_BIN%;%PATH%"
set "CAMLIBS=%WIN_BIN%\camlibs"
set "IOLIBS=%WIN_BIN%\iolibs"
set "LC_ALL=C"
set "LANG=C"

set "LOG_FILE=%USERPROFILE%\Desktop\minglebooth-camera-diagnostic.txt"
if not exist "%USERPROFILE%\Desktop" (
  set "LOG_FILE=%~dp0minglebooth-camera-diagnostic.txt"
)

echo Logging output to: %LOG_FILE%
echo.

(
echo ================================================================
echo   MINGLEBOOTH WINDOWS CAMERA ENGINE DIAGNOSTIC REPORT
echo   Time: %DATE% %TIME%
echo ================================================================
echo [A] Bundled Executable Path : %WIN_BIN%\gphoto2.exe
echo [B] CAMLIBS Environment     : %CAMLIBS%
echo [C] IOLIBS Environment      : %IOLIBS%
echo.

echo ----------------------------------------------------------------
echo [Step 1/5] Bundled Engine Version (--version)
echo ----------------------------------------------------------------
"%WIN_BIN%\gphoto2.exe" --version
echo exitCode: !ERRORLEVEL!
echo.

echo ----------------------------------------------------------------
echo [Step 2/5] Windows PnP Device & Driver Audit (PowerShell)
echo ----------------------------------------------------------------
powershell -NoProfile -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @('Camera','Image','WPD','USB') -and ($_.InstanceId -match 'VID_054C|VID_04A9|VID_04B0') } | Select-Object FriendlyName, InstanceId, Service, Class, Status | Format-Table -AutoSize"
powershell -NoProfile -Command "Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceID -match 'VID_054C|VID_04A9|VID_04B0' } | Select-Object DeviceName, DriverProviderName, DriverVersion, InfName | Format-Table -AutoSize"
powershell -NoProfile -Command "$p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'ImagingEdge|Remote|Lightroom|EOS|PhotosApp|digiCamControl' } | Select-Object ProcessName, Id; if ($p) { Write-Host 'Competing Camera Software Running:' $p } else { Write-Host 'Competing Software: None detected' }"
echo.

echo ----------------------------------------------------------------
echo [Step 3/5] Engine Auto-Detection (--auto-detect)
echo ----------------------------------------------------------------
echo Running: gphoto2.exe --auto-detect
"%WIN_BIN%\gphoto2.exe" --auto-detect
echo exitCode: !ERRORLEVEL!
echo.
echo Running: gphoto2.exe --usbid 0x054c:0x0eaa=0x054c:0x0d56 --auto-detect
"%WIN_BIN%\gphoto2.exe" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --auto-detect
echo exitCode: !ERRORLEVEL!
echo.

echo ----------------------------------------------------------------
echo [Step 4/5] PTP Summary Handshake (--summary)
echo ----------------------------------------------------------------
echo Running: gphoto2.exe --usbid 0x054c:0x0eaa=0x054c:0x0d56 --summary
"%WIN_BIN%\gphoto2.exe" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --summary
echo exitCode: !ERRORLEVEL!
echo.

echo ----------------------------------------------------------------
echo [Step 5/5] Remote Capture & Download Test
echo ----------------------------------------------------------------
echo Running: gphoto2.exe --usbid 0x054c:0x0eaa=0x054c:0x0d56 --capture-image-and-download --filename="diag_shot.jpg" --keep
"%WIN_BIN%\gphoto2.exe" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --capture-image-and-download --filename="diag_shot.jpg" --keep
echo exitCode: !ERRORLEVEL!
if exist "diag_shot.jpg" (
  echo [SUCCESS] Downloaded file found: diag_shot.jpg
  dir diag_shot.jpg
) else (
  echo [FAIL] File diag_shot.jpg not created.
)
echo.
echo ================================================================
echo   DIAGNOSTIC COMPLETE
echo ================================================================
) > "%LOG_FILE%" 2>&1

type "%LOG_FILE%"

echo.
echo ================================================================
echo Log saved to: %LOG_FILE%
echo Copy and paste the text above into the chat.
echo ================================================================
pause
