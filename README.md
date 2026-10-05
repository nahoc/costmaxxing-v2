# costmaxxing

See what your team's Claude Code and Codex usage would cost on open-weight models, live, under every prompt.

Subscriptions hide what coding agents really cost. costmaxxing prices every request at Anthropic's and OpenAI's API rates, next to what the same usage would cost on open-weight models, so your team knows the real number before the subsidies end.

![The costmaxxing line under the Claude Code prompt](https://raw.githubusercontent.com/nahoc/costmaxxing-v2/main/docs/screenshots/prompt-line.png)

## Start

One person runs:

```
npx costmaxxing
```

They press Enter to start a new team and give it a name. costmaxxing prints a private team ID and the line to share. Everyone else runs that line once:

```
npx costmaxxing acme-7kq3x-m9pz2
```

That one command:

- installs the costmaxxing mod into Claude Code and connects it to the team;
- adds a background hook to Codex, if Codex is installed;
- adds up to a year of history from your existing Claude Code and Codex logs.

![npx costmaxxing joining a team](https://raw.githubusercontent.com/nahoc/costmaxxing-v2/main/docs/screenshots/join.png)

From then on every session counts, with nothing more to do. The team's savings, forecast and models are at `costmaxxing.dev/<team-id>`:

![A costmaxxing team page](https://raw.githubusercontent.com/nahoc/costmaxxing-v2/main/docs/screenshots/team-page.png)

## Commands

```
npx costmaxxing                  start or join a team, or open yours
npx costmaxxing <team-id>        join a team
npx costmaxxing team             show the team, whether Claude Code and Codex are connected, and the page link
npx costmaxxing team leave       leave the team
npx costmaxxing team pricing     set the team's comparison from your config file (the person who started it)
npx costmaxxing team rotate      move the team to a new ID (the person who started it)
npx costmaxxing team delete      delete the team and its usage (the person who started it)
```

Requires Node 22+ and Claude Code 2.1.287+.

## Just your own numbers

Pipe it (`npx costmaxxing | cat`), or press Enter at both prompts, and costmaxxing prints a report of your last 30 days from your Claude Code and Codex logs, with nothing uploaded. `--days N` changes the window, `--vs provider/model` prices everything on one models.dev model, `--json` prints every number, and `--offline` uses cached prices only.

An Owner can price a claude.ai spend report instead: `npx costmaxxing import spend-report.csv [--members members.csv] [--seats premium=N,standard=N] [--billing monthly|annual]`.

## Your own team server

`costmaxxing serve --token T` runs a team server on a machine you control instead of costmaxxing.dev; its dashboard at `/` asks for the token as a password. `costmaxxing connect <url> --token T` prints the command that points the mod at it. It speaks plain HTTP, so run it on a network you trust or behind TLS.

## Where the numbers come from

costmaxxing reads these sources:

- **Claude Code** writes one JSON line per response to `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR/projects`). costmaxxing counts each `requestId` once and treats files under `subagents/` as subagent traffic.
- **Codex** writes sessions to `~/.codex/sessions` and `~/.codex/archived_sessions` (or `$CODEX_HOME`). costmaxxing reads `token_usage_record` lines, and `token_count` events in older files.
- **claude.ai** has no usage API for Teams. Owners can download a spend report, one row per person, product, and model. `import` prices that file.
- **Prices** come from [models.dev](https://models.dev), cached for 24 hours in `~/.costmaxxing/` (or `$COSTMAXXING_HOME`).

A team server and the logs often see the same request. costmaxxing merges them by request ID, so the request counts once.

## How costs are calculated

Rates are USD per million tokens:

```
cost = (uncached input × input + output × output + cache reads × cache_read
        + 5-minute cache writes × cache_write + 1-hour cache writes × cache_write_1h) / 1,000,000
```

- **Missing rates.** A missing cache-read or cache-write rate falls back to the input rate. A missing Anthropic 1-hour write rate is 2 × input. Other providers' 1-hour writes fall back to their cache-write rate. `--json` lists every fallback that priced at least one token.
- **Long context.** A long-context tier applies when one request's prompt (uncached input, cache reads, and cache writes) is larger than the tier's size.
- **Spend report rows.** Each row covers many requests. costmaxxing prices the average request in the row, then multiplies by the request count. The spend columns are ignored, because usage that seats cover shows as $0 there.
- **Unpriced models.** A model with no price is listed by name with its request count. It is left out of both sides of every comparison, never counted as $0.
- **Same token counts.** Every comparison assumes the other model uses the same number of tokens for the same work. Real token counts differ between models and tokenizers.
- **Forecast.** The 7-day average is the cost of the last 7 days divided by 7. The 30-day average is the cost of the last 30 days divided by 30. A month is 30 days and a year is 365.

## What it compares against

The default comparison is a tiered open-weight plan:

| Your model | Plan tier | Default model | Input | Cache read | Output |
| --- | --- | --- | --- | --- | --- |
| `claude-haiku-*`, `*-luna`, and every Claude Code subagent request | grunt | DeepSeek V4.1 Flash | $0.20 | $0.01 | $1.00 |
| `claude-sonnet-*`, `*-terra` | mid | GLM-5.3 Flash | $0.12 | $0.02 | $0.40 |
| everything else | frontier | GLM-5.3 | $1.12 | $0.14 | $3.52 |

The default rates are Boundless's public rates (inference.boundless.network/models.md, checked 2026-10-03). The maintainer works at Boundless. Cache writes bill at the input rate because that page lists no cache-write price. The Providers section prices the same plan at Together AI, Baseten, and Fireworks from models.dev, and shows the savings at each, largest first. A provider that doesn't list one of the three models says so. Use `--vs` or a `[[scenario]]` to compare against anything on models.dev.

claude.ai seats cost $25 a month (Standard) or $125 (Premium), or $20 and $100 with annual billing. Fable models need a Premium seat. Without a members export or `--seats`, costmaxxing estimates that everyone with Fable usage has a Premium seat and everyone else a Standard one.

## Configuration

costmaxxing reads `~/.costmaxxing/config.toml` if it exists, or the file given with `--config`.

When you start a team, or run `npx costmaxxing team pricing` as its starter, the file's first `[[scenario]]` and its `[prices]` become the team's comparison: the team page and the line under every member's prompt price usage that way instead of the default open-weight plan. A scenario only reprices the models it maps; the rest keep their API price.

```toml
window_days = 30

# Your subscription, for the subsidy line.
[plan]
name = "Claude Max"
monthly_usd = 200
clients = ["claude-code"]   # claude-code, codex, or both

# Extra comparisons. Patterns match model IDs. The first match wins. Unmatched models keep their price.
[[scenario]]
name = "Opus on Kimi"
map = [["claude-opus-*", "boundless/kimi-k3"]]

# Prices for models that models.dev doesn't list, or overrides, in USD per million tokens.
[prices."boundless/kimi-k3"]
input = 2.30
output = 11.40
cache_read = 0.23
```

## Privacy

- costmaxxing never reads browser cookie stores, the OS keychain, or another app's credentials.
- It stores usage counts only: model, token counts, time, and request and session IDs. It never stores prompts, responses, code, keys, or auth headers.
- It has no telemetry. On its own, it talks only to models.dev. Once you join a team, it also sends usage counts (never content) to costmaxxing.dev or your own server: the model, token counts, the time, and request and session IDs, under an anonymous ID. Full policy: [PRIVACY.md](https://github.com/nahoc/costmaxxing-v2/blob/main/PRIVACY.md).
- A `serve` team server forwards each request unchanged to the same API the agent would call without it.

## Develop

```
npm install
npm test
npm run typecheck
npm run build
```

`core/` is pure TypeScript with no Node or browser APIs. It parses usage, prices it, builds the report, and renders it as terminal text or HTML. `cli/` reads files and runs the servers. `mod/` is the Claude Code mod: `mod/src` builds into `mod/plugin/hooks/register.js`, which is committed because plugin installs read it straight from git, and a test fails when it's out of date. All of them bundle `core` with esbuild, so every number is computed in one place. With Claude Code v2.1.287 or later, `claude plugin test` in `mod/plugin` runs the mod against Claude Code's own test harness.

`node site/scripts/screenshots.ts` redraws the README screenshots in `docs/screenshots/` from demo data, with Playwright's headless Chromium (or `CHROME=<path>`).

Every change bumps `cli/package.json`, `mod/plugin/.claude-plugin/plugin.json`, or both: Claude Code only updates an installed mod when its version changes.

`site/` is costmaxxing.dev, deployed by Vercel with `site/vercel.json`. `npm run build` writes the landing page to `site/dist/` and the Vercel build output to `site/.vercel/output/`, which adds one function for the team API and team pages, backed by Upstash Redis.

## License

MIT
