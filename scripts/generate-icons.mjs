import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "icons");
mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [16, 48, 128];

const BG = [204, 0, 0, 255];
const BAR = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

function makePixels(size) {
  const pixels = new Uint8Array(size * size * 4);
  const radius = size / 2 - Math.max(1, Math.floor(size * 0.04));
  const center = (size - 1) / 2;

  const barCount = 3;
  const barWidthPx = Math.max(1, Math.round(size * 0.13));
  const barGapPx = Math.max(1, Math.round(size * 0.07));
  const totalBarsPx = barCount * barWidthPx + (barCount - 1) * barGapPx;
  const barStartX = Math.round((size - totalBarsPx) / 2);
  const barHeights = [0.45, 0.7, 0.55];
  const barBaseY = Math.round(size * 0.78);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - center;
      const dy = y - center;
      const inCircle = dx * dx + dy * dy <= radius * radius;

      let color = TRANSPARENT;
      if (inCircle) {
        color = BG;
        for (let b = 0; b < barCount; b++) {
          const bx = barStartX + b * (barWidthPx + barGapPx);
          const bh = Math.round(size * barHeights[b]);
          const by = barBaseY - bh;
          if (x >= bx && x < bx + barWidthPx && y >= by && y < barBaseY) {
            color = BAR;
            break;
          }
        }
      }
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = color[3];
    }
  }
  return pixels;
}

function crc32(buf) {
  let c;
  if (!crc32.table) {
    crc32.table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crc32.table[n] = c >>> 0;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crc32.table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0;
    raw.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of SIZES) {
  const pixels = makePixels(size);
  const png = encodePng(size, pixels);
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`Wrote ${file} (${png.length} bytes)`);
}
