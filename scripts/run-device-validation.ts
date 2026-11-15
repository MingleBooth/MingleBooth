import { execSync } from 'child_process';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';

const ADB = '/Users/adityaputra/Library/Android/sdk/platform-tools/adb';
const ARTIFACT_DIR = '/Users/adityaputra/.gemini/antigravity-ide/brain/d6d9fccf-3565-4240-ac31-f19d62e5b20d';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function adbExec(cmd: string): string {
  try {
    return execSync(`${ADB} ${cmd}`, { encoding: 'utf-8' });
  } catch (err: any) {
    return err.stdout?.toString() || err.message;
  }
}

function takeScreenshot(filename: string): string {
  const targetPath = path.join(ARTIFACT_DIR, filename);
  execSync(`${ADB} exec-out screencap -p > "${targetPath}"`);
  console.log(`[SCREENSHOT] Saved: ${filename}`);
  return targetPath;
}

class DevToolsClient {
  private ws: WebSocket | null = null;
  private messageId = 1;
  private pendingRequests = new Map<number, (res: any) => void>();

  async connect(): Promise<void> {
    const res = await fetch('http://localhost:9222/json');
    const targets = await res.json();
    const wsUrl = targets[0]?.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error('No webSocketDebuggerUrl found in devtools');

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('message', (raw: string) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.id && this.pendingRequests.has(msg.id)) {
            const cb = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);
            cb(msg.result);
          }
        } catch (e) {
          console.error('Error parsing devtools msg:', e);
        }
      });
      this.ws.on('error', reject);
    });
  }

  async eval(expression: string): Promise<any> {
    if (!this.ws) throw new Error('Devtools not connected');
    const id = this.messageId++;
    return new Promise((resolve) => {
      this.pendingRequests.set(id, (result) => {
        resolve(result?.result?.value);
      });
      this.ws!.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true }
        })
      );
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function run() {
  console.log('================================================================');
  console.log('STARTING TARGETED 1:1 ANDROID EMULATOR VALIDATION');
  console.log('================================================================');

  const client = new DevToolsClient();
  await client.connect();

  // Ensure any dialog is closed
  await client.eval(`
    const modalClose = document.querySelector('button.absolute.top-5.right-5');
    if (modalClose) modalClose.click();
  `);
  await sleep(400);

  // 1. TAB BINGKAI
  console.log('\n--> Validating Tab: Bingkai');
  await client.eval(`document.querySelector('button[title="Bingkai"]')?.click()`);
  await sleep(600);
  takeScreenshot('actual_device_tab_bingkai.png');

  // 2. TAB ACARA
  console.log('\n--> Validating Tab: Acara');
  await client.eval(`document.querySelector('button[title="Acara"]')?.click()`);
  await sleep(600);
  takeScreenshot('actual_device_tab_acara.png');

  // 3. TAB KAMERA
  console.log('\n--> Validating Tab: Kamera');
  await client.eval(`document.querySelector('button[title="Kamera"]')?.click()`);
  await sleep(600);
  takeScreenshot('actual_device_tab_kamera.png');

  // 4. TAB FOTO
  console.log('\n--> Validating Tab: Foto');
  await client.eval(`document.querySelector('button[title="Foto"]')?.click()`);
  await sleep(600);
  takeScreenshot('actual_device_tab_foto.png');

  // 5. TAB STANDBY
  console.log('\n--> Validating Tab: Standby');
  await client.eval(`document.querySelector('button[title="Standby"]')?.click()`);
  await sleep(600);
  takeScreenshot('actual_device_tab_standby.png');

  // 6. MODAL WALLPAPER STANDBY
  console.log('\n--> Opening Standby Wallpaper Modal');
  await client.eval(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pilih Wallpaper'));
    if (btn) btn.click();
  `);
  await sleep(800);
  takeScreenshot('actual_device_modal_wallpaper.png');

  // Select Apartemen wallpaper and click Simpan Perubahan
  console.log('--> Selecting Apartemen and saving');
  await client.eval(`
    const el = Array.from(document.querySelectorAll('div, label')).find(e => e.textContent.includes('Apartemen'));
    if (el) el.click();
  `);
  await sleep(400);
  await client.eval(`
    const save = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Simpan'));
    if (save) save.click();
  `);
  await sleep(600);
  takeScreenshot('actual_device_standby_saved.png');

  // 7. KIOSK MODE: TAP "Mulai Sesi Photobooth"
  console.log('\n--> Entering Kiosk Mode: Mulai Sesi Photobooth');
  await client.eval(`
    const start = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Mulai Sesi Photobooth'));
    if (start) start.click();
  `);
  await sleep(1000);
  takeScreenshot('actual_device_kiosk_ready.png');

  // 8. TRIGGER SHUTTER IN KIOSK
  console.log('--> Triggering photo capture shutter');
  await client.eval(`
    const shutter = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sentuh Layar') || b.textContent.includes('Mulai'));
    if (shutter) shutter.click();
  `);
  await sleep(1200);
  takeScreenshot('actual_device_kiosk_countdown.png');

  // Wait for 3-pose photo sequence and review modal
  console.log('--> Waiting for capture sequence to finish...');
  await sleep(9500);
  takeScreenshot('actual_device_review_modal.png');

  // 9. RETURN TO SETUP VIEW (ESC)
  console.log('\n--> Returning to Studio Setup (ESC)');
  await client.eval(`
    const escBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Pengaturan') || b.textContent.includes('ESC'));
    if (escBtn) {
      escBtn.click();
    } else {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    }
  `);
  await sleep(1000);
  takeScreenshot('actual_device_returned_setup.png');

  // 10. PORTRAIT ORIENTATION VALIDATION
  console.log('\n--> Validating Portrait Orientation');
  adbExec('shell settings put system user_rotation 0');
  await sleep(1500);
  takeScreenshot('actual_device_portrait_setup.png');

  // Rotate back to Landscape
  console.log('--> Restoring Landscape Orientation');
  adbExec('shell settings put system user_rotation 1');
  await sleep(1200);

  client.close();
  console.log('\n================================================================');
  console.log('DEVICE VALIDATION FINISHED SUCCESSFULLY');
  console.log('================================================================');
}

run().catch(err => {
  console.error('Error during validation:', err);
  process.exit(1);
});
