/**
 * MingleBooth Official Application Release & Distribution Constants
 * Single source of truth for downloadable client artifacts across Web, Dashboard, and Tablet pages.
 */

export interface DownloadAsset {
  id: 'windows' | 'macos' | 'android';
  platform: 'windows' | 'macos' | 'android';
  title: string;
  badge: string;
  filename: string;
  size: string;
  sha256: string;
  downloadUrl: string;
  targetOS: string;
  compatibility: string;
  buttonText: string;
  description: string;
}

export interface InstallationStep {
  step: number;
  title: string;
  summary: string;
  description: string;
  callout?: {
    type: 'info' | 'warning' | 'tip';
    title: string;
    text: string;
  };
}

export const RELEASE_VERSION = 'v1.0.0-rc.4';
export const RELEASE_DATE = '15 November 2026';

export const DOWNLOAD_ASSETS: Record<'windows' | 'macos' | 'android', DownloadAsset> = {
  windows: {
    id: 'windows',
    platform: 'windows',
    title: 'MingleBooth Studio Windows',
    badge: 'EXE · Windows',
    filename: 'MingleBooth-Studio-Setup-1.0.0-rc.4.exe',
    size: '131.72 MB',
    sha256: '17c32d95e1dd26e322ae26828e33f0f04fffb2d66dc0507a0e338b389af557c6',
    downloadUrl:
      process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL &&
      !process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL.includes('drive.google.com')
        ? process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL
        : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-Setup-1.0.0-rc.4.exe',
    targetOS: 'Windows 10 & Windows 11 (64-bit)',
    compatibility: 'Sony Alpha USB SDK, DirectShow Webcam, Printer Thermal & Dye-Sub (DNP, HiTi, Citizen)',
    buttonText: 'Unduh untuk Windows (.exe)',
    description:
      'Installer resmi Windows dengan wizard otomatis, driver USB Sony Alpha, dan integrasi printer cetak instan.',
  },
  macos: {
    id: 'macos',
    platform: 'macos',
    title: 'MingleBooth Studio macOS',
    badge: 'DMG · macOS',
    filename: 'MingleBooth-Studio-1.0.0-rc.4.dmg',
    size: '143.23 MB',
    sha256: '7d33e1e52bc92bfd33643225f3d48620dd46f0e3116a84e2bd71e1659736e921',
    downloadUrl:
      process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL &&
      !process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL.includes('drive.google.com')
        ? process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL
        : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-1.0.0-rc.4.dmg',
    targetOS: 'macOS 12.0+ (Monterey, Ventura, Sonoma, Sequoia)',
    compatibility: 'Universal Binary: Apple Silicon (M1/M2/M3/M4) & Intel 64-bit',
    buttonText: 'Unduh untuk macOS (.dmg)',
    description:
      'Installer disk image universal resmi untuk MacBook dan Mac Studio. Kompatibel penuh dengan arsitektur ARM & Intel.',
  },
  android: {
    id: 'android',
    platform: 'android',
    title: 'MingleBooth Studio Android',
    badge: 'APK · Android',
    filename: 'MingleBooth-Studio-1.0.0-rc.4.apk',
    size: '6.61 MB',
    sha256: '81579cda6970e54a4d26e6745c13e0480ec29a70eb389b260d66948d5a7d76e1',
    downloadUrl:
      process.env.NEXT_PUBLIC_DOWNLOAD_APK_URL &&
      !process.env.NEXT_PUBLIC_DOWNLOAD_APK_URL.includes('drive.google.com')
        ? process.env.NEXT_PUBLIC_DOWNLOAD_APK_URL
        : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-1.0.0-rc.4.apk',
    targetOS: 'Android 8.0 Oreo ke atas (ARM64 & ARMv7)',
    compatibility: 'Sony PC Remote PTP via USB OTG, Thermal Printing ESC/POS, Tablet Kiosk',
    buttonText: 'Unduh untuk Android (APK)',
    description:
      'Aplikasi native tablet & mobile photobooth dengan dukungan USB OTG Host untuk kamera Sony dan printer thermal.',
  },
};

