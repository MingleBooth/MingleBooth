<#
.SYNOPSIS
    MingleBooth QA - Restore Windows to Normal Mode (Disable Test Signing)
.DESCRIPTION
    Disables Windows Test Signing Mode to return Windows to its original normal state:
      1. Detects and handles UAC elevation cleanly across process boundaries.
      2. Executes exactly: bcdedit /set testsigning off
      3. Cleanly captures stdout, stderr, and exit code.
      4. Verifies result with: bcdedit
      5. Writes structured developer diagnostics to %LOCALAPPDATA%\MingleBooth\qa-reports\
      6. Returns structured result object to parent process / Electron.
#>

[CmdletBinding()]
param(
    [string]$ResultFile = "",
    [string]$LogFile = ""
)

$ErrorActionPreference = "Continue"

$qaDir = "$env:LOCALAPPDATA\MingleBooth"
$qaReportsDir = "$qaDir\qa-reports"
try {
    if (-not (Test-Path $qaDir)) { New-Item -ItemType Directory -Path $qaDir -Force | Out-Null }
    if (-not (Test-Path $qaReportsDir)) { New-Item -ItemType Directory -Path $qaReportsDir -Force | Out-Null }
} catch {}

if (-not $ResultFile) {
    $ResultFile = "$qaReportsDir\restore-normal-result.json"
}
if (-not $LogFile) {
    $LogFile = "$qaReportsDir\restore-normal-execution.log"
}

function Write-QaLog {
    param([string]$Message, [string]$Color = "White")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $line = "[$ts] $Message"
    try { $line | Out-File -FilePath $LogFile -Append -Encoding utf8 } catch {}
    Write-Host $line -ForegroundColor $Color
}

Write-QaLog "================================================================" "Cyan"
Write-QaLog "  MINGLEBOOTH QA: RESTORE NORMAL MODE (DISABLE TEST SIGNING)" "Cyan"
Write-QaLog "================================================================" "Cyan"

# 1. Administrator & Elevation Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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

        if (Test-Path $ResultFile) {
            $jsonContent = Get-Content -Path $ResultFile -Raw -Encoding utf8
            Write-Output $jsonContent
            exit $childExit
        } else {
            $isUacCancelled = ($childExit -eq 1223)
            $fallback = [ordered]@{
                Success  = ($childExit -eq 0)
                ExitCode = $childExit
                Message  = if ($isUacCancelled) { "Izin Administrator diperlukan untuk melanjutkan." } else { "Helper selesai dengan kode $childExit." }
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
            Success  = $false
            ExitCode = if ($isCancelled) { 1223 } else { 2 }
            Message  = if ($isCancelled) { "Izin Administrator diperlukan untuk melanjutkan." } else { "Windows tidak memberikan izin Administrator. Silakan coba lagi." }
        }
        $jsonContent = $errReport | ConvertTo-Json -Depth 4
        try { $jsonContent | Out-File -FilePath $ResultFile -Force -Encoding utf8 } catch {}
        Write-Output $jsonContent
        exit $(if ($isCancelled) { 1223 } else { 2 })
    }
}

# 2. Running Elevated
Write-QaLog "Running in ELEVATED mode. Initializing..." "Green"

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
    whereDiagnostic              = $whereDiagnostic
    CommandAttempted             = "$bcdeditExe /set testsigning off"
    ExecutablePath               = $bcdeditExe
    ExitCode                     = -1
    StdOut                       = ""
    StdErr                       = ""
    BcdVerifyResult              = ""
    TestSigningActive            = $true
    AlreadyDisabled              = $false
    RebootRequired               = $false
    RealWindowsError             = ""
    Success                      = $false
    Message                      = ""
    Timestamp                    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff zzz")
}

# 3. Check if already disabled
try {
    $initBcd = & $bcdeditExe 2>&1
    if ($initBcd -notmatch 'testsigning\s+Yes') {
        Write-QaLog "Windows Test Signing is already disabled (normal mode)." "Green"
        $diagReport.AlreadyDisabled = $true
        $diagReport.TestSigningActive = $false
        $diagReport.Success = $true
        $diagReport.ExitCode = 0
        $diagReport.Message = "Windows telah berada dalam mode normal."
        $jsonOut = $diagReport | ConvertTo-Json -Depth 4
        try { $jsonOut | Out-File -FilePath $ResultFile -Force -Encoding utf8 } catch {}
        Write-Output $jsonOut
        exit 0
    }
} catch {}

# 4. Disable test signing
Write-QaLog "Executing: $bcdeditExe /set testsigning off" "Cyan"
$stdout = ""
$stderr = ""
$exitCode = -1

try {
    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $bcdeditExe
    $pinfo.Arguments = "/set testsigning off"
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

# 5. Verify result
Write-QaLog "Verifying result with: $bcdeditExe" "Cyan"
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

    $verifyAll = ($vStdout + "`n" + $vStderr).Trim()
    $diagReport.BcdVerifyResult = $verifyAll

    if ($verifyAll -notmatch 'testsigning\s+Yes') {
        $diagReport.TestSigningActive = $false
        $diagReport.Success = $true
        $diagReport.RebootRequired = $true
        $diagReport.Message = "Mode pengujian dinonaktifkan. Komputer perlu direstart untuk kembali ke mode normal."
        $finalExit = 0
    } else {
        $diagReport.TestSigningActive = $true
        $diagReport.Success = ($exitCode -eq 0)
        $diagReport.RebootRequired = ($exitCode -eq 0)
        $diagReport.Message = "Mode pengujian dinonaktifkan. Komputer perlu direstart untuk kembali ke mode normal."
        $finalExit = if ($exitCode -eq 0) { 0 } else { 1 }
    }
} catch {
    $diagReport.Success = ($exitCode -eq 0)
    $diagReport.RebootRequired = ($exitCode -eq 0)
    $finalExit = if ($exitCode -eq 0) { 0 } else { 1 }
}

$jsonOut = $diagReport | ConvertTo-Json -Depth 4
try { $jsonOut | Out-File -FilePath $ResultFile -Force -Encoding utf8 } catch {}
Write-Output $jsonOut
exit $finalExit
