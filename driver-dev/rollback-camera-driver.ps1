<#
.SYNOPSIS
    MingleBooth Camera Driver Safe Rollback (Restore Inbox WPD/MTP Driver)
.DESCRIPTION
    Restores the original Windows driver association for Sony ILCE-7CM2:
      1. Targets ONLY USB\VID_054C&PID_0E8C
      2. Uninstalls ONLY the MingleBooth OEM INF from Driver Store (NEVER touches wpdmtp.inf)
      3. Re-enumerates PnP device tree
      4. Restores Microsoft inbox WUDFWpdMtp driver
      5. Verifies camera is back in WPD class with Status OK
#>

[CmdletBinding()]
param(
    [string]$InstanceId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  MINGLEBOOTH CAMERA DRIVER SAFE ROLLBACK UTILITY" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Write-Host ""

# Ensure running elevated
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Administrator privileges are required to manage device drivers." -ForegroundColor Red
    exit 2
}

# 1. Locate Device
if (-not $InstanceId) {
    $dev = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
        $_.InstanceId -match "VID_054C&PID_0E8C"
    }
    if ($dev) {
        $InstanceId = $dev[0].InstanceId
    }
}

if (-not $InstanceId) {
    Write-Host "[WARN] Sony ILCE-7CM2 (054C:0E8C) device not currently connected." -ForegroundColor Yellow
} else {
    Write-Host "Target Device Instance : $InstanceId"
    $devCurrent = Get-PnpDevice -InstanceId $InstanceId -ErrorAction SilentlyContinue
    if ($devCurrent) {
        Write-Host "Current Service        : $($devCurrent.Service)"
        Write-Host "Current Class          : $($devCurrent.Class)"
        Write-Host "Current Status         : $($devCurrent.Status)"
    }
}

Write-Host ""
Write-Host "[Step 1/3] Scanning Driver Store for MingleBooth OEM Driver Packages..." -ForegroundColor White

# Find MingleBooth OEM INF in Driver Store without touching wpdmtp.inf
$oemPackages = @()
$driversList = pnputil /enum-drivers
$curOem = ""
$curOrig = ""

foreach ($line in ($driversList -split "`r?`n")) {
    if ($line -match 'Published Name\s*:\s*(oem\d+\.inf)') {
        $curOem = $matches[1]
    }
    if ($line -match 'Original Name\s*:\s*MingleBoothCamera\.inf') {
        $curOrig = "MingleBoothCamera.inf"
        if ($curOem) {
            $oemPackages += $curOem
        }
    }
}

if ($oemPackages.Count -gt 0) {
    foreach ($oem in $oemPackages) {
        Write-Host "  Found MingleBooth OEM package in Driver Store: $oem" -ForegroundColor Yellow
        Write-Host "  Removing $oem from device association..."
        & pnputil /delete-driver $oem /uninstall
    }
} else {
    Write-Host "  No MingleBooth OEM package found in Driver Store." -ForegroundColor White
}

Write-Host ""
Write-Host "[Step 2/3] Triggering Windows PnP Device Re-enumeration..." -ForegroundColor White
& pnputil /scan-devices | Out-Null

if ($InstanceId) {
    Write-Host "  Restarting device node $InstanceId..."
    & pnputil /restart-device "$InstanceId" | Out-Null
}

# Wait up to 5 seconds for PnP stack to stabilize
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "[Step 3/3] Verifying Driver Rollback to Microsoft Inbox WPD/MTP..." -ForegroundColor White

if ($InstanceId) {
    $devAfter = Get-PnpDevice -InstanceId $InstanceId -ErrorAction SilentlyContinue
    if ($devAfter) {
        Write-Host "  Service After Rollback : $($devAfter.Service)"
        Write-Host "  Class After Rollback   : $($devAfter.Class)"
        Write-Host "  Status After Rollback  : $($devAfter.Status)"

        $isWpd = ($devAfter.Service -match "WUDFWpdMtp|WpdMtp") -or ($devAfter.Class -eq "WPD")
        if ($isWpd -and $devAfter.Status -eq "OK") {
            Write-Host ""
            Write-Host "================================================================" -ForegroundColor Green
            Write-Host "  ROLLBACK SUCCESS: Microsoft WPD/MTP Driver Restored!" -ForegroundColor Green
            Write-Host "  Device is fully accessible via Windows Portable Devices." -ForegroundColor Green
            Write-Host "================================================================" -ForegroundColor Green
            exit 0
        } else {
            Write-Host ""
            Write-Host "[WARN] Service is '$($devAfter.Service)'. Expected WUDFWpdMtp." -ForegroundColor Yellow
            exit 2
        }
    } else {
        Write-Host "[WARN] Device not detected after restart. Please replug USB cable." -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "Rollback completed (no device connected to verify)." -ForegroundColor Green
    exit 0
}
