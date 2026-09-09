<#
.SYNOPSIS
    MingleBooth Camera Driver Elevated Installation Helper (Development / QA)
.DESCRIPTION
    Installs scoped WinUSB driver for Sony ILCE-7CM2 (054C:0E8C):
      1. Enforces explicit Administrator privileges (UAC)
      2. Executes strict preflight hardware audit
      3. Backs up original PnP driver state to JSON
      4. Installs MingleBoothCamera.inf targeting USB\VID_054C&PID_0E8C
      5. Restarts device node dynamically via pnputil
      6. Performs non-destructive PnP verification
      7. Automatically rolls back on failure
#>

[CmdletBinding()]
param(
    [string]$InfPath = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$LOG_DIR = "$env:LOCALAPPDATA\MingleBooth"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = "$LOG_DIR\driver-helper.log"
$BACKUP_FILE = "$LOG_DIR\driver-backup.json"

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $Message" | Out-File -FilePath $LOG_FILE -Append -Encoding utf8
    Write-Host "[$ts] $Message" -ForegroundColor $Color
}

Write-Log "================================================================" "Cyan"
Write-Log "  MINGLEBOOTH ELEVATED DRIVER INSTALLATION HELPER" "Cyan"
Write-Log "================================================================" "Cyan"

# 1. Elevation Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Log "[ERROR] Administrator privileges required. Elevation denied or cancelled." "Red"
    exit 2
}

# 2. Locate INF File
if (-not $InfPath -or -not (Test-Path $InfPath)) {
    $candidates = @(
        "$PSScriptRoot\MingleBoothCamera.inf",
        "$PSScriptRoot\..\driver-dev\MingleBoothCamera.inf",
        "$PSScriptRoot\driver-dev\MingleBoothCamera.inf"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $InfPath = (Resolve-Path $c).Path
            break
        }
    }
}

if (-not $InfPath -or -not (Test-Path $InfPath)) {
    Write-Log "[ERROR] Could not find MingleBoothCamera.inf!" "Red"
    exit 4
}
Write-Log "Using Driver INF: $InfPath" "Yellow"

# 3. Preflight Hardware Audit
Write-Log ""
Write-Log "[Step 1/5] Executing Preflight Hardware Audit..." "White"

$preflightScript = "$PSScriptRoot\preflight-check.ps1"
if (Test-Path $preflightScript) {
    $preflightJson = & powershell -NoProfile -ExecutionPolicy Bypass -File $preflightScript -AsJson
    try {
        $preflight = $preflightJson | ConvertFrom-Json
        if (-not $preflight.PreflightPassed) {
            Write-Log "[ABORT] Preflight check failed! Target device does not match supported camera profile." "Red"
            foreach ($reason in $preflight.FailReasons) {
                Write-Log "  - $reason" "Red"
            }
            exit 1
        }
        $targetInstanceId = $preflight.ActualInstanceId
        Write-Log "Preflight Passed for: $($preflight.CameraModel)" "Green"
        Write-Log "Target Instance ID  : $targetInstanceId" "White"
    } catch {
        Write-Log "[ERROR] Failed to parse preflight output: $($_.Exception.Message)" "Red"
        exit 1
    }
} else {
    Write-Log "[ERROR] preflight-check.ps1 not found!" "Red"
    exit 1
}

# 4. Backup Original Driver State
Write-Log ""
Write-Log "[Step 2/5] Backing Up Original PnP Driver State..." "White"
$driverInfo = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object {
    $_.DeviceID -eq $targetInstanceId
}
$devCurrent = Get-PnpDevice -InstanceId $targetInstanceId -ErrorAction SilentlyContinue

$backupData = [ordered]@{
    InstanceId        = $targetInstanceId
    HardwareId        = "USB\VID_054C&PID_0E8C"
    OriginalDriverInf = if ($driverInfo) { $driverInfo.InfName } else { "wpdmtp.inf" }
    OriginalService   = if ($devCurrent) { $devCurrent.Service } else { "WUDFWpdMtp" }
    OriginalClass     = if ($devCurrent) { $devCurrent.Class } else { "WPD" }
    Timestamp         = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
}
$backupData | ConvertTo-Json | Set-Content -Path $BACKUP_FILE -Encoding utf8
Write-Log "Original state backed up to: $BACKUP_FILE" "Green"

# 5. Install Scoped WinUSB Package via pnputil
Write-Log ""
Write-Log "[Step 3/5] Installing Scoped WinUSB Package via pnputil..." "White"
$installOut = & pnputil /add-driver "$InfPath" /install 2>&1
$installExit = $LASTEXITCODE

Write-Log "pnputil output:`n$($installOut -join "`n")" "Yellow"

if ($installExit -ne 0) {
    Write-Log "[ERROR] pnputil driver installation returned exit code: $installExit" "Red"
    exit 4
}

# 6. Restart Device Node
Write-Log ""
Write-Log "[Step 4/5] Dynamically Restarting Device Node ($targetInstanceId)..." "White"
$restartOut = & pnputil /restart-device "$targetInstanceId" 2>&1
$restartExit = $LASTEXITCODE

Write-Log "pnputil restart output:`n$($restartOut -join "`n")" "Yellow"

# Allow PnP stack to stabilize
Start-Sleep -Seconds 2

# 7. Non-Destructive Post-Install Verification (Tier 1: PnP State)
Write-Log ""
Write-Log "[Step 5/5] Performing Non-Destructive Post-Install PnP Verification..." "White"
$devAfter = Get-PnpDevice -InstanceId $targetInstanceId -ErrorAction SilentlyContinue

if (-not $devAfter) {
    Write-Log "[ERROR] Device not found after restart! Triggering automatic rollback..." "Red"
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\rollback-camera-driver.ps1" -InstanceId "$targetInstanceId"
    exit 3
}

Write-Log "Device Status : $($devAfter.Status)"
Write-Log "Device Service: $($devAfter.Service)"
Write-Log "Device Class  : $($devAfter.Class)"

$isWinUsb = ($devAfter.Service -eq "WinUSB")
$isOk = ($devAfter.Status -eq "OK")

if ($isWinUsb -and $isOk) {
    Write-Log "================================================================" "Green"
    Write-Log "  DRIVER INSTALLATION SUCCESS: WinUSB is Active & Functional!" "Green"
    Write-Log "  Device is ready for libusb-1.0 and gphoto2 communication." "Green"
    Write-Log "================================================================" "Green"
    exit 0
} else {
    Write-Log "[ERROR] Verification failed! Service is '$($devAfter.Service)', Status is '$($devAfter.Status)'." "Red"
    Write-Log "Triggering automatic rollback to restore original Windows WPD/MTP driver..." "Yellow"
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\rollback-camera-driver.ps1" -InstanceId "$targetInstanceId"
    exit 6
}
