export interface PresetTemplateItem {
  id: string;
  name: string;
  category: string;
  ratio: '4:5' | '2:6' | '1:1';
  formatLabel: string;
  slots: number;
  width: number;
  height: number;
  badgeColor: string;
  description: string;
  previewGradient: string;
  accentColor: string;
  svgOverlay: string;
}

// Helper to encode SVG string to base64 data URL
export function encodeSvgToBase64(svg: string): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svg)));
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const PRESET_TEMPLATE_LIBRARY: PresetTemplateItem[] = [
  {
    id: 'tpl_wedding_floral',
    name: 'Wedding Floral Romance',
    category: 'Pernikahan / Wedding',
    ratio: '4:5',
    formatLabel: '4R Portrait (4×6")',
    slots: 2,
    width: 1200,
    height: 1800,
    badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    accentColor: '#D4AF37',
    previewGradient: 'from-amber-950/40 via-stone-900 to-stone-950',
    description: 'Bingkai berornamen bunga mawar putih dan aksen daun emas mewah, cocok untuk pesta pernikahan elegan.',
    svgOverlay: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
  <defs>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F3E5AB"/>
      <stop offset="50%" stop-color="#D4AF37"/>
      <stop offset="100%" stop-color="#AA7C11"/>
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <!-- Outer Double Border -->
  <rect x="24" y="24" width="1152" height="1752" rx="28" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>
  <rect x="36" y="36" width="1128" height="1728" rx="20" fill="none" stroke="url(#goldGrad)" stroke-width="1.5" stroke-dasharray="8 6"/>

  <!-- Slot 1 Framing Accents -->
  <rect x="64" y="64" width="1072" height="712" rx="16" fill="none" stroke="url(#goldGrad)" stroke-width="2" opacity="0.6"/>
  <!-- Corner corner flourishes for Slot 1 -->
  <path d="M 56 100 L 56 56 L 100 56" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>
  <path d="M 1144 100 L 1144 56 L 1100 56" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>
  <path d="M 56 740 L 56 784 L 100 784" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>
  <path d="M 1144 740 L 1144 784 L 1100 784" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>

  <!-- Slot 2 Framing Accents -->
  <rect x="64" y="824" width="1072" height="712" rx="16" fill="none" stroke="url(#goldGrad)" stroke-width="2" opacity="0.6"/>
  <path d="M 56 860 L 56 816 L 100 816" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>
  <path d="M 1144 860 L 1144 816 L 1100 816" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>
  <path d="M 56 1500 L 56 1544 L 100 1544" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>
  <path d="M 1144 1500 L 1144 1544 L 1100 1544" fill="none" stroke="url(#goldGrad)" stroke-width="4"/>

  <!-- Bottom Wedding Banner Decor -->
  <g transform="translate(600, 1660)" text-anchor="middle">
    <!-- Floral Laurel Leaves -->
    <path d="M -160 -10 C -120 -30, -70 -20, -40 0 C -70 20, -120 30, -160 10 Z" fill="url(#goldGrad)" opacity="0.8"/>
    <path d="M 160 -10 C 120 -30, 70 -20, 40 0 C 70 20, 120 30, 160 10 Z" fill="url(#goldGrad)" opacity="0.8"/>
    <circle cx="0" cy="0" r="6" fill="url(#goldGrad)"/>
    <text y="-25" font-family="'Playfair Display', Georgia, serif" font-size="34" font-weight="bold" fill="url(#goldGrad)" letter-spacing="4">THE WEDDING OF</text>
    <text y="22" font-family="'Great Vibes', 'Brush Script MT', cursive" font-size="48" fill="#FFFFFF" letter-spacing="2">Bayu &amp; Irma</text>
    <text y="58" font-family="'Inter', sans-serif" font-size="18" font-weight="600" fill="url(#goldGrad)" letter-spacing="6">SETIAP MOMEN BERARTI</text>
  </g>
</svg>`,
  },
  {
    id: 'tpl_retro_film_strip',
    name: 'Retro Film Photo Strip',
    category: 'Strip Klasik (2×6")',
    ratio: '2:6',
    formatLabel: 'Photo Strip (2×6")',
    slots: 3,
    width: 600,
    height: 1800,
    badgeColor: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
    accentColor: '#818CF8',
    previewGradient: 'from-indigo-950/40 via-neutral-900 to-black',
    description: 'Desain strip film 35mm analog klasik dengan 3 pose berurutan, gaya favorit photobox Korea.',
    svgOverlay: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1800" viewBox="0 0 600 1800">
  <!-- Classic Dark Film Border Base -->
  <rect x="0" y="0" width="600" height="1800" fill="none"/>
  <rect x="12" y="12" width="576" height="1776" rx="16" fill="none" stroke="#22252C" stroke-width="12"/>

  <!-- Left Sprocket Holes -->
  <g fill="#1A1D24">
    <rect x="16" y="80" width="16" height="24" rx="4"/>
    <rect x="16" y="180" width="16" height="24" rx="4"/>
    <rect x="16" y="280" width="16" height="24" rx="4"/>
    <rect x="16" y="380" width="16" height="24" rx="4"/>
    <rect x="16" y="480" width="16" height="24" rx="4"/>
    <rect x="16" y="580" width="16" height="24" rx="4"/>
    <rect x="16" y="680" width="16" height="24" rx="4"/>
    <rect x="16" y="780" width="16" height="24" rx="4"/>
    <rect x="16" y="880" width="16" height="24" rx="4"/>
    <rect x="16" y="980" width="16" height="24" rx="4"/>
    <rect x="16" y="1080" width="16" height="24" rx="4"/>
    <rect x="16" y="1180" width="16" height="24" rx="4"/>
    <rect x="16" y="1280" width="16" height="24" rx="4"/>
    <rect x="16" y="1380" width="16" height="24" rx="4"/>
    <rect x="16" y="1480" width="16" height="24" rx="4"/>
    <rect x="16" y="1580" width="16" height="24" rx="4"/>
  </g>

  <!-- Right Sprocket Holes -->
  <g fill="#1A1D24">
    <rect x="568" y="80" width="16" height="24" rx="4"/>
    <rect x="568" y="180" width="16" height="24" rx="4"/>
    <rect x="568" y="280" width="16" height="24" rx="4"/>
    <rect x="568" y="380" width="16" height="24" rx="4"/>
    <rect x="568" y="480" width="16" height="24" rx="4"/>
    <rect x="568" y="580" width="16" height="24" rx="4"/>
    <rect x="568" y="680" width="16" height="24" rx="4"/>
    <rect x="568" y="780" width="16" height="24" rx="4"/>
    <rect x="568" y="880" width="16" height="24" rx="4"/>
    <rect x="568" y="980" width="16" height="24" rx="4"/>
    <rect x="568" y="1080" width="16" height="24" rx="4"/>
    <rect x="568" y="1180" width="16" height="24" rx="4"/>
    <rect x="568" y="1280" width="16" height="24" rx="4"/>
    <rect x="568" y="1380" width="16" height="24" rx="4"/>
    <rect x="568" y="1480" width="16" height="24" rx="4"/>
    <rect x="568" y="1580" width="16" height="24" rx="4"/>
  </g>

  <!-- Frame 1 Border -->
  <rect x="48" y="48" width="504" height="490" rx="10" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.9"/>
  <!-- Frame 2 Border -->
  <rect x="48" y="560" width="504" height="490" rx="10" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.9"/>
  <!-- Frame 3 Border -->
  <rect x="48" y="1072" width="504" height="490" rx="10" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.9"/>

  <!-- Footer Branding -->
  <g transform="translate(300, 1660)" text-anchor="middle">
    <text y="-20" font-family="'Courier New', monospace" font-size="16" font-weight="bold" fill="#818CF8" letter-spacing="4">KODAK PORTRA 400</text>
    <text y="14" font-family="'Inter', sans-serif" font-size="24" font-weight="800" fill="#FFFFFF" letter-spacing="3">MINGLEBOOTH</text>
    <text y="42" font-family="'Inter', sans-serif" font-size="13" font-weight="500" fill="#94A3B8" letter-spacing="2">SEBUAH KENANG • 2026</text>
  </g>
</svg>`,
  },
  {
    id: 'tpl_minimal_modern',
    name: 'Minimalist Luxe Studio',
    category: 'Modern Minimalis',
    ratio: '4:5',
    formatLabel: '4R Portrait (4×6")',
    slots: 2,
    width: 1200,
    height: 1800,
    badgeColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    accentColor: '#34D399',
    previewGradient: 'from-emerald-950/40 via-neutral-900 to-black',
    description: 'Desain bersih kontemporer dengan garis putih presisi dan tipografi studio yang rapi.',
    svgOverlay: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
  <!-- Minimalist Outline -->
  <rect x="30" y="30" width="1140" height="1740" rx="20" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.8"/>
  <line x1="50" y1="1620" x2="1150" y2="1620" stroke="#FFFFFF" stroke-width="1.5" opacity="0.4"/>

  <!-- Inner Slots Highlights -->
  <rect x="54" y="54" width="1092" height="740" rx="14" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.6"/>
  <rect x="54" y="820" width="1092" height="740" rx="14" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.6"/>

  <!-- Footer Minimal Text -->
  <g transform="translate(600, 1690)" text-anchor="middle">
    <text y="-10" font-family="'Inter', system-ui, sans-serif" font-size="28" font-weight="800" fill="#FFFFFF" letter-spacing="8">STUDIO MEMORY</text>
    <text y="28" font-family="'Inter', system-ui, sans-serif" font-size="14" font-weight="400" fill="#A1A1AA" letter-spacing="4">JAKARTA • INDONESIA • 2026</text>
  </g>
</svg>`,
  },
  {
    id: 'tpl_birthday_neon',
    name: 'Sweet Birthday Celebration',
    category: 'Pesta Ulang Tahun',
    ratio: '4:5',
    formatLabel: '4R Portrait (4×6")',
    slots: 2,
    width: 1200,
    height: 1800,
    badgeColor: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
    accentColor: '#F472B6',
    previewGradient: 'from-pink-950/40 via-purple-950/30 to-black',
    description: 'Nuansa pesta penuh warna dengan aksen pita confetti dan bintang ceria.',
    svgOverlay: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800" viewBox="0 0 1200 1800">
  <defs>
    <linearGradient id="neonPink" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F472B6"/>
      <stop offset="50%" stop-color="#C084FC"/>
      <stop offset="100%" stop-color="#38BDF8"/>
    </linearGradient>
  </defs>
  <!-- Frame Border -->
  <rect x="24" y="24" width="1152" height="1752" rx="32" fill="none" stroke="url(#neonPink)" stroke-width="5"/>

  <!-- Confetti Stars -->
  <g fill="#F472B6" opacity="0.8">
    <circle cx="80" cy="80" r="8"/>
    <circle cx="1120" cy="80" r="8"/>
    <polygon points="100,120 106,136 122,136 110,146 114,162 100,152 86,162 90,146 78,136 94,136" fill="#FDE047"/>
    <polygon points="1100,120 1106,136 1122,136 1110,146 1114,162 1100,152 1086,162 1090,146 1078,136 1094,136" fill="#FDE047"/>
  </g>

  <!-- Slots -->
  <rect x="60" y="60" width="1080" height="720" rx="20" fill="none" stroke="url(#neonPink)" stroke-width="2" opacity="0.7"/>
  <rect x="60" y="820" width="1080" height="720" rx="20" fill="none" stroke="url(#neonPink)" stroke-width="2" opacity="0.7"/>

  <!-- Birthday Banner -->
  <g transform="translate(600, 1665)" text-anchor="middle">
    <text y="-25" font-family="'Arial Black', sans-serif" font-size="44" font-weight="900" fill="url(#neonPink)" letter-spacing="4">HAPPY BIRTHDAY!</text>
    <text y="25" font-family="'Inter', sans-serif" font-size="22" font-weight="700" fill="#FFFFFF" letter-spacing="3">CELEBRATE EVERY MOMENT ✨</text>
  </g>
</svg>`,
  },
  {
    id: 'tpl_pocket_wallet_2r',
    name: 'Pocket Mini Wallet (2R)',
    category: 'Mini Dompet (2R)',
    ratio: '4:5',
    formatLabel: '2R Mini (2×3")',
    slots: 1,
    width: 600,
    height: 900,
    badgeColor: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
    accentColor: '#38BDF8',
    previewGradient: 'from-cyan-950/40 via-neutral-900 to-black',
    description: 'Ukuran mini 2R ringkas pas di saku dompet, 1 jepretan fokus dengan gaya polaroid.',
    svgOverlay: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
  <rect x="16" y="16" width="568" height="868" rx="18" fill="none" stroke="#38BDF8" stroke-width="3" opacity="0.8"/>
  <rect x="36" y="36" width="528" height="660" rx="12" fill="none" stroke="#FFFFFF" stroke-width="2" opacity="0.6"/>

  <g transform="translate(300, 790)" text-anchor="middle">
    <text y="-10" font-family="'Great Vibes', cursive, serif" font-size="36" fill="#FFFFFF">Special Memory</text>
    <text y="30" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#38BDF8" letter-spacing="3">MINGLEBOOTH 2R WALLET</text>
  </g>
</svg>`,
  },
  {
    id: 'tpl_noir_strip_4',
    name: 'Monochrome Noir 4-Shot',
    category: 'Strip 4-Pose',
    ratio: '2:6',
    formatLabel: 'Photo Strip (2×6")',
    slots: 4,
    width: 600,
    height: 1800,
    badgeColor: 'text-neutral-300 bg-white/10 border-white/20',
    accentColor: '#FFFFFF',
    previewGradient: 'from-neutral-800 via-neutral-900 to-black',
    description: 'Format strip 4 pose vertikal monokrom hitam putih yang sangat digemari anak muda.',
    svgOverlay: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1800" viewBox="0 0 600 1800">
  <rect x="14" y="14" width="572" height="1772" rx="14" fill="none" stroke="#FFFFFF" stroke-width="2.5" opacity="0.9"/>
  <!-- 4 Slot Outlines -->
  <rect x="40" y="40" width="520" height="375" rx="8" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7"/>
  <rect x="40" y="440" width="520" height="375" rx="8" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7"/>
  <rect x="40" y="840" width="520" height="375" rx="8" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7"/>
  <rect x="40" y="1240" width="520" height="375" rx="8" fill="none" stroke="#FFFFFF" stroke-width="1.5" opacity="0.7"/>

  <!-- Footer Tag -->
  <g transform="translate(300, 1715)" text-anchor="middle">
    <text y="-10" font-family="'Inter', sans-serif" font-size="20" font-weight="900" fill="#FFFFFF" letter-spacing="6">PHOTOBOX NOIR</text>
    <text y="20" font-family="'Courier New', monospace" font-size="12" fill="#A1A1AA">SERIES 04 • 2026</text>
  </g>
</svg>`,
  },
];
