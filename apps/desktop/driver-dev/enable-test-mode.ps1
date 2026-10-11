<#
.SYNOPSIS
    MingleBooth QA - Enable Windows Test Signing Mode (Hardened Tablet Diagnostic Helper)
.DESCRIPTION
    Enables Test Mode on 64-bit Windows for development driver testing:
      1. Detects and handles UAC elevation cleanly across process boundaries.
      2. Executes exactly: bcdedit /set testsigning on
      3. Cleanly captures stdout, stderr, and exit code.
      4. Verifies result with: bcdedit
      5. Detects whether 'testsigning Yes' is present in BCD.
      6. Checks UEFI Secure Boot status (without modifying Secure Boot).
      7. Writes structured developer diagnostics to %LOCALAPPDATA%\MingleBooth\qa-reports\
      8. Returns structured result object to parent process / Electron.
#>

[CmdletBinding()]
param(
    [string]$ResultFile = "",
    [string]$LogFile = ""
)

$ErrorActionPreference = "Continue"

# Establish QA Reports and Logging Directory
$qaDir = "$env:LOCALAPPDATA\MingleBooth"
$qaReportsDir = "$qaDir\qa-reports"
try {
    if (-not (Test-Path $qaDir)) { New-Item -ItemType Directory -Path $qaDir -Force | Out-Null }
    if (-not (Test-Path $qaReportsDir)) { New-Item -ItemType Directory -Path $qaReportsDir -Force | Out-Null }
} catch {}

if (-not $ResultFile) {
    $ResultFile = "$qaReportsDir\test-mode-result.json"
}
if (-not $LogFile) {
    $LogFile = "$qaReportsDir\test-mode-execution.log"
}

function Write-QaLog {
    param([string]$Message, [string]$Color = "White")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $line = "[$ts] $Message"
    try { $line | Out-File -FilePath $LogFile -Append -Encoding utf8 } catch {}
    Write-Host $line -ForegroundColor $Color
}

Write-QaLog "================================================================" "Cyan"
Write-QaLog "  MINGLEBOOTH QA: WINDOWS TEST SIGNING SETUP HELPER" "Cyan"
Write-QaLog "================================================================" "Cyan"
Write-QaLog "Script Path  : $PSCommandPath"
Write-QaLog "Result File  : $ResultFile"
Write-QaLog "Log File     : $LogFile"

# 1. Administrator & Elevation Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-QaLog "Current Elevation (IsAdmin): $isAdmin"

if (-not $isAdmin) {
    Write-QaLog "Process is NOT elevated. Requesting Administrator privilege via UAC..." "Yellow"

    $sysRoot = $env:SystemRoot
    if (-not $sysRoot) {
        $sysRoot = $env:windir
        if (-not $sysRoot) { $sysRoot = "C:\Windows" }
    }
    $is64BitOs = [Environment]::Is64BitOperatingSystem
    $is64BitProc = [Environment]::Is64BitProcess

    # If running as 32-bit process on 64-bit Windows, use Sysnative PowerShell to launch 64-bit PowerShell directly
    $sysnativePs = "$sysRoot\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
    $targetPs = if ($is64BitOs -and (-not $is64BitProc) -and (Test-Path $sysnativePs)) { $sysnativePs } else { "powershell.exe" }

    $scriptDir = Split-Path -Parent $PSCommandPath
    $elevateCandidates = @(
        "$scriptDir\..\electron\bin\win\elevate.exe",
        "$scriptDir\elevate.exe",
        "$env:LOCALAPPDATA\Programs\MingleBooth Studio\resources\elevate.exe"
    )
    $elevatePath = $elevateCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    try {
        Write-QaLog "Spawning elevated PowerShell via native Windows RunAs (UAC)..." "Cyan"
        $psArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-ResultFile', $ResultFile, '-LogFile', $LogFile)
        $proc = Start-Process -FilePath $targetPs -ArgumentList $psArgs -Verb RunAs -Wait -PassThru
        $childExit = $proc.ExitCode

        Write-QaLog "Elevated child process finished with exit code: $childExit" "Cyan"

        # Read the diagnostic result file written by the elevated process
        if (Test-Path $ResultFile) {
            $jsonContent = Get-Content -Path $ResultFile -Raw -Encoding utf8
            Write-Output $jsonContent
            exit $childExit
        } else {
            $isUacCancelled = ($childExit -eq 1223)
            $fallback = [ordered]@{
                Success           = ($childExit -eq 0)
                ExitCode          = $childExit
                UacCancelled      = $isUacCancelled
                ElevationFailed   = ($childExit -ne 0 -and -not $isUacCancelled)
                RealWindowsError  = if ($isUacCancelled) { "UAC cancelled by user." } else { "Elevated process finished with exit code $childExit." }
                IsAdmin           = $false
                Message           = if ($isUacCancelled) { "Izin Administrator diperlukan untuk melanjutkan." } else { "Windows tidak memberikan izin Administrator. Silakan coba lagi." }
            }
            $jsonContent = $fallback | ConvertTo-Json -Depth 4
            try { $jsonContent | Out-File -FilePath $ResultFile -Force -Encoding utf8 } catch {}
            Write-Output $jsonContent
            exit $childExit
        }
    } catch {
        $isCancelled = ($_.Exception.HResult -eq -2147023673 -or $_.Exception.NativeErrorCode -eq 1223)
        Write-QaLog "Elevation request error: $($_.Exception.Message)" "Red"
        $errReport = [ordered]@{
            Success           = $false
            ExitCode          = if ($isCancelled) { 1223 } else { 2 }
            UacCancelled      = $isCancelled
            ElevationFailed   = (-not $isCancelled)
            RealWindowsError  = $_.Exception.Message
            IsAdmin           = $false
            Message           = if ($isCancelled) { "Izin Administrator diperlukan untuk melanjutkan." } else { "Windows tidak memberikan izin Administrator. Silakan coba lagi." }
        }
        $jsonContent = $errReport | ConvertTo-Json -Depth 4
        try { $jsonContent | Out-File -FilePath $ResultFile -Force -Encoding utf8 } catch {}
        Write-Output $jsonContent
        exit $(if ($isCancelled) { 1223 } else { 2 })
    }
}

