/**
 * backends/index.cjs
 * Universal Camera Architecture - Backend Factory
 *
 * Resolves the appropriate CameraBackend instance for a given camera profile.
 */

const { CameraBackend } = require('./camera-backend.cjs');
const { GPhoto2Backend } = require('./gphoto2-backend.cjs');
const { SonyCameraBackend } = require('./sony-camera-backend.cjs');

let gphoto2BackendInstance = null;
let sonyBackendInstance = null;

function getBackendForProfile(profile, options = {}) {
  const backendType = profile?.backendType || 'gphoto2';

  switch (backendType) {
    case 'sony-sdk':
      if (!sonyBackendInstance) {
        sonyBackendInstance = new SonyCameraBackend(options);
      }
      return sonyBackendInstance;
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
  getBackendForProfile,
};
