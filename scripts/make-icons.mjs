/*
 * Regenerates icons/*.png without any dependency: a 128 px design (rounded
 * square + check) drawn by supersampling, then encoded as RGBA PNG.
 *
 *   npm run icons
 *
 * The output is deterministic, so re-running it produces no diff unless the
 * design changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const table = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = pixels[i];
      raw[o++] = pixels[i + 1];
      raw[o++] = pixels[i + 2];
      raw[o++] = pixels[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const BG = [0x24, 0x40, 0x5e];
const FG = [0xff, 0xff, 0xff];

function insideRoundRect(x, y, cx, cy, half, radius) {
  const dx = Math.abs(x - cx) - (half - radius);
  const dy = Math.abs(y - cy) - (half - radius);
  if (dx <= 0 && dy <= 0) return true;
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return ox * ox + oy * oy <= radius * radius;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const S = size / 128;
  const half = size / 2;
  const radius = 26 * S;
  const thickness = 13 * S;
  const pts = [
    [34 * S, 68 * S],
    [56 * S, 90 * S],
    [94 * S, 42 * S]
  ];
  const samples = 4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px1 = x + (sx + 0.5) / samples;
          const py1 = y + (sy + 0.5) / samples;
          if (!insideRoundRect(px1, py1, half, half, half - 0.5, radius)) continue;
          bg++;
          const d = Math.min(
            distToSegment(px1, py1, pts[0][0], pts[0][1], pts[1][0], pts[1][1]),
            distToSegment(px1, py1, pts[1][0], pts[1][1], pts[2][0], pts[2][1])
          );
          if (d <= thickness / 2) fg++;
        }
      }
      const total = samples * samples;
      const i = (y * size + x) * 4;
      const aBg = bg / total;
      const aFg = fg / total;
      const r = BG[0] * (1 - aFg / Math.max(aBg, 1e-6)) + FG[0] * (aFg / Math.max(aBg, 1e-6));
      const g = BG[1] * (1 - aFg / Math.max(aBg, 1e-6)) + FG[1] * (aFg / Math.max(aBg, 1e-6));
      const b = BG[2] * (1 - aFg / Math.max(aBg, 1e-6)) + FG[2] * (aFg / Math.max(aBg, 1e-6));
      px[i] = Math.round(Math.min(255, r));
      px[i + 1] = Math.round(Math.min(255, g));
      px[i + 2] = Math.round(Math.min(255, b));
      px[i + 3] = Math.round(aBg * 255);
    }
  }
  return png(size, size, px);
}

const outDir = path.join(root, 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), draw(size));
}
console.log('icons written: ' + fs.readdirSync(outDir).join(', '));
