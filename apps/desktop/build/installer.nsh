; ==============================================================================
; MingleBooth Studio — Custom NSIS Installer Script
; Prepared for Phase 3: One-Time Camera Driver Setup (if required)
; ==============================================================================

!include "LogicLib.nsh"
!include "FileFunc.nsh"

; ------------------------------------------------------------------------------
; Pre-installation initialization
; ------------------------------------------------------------------------------
!macro customInit
  ; Ensure only one instance of MingleBooth is running during install
  System::Call 'kernel32::CreateMutex(i 0, i 0, t "MingleBoothStudioInstallMutex") i .r1 ?e'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "MingleBooth Studio sedang berjalan. Silakan tutup aplikasi sebelum melanjutkan instalasi."
    Abort
  ${EndIf}
!macroend

; ------------------------------------------------------------------------------
; Post-installation hook (runs elevated if installer has admin rights)
; ------------------------------------------------------------------------------
!macro customInstall
  DetailPrint "Menyiapkan integrasi hardware MingleBooth Studio..."

  ; Phase 3 Architecture:
  ; If future driver setup is needed for specific cameras (WinUSB),
  ; the one-time silent setup helper will be invoked here during installation.
  ;
  ; Example:
  ; IfFileExists "$INSTDIR\resources\app.asar.unpacked\electron\bin\win\setup-camera-driver.exe" 0 +3
  ;   DetailPrint "Menyiapkan driver kamera studio..."
  ;   ExecWait '"$INSTDIR\resources\app.asar.unpacked\electron\bin\win\setup-camera-driver.exe" /SILENT'
  
  DetailPrint "Integrasi hardware selesai."
!macroend

; ------------------------------------------------------------------------------
; Uninstaller hook
; ------------------------------------------------------------------------------
!macro customUnInstall
  DetailPrint "Membersihkan konfigurasi MingleBooth Studio..."
!macroend
