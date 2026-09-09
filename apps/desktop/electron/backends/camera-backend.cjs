/**
 * backends/camera-backend.cjs
 * Universal Camera Architecture - Camera Backend Abstraction
 *
 * Defines the unified interface required for all camera driver/communication engines:
 *   - GPhoto2Backend (current active implementation)
 *   - CanonEdsdkBackend (future)
 *   - NikonSdkBackend (future)
 *   - SonyCrSdkBackend (future)
 */

class CameraBackend {
  constructor(name, options = {}) {
    if (new.target === CameraBackend) {
      throw new TypeError('Cannot construct CameraBackend instances directly; use a concrete backend subclass.');
    }
    this.name = name;
    this.options = options;
  }

  /**
   * Detect cameras visible to this backend
   * @param {Object} profile - Optional CameraProfile to filter/match
   * @returns {Promise<Array>} List of detected camera devices
   */
  async detect(profile = null) {
    throw new Error(`[${this.name}] detect() must be implemented by subclass.`);
  }

  /**
   * Establish communication session with camera
   * @param {Object} profile - CameraProfile
   * @returns {Promise<Object>} Session info
   */
  async connect(profile) {
    throw new Error(`[${this.name}] connect() must be implemented by subclass.`);
  }

  /**
   * Disconnect active camera session
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error(`[${this.name}] disconnect() must be implemented by subclass.`);
  }

  /**
   * Query status / battery level
   * @param {Object} profile - CameraProfile
   * @returns {Promise<Object>} Status details
   */
  async getStatus(profile) {
    throw new Error(`[${this.name}] getStatus() must be implemented by subclass.`);
  }

  /**
   * Get supported capabilities for profile
   * @param {Object} profile - CameraProfile
   * @returns {Object} Capabilities
   */
  getCapabilities(profile) {
    return profile?.capabilities || {
      capture: false,
      download: false,
      liveView: false,
      batteryStatus: false,
    };
  }

  /**
   * Trigger capture and download image
   * @param {Object} profile - CameraProfile
   * @param {string} destinationPath - Absolute filepath for downloaded image
   * @param {Object} options - Capture options (timeout, etc.)
   * @returns {Promise<Object>} Capture result
   */
  async capture(profile, destinationPath, options = {}) {
    throw new Error(`[${this.name}] capture() must be implemented by subclass.`);
  }

  /**
   * Start live view stream (future capability)
   * @param {Object} profile - CameraProfile
   * @returns {Promise<EventEmitter|ReadableStream>}
   */
  async startLiveView(profile) {
    throw new Error(`[${this.name}] liveView is not supported on this backend.`);
  }

  /**
   * Stop live view stream
   * @returns {Promise<void>}
   */
  async stopLiveView() {
    // Default no-op
  }
}

module.exports = {
  CameraBackend,
};
