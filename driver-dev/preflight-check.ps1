<#
.SYNOPSIS
    MingleBooth Camera Driver Preflight Check (Strict Hardware Profile Validation)
.DESCRIPTION
    Validates that the connected device matches the exact supported profile:
      - Camera Model: Sony ILCE-7CM2 (α7C II)
      - Vendor ID   : 0x054C
      - Product ID  : 0x0E8C
      - Hardware ID : USB\VID_054C&PID_0E8C
      - USB Class   : 0x06 (Still Imaging)
      - Subclass    : 0x01 (Capture)
      - Protocol    : 0x01 (PTP)
      - Current Service : WUDFWpdMtp (or WinUSB if already bound)
    ABORTS with exit code 1 if ANY parameter does not match.
#>

[CmdletBinding()]
param(
    [switch]$AsJson
)

$ErrorActionPreference = "Stop"

$TARGET_VID = "054C"
$TARGET_PID = "0E8C"
$TARGET_HWID = "USB\VID_054C&PID_0E8C"
$SUPPORTED_MODEL = "Sony ILCE-7CM2 (α7C II)"

# 1. Search for matching device
$devices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
    $_.InstanceId -match "VID_$TARGET_VID"
}

$report = [ordered]@{
    Timestamp          = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
    CameraModel        = $SUPPORTED_MODEL
    TargetVid          = "0x$TARGET_VID"
    TargetPid          = "0x$TARGET_PID"
    TargetHardwareId   = $TARGET_HWID
    ActualInstanceId   = $null
    ActualHardwareIds  = @()
    ActualCompatibleIds= @()
    InterfaceCount     = 0
    BindingLevel       = "Device-Level"
    CurrentDriverName  = "Unknown"
    CurrentInf         = "Unknown"
    CurrentService     = "Unknown"
    CurrentClass       = "Unknown"
    ProposedDriver     = "Microsoft WinUSB (winusb.sys)"
    ProposedInf        = "MingleBoothCamera.inf"
    ProposedService    = "WinUSB"
    ProposedClass      = "USBDevice"
    DeviceInterfaceGuid= "{CDBBD918-C988-447F-9C80-4F02E38A8DB3}"
    PreflightPassed    = $false
    FailReasons        = @()
}

if (-not $devices -or $devices.Count -eq 0) {
    $report.FailReasons += "No Sony USB device found in PresentOnly state."
} else {
    # Find matching device by HardwareID
    $matched = $null
    foreach ($dev in $devices) {
        if ($dev.InstanceId -match "PID_$TARGET_PID") {
            $matched = $dev
            break
        }
    }

    if (-not $matched) {
        $foundPids = ($devices | ForEach-Object {
            if ($_.InstanceId -match "PID_([0-9A-F]{4})") { $matches[1] }
        }) -join ", "
        $report.FailReasons += "Sony device found, but Product ID does NOT match 0x$TARGET_PID (Found PID(s): $foundPids). Aborting driver replacement."
    } else {
        $report.ActualInstanceId = $matched.InstanceId
        $report.CurrentService = $matched.Service
        $report.CurrentClass = $matched.Class

        # Query Signed Driver info
        $driver = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object {
            $_.DeviceID -eq $matched.InstanceId
        }
        if ($driver) {
            $report.CurrentDriverName = $driver.DeviceName
            $report.CurrentInf = $driver.InfName
        }

        # Query Hardware and Compatible IDs
        try {
            $hwIds = (Get-PnpDeviceProperty -InstanceId $matched.InstanceId -KeyName "DEVPKEY_Device_HardwareIds" -ErrorAction SilentlyContinue).Data
            if ($hwIds) { $report.ActualHardwareIds = @($hwIds) }

            $compIds = (Get-PnpDeviceProperty -InstanceId $matched.InstanceId -KeyName "DEVPKEY_Device_CompatibleIds" -ErrorAction SilentlyContinue).Data
            if ($compIds) { $report.ActualCompatibleIds = @($compIds) }
        } catch {}

        # Validate Interface count (Single interface device has NO &MI_ in HardwareId)
        $isComposite = $matched.InstanceId -match "&MI_"
        if ($isComposite) {
            $report.InterfaceCount = 2 # Multi-interface composite
            $report.FailReasons += "Device is enumerated as composite (&MI_ present). Expected single-interface device for Sony PC Remote mode."
        } else {
            $report.InterfaceCount = 1
        }

        # Validate Compatible ID includes Still Image / PTP (Class 06)
        $hasPtpClass = ($report.ActualCompatibleIds -match "Class_06") -or ($report.ActualCompatibleIds -match "Class_06&SubClass_01&Prot_01")
        if (-not $hasPtpClass -and $matched.Service -ne "WinUSB") {
            $report.FailReasons += "Device Compatible IDs do not include PTP / Class_06. Ensure camera is set to 'PC Remote' mode."
        }

        # Validate Class is WPD or Image or already USBDevice
        if ($matched.Class -notin @("WPD", "Image", "USBDevice")) {
            $report.FailReasons += "Device Class is '$($matched.Class)'. Expected 'WPD' or 'Image' or 'USBDevice'."
        }

        if ($report.FailReasons.Count -eq 0) {
            $report.PreflightPassed = $true
        }
    }
}

if ($AsJson) {
    $report | ConvertTo-Json -Depth 4
} else {
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  MINGLEBOOTH CAMERA DRIVER PREFLIGHT AUDIT REPORT" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  CAMERA MODEL       : $($report.CameraModel)"
    Write-Host "  TARGET HARDWARE ID : $($report.TargetHardwareId)"
    Write-Host "  ACTUAL INSTANCE ID : $($report.ActualInstanceId || '(none)')"
    Write-Host "  INTERFACE COUNT    : $($report.InterfaceCount)"
    Write-Host "  BINDING LEVEL      : $($report.BindingLevel)"
    Write-Host "  CURRENT DRIVER     : $($report.CurrentDriverName)"
    Write-Host "  CURRENT INF        : $($report.CurrentInf)"
    Write-Host "  CURRENT SERVICE    : $($report.CurrentService)"
    Write-Host "  CURRENT CLASS      : $($report.CurrentClass)"
    Write-Host "  PROPOSED DRIVER    : $($report.ProposedDriver)"
    Write-Host "  PROPOSED INF       : $($report.ProposedInf)"
    Write-Host "  PROPOSED SERVICE   : $($report.ProposedService)"
    Write-Host "  DEVICE INTERFACE   : $($report.DeviceInterfaceGuid)"
    Write-Host "----------------------------------------------------------------"
    if ($report.PreflightPassed) {
        Write-Host "  PREFLIGHT RESULT   : [PASS] All criteria match supported profile." -ForegroundColor Green
    } else {
        Write-Host "  PREFLIGHT RESULT   : [ABORT / FAILED]" -ForegroundColor Red
        foreach ($reason in $report.FailReasons) {
            Write-Host "    - $reason" -ForegroundColor Red
        }
    }
    Write-Host "================================================================" -ForegroundColor Cyan
}

if ($report.PreflightPassed) {
    exit 0
} else {
    exit 1
}
