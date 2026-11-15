/**
 * MingleBooth Mobile - Tether Client for Desktop Hub Bridge
 * 
 * Manages communication with MingleBooth Desktop Hub:
 * - GET /api/tether/status : Hardware health & Sony connection state
 * - GET /api/tether/events : Real-time SSE stream for physical shutter & camera events
 * - GET /api/tether/liveview : Live view frame stream (JPEG base64)
 * - POST /api/tether/trigger : Hardware physical shutter capture
 * - POST /api/tether/connect-camera : Re-probe / connect Sony camera
 * - POST /api/tether/disconnect-camera : Cleanly disconnect Sony camera
 */

export const STORAGE_KEY_TETHER_HOST = 'mb_tether_host_url';
export const DEFAULT_TETHER_HOST = 'http://192.168.1.102:4848';

export type TetherUnifiedStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'CAPTURING'
  | 'ERROR'
  | 'UNREACHABLE';

export interface TetherStatusResponse {
  isHostReachable: boolean;
  cameraConnected: boolean;
  cameraState: TetherUnifiedStatus;
  cameraModel: string | null;
  service?: string;
  port?: number;
  ips?: string[];
  tetherDir?: string;
  errorMessage?: string;
  httpStatus?: number;
}

export interface TetherLiveViewResponse {
  success: boolean;
  frameDataUrl: string | null;
  error?: string;
}

export interface TetherCaptureResponse {
  success: boolean;
  photoDataUrl: string | null;
  filename?: string;
  byteSize?: number;
  error?: string;
}

export interface TetherPhotoEvent {
  type: 'photo';
  success: boolean;
  source?: string;
  filename: string;
  filePath?: string;
  photoDataUrl: string;
  byteSize?: number;
  timestamp: number;
}

/**
 * Normalizes host URL:
 * - Ensures http:// prefix
 * - Strips any trailing slashes
 * - Strips accidental path additions like /api/tether
 */
export function normalizeHostUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return DEFAULT_TETHER_HOST;
  let url = rawUrl.trim();

  // Strip accidental path suffixes
  url = url.replace(/\/api\/tether.*$/i, '');
  url = url.replace(/\/+$/, '');

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }

  // If no port specified, default to 4848
  try {
    const parsed = new URL(url);
    if (!parsed.port) {
      parsed.port = '4848';
      url = parsed.origin;
    } else {
      url = parsed.origin;
    }
  } catch {
    // If URL parsing fails, return as-is
  }

  return url;
}

/**
 * Gets saved tether host URL from localStorage with fallback
 */
export function getSavedTetherHostUrl(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_TETHER_HOST;
  }
  const saved = window.localStorage.getItem(STORAGE_KEY_TETHER_HOST);
  return saved ? normalizeHostUrl(saved) : DEFAULT_TETHER_HOST;
}

/**
 * Saves tether host URL to localStorage
 */
export function saveTetherHostUrl(url: string): string {
  const normalized = normalizeHostUrl(url);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY_TETHER_HOST, normalized);
  }
  return normalized;
}

/**
 * Probes the Desktop Tether Hub status
 * GET /api/tether/status
 */
export async function probeTetherHost(
  hostUrl: string,
  timeoutMs = 2800
): Promise<TetherStatusResponse> {
  const cleanUrl = normalizeHostUrl(hostUrl);
  const endpoint = `${cleanUrl}/api/tether/status`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        isHostReachable: true,
        cameraConnected: false,
        cameraState: 'ERROR',
        cameraModel: null,
        errorMessage: `Desktop Hub mengembalikan HTTP ${res.status}`,
        httpStatus: res.status,
      };
    }

    const data = await res.json();
    const isConn = Boolean(data.cameraConnected);
    const cameraModel =
      data.camera?.model ||
      data.cameraModel ||
      (isConn ? 'Kamera Terhubung' : null);

    let state: TetherUnifiedStatus = 'DISCONNECTED';
    if (isConn) {
      state = 'CONNECTED';
    } else if (data.cameraState === 'CONNECTING' || data.cameraState === 'DETECTING') {
      state = 'CONNECTING';
    } else if (data.cameraState === 'ERROR') {
      state = 'ERROR';
    }

    return {
      isHostReachable: true,
      cameraConnected: isConn,
      cameraState: state,
      cameraModel,
      service: data.service,
      port: data.port,
      ips: data.ips,
      tetherDir: data.tetherDir,
      httpStatus: res.status,
    };
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return {
      isHostReachable: false,
      cameraConnected: false,
      cameraState: 'UNREACHABLE',
      cameraModel: null,
      errorMessage: isTimeout
        ? 'Batas waktu koneksi habis (Desktop Hub tidak merespons dalam 2.8s)'
        : `Tidak dapat menjangkau Desktop Hub pada ${cleanUrl}. Pastikan laptop dan tablet berada di jaringan Wi-Fi yang sama.`,
    };
  }
}

