# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS, and JS in `site/`, no framework, built by `site/build.ts` into `site/dist/`. Hosting is undecided and chosen when the site ships.

## Users

The primary visitor is the Owner of a claude.ai Team or Enterprise organization: an engineering lead, a CTO, or whoever pays for the seats. They want to know what their team's Claude usage is really worth at API prices and what it would cost on open-weight models. Individual developers who use Claude Code or Codex on their own are a secondary audience, served by `npx costmaxxing`.

## Product Purpose

costmaxxing is an open-source tool that prices AI coding and chat usage at API list rates and shows what the same usage would cost on open-weight models or at other inference providers. The landing page exists to get a team to run one command, `npx costmaxxing <team>`, and its one takeaway is "How much can your team save by moving from Anthropic to open-weight models?". Success is the savings line appearing under someone's Claude Code prompt in the same minute, and the team page filling up as more people run it.

## Positioning

It prices every Claude Code request the team actually makes, from the usage Claude Code reports, so the numbers are real usage, not an estimate from a survey or a calculator. No Owner role is needed. Seats flat-rate the usage today. costmaxxing shows the gap between what the team pays for seats and what the usage is worth at API prices ("What will you do when the subsidies end?").

## Operating Context

- `npx costmaxxing <team>` installs a Claude Code mod (Claude Code 2.1.287 or later), sets it to report to the team, and uploads up to a year of daily sums from the person's Claude Code logs. The setting persists across sessions.
- The mod shows the savings under the prompt after every request and sends model names and token counts to costmaxxing.dev at most once a minute. Prompts, code, and keys never leave the machine. Team pages at costmaxxing.dev/<team> are public by design.
- Developers can still run `npx costmaxxing` for a local report of their own Claude Code and Codex logs.

## Capabilities and Constraints

- Savings are priced on a tiered open-weight plan (GLM-5.3, GLM-5.3 Flash, DeepSeek V4.1 Flash); the local report also compares Boundless, Together AI, Baseten, and Fireworks.
- Claude Code keeps conversation logs for 30 days by default, so most backfills cover about a month.
- An organization can block mods that users install.

## Brand Commitments

- Name: costmaxxing, always lowercase.
- Voice: plain and specific. Terminal-report wording rules carry over: "savings" (never "you save"), "price" (never "list price"), compact numbers, no cents.
- The closing line "What will you do when the subsidies end?" is Cohan's settled line.
- The landing page credit reads "Made with <3 by Cohan Carpentier". The page never says the tool is made by Boundless. Boundless appears only as one provider in the price comparison.

## Evidence on Hand

- The product itself: the landing page's Claude Code and team page windows are computed by costmaxxing's core from a synthetic team (`site/src/example.ts`). Any page demonstration uses synthetic data and is labeled as an example.
- Benchmark scores come from Vals AI's SWE-bench Verified leaderboard (https://www.vals.ai/benchmarks/swebench, updated 2026-09-01, archived): Claude Opus 5 97.0%, GLM-5.3 95.4%, Claude Fable 5 95.0%, GLM-5.3 Flash 92.0%. Pages that cite them name the source and date and note that Claude still leads on the hardest long-horizon agent benchmarks. Recorded in `site/src/claims.ts`.
- No customers, testimonials, press, or install counts exist. Do not invent them.

## Product Principles

1. Real numbers over pitches: show the report doing its job.
2. One action: copy the command. Everything else is secondary.
3. Neutral by construction: Boundless is one provider among several in the comparison.
4. Only token counts leave the machine, and the page says so plainly.

## Accessibility & Inclusion

No product-specific requirement established. Meet WCAG 2.2 AA for contrast, keyboard use, and reduced motion.
