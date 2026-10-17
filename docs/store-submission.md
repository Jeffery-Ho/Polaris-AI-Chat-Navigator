# Store submission

First listings on the Edge Add-ons store and Firefox Add-ons (AMO) are manual. This repository does not run `wxt submit`, and `.github/workflows/release.yml` still publishes only the Chrome GitHub Release assets (`Polaris-AI-<version>-build-<build>.zip` and `Polaris-AI.zip`).

Pull requests run `.github/workflows/ci.yml` (`pull_request` and `workflow_dispatch`). That job builds Chrome, Firefox, and Edge, zips Firefox and Edge, and runs `web-ext lint` on `.output/firefox-mv3`. Lint errors fail the job; warnings do not. The job uploads a `store-packages` artifact and does not create a GitHub Release.

## Packages to upload

`pnpm zip:firefox` and `pnpm zip:edge` write these files under `.output/`. The same files are in the `store-packages` artifact. `<version>` is `manifest.build.json` `version` (currently `0.73.4`).

| Store | Upload this file | Do not upload |
| --- | --- | --- |
| Firefox AMO, add-on file | `.output/polaris-ai-chat-navigator-<version>-firefox.zip` | the sources zip, `dist/`, or `Polaris-AI.zip` |
| Firefox AMO, source code | `.output/polaris-ai-chat-navigator-<version>-sources.zip` | — |
| Edge Partner Center | `.output/polaris-ai-chat-navigator-<version>-edge.zip` | `Polaris-AI.zip` |

The Firefox sources zip is produced only by `pnpm zip:firefox`. It contains `entrypoints/`, `public/`, `src/`, `scripts/`, `manifest.build.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `wxt.config.js`, `README.md`, and `LICENSE`. It does not contain this document.

### AMO rebuild

Reviewers compare a local rebuild with the uploaded add-on. The sources zip has no `package-lock.json`. Use Corepack and pnpm `11.19.0` (`packageManager` in `package.json`). Node.js 22 or newer is required; AMO's default reviewer image is Ubuntu with Node 24.14.0 and npm 11.9.0, and Node 24 satisfies that range, but npm cannot install this lockfile.

Put this in the AMO source-code notes as well as relying on `README.md`:

```bash
corepack enable
pnpm install
pnpm build:firefox
```

Review `.output/firefox-mv3/`. `pnpm install` also builds the Chrome package into `dist/` when it is not running in CI. That directory is not the Firefox add-on.

`polaris@hos.dev` (`GECKO_ID` in `wxt.config.js`) is permanent once AMO signs the first version. A different id is a different add-on, and existing users will not receive updates. Do not change it after the first upload.

On the AMO compatibility step, select desktop Linux, macOS, and Windows only. The manifest sets `strict_min_version` to `140.0` and does not declare a separate Android range. `web-ext lint` warns that Firefox for Android 140 does not support `data_collection_permissions` (Android support for that key starts at 142). Do not offer the add-on on Firefox for Android.

## Privacy policy

Use this URL on both stores:

https://jeffery-ho.github.io/Polaris-AI-Chat-Navigator/privacy-policy.html

The page was reachable when this note was written. Effective date on the page: August 28, 2026. It describes local processing of AI-answer text, `storage.sync` preferences, user-initiated diagnostic email, and no sale or transfer of page content.

The storage section names Chrome Sync. Firefox uses the same `storage.sync` API and, when the user has Firefox Sync enabled, syncs those preferences through Mozilla rather than Google. The developer still cannot read them. The URL remains the right policy to submit; say that in the reviewer notes if a reviewer asks about the Chrome wording.

## Permission justifications

Paste one block per permission. Host permissions share one justification; repeat it for each origin the form lists.

### `storage`

Saves the user's display preferences (heading levels, list markers, and group size) with `storage.sync`, and keeps a bounded diagnostic log plus in-panel dismissal flags in local storage. The developer does not receive storage contents. Sync, when the user has it enabled, is performed by the browser account.

### `tabs`

Identifies the active supported tab, follows tab activation and updates so the sidebar stays on that conversation, and sends messages to the content script in that tab.

### `scripting`

Injects this extension's packaged content script and stylesheet into a supported tab when the background script has to read that page. No remote script is injected.

### `sidePanel`

Opens the Polaris side panel when the toolbar icon is clicked. Present in the Edge (and Chrome) manifest only. The Firefox manifest removes it and opens `sidebar_action` instead. If the Edge form lists it, use this text. It will not appear on the Firefox form.

### Host permissions

Reads the conversation currently shown on this origin, inside the browser, to list headings and scroll to them. Page content is not transmitted. The extension does not request any other sites.

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://grok.com/*`
- `https://manus.im/*`
- `https://chat.deepseek.com/*`
- `https://www.doubao.com/*`
- `https://www.kimi.com/*`
- `https://kimi.com/*`
- `https://www.qianwen.com/*`
- `https://qianwen.com/*`
- `https://yb.tencent.com/*`
- `https://yuanbao.tencent.com/*`
- `https://diandian.xiaohongshu.com/*`
- `https://www.xiaohongshu.com/*`
- `https://www.askdiandian.com/*`
- `https://www.diandianlife.top/*`

