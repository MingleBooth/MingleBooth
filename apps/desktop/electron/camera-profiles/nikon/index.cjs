/**
 * camera-profiles/nikon/index.cjs
 * Nikon Camera Brand Registry
 *
 * Architecture-ready slot for Nikon camera profiles.
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
    id: `nikon-unverified-${pidHex || 'unknown'}`,
    brand: KNOWN_BRANDS.NIKON.name,
    vendorIdHex: KNOWN_BRANDS.NIKON.vidHex,
    vendorIdDec: KNOWN_BRANDS.NIKON.vidDec,
    model: friendlyName || 'Nikon Camera',
    displayName: friendlyName || 'Nikon Camera',
    status: VERIFICATION_STATUS.NOT_YET_VERIFIED,
    driverStrategy: DRIVER_STRATEGY.UNSUPPORTED,
    vendorMessage: 'Model kamera Nikon ini belum didukung MingleBooth.',
    capabilities: {
      capture: false,
      download: false,
      liveView: false,
      batteryStatus: false,
    },
  };
}

module.exports = {
  brand: KNOWN_BRANDS.NIKON,
  models: MODELS,
  findModel,
  createUnverifiedProfile,
};
