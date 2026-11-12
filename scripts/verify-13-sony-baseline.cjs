const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASELINE_13 = {
  'apps/desktop/electron/backends/sony-camera-backend.cjs': '4e4d840ee1fa255284e15cb2a65983449df3db2b1d4b9311ae06621d1aa69bac',
  'apps/desktop/electron/native/windows/sony_camera_runner_win.cpp': 'c86249dd1fa5bfd9596c9af732621fb0175116225092af10f069ae4fe0b22403',
  'apps/desktop/electron/native/sony_camera_runner.cpp': '53ee8fb24d9502eb9ce21d2ccb91bb6e79f45270aaf272d6d8200eeb0f292290',
  'apps/desktop/electron/native/sony_camera_hub.c': '780bc4b48023408c71eee5f4b05647ba15e24c251601c89dd6a0d2506c1cdbf7',
  'apps/mobile/android/app/src/main/java/com/minglebooth/mobile/plugins/SonyPtpDriver.java': 'ba80d86b57a8d9ac1471090fdcf23be1d4a861b56d51678105085f42d5cc5b18',
  'apps/mobile/android/app/src/main/java/com/minglebooth/mobile/plugins/SonyDirectCameraPlugin.java': 'b874cfa1b1d966e95091c8cab621ebab4db3219895285157f96d5698c4bd68cb',
  'apps/desktop/electron/bin/sony_camera_hub': '8cd2a7a3020d7efec187c5b16529bf3898cf5415d2e93a0362678e610dcc4931',
  'apps/desktop/electron/bin/mac/sony_camera_runner': '0ed7c584a827fadcc4f6bb5eea74f2e80cb1b2bdac476bd99cdfabd8af09175f',
  'apps/desktop/electron/native/windows/sony_camera_runner.exe': '76869604b8c2da4ac9237a4a06625ff0aec4c36d2567c703a8f1ae6e3742d746',
  'apps/desktop/electron/native/windows/sony_camera_runner_win.exe': '76869604b8c2da4ac9237a4a06625ff0aec4c36d2567c703a8f1ae6e3742d746',
  'apps/desktop/electron/bin/win/gphoto2.exe': '679f333c9bdc40435acad19866110cd1acd6d5c7444fc01154af97d8f1b0d13d',
  'apps/desktop/electron/bin/win/camlibs/canon.dll': '7cfe31317f16ed42aafcca6e1aa69e89aa0356164d11086499e164d6a042e55a',
  'apps/desktop/electron/bin/win/camlibs/ptp2.dll': 'c0257aceba8553c725b2f51ef0b20d581bc6bfd75d5b9f71e7bd330da0381df8'
};

let allMatch = true;
let i = 1;
const results = [];
for (const [file, expectedHash] of Object.entries(BASELINE_13)) {
  const fullPath = path.resolve(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) {
    results.push({ num: i, file, status: 'MISSING', actual: 'N/A', match: false });
    allMatch = false;
  } else {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
    const match = actual === expectedHash;
    if (!match) allMatch = false;
    results.push({ num: i, file, status: match ? 'MATCH' : 'MISMATCH', actual, match });
  }
  i++;
}

console.log('========================================================================');
console.log('   MINGLEBOOTH SONY & NATIVE CAMERA BASELINE INTEGRITY (13/13)          ');
console.log('========================================================================');
for (const r of results) {
  console.log(`[${r.num.toString().padStart(2, '0')}] ${r.match ? '✅ MATCH' : '❌ ' + r.status}: ${r.file}`);
  console.log(`     SHA-256: ${r.actual}`);
}
console.log('========================================================================');
console.log(`RESULT: ALL 13 FILES VERIFIED BYTE-FOR-BYTE IDENTICAL: ${allMatch}`);
console.log('========================================================================');

