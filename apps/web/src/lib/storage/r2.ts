import {
  S3Client,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageAdapter,
  StorageProviderType,
  PutObjectOptions,
  PutObjectResult,
  HeadObjectResult,
  GetObjectResult,
  DeleteObjectResult,
  PresignedUrlOptions,
  PresignedUrlResult,
  HeadBucketResult,
} from './types';

// Strict server-only guard
if (typeof window !== 'undefined') {
  throw new Error('R2StorageClient cannot be instantiated in browser-accessible modules.');
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

/**
 * Validates and extracts server-only Cloudflare R2 credentials.
 * Fails closed if any credential is missing.
 */
export function getR2Config(): R2Config {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();
  const endpoint =
    process.env.CLOUDFLARE_R2_ENDPOINT?.trim() ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  // Strict Fail-Closed: No fallback to staging bucket or staging credentials.
  // All R2 configuration parameters must be explicitly set and non-empty.
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !endpoint) {
    const missing: string[] = [];
    if (!accountId) missing.push('CLOUDFLARE_R2_ACCOUNT_ID');
    if (!accessKeyId) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID');
    if (!secretAccessKey) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
    if (!bucketName) missing.push('CLOUDFLARE_R2_BUCKET_NAME');
    if (!endpoint) missing.push('CLOUDFLARE_R2_ENDPOINT');

    throw new Error(
      `[R2 Storage Config Error] Incomplete Cloudflare R2 configuration: ${missing.join(', ')} must be configured in server-only environment. No fallback to staging bucket is permitted.`
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint,
  };
}

let s3ClientInstance: S3Client | null = null;

/**
 * Resets cached singleton S3Client instance (for configuration reload/testing).
 */
export function resetR2Client(): void {
  s3ClientInstance = null;
}

/**
 * Returns a cached singleton S3Client instance for Cloudflare R2.
 */
export function getR2Client(): S3Client {
  if (s3ClientInstance) {
    return s3ClientInstance;
  }

  const config = getR2Config();

  s3ClientInstance = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return s3ClientInstance;
}

/**
 * Cloudflare R2 Implementation of StorageAdapter
 */
export class R2StorageAdapter implements StorageAdapter {
  readonly provider: StorageProviderType = 'r2';
  private client: S3Client;
  private bucketName: string;

  constructor(client?: S3Client, bucketName?: string) {
    this.client = client || getR2Client();
    this.bucketName = bucketName || getR2Config().bucketName;
  }

  get bucket(): string {
    return this.bucketName;
  }

  /**
   * Verify staging bucket existence and credentials
   */
  async headBucket(): Promise<HeadBucketResult> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
      return {
        exists: true,
        bucketName: this.bucketName,
        storageProvider: this.provider,
      };
    } catch (error: any) {
      if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
        return { exists: false, bucketName: this.bucketName, storageProvider: this.provider };
      }
      throw error;
    }
  }

  /**
   * Uploads an object to R2
   */
  async putObject(
    key: string,
    body: Buffer | Uint8Array | string | NodeJS.ReadableStream,
    options: PutObjectOptions = {}
  ): Promise<PutObjectResult> {
    const cleanedKey = key.replace(/^\/+/, '');
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: cleanedKey,
      Body: body as any,
      ContentType: options.contentType || 'application/octet-stream',
      Metadata: options.metadata,
      ContentLength: options.contentLength,
    });

    const response = await this.client.send(command);

    let calculatedSize = options.contentLength || 0;
    if (Buffer.isBuffer(body)) {
      calculatedSize = body.length;
    } else if (typeof body === 'string') {
      calculatedSize = Buffer.byteLength(body);
    } else if (body instanceof Uint8Array) {
      calculatedSize = body.byteLength;
    }

    return {
      key: cleanedKey,
      size: calculatedSize,
      eTag: response.ETag,
      storageProvider: this.provider,
    };
  }

  /**
   * Verifies object existence and retrieves metadata
   */
  async headObject(key: string): Promise<HeadObjectResult> {
    const cleanedKey = key.replace(/^\/+/, '');
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: cleanedKey,
        })
      );

      return {
        exists: true,
        key: cleanedKey,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        eTag: response.ETag,
        lastModified: response.LastModified,
        storageProvider: this.provider,
      };
    } catch (error: any) {
      if (
        error?.$metadata?.httpStatusCode === 404 ||
        error?.name === 'NotFound' ||
        error?.name === 'NoSuchKey'
      ) {
        return {
          exists: false,
          key: cleanedKey,
          storageProvider: this.provider,
        };
      }
      throw error;
    }
  }

  /**
   * Retrieves an object from R2 as a stream or Buffer
   */
  async getObject(key: string, asBuffer: boolean = false): Promise<GetObjectResult> {
    const cleanedKey = key.replace(/^\/+/, '');
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: cleanedKey,
      })
    );

    let buffer: Buffer | undefined;
    if (asBuffer && response.Body) {
      const bytes = await response.Body.transformToByteArray();
      buffer = Buffer.from(bytes);
    }

    return {
      key: cleanedKey,
      stream: response.Body as any,
      buffer,
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      eTag: response.ETag,
      lastModified: response.LastModified,
      storageProvider: this.provider,
    };
  }

  /**
   * Deletes an object from R2
   */
  async deleteObject(key: string): Promise<DeleteObjectResult> {
    const cleanedKey = key.replace(/^\/+/, '');
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: cleanedKey,
      })
    );

    return {
      key: cleanedKey,
      success: true,
      storageProvider: this.provider,
    };
  }

  /**
   * Generates a signed PUT URL for browser uploads
   * Default expiration: 300 seconds (5 minutes)
   */
  async createPresignedPutUrl(
    key: string,
    options: PresignedUrlOptions = {}
  ): Promise<PresignedUrlResult> {
    const cleanedKey = key.replace(/^\/+/, '');
    const expiresIn = options.expiresIn || 300; // default 5m
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: cleanedKey,
      ContentType: options.contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      key: cleanedKey,
      expiresIn,
      storageProvider: this.provider,
    };
  }

  /**
   * Generates a signed GET URL for time-limited private downloads/views
   * Default expiration: 3600 seconds (1 hour)
   */
  async createPresignedGetUrl(
    key: string,
    options: PresignedUrlOptions = {}
  ): Promise<PresignedUrlResult> {
    const cleanedKey = key.replace(/^\/+/, '');
    const expiresIn = options.expiresIn || 3600; // default 1h
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: cleanedKey,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      key: cleanedKey,
      expiresIn,
      storageProvider: this.provider,
    };
  }
}
