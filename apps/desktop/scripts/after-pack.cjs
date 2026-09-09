/**
 * after-pack.cjs
 * electron-builder afterPack hook.
 * Validates that camera engine files were correctly bundled into the output package.
 *
 * This runs AFTER electron-builder packages the app, before creating the installer.
 * It catches bundling issues (e.g., files accidentally excluded from asarUnpack).
 */

const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  const { appOutDir, packager, targets } = context;
  const platform = packager.platform.name; // 'win', 'mac', 'linux'

  console.log(`\n[MingleBooth afterPack] Validating camera engine bundle for platform: ${platform}`);

  let errors = [];
  let warnings = [];

  const isWin = platform === 'win' || platform === 'windows' || platform === 'win32';
  const isMac = platform === 'mac' || platform === 'darwin' || platform === 'macos';

  if (isWin) {
    const resourcesDir = path.join(appOutDir, 'resources');
    const unpackedBin = path.join(resourcesDir, 'app.asar.unpacked', 'electron', 'bin');

    if (!fs.existsSync(unpackedBin)) {
      errors.push(`electron/bin not found in app.asar.unpacked: ${unpackedBin}`);
    } else {
      console.log(`  ✅ app.asar.unpacked/electron/bin found: ${unpackedBin}`);

      const winBinDir = path.join(unpackedBin, 'win');

      // 1. Check gphoto2.exe
      const winExe = path.join(winBinDir, 'gphoto2.exe');
      if (fs.existsSync(winExe)) {
        const stat = fs.statSync(winExe);
        console.log(`  ✅ gphoto2.exe bundled (${(stat.size / 1024).toFixed(0)} KB)`);
      } else {
        errors.push('gphoto2.exe not bundled in app.asar.unpacked/electron/bin/win/gphoto2.exe');
      }

      // 2. Check essential DLLs
      const requiredDlls = ['libusb-1.0.dll', 'libltdl-7.dll'];
      for (const dll of requiredDlls) {
        if (fs.existsSync(path.join(winBinDir, dll))) {
          console.log(`  ✅ ${dll} bundled`);
        } else {
          errors.push(`${dll} not bundled in app.asar.unpacked/electron/bin/win/`);
        }
      }

      const gphotoDllPairs = [
        ['libgphoto2.dll', 'libgphoto2-6.dll'],
        ['libgphoto2_port.dll', 'libgphoto2_port-12.dll'],
      ];
      for (const pair of gphotoDllPairs) {
        const found = pair.find(f => fs.existsSync(path.join(winBinDir, f)));
        if (found) {
          console.log(`  ✅ ${found} bundled`);
        } else {
          errors.push(`${pair[0]} not bundled in app.asar.unpacked/electron/bin/win/`);
        }
      }

      // 3. Check Windows camlibs
      const winCamlibs = path.join(winBinDir, 'camlibs');
      if (fs.existsSync(winCamlibs)) {
        const plugins = fs.readdirSync(winCamlibs).filter(f => f.endsWith('.dll'));
        const hasPtp = plugins.some(f => f.toLowerCase().includes('ptp'));
        if (plugins.length > 0 && hasPtp) {
          console.log(`  ✅ camlibs bundled (${plugins.length} plugins, PTP driver included)`);
        } else if (!hasPtp) {
          errors.push('ptp2.dll missing from camlibs in app.asar.unpacked/electron/bin/win/camlibs');
        } else {
          errors.push('camlibs directory empty in app.asar.unpacked/electron/bin/win/camlibs');
        }
      } else {
        errors.push('camlibs directory missing in app.asar.unpacked/electron/bin/win/camlibs');
      }

      // 4. Check Windows iolibs
      const winIolibs = path.join(winBinDir, 'iolibs');
      if (fs.existsSync(winIolibs)) {
        const plugins = fs.readdirSync(winIolibs).filter(f => f.endsWith('.dll'));
        const hasUsb = plugins.some(f => f.toLowerCase().includes('usb'));
        if (plugins.length > 0 && hasUsb) {
          console.log(`  ✅ iolibs bundled (${plugins.length} plugins, USB plugin included)`);
        } else if (!hasUsb) {
          errors.push('usb1.dll missing from iolibs in app.asar.unpacked/electron/bin/win/iolibs');
        } else {
          errors.push('iolibs directory empty in app.asar.unpacked/electron/bin/win/iolibs');
        }
      } else {
        errors.push('iolibs directory missing in app.asar.unpacked/electron/bin/win/iolibs');
      }
    }
  }

  if (isMac) {
    const resourcesDir = path.join(appOutDir, 'MingleBooth Studio.app', 'Contents', 'Resources');
    const unpackedBin = path.join(resourcesDir, 'app.asar.unpacked', 'electron', 'bin');
    const hubBinary = path.join(unpackedBin, 'sony_camera_hub');

    if (fs.existsSync(hubBinary)) {
      const stat = fs.statSync(hubBinary);
      console.log(`  ✅ sony_camera_hub bundled (${(stat.size / 1024).toFixed(0)} KB)`);
      // Ensure it's executable
      try {
        fs.chmodSync(hubBinary, 0o755);
        console.log('  ✅ sony_camera_hub permissions set to executable');
      } catch (e) {
        warnings.push(`Could not chmod sony_camera_hub: ${e.message}`);
      }
    } else {
      errors.push(`sony_camera_hub not found at ${hubBinary} — macOS camera engine missing from bundle.`);
    }
  }

  // Report
  for (const w of warnings) {
    console.warn(`  ⚠️  ${w}`);
  }
  for (const e of errors) {
    console.error(`  ❌ ${e}`);
  }

  if (errors.length > 0) {
    throw new Error(`[MingleBooth afterPack] Camera engine bundle validation FAILED:\n${errors.join('\n')}`);
  }

  console.log(`[MingleBooth afterPack] Camera engine validation complete for ${platform}.\n`);
};
