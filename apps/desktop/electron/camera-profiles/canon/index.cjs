/**
 * camera-profiles/canon/index.cjs
 * Canon Camera Brand Registry
 *
 * Architecture-ready slot for Canon camera profiles.
 * IMPORTANT: No model profiles are marked SUPPORTED until physical USB identity
 * and capture behavior are verified on hardware.
 */

const { KNOWN_BRANDS, VERIFICATION_STATUS, DRIVER_STRATEGY } = require('../types.cjs');

// Verified concrete models (empty until physically tested)
const MODELS = [];

function findModel(pidHex) {
  const norm = String(pidHex || '').toUpperCase().padStart(4, '0');
  return MODELS.find((m) => m.supportedPidsHex.includes(norm)) || null;
}

function createUnverifiedProfile(pidHex, friendlyName) {
  return {
    id: `canon-unverified-${pidHex || 'unknown'}`,
    brand: KNOWN_BRANDS.CANON.name,
    vendorIdHex: KNOWN_BRANDS.CANON.vidHex,
    vendorIdDec: KNOWN_BRANDS.CANON.vidDec,
    model: friendlyName || 'Canon Camera',
    displayName: friendlyName || 'Canon Camera',
    status: VERIFICATION_STATUS.NOT_YET_VERIFIED,
    driverStrategy: DRIVER_STRATEGY.UNSUPPORTED,
    vendorMessage: 'Model kamera Canon ini belum didukung MingleBooth.',
    capabilities: {
      capture: false,
      download: false,
      liveView: false,
      batteryStatus: false,
    },
  };
}

module.exports = {
  brand: KNOWN_BRANDS.CANON,
  models: MODELS,
  findModel,
  createUnverifiedProfile,
};
