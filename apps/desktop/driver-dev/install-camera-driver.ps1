<#
.SYNOPSIS
    MingleBooth Camera Driver Elevated Installation Helper (Boot Camp QA Hardened)
.DESCRIPTION
    Installs scoped WinUSB driver for Sony ILCE-7CM2 (054C:0E8C):
      1. Enforces explicit Administrator privileges (UAC)
      2. Executes strict preflight hardware and signing audit
      3. Backs up original PnP driver state and baseline ranking to JSON
      4. Installs MingleBoothCamera.inf targeting strictly USB\VID_054C&PID_0E8C
      5. Restarts device node dynamically via pnputil
      6. Verifies driver candidate ranking: explicitly asserts Selected Driver == MingleBooth OEM and Service == WinUSB
      7. Automatically rolls back to Microsoft WPD/MTP if driver selection or rank verification fails
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
$BASELINE_BEFORE = "$LOG_DIR\driver-baseline-before.json"
$BASELINE_AFTER = "$LOG_DIR\driver-baseline-after.json"

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $Message" | Out-File -FilePath $LOG_FILE -Append -Encoding utf8
    Write-Host "[$ts] $Message" -ForegroundColor $Color
}

Write-Log "================================================================" "Cyan"
Write-Log "  MINGLEBOOTH ELEVATED DRIVER INSTALLATION HELPER (QA HARDENED)" "Cyan"
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

# 3. Preflight Hardware & Baseline Audit
Write-Log ""
Write-Log "[Step 1/6] Executing Preflight Hardware & Baseline Ranking Audit..." "White"

$preflightScript = "$PSScriptRoot\preflight-check.ps1"
$targetInstanceId = $null

