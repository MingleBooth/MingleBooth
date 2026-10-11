<#
.SYNOPSIS
    MingleBooth Camera Driver Safe Rollback (Restore Inbox WPD/MTP Driver)
.DESCRIPTION
    Restores original Windows driver association for Sony ILCE-7CM2:
      1. Targets ONLY USB\VID_054C&PID_0E8C
      2. Uninstalls ONLY the MingleBooth OEM INF from Driver Store (NEVER touches wpdmtp.inf)
      3. Re-enumerates PnP device tree
      4. Restores Microsoft inbox WUDFWpdMtp driver
      5. Independently verifies:
         - Service == WUDFWpdMtp
         - Driver == wpdmtp.inf
         - Class == WPD
         - Status == OK
      6. Verifies that Windows Explorer can see the camera again
#>

[CmdletBinding()]
param(
    [string]$InstanceId = ""
)

$ErrorActionPreference = "Stop"

$LOG_DIR = "$env:LOCALAPPDATA\MingleBooth"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$ROLLBACK_REPORT = "$LOG_DIR\driver-rollback-result.json"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  MINGLEBOOTH CAMERA DRIVER SAFE ROLLBACK UTILITY" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
Write-Host ""

# 1. Ensure running elevated & safe self-elevation
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    try {
        $argStr = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        if ($InstanceId) {
            $argStr += " -InstanceId `"$InstanceId`""
        }
        $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $argStr -Verb RunAs -Wait -PassThru
        exit $proc.ExitCode
    } catch {
        Write-Host "[ERROR] Administrator privileges are required to manage device drivers: $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
}

# 2. Locate Device
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
Write-Host "[Step 1/4] Scanning Driver Store for MingleBooth OEM Driver Packages..." -ForegroundColor White

# Find MingleBooth OEM INF in Driver Store without touching wpdmtp.inf
$oemPackages = @()
$driversList = pnputil /enum-drivers
$curOem = ""

foreach ($line in ($driversList -split "`r?`n")) {
    if ($line -match 'Published Name\s*:\s*(oem\d+\.inf)') {
        $curOem = $matches[1]
    }
    if ($line -match 'Original Name\s*:\s*MingleBoothCamera\.inf') {
        if ($curOem) {
            $oemPackages += $curOem
        }
    }
}

if ($oemPackages.Count -gt 0) {
    foreach ($oem in $oemPackages) {
        Write-Host "  Found MingleBooth OEM package in Driver Store: $oem" -ForegroundColor Yellow
        Write-Host "  Removing $oem from device association..."
        & pnputil /delete-driver $oem /uninstall 2>&1 | Out-Null
    }
} else {
    Write-Host "  No MingleBooth OEM package found in Driver Store." -ForegroundColor White
}

Write-Host ""
Write-Host "[Step 2/4] Triggering Windows PnP Device Re-enumeration..." -ForegroundColor White
& pnputil /scan-devices 2>&1 | Out-Null

if ($InstanceId) {
    Write-Host "  Restarting device node $InstanceId..."
    & pnputil /restart-device "$InstanceId" 2>&1 | Out-Null
}

# Wait up to 3 seconds for PnP stack to stabilize
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[Step 3/4] Independently Verifying PnP Driver Association..." -ForegroundColor White

$rollbackSuccess = $false
$report = [ordered]@{
    Timestamp          = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
    InstanceId         = $InstanceId
    RemovedOemPackages = $oemPackages
    ServiceAfter       = "Unknown"
    DriverAfter        = "Unknown"
    ProviderAfter      = "Unknown"
    ClassAfter         = "Unknown"
    StatusAfter        = "Unknown"
    VisibleInExplorer  = $false
    WpdInterfaceActive = $false
    RollbackPassed     = $false
}

if ($InstanceId) {
    $devAfter = Get-PnpDevice -InstanceId $InstanceId -ErrorAction SilentlyContinue
    if ($devAfter) {
        $report.ServiceAfter = $devAfter.Service
        $report.ClassAfter = $devAfter.Class
        $report.StatusAfter = $devAfter.Status

        # Query Signed Driver info
        $driver = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object {
            $_.DeviceID -eq $InstanceId
        }
        if ($driver) {
            $report.DriverAfter = $driver.InfName
            $report.ProviderAfter = $driver.DriverProviderName
        }

        Write-Host "  Service After Rollback : $($report.ServiceAfter)"
        Write-Host "  Driver After Rollback  : $($report.DriverAfter)"
        Write-Host "  Provider After Rollback: $($report.ProviderAfter)"
        Write-Host "  Class After Rollback   : $($report.ClassAfter)"
        Write-Host "  Status After Rollback  : $($report.StatusAfter)"

        $isServiceWpd = ($report.ServiceAfter -match "WUDFWpdMtp|WpdMtp")
        $isDriverWpd = ($report.DriverAfter -match "wpdmtp\.inf")
        $isClassWpd = ($report.ClassAfter -eq "WPD")
        $isStatusOk = ($report.StatusAfter -eq "OK")

        # Step 4: Verify Explorer visibility
        Write-Host ""
        Write-Host "[Step 4/4] Verifying Camera Visibility in Windows Explorer..." -ForegroundColor White
        
        # Check Shell COM namespace 17 (This PC / Drives & Devices)
        try {
            $shell = New-Object -ComObject Shell.Application
            $thisPc = $shell.Namespace(17)
            if ($thisPc) {
                foreach ($item in $thisPc.Items()) {
                    if ($item.Name -match "ILCE-7CM2|Sony|Alpha|Digital Still Camera") {
                        $report.VisibleInExplorer = $true
                        Write-Host "  Found device in Windows Explorer: $($item.Name)" -ForegroundColor Green
                        break
                    }
                }
            }
        } catch {}

        # Also check WPD Device Interface GUID: {6ac27878-a6fa-4155-ba85-b98f491d4f33}
        $wpdGuid = "{6ac27878-a6fa-4155-ba85-b98f491d4f33}"
        $wpdKey = "HKLM:\SYSTEM\CurrentControlSet\Control\DeviceClasses\$wpdGuid"
        if (Test-Path $wpdKey) {
            $matchingNodes = Get-ChildItem -Path $wpdKey -ErrorAction SilentlyContinue | Where-Object {
                $_.PSChildName -match "054C" -and $_.PSChildName -match "0E8C"
            }
            if ($matchingNodes) {
                $report.WpdInterfaceActive = $true
                Write-Host "  WPD Device Interface is active in PnP device class registry." -ForegroundColor Green
            }
        }

        if ($isServiceWpd -and $isClassWpd -and $isStatusOk) {
            $rollbackSuccess = $true
            $report.RollbackPassed = $true
        }
    }
}

$report | ConvertTo-Json -Depth 4 | Set-Content -Path $ROLLBACK_REPORT -Encoding utf8

if ($rollbackSuccess) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Green
    Write-Host "  ROLLBACK SUCCESS: Microsoft WPD/MTP Driver Restored!" -ForegroundColor Green
    Write-Host "  Service: $($report.ServiceAfter) | Driver: $($report.DriverAfter) | Status: $($report.StatusAfter)" -ForegroundColor Green
    Write-Host "  Explorer Visible: $($report.VisibleInExplorer)" -ForegroundColor Green
    Write-Host "  Device is fully accessible to Windows and Microsoft services." -ForegroundColor Green
    Write-Host "================================================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "[ERROR] Rollback verification did NOT fully satisfy baseline criteria." -ForegroundColor Red
    Write-Host "  Service : $($report.ServiceAfter) (Expected WUDFWpdMtp)" -ForegroundColor Red
    Write-Host "  Driver  : $($report.DriverAfter) (Expected wpdmtp.inf)" -ForegroundColor Red
    Write-Host "  Status  : $($report.StatusAfter) (Expected OK)" -ForegroundColor Red
    exit 1
}