## Data collection

Declare that the extension does not collect or transmit personal data.

Polaris reads the currently mounted AI-answer DOM on the hosts above only to build a navigation outline. That text stays in the browser and is not sent to the developer or to any other server. There is no analytics, advertising, or remote code in the extension. Preferences remain in browser storage. A diagnostic log stays in the tab until the user downloads it or chooses to attach it to an email; the extension does not upload it. A separate support website, linked from the panel, loads analytics only after the visitor consents; that site is not part of the extension package.

The Firefox manifest already says this:

```json
"data_collection_permissions": { "required": ["none"] }
```

Mozilla uses that key for data collected and transmitted outside the extension. Do not add `websiteContent` unless the extension starts sending page content off the device. `technicalAndInteraction` is only for optional telemetry; this package does not send any.

On Edge, choose no collected-data categories. Select **No, I am not using remote code**. Certify the limited-use statements (no sale or transfer outside the product's purpose, no use for creditworthiness or lending). Still submit the privacy policy URL, because the extension accesses page content even though it does not transmit it.

Single purpose, for the Edge privacy form: Polaris shows an in-browser outline of headings and list titles in AI chat answers on a fixed set of sites, and jumps to the matching section.

## Listing images

Manifest icons already packaged: 16, 32, 48, and 128 PNG (`icons/gpt-voyager-icon-*.png`). A 512 and a 1024 PNG are also in `public/icons/` and can be scaled for store-only assets. The manifest `description` is 91 characters.

### Firefox

- Icon: PNG, 128×128 (in the package). AMO also accepts 32×32 and 64×64. The package has 32, not 64; scale the 1024 source if the form asks for 64.
- Screenshots: PNG or JPEG. Current addons-server preview limits are a 4:3 image, minimum 1000×750, full size 2400×1800. The older Extension Workshop page still recommends 1280×800 (1.6:1); that ratio fails the upload check.
- Summary: 250 characters maximum. The manifest description fits. The longer listing description is entered on AMO and is not copied as a read-only manifest field.
- Add-on file and source zip: 200 MB maximum each.

### Edge

Partner Center requirements from the current Microsoft Edge publish documentation:

- Extension logo: required, square, minimum 128×128, recommended 300×300. The packaged 128 icon meets the minimum; make a 300×300 PNG from `public/icons/gpt-voyager-icon-1024.png` for the recommended asset.
- Screenshots: optional, at most 6, each exactly 640×480 or 1280×800.
- Small promotional tile: optional, 440×280.
- Large promotional tile: optional, PNG, 1400×560.
- Store description: required, 250–10,000 characters. Partner Center copies the manifest name and description onto the listing and treats those fields as read-only. The manifest description is 91 characters, so lengthen that manifest field in a later version before the first Edge upload, or the listing step cannot reach 250 characters.

## Later: `wxt submit` secrets

Do not add a submit job yet. `wxt submit` cannot create the first listing. After both stores have a listing, GitHub Actions secrets for `pnpm wxt submit` (publish-extension 6.2.0, the CLI shipped with WXT 0.21.4) are the flag names in `UPPER_SNAKE_CASE`. Keep them in GitHub secrets or a local `.env.submit`. Do not commit `.env.submit`.

Chrome, API v2 (what this CLI prefers):

- `CHROME_EXTENSION_ID`
- `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`

`CHROME_SERVICE_ACCOUNT_ACCESS_TOKEN` can replace the email and private key. `CHROME_PUBLISHER_ID` is optional. The older API v1.1 names still work but are marked deprecated: `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.

Firefox, from the AMO API credentials page:

- `FIREFOX_EXTENSION_ID` (confirm the id AMO shows after the first manual submission; it should be `polaris@hos.dev` when that gecko id was uploaded)
- `FIREFOX_JWT_ISSUER`
- `FIREFOX_JWT_SECRET`

Edge, from Partner Center Publish API v1.1. The product id exists only after the manual listing is created. The API key expires and has to be rotated.

- `EDGE_PRODUCT_ID`
- `EDGE_CLIENT_ID`
- `EDGE_API_KEY`

`EDGE_CLIENT_SECRET` and `EDGE_ACCESS_TOKEN_URL` belong to the removed API v1.0 and are deprecated in this CLI.

A dry run, once those secrets exist, would pass the zips explicitly:

```bash
pnpm zip
pnpm zip:firefox
pnpm zip:edge
pnpm wxt submit --dry-run \
  --chrome-zip .output/polaris-ai-chat-navigator-<version>-chrome.zip \
  --firefox-zip .output/polaris-ai-chat-navigator-<version>-firefox.zip \
  --firefox-sources-zip .output/polaris-ai-chat-navigator-<version>-sources.zip \
  --edge-zip .output/polaris-ai-chat-navigator-<version>-edge.zip
```

`pnpm zip` is the Chrome file for that command. It is not the `Polaris-AI.zip` asset the landing page downloads, and the check workflow does not build it.
