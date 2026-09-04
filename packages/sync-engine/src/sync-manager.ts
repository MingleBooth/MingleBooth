import {
  SyncQueueItem,
  SyncQueueStats,
  UniversalEventEmitter,
} from '@minglebooth/shared';

export type UploadHandler = (
  item: SyncQueueItem,
  onProgress: (percent: number) => void
) => Promise<{ cloudUrl: string }>;

export class SyncManager extends UniversalEventEmitter {
  private queue: Map<string, SyncQueueItem> = new Map();
  private isOnline: boolean = true;
  private isProcessing: boolean = false;
  private uploadHandler?: UploadHandler;
  private retryTimer: any = null;

  constructor(uploadHandler?: UploadHandler) {
    super();
    this.uploadHandler = uploadHandler;
  }

  public setUploadHandler(handler: UploadHandler) {
    this.uploadHandler = handler;
  }

  public setOnlineStatus(online: boolean) {
    const prev = this.isOnline;
    this.isOnline = online;
    this.emit('networkChange', { isOnline: online });

    if (!prev && online) {
      // Transition from offline to online: immediately process queue
      this.processQueue();
    }
  }

  public enqueue(
    item: Omit<SyncQueueItem, 'status' | 'retryCount' | 'maxRetries' | 'progressPercent' | 'createdAt' | 'updatedAt'> & {
      maxRetries?: number;
    }
  ): SyncQueueItem {
    const queueItem: SyncQueueItem = {
      ...item,
      status: 'pending',
      retryCount: 0,
      maxRetries: item.maxRetries ?? 5,
      progressPercent: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.queue.set(queueItem.id, queueItem);
    this.emit('itemEnqueued', queueItem);
    this.emitStats();

    // Trigger processing if online
    if (this.isOnline) {
      this.processQueue();
    }

    return queueItem;
  }

  public async processQueue(): Promise<void> {
    if (this.isProcessing || !this.isOnline) return;
    this.isProcessing = true;
    this.emitStats();

    const pendingItems = Array.from(this.queue.values()).filter(
      (item) => item.status === 'pending' || (item.status === 'failed' && item.retryCount < item.maxRetries)
    );

    for (const item of pendingItems) {
      if (!this.isOnline) break;

      try {
        item.status = 'uploading';
        item.updatedAt = new Date().toISOString();
        this.emit('itemStatusChange', item);
        this.emitStats();

        if (this.uploadHandler) {
          const result = await this.uploadHandler(item, (percent) => {
            item.progressPercent = percent;
            this.emit('itemProgress', { id: item.id, percent });
          });

          item.status = 'synced';
          item.progressPercent = 100;
          item.syncedAt = new Date().toISOString();
          item.updatedAt = new Date().toISOString();
          this.emit('itemSynced', { item, cloudUrl: result.cloudUrl });
        } else {
          // Mock upload in development
          await new Promise((resolve) => setTimeout(resolve, 800));
          item.status = 'synced';
          item.progressPercent = 100;
          item.syncedAt = new Date().toISOString();
          item.updatedAt = new Date().toISOString();
          this.emit('itemSynced', { item, cloudUrl: `https://gallery.mock/p/${item.entityId}` });
        }
      } catch (err: any) {
        item.status = 'failed';
        item.retryCount++;
        item.lastError = err?.message || 'Upload error';
        item.updatedAt = new Date().toISOString();

        const backoffMs = Math.min(1000 * Math.pow(2, item.retryCount), 30000);
        item.nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

        this.emit('itemFailed', { item, error: item.lastError });
      }

      this.emitStats();
    }

    this.isProcessing = false;
    this.emitStats();
  }

  public getStats(): SyncQueueStats {
    const items = Array.from(this.queue.values());
    return {
      totalPending: items.filter((i) => i.status === 'pending').length,
      totalUploading: items.filter((i) => i.status === 'uploading').length,
      totalSynced: items.filter((i) => i.status === 'synced').length,
      totalFailed: items.filter((i) => i.status === 'failed').length,
      isOnline: this.isOnline,
      isSyncing: this.isProcessing,
      lastSyncTime: new Date().toISOString(),
    };
  }

  public getAllItems(): SyncQueueItem[] {
    return Array.from(this.queue.values());
  }

  /** Alias: resume syncing (go online) */
  public resume(): void {
    this.setOnlineStatus(true);
  }

  /** Alias: pause syncing (go offline) */
  public pause(): void {
    this.setOnlineStatus(false);
  }

  /** Alias: process next pending item in queue */
  public async processNext(): Promise<void> {
    return this.processQueue();
  }

  private emitStats() {
    this.emit('statsChange', this.getStats());
  }
}
