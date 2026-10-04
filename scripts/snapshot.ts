import { writeFile } from "node:fs/promises";
import { PLAN_PROVIDERS } from "../core/src/index.ts";

const PROVIDERS = ["anthropic", "openai", ...PLAN_PROVIDERS.map((p) => p.provider).filter((p) => p !== "boundless")];

const response = await fetch("https://models.dev/api.json");
if (!response.ok) throw new Error(`models.dev ${response.status}`);
const catalog: Record<string, { models?: Record<string, { name?: string; open_weights?: boolean; cost?: unknown }> }> =
  await response.json();
const snapshot = Object.fromEntries(
  PROVIDERS.map((provider) => [
    provider,
    {
      models: Object.fromEntries(
        Object.entries(catalog[provider]?.models ?? {})
          .filter(([, model]) => model.cost)
          .map(([id, { name, open_weights, cost }]) => [id, { name, open_weights, cost }]),
      ),
    },
  ]),
);
await writeFile(new URL("../core/data/models-dev-snapshot.json", import.meta.url), `${JSON.stringify(snapshot)}\n`);
console.log(`snapshot: ${PROVIDERS.map((p) => `${p} ${Object.keys(snapshot[p]?.models ?? {}).length}`).join(", ")}`);
