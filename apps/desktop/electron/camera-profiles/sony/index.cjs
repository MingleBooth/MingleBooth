/**
 * camera-profiles/sony/index.cjs
 * Sony Camera Brand Registry
 *
 * Current physically verified model: Sony ILCE-7CM2 (α7C II)
 * Other Sony models remain NOT_YET_VERIFIED until physical QA testing.
 */

const { KNOWN_BRANDS, VERIFICATION_STATUS, DRIVER_STRATEGY } = require('../types.cjs');
const ilce7cm2 = require('./ilce-7cm2.cjs');

// Verified concrete models
const MODELS = [
  ilce7cm2,
];

function findModel(pidHex) {
  const norm = String(pidHex || '').toUpperCase().padStart(4, '0');
  return MODELS.find((m) => m.supportedPidsHex.includes(norm)) || null;
}

function createUnverifiedProfile(pidHex, friendlyName) {
  return {
    id: `sony-unverified-${pidHex || 'unknown'}`,
    brand: KNOWN_BRANDS.SONY.name,
    vendorIdHex: KNOWN_BRANDS.SONY.vidHex,
    vendorIdDec: KNOWN_BRANDS.SONY.vidDec,
    model: friendlyName || 'Sony Camera',
    displayName: friendlyName || 'Sony Camera',
    status: VERIFICATION_STATUS.NOT_YET_VERIFIED,
    driverStrategy: DRIVER_STRATEGY.UNSUPPORTED,
    vendorMessage: 'Model kamera Sony ini belum didukung MingleBooth.',
    capabilities: {
      capture: false,
      download: false,
      liveView: false,
      batteryStatus: false,
    },
  };
}

module.exports = {
  brand: KNOWN_BRANDS.SONY,
  models: MODELS,
  findModel,
  createUnverifiedProfile,
};
