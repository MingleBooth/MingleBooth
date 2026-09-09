<#
.SYNOPSIS
    MingleBooth Camera Driver Preflight Audit & Driver Candidate Ranking Check
.DESCRIPTION
    Performs comprehensive pre-installation baseline audit for Sony ILCE-7CM2 (054C:0E8C):
      1. Hardware profile verification (VID, PID, Class, Interface count, Hardware/Compatible IDs)
      2. Windows PnP Driver Candidates & Rank inspection via pnputil
      3. Windows Driver Signing Enforcement & Catalog status audit
      4. Structured baseline recording before any changes are made
#>

[CmdletBinding()]
param(
    [switch]$AsJson,
    [string]$SaveBaselinePath = ""
)

$ErrorActionPreference = "Continue"

$TARGET_VID = "054C"
$TARGET_PID = "0E8C"
$TARGET_HWID = "USB\VID_054C&PID_0E8C"
$SUPPORTED_MODEL = "Sony ILCE-7CM2 (α7C II)"

# 1. Search for matching device in PnP
$devices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
    $_.InstanceId -match "VID_$TARGET_VID"
}

$report = [ordered]@{
    Timestamp              = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
    CameraModel            = $SUPPORTED_MODEL
    TargetVid              = "0x$TARGET_VID"
    TargetPid              = "0x$TARGET_PID"
    TargetHardwareId       = $TARGET_HWID
    ActualInstanceId       = $null
    ActualHardwareIds      = @()
    ActualCompatibleIds    = @()
    InterfaceCount         = 0
    BindingLevel           = "Device-Level"
    CurrentDriverName      = "Unknown"
    CurrentInf             = "Unknown"
    CurrentProvider        = "Unknown"
    CurrentService         = "Unknown"
    CurrentClass           = "Unknown"
    CurrentStatus          = "Unknown"
    CurrentDriverRank      = "Unknown"
    DriverCandidates       = @()
    SelectedDriverBefore   = "Unknown"
    ProposedDriver         = "Microsoft WinUSB (winusb.sys)"
    ProposedInf            = "MingleBoothCamera.inf"
    ProposedService        = "WinUSB"
    ProposedClass          = "USBDevice"
    DeviceInterfaceGuid    = "{CDBBD918-C988-447F-9C80-4F02E38A8DB3}"
    CatalogExists          = $false
    CatalogSigned          = $false
    CatalogSigner          = $null
    TestSigningEnabled     = $false
    PreflightPassed        = $false
    FailReasons            = @()
}

# 2. Check Windows Test Signing Mode
try {
    $bcd = bcdedit 2>&1
    if ($bcd -match 'testsigning\s+Yes') {
        $report.TestSigningEnabled = $true
    }
} catch {}

# 3. Check Catalog File in script root
$catPath = Join-Path $PSScriptRoot "MingleBoothCamera.cat"
if (Test-Path $catPath) {
    $report.CatalogExists = $true
    try {
        $sig = Get-AuthenticodeSignature $catPath -ErrorAction SilentlyContinue
        if ($sig -and $sig.Status -eq "Valid") {
            $report.CatalogSigned = $true
            $report.CatalogSigner = $sig.SignerCertificate.Subject
        } elseif ($sig) {
            $report.CatalogSigner = "$($sig.Status) ($($sig.StatusMessage))"
        }
    } catch {}
}

if (-not $devices -or $devices.Count -eq 0) {
    $report.FailReasons += "No Sony USB device found in PresentOnly state."
} else {
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
        $report.FailReasons += "Sony device found, but Product ID does NOT match 0x$TARGET_PID (Found PID(s): $foundPids). Expected ILCE-7CM2 in PC Remote mode."
    } else {
        $report.ActualInstanceId = $matched.InstanceId
        $report.CurrentService = $matched.Service
        $report.CurrentClass = $matched.Class
        $report.CurrentStatus = $matched.Status

        # Query Signed Driver info
        $driver = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object {
            $_.DeviceID -eq $matched.InstanceId
        }
        if ($driver) {
            $report.CurrentDriverName = $driver.DeviceName
            $report.CurrentInf = $driver.InfName
            $report.CurrentProvider = $driver.DriverProviderName
        }

        # Query Hardware & Compatible IDs
        try {
            $hwIds = (Get-PnpDeviceProperty -InstanceId $matched.InstanceId -KeyName "DEVPKEY_Device_HardwareIds" -ErrorAction SilentlyContinue).Data
            if ($hwIds) { $report.ActualHardwareIds = @($hwIds) }

            $compIds = (Get-PnpDeviceProperty -InstanceId $matched.InstanceId -KeyName "DEVPKEY_Device_CompatibleIds" -ErrorAction SilentlyContinue).Data
            if ($compIds) { $report.ActualCompatibleIds = @($compIds) }
        } catch {}

        # Query Driver Candidates via pnputil
        try {
            $pnpDriversOut = & pnputil /enum-devices /instanceid "$($matched.InstanceId)" /drivers 2>&1
            $curCandidate = $null
            foreach ($line in ($pnpDriversOut -split "`r?`n")) {
                if ($line -match 'Driver Name\s*:\s*(.+)') {
                    if ($curCandidate) { $report.DriverCandidates += $curCandidate }
                    $curCandidate = [ordered]@{
                        DriverName = $matches[1].Trim()
                        MatchingId = ""
                        DriverRank = ""
                        Selected   = $false
                    }
                }
                if ($curCandidate) {
                    if ($line -match 'Matching Device ID\s*:\s*(.+)') { $curCandidate.MatchingId = $matches[1].Trim() }
                    if ($line -match 'Driver Rank\s*:\s*(.+)')      { $curCandidate.DriverRank = $matches[1].Trim() }
                    if ($line -match 'Selected\s*:\s*True')         {
                        $curCandidate.Selected = $true
                        $report.SelectedDriverBefore = $curCandidate.DriverName
                        $report.CurrentDriverRank = $curCandidate.DriverRank
                    }
                }
            }
            if ($curCandidate) { $report.DriverCandidates += $curCandidate }
        } catch {}

        # Validate Interface count
        $isComposite = $matched.InstanceId -match "&MI_"
        if ($isComposite) {
            $report.InterfaceCount = 2
            $report.FailReasons += "Device is enumerated as composite (&MI_ present). Expected single-interface device for Sony PC Remote mode."
        } else {
            $report.InterfaceCount = 1
        }

        # Validate Compatible ID includes Still Image / PTP (Class 06)
        $hasPtpClass = ($report.ActualCompatibleIds -match "Class_06") -or ($report.ActualCompatibleIds -match "Class_06&SubClass_01&Prot_01")
        if (-not $hasPtpClass -and $matched.Service -ne "WinUSB") {
            $report.FailReasons += "Device Compatible IDs do not include PTP (Class_06). Ensure camera menu is set to 'PC Remote'."
        }

        # Validate Class
        if ($matched.Class -notin @("WPD", "Image", "USBDevice")) {
            $report.FailReasons += "Device Class is '$($matched.Class)'. Expected 'WPD', 'Image', or 'USBDevice'."
        }

        if ($report.FailReasons.Count -eq 0) {
            $report.PreflightPassed = $true
        }
    }
}

