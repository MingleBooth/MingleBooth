/**
 * camera-profiles/types.cjs
 * Universal Camera Architecture - Types and Constants
 *
 * Defines the core contract for multi-brand camera support:
 *   - Driver Strategies: WINUSB_REQUIRED | NATIVE_WINDOWS | FUTURE_BACKEND | UNSUPPORTED
 *   - Verification Status: SUPPORTED | NOT_YET_VERIFIED | UNSUPPORTED
 *   - Known Manufacturer VIDs: Sony, Canon, Nikon, Fujifilm, Panasonic, Olympus
 */

const DRIVER_STRATEGY = Object.freeze({
  WINUSB_REQUIRED: 'WINUSB_REQUIRED', // Requires scoped WinUSB binding on Windows
  NATIVE_WINDOWS: 'NATIVE_WINDOWS',   // Functions with Windows inbox driver (WPD/MTP or standard USB)
  FUTURE_BACKEND: 'FUTURE_BACKEND',   // Requires vendor SDK / custom backend (e.g. Canon EDSDK)
  UNSUPPORTED: 'UNSUPPORTED',         // Device is not eligible for driver or backend interaction
});

const VERIFICATION_STATUS = Object.freeze({
  VERIFIED: 'VERIFIED',                       // Physically verified and approved for production/QA
  COMPATIBLE_UNTESTED: 'COMPATIBLE_UNTESTED', // Technically supported by protocol/specs, awaiting physical verification
  PARTIAL: 'PARTIAL',                         // Only a subset of capabilities are supported
  UNSUPPORTED: 'UNSUPPORTED',                 // Explicitly incompatible or rejected device
  UNKNOWN: 'UNKNOWN',                         // Unrecognized device or insufficient info
  // Backward-compatibility aliases
  SUPPORTED: 'VERIFIED',
  NOT_YET_VERIFIED: 'COMPATIBLE_UNTESTED',
});

const KNOWN_BRANDS = Object.freeze({
  SONY: {
    name: 'Sony',
    vidHex: '054C',
    vidDec: 1356,
  },
  CANON: {
    name: 'Canon',
    vidHex: '04A9',
    vidDec: 1193,
  },
  NIKON: {
    name: 'Nikon',
    vidHex: '04B0',
    vidDec: 1200,
  },
  FUJIFILM: {
    name: 'Fujifilm',
    vidHex: '04CB',
    vidDec: 1227,
  },
  PANASONIC: {
    name: 'Panasonic',
    vidHex: '04DA',
    vidDec: 1242,
  },
  OLYMPUS: {
    name: 'OM Digital / Olympus',
    vidHex: '07B4',
    vidDec: 1972,
  },
});

module.exports = {
  DRIVER_STRATEGY,
  VERIFICATION_STATUS,
  KNOWN_BRANDS,
};