/**
 * Fetches a single live view frame from Desktop Tether Hub
 * GET /api/tether/liveview
 */
export async function fetchTetherLiveFrame(
  hostUrl: string,
  timeoutMs = 1500
): Promise<TetherLiveViewResponse> {
  const cleanUrl = normalizeHostUrl(hostUrl);
  const endpoint = `${cleanUrl}/api/tether/liveview`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, frameDataUrl: null, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const frame = data.frameDataUrl || data.liveFrame || null;

    return {
      success: Boolean(data.success && frame),
      frameDataUrl: frame,
      error: data.error,
    };
  } catch (err: any) {
    return {
      success: false,
      frameDataUrl: null,
      error: err.name === 'AbortError' ? 'Live view timeout' : err.message,
    };
  }
}

/**
 * Triggers physical shutter capture on Sony camera via Desktop Hub
 * POST /api/tether/trigger
 */
export async function triggerTetherCapture(
  hostUrl: string,
  timeoutMs = 14000
): Promise<TetherCaptureResponse> {
  const cleanUrl = normalizeHostUrl(hostUrl);
  const endpoint = `${cleanUrl}/api/tether/trigger`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ timeoutMs: Math.max(5000, timeoutMs - 1500) }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        photoDataUrl: null,
        error: `Shutter gagal: Desktop Hub HTTP ${res.status}`,
      };
    }

    const data = await res.json();
    if (data.success && data.photoDataUrl) {
      return {
        success: true,
        photoDataUrl: data.photoDataUrl,
        filename: data.filename,
        byteSize: data.byteSize,
      };
    }

    return {
      success: false,
      photoDataUrl: null,
      error: data.error || 'Desktop Hub tidak mengembalikan data foto',
    };
  } catch (err: any) {
    return {
      success: false,
      photoDataUrl: null,
      error:
        err.name === 'AbortError'
          ? 'Timeout: Kamera tidak merespons shutter dalam batas waktu'
          : `Gagal memicu shutter: ${err.message}`,
    };
  }
}

/**
 * Asks Desktop Hub to connect camera
 * POST /api/tether/connect-camera
 */
export async function connectTetherCamera(
  hostUrl: string,
  timeoutMs = 8000
): Promise<{ success: boolean; camera?: any; state?: string; error?: string }> {
  const cleanUrl = normalizeHostUrl(hostUrl);
  const endpoint = `${cleanUrl}/api/tether/connect-camera`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { success: false, error: `Desktop Hub HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      success: Boolean(data.success),
      camera: data.camera,
      state: data.state,
      error: data.error,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.name === 'AbortError' ? 'Koneksi ke Desktop Hub timeout' : err.message,
    };
  }
}

/**
 * Asks Desktop Hub to cleanly disconnect camera
 * POST /api/tether/disconnect-camera
 */
export async function disconnectTetherCamera(
  hostUrl: string,
  timeoutMs = 4000
): Promise<{ success: boolean; error?: string }> {
  const cleanUrl = normalizeHostUrl(hostUrl);
  const endpoint = `${cleanUrl}/api/tether/disconnect-camera`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { success: Boolean(data.success), error: data.error };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Subscribes to real-time events from Desktop Hub via Server-Sent Events (SSE)
 * Endpoint: GET /api/tether/events
 * 
 * Essential for detecting physical shutter button presses on the Sony camera body!
 */
export function subscribeTetherEvents(
  hostUrl: string,
  callbacks: {
    onPhoto?: (event: TetherPhotoEvent) => void;
    onCameraState?: (state: { cameraState: string; cameraConnected: boolean; camera?: any }) => void;
    onError?: (err: any) => void;
  }
): () => void {
  const cleanUrl = normalizeHostUrl(hostUrl);
  const sseEndpoint = `${cleanUrl}/api/tether/events`;

  let eventSource: EventSource | null = null;
  let isClosed = false;
  let reconnectTimer: any = null;

  function connect() {
    if (isClosed) return;
    try {
      eventSource = new EventSource(sseEndpoint);

      eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const data = JSON.parse(event.data);
          if ((data.type === 'photo' || data.photoDataUrl) && callbacks.onPhoto) {
            callbacks.onPhoto(data as TetherPhotoEvent);
          } else if (data.type === 'cameraState' && callbacks.onCameraState) {
            callbacks.onCameraState(data);
          }
        } catch (parseErr) {
          console.warn('[TetherClient SSE] Failed to parse event JSON:', parseErr);
        }
      };

      eventSource.onerror = (err) => {
        if (callbacks.onError) callbacks.onError(err);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (!isClosed) {
          // Attempt reconnection after 3 seconds
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    } catch (e) {
      if (callbacks.onError) callbacks.onError(e);
      if (!isClosed) {
        reconnectTimer = setTimeout(connect, 4000);
      }
    }
  }

  connect();

  // Return unsubscribe/cleanup function
  return () => {
    isClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
