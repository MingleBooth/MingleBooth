import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    'import.meta.env.VITE_TEST_ISOLATION_MODE': JSON.stringify(
      process.env.VITE_TEST_ISOLATION_MODE || ''
    ),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@minglebooth/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@minglebooth/photo-engine': path.resolve(__dirname, '../../packages/photo-engine/src'),
      '@minglebooth/camera': path.resolve(__dirname, '../../packages/camera/src'),
      '@minglebooth/sync-engine': path.resolve(__dirname, '../../packages/sync-engine/src'),
      '@minglebooth/gif-engine': path.resolve(__dirname, '../../packages/gif-engine/src'),
      '@minglebooth/event-core': path.resolve(__dirname, '../../packages/event-core/src'),
      '@minglebooth/license': path.resolve(__dirname, '../../packages/license/src'),
      '@minglebooth/template-engine': path.resolve(__dirname, '../../packages/template-engine/src'),
    },
  },
  server: {
    port: 5174,
    host: '0.0.0.0', // Memungkinkan akses live testing dari tablet / ponsel di jaringan WiFi yang sama
    cors: true,
    allowedHosts: true, // Memungkinkan tunnel ngrok / domain eksternal
  },
});
