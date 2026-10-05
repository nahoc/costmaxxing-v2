import { build } from "esbuild";

export const OUTFILE = new URL("plugin/hooks/register.js", import.meta.url).pathname;

export async function bundle(): Promise<string> {
  const result = await build({
    absWorkingDir: new URL(".", import.meta.url).pathname,
    entryPoints: ["src/register.ts"],
    outfile: OUTFILE,
    write: false,
    bundle: true,
    format: "esm",
    target: "es2023",
    banner: { js: "// Built from mod/src by `npm run build -w mod`. Edit the source, not this file." },
  });
  return result.outputFiles[0]?.text ?? "";
}
