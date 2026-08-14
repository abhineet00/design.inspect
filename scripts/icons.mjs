// Generates simple gradient app icons (no image deps) for the extension.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('extension/icons', { recursive: true });

function png(size) {
  const w = size, h = size;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter byte
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const t = (x + y) / (w + h);
      // diagonal gradient: blue -> green
      const r = Math.round(76 + t * (74 - 76));
      const g = Math.round(141 + t * (222 - 141));
      const b = Math.round(255 + t * (128 - 255));
      // rounded-corner alpha mask
      const rad = size * 0.22;
      const inside = corner(x, y, rad) && corner(w - 1 - x, y, rad) &&
        corner(x, h - 1 - y, rad) && corner(w - 1 - x, h - 1 - y, rad);
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = inside ? 255 : 0;
    }
  }
  function corner(x, y, rad) {
    if (x >= rad || y >= rad) return true;
    const dx = rad - x, dy = rad - y;
    return dx * dx + dy * dy <= rad * rad;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}

for (const s of [16, 48, 128]) {
  writeFileSync(`extension/icons/icon${s}.png`, png(s));
  console.log(`icon${s}.png`);
}
