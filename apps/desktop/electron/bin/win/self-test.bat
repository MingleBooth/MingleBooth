@echo off
setlocal enabledelayedexpansion
title MingleBooth Windows Camera Engine Startup Self-Test

echo ================================================================
echo   MINGLEBOOTH WINDOWS CAMERA ENGINE STARTUP SELF-TEST
echo ================================================================
echo.

set "BIN_DIR=%~dp0"
set "PATH=%BIN_DIR%;%PATH%"
set "CAMLIBS=%BIN_DIR%camlibs"
set "IOLIBS=%BIN_DIR%iolibs"
set "LC_ALL=C"
set "LANG=C"

echo Target Binary: %BIN_DIR%gphoto2.exe
echo CAMLIBS     : %CAMLIBS%
echo IOLIBS      : %IOLIBS%
echo.

if not exist "%BIN_DIR%gphoto2.exe" (
  echo [ERROR] gphoto2.exe not found in %BIN_DIR%!
  echo.
  echo ENGINE START:
  echo FAIL
  echo.
  pause
  exit /b 1
)

echo Running: gphoto2.exe --version ...
echo.

"%BIN_DIR%gphoto2.exe" --version > "%TEMP%\gphoto_ver_out.txt" 2> "%TEMP%\gphoto_ver_err.txt"
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% EQU 0 (
  echo ================================================================
  echo ENGINE START:
  echo PASS
  echo.
  echo DLL LOAD:
  echo PASS
  echo.
  echo ENGINE VERSION:
  type "%TEMP%\gphoto_ver_out.txt"
  echo ================================================================
  echo [SUCCESS] Bundled camera engine is operating correctly on this Windows machine.
  echo exitCode: 0
) else (
  echo ================================================================
  echo ENGINE START:
  echo FAIL
  echo.
  echo DLL LOAD:
  echo FAIL
  echo.
  echo exitCode: %EXIT_CODE%
  echo.
  if %EXIT_CODE% EQU -1073741515 (
    echo [ERROR 0xC0000135]: STATUS_DLL_NOT_FOUND
    echo One or more required DLL files could not be located in this directory.
  )
  echo STDERR:
  type "%TEMP%\gphoto_ver_err.txt"
  echo STDOUT:
  type "%TEMP%\gphoto_ver_out.txt"
  echo ================================================================
  echo [FAIL] Engine could not start. Check missing DLL dependencies.
)

echo.
del "%TEMP%\gphoto_ver_out.txt" 2>nul
del "%TEMP%\gphoto_ver_err.txt" 2>nul
pause
exit /b %EXIT_CODE%