export const DOWNLOAD_ASSETS_LIST: DownloadAsset[] = [
  DOWNLOAD_ASSETS.windows,
  DOWNLOAD_ASSETS.macos,
  DOWNLOAD_ASSETS.android,
];

export const INSTALLATION_STEPS: Record<'windows' | 'macos' | 'android', InstallationStep[]> = {
  windows: [
    {
      step: 1,
      title: 'Unduh Installer Resmi',
      summary: 'Dapatkan file executable resmi dari portal distribusi MingleBooth.',
      description:
        'Klik tombol "Unduh untuk Windows (.exe)" di atas untuk mengunduh MingleBooth-Studio-Setup-1.0.0-rc.4.exe langsung dari repositori rilis resmi.',
    },
    {
      step: 2,
      title: 'Verifikasi & Dialog Microsoft Edge',
      summary: 'Periksa reputasi unduhan dan pastikan sumber domain tepercaya.',
      description:
        'Jika Microsoft Edge menampilkan notifikasi "This file isn\'t commonly downloaded", pastikan file berasal dari domain resmi (minglebooth.id) dan bandingkan SHA-256 checksum jika perlu. Klik ikon menu titik tiga (...) pada item unduhan, pilih Keep (Simpan) > klik Show more (Tampilkan lebih banyak) > lalu klik Keep anyway (Tetap simpan).',
      callout: {
        type: 'info',
        title: 'Mekanisme Keamanan Windows',
        text: 'Peringatan reputasi adalah filter standar Microsoft Defender SmartScreen untuk file versi rilis terbaru yang baru didistribusikan. Jangan pernah mematikan Defender atau SmartScreen secara global.',
      },
    },
    {
      step: 3,
      title: 'Buka File Explorer Downloads',
      summary: 'Arahkan ke folder penyimpanan lokal tempat file disimpan.',
      description:
        'Buka File Explorer pada Windows Anda (tombol Windows + E) dan masuk ke folder Downloads untuk menemukan file installer yang telah selesai diunduh.',
    },
    {
      step: 4,
      title: 'Buka Blokir Keamanan File (Unblock)',
      summary: 'Hilangkan proteksi Mark of the Web pada properti file.',
      description:
        'Jika Windows memblokir file unduhan internet dengan pesan izin akses, klik kanan pada file MingleBooth-Studio-Setup-1.0.0-rc.4.exe > pilih Properties > pada tab General bagian bawah (Security), centang kotak "Unblock" (Buka Blokir) > klik Apply lalu OK.',
      callout: {
        type: 'tip',
        title: 'Mengapa opsi Unblock diperlukan?',
        text: 'Windows memberikan penanda keamanan (Zone.Identifier = 3) untuk file executable dari internet. Membuka blokir pada properti file adalah prosedur resmi Windows yang aman dan tidak mematikan proteksi sistem.',
      },
    },
    {
      step: 5,
      title: 'Jalankan Installer',
      summary: 'Mulai proses pemasangan dengan hak akses yang sesuai.',
      description:
        'Klik dua kali pada file installer untuk memulai wizard penyiapan MingleBooth Studio. Jika muncul dialog konfirmasi User Account Control (UAC), pilih Yes.',
    },
    {
      step: 6,
      title: 'Ikuti Proses Instalasi',
      summary: 'Selesaikan instalasi folder dan komponen runtime.',
      description:
        'Ikuti langkah-langkah di layar wizard: pilih direktori pemasangan dan tunggu hingga proses ekstraksi serta registrasi komponen selesai, lalu klik Finish.',
    },
    {
      step: 7,
      title: 'Buka MingleBooth Studio',
      summary: 'Luncurkan aplikasi dari pintasan sistem.',
      description:
        'Buka MingleBooth Studio melalui shortcut di Desktop atau dari menu Start Windows. Aplikasi akan membuka layar splash dan memeriksa lingkungan runtime sistem.',
    },
    {
      step: 8,
      title: 'Login Menggunakan Akun Vendor',
      summary: 'Masuk dengan kredensial vendor yang telah terdaftar.',
      description:
        'Masukkan alamat email dan kata sandi akun vendor MingleBooth Anda pada jendela login. Studio akan memuat profil studio dan daftar event yang telah Anda buat di web.',
    },
    {
      step: 9,
      title: 'Aktivasi Lisensi Sesuai Paket',
      summary: 'Validasi lisensi aktif dan sinkronisasi kuota perangkat.',
      description:
        'Setelah login berhasil, sistem secara otomatis memvalidasi status langganan organisasi vendor Anda (Starter, Pro, atau Business) serta mendaftarkan laptop ini ke dalam kuota perangkat aktif.',
    },
    {
      step: 10,
      title: 'Hubungkan Kamera & Uji Pengoperasian',
      summary: 'Sambungkan hardware kamera Sony mirrorless dan uji alur potret.',
      description:
        'Hubungkan kamera Sony Alpha via kabel USB dengan mode PC Remote (atau gunakan webcam), nyalakan kamera, dan periksa live view di layar Studio. Lakukan satu kali uji jepret (test capture) dan cetak foto untuk memastikan kesiapan acara.',
    },
  ],
  macos: [
    {
      step: 1,
      title: 'Unduh File DMG',
      summary: 'Dapatkan disk image universal untuk platform macOS.',
      description:
        'Klik tombol "Unduh untuk macOS (.dmg)" untuk mengunduh MingleBooth-Studio-1.0.0-rc.4.dmg. Paket installer ini mendukung arsitektur Apple Silicon (M1/M2/M3/M4) serta Mac berbasis Intel.',
    },
    {
      step: 2,
      title: 'Buka File DMG',
      summary: 'Pasang volume virtual disk image pada Finder.',
      description:
        'Buka folder Downloads di Mac Anda dan klik dua kali file MingleBooth-Studio-1.0.0-rc.4.dmg. Jendela disk image virtual akan terbuka di layar desktop.',
    },
    {
      step: 3,
      title: 'Drag MingleBooth Studio ke Applications',
      summary: 'Salin aplikasi ke folder aplikasi sistem macOS.',
      description:
        'Tarik (drag and drop) ikon MingleBooth Studio ke pintasan folder Applications yang ada di dalam jendela installer. Tunggu proses penyalinan selesai.',
    },
    {
      step: 4,
      title: 'Buka Aplikasi dari Applications',
      summary: 'Luncurkan MingleBooth Studio dari Finder atau Launchpad.',
      description:
        'Buka Finder > Applications (atau tekan Command + Spasi dan ketik "MingleBooth Studio") lalu klik aplikasi untuk membukanya.',
    },
    {
      step: 5,
      title: 'Konfirmasi Keamanan Gatekeeper (Jika Diminta)',
      summary: 'Gunakan prosedur resmi pembukaan aplikasi terverifikasi.',
      description:
        'Jika macOS menampilkan pemberitahuan bahwa aplikasi berasal dari pengembang pihak ketiga, klik kanan (atau Control-klik) pada ikon MingleBooth Studio di folder Applications > pilih Open (Buka) > lalu klik tombol Open pada jendela dialog konfirmasi yang muncul.',
      callout: {
        type: 'info',
        title: 'Status Keamanan macOS Gatekeeper',
        text: 'Langkah klik kanan > Open adalah prosedur standar resmi macOS untuk menyetujui pembukaan aplikasi studio photobooth tanpa menonaktifkan System Integrity Protection (SIP) atau Gatekeeper.',
      },
    },
    {
      step: 6,
      title: 'Login Akun Vendor',
      summary: 'Autentikasi akun studio vendor Anda.',
      description:
        'Masukkan email dan kata sandi vendor MingleBooth Anda pada dialog login yang muncul saat aplikasi pertama kali dijalankan.',
    },
    {
      step: 7,
      title: 'Aktivasi Lisensi & Kuota Perangkat',
      summary: 'Sistem memverifikasi hak akses paket langganan Anda.',
      description:
        'Sistem akan mencatat Mac ini ke dalam slot lisensi aktif organisasi Anda sesuai paket langganan (Starter: 1, Pro: 3, Business: 10 perangkat).',
    },
    {
      step: 8,
      title: 'Hubungkan Kamera & Uji Capture',
      summary: 'Verifikasi koneksi kamera Sony dan penangkapan gambar.',
      description:
        'Sambungkan kamera Sony ke port Thunderbolt/USB-C Mac Anda, atur koneksi kamera ke mode PC Remote, dan uji live view serta pengambilan foto di layar studio.',
    },
  ],
  android: [
    {
      step: 1,
      title: 'Unduh APK Resmi',
      summary: 'Simpan file paket APK MingleBooth Studio ke tablet.',
      description:
        'Buka browser Chrome di tablet atau smartphone Android Anda dan klik tombol "Unduh untuk Android (APK)" untuk mengunduh MingleBooth-Studio-1.0.0-rc.4.apk.',
    },
    {
      step: 2,
      title: 'Buka File APK',
      summary: 'Buka file dari panel notifikasi atau File Manager.',
      description:
        'Setelah unduhan selesai, ketuk notifikasi unduhan atau buka aplikasi File Manager / Files > folder Downloads > ketuk file APK yang baru diunduh.',
    },
    {
      step: 3,
      title: 'Izinkan Instalasi Khusus Browser Ini',
      summary: 'Beri izin pemasangan hanya untuk aplikasi browser yang aktif.',
      description:
        'Jika sistem Android menampilkan pesan keamanan "For your security, your phone is not allowed to install unknown apps from this source", ketuk Settings (Pengaturan) > aktifkan sakelar "Allow from this source" (Izinkan dari sumber ini) khusus untuk aplikasi browser yang Anda gunakan saat ini.',
      callout: {
        type: 'tip',
        title: 'Keamanan Android',
        text: 'Jangan pernah menonaktifkan verifikasi keamanan Android secara menyeluruh. Cukup izinkan sumber spesifik (misal browser Chrome) untuk file paket yang Anda unduh dari situs resmi MingleBooth.',
      },
    },
    {
      step: 4,
      title: 'Lanjutkan Proses Instalasi',
      summary: 'Pasang aplikasi MingleBooth Studio ke tablet.',
      description:
        'Ketuk tombol kembali (Back) untuk kembali ke jendela installer, kemudian ketuk Install (Pasang). Tunggu beberapa detik hingga proses pemasangan selesai.',
    },
    {
      step: 5,
      title: 'Buka MingleBooth Studio',
      summary: 'Jalankan aplikasi native tablet photobooth.',
      description:
        'Setelah instalasi selesai, ketuk Open (Buka) atau cari ikon MingleBooth Studio di layar utama/app drawer tablet Anda.',
    },
    {
      step: 6,
      title: 'Login Akun Vendor',
      summary: 'Masuk dengan kredensial vendor MingleBooth Anda.',
      description:
        'Masukkan email dan kata sandi akun vendor Anda untuk menyinkronkan profil, daftar event photobooth, dan pengaturan watermark/template strip.',
    },
    {
      step: 7,
      title: 'Aktivasi Lisensi Sesi Tablet',
      summary: 'Hubungkan tablet ke kuota perangkat organisasi.',
      description:
        'Sistem akan memvalidasi kuota perangkat vendor dan mengaktifkan fitur operasional penuh photobooth pada tablet.',
    },
    {
      step: 8,
      title: 'Uji Koneksi Kamera USB OTG & Photobooth',
      summary: 'Sambungkan Sony PC Remote via kabel OTG Host.',
      description:
        'Hubungkan kabel adaptor USB OTG Host ke tablet, sambungkan kamera Sony Alpha (mode PC Remote PTP), dan berikan izin akses USB pada dialog popup Android untuk memulai live view dan operasional booth.',
    },
  ],
};

export const LICENSE_TIERS = [
  {
    tier: 'Starter',
    quota: '1 Perangkat Booth',
    description: 'Cocok untuk vendor rintisan atau operasional 1 stan photobooth tunggal.',
  },
  {
    tier: 'Pro',
    quota: '3 Perangkat Booth',
    description: 'Untuk vendor aktif dengan beberapa stan photobooth simultan di lokasi berbeda.',
  },
  {
    tier: 'Business',
    quota: '10 Perangkat Booth',
    description: 'Solusi enterprise vendor dengan armada stan photobooth besar dan event paralel berskala masif.',
  },
];
