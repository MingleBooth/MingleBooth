const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BUILD_DIR = path.resolve(__dirname, '..', 'build');
const SRC_PNG = path.join(BUILD_DIR, 'icon.png');
const OUT_ICO = path.join(BUILD_DIR, 'icon.ico');

if (!fs.existsSync(SRC_PNG)) {
  console.error('Source icon.png not found at:', SRC_PNG);
  process.exit(1);
}

const SIZES = [16, 32, 48, 64, 128, 256];
const tmpDir = path.join(BUILD_DIR, '.tmp_ico');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

console.log('Generating multi-size PNGs for icon.ico...');
const images = [];

for (const size of SIZES) {
  const resizedPath = path.join(tmpDir, `icon_${size}.png`);
  execSync(`sips -z ${size} ${size} "${SRC_PNG}" --out "${resizedPath}"`, { stdio: 'pipe' });
  const data = fs.readFileSync(resizedPath);
  images.push({
    width: size === 256 ? 0 : size,
    height: size === 256 ? 0 : size,
    data,
  });
}

// Clean up temp pngs
fs.rmSync(tmpDir, { recursive: true, force: true });

// Build ICO file
// Header: 6 bytes
// Entries: images.length * 16 bytes
// Images follow entries
const headerSize = 6;
const entrySize = 16;
let offset = headerSize + (entrySize * images.length);

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type: 1 = Icon
header.writeUInt16LE(images.length, 4); // Count

const entries = [];
const dataBuffers = [];

for (const img of images) {
  const entry = Buffer.alloc(entrySize);
  entry.writeUInt8(img.width, 0);
  entry.writeUInt8(img.height, 1);
  entry.writeUInt8(0, 2); // Colors (0 = >8bpp)
  entry.writeUInt8(0, 3); // Reserved
  entry.writeUInt16LE(1, 4); // Planes
  entry.writeUInt16LE(32, 6); // Bit depth
  entry.writeUInt32LE(img.data.length, 8); // Size
  entry.writeUInt32LE(offset, 12); // Offset

  entries.push(entry);
  dataBuffers.push(img.data);
  offset += img.data.length;
}

const finalIco = Buffer.concat([header, ...entries, ...dataBuffers]);
fs.writeFileSync(OUT_ICO, finalIco);

console.log(`✅ Successfully generated ${OUT_ICO} (${(finalIco.length / 1024).toFixed(1)} KB)`);
