import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { example } from "./src/example.ts";
import { cursor } from "../world/icons.ts";
import { renderPage } from "./src/page.ts";

const here = (path: string) => new URL(path, import.meta.url).pathname;
const dist = here("dist/");

const script = await build({
  entryPoints: [here("src/site.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  write: false,
});
const css = `${await readFile(here("../world/world.css"), "utf8")}\n${await readFile(here("src/site.css"), "utf8")}\nbody { --cursor: ${cursor()}; }`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(here("static/"), dist, { recursive: true });
await cp(here("../world/fonts/"), `${dist}fonts/`, { recursive: true });
await writeFile(
  `${dist}index.html`,
  renderPage({ example: example(), css, js: script.outputFiles[0]?.text ?? "" }),
);

const output = here(".vercel/output/");
const fn = `${output}functions/api/teams.func/`;
await rm(output, { recursive: true, force: true });
await mkdir(fn, { recursive: true });
await cp(dist, `${output}static/`, { recursive: true });
await build({
  entryPoints: [here("src/function.ts")],
  outfile: `${fn}index.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  loader: { ".css": "text" },
});
await writeFile(`${fn}package.json`, JSON.stringify({ type: "module" }));
await writeFile(`${fn}.vc-config.json`, JSON.stringify({ runtime: "nodejs24.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration: 30 }));
await writeFile(
  `${output}config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "^/api/teams/([^/]+)/?$", dest: "/api/teams?p=$1" },
      { src: "^/api/teams/([^/]+)/(usage|backfill)$", dest: "/api/teams?p=$1/$2" },
      { src: "^/([^/.]+)/?$", dest: "/api/teams?p=$1/page" },
    ],
  }),
);
