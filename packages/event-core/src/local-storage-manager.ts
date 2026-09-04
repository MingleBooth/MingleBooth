export interface EventDirectoryPaths {
  eventRoot: string;
  rawDir: string;
  processedDir: string;
  thumbnailsDir: string;
  gifsDir: string;
  templatesDir: string;
  databasePath: string;
}

export interface SaveCaptureInput {
  eventId: string;
  photoId: string;
  rawPhotos: (string | Uint8Array)[];
  compositeDataUrlOrBuffer: string | Uint8Array;
  mimeType?: string;
}

export interface SaveCaptureResult {
  photoId: string;
  eventId: string;
  rawFilePaths: string[];
  processedFilePath: string;
  thumbnailFilePath?: string;
  fileSizeBytes: number;
  savedAt: string;
}

export class LocalStorageManager {
  private baseDataDir: string;

  constructor(baseDataDir?: string) {
    this.baseDataDir = baseDataDir || './data';
  }

  public getBaseDataDir(): string {
    return this.baseDataDir;
  }

  public setBaseDataDir(baseDataDir: string): void {
    this.baseDataDir = baseDataDir || './data';
  }

  /**
   * Generates deterministic path structure for an event
   */
  public getEventDirectories(eventId: string): EventDirectoryPaths {
    const isDefault = !this.baseDataDir || this.baseDataDir === './data' || this.baseDataDir === 'data';
    const eventRoot = isDefault ? `${this.baseDataDir || './data'}/events/${eventId}` : this.baseDataDir;
    return {
      eventRoot,
      rawDir: `${eventRoot}/raw`,
      processedDir: `${eventRoot}/processed`,
      thumbnailsDir: `${eventRoot}/thumbnails`,
      gifsDir: `${eventRoot}/gifs`,
      templatesDir: `${eventRoot}/templates`,
      databasePath: `${eventRoot}/database.sqlite`,
    };
  }

  /**
   * Returns metadata and relative paths for a captured photobooth session
   */
  public formatCaptureRecord(input: SaveCaptureInput): SaveCaptureResult {
    const dirs = this.getEventDirectories(input.eventId);
    const ext = input.mimeType?.includes('png') ? 'png' : 'jpg';

    const processedFilePath = `${dirs.processedDir}/${input.photoId}.${ext}`;
    const rawFilePaths = input.rawPhotos.map(
      (_, idx) => `${dirs.rawDir}/${input.photoId}_raw_${idx + 1}.${ext}`
    );

    // Approximate size calculation
    let size = 0;
    if (typeof input.compositeDataUrlOrBuffer === 'string') {
      size = Math.round((input.compositeDataUrlOrBuffer.length * 3) / 4);
    } else {
      size = input.compositeDataUrlOrBuffer.byteLength;
    }

    return {
      photoId: input.photoId,
      eventId: input.eventId,
      rawFilePaths,
      processedFilePath,
      thumbnailFilePath: `${dirs.thumbnailsDir}/${input.photoId}_thumb.jpg`,
      fileSizeBytes: size || 1024 * 350,
      savedAt: new Date().toISOString(),
    };
  }
}
