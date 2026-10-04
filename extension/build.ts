import { cp, mkdir, writeFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";
import { REPORT_CSS } from "@costmaxxing/core";
import { build } from "esbuild";

const dist = new URL("dist/", import.meta.url).pathname;

const PAGE_CSS = `${REPORT_CSS}
body { margin: 0; }
body[data-page="popup"] { width: 760px; }
.cmx a, .cmx code { color: inherit; }
.actions { display: flex; gap: 8px; justify-content: flex-end; max-width: 1080px; margin: 0 auto; padding: 12px 16px 0; }
.button { font: 500 12px/1 ui-sans-serif, system-ui, sans-serif; color: inherit; text-decoration: none; border: 1px solid #c9c9c9; border-radius: 6px; padding: 7px 10px; }
.button:hover { background: rgba(127, 127, 127, 0.12); }
.status { color: #6b6b6b; padding: 16px; font: 13px ui-sans-serif, system-ui, sans-serif; }
`;

function png(size: number): Buffer {
  const bars = [0.78, 0.56, 0.34];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = y * (size * 4 + 1) + 1 + x * 4;
      const dx = Math.max(radius - x - 0.5, 0, x + 0.5 - (size - radius));
      const dy = Math.max(radius - y - 0.5, 0, y + 0.5 - (size - radius));
      if (dx * dx + dy * dy > radius * radius) continue;
      const column = Math.floor(((x / size) - 0.18) / 0.22);
      const inBar = column >= 0 && column < 3 && ((x / size) - 0.18) % 0.22 < 0.16 && y / size > 1 - 0.14 - bars[column]! * 0.86 && y / size < 0.86;
      raw.set(inBar ? [108, 194, 135, 255] : [22, 22, 22, 255], at);
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
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(`${dist}icons`, { recursive: true });
await build({
  entryPoints: ["page", "background"].map((name) => new URL(`src/${name}.ts`, import.meta.url).pathname),
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minifySyntax: true,
});
await cp(new URL("static/", import.meta.url).pathname, dist, { recursive: true });
await writeFile(`${dist}page.css`, PAGE_CSS);
for (const size of [16, 32, 48, 128]) await writeFile(`${dist}icons/${size}.png`, png(size));
