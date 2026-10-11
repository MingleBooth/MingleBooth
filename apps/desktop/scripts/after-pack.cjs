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
    const batSrc = path.join(__dirname, '..', 'MingleBooth-Camera-QA.bat');
    const batDst = path.join(appOutDir, 'MingleBooth-Camera-QA.bat');
    if (fs.existsSync(batSrc)) {
      try {
        fs.copyFileSync(batSrc, batDst);
        console.log(`  ✅ MingleBooth-Camera-QA.bat copied to package: ${batDst}`);
      } catch (e) {
        console.warn(`  ⚠️ Could not copy bat to appOutDir: ${e.message}`);
      }
    }

    const resourcesDir = path.join(appOutDir, 'resources');
    const unpackedDriverDev = path.join(resourcesDir, 'app.asar.unpacked', 'driver-dev');
    if (fs.existsSync(unpackedDriverDev)) {
      console.log(`  ✅ app.asar.unpacked/driver-dev found: ${unpackedDriverDev}`);
      const expectedScripts = [
        'enable-test-mode.ps1',
        'restore-normal-mode.ps1',
        'install-camera-driver.ps1',
        'rollback-camera-driver.ps1',
        'setup-qa-signing.ps1',
        'preflight-check.ps1',
        'MingleBoothCamera.inf',
      ];
      for (const s of expectedScripts) {
        if (fs.existsSync(path.join(unpackedDriverDev, s))) {
          console.log(`  ✅ ${s} verified in app.asar.unpacked/driver-dev`);
        } else {
          errors.push(`${s} missing from app.asar.unpacked/driver-dev`);
        }
      }
    } else {
      errors.push(`driver-dev not found in app.asar.unpacked: ${unpackedDriverDev}`);
    }

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
      const requiredDlls = [
        'libusb-1.0.dll',
        'libltdl-7.dll',
        'libpopt-0.dll',
        'libreadline8.dll',
        'libtermcap-0.dll',
        'libsystre-0.dll',
        'libtre-5.dll',
        'libjpeg-8.dll',
        'libxml2-16.dll',
      ];
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

      // 5. Check Windows Sony Camera Remote SDK native runner
      const winSonyDir = path.join(resourcesDir, 'app.asar.unpacked', 'electron', 'native', 'windows');
      const winSonyExe = path.join(winSonyDir, 'sony_camera_runner.exe');
      const winSonyExeAlt = path.join(winSonyDir, 'sony_camera_runner_win.exe');
      const winCrCore = path.join(winSonyDir, 'Cr_Core.dll');
      const winCrAdapter = path.join(winSonyDir, 'CrAdapter');

      if (fs.existsSync(winSonyExe) || fs.existsSync(winSonyExeAlt)) {
        const exePath = fs.existsSync(winSonyExe) ? winSonyExe : winSonyExeAlt;
        const stat = fs.statSync(exePath);
        console.log(`  ✅ Sony native runner bundled: ${path.basename(exePath)} (${(stat.size / 1024).toFixed(0)} KB)`);
        if (fs.existsSync(winCrCore)) {
          console.log('  ✅ Cr_Core.dll bundled adjacent to Sony runner');
        } else {
          errors.push('Cr_Core.dll missing adjacent to sony_camera_runner.exe in app.asar.unpacked/electron/native/windows');
        }
        if (fs.existsSync(winCrAdapter)) {
          console.log('  ✅ CrAdapter directory bundled adjacent to Sony runner');
        } else {
          errors.push('CrAdapter directory missing adjacent to sony_camera_runner.exe in app.asar.unpacked/electron/native/windows');
        }
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

    // Official Sony Camera Remote SDK native runner for macOS
    const macRunnerBinary = path.join(unpackedBin, 'mac', 'sony_camera_runner');
    if (fs.existsSync(macRunnerBinary)) {
      const stat = fs.statSync(macRunnerBinary);
      if (!stat.isFile()) {
        errors.push(`sony_camera_runner at ${macRunnerBinary} is not a regular file.`);
      } else {
        console.log(`  ✅ sony_camera_runner bundled (${(stat.size / 1024).toFixed(0)} KB)`);
        try {
          fs.chmodSync(macRunnerBinary, 0o755);
          const postStat = fs.statSync(macRunnerBinary);
          const mode = (postStat.mode & 0o777).toString(8);
          console.log(`  ✅ sony_camera_runner permissions verified: 0${mode}`);
        } catch (e) {
          warnings.push(`Could not chmod sony_camera_runner: ${e.message}`);
        }
      }
    } else {
      errors.push(`sony_camera_runner not found at ${macRunnerBinary} — macOS Sony SDK runner missing from bundle.`);
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
