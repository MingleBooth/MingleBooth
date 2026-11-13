/**
 * backends/index.cjs
 * Universal Camera Architecture - Backend Factory
 *
 * Resolves the appropriate CameraBackend instance for a given camera profile.
 */

const { CameraBackend } = require('./camera-backend.cjs');
const { GPhoto2Backend } = require('./gphoto2-backend.cjs');
const { SonyCameraBackend } = require('./sony-camera-backend.cjs');
const { CanonCameraBackend } = require('./canon-camera-backend.cjs');

let gphoto2BackendInstance = null;
let sonyBackendInstance = null;
let canonBackendInstance = null;

function getBackendForProfile(profile, options = {}) {
  const backendType = profile?.backendType || (profile?.brand === 'Canon' ? 'canon-ptp' : 'gphoto2');

  switch (backendType) {
    case 'sony-sdk':
      if (!sonyBackendInstance) {
        sonyBackendInstance = new SonyCameraBackend(options);
      }
      return sonyBackendInstance;
    case 'canon-ptp':
    case 'canon':
      if (!canonBackendInstance) {
        canonBackendInstance = new CanonCameraBackend(options);
      }
      return canonBackendInstance;
    case 'gphoto2':
    default:
      if (!gphoto2BackendInstance) {
        gphoto2BackendInstance = new GPhoto2Backend(options);
      }
      return gphoto2BackendInstance;
  }
}

module.exports = {
  CameraBackend,
  GPhoto2Backend,
  SonyCameraBackend,
  CanonCameraBackend,
  getBackendForProfile,
};
