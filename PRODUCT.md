# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS, and JS in `site/`, no framework, built by `site/build.ts` into `site/dist/`. Hosting is undecided and chosen when the site ships.

## Users

The primary visitor is the Owner of a claude.ai Team or Enterprise organization: an engineering lead, a CTO, or whoever pays for the seats. They want to know what their team's Claude usage is really worth at API prices and what it would cost on open-weight models. Individual developers who use Claude Code or Codex on their own are a secondary audience, served by `npx costmaxxing`.

## Product Purpose

costmaxxing is an open-source tool that prices AI coding and chat usage at API list rates and shows what the same usage would cost on open-weight models or at other inference providers. The landing page exists to get Team Owners to install the Chrome extension. Success is an install followed by the team report opening and rendering in the same minute.

## Positioning

It reads a claude.ai organization's own spend report through the Owner's browser session, so the numbers are the team's real usage, not an estimate from a survey or a calculator. Seats flat-rate the usage today. costmaxxing shows the gap between what the team pays for seats and what the usage is worth at API prices ("What will you do when the subsidies end?").

## Operating Context

- The extension installs from the Chrome Web Store (until a listing exists, a zip loaded unpacked). On install it opens the full report in a tab and fetches immediately. Later the toolbar popup shows the same report.
- Data comes from claude.ai's Owner spend report export and public prices from models.dev. Nothing is uploaded and there is no telemetry.
- Non-Owners see a message that the team view needs an Owner. Developers run `npx costmaxxing` for their own Claude Code and Codex logs.

## Capabilities and Constraints

- The report shows yearly and monthly savings on a tiered open-weight plan (GLM-5.3, GLM-5.3 Flash, DeepSeek V4.1 Flash), seat cost against usage worth, cost by person, by product, and by model, and the same plan priced at Boundless, Together AI, Baseten, Fireworks, and Morph.
- The extension asks only for claude.ai and models.dev host permissions.
- Chrome installs extensions only from the Web Store; a page cannot install one directly.

## Brand Commitments

- Name: costmaxxing, always lowercase.
- Voice: plain and specific. Terminal-report wording rules carry over: "savings" (never "you save"), "price" (never "list price"), compact numbers, no cents.
- The closing line "What will you do when the subsidies end?" is Cohan's settled line.
- The maintainer works at Boundless, and the default comparison uses Boundless's public rates. The page carries a small, honest credit saying so and otherwise stays a neutral open-source tool page.

## Evidence on Hand

- The product itself: the extension popup and full report, rendered from synthetic team data (`site/static/popup-*.png`). Any page demonstration uses synthetic data and is labeled as an example.
- No customers, testimonials, press, benchmarks, or install counts exist. Do not invent them.

## Product Principles

1. Real numbers over pitches: show the report doing its job.
2. One action: install the extension. Everything else is secondary.
3. Neutral by construction: compare against any provider, disclose the Boundless default.
4. Nothing leaves the browser, and the page says so plainly.

## Accessibility & Inclusion

No product-specific requirement established. Meet WCAG 2.2 AA for contrast, keyboard use, and reduced motion.
