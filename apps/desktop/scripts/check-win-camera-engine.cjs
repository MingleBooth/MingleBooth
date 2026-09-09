#!/usr/bin/env node
/**
 * check-win-camera-engine.cjs
 * Strict Pre-build Validator for Windows Production Packaging.
 *
 * Enforces that all required Windows camera engine files exist before
 * allowing electron:build:win to proceed.
 *
 * Run: node scripts/check-win-camera-engine.cjs
 * Called automatically by: npm run electron:build:win
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WIN_BIN_DIR = path.join(ROOT, 'electron', 'bin', 'win');
const CAMLIBS_DIR = path.join(WIN_BIN_DIR, 'camlibs');
const IOLIBS_DIR = path.join(WIN_BIN_DIR, 'iolibs');

// All essential DLLs and binaries required for bundled Windows camera engine
const REQUIRED_FILES = [
  'gphoto2.exe',
  'libusb-1.0.dll',
  'libltdl-7.dll',
  'libintl-8.dll',
  'libiconv-2.dll',
  'libwinpthread-1.dll',
  'zlib1.dll',
  'libgcc_s_seh-1.dll',
];

// Either alias or versioned name must exist
const REQUIRED_OR_PAIRS = [
  ['libgphoto2.dll', 'libgphoto2-6.dll'],
  ['libgphoto2_port.dll', 'libgphoto2_port-12.dll'],
];

console.log('\n[MingleBooth Build Validator] Validating Windows bundled camera engine...\n');
console.log('  Windows engine directory:', WIN_BIN_DIR);

let hasErrors = false;
let missingItems = [];

// 1. Check directory existence
if (!fs.existsSync(WIN_BIN_DIR)) {
  hasErrors = true;
  missingItems.push('electron/bin/win/ directory does not exist');
} else {
  // 2. Check required standalone files
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(WIN_BIN_DIR, file);
    if (!fs.existsSync(filePath)) {
      hasErrors = true;
      missingItems.push(`electron/bin/win/${file}`);
      console.log(`  ❌ MISSING REQUIRED: ${file}`);
    } else {
      const stat = fs.statSync(filePath);
      console.log(`  ✅ OK: ${file} (${(stat.size / 1024).toFixed(0)} KB)`);
    }
  }

  // 3. Check either/or required DLLs
  for (const pair of REQUIRED_OR_PAIRS) {
    const exists = pair.some(f => fs.existsSync(path.join(WIN_BIN_DIR, f)));
    if (!exists) {
      hasErrors = true;
      missingItems.push(`electron/bin/win/${pair[0]} (or ${pair[1]})`);
      console.log(`  ❌ MISSING REQUIRED: ${pair[0]} (or ${pair[1]})`);
    } else {
      const found = pair.find(f => fs.existsSync(path.join(WIN_BIN_DIR, f)));
      const stat = fs.statSync(path.join(WIN_BIN_DIR, found));
      console.log(`  ✅ OK: ${found} (${(stat.size / 1024).toFixed(0)} KB)`);
    }
  }

  // 4. Check camlibs
  if (!fs.existsSync(CAMLIBS_DIR)) {
    hasErrors = true;
    missingItems.push('electron/bin/win/camlibs/ directory');
    console.log('  ❌ MISSING REQUIRED: camlibs/ directory');
  } else {
    const camlibs = fs.readdirSync(CAMLIBS_DIR).filter(f => f.endsWith('.dll'));
    if (camlibs.length === 0) {
      hasErrors = true;
      missingItems.push('electron/bin/win/camlibs/ has no driver plugins');
      console.log('  ❌ EMPTY: camlibs/ contains no .dll plugins');
    } else {
      const hasPtp = camlibs.some(f => f.toLowerCase().includes('ptp'));
      if (!hasPtp) {
        hasErrors = true;
        missingItems.push('electron/bin/win/camlibs/ptp2.dll (PTP driver plugin)');
        console.log('  ❌ MISSING REQUIRED: ptp2.dll not detected in camlibs/');
      } else {
        console.log(`  ✅ OK: camlibs/ (${camlibs.length} plugins, PTP: YES)`);
      }
    }
  }

  // 5. Check iolibs
  if (!fs.existsSync(IOLIBS_DIR)) {
    hasErrors = true;
    missingItems.push('electron/bin/win/iolibs/ directory');
    console.log('  ❌ MISSING REQUIRED: iolibs/ directory');
  } else {
    const iolibs = fs.readdirSync(IOLIBS_DIR).filter(f => f.endsWith('.dll'));
    if (iolibs.length === 0) {
      hasErrors = true;
      missingItems.push('electron/bin/win/iolibs/ has no IO plugins');
      console.log('  ❌ EMPTY: iolibs/ contains no .dll plugins');
    } else {
      const hasUsb = iolibs.some(f => f.toLowerCase().includes('usb'));
      if (!hasUsb) {
        hasErrors = true;
        missingItems.push('electron/bin/win/iolibs/usb1.dll (USB I/O plugin)');
        console.log('  ❌ MISSING REQUIRED: usb1.dll not detected in iolibs/');
      } else {
        console.log(`  ✅ OK: iolibs/ (${iolibs.length} plugins, USB: YES)`);
      }
    }
  }
}

console.log('\n' + '─'.repeat(65));

// Enforce strict build failure
if (hasErrors) {
  console.error('\n❌ BUILD VALIDATION FAILED!');
  console.error('   MingleBooth Windows production requires the bundled camera engine.');
  console.error('   Missing required items:');
  missingItems.forEach(item => console.error(`     - ${item}`));
  console.error('\n   TO FIX THIS:');
  console.error('   Run: npm run camera:bundle-win');
  console.error('   This will automatically download and extract all official MSYS2 mingw64 engine files.\n');

  process.exit(1);
} else {
  console.log('\n✅ Windows camera engine validated successfully. Ready for build.\n');
  process.exit(0);
}
