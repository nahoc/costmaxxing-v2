import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = "https://upload.wikimedia.org/wikipedia/commons/3/30/Wall_Street_by_Paul_Strand%2C_1915.jpg";
const WIDTH = 560;
const INK = "#2e1065";
const out = new URL("../static/wall-street-1915.png", import.meta.url).pathname;

const dir = mkdtempSync(join(tmpdir(), "dither-"));
const photo = join(dir, "source.jpg");
const response = await fetch(SOURCE, { headers: { "user-agent": "costmaxxing-site-build/1.0" } });
if (!response.ok) throw new Error(`Commons ${response.status}`);
writeFileSync(photo, Buffer.from(await response.arrayBuffer()));

const gray = execFileSync(
  "magick",
  [photo, "-resize", `${WIDTH}x`, "-colorspace", "gray", "-brightness-contrast", "0x15", "-depth", "8", "gray:-"],
  { maxBuffer: 1 << 28 },
);
const height = gray.length / WIDTH;
const level = Float32Array.from(gray);
const bits = new Uint8Array(WIDTH * height);
const spread = [
  [1, 0],
  [2, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [0, 2],
];
for (let y = 0; y < height; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const i = y * WIDTH + x;
    const value = level[i]! < 128 ? 0 : 255;
    bits[i] = value;
    const error = (level[i]! - value) / 8;
    for (const [dx, dy] of spread) {
      const nx = x + dx!;
      const ny = y + dy!;
      if (nx >= 0 && nx < WIDTH && ny < height) level[ny * WIDTH + nx]! += error;
    }
  }
}
const pgm = join(dir, "dithered.pgm");
writeFileSync(pgm, Buffer.concat([Buffer.from(`P5\n${WIDTH} ${height}\n255\n`), Buffer.from(bits)]));
execFileSync("magick", [pgm, "+level-colors", `${INK},#ffffff`, "-type", "Palette", "-colors", "2", "-strip", out]);
console.log(`${out} ${WIDTH}x${height}`);
