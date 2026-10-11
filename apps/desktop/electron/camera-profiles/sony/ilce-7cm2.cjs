/**
 * camera-profiles/sony/ilce-7cm2.cjs
 * Verified Profile: Sony ILCE-7CM2 (Sony α7C II)
 *
 * Current Status: SUPPORTED (Physical QA Target)
 * Scoped Hardware ID: USB\VID_054C&PID_0E8C (PC Remote Mode)
 */

const { DRIVER_STRATEGY, VERIFICATION_STATUS } = require('../types.cjs');

module.exports = {
  id: 'sony-ilce-7cm2',
  brand: 'Sony',
  vendorIdHex: '054C',
  vendorIdDec: 1356,
  model: 'ILCE-7CM2',
  displayName: 'Sony α7C II',
  status: VERIFICATION_STATUS.SUPPORTED,
  recommendedMode: 'PC Remote',
  
  // Physical USB PID in PC Remote mode
  primaryPidHex: '0E8C',
  primaryPidDec: 3724,
  supportedPidsHex: ['0E8C'],

  // Per-camera driver strategy: uses official Sony Remote Camera Driver (libusbK) on Windows
  driverStrategy: DRIVER_STRATEGY.NATIVE_WINDOWS,

  // Camera backend execution details: official verified Sony Camera Remote SDK 2.02.00 ('sony-sdk')
  backendType: 'sony-sdk',
  backendOptions: {
    // Dynamic mapping flag passed to bundled gphoto2 engine if fallback ever invoked
    usbidArgs: ['--usbid', '0x054c:0x0e8c=0x054c:0x0d56'],
  },

  // Windows PnP Driver Configuration
  windowsDriver: {
    bindingLevel: 'Device-Level',
    hardwareId: 'USB\\VID_054C&PID_0E8C',
    deviceInterfaceGuid: '{CDBBD918-C988-447F-9C80-4F02E38A8DB3}',
    infName: 'MingleBoothCamera.inf',
    expectedService: 'WinUSB',
    expectedClass: 'USBDevice',
  },

  // Functional capabilities
  capabilities: {
    capture: true,
    download: true,
    liveView: true,
    batteryStatus: true,
  },
};
