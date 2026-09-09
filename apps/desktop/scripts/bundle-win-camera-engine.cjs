#!/usr/bin/env node
/**
 * bundle-win-camera-engine.cjs
 *
 * Automatically downloads and packages the official MSYS2 prebuilt mingw64
 * camera engine binaries into electron/bin/win/.
 *
 * Includes:
 *   - gphoto2.exe (PTP CLI engine)
 *   - libgphoto2.dll & libgphoto2_port.dll
 *   - libusb-1.0.dll (USB transport)
 *   - Supporting runtime DLLs (libltdl, libintl, libiconv, libwinpthread, zlib, gcc-libs)
 *   - camlibs/ (camera driver plugins including ptp2.dll)
 *   - iolibs/ (IO drivers including usb1.dll)
 *
 * Usage:
 *   node scripts/bundle-win-camera-engine.cjs [--force]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(ROOT, 'electron', 'bin', 'win');
const CAMLIBS_DIR = path.join(TARGET_DIR, 'camlibs');
const IOLIBS_DIR = path.join(TARGET_DIR, 'iolibs');
const TEMP_DIR = path.join(ROOT, 'electron', 'bin', '.win_bundle_temp');

const MSYS2_MIRROR = 'https://mirror.msys2.org/mingw/mingw64';

// Current official MSYS2 mingw64 package versions
const PACKAGES = [
  { name: 'gphoto2', file: 'mingw-w64-x86_64-gphoto2-2.5.32-1-any.pkg.tar.zst' },
  { name: 'libgphoto2', file: 'mingw-w64-x86_64-libgphoto2-2.5.34-2-any.pkg.tar.zst' },
  { name: 'libusb', file: 'mingw-w64-x86_64-libusb-1.0.30-1-any.pkg.tar.zst' },
  { name: 'libexif', file: 'mingw-w64-x86_64-libexif-0.6.26-1-any.pkg.tar.zst' },
  { name: 'libltdl', file: 'mingw-w64-x86_64-libltdl-2.6.2-1-any.pkg.tar.zst' },
  { name: 'gettext-runtime', file: 'mingw-w64-x86_64-gettext-runtime-1.0-1-any.pkg.tar.zst' },
  { name: 'libiconv', file: 'mingw-w64-x86_64-libiconv-1.19-1-any.pkg.tar.zst' },
  { name: 'libwinpthread', file: 'mingw-w64-x86_64-libwinpthread-14.0.0.r353.g6df76fa52-2-any.pkg.tar.zst' },
  { name: 'zlib', file: 'mingw-w64-x86_64-zlib-1.3.2-2-any.pkg.tar.zst' },
  { name: 'gcc-libs', file: 'mingw-w64-x86_64-gcc-libs-16.2.0-3-any.pkg.tar.zst' },
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function run() {
  console.log('====================================================');
  console.log('MingleBooth — Bundling Windows Camera Engine');
  console.log('====================================================');
  console.log('Target directory:', TARGET_DIR);

  ensureDir(TARGET_DIR);
  ensureDir(CAMLIBS_DIR);
  ensureDir(IOLIBS_DIR);
  ensureDir(TEMP_DIR);

  const isForce = process.argv.includes('--force');

  // Check if already populated
  const requiredFiles = ['gphoto2.exe', 'libusb-1.0.dll'];
  const allExist = requiredFiles.every(f => fs.existsSync(path.join(TARGET_DIR, f))) &&
                   fs.existsSync(CAMLIBS_DIR) && fs.readdirSync(CAMLIBS_DIR).length > 0;

  if (allExist && !isForce) {
    console.log('\n✅ Windows camera engine is already bundled in electron/bin/win/.');
    console.log('   Use --force to re-download and re-extract.');
    return;
  }

  console.log('\n[1/3] Downloading packages from MSYS2 repository...');

  for (const pkg of PACKAGES) {
    const pkgPath = path.join(TEMP_DIR, pkg.file);
    const url = `${MSYS2_MIRROR}/${pkg.file}`;

    if (!fs.existsSync(pkgPath)) {
      console.log(`  Downloading ${pkg.name} (${pkg.file})...`);
      try {
        execSync(`curl -fSL -o "${pkgPath}" "${url}"`, { stdio: 'inherit' });
      } catch (err) {
        console.error(`Failed to download ${pkg.name} from ${url}:`, err.message);
        throw err;
      }
    } else {
      console.log(`  Cached: ${pkg.file}`);
    }
  }

  console.log('\n[2/3] Extracting binaries and libraries...');

  for (const pkg of PACKAGES) {
    const pkgPath = path.join(TEMP_DIR, pkg.file);
    const extractSubDir = path.join(TEMP_DIR, `pkg_${pkg.name}`);
    ensureDir(extractSubDir);

    console.log(`  Extracting ${pkg.name}...`);
    // Extract using zstd and tar
    try {
      execSync(`zstd -dc "${pkgPath}" | tar -x -C "${extractSubDir}"`, { stdio: 'pipe' });
    } catch (err) {
      console.error(`Extraction failed for ${pkg.file}:`, err.message);
      throw err;
    }

    // Inspect mingw64/bin
    const binDir = path.join(extractSubDir, 'mingw64', 'bin');
    if (fs.existsSync(binDir)) {
      const files = fs.readdirSync(binDir);
      for (const file of files) {
        if (file.endsWith('.exe') || file.endsWith('.dll')) {
          const src = path.join(binDir, file);
          const dest = path.join(TARGET_DIR, file);
          fs.copyFileSync(src, dest);
          // Set executable permissions
          fs.chmodSync(dest, 0o755);
        }
      }
    }

    // Extract camlibs from libgphoto2
    if (pkg.name === 'libgphoto2') {
      const libGphotoDir = path.join(extractSubDir, 'mingw64', 'lib', 'libgphoto2');
      if (fs.existsSync(libGphotoDir)) {
        const subdirs = fs.readdirSync(libGphotoDir);
        for (const sub of subdirs) {
          const versionDir = path.join(libGphotoDir, sub);
          if (fs.statSync(versionDir).isDirectory()) {
            const camlibFiles = fs.readdirSync(versionDir);
            for (const cf of camlibFiles) {
              if (cf.endsWith('.dll')) {
                fs.copyFileSync(path.join(versionDir, cf), path.join(CAMLIBS_DIR, cf));
              }
            }
          }
        }
      }

      // Extract iolibs from libgphoto2_port
      const libPortDir = path.join(extractSubDir, 'mingw64', 'lib', 'libgphoto2_port');
      if (fs.existsSync(libPortDir)) {
        const subdirs = fs.readdirSync(libPortDir);
        for (const sub of subdirs) {
          const versionDir = path.join(libPortDir, sub);
          if (fs.statSync(versionDir).isDirectory()) {
            const iolibFiles = fs.readdirSync(versionDir);
            for (const iof of iolibFiles) {
              if (iof.endsWith('.dll')) {
                fs.copyFileSync(path.join(versionDir, iof), path.join(IOLIBS_DIR, iof));
              }
            }
          }
        }
      }
    }
  }

  // Create standard alias names if MSYS2 versioned names are used
  // e.g., libgphoto2-6.dll -> libgphoto2.dll
  const aliases = [
    { src: 'libgphoto2-6.dll', dest: 'libgphoto2.dll' },
    { src: 'libgphoto2_port-12.dll', dest: 'libgphoto2_port.dll' },
  ];

  for (const a of aliases) {
    const srcPath = path.join(TARGET_DIR, a.src);
    const destPath = path.join(TARGET_DIR, a.dest);
    if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`  Created alias: ${a.dest} -> ${a.src}`);
    }
  }

  // Clean up temporary extracted subdirectories (keep downloaded tarballs in temp or remove)
  console.log('\n[3/3] Cleaning temporary build files...');
  try {
    const tempItems = fs.readdirSync(TEMP_DIR);
    for (const item of tempItems) {
      if (item.startsWith('pkg_')) {
        fs.rmSync(path.join(TEMP_DIR, item), { recursive: true, force: true });
      }
    }
  } catch (e) {
    // Ignore cleanup error
  }

  // Summary
  const winFiles = fs.readdirSync(TARGET_DIR).filter(f => !fs.statSync(path.join(TARGET_DIR, f)).isDirectory());
  const camlibFiles = fs.readdirSync(CAMLIBS_DIR);
  const iolibFiles = fs.readdirSync(IOLIBS_DIR);

  console.log('\n====================================================');
  console.log('Windows Camera Engine Successfully Bundled!');
  console.log('====================================================');
  console.log(`  Binaries & DLLs: ${winFiles.length} files in electron/bin/win/`);
  console.log(`  Camera Drivers:  ${camlibFiles.length} plugins in camlibs/ (including ptp2.dll)`);
  console.log(`  IO Drivers:      ${iolibFiles.length} plugins in iolibs/ (including usb1.dll)`);
  console.log('====================================================\n');
}

run().catch((err) => {
  console.error('\n❌ Camera engine bundling failed:', err);
  process.exit(1);
});
