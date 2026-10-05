import type { PriceBook } from "./types.ts";

export interface Scenario {
  name: string;
  url?: string;
  routes: [pattern: string, ref: string][];
  subagent?: string;
}

type Tier = "frontier" | "mid" | "grunt";

export interface PlanProvider {
  name: string;
  url: string;
  provider: string;
  models: Record<Tier, string>;
}

const OPEN_WEIGHT_IDS = {
  frontier: "zai-org/GLM-5.3",
  mid: "zai-org/GLM-5.3-Flash",
  grunt: "deepseek-ai/DeepSeek-V4.1-Flash",
};

export const PLAN_PROVIDERS: PlanProvider[] = [
  {
    name: "Boundless",
    url: "https://inference.boundless.network",
    provider: "boundless",
    models: { frontier: "glm-5.3", mid: "glm-5.3-flash", grunt: "deepseek-v4.1-flash" },
  },
  { name: "Together AI", url: "https://www.together.ai", provider: "togetherai", models: OPEN_WEIGHT_IDS },
  { name: "Baseten", url: "https://www.baseten.co", provider: "baseten", models: OPEN_WEIGHT_IDS },
  {
    name: "Fireworks",
    url: "https://fireworks.ai",
    provider: "fireworks-ai",
    models: {
      frontier: "accounts/fireworks/models/glm-5p3",
      mid: "accounts/fireworks/models/glm-5p3-flash",
      grunt: "accounts/fireworks/models/deepseek-v4p1-flash",
    },
  },
];

const TIER_ROUTES: [string, Tier][] = [
  ["claude-haiku-*", "grunt"],
  ["*-luna", "grunt"],
  ["claude-sonnet-*", "mid"],
  ["*-terra", "mid"],
  ["*", "frontier"],
];

const TIER_ROLES: [Tier, string][] = [
  ["frontier", "hard tasks"],
  ["mid", "mid"],
  ["grunt", "grunt work"],
];

export function planScenario(plan: PlanProvider): Scenario {
  const ref = (tier: Tier) => `${plan.provider}/${plan.models[tier]}`;
  return {
    name: plan.name,
    url: plan.url,
    routes: TIER_ROUTES.map(([pattern, tier]) => [pattern, ref(tier)]),
    subagent: ref("grunt"),
  };
}

export function planDetail(plan: PlanProvider, book: PriceBook): string {
  return TIER_ROLES.map(([tier, role]) => {
    const ref = `${plan.provider}/${plan.models[tier]}`;
    return `${book.get(ref)?.name ?? plan.models[tier]} for ${role}`;
  }).join(" · ");
}

export function modelScenario(ref: string, book: PriceBook): Scenario {
  return { name: book.get(ref)?.name ?? ref, routes: [["*", ref]] };
}

const globs = new Map<string, RegExp>();

function glob(pattern: string): RegExp {
  let re = globs.get(pattern);
  if (!re) {
    const source = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
    re = new RegExp(`^${source}$`, "i");
    globs.set(pattern, re);
  }
  return re;
}

export function route(scenario: Scenario, model: string, subagent: boolean): string | undefined {
  if (subagent && scenario.subagent) return scenario.subagent;
  const bare = model.replace(/\[1m\]$/, "");
  return scenario.routes.find(([pattern]) => glob(pattern).test(bare))?.[1];
}
