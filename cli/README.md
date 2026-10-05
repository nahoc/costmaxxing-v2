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
npx costmaxxing team rotate      move the team to a new ID (the person who started it)
npx costmaxxing team delete      delete the team and its usage (the person who started it)
```

Requires Node 22+ and Claude Code 2.1.287+.

## Privacy

Prompts, responses and code never leave your machine. costmaxxing sends only usage counts: the model, token counts, the time and request IDs. You show up on the team page under an anonymous ID. The team ID is the only key, so only people you share it with can see the page. [Full policy](https://github.com/nahoc/costmaxxing-v2/blob/main/PRIVACY.md) · [Source and docs](https://github.com/nahoc/costmaxxing-v2)

MIT
