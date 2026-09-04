export type SyncQueueStatus = 'pending' | 'uploading' | 'synced' | 'failed' | 'cancelled';

export type SyncItemType = 'photo' | 'gif' | 'event_analytics' | 'log';

export interface SyncQueueItem {
  id: string; // queue item uuid
  organizationId: string;
  eventId: string;
  entityId: string; // photoId or gifId
  type: SyncItemType;
  filePath: string;
  cloudStorageBucket: string;
  cloudStoragePath: string;
  status: SyncQueueStatus;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  progressPercent: number; // 0 - 100
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  nextRetryAt?: string;
}

export interface SyncQueueStats {
  totalPending: number;
  totalUploading: number;
  totalSynced: number;
  totalFailed: number;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime?: string;
}