# 2. RUNNING ELEVATED
Write-QaLog "Running in ELEVATED mode. Initializing diagnostics..." "Green"

$sysRoot = $env:SystemRoot
if (-not $sysRoot) {
    $sysRoot = $env:windir
    if (-not $sysRoot) { $sysRoot = "C:\Windows" }
}

$is64BitOs = [Environment]::Is64BitOperatingSystem
$is64BitProc = [Environment]::Is64BitProcess
$osArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$procArch = if ($is64BitProc) { "x64" } else { "x86" }

# Dynamic candidate paths checked safely across WOW64 / 64-bit boundaries
$candidatesToCheck = @()
if ($is64BitOs -and (-not $is64BitProc)) {
    # 32-bit WOW64 process: Sysnative maps directly to 64-bit System32
    $candidatesToCheck += "$sysRoot\Sysnative\bcdedit.exe"
}
$candidatesToCheck += "$sysRoot\System32\bcdedit.exe"
$candidatesToCheck += "$sysRoot\SysWOW64\bcdedit.exe"

$candidatesChecked = @()
$selectedBcdedit = $null

foreach ($cand in $candidatesToCheck) {
    $candExists = Test-Path -LiteralPath $cand -PathType Leaf
    $candIsFile = $false
    $candIsExe = $false
    $candVer = "N/A"
    $candSize = 0
    if ($candExists) {
        try {
            $fInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($cand)
            $candVer = if ($fInfo.FileVersion) { $fInfo.FileVersion } else { "N/A" }
            $candIsFile = $true
            $candIsExe = $true
            $candSize = (Get-Item -LiteralPath $cand).Length
        } catch {
            $candIsFile = $true
        }
    }
    $entry = [ordered]@{
        Path          = $cand
        Exists        = $candExists
        IsFile        = $candIsFile
        IsExecutable  = $candIsExe
        IsBcdeditName = ([System.IO.Path]::GetFileName($cand).ToLower() -eq "bcdedit.exe")
        FileVersion   = $candVer
        SizeBytes     = $candSize
    }
    $candidatesChecked += $entry
    if (-not $selectedBcdedit -and $candExists -and $candIsExe) {
        $selectedBcdedit = $cand
    }
}

# Diagnostic command resolution only (not primary dependency)
$whereDiagnostic = $null
try {
    $cmd = Get-Command bcdedit.exe -ErrorAction SilentlyContinue
    if ($cmd) { $whereDiagnostic = $cmd.Source }
} catch {}

if (-not $selectedBcdedit) {
    $selectedBcdedit = if ($whereDiagnostic) { $whereDiagnostic } else { "$sysRoot\System32\bcdedit.exe" }
}

