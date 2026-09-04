export interface PhotoCaptureItem {
  id: string; // unique photo UUID
  eventId: string;
  templateId: string;
  rawFilePath: string;
  processedFilePath: string;
  thumbnailFilePath: string;
  fileSize: number;
  width: number;
  height: number;
  mimeType: string;
  qrUrl: string;
  capturedAt: string; // ISO string
  syncStatus: 'local' | 'pending' | 'uploading' | 'synced' | 'failed';
  cloudUrl?: string;
  expiresAt: string; // ISO string (30 days from capturedAt)
  metadata?: {
    cameraModel?: string;
    iso?: number;
    shutterSpeed?: string;
    aperture?: string;
    shotsInSession?: number;
  };
}

export interface GifCaptureItem {
  id: string;
  eventId: string;
  framesCount: number;
  framePaths: string[];
  processedGifPath: string;
  processedMp4Path?: string;
  fileSize: number;
  durationMs: number;
  qrUrl: string;
  capturedAt: string;
  syncStatus: 'local' | 'pending' | 'uploading' | 'synced' | 'failed';
  cloudUrl?: string;
  expiresAt: string;
}

export interface CaptureSessionState {
  sessionId: string;
  eventId: string;
  templateId: string;
  step: 'idle' | 'countdown' | 'capturing' | 'processing' | 'review' | 'printing' | 'complete';
  currentShotIndex: number;
  totalShotsRequired: number;
  capturedRawBuffers: Buffer[];
  lastCapturedPhoto?: PhotoCaptureItem;
  lastCapturedGif?: GifCaptureItem;
  countdownRemaining: number;
}