if (Test-Path $preflightScript) {
    $preflightJson = & powershell -NoProfile -ExecutionPolicy Bypass -File $preflightScript -AsJson -SaveBaselinePath "$BASELINE_BEFORE"
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
        Write-Log "Current Selected INF: $($preflight.SelectedDriverBefore)" "White"
        Write-Log "Current Rank        : $($preflight.CurrentDriverRank)" "White"
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
Write-Log "[Step 2/6] Backing Up Original PnP Driver State..." "White"
$driverInfo = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object {
    $_.DeviceID -eq $targetInstanceId
}
$devCurrent = Get-PnpDevice -InstanceId $targetInstanceId -ErrorAction SilentlyContinue

$backupData = [ordered]@{
    InstanceId        = $targetInstanceId
    HardwareId        = "USB\VID_054C&PID_0E8C"
    OriginalDriverInf = if ($driverInfo) { $driverInfo.InfName } else { "wpdmtp.inf" }
    OriginalProvider  = if ($driverInfo) { $driverInfo.DriverProviderName } else { "Microsoft" }
    OriginalService   = if ($devCurrent) { $devCurrent.Service } else { "WUDFWpdMtp" }
    OriginalClass     = if ($devCurrent) { $devCurrent.Class } else { "WPD" }
    OriginalStatus    = if ($devCurrent) { $devCurrent.Status } else { "OK" }
    Timestamp         = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
}
$backupData | ConvertTo-Json -Depth 4 | Set-Content -Path $BACKUP_FILE -Encoding utf8
Write-Log "Original state backed up to: $BACKUP_FILE" "Green"

# 5. Install Scoped WinUSB Package via pnputil
Write-Log ""
Write-Log "[Step 3/6] Staging & Installing Scoped WinUSB Package via pnputil..." "White"
$installOut = & pnputil /add-driver "$InfPath" /install 2>&1
$installExit = $LASTEXITCODE

Write-Log "pnputil output:`n$($installOut -join "`n")" "Yellow"

if ($installExit -ne 0) {
    Write-Log "[ERROR] pnputil driver installation returned exit code: $installExit" "Red"
    exit 4
}

# Extract published OEM name if present
$publishedOem = $null
foreach ($l in $installOut) {
    if ($l -match 'Published Name\s*:\s*(oem\d+\.inf)') {
        $publishedOem = $matches[1]
        Write-Log "Published OEM Package: $publishedOem" "Cyan"
        break
    }
}

# 6. Dynamically Restart Device Node
Write-Log ""
Write-Log "[Step 4/6] Dynamically Restarting Device Node ($targetInstanceId)..." "White"
$restartOut = & pnputil /restart-device "$targetInstanceId" 2>&1
$restartExit = $LASTEXITCODE

Write-Log "pnputil restart output:`n$($restartOut -join "`n")" "Yellow"

# Allow PnP stack to stabilize
Start-Sleep -Seconds 3

# 7. Post-Install Driver Candidate & Rank Verification
Write-Log ""
Write-Log "[Step 5/6] Querying Windows PnP Driver Candidates & Rank via pnputil..." "White"
$pnpDriversOut = & pnputil /enum-devices /instanceid "$targetInstanceId" /drivers 2>&1
Write-Log "pnputil /enum-devices /drivers output:`n$($pnpDriversOut -join "`n")" "Gray"

$candidatesAfter = @()
$curCandidate = $null
$selectedDriverAfter = $null
$selectedRankAfter = $null

foreach ($line in ($pnpDriversOut -split "`r?`n")) {
    if ($line -match 'Driver Name\s*:\s*(.+)') {
        if ($curCandidate) { $candidatesAfter += $curCandidate }
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
            $selectedDriverAfter = $curCandidate.DriverName
            $selectedRankAfter = $curCandidate.DriverRank
        }
    }
}
if ($curCandidate) { $candidatesAfter += $curCandidate }

# 8. Query Active PnP Device Node State
Write-Log ""
Write-Log "[Step 6/6] Verifying Selected Driver and Service Match..." "White"
$devAfter = Get-PnpDevice -InstanceId $targetInstanceId -ErrorAction SilentlyContinue

if (-not $devAfter) {
    Write-Log "[ERROR] Device not found after restart! Triggering automatic rollback..." "Red"
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\rollback-camera-driver.ps1" -InstanceId "$targetInstanceId"
    exit 3
}

$activeService = $devAfter.Service
$activeClass = $devAfter.Class
$activeStatus = $devAfter.Status

Write-Log "Active Service : $activeService"
Write-Log "Active Class   : $activeClass"
Write-Log "Active Status  : $activeStatus"
Write-Log "Selected Driver: $selectedDriverAfter"
Write-Log "Selected Rank  : $selectedRankAfter"

# Record full post-install audit
$postInstallAudit = [ordered]@{
    Timestamp          = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
    InstanceId         = $targetInstanceId
    PublishedOem       = $publishedOem
    SelectedDriver     = $selectedDriverAfter
    SelectedRank       = $selectedRankAfter
    ActiveService      = $activeService
    ActiveClass        = $activeClass
    ActiveStatus       = $activeStatus
    DriverCandidates   = $candidatesAfter
}
$postInstallAudit | ConvertTo-Json -Depth 5 | Set-Content -Path $BASELINE_AFTER -Encoding utf8

# Check if selected driver is MingleBooth OEM package or MingleBoothCamera.inf
$isMingleBoothSelected = $false
if ($selectedDriverAfter) {
    if ($selectedDriverAfter -match "MingleBoothCamera\.inf") {
        $isMingleBoothSelected = $true
    } elseif ($publishedOem -and ($selectedDriverAfter -eq $publishedOem)) {
        $isMingleBoothSelected = $true
    } else {
        # Check pnputil enum-drivers to see if $selectedDriverAfter original name is MingleBoothCamera.inf
        $enumDrv = & pnputil /enum-drivers 2>&1
        $matchedCurOem = $null
        foreach ($l in $enumDrv) {
            if ($l -match 'Published Name\s*:\s*(oem\d+\.inf)') { $matchedCurOem = $matches[1] }
            if ($matchedCurOem -eq $selectedDriverAfter -and $l -match 'Original Name\s*:\s*MingleBoothCamera\.inf') {
                $isMingleBoothSelected = $true
                break
            }
        }
    }
}

$isWinUsbService = ($activeService -eq "WinUSB")
$isStatusOk = ($activeStatus -eq "OK")

Write-Log ""
Write-Log "--- Verification Summary ---" "Cyan"
Write-Log "  Selected Driver == MingleBooth: $isMingleBoothSelected ($selectedDriverAfter)"
Write-Log "  Active Service  == WinUSB     : $isWinUsbService ($activeService)"
Write-Log "  Device Status   == OK         : $isStatusOk ($activeStatus)"

if ($isMingleBoothSelected -and $isWinUsbService -and $isStatusOk) {
    Write-Log "================================================================" "Green"
    Write-Log "  DRIVER INSTALLATION & RANK VERIFICATION SUCCESS!" "Green"
    Write-Log "  Windows selected MingleBooth WinUSB driver package." "Green"
    Write-Log "  Selected Driver Rank: $selectedRankAfter" "Green"
    Write-Log "  Device is ready for libusb-1.0 and gphoto2 communication." "Green"
    Write-Log "================================================================" "Green"
    exit 0
} else {
    Write-Log ""
    Write-Log "[ERROR] Post-installation verification FAILED!" "Red"
    if (-not $isMingleBoothSelected) {
        Write-Log "  - Windows did NOT select the MingleBooth driver (Selected: $selectedDriverAfter)." "Red"
        Write-Log "    Windows preferred candidate rank over MingleBooth. Candidates:" "Red"
        foreach ($c in $candidatesAfter) {
            Write-Log "      $($c.DriverName) (Rank: $($c.DriverRank), Selected: $($c.Selected))" "Red"
        }
    }
    if (-not $isWinUsbService) {
        Write-Log "  - Active service is '$activeService' instead of 'WinUSB'." "Red"
    }
    if (-not $isStatusOk) {
        Write-Log "  - Device status is '$activeStatus' instead of 'OK'." "Red"
    }
    Write-Log "Triggering automatic rollback to restore original Windows WPD/MTP driver..." "Yellow"
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\rollback-camera-driver.ps1" -InstanceId "$targetInstanceId"
    exit 6
}
