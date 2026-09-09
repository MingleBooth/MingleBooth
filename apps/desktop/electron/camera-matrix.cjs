/**
 * camera-matrix.cjs
 * Backward-Compatibility Layer for Universal Camera Profile Architecture
 *
 * Forwards to the brand-agnostic registry in ./camera-profiles/index.cjs
 */

const {
  DRIVER_STRATEGY,
  VERIFICATION_STATUS,
  KNOWN_BRANDS,
  identifyCamera,
  findSupportedCamera,
  isCameraSupported,
  getVerifiedProfiles,
  CAMERA_SUPPORT_MATRIX,
} = require('./camera-profiles/index.cjs');

module.exports = {
  DRIVER_STRATEGY,
  VERIFICATION_STATUS,
  KNOWN_BRANDS,
  identifyCamera,
  findSupportedCamera,
  isCameraSupported,
  getVerifiedProfiles,
  CAMERA_SUPPORT_MATRIX,
};
