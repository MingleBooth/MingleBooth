/**
 * cameraInstructions.ts
 * Dynamic Camera SOP & Connection Instructions Engine
 *
 * Dynamically tailors setup instructions based on camera brand, model, and operating system.
 * Prevents forcing Sony-specific PC Remote instructions onto Canon or other cameras.
 */

export interface CameraSopStep {
  title: string;
  instruction: string;
  important?: boolean;
}

export interface CameraSopGuide {
  title: string;
  brand: string;
  steps: CameraSopStep[];
  notes?: string;
}

/**
 * Resolve dynamic connection SOP guide based on identified camera brand or model.
 */
export function getCameraConnectionGuide(
  brandOrModel?: string | null,
  rawModel?: string | null
): CameraSopGuide {
  const query = `${brandOrModel || ''} ${rawModel || ''}`.toLowerCase();

  // ── CANON ──
  if (query.includes('canon') || query.includes('eos')) {
    return {
      title: 'Panduan Koneksi Kamera Canon (Wajib)',
      brand: 'Canon',
      steps: [
        {
          title: 'Format Foto',
          instruction: 'Atur format foto kamera ke JPEG L / Fine (Jangan simpan RAW/CR2/CR3 saja).',
          important: true,
        },
        {
          title: 'Koneksi Nirkabel',
          instruction: 'Wajib MATIKAN Wi-Fi & Bluetooth di menu kamera agar port USB aktif.',
          important: true,
        },
        {
          title: 'Mode Pemotretan',
          instruction: 'Putar dial kamera ke mode M (Manual) atau P untuk eksposur stabil.',
        },
        {
          title: 'Kabel USB',
          instruction: 'Hubungkan kabel USB dari kamera ke PC/Hub. Kamera akan otomatis terhubung via PTP.',
        },
      ],
      notes: 'Jika kamera tidak merespons, pastikan fungsi "Wi-Fi function" di menu Canon dalam posisi Disable.',
    };
  }

  // ── SONY ──
  if (query.includes('sony') || query.includes('ilce') || query.includes('alpha')) {
    return {
      title: 'Panduan Koneksi Kamera Sony (Wajib)',
      brand: 'Sony',
      steps: [
        {
          title: 'Format Foto',
          instruction: 'Atur format foto kamera ke JPEG Fine / Extra Fine (Bukan RAW/ARW saja).',
          important: true,
        },
        {
          title: 'Mode Pemotretan',
          instruction: 'Putar mode dial ke FOTO (M - Manual).',
        },
        {
          title: 'Pengaturan USB',
          instruction: 'Buka Menu kamera ➔ USB Connection ➔ pilih PC Remote.',
          important: true,
        },
        {
          title: 'Kabel USB',
          instruction: 'Hubungkan kabel USB Type-C ke port PC / Hub.',
        },
      ],
      notes: 'Pastikan opsi "PC Remote Save Dest." diatur ke PC Only atau PC+Camera.',
    };
  }

  // ── GENERIC / UNIVERSAL ──
  return {
    title: 'Panduan Koneksi Kamera Studio',
    brand: 'Universal',
    steps: [
      {
        title: 'Format Foto',
        instruction: 'Atur format foto kamera ke format JPEG standar (Bukan RAW saja).',
        important: true,
      },
      {
        title: 'Mode Pemotretan',
        instruction: 'Gunakan mode Manual (M) dengan shutter speed dan ISO tetap untuk hasil photobooth yang konsisten.',
      },
      {
        title: 'Mode USB',
        instruction: 'Atur mode USB kamera ke PC Remote, Tethering, atau PTP (hindari mode Mass Storage).',
        important: true,
      },
      {
        title: 'Kabel Data',
        instruction: 'Gunakan kabel USB data berkualitas baik dan tancapkan langsung ke port komputer.',
      },
    ],
    notes: 'Jika menggunakan kamera mirrorless dengan fitur Wi-Fi, matikan koneksi nirkabel kamera.',
  };
}

