/**
 * backends/index.cjs
 * Universal Camera Architecture - Backend Factory
 *
 * Resolves the appropriate CameraBackend instance for a given camera profile.
 */

const { CameraBackend } = require('./camera-backend.cjs');
const { GPhoto2Backend } = require('./gphoto2-backend.cjs');

let gphoto2BackendInstance = null;

function getBackendForProfile(profile, options = {}) {
  const backendType = profile?.backendType || 'gphoto2';

  switch (backendType) {
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
  getBackendForProfile,
};
