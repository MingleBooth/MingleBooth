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
  'libpopt-0.dll',
  'libreadline8.dll',
  'libtermcap-0.dll',
  'libsystre-0.dll',
  'libtre-5.dll',
  'libjpeg-8.dll',
  'libxml2-16.dll',
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

  // 6. Check Windows Runtime / PE Import Dependencies
  if (process.platform === 'win32') {
    console.log('\n  Testing Windows Runtime Execution: gphoto2.exe --version...');
    try {
      const { execFileSync } = require('child_process');
      const gphotoExe = path.join(WIN_BIN_DIR, 'gphoto2.exe');
      const runEnv = {
        ...process.env,
        PATH: `${WIN_BIN_DIR};${process.env.PATH || ''}`,
        CAMLIBS: CAMLIBS_DIR,
        IOLIBS: IOLIBS_DIR,
        LC_ALL: 'C',
        LANG: 'C',
      };
      const out = execFileSync(gphotoExe, ['--version'], { env: runEnv, encoding: 'utf8', timeout: 5000 });
      console.log('  ✅ RUNTIME PASS: gphoto2.exe executed successfully (exitCode: 0)');
      console.log('     Version:', out.trim().split('\n')[0]);
    } catch (runErr) {
      hasErrors = true;
      missingItems.push(`gphoto2.exe failed to run: ${runErr.message}`);
      console.error(`  ❌ RUNTIME FAIL: gphoto2.exe failed with exitCode ${runErr.status || runErr.code}`);
    }
  } else {
    // Cross-platform: Validate PE Import Table dependencies
    console.log('\n  Validating PE Import Table dependencies (Static Link Integrity)...');
    try {
      const allDlls = new Set(fs.readdirSync(WIN_BIN_DIR).map(f => f.toLowerCase()));
      const systemDlls = new Set([
        'kernel32.dll', 'msvcrt.dll', 'user32.dll', 'gdi32.dll', 'advapi32.dll',
        'shell32.dll', 'ole32.dll', 'oleaut32.dll', 'ws2_32.dll', 'shlwapi.dll',
        'setupapi.dll', 'version.dll', 'winmm.dll', 'imm32.dll', 'rpcrt4.dll',
      ]);

      function getPeImports(buffer) {
        if (buffer.length < 64 || buffer.readUInt16LE(0) !== 0x5a4d) return [];
        const peOffset = buffer.readUInt32LE(0x3c);
        if (buffer.readUInt32LE(peOffset) !== 0x00004550) return [];
        const optOffset = peOffset + 24;
        const magic = buffer.readUInt16LE(optOffset);
        const isX64 = magic === 0x20b;
        const numSections = buffer.readUInt16LE(peOffset + 6);
        const importRva = buffer.readUInt32LE(optOffset + (isX64 ? 120 : 104));
        if (!importRva) return [];
        const secStart = optOffset + (isX64 ? 240 : 224);
        const sections = [];
        for (let i = 0; i < numSections; i++) {
          const off = secStart + i * 40;
          sections.push({
            vRva: buffer.readUInt32LE(off + 12),
            vSize: buffer.readUInt32LE(off + 8),
            rawOffset: buffer.readUInt32LE(off + 20),
            rawSize: buffer.readUInt32LE(off + 16),
          });
        }
        function rvaToOffset(rva) {
          for (const s of sections) {
            if (rva >= s.vRva && rva < s.vRva + Math.max(s.vSize, s.rawSize)) {
              return s.rawOffset + (rva - s.vRva);
            }
          }
          return 0;
        }
        const importOffset = rvaToOffset(importRva);
        if (!importOffset) return [];
        const imports = [];
        let curr = importOffset;
        while (curr + 20 <= buffer.length) {
          const nameRva = buffer.readUInt32LE(curr + 12);
          const iltRva = buffer.readUInt32LE(curr);
          if (!nameRva && !iltRva) break;
          const nameOff = rvaToOffset(nameRva);
          if (nameOff) {
            let str = '';
            let p = nameOff;
            while (p < buffer.length && buffer[p] !== 0) {
              str += String.fromCharCode(buffer[p++]);
            }
            if (str) imports.push(str);
          }
          curr += 20;
        }
        return imports;
      }

      const filesToCheck = ['gphoto2.exe', 'libgphoto2-6.dll', 'libgphoto2_port-12.dll', 'camlibs/ptp2.dll'];
      for (const rel of filesToCheck) {
        const full = path.join(WIN_BIN_DIR, rel);
        if (fs.existsSync(full)) {
          const buf = fs.readFileSync(full);
          const imps = getPeImports(buf);
          const missing = imps.filter(
            imp => !systemDlls.has(imp.toLowerCase()) &&
                   !allDlls.has(imp.toLowerCase()) &&
                   !imp.toLowerCase().startsWith('api-ms-win-')
          );
          if (missing.length > 0) {
            hasErrors = true;
            missingItems.push(`${rel} is missing DLL dependencies: ${missing.join(', ')}`);
            console.error(`  ❌ PE LINK ERROR: ${rel} requires unbundled DLLs: ${missing.join(', ')}`);
          } else {
            console.log(`  ✅ PE LINK OK: ${rel} has all ${imps.length} dependencies bundled`);
          }
        }
      }
    } catch (peErr) {
      console.warn('  ⚠️ PE validation warning:', peErr.message);
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
  console.log('\n✅ Windows camera engine validated successfully (Files & Link Dependencies OK). Ready for build.\n');
  process.exit(0);
}
