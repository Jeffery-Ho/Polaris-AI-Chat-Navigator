# Polaris: AI Chat Navigator

A Chrome extension for finding, reading, and saving parts of long AI conversations.

Long chats are hard to revisit. Polaris organizes the open conversation into a **Table of Contents** so you can return to an earlier question, jump to a section, and keep the parts you need.

It is an independent browser extension. It is not affiliated with, endorsed by, or approved by the websites it reads.

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/polaris-ai-chat-navigator/lkdbbnpcfkjdfnopecpbdaeegncdmajb), or load an unpacked build from this repository (see [Development](#development)). Product pages and the [Privacy Policy](https://polaris-ai.work/privacy.html) live on [polaris-ai.work](https://polaris-ai.work/).

## What it does

**Browse by question.** The table of contents groups detected headings from replies under your questions. Expand a group and select an entry to jump to that place in the page, instead of scrolling back and forth.

**Read by section.** Switch to **Outline** for an expandable hierarchy. Focus on a section, copy its text, or locate it in the original conversation. Search filters **section titles**; it is not a full-history or full-body search of every message.

**Copy and export.** Copy questions and replies Polaris has already read, or save them as Markdown or HTML for notes. Exports cover content loaded from the page and read by Polaris. Earlier messages that have not loaded may be missing. PDF export is not available.

**Local processing, online license checks.** Building the table of contents, reading sections, and writing export files happen in your browser. Conversation text is not uploaded to Polaris servers. Trial start and license validation call a licensing service, so Polaris is not a fully offline tool.

Click the toolbar icon to open the sidepanel. It follows the active supported tab and contains Table of Contents, Outline, and Settings. Chrome 114+ (Side Panel API) is required. Standalone popup windows are not supported.

Settings includes Pro and license. A trial can unlock every site and long conversation mode for a limited time; after that, Free use is two replaceable platforms. Current amounts and dates appear in the panel when the license service responds.

## Supported websites

Adapters currently cover ChatGPT, Claude, Gemini, Grok, Doubao, Kimi, Qwen, Tencent Yuanbao, Xiaohongshu Diandian AI, Manus, and DeepSeek. Detection depends on each site’s page structure; site updates can break compatibility.

The host list lives in [`src/supported-sites.js`](src/supported-sites.js) (`SUPPORTED_MATCHES`). That file is the only source for content-script matches, host permissions, and web-accessible resource matches.

Manus reads mounted message DOM in the conversation list. Replies are grouped by user turn; task status, tool controls, suggestions, and upgrade cards are excluded.

DeepSeek reads mounted virtual-list messages. Final-answer Markdown is grouped with the preceding user message when virtual item keys are consecutive. Thinking, disclaimers, controls, and unrelated page chrome are excluded. Missing user messages stay ungrouped.

## Development

`dist/` is the Chrome package Chrome should load. It is not committed. After cloning, run this once:

```bash
corepack enable
pnpm install
```

The package manager is **pnpm** (`packageManager` in `package.json`; lockfile `pnpm-lock.yaml`). Node.js 22 or newer is required. `pnpm install` builds `dist/` and enables the git hooks in `.githooks/`. Then open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose the `dist/` directory.

Do not load the repository root. The root is source, not an extension package. `manifest.build.json` is the product manifest source; WXT generates entrypoint paths. Do not add a root `manifest.json`.

After the first install, `dist/` stays current without a manual build. Switching branches, merging, pulling, and rebasing run `pnpm build`, and run `pnpm install` only when `pnpm-lock.yaml` changed. Click **refresh** on the Polaris card in `chrome://extensions` to load the new files. A checkout of individual files does not rebuild. If a rebuild fails, git still finishes and prints a `[Polaris]` warning; run `pnpm build`, then click refresh.

While editing, run `pnpm dev` to start WXT with an isolated Chromium window and automatic reload. Development files live in `.output/chrome-mv3-dev/` and do not replace `dist/`. Chrome/Chromium must be installed; use an ignored `web-ext.config.js` to select a custom binary. The development profile is separate from your everyday browser profile.

```bash
pnpm build        # Chrome production package in dist/
pnpm build:edge   # Edge package under .output/
pnpm build:firefox
pnpm zip          # store zips in Release/wxt/ (also zip:edge, zip:firefox)
pnpm check        # node --check on src/, public/src/, scripts/, entrypoints/
pnpm test         # node --test (jsdom); package tests read dist/, so build first
```

The project uses WXT 0.21.4, JavaScript, pnpm, and Node.js 22+. `entrypoints/` contains the WXT background, content script, and `sidepanel/` inputs; each calls an initializer in `src/`. WXT generates entrypoint paths from `wxt.config.js`. `manifest.build.json` supplies product metadata, permissions, web-accessible resources, and versions. Static icons and the route bridge live in `public/` and keep their existing extension URLs.

Polaris requires Chrome 114 or a compatible Chromium browser with the Side Panel API. `pnpm build:firefox` emits a Firefox package that uses `sidebar_action` (Gecko 140+). This repository does not treat Edge or Firefox store listings as confirmed unless you verify them separately.

## Layout

- `entrypoints/`: thin WXT shells that call initializers in `src/`.
- `src/content.js`: per-site DOM detection and heading extraction.
- `src/window.js` / `src/window.css`: sidepanel UI, exported as `initializeSidepanel()`.
- `src/background.js`: service worker; tracks the source tab, injects scripts, relays snapshots and commands.
- `src/*-messages.js`, `src/marker-*.js`, `src/sidepanel-chapter-*.js`: single-purpose modules.
- `src/i18n.js`: en/zh strings via `createI18n()`. `src/release-notes.js`: in-panel What's New entries.
- `src/supported-sites.js`: `SUPPORTED_MATCHES`.
- `public/`: static files copied as-is (`icons/`, `src/route-bridge.js`).
- `test/`: one `*.test.js` per module or platform.
- `workers/`: license-service Workers used for trial and license checks. Conversation text is not sent there.

## Heading detection

Entries in the table of contents come from currently mounted conversation DOM. The UI and source call these jumpable entries Makers. User input editors (`textarea`, `contenteditable`, ProseMirror) are excluded. A route change clears the previous list; removed DOM removes its entries.

- Headings follow per-site level limits in [`guideline.md`](guideline.md).
- Unordered-list titles use a separate **Unordered Lists** setting.
- Ordered-list titles use **Ordered list**, off by default on every site.
- Standalone bold text and bold-first list titles use **Bold text**, on by default.
- Visible response tables become one H3-level entry, titled from the first row’s non-empty cells.
- Default heading levels: Kimi and Yuanbao H1–H2; Xiaohongshu Diandian AI H1–H4; the other listed sites H1–H3.
- Qwen video-list titles and Yuanbao large video cards can also appear.

Preferences for these filters, user-group limit, and fold group size are stored in `chrome.storage.sync`. Feature-version upgrades can show What's New in the sidepanel; patch versions do not.

## Outline and search

Outline rebuilds currently mounted reply content with a strict element and URL allowlist. Input fields, sidebars, and the extension UI are excluded. Chapter menus copy only that chapter. `Cmd/Ctrl+F` focuses the current title-search box; `Cmd/Ctrl+Shift+F` opens Outline.

Light and dark styling follow the system theme. **Help and diagnostics** can download a redacted, current-tab log (version, coarse platform/browser, viewport, interaction timings). It is designed to omit AI text, titles, full URLs, account data, prompts, and stack traces. Sending diagnostics opens an email draft; attach the file yourself.

## Long conversations

Preferences offers two reading modes on supported sites:

- **Standard mode** (default): the directory follows currently mounted messages. When the website removes a message from the DOM, Polaris drops it from navigation and exports.
- **Long conversation mode** (Pro/trial): messages the website has already loaded can stay in this page’s memory for navigation, Outline, and export after their DOM nodes unmount. Optional backfill, with explicit consent, uses only the site’s own list scrolling or “load earlier” control. Shared conversations are never backfilled. Polaris does not call website conversation APIs, read account tokens, or rewrite network requests.

Refresh, close the tab, switch chats, or return to Standard mode to release that in-memory index. Reaching the top of a virtual list is not treated as proof of a complete history. Title search remains the default filter; loaded-message text matching exists only in this mode and only for content Polaris has already retained.

## Privacy

Conversation text used for navigation, Outline, copy, and export is processed in the current page. It is not written to disk, synced, or uploaded for those features. License installation and activation credentials stay in `chrome.storage.local` and are not synced. Diagnostic files are user-initiated and local.

See the [Privacy Policy](https://polaris-ai.work/privacy.html). That policy describes data handling; it is not a warranty of safety, compliance with any AI provider’s terms, or uninterrupted compatibility.

## Support

- Website: [polaris-ai.work](https://polaris-ai.work/)
- In-extension support entry: [polaris-ai.work/entry/extension/](https://polaris-ai.work/entry/extension/)
- Issues: [GitHub Issues](https://github.com/Jeffery-Ho/Polaris-AI-Chat-Navigator/issues)

Marketplace copy rules live in [store-listing.md](store-listing.md). Current package version: `1.6.2(447)` (`version` / `version_name` in `manifest.build.json`).

## Release

Do not commit `dist/` or load `dist.zip` as the extension. The release workflow builds from source and publishes a versioned ZIP plus the stable `Polaris-AI.zip` alias from a fresh `dist/` (`cd dist && zip`). It also attaches WXT store packages from `pnpm zip`, `pnpm zip:edge`, and `pnpm zip:firefox`. Locally, those commands write to `Release/wxt/`. Git hooks do not run in CI.

## License

[MIT](LICENSE)
