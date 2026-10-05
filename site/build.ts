import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { example } from "./src/example.ts";
import { cursor } from "./src/icons.ts";
import { renderPage, type Install } from "./src/page.ts";

const here = (path: string) => new URL(path, import.meta.url).pathname;
const dist = here("dist/");
const store = process.env.STORE_URL;
if (store && !store.startsWith("https://chromewebstore.google.com/detail/")) {
  throw new Error("STORE_URL must be the extension's chromewebstore.google.com/detail/ link");
}
const zip = here("../extension/costmaxxing-extension.zip");
const install: Install = store
  ? { href: store, label: "Add to Chrome", zip: false }
  : { href: "costmaxxing-extension.zip", label: "Download for Chrome", zip: true };

const script = await build({
  entryPoints: [here("src/site.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: true,
  write: false,
});
const css = `${await readFile(here("src/site.css"), "utf8")}\nbody { --cursor: ${cursor()}; }`;

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(here("static/"), dist, { recursive: true });
if (!store) await copyFile(zip, `${dist}costmaxxing-extension.zip`);
await writeFile(
  `${dist}index.html`,
  renderPage({ example: example(), install, css, js: script.outputFiles[0]?.text ?? "" }),
);
