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
        const { data: dbEvent } = await client
          .from('events')
          .select('*')
          .or(`id.eq.${eventId},slug.eq.${eventId}`)
          .limit(1)
          .single();

        if (dbEvent) {
          eventName = dbEvent.name || eventName;
          eventDate = dbEvent.date || eventDate;
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
