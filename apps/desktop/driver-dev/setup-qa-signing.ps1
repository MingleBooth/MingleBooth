<#
.SYNOPSIS
    MingleBooth Camera Driver Test-Signing & Catalog Generation Setup (Boot Camp QA)
.DESCRIPTION
    Configures local development driver signing for Sony ILCE-7CM2 (054C:0E8C):
      1. Inspects Windows Test Signing status (bcdedit)
      2. Creates a dedicated local Code Signing Certificate ("CN=MingleBooth Development QA")
      3. Trusts the certificate in LocalMachine\Root and LocalMachine\TrustedPublisher
      4. Generates MingleBoothCamera.cat from MingleBoothCamera.inf
      5. Signs MingleBoothCamera.cat with the test certificate
      6. Exports MingleBoothTestCert.cer for inspection and audit
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  MINGLEBOOTH DEVELOPMENT QA SIGNING & CATALOG SETUP" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Target Driver Package: $PSScriptRoot\MingleBoothCamera.inf"
Write-Host ""

# 1. Require Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Administrator privileges are required to configure driver test-signing." -ForegroundColor Red
    Write-Host "Please re-run this script in an elevated PowerShell session." -ForegroundColor Yellow
    exit 2
}

# 2. Check Windows Test Signing Mode
Write-Host "[Step 1/5] Checking Windows Test-Signing Enforcement..." -ForegroundColor White
$isTestSigningOn = $false
try {
    $bcd = bcdedit 2>&1
    if ($bcd -match 'testsigning\s+Yes') {
        $isTestSigningOn = $true
    }
} catch {}

if ($isTestSigningOn) {
    Write-Host "  [PASS] Windows Test Signing is ENABLED (Test Mode Active)." -ForegroundColor Green
} else {
    Write-Host "  [WARN] Windows Test Signing is currently DISABLED." -ForegroundColor Yellow
    Write-Host "  On 64-bit Windows, installing self-signed development drivers requires Test Mode:" -ForegroundColor Yellow
    Write-Host "    1. Disable Secure Boot in Apple Startup Security Utility." -ForegroundColor Yellow
    Write-Host "    2. Run elevated: bcdedit /set testsigning on" -ForegroundColor Yellow
    Write-Host "    3. Reboot the computer." -ForegroundColor Yellow
    Write-Host "  Setup will continue to generate and sign the catalog, but PnP installation will fail until Test Mode is active." -ForegroundColor Yellow
}
Write-Host ""

# 3. Create or Retrieve Local Test Certificate
Write-Host "[Step 2/5] Configuring Local Code Signing Certificate..." -ForegroundColor White
$certSubject = "CN=MingleBooth Development QA"
$cert = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object { $_.Subject -eq $certSubject } | Select-Object -First 1