$bcdeditExe = $selectedBcdedit
Write-QaLog "Resolved bcdedit executable: $bcdeditExe (Exists: $(Test-Path -LiteralPath $bcdeditExe -PathType Leaf))" "Cyan"

$diagReport = [ordered]@{
    SystemRoot                   = $sysRoot
    WindowsArchitecture          = $osArch
    ProcessArchitecture          = $procArch
    NodeArchitecture             = $procArch
    ElectronArchitecture         = $procArch
    candidateBcdeditPathsChecked = $candidatesChecked
    whichPathWasSelected         = $bcdeditExe
    whetherTheFileExisted        = (Test-Path -LiteralPath $bcdeditExe -PathType Leaf)
    fileVersionIfAvailable       = (if ($candidatesChecked) { ($candidatesChecked | Where-Object { $_.Path -eq $bcdeditExe }).FileVersion } else { "N/A" })
    elevationStatus              = [ordered]@{
        elevationRequested       = $true
        elevatedProcessStarted   = $true
        uacCancelled             = $false
        elevationFailed          = $false
        elevatedProcessExitCode  = 0
    }
    actualCommandExecuted        = "$bcdeditExe /set testsigning on"
    stdout                       = ""
    stderr                       = ""
    exitCode                     = -1
    finalTestSigningState        = $false
    whereDiagnostic              = $whereDiagnostic
    CommandAttempted             = "$bcdeditExe /set testsigning on"
    ExecutablePath               = $bcdeditExe
    PowerShellPath               = (Get-Process -Id $PID -ErrorAction SilentlyContinue).Path
    Arguments                    = @("/set", "testsigning", "on")
    BcdVerifyResult              = ""
    TestSigningActive            = $false
    AlreadyEnabled               = $false
    RebootRequired               = $false
    SecureBootBlocked            = $false
    SecureBootStatus             = "Unknown"
    RealWindowsError             = ""
    WindowsVersion               = [Environment]::OSVersion.ToString()
    WindowsCaption               = ""
    IsAdmin                      = $true
    Timestamp                    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff zzz")
}

try {
    $osInfo = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    if ($osInfo) { $diagReport.WindowsCaption = $osInfo.Caption }
} catch {}

# 3. Check UEFI Secure Boot Status (without modifying Secure Boot)
Write-QaLog "Checking UEFI Secure Boot status..."
try {
    $sb = Confirm-SecureBootUEFI
    $diagReport.SecureBootStatus = if ($sb) { "Enabled" } else { "Disabled" }
    Write-QaLog "Secure Boot Status: $($diagReport.SecureBootStatus)"
    if ($sb) {
        $diagReport.SecureBootBlocked = $true
    }
} catch {
    $diagReport.SecureBootStatus = "NotSupportedOrLegacy ($($_.Exception.Message))"
    Write-QaLog "Secure Boot check: $($diagReport.SecureBootStatus)"
}

# 4. Check Current BCD Status Before Modifying
Write-QaLog "Checking initial BCD status..."
try {
    $initBcd = & $bcdeditExe 2>&1
    if ($initBcd -match 'testsigning\s+Yes') {
        Write-QaLog "Windows Test Signing is ALREADY enabled in BCD." "Green"
        $diagReport.AlreadyEnabled = $true
        $diagReport.TestSigningActive = $true
        $diagReport.Success = $true
        $diagReport.ExitCode = 0
        $diagReport.StdOut = "$initBcd"
        $diagReport.Message = "Mode Pengujian Windows sudah aktif. Komputer perlu direstart untuk melanjutkan."

        $jsonOut = $diagReport | ConvertTo-Json -Depth 5
        try { $jsonOut | Out-File -FilePath $ResultFile -Force -Encoding utf8 } catch {}
        Write-Output $jsonOut
        exit 0
    }
} catch {}

# 5. Execute exactly: bcdedit /set testsigning on
Write-QaLog "Executing: $bcdeditExe /set testsigning on" "Cyan"

$stdout = ""
$stderr = ""
$exitCode = -1

try {
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $bcdeditExe
    $pinfo.Arguments = "/set testsigning on"
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.UseShellExecute = $false
    $pinfo.CreateNoWindow = $true

    $p = New-Object System.Diagnostics.Process
    $p.StartInfo = $pinfo
    $p.Start() | Out-Null
    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit(10000)
    $exitCode = $p.ExitCode
} catch {
    $stderr = $_.Exception.Message
    $exitCode = -1
}

