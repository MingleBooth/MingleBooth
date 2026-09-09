@echo off
setlocal enabledelayedexpansion
title MingleBooth Windows Camera & USB Interface Diagnostic Suite

echo ================================================================
echo   MINGLEBOOTH WINDOWS CAMERA & USB INTERFACE DIAGNOSTIC TOOL
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

set "GPHOTO_DEBUG_LOG=%TEMP%\minglebooth_gphoto_debug.txt"
if exist "%GPHOTO_DEBUG_LOG%" del "%GPHOTO_DEBUG_LOG%" 2>nul

echo Logging output to: %LOG_FILE%
echo.

(
echo ================================================================
echo   MINGLEBOOTH WINDOWS CAMERA & USB INTERFACE DIAGNOSTIC REPORT
echo   Time: %DATE% %TIME%
echo ================================================================
echo [A] Bundled Executable Path : %WIN_BIN%\gphoto2.exe
echo [B] CAMLIBS Environment     : %CAMLIBS%
echo [C] IOLIBS Environment      : %IOLIBS%
echo [D] Diagnostic Log Target   : %LOG_FILE%
echo.

echo ----------------------------------------------------------------
echo [Step 1/6] Bundled Engine Version (--version)
echo ----------------------------------------------------------------
"%WIN_BIN%\gphoto2.exe" --version
echo exitCode: !ERRORLEVEL!
echo.

echo ----------------------------------------------------------------
echo [Step 2/6] Windows PnP Device & Driver Stack Audit
echo ----------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @('Camera','Image','WPD','USB') -and ($_.InstanceId -match 'VID_054C|VID_04A9|VID_04B0') } | Select-Object FriendlyName, InstanceId, Service, Class, Status | Format-Table -AutoSize"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceID -match 'VID_054C|VID_04A9|VID_04B0' } | Select-Object DeviceName, DriverProviderName, DriverVersion, InfName | Format-Table -AutoSize"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'ImagingEdge|Remote|Lightroom|EOS|PhotosApp|digiCamControl|WUDFHost' } | Select-Object ProcessName, Id; if ($p) { Write-Host 'Running Imaging / WPD Processes:' $p } else { Write-Host 'No Competing Processes Detected' }"
echo.

echo ----------------------------------------------------------------
echo [Step 3/6] Dedicated Windows USB & Libusb-1.0 Native Interface Probe
echo ----------------------------------------------------------------
if exist "%~dp0diagnose-usb-interfaces.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-usb-interfaces.ps1" -BinDir "%WIN_BIN%"
) else if exist "%WIN_BIN%\diagnose-usb-interfaces.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%WIN_BIN%\diagnose-usb-interfaces.ps1" -BinDir "%WIN_BIN%"
) else (
  echo [WARN] diagnose-usb-interfaces.ps1 not found, running inline PowerShell probe...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$dev = Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_054C' }; if ($dev) { Write-Host 'Sony Camera InstanceId:' $dev.InstanceId; Write-Host 'Service:' $dev.Service; Write-Host 'Class:' $dev.Class } else { Write-Host 'No Sony Camera detected' }"
)
echo.

echo ----------------------------------------------------------------
echo [Step 4/6] Engine Auto-Detection & PTP Handshake (--auto-detect, --summary)
echo ----------------------------------------------------------------
echo Running: gphoto2.exe --auto-detect
"%WIN_BIN%\gphoto2.exe" --auto-detect
echo exitCode: !ERRORLEVEL!
echo.
echo Running: gphoto2.exe --usbid 0x054c:0x0eaa=0x054c:0x0d56 --auto-detect
"%WIN_BIN%\gphoto2.exe" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --auto-detect
echo exitCode: !ERRORLEVEL!
echo.
echo Running: gphoto2.exe --debug --debug-logfile="%GPHOTO_DEBUG_LOG%" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --summary
"%WIN_BIN%\gphoto2.exe" --debug --debug-logfile="%GPHOTO_DEBUG_LOG%" --usbid 0x054c:0x0eaa=0x054c:0x0d56 --summary
echo exitCode: !ERRORLEVEL!
echo.

echo ----------------------------------------------------------------
echo [Step 5/6] Extraction of libusb & libgphoto2 Internal Debug Trace
echo ----------------------------------------------------------------
if exist "%GPHOTO_DEBUG_LOG%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content '%GPHOTO_DEBUG_LOG%' | Where-Object { $_ -match 'libusb|claim|interface|open|ptp|error' } | Select-Object -Last 35"
) else (
  echo No gphoto debug log generated.
)
echo.

echo ----------------------------------------------------------------
echo [Step 6/6] Remote Capture & Download Test
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
echo   DIAGNOSTIC SUMMARY & CONCLUSION
echo ================================================================
echo If Step 1 exits with 0 and Step 4 fails with 'Could not claim interface 0':
echo   ROOT CAUSE: A. Windows WPD/MTP driver conflict
echo   REASON    : Windows PnP binds WUDFWpdMtp (wpdmtp.inf) to Interface 0.
echo               WUDFWpdMtp claims exclusive access for Windows Explorer/WPD
echo               and does NOT expose WinUSB endpoints needed by libusb-1.0.
echo ================================================================
) > "%LOG_FILE%" 2>&1

type "%LOG_FILE%"

echo.
echo ================================================================
echo Log saved to: %LOG_FILE%
echo Copy and paste the text above into the chat.
echo ================================================================
pause
