import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
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

function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const DOS_DATE_1980 = 0x21;
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const path = Buffer.from(name);
    const packed = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_DATE_1980, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(path.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_DATE_1980, 14);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(path.length, 28);
    central.writeUInt32LE(offset, 42);
    parts.push(local, path, packed);
    directory.push(central, path);
    offset += local.length + path.length + packed.length;
  }
  const listing = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(listing.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, listing, end]);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
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

const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => relative(dist, join(entry.parentPath, entry.name)))
  .sort();
const entries = await Promise.all(files.map(async (name) => ({ name, data: await readFile(join(dist, name)) })));
await writeFile(new URL("costmaxxing-extension.zip", import.meta.url).pathname, zip(entries));
