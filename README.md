# costmaxxing

costmaxxing shows what your AI coding and chat usage costs at API prices, and what the same usage would cost on open-weight models or at other inference providers. It reads the usage your tools already record. Nothing is uploaded unless you add yourself to a team.

```
npx costmaxxing
```

```
costmaxxing · last 30 days · 140 sessions · 15k requests · 1.6B tokens

╭───────────────────────────────────────────────────────────────────────────────────────╮
│                                                                                       │
│  Switch to open-weight models and potentially save:                                   │
│  GLM-5.3 for hard tasks · GLM-5.3 Flash for mid · DeepSeek V4.1 Flash for grunt work  │
│                                                                                       │
│  $13k / year     $1k / month     78% savings                                          │
│                                                                                       │
│  The last 30 days would've cost: $297 on open-weight models instead of $1.3k          │
│  What will you do when the subsidies end?                                             │
│                                                                                       │
╰───────────────────────────────────────────────────────────────────────────────────────╯

By harness    Requests   Tokens   Price   Share          If using open-weight models
Claude Code        11k     1.2B   $1.2k   ███████████⠂   $213  $964 savings
Codex             3.3k     352M    $165   █⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂   $84   $81 savings

Forecast         Per day   Month   Year   If using open-weight models
7-day average        $45   $1.3k   $16k   $3.6k / year  $13k savings
30-day average       $45   $1.3k   $16k   $3.6k / year  $13k savings

Top models         Requests   Tokens   Price   Share          If using open-weight models
Claude Opus 5.5        6.6k     704M    $747   ███████⠂⠂⠂⠂⠂   $168  $579 savings
Claude Fable 5.1        900      96M    $230   ██⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂   $28   $202 savings
GPT-6 Sol              2.6k     278M    $161   █⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂   $81   $79 savings
Claude Sonnet 5        2.1k     224M    $139   █⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂   $8    $131 savings
Claude Haiku 4.5       1.8k     192M     $59   █⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂   $9    $51 savings
GPT-5.6 Luna            700      75M      $4   ⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂⠂   $3    $1 savings

Providers
Boundless     $1k savings · 78%
Baseten       $966 savings · 72%
Together AI   $900 savings · 67%
Fireworks     $900 savings · 67%

Try next
  npx costmaxxing --vs togetherai/zai-org/GLM-5.3   price everything on one model
  npx costmaxxing claude                            count a Claude Code session live
  npx costmaxxing web                               open this report in your browser
  npx costmaxxing --json                            every number, every model
  npx costmaxxing <team-id>                            your savings under the Claude Code prompt, added up for your team
```

## Get your number

- **Your own usage.** Run `npx costmaxxing`. It reads Claude Code and Codex logs from the last 30 days and prints the report in a few seconds. There is nothing to configure.
- **A claude.ai spend report.** An Owner can download the org's spend report from claude.ai. Run `npx costmaxxing import spend-report.csv`.
- **A session as it happens.** Run `npx costmaxxing claude` or `npx costmaxxing codex`. The agent runs as usual through a local counting proxy, and costmaxxing prints a one-line summary when it exits.
- **Live, under the Claude Code prompt, for the whole team.** Everyone runs `npx costmaxxing <team-id>` (below). No Owner role needed.

## Your team, live in Claude Code

One person starts the team:

```
npx costmaxxing
```

It asks for a team ID; press Enter to start a new team and give it a name. costmaxxing.dev answers with a private ID like `acme-7kq3x-m9pz2` and the command to share. Everyone else runs that once:

```
npx costmaxxing acme-7kq3x-m9pz2
```

It installs the costmaxxing mod into Claude Code (v2.1.287 or later; it offers to update an older one), sets it to report to the team, adds a background Stop hook to Codex if Codex is installed (Codex asks once to trust it), and adds the history from the person's Claude Code and Codex logs, up to a year. Claude Code keeps the setting, so it works in every session from then on. The savings then show under the prompt and update after every request:

```
costmaxxing  Potential savings via open-weight: $3.74 this session │ $612 last 30 days (you) · $9.4k (team) │ 12 people │ team page ↗
```

Every amount is savings: what the usage costs at Anthropic's API prices, minus what it would cost on open-weight models.

The team's page is costmaxxing.dev/acme-7kq3x-m9pz2. It shows the savings, people, sessions, requests, and tokens for the last 30 days, a forecast at the 7-day and 30-day pace, a split between Claude Code and Codex, and the models. The ID is the key: it has 50 random bits, unknown IDs get a 404, and guesses are rate limited, so only people you give the ID to can see the page or add to it.

Whoever starts the team also gets an admin key, saved in `~/.costmaxxing/team.json` on that machine. With it:

- `npx costmaxxing team rotate` moves the team to a new ID, if the old one leaked. Everyone who already reported to the team follows automatically; anyone holding only the old ID gets nothing.
- `npx costmaxxing team pricing` sets the team's comparison from your config file again.
- `npx costmaxxing team delete` deletes the team and all its usage.

Keep a copy of that file if you change machines: the key can't be recovered.

What leaves the machine: for each request, the model, token counts, time, and request and session IDs, sent to costmaxxing.dev at most once a minute, plus daily sums of the same from the logs. Each person is an anonymous ID made from the team name and their Claude account email; the email itself is never sent. Prompts, responses, code, and keys never leave. Running the command again changes nothing: history is only counted from before the person first joined.

