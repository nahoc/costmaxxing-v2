# Chrome Web Store listing

Upload `extension/costmaxxing-extension.zip` (from `npm run package -w extension`) and the two screenshots in `extension/store/`.

## Name

costmaxxing

## Summary (132 characters or fewer)

What your claude.ai team's usage costs at API prices, and on open-weight models. One click, for Owners. Nothing leaves your browser.

## Description

costmaxxing prices your claude.ai Team or Enterprise usage at API rates and shows what the same usage would cost on open-weight models.

Click the toolbar button while signed in to claude.ai as an Owner. The extension fetches your organization's spend report for the last 30 days through your browser's own claude.ai session, prices every person, product, and model with rates from models.dev, and shows:

- the yearly and monthly savings on a tiered open-weight plan
- what your seats cost against what the usage is worth at API prices
- cost by person and by product
- the same plan priced at several inference providers

The full report opens in a tab. Download CSV saves the spend report for the costmaxxing command-line tool (`npx costmaxxing import`).

Members who aren't Owners can't read the spend report, so the extension tells them the team view needs an Owner. For your own Claude Code and Codex usage, run `npx costmaxxing` in a terminal.

costmaxxing is open source under the MIT license.

## Category

Developer Tools

## Single purpose

Show a claude.ai organization Owner what their team's usage costs at API prices and on open-weight models.

## Permission justification

- `https://claude.ai/*`: reads the organization list and the Owner spend report export, using the signed-in session, after the user clicks the extension.
- `https://models.dev/*`: reads public model prices.

The extension requests no other permissions. It has no background script and no content scripts.

## Privacy

Nothing leaves the browser. The extension reads your claude.ai spend report and public prices, computes the report in the popup, and keeps nothing after you close it. It has no analytics, no telemetry, and no server.

Data usage answers for the developer dashboard:

- The report shows member emails and usage counts from your own claude.ai spend report. The extension handles them only inside the popup and the report tab and sends them nowhere. Check the dashboard's current definition of "collect" before you tick the boxes: data that never leaves the device is usually not collected.
- Sells no data and transfers none to third parties.
- Uses no data for purposes unrelated to the single purpose.
- Uses no data to determine creditworthiness or for lending.
