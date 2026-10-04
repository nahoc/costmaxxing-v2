import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";

const here = (path: string) => new URL(path, import.meta.url).pathname;
const dist = here("dist/");
const store = process.env.STORE_URL;
if (store && !store.startsWith("https://chromewebstore.google.com/detail/")) {
  throw new Error("STORE_URL must be the extension's chromewebstore.google.com/detail/ link");
}

const cta = store
  ? `<a class="cta" href="${store}">Add to Chrome</a>`
  : '<a class="cta" href="costmaxxing-extension.zip" download>Download for Chrome</a>';
const installNote = store
  ? ""
  : '<p class="note">Unzip it, open <code>chrome://extensions</code>, turn on Developer mode, and choose Load unpacked. Your report opens as soon as it loads.</p>';

await mkdir(dist, { recursive: true });
await cp(here("static/"), dist, { recursive: true });
await copyFile(here("../extension/dist/icons/128.png"), `${dist}icon.png`);
if (!store) await copyFile(here("../extension/costmaxxing-extension.zip"), `${dist}costmaxxing-extension.zip`);
const page = (await readFile(here("index.html"), "utf8")).replace("%%CTA%%", cta).replace("%%INSTALL_NOTE%%", installNote);
await writeFile(`${dist}index.html`, page);
