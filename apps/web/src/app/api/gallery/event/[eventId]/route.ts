import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const { eventId } = params;

  try {
    const eventsDir = path.resolve(process.cwd(), '../../data/events');
    const targetDir = path.join(eventsDir, eventId || 'evt_bayu_irma_2026');
    const processedDir = path.join(targetDir, 'processed');

    if (!fsSync.existsSync(processedDir)) {
      return NextResponse.json(
        {
          success: true,
          eventId,
          eventName: 'Wedding Bayu & Irma',
          totalPhotos: 0,
          photos: [],
        },
        { headers: corsHeaders }
      );
    }

    const files = await fs.readdir(processedDir);
    const photoFiles = files.filter(
      (f) => !f.startsWith('.') && (f.endsWith('.jpg') || f.endsWith('.png'))
    );

    const photos = photoFiles.map((filename) => {
      const photoId = filename.replace(/\.[^/.]+$/, '');
      return {
        photoId,
        thumbUrl: `/api/gallery/${photoId}?type=photo`,
        url: `/p/${photoId}`,
      };
    });

    return NextResponse.json(
      {
        success: true,
        eventId,
        eventName: 'Wedding Bayu & Irma',
        totalPhotos: photos.length,
        photos,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error fetching event gallery' },
      { status: 500, headers: corsHeaders }
    );
  }
}
