# costmaxxing privacy policy

Last updated: 2026-10-05

costmaxxing is an open-source command-line tool and Claude Code mod that prices AI usage at API rates and on open-weight models. This policy covers the mod, the `costmaxxing <team-id>` command, and the team pages at costmaxxing.dev.

## On your machine only

`npx costmaxxing` with no team reads your Claude Code and Codex logs and prints a report. The mod installed without a team prices each Claude Code request and keeps a 30-day total on your machine. Neither sends anything anywhere except a request for public prices to models.dev.

## When you join a team

`npx costmaxxing` can start a team, and `npx costmaxxing <team-id>` installs the mod for that team. From then on, costmaxxing.dev receives:

- for each Claude Code request: the model name, token counts (input, output, cache reads, cache writes), the time, and request and session IDs, sent at most once a minute;
- once, when you join: daily sums of the same counts from your existing Claude Code logs, up to a year back;
- an anonymous ID for you, made by hashing the team name with your Claude account email. The email itself is never sent.

It never receives prompts, responses, code, file names, keys, or credentials.

## Team pages

Each team's totals are shown at costmaxxing.dev/<team-id>. Team IDs are generated with 50 random bits, unknown IDs return nothing, and guessing is rate limited, so only people who have the ID can see the page or add counts to it. Anyone you share the ID with can do both. Counts are kept for about 400 days.

## What we don't do

- No analytics or tracking inside the CLI or the mod. The costmaxxing.dev website uses Vercel Web Analytics, which counts page views without cookies.
- No selling or sharing of the counts, and no use beyond showing the savings.

## Leaving a team

Run `claude plugin uninstall costmaxxing@costmaxxing`, or clear the team option with `/plugin configure costmaxxing@costmaxxing`. To have a team's data deleted, open an issue at https://github.com/nahoc/costmaxxing-v2/issues.

## Changes and contact

Changes to this policy are published in this file, with a new date at the top. Questions go to https://github.com/nahoc/costmaxxing-v2/issues.
