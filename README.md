# costmaxxing

costmaxxing shows what your AI coding and chat usage costs at API prices, and what the same usage would cost on open-weight models or at other inference providers. It reads the usage your tools already record. Nothing is uploaded.

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
Morph         doesn't list deepseek-v4.1-flash, glm-5.3-flash, glm-5.3

Try next
  npx costmaxxing --vs togetherai/zai-org/GLM-5.3   price everything on one model
  npx costmaxxing claude                            count a Claude Code session live
  npx costmaxxing web                               open this report in your browser
  npx costmaxxing --json                            every number, every model
  costmaxxing browser extension                     team report for claude.ai Owners
```

## Get your number

- **Your own usage.** Run `npx costmaxxing`. It reads Claude Code and Codex logs from the last 30 days and prints the report in a few seconds. There is nothing to configure.
- **Your claude.ai Team or Enterprise org.** Install the costmaxxing browser extension and click it while signed in to claude.ai as an Owner. The popup shows the team report. Members who aren't Owners see a message that the team view needs an Owner.
- **A spend report you already have.** Run `npx costmaxxing import spend-report.csv`. The extension's **Download CSV** button saves this file.
- **A session as it happens.** Run `npx costmaxxing claude` or `npx costmaxxing codex`. The agent runs as usual through a local counting proxy, and costmaxxing prints a one-line summary when it exits.

## Commands

```
costmaxxing [--days N] [--vs provider/model]... [--json] [--offline] [--config PATH]
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
| `--days N` | Sets the window. The default is 30 days. |
| `--vs provider/model` | Compares against one models.dev model, such as `--vs togetherai/zai-org/GLM-5.3`. The first `--vs` replaces the open-weight plan in the summary box. Each extra `--vs` adds a row under Scenarios. |
| `--json` | Prints every number as JSON, including all models, unpriced models, and the rate fallbacks used. |
| `--offline` | Uses the cached models.dev prices, or the snapshot bundled with costmaxxing, and makes no network calls. |
| `import` | Prices a claude.ai spend report CSV. It reads the period from the file name (`...-2026-09-01-to-2026-09-30.csv`), or from `--from` and `--to`. |
| `claude`, `codex` | Runs the agent through a local proxy on 127.0.0.1 that counts each request. All other arguments pass through to the agent. |
| `web` | Serves the report on 127.0.0.1 and opens it in your browser. |
| `serve` | Runs a shared gateway that a team points its agents at. It counts usage per person. The dashboard at `/` asks for the token as a password. |
| `connect` | Prints the Claude Code and Codex settings for a gateway. |

Runs that aren't interactive, such as runs with `--json`, in CI, or with output piped to a file, never prompt and never open a browser.

## Where the numbers come from

costmaxxing reads these sources:

- **Claude Code** writes one JSON line per response to `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR/projects`). costmaxxing counts each `requestId` once and treats files under `subagents/` as subagent traffic.
- **Codex** writes sessions to `~/.codex/sessions` and `~/.codex/archived_sessions` (or `$CODEX_HOME`). costmaxxing reads `token_usage_record` lines, and `token_count` events in older files.
- **claude.ai** has no usage API for Teams. Owners can download a spend report, one row per person, product, and model. The extension fetches the same report with your browser's own claude.ai session.
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
- **Forecast.** The 7-day and 30-day averages are daily cost over the window, or over the days since your first request if that is shorter. A month is 30 days and a year is 365.

## What it compares against

The default comparison is a tiered open-weight plan:

| Your model | Plan tier | Default model | Input | Cache read | Output |
| --- | --- | --- | --- | --- | --- |
| `claude-haiku-*`, `*-luna`, and every Claude Code subagent request | grunt | DeepSeek V4.1 Flash | $0.20 | $0.01 | $1.00 |
| `claude-sonnet-*`, `*-terra` | mid | GLM-5.3 Flash | $0.12 | $0.02 | $0.40 |
| everything else | frontier | GLM-5.3 | $1.12 | $0.14 | $3.52 |

The default rates are Boundless's public rates (inference.boundless.network/models.md, checked 2026-10-03). The maintainer works at Boundless. Cache writes bill at the input rate because that page lists no cache-write price. The Providers section prices the same plan at Together AI, Baseten, Fireworks, and Morph from models.dev, and shows the savings at each, largest first. A provider that doesn't list one of the three models says so. Use `--vs` or a `[[scenario]]` to compare against anything on models.dev.

claude.ai seats cost $25 a month (Standard) or $125 (Premium), or $20 and $100 with annual billing. Fable models need a Premium seat. Without a members export or `--seats`, costmaxxing estimates that everyone with Fable usage has a Premium seat and everyone else a Standard one.

## Configuration

costmaxxing reads `~/.costmaxxing/config.toml` if it exists, or the file given with `--config`.

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
- It has no telemetry. The CLI talks only to models.dev. The extension talks only to claude.ai and models.dev, through your browser's existing session, and only after you click it.
- The proxy forwards each request unchanged to the same API the agent would call without it.

## Develop

```
npm install
npm test
npm run typecheck
npm run build
```

`core/` is pure TypeScript with no Node or browser APIs. It parses usage, prices it, builds the report, and renders it as terminal text or HTML. `cli/` reads files and runs the servers. `extension/` fetches from claude.ai. Both bundle `core` with esbuild, so every number is computed in one place.

## License

MIT
