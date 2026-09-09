/**
 * camera-matrix.cjs
 * MingleBooth Camera Capability & Support Matrix
 *
 * Explicitly defines supported cameras and their USB driver requirements.
 * Prototype scope is strictly restricted to Sony ILCE-7CM2 (α7C II).
 */

const CAMERA_SUPPORT_MATRIX = [
  {
    id: 'sony-ilce-7cm2',
    vendor: 'Sony',
    vendorIdHex: '054C',
    vendorIdDec: 1356,
    model: 'ILCE-7CM2',
    displayName: 'Sony α7C II',
    // In PC Remote mode over USB-C, physical PID is 0E8C
    primaryPidHex: '0E8C',
    primaryPidDec: 3724,
    supportedPidsHex: ['0E8C'],
    // gphoto2 ptp2 translation mapping (maps physical 0E8C to Sony Alpha PTP profile 0D56)
    usbidArgs: ['--usbid', '0x054c:0x0e8c=0x054c:0x0d56'],
    expectedUsbClass: 0x06,       // Still Imaging
    expectedUsbSubClass: 0x01,    // Capture
    expectedUsbProtocol: 0x01,    // PTP
    bindingLevel: 'Device-Level', // Single interface device
    hardwareId: 'USB\\VID_054C&PID_0E8C',
    deviceInterfaceGuid: '{CDBBD918-C988-447F-9C80-4F02E38A8DB3}',
    recommendedMode: 'PC Remote',
    driverRequirement: 'WINUSB',
  },
];

/**
 * Find supported profile by VID and PID (hex strings or numbers)
 */
function findSupportedCamera(vid, pid) {
  if (!vid || !pid) return null;
  const vidStr = (typeof vid === 'number' ? vid.toString(16) : String(vid)).replace(/^0x/i, '').toUpperCase().padStart(4, '0');
  const pidStr = (typeof pid === 'number' ? pid.toString(16) : String(pid)).replace(/^0x/i, '').toUpperCase().padStart(4, '0');

  return CAMERA_SUPPORT_MATRIX.find(
    (cam) => cam.vendorIdHex === vidStr && cam.supportedPidsHex.includes(pidStr)
  ) || null;
}

/**
 * Check if a camera device matches the supported matrix
 */
function isCameraSupported(vid, pid) {
  return findSupportedCamera(vid, pid) !== null;
}

module.exports = {
  CAMERA_SUPPORT_MATRIX,
  findSupportedCamera,
  isCameraSupported,
};
