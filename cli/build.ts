import { build } from "esbuild";

await build({
  entryPoints: [new URL("src/main.ts", import.meta.url).pathname],
  outfile: new URL("dist/openmaxxing.js", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minifySyntax: true,
  legalComments: "inline",
  banner: { js: "#!/usr/bin/env node" },
});
