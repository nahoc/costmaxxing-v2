import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { build } from "esbuild";
import { cursor, watchCursor } from "../world/icons.ts";

const here = (path: string) => new URL(path, import.meta.url).pathname;
const dist = here("dist/");

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
  entryPoints: ["page", "background"].map((name) => here(`src/${name}.ts`)),
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  minifySyntax: true,
});
await cp(here("static/"), dist, { recursive: true });
await cp(here("../world/fonts/"), `${dist}fonts/`, { recursive: true });
const css = [await readFile(here("../world/world.css"), "utf8"), await readFile(here("src/report.css"), "utf8")];
await writeFile(`${dist}page.css`, `${css.join("\n")}\nbody { --cursor: ${cursor()}; --watch: ${watchCursor()}; }\n`);

const files = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => relative(dist, join(entry.parentPath, entry.name)))
  .sort();
const entries = await Promise.all(files.map(async (name) => ({ name, data: await readFile(join(dist, name)) })));
await writeFile(here("openmaxxing-extension.zip"), zip(entries));
