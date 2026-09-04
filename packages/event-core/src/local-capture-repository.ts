import {
  PhotoCaptureItem,
  SyncQueueItem,
  SyncQueueStatus,
} from '@minglebooth/shared';

export interface ILocalCaptureRepository {
  insertCapture(item: PhotoCaptureItem): Promise<void>;
  getCapturesByEvent(eventId: string): Promise<PhotoCaptureItem[]>;
  getCaptureById(photoId: string): Promise<PhotoCaptureItem | null>;
  enqueueSync(item: SyncQueueItem): Promise<void>;
  getPendingSyncQueue(): Promise<SyncQueueItem[]>;
  updateSyncStatus(
    queueId: string,
    status: SyncQueueStatus,
    cloudUrl?: string,
    error?: string
  ): Promise<void>;
  getEventCaptureCount(eventId: string): Promise<number>;
}

export class LocalCaptureRepository implements ILocalCaptureRepository {
  private captures: Map<string, PhotoCaptureItem> = new Map();
  private syncQueue: Map<string, SyncQueueItem> = new Map();

  async insertCapture(item: PhotoCaptureItem): Promise<void> {
    this.captures.set(item.id, { ...item });
  }

  async getCapturesByEvent(eventId: string): Promise<PhotoCaptureItem[]> {
    return Array.from(this.captures.values()).filter((c) => c.eventId === eventId);
  }

  async getCaptureById(photoId: string): Promise<PhotoCaptureItem | null> {
    return this.captures.get(photoId) || null;
  }

  async enqueueSync(item: SyncQueueItem): Promise<void> {
    this.syncQueue.set(item.id, { ...item });
  }

  async getPendingSyncQueue(): Promise<SyncQueueItem[]> {
    return Array.from(this.syncQueue.values()).filter(
      (item) => item.status === 'pending' || item.status === 'failed'
    );
  }

  async updateSyncStatus(
    queueId: string,
    status: SyncQueueStatus,
    cloudUrl?: string,
    error?: string
  ): Promise<void> {
    const item = this.syncQueue.get(queueId);
    if (item) {
      item.status = status;
      item.updatedAt = new Date().toISOString();
      if (cloudUrl) {
        item.syncedAt = new Date().toISOString();
        const capture = this.captures.get(item.entityId);
        if (capture) {
          capture.syncStatus = 'synced';
          capture.cloudUrl = cloudUrl;
        }
      }
      if (error) {
        item.lastError = error;
        item.retryCount++;
      }
    }
  }

  async getEventCaptureCount(eventId: string): Promise<number> {
    return (await this.getCapturesByEvent(eventId)).length;
  }
}
