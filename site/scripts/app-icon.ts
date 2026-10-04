import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const GRID = 64;
const SCALE = 2;
const INK = [0x2e, 0x10, 0x65, 0xff];
const PAPER = [0xff, 0xff, 0xff, 0xff];

type Ink = "i" | "p" | undefined;
const cells: Ink[][] = Array.from({ length: GRID }, () => Array<Ink>(GRID).fill(undefined));
const set = (x: number, y: number, ink: Ink = "i") => {
  if (x >= 0 && y >= 0 && x < GRID && y < GRID) cells[y]![x] = ink;
};
const fill = (x0: number, y0: number, x1: number, y1: number, ink: Ink = "i") => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ink);
};
const frame = (x0: number, y0: number, x1: number, y1: number) => {
  fill(x0, y0, x1, y1, "p");
  fill(x0 + 1, y0, x1 - 1, y0);
  fill(x0 + 1, y1, x1 - 1, y1);
  fill(x0, y0 + 1, x0, y1 - 1);
  fill(x1, y0 + 1, x1, y1 - 1);
};
const dither = (x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, (x + y) % 2 === 0 ? "i" : "p");
};
const zebra = (x0: number, y0: number, x1: number, y1: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, (x + y) % 4 === 0 ? "p" : "i");
};

// shadow, body, base
fill(15, 10, 53, 50);
fill(17, 51, 51, 55);
frame(13, 8, 51, 48);
frame(15, 49, 49, 53);
dither(16, 50, 48, 52);
dither(14, 42, 50, 47);
fill(14, 41, 50, 41);
// screen bezel and screen
frame(18, 12, 46, 35);
frame(20, 14, 44, 33);
// bars: API price (zebra) over the two open-weight prices
frame(23, 16, 29, 30);
zebra(24, 17, 28, 29);
fill(31, 23, 35, 30);
fill(37, 27, 41, 30);
fill(22, 31, 42, 31);
// floppy slot and power light
fill(35, 38, 45, 38);
fill(36, 39, 45, 39, "p");
fill(19, 38, 21, 38);

const size = GRID * SCALE;
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const ink = cells[Math.floor(y / SCALE)]![Math.floor(x / SCALE)];
    if (ink) raw.set(ink === "i" ? INK : PAPER, y * (size * 4 + 1) + 1 + x * 4);
  }
}
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header.set([8, 6, 0, 0, 0], 8);
const out = process.argv[2] ?? new URL("../../extension/store/icon-128.png", import.meta.url).pathname;
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
console.log(out);
