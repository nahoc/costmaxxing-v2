---
version: 1
slug: "extension-static-report-html"
primary_target: "extension/static/report.html"
related_targets: ["extension/static/popup.html"]
---

# Extension report

Scope: the extension's full report tab (`extension/static/report.html`) and its toolbar popup (`popup.html`), visitor mode Operate. Audience: a claude.ai Team or Enterprise Owner who just installed openmaxxing or clicked its button. Task: understand what the team's usage is worth at Anthropic's API prices, what it would cost on open-weight models, and how much the seats subsidize it; then keep the CSV. Sections: savings and subsidy first, then People, Products and models, Providers, Forecast and method. States: loading with real progress steps, signed out, not an Owner, failed request, and the report. Constraints: MV3 CSP (no inline scripts), host permissions for claude.ai and models.dev only, fonts bundled in the extension, every number from core.

## Direction contract

THESIS: The report is a one-page memo to the Owner in a single document window on the purple 1-bit desktop. Its first paragraph states the savings and the subsidy in plain sentences; tables follow as sections. It refuses the generic dashboard of cards, KPI tiles, and pie charts.

OWN-WORLD: The landing page's world exactly, as DESIGN.md records it: dark purple ink (#2e1065) on white, dithers for every middle tone, zebra for usage above a seat, one-pixel-unit chrome, Jersey 15 and Geist Pixel at three sizes, pixel icons from the shared sprite, and system dialogs for every non-report state.

STORY: The tab opens on a loading dialog that names each real step (finding the organization, fetching the spend report, checking seats, pricing the requests) on a dithered progress bar. The memo then opens: a display-size sentence with the yearly savings, a sentence on seats against API worth, three figures, and sections the Owner scrolls through. It closes on "What will you do when the subsidies end?" with Download CSV.

FIRST VIEWPORT: The menu bar with File > Download CSV. One centered document window titled with the org name, a word-processor ruler under its title bar, the savings headline at display size, the subsidy sentence, the Anthropic, open-weight, and savings figures in a row, and the top of the People table in view. The popup shows the same first paragraph and figures with Open Full Report as the default button and Download CSV beside it.

FORM: word-processor memo (dealt structure 5, "The Memo"), surface seed key 148033a2, chosen by the user. Signature: inline figures open Get Info windows with the exact amount and its math, as on the landing page; page-break rules separate sections; the cursor becomes a wristwatch while loading. Motion is stepped only, and reduced motion shows each state settled.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
