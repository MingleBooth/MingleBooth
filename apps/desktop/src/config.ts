export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_URL ||
  (import.meta as any).env?.NEXT_PUBLIC_APP_URL ||
  'https://mingle-booth-web-omega.vercel.app';
