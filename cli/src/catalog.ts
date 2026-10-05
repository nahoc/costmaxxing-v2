import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseModelsDev, type ModelPrice } from "@openmaxxing/core";
import snapshot from "@openmaxxing/core/snapshot" with { type: "json" };
import { HOME } from "./usage.ts";

const CACHE = join(HOME, "models.dev.json");
const DAY = 86_400_000;

export type CatalogSource = "models.dev" | "cache" | "snapshot";

async function cached(maxAge: number): Promise<unknown> {
  const info = await stat(CACHE).catch(() => undefined);
  if (!info || Date.now() - info.mtimeMs > maxAge) return undefined;
  return JSON.parse(await readFile(CACHE, "utf8"));
}

async function fetchLive(): Promise<unknown> {
  const response = await fetch("https://models.dev/api.json", { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error(`models.dev ${response.status}`);
  const text = await response.text();
  const data: unknown = JSON.parse(text);
  await mkdir(HOME, { recursive: true });
  await writeFile(CACHE, text);
  return data;
}

export async function loadCatalog(offline: boolean): Promise<{ prices: ModelPrice[]; source: CatalogSource }> {
  const attempts: [CatalogSource, () => Promise<unknown>][] = offline
    ? [["cache", () => cached(Infinity)]]
    : [
        ["cache", () => cached(DAY)],
        ["models.dev", fetchLive],
        ["cache", () => cached(Infinity)],
      ];
  for (const [source, load] of attempts) {
    const data = await load().catch(() => undefined);
    const prices = data === undefined ? [] : parseModelsDev(data);
    if (prices.length > 0) return { prices, source };
  }
  return { prices: parseModelsDev(snapshot), source: "snapshot" };
}
