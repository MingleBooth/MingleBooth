#!/usr/bin/env node
/**
 * MINGLEBOOTH — PHASE 2.2G
 * OPERATOR CLI: AUTOMATIC LEGACY GALLERY MIGRATION WORKER
 *
 * Usage:
 *   node -r ./node_modules/sucrase/register/ts scripts/migrate-legacy-gallery-r2.ts [options]
 *
 * Options:
 *   --dry-run                 Simulate migration without modifying R2 or Database
 *   --batch-size <n>          Number of items to fetch per batch (default: 10)
 *   --concurrency <n>         Concurrent asset transfers (default: 2, max: 10)
 *   --limit <n>               Maximum items to process in this run
 *   --event-id <uuid>         Filter migration to a specific event
 *   --checkpoint <path>       Custom path to checkpoint file (default: .migration-checkpoint.json)
 *   --progress-only           Print current migration status and exit
 *   --production-certified    Bypass safety guard (ONLY for authorized operator on production)
 */

import path from 'path';
import fs from 'fs';

// Hook Node.js module resolution for Next.js '@/*' alias
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request.startsWith('@/')) {
    const rel = request.slice(2);
    const target = path.resolve(__dirname, '../apps/web/src', rel);
    return originalResolveFilename.call(this, target, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

import { GalleryMigrationWorker, MigrationWorkerOptions } from '../apps/web/src/lib/gallery/migration-worker';
import { getR2Storage, getSupabaseStorage } from '../apps/web/src/lib/storage/storage-provider';
import { getServiceSupabase } from '../apps/web/src/lib/supabase';

// ==============================================================================
// 1. SAFETY AUDIT GUARD
// ==============================================================================
const PRODUCTION_PROJECT_REF = 'qnayeagrksnkeelthehq';

function checkProductionSafety(bypassCertified: boolean) {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (envUrl.includes(PRODUCTION_PROJECT_REF)) {
    if (!bypassCertified) {
      console.error('\n[FATAL_SAFETY_VIOLATION]');
      console.error(`Target database is Production Supabase (${PRODUCTION_PROJECT_REF}.supabase.co)!`);
      console.error('Execution halted: Automatic migration against production requires:');
      console.error('1. Completed Gate 0 Database & Storage Backup');
      console.error('2. Completed Gate 1 Preflight Drift Check');
      console.error('3. Explicit flag: --production-certified\n');
      process.exit(1);
    } else {
      console.warn('\n[WARNING] RUNNING IN OPERATOR CERTIFIED PRODUCTION MODE.');
    }
  }
}

// ==============================================================================
// 2. PARSE CLI ARGUMENTS
// ==============================================================================
const args = process.argv.slice(2);

function getArgVal(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

const isDryRun = args.includes('--dry-run');
const isProgressOnly = args.includes('--progress-only');
const isCertified = args.includes('--production-certified');
const batchSize = parseInt(getArgVal('--batch-size') || '10', 10);
const concurrency = parseInt(getArgVal('--concurrency') || '2', 10);
const limit = getArgVal('--limit') ? parseInt(getArgVal('--limit')!, 10) : Infinity;
const eventId = getArgVal('--event-id');
const checkpointPath = getArgVal('--checkpoint') || path.resolve(__dirname, '../.migration-checkpoint.json');

// Load environment from apps/web/.env.local if present
const envPath = path.resolve(__dirname, '../apps/web/.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

checkProductionSafety(isCertified);

// ==============================================================================
// 3. MAIN RUNNER
// ==============================================================================
async function main() {
  console.log('==============================================================================');
  console.log(' MINGLEBOOTH — LEGACY GALLERY MIGRATION RUNNER (Phase 2.2G)');
  console.log(` Mode:        ${isDryRun ? 'DRY-RUN (Simulate Only)' : 'LIVE ASSET TRANSFER'}`);
  console.log(` Batch Size:  ${batchSize}`);
  console.log(` Concurrency: ${concurrency}`);
  console.log(` Limit:       ${limit === Infinity ? 'Unlimited' : limit}`);
  console.log(` Event Filter:${eventId || 'ALL Events'}`);
  console.log(` Checkpoint:  ${checkpointPath}`);
  console.log('==============================================================================\n');

  const client = getServiceSupabase();
  const r2 = getR2Storage();
  const supabaseStorage = getSupabaseStorage();

  const worker = new GalleryMigrationWorker({
    batchSize,
    concurrency,
    limit,
    dryRun: isDryRun,
    eventId,
    checkpointPath,
    client,
    r2,
    supabaseStorage,
    logger: (msg, ...rest) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`, ...rest),
  });

  // Handle Progress Only
  if (isProgressOnly) {
    const progress = await worker.getMigrationProgress();
    console.log('\n--- CURRENT MIGRATION STATUS ---');
    console.table([
      { Asset: 'Photos', Pending_Supabase: progress.pendingPhotos, Migrated_R2: progress.migratedPhotos, Total: progress.totalPhotos },
      { Asset: 'GIFs', Pending_Supabase: progress.pendingGifs, Migrated_R2: progress.migratedGifs, Total: progress.totalGifs },
    ]);
    return;
  }

  // Graceful shutdown on SIGINT / SIGTERM
  let sigintCount = 0;
  process.on('SIGINT', () => {
    sigintCount++;
    if (sigintCount === 1) {
      console.log('\nGracefully pausing migration... (Finishing in-flight transfer)');
      worker.pause();
    } else {
      console.error('\nForced termination requested.');
      process.exit(1);
    }
  });

  const finalStats = await worker.runMigration();

  console.log('\n==============================================================================');
  console.log(' MIGRATION RUN SUMMARY');
  console.log('==============================================================================');
  console.log(` Status:           ${finalStats.status}`);
  console.log(` Processed Photos: ${finalStats.processedPhotos}`);
  console.log(` Processed GIFs:   ${finalStats.processedGifs}`);
  console.log(` Assets Migrated:  Photos: ${finalStats.migratedAssets.photos}, Thumbnails: ${finalStats.migratedAssets.thumbnails}, GIFs: ${finalStats.migratedAssets.gifs}, RAWs: ${finalStats.migratedAssets.raws}`);
  console.log(` Assets Failed:    Photos: ${finalStats.failedAssets.photos}, Thumbnails: ${finalStats.failedAssets.thumbnails}, GIFs: ${finalStats.failedAssets.gifs}, RAWs: ${finalStats.failedAssets.raws}`);
  console.log(` Skipped:          ${finalStats.skippedDeletedOrPending} (Deleted or Active Uploads)`);
  console.log(` Errors Encountered:${finalStats.errors.length}`);

  if (finalStats.errors.length > 0) {
    console.log('\n--- ERROR DETAILS (First 5) ---');
    console.table(finalStats.errors.slice(0, 5));
  }
  console.log('==============================================================================\n');
}

main().catch((fatal) => {
  console.error('\n[FATAL_RUNNER_ERROR]:', fatal);
  process.exit(1);
});

