# bundle-win-camera-engine.ps1
# PowerShell script to download and extract official MSYS2 prebuilt mingw64 binaries for MingleBooth
# Run on Windows: powershell -ExecutionPolicy Bypass -File .\scripts\bundle-win-camera-engine.ps1

$ErrorActionPreference = "Stop"

$Root = Resolve-Path "$PSScriptRoot\.."
$TargetDir = "$Root\electron\bin\win"
$CamlibsDir = "$TargetDir\camlibs"
$IolibsDir = "$TargetDir\iolibs"
$TempDir = "$Root\electron\bin\.win_bundle_temp"

$Mirror = "https://mirror.msys2.org/mingw/mingw64"

$Packages = @(
    "mingw-w64-x86_64-gphoto2-2.5.32-1-any.pkg.tar.zst",
    "mingw-w64-x86_64-libgphoto2-2.5.34-2-any.pkg.tar.zst",
    "mingw-w64-x86_64-libusb-1.0.30-1-any.pkg.tar.zst",
    "mingw-w64-x86_64-libexif-0.6.26-1-any.pkg.tar.zst",
    "mingw-w64-x86_64-libltdl-2.6.2-1-any.pkg.tar.zst",
    "mingw-w64-x86_64-gettext-runtime-1.0-1-any.pkg.tar.zst",
    "mingw-w64-x86_64-libiconv-1.19-1-any.pkg.tar.zst",
    "mingw-w64-x86_64-libwinpthread-14.0.0.r353.g6df76fa52-2-any.pkg.tar.zst",
    "mingw-w64-x86_64-zlib-1.3.2-2-any.pkg.tar.zst",
    "mingw-w64-x86_64-gcc-libs-16.2.0-3-any.pkg.tar.zst"
)

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "MingleBooth — Windows Camera Engine Bundler (PowerShell)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
New-Item -ItemType Directory -Force -Path $CamlibsDir | Out-Null
New-Item -ItemType Directory -Force -Path $IolibsDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

Write-Host "`n[1/3] Downloading MSYS2 packages..." -ForegroundColor Yellow
foreach ($pkg in $Packages) {
    $dest = "$TempDir\$pkg"
    $url = "$Mirror/$pkg"
    if (-not (Test-Path $dest)) {
        Write-Host "  Downloading $pkg..."
        curl.exe -fSL -o $dest $url
    } else {
        Write-Host "  Cached: $pkg"
    }
}

Write-Host "`n[2/3] Extracting binaries..." -ForegroundColor Yellow
# On Windows 10/11 tar.exe is built-in. If zstd is installed:
foreach ($pkg in $Packages) {
    $pkgPath = "$TempDir\$pkg"
    $outSub = "$TempDir\pkg_$pkg"
    New-Item -ItemType Directory -Force -Path $outSub | Out-Null
    
    if (Get-Command zstd -ErrorAction SilentlyContinue) {
        cmd.exe /c "zstd -dc `"$pkgPath`" | tar -x -C `"$outSub`""
    } else {
        # Fallback: tar in modern Windows may support zstd or use 7zip if available
        tar.exe -xf $pkgPath -C $outSub 2>$null
    }

    # Copy DLLs and EXEs
    $binDir = "$outSub\mingw64\bin"
    if (Test-Path $binDir) {
        Get-ChildItem -Path $binDir -Include *.exe,*.dll -Recurse | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $TargetDir -Force
        }
    }

    # Copy camlibs
    $camlibSrc = "$outSub\mingw64\lib\libgphoto2"
    if (Test-Path $camlibSrc) {
        Get-ChildItem -Path $camlibSrc -Filter *.dll -Recurse | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $CamlibsDir -Force
        }
    }

    # Copy iolibs
    $iolibSrc = "$outSub\mingw64\lib\libgphoto2_port"
    if (Test-Path $iolibSrc) {
        Get-ChildItem -Path $iolibSrc -Filter *.dll -Recurse | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $IolibsDir -Force
        }
    }
}

# Aliases
if ((Test-Path "$TargetDir\libgphoto2-6.dll") -and (-not (Test-Path "$TargetDir\libgphoto2.dll"))) {
    Copy-Item "$TargetDir\libgphoto2-6.dll" "$TargetDir\libgphoto2.dll" -Force
}
if ((Test-Path "$TargetDir\libgphoto2_port-12.dll") -and (-not (Test-Path "$TargetDir\libgphoto2_port.dll"))) {
    Copy-Item "$TargetDir\libgphoto2_port-12.dll" "$TargetDir\libgphoto2_port.dll" -Force
}

Write-Host "`n[3/3] Validating bundle..." -ForegroundColor Green
node "$Root\scripts\check-win-camera-engine.cjs"
