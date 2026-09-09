/**
 * camera-profiles/index.cjs
 * Universal Camera Architecture - Central Profile Registry & Identification Engine
 *
 * Implements the brand-agnostic detection pipeline:
 *   Hardware Detection -> Manufacturer ID -> Model Lookup -> Driver Strategy -> Backend Strategy
 *
 * Scoped Support:
 *   - Sole physically verified model: Sony ILCE-7CM2 (α7C II)
 *   - Canon, Nikon, Fujifilm, and other Sony models are recognized but strictly NOT_YET_VERIFIED.
 *   - Unknown/unverified models will NEVER have their drivers modified.
 */

const { DRIVER_STRATEGY, VERIFICATION_STATUS, KNOWN_BRANDS } = require('./types.cjs');
const sonyRegistry = require('./sony/index.cjs');
const canonRegistry = require('./canon/index.cjs');
const nikonRegistry = require('./nikon/index.cjs');
const fujifilmRegistry = require('./fujifilm/index.cjs');

// All physically verified and approved camera profiles
const VERIFIED_PROFILES = [
  ...sonyRegistry.models.filter((m) => m.status === VERIFICATION_STATUS.SUPPORTED),
  ...canonRegistry.models.filter((m) => m.status === VERIFICATION_STATUS.SUPPORTED),
  ...nikonRegistry.models.filter((m) => m.status === VERIFICATION_STATUS.SUPPORTED),
  ...fujifilmRegistry.models.filter((m) => m.status === VERIFICATION_STATUS.SUPPORTED),
];

// Helper to normalize hex VID/PID
function normalizeHex(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    return val.toString(16).toUpperCase().padStart(4, '0');
  }
  return String(val).replace(/^0x/i, '').trim().toUpperCase().padStart(4, '0');
}

/**
 * Identify a connected camera by VID, PID, and optional friendly name.
 * Returns a complete profile with brand, model, verification status, and driver strategy.
 */
function identifyCamera(vid, pid, friendlyName = '') {
  const vidHex = normalizeHex(vid);
  const pidHex = normalizeHex(pid);
  const nameUpper = String(friendlyName || '').toUpperCase();

  // 1. Direct match against physically verified profiles
  for (const profile of VERIFIED_PROFILES) {
    if (profile.vendorIdHex === vidHex && profile.supportedPidsHex.includes(pidHex)) {
      return profile;
    }
  }

  // 2. Identify Brand from VID or Friendly Name
  let brandName = 'Unknown';
  let matchedBrandRegistry = null;

  if (vidHex === KNOWN_BRANDS.SONY.vidHex || nameUpper.includes('SONY') || nameUpper.includes('ILCE')) {
    brandName = KNOWN_BRANDS.SONY.name;
    matchedBrandRegistry = sonyRegistry;
  } else if (vidHex === KNOWN_BRANDS.CANON.vidHex || nameUpper.includes('CANON') || nameUpper.includes('EOS')) {
    brandName = KNOWN_BRANDS.CANON.name;
    matchedBrandRegistry = canonRegistry;
  } else if (vidHex === KNOWN_BRANDS.NIKON.vidHex || nameUpper.includes('NIKON')) {
    brandName = KNOWN_BRANDS.NIKON.name;
    matchedBrandRegistry = nikonRegistry;
  } else if (vidHex === KNOWN_BRANDS.FUJIFILM.vidHex || nameUpper.includes('FUJIFILM') || nameUpper.includes('FUJI')) {
    brandName = KNOWN_BRANDS.FUJIFILM.name;
    matchedBrandRegistry = fujifilmRegistry;
  }

  // 3. Known brand, but model not yet physically verified
  if (matchedBrandRegistry) {
    return matchedBrandRegistry.createUnverifiedProfile(pidHex, friendlyName);
  }

  // 4. Completely unrecognized device
  return {
    id: `unknown-${vidHex || '0000'}-${pidHex || '0000'}`,
    brand: 'Unknown',
    vendorIdHex: vidHex || '0000',
    vendorIdDec: vidHex ? parseInt(vidHex, 16) : 0,
    model: friendlyName || 'Unknown Device',
    displayName: friendlyName || 'Unknown Camera',
    status: VERIFICATION_STATUS.UNSUPPORTED,
    driverStrategy: DRIVER_STRATEGY.UNSUPPORTED,
    vendorMessage: 'Model kamera ini belum didukung MingleBooth.',
    capabilities: {
      capture: false,
      download: false,
      liveView: false,
      batteryStatus: false,
    },
  };
}

/**
 * Find supported profile by VID and PID (hex strings or numbers)
 */
function findSupportedCamera(vid, pid) {
  const profile = identifyCamera(vid, pid);
  return profile.status === VERIFICATION_STATUS.SUPPORTED ? profile : null;
}

/**
 * Check if a camera device matches the supported matrix
 */
function isCameraSupported(vid, pid) {
  return findSupportedCamera(vid, pid) !== null;
}

/**
 * Get all verified profiles
 */
function getVerifiedProfiles() {
  return [...VERIFIED_PROFILES];
}

module.exports = {
  DRIVER_STRATEGY,
  VERIFICATION_STATUS,
  KNOWN_BRANDS,
  identifyCamera,
  findSupportedCamera,
  isCameraSupported,
  getVerifiedProfiles,
  CAMERA_SUPPORT_MATRIX: VERIFIED_PROFILES,
};
