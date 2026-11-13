/**
 * cameraNotifications.ts
 * Universal Camera Compatibility & Status Notification Engine
 *
 * Implements standard, customer-friendly notifications for all camera brands (Sony, Canon, Nikon, etc.).
 * Guarantees zero raw technical errors are surfaced to users while preserving diagnostic logs.
 */

export type CameraNotificationType = 'info' | 'success' | 'warning' | 'error';

export type CameraNotificationState =
  | 'CAMERA_READY'
  | 'CAMERA_PARTIAL_SUPPORT'
  | 'CAMERA_UNSUPPORTED'
  | 'CAMERA_NOT_DETECTED'
  | 'CONNECTION_LOST'
  | 'CONNECTION_FAILED';

export interface CameraNotificationInfo {
  title: string;
  message: string;
  type: CameraNotificationType;
  duration?: number;
}

export interface CameraNotificationOptions {
  model?: string;
  brand?: string;
  unavailableFeatures?: string[];
  diagnosticError?: string;
  customRecoveryHint?: string;
}

/**
 * Format universal notification based on camera state and optional hardware details.
 */
export function getCameraNotification(
  state: CameraNotificationState,
  options: CameraNotificationOptions = {}
): CameraNotificationInfo {
  const { model, brand, unavailableFeatures = [], diagnosticError, customRecoveryHint } = options;

  // Log detailed technical diagnostic for developers/troubleshooting
  if (diagnosticError) {
    console.warn(`[CameraDiagnostic] State: ${state} | Device: ${brand || ''} ${model || 'Unknown'} | Error:`, diagnosticError);
  }

  const cameraLabel = model || (brand ? `Kamera ${brand}` : 'Kamera');

  switch (state) {
    case 'CAMERA_READY':
      return {
        title: 'Camera Ready',
        message: model
          ? `${model} terhubung dan siap digunakan untuk sesi photobooth.`
          : 'Your camera is connected and ready to use.',
        type: 'success',
        duration: 4000,
      };

    case 'CAMERA_PARTIAL_SUPPORT': {
      const featureList = unavailableFeatures.length > 0
        ? unavailableFeatures.join(', ')
        : 'Live View preview';
      return {
        title: 'Some Features Are Unavailable',
        message: `${cameraLabel} terhubung, namun beberapa fitur tidak didukung oleh model ini: ${featureList}. Anda tetap dapat memotret dengan remote shutter.`,
        type: 'warning',
        duration: 6500,
      };
    }

    case 'CAMERA_UNSUPPORTED':
      return {
        title: 'Camera Not Supported',
        message: `Maaf, ${cameraLabel} saat ini belum didukung oleh MingleBooth. Kami terus bekerja untuk memperluas dukungan model kamera lainnya.`,
        type: 'error',
        duration: 7000,
      };

    case 'CAMERA_NOT_DETECTED':
      return {
        title: 'Camera Not Detected',
        message: customRecoveryHint || "We couldn't detect your camera. Please check the USB cable and make sure your camera is turned on.",
        type: 'warning',
        duration: 5000,
      };

    case 'CONNECTION_LOST':
      return {
        title: 'Camera Disconnected',
        message: `Koneksi ke ${cameraLabel} terputus. Silakan periksa kembali kabel USB untuk melanjutkan.`,
        type: 'warning',
        duration: 5500,
      };

    case 'CONNECTION_FAILED':
    default:
      return {
        title: 'Unable to Connect Camera',
        message: customRecoveryHint || `Gagal membuat koneksi dengan ${cameraLabel}. Pastikan kamera menyala, tidak dalam mode Wi-Fi, dan coba hubungkan kembali.`,
        type: 'error',
        duration: 6000,
      };
  }
}

