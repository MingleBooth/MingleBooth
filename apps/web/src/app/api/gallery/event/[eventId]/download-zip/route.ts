import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
const archiver = require('archiver');
import { PassThrough, Readable } from 'stream';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const { eventId } = params;

  try {
    const client = getServiceSupabase();
    let eventName = 'Wedding Bayu & Irma';
    let eventDate = '2026-08-29';
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

        if (!dbEvent) {
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
      eventName.toLowerCase().includes('bayu') ||
      eventId === 'b739dae7-9a16-48e9-bc53-3fa159380a87' ||
      eventId.includes('bayu')
    ) {
      candidateDirs.push('evt_bayu_irma_2026');
      candidateDirs.push('b739dae7-9a16-48e9-bc53-3fa159380a87');
    }

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

        // If filesToArchive is empty (e.g. on Vercel), download directly from Supabase Storage
        if (filesToArchive.length === 0 && client && matchedEventId) {
          const isUuid = (str: string) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

          if (isUuid(matchedEventId)) {
            // 1. Photos
            const { data: dbPhotos } = await client
              .from('photos')
              .select('cloud_storage_path')
              .eq('event_id', matchedEventId);

            if (dbPhotos) {
              for (const p of dbPhotos) {
                if (!p.cloud_storage_path) continue;
                const { data: blob } = await client.storage
                  .from('minglebooth-storage')
                  .download(p.cloud_storage_path);
                if (blob) {
                  const buf = Buffer.from(await blob.arrayBuffer());
                  const fName = path.basename(p.cloud_storage_path);
                  archive.append(buf, { name: `Foto_Berbingkai/${fName}` });
                }
              }
            }

            // 2. GIFs
            const { data: dbGifs } = await client
              .from('gifs')
              .select('cloud_storage_path')
              .eq('event_id', matchedEventId);

            if (dbGifs) {
              for (const g of dbGifs) {
                if (!g.cloud_storage_path) continue;
                const { data: blob } = await client.storage
                  .from('minglebooth-storage')
                  .download(g.cloud_storage_path);
                if (blob) {
                  const buf = Buffer.from(await blob.arrayBuffer());
                  const fName = path.basename(g.cloud_storage_path);
                  archive.append(buf, { name: `Animasi_GIF/${fName}` });
                }
              }
            }

            // 3. Raw shots
            const { data: rawList } = await client.storage
              .from('minglebooth-storage')
              .list(`events/${matchedEventId}/raw`);

            if (rawList && rawList.length > 0) {
              for (const rf of rawList) {
                const { data: blob } = await client.storage
                  .from('minglebooth-storage')
                  .download(`events/${matchedEventId}/raw/${rf.name}`);
                if (blob) {
                  const buf = Buffer.from(await blob.arrayBuffer());
                  archive.append(buf, { name: `Foto_Mentahan/${rf.name}` });
                }
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

    const cleanFilename = `MingleBooth_${eventName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Arsip_Foto.zip`;
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
