# Chrome Web Store submission

Everything the Chrome Web Store developer dashboard asks for, in the order it asks. Paste the values as written.

## 1. Register (once)

1. Open https://chrome.google.com/webstore/devconsole and sign in with the Google account that will own the listing. The account email can't be changed later.
2. Accept the developer agreement and pay the one-time registration fee.
3. Set the publisher name to `Cohan Carpentier` and verify the contact email.
4. If the dashboard asks for EU trader status, a free personal open-source project is a non-trader.

## 2. Upload

1. Run `npm run build -w extension`. It writes `extension/costmaxxing-extension.zip`.
2. Click **Add new item**, choose the zip, and click **Upload**.

## 3. Store listing tab

- **Description:**

  > costmaxxing shows how much your claude.ai team can save by moving from Anthropic to open-weight models.
  >
  > Install it while signed in to claude.ai as an Owner of a Team or Enterprise organization. Your team's report opens in a new tab right away: the last 30 days of usage priced at Anthropic's API rates, next to the same usage on a tiered open-weight plan (GLM-5.3, GLM-5.3 Flash, and DeepSeek V4.1 Flash).
  >
  > The report shows:
  > - yearly and monthly savings on open-weight models
  > - what your seats cost against what the usage is worth at API prices
  > - cost by person, by product, and by model
  > - the same plan priced at several inference providers
  >
  > Click the toolbar button for a quick view at any time, and use Download CSV to keep the spend report.
  >
  > Members who aren't Owners can't read the spend report, so the extension tells them the team view needs an Owner.
  >
  > Everything runs in your browser. The extension reads your organization's spend report from claude.ai with your own session and public prices from models.dev. It sends nothing anywhere else and has no analytics. It is open source under the MIT license: https://github.com/nahoc/costmaxxing-v2

- **Category:** Developer Tools
- **Language:** English
- **Store icon:** taken from the zip (128×128).
- **Screenshots (1280×800):** `extension/store/store-popup.png`, then `extension/store/store-report.png`.
- **Small promo tile (440×280):** `extension/store/promo-small-440x280.png`
- **Marquee promo tile:** leave empty (optional).
- **Video:** leave empty. If the dashboard insists, record a 30-second screen capture of the install opening the report.
- **Homepage URL:** https://costmaxxing.dev
- **Support URL:** https://github.com/nahoc/costmaxxing-v2/issues
- **Official URL:** optional. It needs costmaxxing.dev verified in Google Search Console first, and then shows a verified-publisher badge.
- **Mature content:** off.

## 4. Privacy tab

- **Single purpose:**

  > Show a claude.ai Team or Enterprise Owner what their team's usage costs at Anthropic's API prices and how much it would save on open-weight models.

- **Host permission justification:**

  > claude.ai: reads the organization list, the Owner spend report export, and the members export with the user's own signed-in session, when the user installs the extension or clicks it. models.dev: reads public model prices. The extension requests no other permissions.

- **Remote code:** No, I am not using remote code.
- **Data usage, collected types:** tick
  - **Personally identifiable information:** the spend report lists member email addresses.
  - **Financial and payment information:** the spend report lists spend per member.
  - **Website content:** the extension reads the spend report from claude.ai.

  The extension handles these in the browser only. The Chrome Web Store user data FAQ says data handled locally still has to be disclosed.
- **Certifications:** tick all three: no selling or transferring user data outside the approved use cases, no use unrelated to the single purpose, and no use for creditworthiness or lending.
- **Privacy policy URL:** https://github.com/nahoc/costmaxxing-v2/blob/main/PRIVACY.md

## 5. Distribution tab

- **Payments:** free.
- **Visibility:** Public.
- **Regions:** all regions.

## 6. Test instructions tab

> The extension needs a claude.ai Team or Enterprise organization where the signed-in account is an Owner, because only Owners can export the spend report. Without one, installing opens a tab that asks you to sign in to claude.ai (signed out) or explains that the team report needs the Owner role (signed in as a member). Both messages are expected. With an Owner account, the tab shows the team's savings report, and the toolbar popup shows the same report with Open full report and Download CSV buttons. An example of the report with synthetic data is on https://costmaxxing.dev.

## 7. Submit

Click **Submit for Review**. Review time varies. After approval you have 30 days to publish if you chose deferred publishing.

## Ship 1.0.1 with the new icon

Version 1.0.0 went to review with the old green icon. Version 1.0.1 adds the purple pixel computer icon at every size. After 1.0.0 is approved, open the item, choose **Package**, upload the new `extension/costmaxxing-extension.zip`, replace the small promo tile with the current `extension/store/promo-small-440x280.png`, and submit again. The store icon comes from the zip.

## After approval

Point the landing page's button at the listing:

```
vercel env add STORE_URL production --scope boundless-network
```

Use the listing's `https://chromewebstore.google.com/detail/...` link as the value, then redeploy production from the Vercel dashboard or push any commit. The button then reads "Add to Chrome" instead of downloading the zip.
