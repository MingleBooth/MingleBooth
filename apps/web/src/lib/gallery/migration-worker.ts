import { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { StorageAdapter } from '../storage/types';
import { getR2Storage, getSupabaseStorage } from '../storage/storage-provider';
import { getServiceSupabase } from '../supabase';

export interface MigrationWorkerOptions {
  batchSize?: number;
  concurrency?: number;
  limit?: number;
  dryRun?: boolean;
  eventId?: string;
  checkpointPath?: string;
  client?: SupabaseClient;
  r2?: StorageAdapter;
  supabaseStorage?: StorageAdapter;
  supabaseBucket?: string;
  logger?: (msg: string, ...args: any[]) => void;
  onProgress?: (stats: MigrationStats) => void;
}

export interface MigrationStats {
  totalPendingPhotos: number;
  totalPendingGifs: number;
  processedPhotos: number;
  processedGifs: number;
  migratedAssets: {
    photos: number;
    thumbnails: number;
    gifs: number;
    raws: number;
  };
  failedAssets: {
    photos: number;
    thumbnails: number;
    gifs: number;
    raws: number;
  };
  skippedDeletedOrPending: number;
  errors: Array<{ id: string; assetType: string; error: string; timestamp: string }>;
  startTime: string;
  lastUpdated: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
}

export class GalleryMigrationWorker {
  private client: SupabaseClient;
  private r2: StorageAdapter;
  private supabaseStorage: StorageAdapter;
  private batchSize: number;
  private concurrency: number;
  private limit: number;
  private dryRun: boolean;
  private eventId?: string;
  private checkpointPath?: string;
  private logger: (msg: string, ...args: any[]) => void;
  private onProgress?: (stats: MigrationStats) => void;

  private isPaused: boolean = false;
  private stats: MigrationStats;

  constructor(options: MigrationWorkerOptions = {}) {
    this.client = options.client || getServiceSupabase();
    this.r2 = options.r2 || getR2Storage();
    this.supabaseStorage = options.supabaseStorage || getSupabaseStorage();
    this.batchSize = Math.max(1, options.batchSize || 10);
    this.concurrency = Math.max(1, Math.min(10, options.concurrency || 2));
    this.limit = options.limit || Infinity;
    this.dryRun = !!options.dryRun;
    this.eventId = options.eventId;
    this.checkpointPath = options.checkpointPath;
    this.logger = options.logger || ((msg, ...args) => console.log(`[MigrationWorker] ${msg}`, ...args));
    this.onProgress = options.onProgress;

    this.stats = {
      totalPendingPhotos: 0,
      totalPendingGifs: 0,
      processedPhotos: 0,
      processedGifs: 0,
      migratedAssets: { photos: 0, thumbnails: 0, gifs: 0, raws: 0 },
      failedAssets: { photos: 0, thumbnails: 0, gifs: 0, raws: 0 },
      skippedDeletedOrPending: 0,
      errors: [],
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      status: 'IDLE',
    };

    if (this.checkpointPath && fs.existsSync(this.checkpointPath)) {
      this.loadCheckpoint();
    }
  }

  public getStats(): MigrationStats {
    return { ...this.stats };
  }

  public pause(): void {
    this.isPaused = true;
    this.stats.status = 'PAUSED';
    this.saveCheckpoint();
    this.logger('Pause signal received. Worker will gracefully suspend after current item.');
  }

  public resume(): void {
    this.isPaused = false;
    this.stats.status = 'RUNNING';
    this.logger('Worker resumed.');
  }

  private saveCheckpoint(): void {
    if (!this.checkpointPath) return;
    try {
      this.stats.lastUpdated = new Date().toISOString();
      const dir = path.dirname(this.checkpointPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.checkpointPath, JSON.stringify(this.stats, null, 2), 'utf8');
    } catch (err: any) {
      this.logger(`Warning: failed to save checkpoint: ${err.message}`);
    }
  }

  private loadCheckpoint(): void {
    if (!this.checkpointPath || !fs.existsSync(this.checkpointPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.checkpointPath, 'utf8'));
      this.stats = {
        ...this.stats,
        ...data,
        status: 'IDLE',
      };
      this.logger(`Loaded checkpoint from ${this.checkpointPath}. Processed: ${this.stats.processedPhotos} photos, ${this.stats.processedGifs} gifs.`);
    } catch (err: any) {
      this.logger(`Warning: failed to parse checkpoint: ${err.message}`);
    }
  }

  private guessContentType(key: string, assetType: string): string {
    const lower = key.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.arw')) return 'image/x-sony-arw';
    if (lower.endsWith('.cr2')) return 'image/x-canon-cr2';
    if (lower.endsWith('.cr3')) return 'image/x-canon-cr3';
    if (lower.endsWith('.nef')) return 'image/x-nikon-nef';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (assetType === 'gif') return 'image/gif';
    return 'image/jpeg';
  }

  /**
   * Safe transfer of a single object from Supabase Storage to Cloudflare R2:
   * 1. Check if already exists in R2 with matching size (Idempotent resume).
   * 2. If not, download binary from Supabase Storage.
   * 3. Put binary to R2.
   * 4. Verify in R2 via HEAD request.
   */
  private async transferAsset(
    sourceKey: string,
    targetKey: string,
    assetType: 'photo' | 'thumbnail' | 'gif' | 'raw',
    expectedSize?: number
  ): Promise<{ success: boolean; bytes: number; reusedExisting: boolean; error?: string }> {
    const contentType = this.guessContentType(sourceKey, assetType);

    if (this.dryRun) {
      this.logger(`[DRY-RUN] Checking Supabase source: ${sourceKey} -> Target: ${targetKey}`);
      const srcHead = await this.supabaseStorage.headObject(sourceKey);
      if (!srcHead.exists) {
        return { success: false, bytes: 0, reusedExisting: false, error: `Source not found in Supabase Storage: ${sourceKey}` };
      }
      return { success: true, bytes: srcHead.contentLength || 0, reusedExisting: false };
    }

    try {
      // Step 1: Idempotency Check — Check if already uploaded to R2
      const r2Head = await this.r2.headObject(targetKey);
      if (r2Head.exists && r2Head.contentLength && r2Head.contentLength > 0) {
        if (!expectedSize || r2Head.contentLength === expectedSize) {
          return { success: true, bytes: r2Head.contentLength, reusedExisting: true };
        }
      }

      // Step 2: Download from Supabase Storage
      const srcObj = await this.supabaseStorage.getObject(sourceKey, true);
      if (!srcObj || !srcObj.buffer) {
        throw new Error(`Failed to download binary from Supabase Storage: ${sourceKey}`);
      }

      const buffer = srcObj.buffer;
      const sizeBytes = buffer.length;

      // Step 3: Put to Cloudflare R2
      await this.r2.putObject(targetKey, buffer, {
        contentType,
      });

      // Step 4: HEAD Verification in Cloudflare R2
      const verifyHead = await this.r2.headObject(targetKey);
      if (!verifyHead.exists) {
        throw new Error(`HEAD verification failed: object does not exist in R2 after PUT: ${targetKey}`);
      }
      if (verifyHead.contentLength !== undefined && verifyHead.contentLength !== sizeBytes) {
        throw new Error(
          `HEAD verification size mismatch in R2: expected ${sizeBytes} bytes, got ${verifyHead.contentLength} bytes`
        );
      }

      return { success: true, bytes: sizeBytes, reusedExisting: false };
    } catch (err: any) {
      return { success: false, bytes: 0, reusedExisting: false, error: err.message || String(err) };
    }
  }

  /**
   * Migrates a single legacy photo record along with its thumbnail and raw files.
   */
  public async migratePhoto(photo: any): Promise<{ success: boolean; error?: string }> {
    // 1. Safety validation: skip deleted or active uploads
    if (photo.is_cloud_deleted) {
      this.stats.skippedDeletedOrPending++;
      return { success: false, error: 'Photo is marked deleted' };
    }
    if (
      photo.upload_status === 'PENDING' ||
      photo.upload_status === 'UPLOADING' ||
      photo.upload_status === 'VERIFYING'
    ) {
      this.stats.skippedDeletedOrPending++;
      return { success: false, error: 'Photo is currently uploading' };
    }
    if (photo.upload_lease_expires_at && new Date(photo.upload_lease_expires_at) > new Date()) {
      this.stats.skippedDeletedOrPending++;
      return { success: false, error: 'Photo has active upload lease' };
    }
    if (photo.storage_provider !== 'supabase') {
      return { success: true }; // already migrated
    }

    const photoId = photo.id;
    const mainKey = photo.cloud_storage_path;
    const thumbKey = photo.thumbnail_storage_path;
    const rawFiles: any[] = Array.isArray(photo.raw_files) ? [...photo.raw_files] : [];

    let migratedThumbCount = 0;
    let migratedRawCount = 0;

    // 2. Transfer Main Photo
    if (!mainKey) {
      const err = `Photo ${photoId} has no cloud_storage_path`;
      this.stats.errors.push({ id: photoId, assetType: 'photo', error: err, timestamp: new Date().toISOString() });
      this.stats.failedAssets.photos++;
      return { success: false, error: err };
    }

    const mainTransfer = await this.transferAsset(mainKey, mainKey, 'photo', photo.file_size_bytes);
    if (!mainTransfer.success) {
      const err = `Main photo transfer failed: ${mainTransfer.error}`;
      this.stats.errors.push({ id: photoId, assetType: 'photo', error: err, timestamp: new Date().toISOString() });
      this.stats.failedAssets.photos++;
      return { success: false, error: err };
    }

    // 3. Transfer Thumbnail (if present)
    if (thumbKey) {
      const thumbTransfer = await this.transferAsset(thumbKey, thumbKey, 'thumbnail');
      if (!thumbTransfer.success) {
        const err = `Thumbnail transfer failed: ${thumbTransfer.error}`;
        this.stats.errors.push({ id: photoId, assetType: 'thumbnail', error: err, timestamp: new Date().toISOString() });
        this.stats.failedAssets.thumbnails++;
        return { success: false, error: err };
      }
      migratedThumbCount++;
    }

    // 4. Transfer RAW Files (if present)
    const updatedRawFiles: any[] = [];
    for (const raw of rawFiles) {
      if (raw.storage_provider === 'supabase' && raw.storage_path) {
        const rawTransfer = await this.transferAsset(raw.storage_path, raw.storage_path, 'raw', raw.file_size_bytes);
        if (!rawTransfer.success) {
          const err = `RAW index ${raw.raw_index || raw.index} transfer failed: ${rawTransfer.error}`;
          this.stats.errors.push({ id: photoId, assetType: 'raw', error: err, timestamp: new Date().toISOString() });
          this.stats.failedAssets.raws++;
          return { success: false, error: err };
        }
        updatedRawFiles.push({
          ...raw,
          storage_provider: 'r2',
        });
        migratedRawCount++;
      } else {
        updatedRawFiles.push(raw);
      }
    }

    // 5. Finalize Database Update ONLY after all assets verified in R2
    if (!this.dryRun) {
      const { error: dbErr } = await this.client
        .from('photos')
        .update({
          storage_provider: 'r2',
          raw_files: updatedRawFiles,
          updated_at: new Date().toISOString(),
        })
        .eq('id', photoId)
        .eq('storage_provider', 'supabase'); // Optimistic concurrency check

      if (dbErr) {
        const err = `Database update failed after R2 transfer: ${dbErr.message}`;
        this.stats.errors.push({ id: photoId, assetType: 'photo_db', error: err, timestamp: new Date().toISOString() });
        this.stats.failedAssets.photos++;
        return { success: false, error: err };
      }
    }

    this.stats.processedPhotos++;
    this.stats.migratedAssets.photos++;
    this.stats.migratedAssets.thumbnails += migratedThumbCount;
    this.stats.migratedAssets.raws += migratedRawCount;
    this.saveCheckpoint();

    return { success: true };
  }

  /**
   * Migrates a single legacy GIF record.
   */
  public async migrateGif(gif: any): Promise<{ success: boolean; error?: string }> {
    if (gif.is_cloud_deleted) {
      this.stats.skippedDeletedOrPending++;
      return { success: false, error: 'GIF is marked deleted' };
    }
    if (gif.storage_provider !== 'supabase') {
      return { success: true };
    }

    const gifId = gif.id;
    const gifKey = gif.cloud_storage_path;
    if (!gifKey) {
      const err = `GIF ${gifId} has no cloud_storage_path`;
      this.stats.errors.push({ id: gifId, assetType: 'gif', error: err, timestamp: new Date().toISOString() });
      this.stats.failedAssets.gifs++;
      return { success: false, error: err };
    }

    const gifTransfer = await this.transferAsset(gifKey, gifKey, 'gif');
    if (!gifTransfer.success) {
      const err = `GIF transfer failed: ${gifTransfer.error}`;
      this.stats.errors.push({ id: gifId, assetType: 'gif', error: err, timestamp: new Date().toISOString() });
      this.stats.failedAssets.gifs++;
      return { success: false, error: err };
    }

    if (!this.dryRun) {
      const { error: dbErr } = await this.client
        .from('gifs')
        .update({
          storage_provider: 'r2',
        })
        .eq('id', gifId)
        .eq('storage_provider', 'supabase');

      if (dbErr) {
        const err = `Database update failed for GIF: ${dbErr.message}`;
        this.stats.errors.push({ id: gifId, assetType: 'gif_db', error: err, timestamp: new Date().toISOString() });
        this.stats.failedAssets.gifs++;
        return { success: false, error: err };
      }
    }

    this.stats.processedGifs++;
    this.stats.migratedAssets.gifs++;
    this.saveCheckpoint();

    return { success: true };
  }

  /**
   * Fetches and processes next batch of photos
   */
  public async processNextPhotoBatch(): Promise<{ processed: number; remaining: number }> {
    let query = this.client
      .from('photos')
      .select('id, event_id, organization_id, session_photo_id, cloud_storage_path, thumbnail_storage_path, file_size_bytes, upload_status, upload_lease_expires_at, is_cloud_deleted, storage_provider, raw_files')
      .eq('storage_provider', 'supabase')
      .eq('is_cloud_deleted', false)
      .neq('upload_status', 'PENDING')
      .order('captured_at', { ascending: true })
      .limit(this.batchSize);

    if (this.eventId) {
      query = query.eq('event_id', this.eventId);
    }

    const { data: photos, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch photos for migration: ${error.message}`);
    }

    if (!photos || photos.length === 0) {
      return { processed: 0, remaining: 0 };
    }

    let processedCount = 0;
    for (let i = 0; i < photos.length; i += this.concurrency) {
      if (this.isPaused) break;
      const chunk = photos.slice(i, i + this.concurrency);
      await Promise.all(chunk.map((p) => this.migratePhoto(p)));
      processedCount += chunk.length;
      if (this.onProgress) this.onProgress(this.stats);
    }

    return { processed: processedCount, remaining: photos.length - processedCount };
  }

  /**
   * Fetches and processes next batch of gifs
   */
  public async processNextGifBatch(): Promise<{ processed: number; remaining: number }> {
    let query = this.client
      .from('gifs')
      .select('id, event_id, organization_id, session_photo_id, cloud_storage_path, is_cloud_deleted, storage_provider')
      .eq('storage_provider', 'supabase')
      .eq('is_cloud_deleted', false)
      .limit(this.batchSize);

    if (this.eventId) {
      query = query.eq('event_id', this.eventId);
    }

    const { data: gifs, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch gifs for migration: ${error.message}`);
    }

    if (!gifs || gifs.length === 0) {
      return { processed: 0, remaining: 0 };
    }

    let processedCount = 0;
    for (let i = 0; i < gifs.length; i += this.concurrency) {
      if (this.isPaused) break;
      const chunk = gifs.slice(i, i + this.concurrency);
      await Promise.all(chunk.map((g) => this.migrateGif(g)));
      processedCount += chunk.length;
      if (this.onProgress) this.onProgress(this.stats);
    }

    return { processed: processedCount, remaining: gifs.length - processedCount };
  }

  /**
   * Retrieves overall migration progress & counts from database
   */
  public async getMigrationProgress(): Promise<{
    pendingPhotos: number;
    pendingGifs: number;
    migratedPhotos: number;
    migratedGifs: number;
    totalPhotos: number;
    totalGifs: number;
  }> {
    let pSupabaseQuery = this.client
      .from('photos')
      .select('id')
      .eq('storage_provider', 'supabase')
      .eq('is_cloud_deleted', false);

    let pR2Query = this.client
      .from('photos')
      .select('id')
      .eq('storage_provider', 'r2')
      .eq('is_cloud_deleted', false);

    let gSupabaseQuery = this.client
      .from('gifs')
      .select('id')
      .eq('storage_provider', 'supabase')
      .eq('is_cloud_deleted', false);

    let gR2Query = this.client
      .from('gifs')
      .select('id')
      .eq('storage_provider', 'r2')
      .eq('is_cloud_deleted', false);

    if (this.eventId) {
      pSupabaseQuery = pSupabaseQuery.eq('event_id', this.eventId);
      pR2Query = pR2Query.eq('event_id', this.eventId);
      gSupabaseQuery = gSupabaseQuery.eq('event_id', this.eventId);
      gR2Query = gR2Query.eq('event_id', this.eventId);
    }

    const [pSup, pR2, gSup, gR2] = await Promise.all([
      pSupabaseQuery,
      pR2Query,
      gSupabaseQuery,
      gR2Query,
    ]);

    const pendingPhotos = pSup.data?.length || 0;
    const migratedPhotos = pR2.data?.length || 0;
    const pendingGifs = gSup.data?.length || 0;
    const migratedGifs = gR2.data?.length || 0;

    return {
      pendingPhotos,
      pendingGifs,
      migratedPhotos,
      migratedGifs,
      totalPhotos: pendingPhotos + migratedPhotos,
      totalGifs: pendingGifs + migratedGifs,
    };
  }

  /**
   * Executes the full migration loop until all records are processed or limit reached.
   */
  public async runMigration(): Promise<MigrationStats> {
    this.stats.status = 'RUNNING';
    this.stats.startTime = new Date().toISOString();

    const initial = await this.getMigrationProgress();
    this.stats.totalPendingPhotos = initial.pendingPhotos;
    this.stats.totalPendingGifs = initial.pendingGifs;

    this.logger(
      `Starting migration. Pending photos: ${initial.pendingPhotos}, Pending GIFs: ${initial.pendingGifs}. Mode: ${this.dryRun ? 'DRY-RUN' : 'LIVE TRANSFER'}`
    );

    let totalProcessed = 0;

    // Phase 1: Migrate Photos
    while (!this.isPaused && totalProcessed < this.limit) {
      const res = await this.processNextPhotoBatch();
      if (res.processed === 0) break;
      totalProcessed += res.processed;
      this.logger(`Processed photo batch: ${res.processed} items. Total photos migrated so far: ${this.stats.migratedAssets.photos}`);
      if (this.limit && totalProcessed >= this.limit) break;
    }

    // Phase 2: Migrate GIFs
    while (!this.isPaused && totalProcessed < this.limit) {
      const res = await this.processNextGifBatch();
      if (res.processed === 0) break;
      totalProcessed += res.processed;
      this.logger(`Processed GIF batch: ${res.processed} items. Total GIFs migrated so far: ${this.stats.migratedAssets.gifs}`);
      if (this.limit && totalProcessed >= this.limit) break;
    }

    if (this.isPaused) {
      this.stats.status = 'PAUSED';
      this.logger('Migration loop paused.');
    } else {
      this.stats.status = 'COMPLETED';
      this.logger('Migration loop completed.');
    }

    this.saveCheckpoint();
    return this.getStats();
  }
}