# Auto-save baseline if path specified or default location
$defaultBaselineDir = "$env:LOCALAPPDATA\MingleBooth"
if (-not $SaveBaselinePath) {
    if (-not (Test-Path $defaultBaselineDir)) {
        New-Item -ItemType Directory -Path $defaultBaselineDir -Force | Out-Null
    }
    $SaveBaselinePath = "$defaultBaselineDir\driver-baseline-before.json"
}
try {
    $report | ConvertTo-Json -Depth 5 | Set-Content -Path $SaveBaselinePath -Encoding utf8 -Force
} catch {}

if ($AsJson) {
    $report | ConvertTo-Json -Depth 4
} else {
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  MINGLEBOOTH PRE-INSTALL BASELINE & DRIVER RANK AUDIT" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  CAMERA MODEL         : $($report.CameraModel)"
    Write-Host "  TARGET HARDWARE ID   : $($report.TargetHardwareId)"
    Write-Host "  ACTUAL INSTANCE ID   : $($report.ActualInstanceId || '(none)')"
    Write-Host "  HARDWARE IDS         : $(($report.ActualHardwareIds -join ', ') || '(none)')"
    Write-Host "  COMPATIBLE IDS       : $(($report.ActualCompatibleIds -join ', ') || '(none)')"
    Write-Host "  INTERFACE COUNT      : $($report.InterfaceCount)"
    Write-Host "  BINDING LEVEL        : $($report.BindingLevel)"
    Write-Host "  CURRENT DRIVER       : $($report.CurrentDriverName)"
    Write-Host "  CURRENT INF          : $($report.CurrentInf)"
    Write-Host "  CURRENT PROVIDER     : $($report.CurrentProvider)"
    Write-Host "  CURRENT SERVICE      : $($report.CurrentService)"
    Write-Host "  CURRENT CLASS        : $($report.CurrentClass)"
    Write-Host "  CURRENT STATUS       : $($report.CurrentStatus)"
    Write-Host "  SELECTED DRIVER      : $($report.SelectedDriverBefore)"
    Write-Host "  CURRENT DRIVER RANK  : $($report.CurrentDriverRank)"
    Write-Host "  PROPOSED DRIVER      : $($report.ProposedDriver)"
    Write-Host "  PROPOSED INF         : $($report.ProposedInf)"
    Write-Host "  PROPOSED SERVICE     : $($report.ProposedService)"
    Write-Host "  DEVICE INTERFACE GUID: $($report.DeviceInterfaceGuid)"
    Write-Host "----------------------------------------------------------------"
    Write-Host "  SIGNING & ENVIRONMENT AUDIT:" -ForegroundColor Yellow
    Write-Host "  Catalog Exists (.cat): $($report.CatalogExists)"
    Write-Host "  Catalog Signature    : $($report.CatalogSigned) ($($report.CatalogSigner || 'Unsigned'))"
    Write-Host "  Windows Test Signing : $($report.TestSigningEnabled)"
    Write-Host "----------------------------------------------------------------"
    if ($report.DriverCandidates.Count -gt 0) {
        Write-Host "  WINDOWS PNP DRIVER CANDIDATES:" -ForegroundColor Cyan
        foreach ($c in $report.DriverCandidates) {
            $selStr = if ($c.Selected) { "[SELECTED]" } else { "          " }
            Write-Host "    $selStr $($c.DriverName) (Matching: $($c.MatchingId), Rank: $($c.DriverRank))"
        }
        Write-Host "----------------------------------------------------------------"
    }

    if ($report.PreflightPassed) {
        Write-Host "  PREFLIGHT RESULT     : [PASS] Hardware matches supported target." -ForegroundColor Green
    } else {
        Write-Host "  PREFLIGHT RESULT     : [ABORT / FAILED]" -ForegroundColor Red
        foreach ($reason in $report.FailReasons) {
            Write-Host "    - $reason" -ForegroundColor Red
        }
    }
    Write-Host "  Baseline saved to    : $SaveBaselinePath" -ForegroundColor White
    Write-Host "================================================================" -ForegroundColor Cyan
}

if ($report.PreflightPassed) {
    exit 0
} else {
    exit 1
}
