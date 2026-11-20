import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
const archiver = require('archiver');
import { PassThrough, Readable } from 'stream';
import { getServiceSupabase } from '@/lib/supabase';
import { getR2Storage } from '@/lib/storage/storage-provider';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const { eventId } = params;

  try {
    const client = getServiceSupabase();
    let eventName = 'Acara Photobooth';
    let eventDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    let matchedEventId = eventId;

    if (client) {
      try {
        const isUuid = (str: string) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

        let dbEvent = null;
        if (isUuid(eventId)) {
          const res = await client.from('events').select('*').eq('id', eventId).maybeSingle();
          dbEvent = res.data;
        } else if (eventId && eventId !== 'default_event' && eventId !== 'all') {
          const res = await client.from('events').select('*').eq('slug', eventId).maybeSingle();
          dbEvent = res.data;
          if (!dbEvent) {
            const resByName = await client.from('events').select('*').ilike('name', eventId).maybeSingle();
            dbEvent = resByName.data;
          }
        }

        // Only fallback to latest event if explicitly requested via alias
        if (!dbEvent && (eventId === 'default_event' || eventId === 'latest' || eventId === 'live')) {
          const resLatest = await client
            .from('events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          dbEvent = resLatest.data;
        }

        if (dbEvent) {
          eventName = dbEvent.name || eventName;
          eventDate = dbEvent.branding_json?.dateFormatted || dbEvent.date || eventDate;
          matchedEventId = dbEvent.id;
        }
      } catch {
        // continue
      }
    }

    const eventsDir = path.resolve(process.cwd(), '../../data/events');
    const cloudDir = path.resolve(process.cwd(), '../../data/cloud-storage/public-gallery/events');

    const candidateDirs: string[] = [eventId];
    if (matchedEventId && matchedEventId !== eventId) {
      candidateDirs.push(matchedEventId);
    }
    if (
      eventId === 'b739dae7-9a16-48e9-bc53-3fa159380a87' ||
      eventId === 'evt_bayu_irma_2026'
    ) {
      candidateDirs.push('evt_bayu_irma_2026');
      candidateDirs.push('b739dae7-9a16-48e9-bc53-3fa159380a87');
    }

    const requestedType = req.nextUrl.searchParams.get('type') || 'all'; // 'all' | 'framed' | 'gif' | 'raw'

    // Collect files
    interface ZipEntry {
      sourcePath: string;
      archivePath: string;
    }
    const filesToArchive: ZipEntry[] = [];
    const addedArchivePaths = new Set<string>();

    for (const cand of Array.from(new Set(candidateDirs))) {
      for (const root of [cloudDir, eventsDir]) {
        const dirPath = path.join(root, cand);
        if (!fsSync.existsSync(dirPath)) continue;

        const targets = [
          { sub: '', defaultFolder: 'Foto_Berbingkai' },
          { sub: 'processed', defaultFolder: 'Foto_Berbingkai' },
          { sub: 'gifs', defaultFolder: 'Animasi_GIF' },
          { sub: 'raw', defaultFolder: 'Foto_Mentahan' },
        ];

        for (const target of targets) {
          const folderPath = target.sub ? path.join(dirPath, target.sub) : dirPath;
          if (!fsSync.existsSync(folderPath)) continue;

          try {
            const files = await fs.readdir(folderPath);
            for (const f of files) {
              if (f.startsWith('.') || f.endsWith('.DS_Store') || f.includes('_thumb')) continue;

              const fullFilePath = path.join(folderPath, f);
              try {
                const stat = fsSync.statSync(fullFilePath);
                if (!stat.isFile()) continue;
              } catch {
                continue;
              }

              let folder = target.defaultFolder;
              if (f.endsWith('.gif')) {
                folder = 'Animasi_GIF';
              } else if (f.includes('_raw_')) {
                folder = 'Foto_Mentahan';
              }

              // Apply selective filter
              if (requestedType === 'framed' && folder !== 'Foto_Berbingkai') continue;
              if (requestedType === 'gif' && folder !== 'Animasi_GIF') continue;
              if (requestedType === 'raw' && folder !== 'Foto_Mentahan') continue;

              const archivePath = `${folder}/${f}`;
              if (!addedArchivePaths.has(archivePath)) {
                addedArchivePaths.add(archivePath);
                filesToArchive.push({
                  sourcePath: fullFilePath,
                  archivePath,
                });
              }
            }
          } catch {}
        }
      }
    }

    const passThrough = new PassThrough();
    const archive = archiver('zip', {
      zlib: { level: 5 },
    });

    archive.on('error', (err: any) => {
      console.error('[Zip Archive Error]:', err);
      passThrough.destroy(err);
    });

    archive.pipe(passThrough);

    const framedCount = filesToArchive.filter((f) => f.archivePath.startsWith('Foto_Berbingkai')).length;
    const gifCount = filesToArchive.filter((f) => f.archivePath.startsWith('Animasi_GIF')).length;
    const rawCount = filesToArchive.filter((f) => f.archivePath.startsWith('Foto_Mentahan')).length;

    const readmeContent = `=====================================================
  MINGLEBOOTH — ARSIP FOTO RESMI ACARA
=====================================================
Acara       : ${eventName}
Tanggal     : ${eventDate}
Total Foto  : ${framedCount} Foto Berbingkai Cetak
Total GIF   : ${gifCount} Animasi Loop Boomerang
Total RAW   : ${rawCount} Jepretan Mentah Resolusi Tinggi
Diunduh Pada: ${new Date().toLocaleString('id-ID')}

STRUKTUR FOLDER:
├── Foto_Berbingkai/   -> Foto cetak lengkap dengan layout bingkai
├── Animasi_GIF/       -> Video loop animasi GIF boomerang
└── Foto_Mentahan/     -> Jepretan asli mentah dari sensor kamera

Terima kasih telah mengabadikan momen bersama MingleBooth!
Layanan Photobooth Profesional: https://minglebooth.id
=====================================================`;

    archive.append(readmeContent, { name: 'README_ARSIP_FOTO.txt' });

    (async () => {
      try {
        for (const item of filesToArchive) {
          archive.file(item.sourcePath, { name: item.archivePath });
        }

        // If filesToArchive is empty (e.g. on Vercel) or partial, download cloud assets from Supabase Storage / R2
        if (client && matchedEventId) {
          const isUuid = (str: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

          if (isUuid(matchedEventId)) {
            // 1. Photos
            if (requestedType === 'all' || requestedType === 'framed') {
              const { data: dbPhotos } = await client
                .from('photos')
                .select('cloud_storage_path, storage_provider, upload_status, is_cloud_deleted')
                .eq('event_id', matchedEventId)
                .eq('is_cloud_deleted', false);

              if (dbPhotos) {
                for (const p of dbPhotos) {
                  if (!p.cloud_storage_path) continue;
                  const isReady = !p.upload_status || p.upload_status === 'READY' || p.upload_status === 'UPLOADED';
                  if (!isReady) continue;

                  const fName = path.basename(p.cloud_storage_path);
                  const archivePath = `Foto_Berbingkai/${fName}`;
                  if (addedArchivePaths.has(archivePath)) continue;

                  const provider = p.storage_provider || 'supabase';
                  if (provider === 'r2') {
                    try {
                      const r2 = getR2Storage();
                      const r2Obj = await r2.getObject(p.cloud_storage_path, true);
                      if (r2Obj.buffer) {
                        archive.append(r2Obj.buffer, { name: archivePath });
                        addedArchivePaths.add(archivePath);
                      }
                    } catch (r2Err: any) {
                      console.warn(`[ZIP R2 Photo Warn] ${p.cloud_storage_path}:`, r2Err?.message);
                    }
                  } else {
                    const { data: blob } = await client.storage
                      .from('minglebooth-storage')
                      .download(p.cloud_storage_path);
                    if (blob) {
                      const buf = Buffer.from(await blob.arrayBuffer());
                      archive.append(buf, { name: archivePath });
                      addedArchivePaths.add(archivePath);
                    }
                  }
                }
              }
            }

            // 2. GIFs
            if (requestedType === 'all' || requestedType === 'gif') {
              const { data: dbGifs } = await client
                .from('gifs')
                .select('cloud_storage_path, storage_provider, is_cloud_deleted')
                .eq('event_id', matchedEventId)
                .eq('is_cloud_deleted', false);

              if (dbGifs) {
                for (const g of dbGifs) {
                  if (!g.cloud_storage_path) continue;
                  const fName = path.basename(g.cloud_storage_path);
                  const archivePath = `Animasi_GIF/${fName}`;
                  if (addedArchivePaths.has(archivePath)) continue;

                  const provider = g.storage_provider || 'supabase';
                  if (provider === 'r2') {
                    try {
                      const r2 = getR2Storage();
                      const r2Obj = await r2.getObject(g.cloud_storage_path, true);
                      if (r2Obj.buffer) {
                        archive.append(r2Obj.buffer, { name: archivePath });
                        addedArchivePaths.add(archivePath);
                      }
                    } catch (r2Err: any) {
                      console.warn(`[ZIP R2 GIF Warn] ${g.cloud_storage_path}:`, r2Err?.message);
                    }
                  } else {
                    const { data: blob } = await client.storage
                      .from('minglebooth-storage')
                      .download(g.cloud_storage_path);
                    if (blob) {
                      const buf = Buffer.from(await blob.arrayBuffer());
                      archive.append(buf, { name: archivePath });
                      addedArchivePaths.add(archivePath);
                    }
                  }
                }
              }
            }

            // 3. Raw shots
            if (requestedType === 'all' || requestedType === 'raw') {
              // First, check raw_files array from photos
              const { data: dbPhotosWithRaw } = await client
                .from('photos')
                .select('raw_files, is_cloud_deleted')
                .eq('event_id', matchedEventId)
                .eq('is_cloud_deleted', false);

              if (dbPhotosWithRaw) {
                for (const p of dbPhotosWithRaw) {
                  if (p.raw_files && Array.isArray(p.raw_files)) {
                    for (const rf of p.raw_files) {
                      if (!rf.storage_path) continue;
                      const fName = path.basename(rf.storage_path);
                      const archivePath = `Foto_Mentahan/${fName}`;
                      if (addedArchivePaths.has(archivePath)) continue;

                      const rfProvider = rf.storage_provider || 'supabase';
                      if (rfProvider === 'r2') {
                        try {
                          const r2 = getR2Storage();
                          const r2Obj = await r2.getObject(rf.storage_path, true);
                          if (r2Obj.buffer) {
                            archive.append(r2Obj.buffer, { name: archivePath });
                            addedArchivePaths.add(archivePath);
                          }
                        } catch (r2Err: any) {
                          console.warn(`[ZIP R2 RAW Warn] ${rf.storage_path}:`, r2Err?.message);
                        }
                      } else {
                        const { data: blob } = await client.storage
                          .from('minglebooth-storage')
                          .download(rf.storage_path);
                        if (blob) {
                          const buf = Buffer.from(await blob.arrayBuffer());
                          archive.append(buf, { name: archivePath });
                          addedArchivePaths.add(archivePath);
                        }
                      }
                    }
                  }
                }
              }

              // Also scan legacy raw folder in Supabase Storage if any
              try {
                const { data: rawList } = await client.storage
                  .from('minglebooth-storage')
                  .list(`events/${matchedEventId}/raw`);

                if (rawList && rawList.length > 0) {
                  for (const rf of rawList) {
                    const rawPath = `events/${matchedEventId}/raw/${rf.name}`;
                    const archivePath = `Foto_Mentahan/${rf.name}`;
                    if (addedArchivePaths.has(archivePath)) continue;

                    const { data: blob } = await client.storage
                      .from('minglebooth-storage')
                      .download(rawPath);
                    if (blob) {
                      const buf = Buffer.from(await blob.arrayBuffer());
                      archive.append(buf, { name: archivePath });
                      addedArchivePaths.add(archivePath);
                    }
                  }
                }
              } catch {
                // Ignore raw legacy scan failure
              }
            }
          }
        }

        await archive.finalize();
      } catch (e) {
        console.error('[Archiver Finalize Error]:', e);
        archive.abort();
      }
    })();

    const typeSuffix =
      requestedType === 'framed'
        ? 'Foto_Berbingkai'
        : requestedType === 'gif'
        ? 'Animasi_GIF'
        : requestedType === 'raw'
        ? 'Foto_Original'
        : 'Semua_Media';
    const cleanFilename = `MingleBooth_${eventName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${typeSuffix}.zip`;
    const webStream = Readable.toWeb(passThrough);

    return new Response(webStream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${cleanFilename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[Zip Route Error]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Gagal membuat file ZIP' },
      { status: 500 }
    );
  }
}
