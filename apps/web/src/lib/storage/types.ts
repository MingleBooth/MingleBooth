/**
 * Storage Abstraction Types for MingleBooth
 * Supports Cloudflare R2 and Supabase Storage providers.
 */

export type StorageProviderType = 'supabase' | 'r2';

export interface PutObjectOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  contentLength?: number;
}

export interface PutObjectResult {
  key: string;
  size: number;
  eTag?: string;
  storageProvider: StorageProviderType;
}

export interface HeadObjectResult {
  exists: boolean;
  key: string;
  contentLength?: number;
  contentType?: string;
  eTag?: string;
  lastModified?: Date;
  storageProvider: StorageProviderType;
}

export interface GetObjectResult {
  key: string;
  stream?: NodeJS.ReadableStream | ReadableStream;
  buffer?: Buffer;
  contentType?: string;
  contentLength?: number;
  eTag?: string;
  lastModified?: Date;
  storageProvider: StorageProviderType;
}

export interface DeleteObjectResult {
  key: string;
  success: boolean;
  storageProvider: StorageProviderType;
}

export interface PresignedUrlOptions {
  /** Expiration time in seconds. Defaults: PUT = 300s, GET = 3600s. */
  expiresIn?: number;
  contentType?: string;
}

export interface PresignedUrlResult {
  url: string;
  key: string;
  expiresIn: number;
  storageProvider: StorageProviderType;
}

export interface HeadBucketResult {
  exists: boolean;
  bucketName: string;
  storageProvider: StorageProviderType;
}

/**
 * Universal Server-Only Storage Adapter Interface
 */
export interface StorageAdapter {
  readonly provider: StorageProviderType;

  /** Check bucket existence and authorization */
  headBucket(): Promise<HeadBucketResult>;

  /** Upload an object */
  putObject(
    key: string,
    body: Buffer | Uint8Array | string | NodeJS.ReadableStream,
    options?: PutObjectOptions
  ): Promise<PutObjectResult>;

  /** Verify object existence and metadata */
  headObject(key: string): Promise<HeadObjectResult>;

  /** Retrieve an object stream or buffer */
  getObject(key: string, asBuffer?: boolean): Promise<GetObjectResult>;

  /** Delete an object */
  deleteObject(key: string): Promise<DeleteObjectResult>;

  /** Create a signed PUT URL for direct browser uploads */
  createPresignedPutUrl(key: string, options?: PresignedUrlOptions): Promise<PresignedUrlResult>;

  /** Create a signed GET URL for time-limited private reads */
  createPresignedGetUrl(key: string, options?: PresignedUrlOptions): Promise<PresignedUrlResult>;
}