$diagReport.ExitCode = $exitCode
$diagReport.StdOut = $stdout.Trim()
$diagReport.StdErr = $stderr.Trim()

Write-QaLog "bcdedit exit code: $exitCode"
if ($stdout) { Write-QaLog "bcdedit stdout: $($stdout.Trim())" }
if ($stderr) { Write-QaLog "bcdedit stderr: $($stderr.Trim())" "Red" }

# 6. Verify Result With: bcdedit
Write-QaLog "Verifying result with: $bcdeditExe" "Cyan"
$vStdout = ""
$vStderr = ""
try {
    $vinfo = New-Object System.Diagnostics.ProcessStartInfo
    $vinfo.FileName = $bcdeditExe
    $vinfo.Arguments = ""
    $vinfo.RedirectStandardOutput = $true
    $vinfo.RedirectStandardError = $true
    $vinfo.UseShellExecute = $false
    $vinfo.CreateNoWindow = $true

    $vp = New-Object System.Diagnostics.Process
    $vp.StartInfo = $vinfo
    $vp.Start() | Out-Null
    $vStdout = $vp.StandardOutput.ReadToEnd()
    $vStderr = $vp.StandardError.ReadToEnd()
    $vp.WaitForExit(10000)
} catch {
    $vStderr = $_.Exception.Message
}

$verifyAll = ($vStdout + "`n" + $vStderr).Trim()
$diagReport.BcdVerifyResult = $verifyAll

# Detect whether "testsigning Yes" is actually present
if ($verifyAll -match 'testsigning\s+Yes') {
    $diagReport.TestSigningActive = $true
    Write-QaLog "Verification SUCCESS: 'testsigning Yes' is PRESENT in BCD." "Green"
} else {
    $diagReport.TestSigningActive = $false
    Write-QaLog "Verification NOTICE: 'testsigning Yes' is NOT present in BCD." "Yellow"
}

# 7. Determine Real Windows Error & Final Status
$combinedOutput = ($stdout + " " + $stderr).Trim()

if ($combinedOutput -match 'protected by Secure Boot' -or $combinedOutput -match 'Secure Boot') {
    $diagReport.SecureBootBlocked = $true
    $diagReport.RealWindowsError = "The value is protected by Secure Boot policy and cannot be modified or deleted. ($combinedOutput)"
    $diagReport.Success = $false
    $diagReport.Message = "Secure Boot aktif di BIOS/UEFI tablet. Windows melarang Mode Pengujian selama Secure Boot aktif. Harap nonaktifkan Secure Boot di BIOS/UEFI tablet untuk melakukan pengujian driver kamera."
    $finalExit = 1
} elseif ($diagReport.TestSigningActive) {
    $diagReport.Success = $true
    $diagReport.RebootRequired = $true
    $diagReport.Message = "Mode Pengujian Windows sudah aktif. Komputer perlu direstart untuk melanjutkan."
    $finalExit = 0
} elseif ($exitCode -eq 0 -or $stdout -match 'completed successfully' -or $stdout -match 'berhasil') {
    $diagReport.Success = $true
    $diagReport.RebootRequired = $true
    $diagReport.Message = "Mode Pengujian Windows sudah aktif. Komputer perlu direstart untuk melanjutkan."
    $finalExit = 0
} else {
    $diagReport.Success = $false
    $diagReport.RealWindowsError = if ($combinedOutput) { $combinedOutput } else { "bcdedit /set testsigning on failed with exit code $exitCode" }
    $diagReport.Message = "Gagal mengaktifkan mode pengujian: $($diagReport.RealWindowsError)"
    $finalExit = 1
}

# 8. Save Dedicated Diagnostic Report
$diagReport.stdout = $stdout.Trim()
$diagReport.stderr = $stderr.Trim()
$diagReport.exitCode = $finalExit
$diagReport.finalTestSigningState = $diagReport.TestSigningActive
$diagReport.elevationStatus.elevatedProcessExitCode = $finalExit

$jsonOut = $diagReport | ConvertTo-Json -Depth 5
try {
    $jsonOut | Out-File -FilePath $ResultFile -Force -Encoding utf8
    Write-QaLog "Saved diagnostic report to: $ResultFile" "Green"
} catch {
    Write-QaLog "Failed to save diagnostic report: $($_.Exception.Message)" "Red"
}

Write-QaLog "Helper finished with exit code: $finalExit"
Write-Output $jsonOut
exit $finalExit
