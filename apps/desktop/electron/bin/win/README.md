# Windows Camera Engine — Bundling Guide

This directory (`electron/bin/win/`) must contain the bundled Windows
gphoto2 binaries for MingleBooth to perform camera capture on Windows
WITHOUT requiring vendor to install gphoto2 manually.

## Current Status

Windows camera capture uses **digiCamControl** (free, open-source) as the
primary engine via HTTP API at `http://127.0.0.1:5513`. Vendors need
digiCamControl installed.

Alternatively, bundle gphoto2.exe here for fully self-contained capture.

---

## Option A: Bundle gphoto2.exe from MSYS2 (Recommended for self-contained)

### Step 1: Install MSYS2
Download from https://www.msys2.org/ and install.

### Step 2: Install gphoto2 via MSYS2 MinGW64
```bash
# In MSYS2 MinGW64 terminal:
pacman -Syu
pacman -S mingw-w64-x86_64-gphoto2
```

### Step 3: Copy required files to this directory
From `C:\msys64\mingw64\bin\`:
```
gphoto2.exe
libgphoto2-6.dll      (or libgphoto2.dll)
libgphoto2_port-12.dll (or libgphoto2_port.dll)
libusb-1.0.dll
libltdl-7.dll
libintl-8.dll
libiconv-2.dll
libwinpthread-1.dll
libgcc_s_seh-1.dll
libstdc++-6.dll
```

### Step 4: Copy camlibs and iolibs
From `C:\msys64\mingw64\lib\libgphoto2\`:
- Copy entire `camlibs\` folder here
From `C:\msys64\mingw64\lib\libgphoto2_port\`:
- Copy entire `iolibs\` folder here

### Step 5: Verify
```bash
cd apps/desktop
node scripts/check-win-camera-engine.cjs
```

### Expected directory structure:
```
electron/bin/win/
├── gphoto2.exe
├── libgphoto2.dll
├── libgphoto2_port.dll
├── libusb-1.0.dll
├── libltdl-7.dll
├── libintl-8.dll
├── libiconv-2.dll
├── libwinpthread-1.dll
├── camlibs/
│   ├── canon.dll
│   ├── nikon.dll
│   ├── ptp2.dll
│   └── ... (camera-specific drivers)
└── iolibs/
    ├── libusb1.dll
    └── ... (IO port drivers)
```

---

## Option B: digiCamControl (Vendor-installed, simpler for operator)

digiCamControl is a free Windows photobooth camera control app that exposes
an HTTP API at port 5513. MingleBooth automatically detects and uses it.

Vendor setup:
1. Download digiCamControl from https://www.digicamcontrol.com/
2. Install it on the vendor's Windows PC
3. Launch digiCamControl BEFORE opening MingleBooth
4. Connect camera via USB
5. Open MingleBooth → Camera will be detected automatically

Supported cameras via digiCamControl:
- All Canon EOS DSLR and Mirrorless
- All Nikon DSLR and Mirrorless
- Select Sony models (Alpha series)
- Fujifilm X-series
- (See https://www.digicamcontrol.com/camera-support for full list)

---

## MingleBooth Camera Engine Priority (Windows)

1. **sony_camera_hub** (macOS/Linux only — not available on Windows)
2. **digiCamControl HTTP API** — if running on port 5513
3. **bundled gphoto2.exe** — if present in this directory
4. → Error: CAMERA_ENGINE_NOT_FOUND with hint to install digiCamControl