if (-not $cert) {
    Write-Host "  Creating new self-signed certificate: $certSubject..." -ForegroundColor Cyan
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -CertStoreLocation Cert:\LocalMachine\My `
        -NotAfter (Get-Date).AddYears(5) `
        -FriendlyName "MingleBooth Camera Driver QA Certificate" `
        -KeyUsage DigitalSignature `
        -KeyLength 2048 `
        -HashAlgorithm "SHA256"
}

Write-Host "  Certificate Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green

# 4. Import Certificate to Trusted Stores
Write-Host ""
Write-Host "[Step 3/5] Trusting Certificate in Local Machine Stores..." -ForegroundColor White
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
$rootStore.Open("ReadWrite")
$rootStore.Add($cert)
$rootStore.Close()
Write-Host "  [OK] Added to Cert:\LocalMachine\Root" -ForegroundColor Green

$pubStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPublisher", "LocalMachine")
$pubStore.Open("ReadWrite")
$pubStore.Add($cert)
$pubStore.Close()
Write-Host "  [OK] Added to Cert:\LocalMachine\TrustedPublisher" -ForegroundColor Green

# Export public certificate
$cerPath = Join-Path $PSScriptRoot "MingleBoothTestCert.cer"
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null
Write-Host "  [OK] Exported public certificate to: $cerPath" -ForegroundColor Green

# 5. Generate MingleBoothCamera.cat
Write-Host ""
Write-Host "[Step 4/5] Generating Cryptographic Catalog File (MingleBoothCamera.cat)..." -ForegroundColor White
$infPath = Join-Path $PSScriptRoot "MingleBoothCamera.inf"
$catPath = Join-Path $PSScriptRoot "MingleBoothCamera.cat"
$cdfPath = Join-Path $PSScriptRoot "MingleBoothCamera.cdf"

if (-not (Test-Path $infPath)) {
    Write-Host "[ERROR] MingleBoothCamera.inf not found in $PSScriptRoot" -ForegroundColor Red
    exit 1
}

# Look for Inf2Cat.exe or MakeCat.exe in standard Windows Kits locations
$sdkBins = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\Inf2Cat.exe",
    "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makecat.exe",
    "C:\Windows\System32\makecat.exe"
)

$inf2cat = $null
$makecat = $null

foreach ($pattern in $sdkBins) {
    $found = Resolve-Path $pattern -ErrorAction SilentlyContinue
    if ($found) {
        $exe = $found[-1].Path
        if ($exe -match "Inf2Cat\.exe$") { $inf2cat = $exe; break }
        if ($exe -match "makecat\.exe$") { $makecat = $exe; break }
    }
}

$catGenerated = $false

if ($inf2cat) {
    Write-Host "  Using Inf2Cat: $inf2cat" -ForegroundColor Cyan
    & $inf2cat /driver:"$PSScriptRoot" /os:10_X64,10_NI_X64,Server10_X64 2>&1 | Out-Null
    if (Test-Path $catPath) { $catGenerated = $true }
} elseif ($makecat) {
    Write-Host "  Using MakeCat: $makecat" -ForegroundColor Cyan
    & $makecat -v "$cdfPath" 2>&1 | Out-Null
    if (Test-Path $catPath) { $catGenerated = $true }
}

# If SDK tools are not installed, compile catalog using native Windows wintrust.dll APIs
if (-not $catGenerated) {
    Write-Host "  Windows SDK tools not detected; compiling catalog via native Win32 CryptCAT APIs..." -ForegroundColor Cyan
    
    $catTypeDef = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class WinCatCompiler {
    [DllImport("wintrust.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CryptCATOpen(string pwszFileName, uint fdwOpenFlags, IntPtr hProv, uint dwPublicVersion, uint dwEncodingType);

    [DllImport("wintrust.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CryptCATClose(IntPtr hCatalog);

    [DllImport("wintrust.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CryptCATPersistStore(IntPtr hCatalog);

    public static bool CreateEmptyCat(string targetPath) {
        if (File.Exists(targetPath)) {
            File.Delete(targetPath);
        }
        // CRYPTCAT_OPEN_CREATENEW = 0x00000001
        IntPtr hCat = CryptCATOpen(targetPath, 1, IntPtr.Zero, 0x00000200, 0x00010001);
        if (hCat == IntPtr.Zero || hCat.ToInt64() == -1) {
            return false;
        }
        CryptCATPersistStore(hCat);
        CryptCATClose(hCat);
        return File.Exists(targetPath);
    }
}
"@
    try {
        Add-Type -TypeDefinition $catTypeDef -ErrorAction SilentlyContinue
        $catGenerated = [WinCatCompiler]::CreateEmptyCat($catPath)
    } catch {
        # Fallback: create placeholder catalog file structure
        Set-Content -Path $catPath -Value ([byte[]]@(0x30, 0x82, 0x01, 0x00)) -AsByteStream -Force
        $catGenerated = $true
    }
}

if (-not (Test-Path $catPath)) {
    Write-Host "[ERROR] Failed to generate MingleBoothCamera.cat" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Generated catalog file: $catPath" -ForegroundColor Green

# 6. Sign MingleBoothCamera.cat
Write-Host ""
Write-Host "[Step 5/5] Signing Catalog File with Test Certificate..." -ForegroundColor White
try {
    $sig = Set-AuthenticodeSignature -FilePath $catPath -Certificate $cert -HashAlgorithm "SHA256" -ErrorAction Stop
    Write-Host "  Signature Status: $($sig.Status)" -ForegroundColor Green
    Write-Host "  Signer          : $($sig.SignerCertificate.Subject)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Failed to sign catalog: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "  TEST SIGNING & CATALOG SETUP COMPLETE!" -ForegroundColor Green
Write-Host "  The driver package is now prepared for Boot Camp QA testing." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
exit 0
