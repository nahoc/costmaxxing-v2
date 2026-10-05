import { writeFile } from "node:fs/promises";
import { bundle, OUTFILE } from "./bundle.ts";

await writeFile(OUTFILE, await bundle());
