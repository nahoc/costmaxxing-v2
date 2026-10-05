# openmaxxing privacy policy

Last updated: 2026-10-04

openmaxxing is an open-source Chrome extension and command-line tool that prices AI usage at API rates. This policy covers the Chrome extension. Nothing the extension reads leaves your browser.

## What the extension reads

When you install the extension, and each time you click its toolbar button, it reads:

- **Your claude.ai organizations** from `https://claude.ai/api/organizations`, through your existing claude.ai session in this browser.
- **Your organization's spend report** from claude.ai, which only Owners can export. The report lists each member's email address, the claude.ai products and models they used, request and token counts, and spend.
- **Your organization's members export** from claude.ai, when claude.ai provides it, to count Premium and Standard seats.
- **Public model prices** from `https://models.dev/api.json`.

## What it does with that data

The extension prices the spend report in your browser and shows the result in its popup and in a report tab. If you click **Download CSV**, it saves the spend report to your computer as a file.

## What it does not do

- It does not send the spend report, member emails, or any other data to the developer or to any third party.
- It does not store the data. The report exists only while the popup or report tab is open.
- It has no analytics, telemetry, tracking, or advertising.
- It does not read your claude.ai conversations, cookies, or credentials. Requests go to claude.ai with your browser's own session, the same way the claude.ai website makes them.
- It does not sell or transfer user data, and does not use it for any purpose other than showing you the report.

## Permissions

The extension asks for access to two sites only: `claude.ai`, to read the reports above, and `models.dev`, to read public prices. It asks for no other permissions.

## Changes and contact

Changes to this policy are published in this file, with a new date at the top. Questions and reports go to the issue tracker at https://github.com/nahoc/openmaxxing/issues.
