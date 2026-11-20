import { StorageAdapter, StorageProviderType } from './types';
import { R2StorageAdapter } from './r2';
import { getServiceSupabase } from '../supabase';

// Strict server-only guard
if (typeof window !== 'undefined') {
  throw new Error('Storage provider factory cannot be called in client-side modules.');
}

/**
 * Lightweight Supabase Storage Adapter implementing StorageAdapter.
 * Preserves legacy Supabase Storage behavior without mutations.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  readonly provider: StorageProviderType = 'supabase';
  private bucketName: string;

  constructor(bucketName: string = 'minglebooth-storage') {
    this.bucketName = bucketName;
  }

  async headBucket() {
    const client = getServiceSupabase();
    const { data, error } = await client.storage.getBucket(this.bucketName);
    return {
      exists: !error && !!data,
      bucketName: this.bucketName,
      storageProvider: this.provider,
    };
  }

  async putObject(key: string, body: Buffer | Uint8Array | string, options: any = {}) {
    const client = getServiceSupabase();
    const cleanedKey = key.replace(/^\/+/, '');
    const { error } = await client.storage.from(this.bucketName).upload(cleanedKey, body, {
      contentType: options.contentType || 'image/jpeg',
      upsert: true,
    });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    return {
      key: cleanedKey,
      size: Buffer.isBuffer(body) ? body.length : 0,
      storageProvider: this.provider,
    };
  }

  async headObject(key: string) {
    const client = getServiceSupabase();
    const cleanedKey = key.replace(/^\/+/, '');
    const pathParts = cleanedKey.split('/');
    const fileName = pathParts.pop() || '';
    const folder = pathParts.join('/');

    const { data, error } = await client.storage.from(this.bucketName).list(folder);
    if (error || !data) {
      return { exists: false, key: cleanedKey, storageProvider: this.provider };
    }
    const found = (data as any[]).find((f: any) => f.name === fileName);
    if (!found) {
      return { exists: false, key: cleanedKey, storageProvider: this.provider };
    }

    return {
      exists: true,
      key: cleanedKey,
      contentLength: found.metadata?.size,
      contentType: found.metadata?.mimetype,
      lastModified: found.created_at ? new Date(found.created_at) : undefined,
      storageProvider: this.provider,
    };
  }

  async getObject(key: string, asBuffer: boolean = false) {
    const client = getServiceSupabase();
    const cleanedKey = key.replace(/^\/+/, '');
    const { data, error } = await client.storage.from(this.bucketName).download(cleanedKey);
    if (error || !data) {
      throw new Error(`Supabase Storage getObject failed: ${error?.message || 'Not found'}`);
    }

    let buffer: Buffer | undefined;
    if (asBuffer) {
      buffer = Buffer.from(await data.arrayBuffer());
    }

    return {
      key: cleanedKey,
      buffer,
      contentType: data.type,
      contentLength: data.size,
      storageProvider: this.provider,
    };
  }

  async deleteObject(key: string) {
    const client = getServiceSupabase();
    const cleanedKey = key.replace(/^\/+/, '');
    const { error } = await client.storage.from(this.bucketName).remove([cleanedKey]);
    return {
      key: cleanedKey,
      success: !error,
      storageProvider: this.provider,
    };
  }

  async createPresignedPutUrl(key: string, options: any = {}) {
    const client = getServiceSupabase();
    const cleanedKey = key.replace(/^\/+/, '');
    const expiresIn = options.expiresIn || 300;
    const { data, error } = await client.storage
      .from(this.bucketName)
      .createSignedUploadUrl(cleanedKey);
    if (error || !data) {
      throw new Error(`Supabase signed upload URL failed: ${error?.message}`);
    }
    return {
      url: data.signedUrl,
      key: cleanedKey,
      expiresIn,
      storageProvider: this.provider,
    };
  }

  async createPresignedGetUrl(key: string, options: any = {}) {
    const client = getServiceSupabase();
    const cleanedKey = key.replace(/^\/+/, '');
    const expiresIn = options.expiresIn || 3600;
    const { data, error } = await client.storage
      .from(this.bucketName)
      .createSignedUrl(cleanedKey, expiresIn);
    if (error || !data) {
      throw new Error(`Supabase signed read URL failed: ${error?.message}`);
    }
    return {
      url: data.signedUrl,
      key: cleanedKey,
      expiresIn,
      storageProvider: this.provider,
    };
  }
}

/**
 * Returns the configured storage adapter according to GALLERY_STORAGE_PROVIDER.
 * Defaults strictly to 'supabase' to ensure zero regression in existing routes.
 */
export function getStorageAdapter(providerOverride?: StorageProviderType): StorageAdapter {
  const activeProvider: StorageProviderType =
    providerOverride ||
    ((process.env.GALLERY_STORAGE_PROVIDER as StorageProviderType) === 'r2' ? 'r2' : 'supabase');

  if (activeProvider === 'r2') {
    return new R2StorageAdapter();
  }

  return new SupabaseStorageAdapter();
}

/** Export convenience singleton getters */
export function getR2Storage(): R2StorageAdapter {
  return new R2StorageAdapter();
}

export function getSupabaseStorage(): SupabaseStorageAdapter {
  return new SupabaseStorageAdapter();
}
