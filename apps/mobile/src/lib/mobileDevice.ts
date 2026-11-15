import { nanoid } from 'nanoid';

export interface MobileDeviceInfo {
  hwid: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'ipados' | 'web';
  isTablet: boolean;
  userAgent: string;
}

const HWID_STORAGE_KEY = 'mb_mobile_hwid';
const DEVICE_NAME_KEY = 'mb_mobile_device_name';

// In-memory cache ensures HWID never fluctuates within the same app session
let memoryCachedHwid: string | null = null;

export function getMobileDeviceInfo(): MobileDeviceInfo {
  if (typeof window === 'undefined') {
    return {
      hwid: 'server_env',
      deviceName: 'Unknown Server',
      platform: 'web',
      isTablet: false,
      userAgent: '',
    };
  }

  // 1. Get or create persistent Hardware ID (HWID)
  let hwid = memoryCachedHwid;

  if (!hwid || hwid.trim() === '' || hwid === 'undefined' || hwid === 'null') {
    try {
      hwid = localStorage.getItem(HWID_STORAGE_KEY);
    } catch (readErr) {
      console.warn('[mobileDevice] Failed to read HWID from localStorage:', readErr);
    }
  }

  if (!hwid || hwid.trim() === '' || hwid === 'undefined' || hwid === 'null') {
    hwid = `mob_${nanoid(16)}`;
    try {
      localStorage.setItem(HWID_STORAGE_KEY, hwid);
    } catch (writeErr) {
      console.warn('[mobileDevice] Failed to persist HWID to localStorage:', writeErr);
    }
  }

  // Cache in memory to guarantee stability
  memoryCachedHwid = hwid;

  // 2. Detect platform & form-factor
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIPhone = /iphone/i.test(ua);

  let platform: 'android' | 'ios' | 'ipados' | 'web' = 'web';
  let isTablet = false;

  if (isIPad) {
    platform = 'ipados';
    isTablet = true;
  } else if (isIPhone) {
    platform = 'ios';
    isTablet = false;
  } else if (isAndroid) {
    platform = 'android';
    // Android tablets typically don't have 'Mobile' in their userAgent or have wider screen
    const isAndroidTablet = !/mobile/i.test(ua) || Math.min(window.screen.width, window.screen.height) >= 600;
    isTablet = isAndroidTablet;
  }

  // 3. User friendly device name
  let defaultDeviceName = 'Mobile Photobooth';
  if (platform === 'ipados') defaultDeviceName = 'Apple iPad';
  else if (platform === 'ios') defaultDeviceName = 'Apple iPhone';
  else if (platform === 'android' && isTablet) defaultDeviceName = 'Android Tablet';
  else if (platform === 'android') defaultDeviceName = 'Android Phone';

  let storedName = defaultDeviceName;
  try {
    storedName = localStorage.getItem(DEVICE_NAME_KEY) || defaultDeviceName;
  } catch {}

  return {
    hwid,
    deviceName: storedName,
    platform,
    isTablet,
    userAgent: ua,
  };
}

export function ensureValidHwid(): string {
  const info = getMobileDeviceInfo();
  if (!info.hwid || info.hwid.trim() === '') {
    throw new Error('Gagal menghasilkan Sidik Jari Hardware (HWID) perangkat.');
  }
  return info.hwid;
}

export function setCustomDeviceName(name: string): void {
  if (typeof window !== 'undefined' && name.trim()) {
    try {
      localStorage.setItem(DEVICE_NAME_KEY, name.trim());
    } catch {}
  }
}
