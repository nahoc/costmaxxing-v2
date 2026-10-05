import { rm } from "node:fs/promises";
import { build } from "esbuild";

await rm(new URL("dist/", import.meta.url).pathname, { recursive: true, force: true });

await build({
  entryPoints: [new URL("src/main.ts", import.meta.url).pathname],
  outfile: new URL("dist/costmaxxing.js", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minifySyntax: true,
  legalComments: "inline",
  banner: { js: "#!/usr/bin/env node" },
});
