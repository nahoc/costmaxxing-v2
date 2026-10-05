import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { APP_ICON, type Grid } from "../../world/app-icon.ts";

const INK = [0x2e, 0x10, 0x65, 0xff];
const PAPER = [0xff, 0xff, 0xff, 0xff];

function png(grid: Grid, scale: number, origin: string): Buffer {
  const size = grid.length * scale;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ink = grid[Math.floor(y / scale)]![Math.floor(x / scale)];
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
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("tEXt", Buffer.from(`impeccable:prompt\0${origin}`, "latin1")),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const at = (path: string) => new URL(path, import.meta.url).pathname;
const outputs: [string, Grid, number][] = [
  ["../../extension/static/icons/16.png", APP_ICON.small(), 1],
  ["../../extension/static/icons/32.png", APP_ICON.small(), 2],
  ["../../extension/static/icons/48.png", APP_ICON.medium(), 2],
  ["../../extension/static/icons/128.png", APP_ICON.large(), 2],
  ["../../extension/store/icon-128.png", APP_ICON.large(), 2],
  ["../static/favicon.png", APP_ICON.small(), 2],
];
for (const [path, grid, scale] of outputs) {
  const size = grid.length * scale;
  writeFileSync(at(path), png(grid, scale, `costmaxxing app icon, ${size}x${size}, drawn by site/scripts/app-icon.ts in #2e1065 and white.`));
  console.log(path.replace(/^(\.\.\/)+/, ""));
}