Claude Code deletes conversation logs older than its `cleanupPeriodDays` setting (30 days by default), so most people's history covers about a month. The API reports cache writes without saying whether they're 5-minute or 1-hour writes, so the mod prices them all at the 5-minute rate, which can only understate the savings. An organization can turn off mods that users install; then the mod doesn't load.

### Without a team

```
claude plugin marketplace add nahoc/costmaxxing-v2
claude plugin install costmaxxing@costmaxxing
```

Leave the options empty. The mod then keeps everything on your machine: it prices each request with the bundled models.dev snapshot and keeps a 30-day total that every Claude Code session on the machine shares.

### With your own server

`costmaxxing serve` runs a team server on a machine you control instead of costmaxxing.dev. `costmaxxing connect` prints the install command that points the mod at it.

## Commands

```
costmaxxing [--days N] [--vs provider/model]... [--json] [--offline] [--config PATH]
costmaxxing <team-id>
costmaxxing import <spend-report.csv> [--members members.csv] [--seats premium=N,standard=N]
                   [--billing monthly|annual] [--from YYYY-MM-DD --to YYYY-MM-DD]
costmaxxing claude [args...]
costmaxxing codex [args...]
costmaxxing web [--port N]
costmaxxing serve --token T [--port 8787] [--host 0.0.0.0]
costmaxxing connect <url> --token T [--user NAME]
```

| Command | What it does |
| --- | --- |
| `costmaxxing` | Prints the report for your Claude Code and Codex usage. |
| `costmaxxing <team-id>` | Adds your Claude Code to that team: installs the mod and uploads your history. With no arguments in a terminal, it asks for the ID or starts a new team. |
| `costmaxxing team` | Shows your team's page link, its 30-day totals, and the line teammates run, and opens the page. Plain `npx costmaxxing` does the same once you're on a team. |
| `costmaxxing team leave` | Leaves your team: clears the mod's team setting, removes the costmaxxing Codex hook, and deletes `~/.costmaxxing/team.json`. A team starter's admin key is kept in `~/.costmaxxing/admin-<id>.json`. |
| `--days N` | Sets the window. The default is 30 days. |
| `--vs provider/model` | Compares against one models.dev model, such as `--vs togetherai/zai-org/GLM-5.3`. The first `--vs` replaces the open-weight plan in the summary box. Each extra `--vs` adds a row under Scenarios. |
| `--json` | Prints every number as JSON, including all models, unpriced models, and the rate fallbacks used. |
| `--offline` | Uses the cached models.dev prices, or the snapshot bundled with costmaxxing, and makes no network calls. |
| `import` | Prices a claude.ai spend report CSV. It reads the period from the file name (`...-2026-09-01-to-2026-09-30.csv`), or from `--from` and `--to`. |
| `claude`, `codex` | Runs the agent through a local proxy on 127.0.0.1 that counts each request. All other arguments pass through to the agent. |
| `web` | Serves the report on 127.0.0.1 and opens it in your browser. |
| `serve` | Runs a shared gateway that a team points its agents at. It counts usage per person. The dashboard at `/` asks for the token as a password. |
| `connect` | Prints the Claude Code and Codex settings for a gateway, and the command that installs the Claude Code mod for it. |

Runs that aren't interactive, such as runs with `--json`, in CI, or with output piped to a file, never prompt and never open a browser.

`serve` speaks plain HTTP, and every request through it carries the sender's API credentials. Run it on a network you trust, or put it behind a proxy that adds TLS.

## Where the numbers come from

costmaxxing reads these sources:

- **Claude Code** writes one JSON line per response to `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR/projects`). costmaxxing counts each `requestId` once and treats files under `subagents/` as subagent traffic.
- **Codex** writes sessions to `~/.codex/sessions` and `~/.codex/archived_sessions` (or `$CODEX_HOME`). costmaxxing reads `token_usage_record` lines, and `token_count` events in older files.
- **claude.ai** has no usage API for Teams. Owners can download a spend report, one row per person, product, and model. `import` prices that file.
- **Prices** come from [models.dev](https://models.dev), cached for 24 hours in `~/.costmaxxing/` (or `$COSTMAXXING_HOME`).

The proxy and the logs often see the same request. costmaxxing merges them by request ID, so the request counts once.

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

When you start a team with `npx costmaxxing`, the file's first `[[scenario]]` and its `[prices]` become the team's comparison: the team page, and the line under every member's prompt, price usage that way instead of the default open-weight plan.

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
- It has no telemetry. The CLI talks only to models.dev, and to costmaxxing.dev when you run `costmaxxing <team-id>`. Then it sends usage counts only, to costmaxxing.dev or your own server, and `costmaxxing <team-id>` sends daily sums of the same from your logs.
- The proxy forwards each request unchanged to the same API the agent would call without it.

## Develop

```
npm install
npm test
npm run typecheck
npm run build
```

`core/` is pure TypeScript with no Node or browser APIs. It parses usage, prices it, builds the report, and renders it as terminal text or HTML. `cli/` reads files and runs the servers. `mod/` is the Claude Code mod: `mod/src` builds into `mod/plugin/hooks/register.js`, which is committed because plugin installs read it straight from git, and a test fails when it's out of date. All of them bundle `core` with esbuild, so every number is computed in one place. With Claude Code v2.1.287 or later, `claude plugin test` in `mod/plugin` runs the mod against Claude Code's own test harness.

`site/` is costmaxxing.dev, deployed by Vercel with `site/vercel.json`. `npm run build` writes the landing page to `site/dist/` and the Vercel build output to `site/.vercel/output/`, which adds one function for the team API and team pages, backed by Upstash Redis.

## License

MIT
