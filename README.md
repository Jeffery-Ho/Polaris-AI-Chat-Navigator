# Polaris: AI Chat Navigator

A browser extension that adds section navigation to AI-generated web responses.

Polaris: AI Chat Navigator automatically detects headings and list titles in AI responses and displays them in the browser sidepanel. Click a Maker to jump directly to the corresponding section—ideal for reading long answers, reports, step-by-step guides, and research results.

## Development

`dist/` is the only extension package Chrome should load, and it is not committed. After cloning, run this once:

```bash
corepack enable
pnpm install
```

`pnpm install` builds `dist/` and enables the git hooks in `.githooks/`. Then open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose the `dist/` directory.

After that, `dist/` stays current without a manual build. Switching branches, merging, pulling, and rebasing run `pnpm build`, and run `pnpm install` only when `pnpm-lock.yaml` changed. Click **refresh** on the Polaris card in `chrome://extensions` to load the new files. A checkout of individual files does not rebuild. If a rebuild fails, git still finishes and prints a `[Polaris]` warning; run `pnpm build`, then click refresh.

While editing, run `pnpm dev` to start WXT with an isolated Chromium development window and automatic extension reload. Development files live in `.output/chrome-mv3-dev/` and do not replace `dist/`. Chrome/Chromium must be installed; use an ignored `web-ext.config.js` to select a custom binary. The development profile is separate from your everyday browser profile.

Run `pnpm build` to generate the production extension in `dist/` for Dia or Chrome, then refresh the extension and conversation tabs. Run `pnpm check` and `pnpm test` after building; package tests read `dist/`.

The project uses WXT 0.21.4, JavaScript, pnpm, and Node.js 22 or newer. `entrypoints/` contains the WXT background, content script, and `sidepanel/` inputs; each calls an initializer in `src/`, where reusable behavior stays. WXT generates entrypoint paths from `wxt.config.js`. `manifest.build.json` supplies product metadata, permissions, web-accessible resources, and versions, and `src/supported-sites.js` is the single list of supported sites for content script matches, host permissions, and resource matches. Static icons and the route bridge live in `public/` and keep their existing extension URLs. `pnpm check` syntax-checks every script under `src/`, `public/src/`, `scripts/`, and `entrypoints/`.

Do not load the repository root. The root is source, not an extension package. `manifest.build.json` is the product manifest source; WXT generates entrypoint paths. A root `manifest.json` must not be added back.

Polaris requires Chrome 114 or a compatible browser with the Side Panel API. Standalone windows and fallback popup windows are no longer supported.

## Supported Platforms

- ChatGPT
- Claude
- Gemini
- Grok
- Doubao
- Kimi
- Qwen
- Yuanbao
- Xiaohongshu Diandian AI
- Manus
- DeepSeek

Manus navigation reads only mounted message DOM inside the conversation list. All AI text replies are grouped by their user turn; task status, tool controls, suggestions, and upgrade cards are excluded.

DeepSeek navigation reads only mounted messages inside its virtual list. Final-answer Markdown is grouped with the preceding mounted user message when virtual item keys are consecutive; thinking content, disclaimers, controls, and unrelated page content are excluded. Chapters use the user prompt as the root title and keep answer introductions and subchapters under that prompt. Missing user messages and gaps remain ungrouped, and Makers follow the inner conversation scroller.

## Marker Rules

- Automatically detects H1, H2, H3, and H4 headings according to platform-specific rules.
- Detects headings in unordered lists across all supported platforms, controlled by a separate **Unordered Lists** setting.
- Detects ordered-list titles when the separate **Ordered list** setting is enabled; it is disabled by default on every platform.
- Detects standalone bold text and bold-first list titles when the separate **Bold text** setting is enabled; it is enabled by default on every platform.
- Detects every visible response table across all supported platforms as one H3-level marker, titled from its first row's non-empty cells; every Maker locates the nearest conversation scroll container and preserves space for the fixed header.
- Kimi and Yuanbao display H1 and H2 markers by default.
- ChatGPT, Claude, Gemini, Grok, Doubao, Qwen, Manus, and DeepSeek display H1, H2, and H3 markers by default.
- Xiaohongshu Diandian AI displays H1, H2, H3, and H4 markers by default.
- Video titles in Qwen video lists and Yuanbao large video cards can also appear as markers.

## Features

- Click the browser extension icon to open the Polaris browser sidepanel. It follows the active supported tab and contains **Table of Contents**, **Outline**, and Settings.
- In the default mode, Maker navigation is generated only from currently mounted user and AI response DOM. A route change removes the previous list immediately; only a later non-Polaris page mutation can populate the new list. DOM removal also removes its Makers, and a DOM remount receives new runtime keys.
- Progressive Maker rendering begins during streaming output as soon as the first non-empty supported marker is available; fixed 120ms render batches reuse existing Maker nodes and update only changed items, preserving list scrolling, focus, hover, and manual collapse state. Wheel, trackpad, or list-drag input on a Maker or group card immediately takes control from temporary Active Maker positioning, so any Maker can remain outside the list viewport while streaming continues.
- Click-to-jump navigation, active-section highlighting, and a scrollable marker queue.
- Sidepanel Outline reads as an expandable tree. Each bullet opens chapter actions: focus a subtree, locate its source, copy the chapter, or copy all chapter content. Search and returning to an ancestor preserve the reading state within the panel session.
- User Maker tooltips show the first message image; clicking that image opens an in-page preview, with previous/next navigation for multi-image messages. The Maker capsule itself remains an expand/collapse control.
- Visible titles inside AI markers, user groups, and the floating active marker are left-aligned; user group capsules remain on the queue's right edge while AI markers and folded stacks remain on the left.
- Platform-specific marker filters for H1, H2, H3, H4, bold text, unordered lists, and ordered lists.
- Settings synchronization through `chrome.storage.sync`.
- Settings opens six separate icon cards: **Preferences**, **Help and diagnostics**, **Feedback**, **What's New**, **About**, and **Privacy Policy**. The policy opens directly from Settings in a new tab. Back and Escape return through the menu, preserving the previous Table of Contents or Outline view, search focus, and reading position. Preferences keep live controls during conversation updates.
- **About** centers the 40px app icon, name, and actual version; adds a short product introduction, developer credit, and thanks; and lists all 11 supported platforms with their bundled icons.
- **Feedback** keeps GitHub Issues and developer email as text rows, with personal X and Xiaohongshu profiles in a separate horizontal icon row with hover hints and accessible labels. Profile links open in a new tab.
- Light and dark adaptive glass styling, with lightweight blur and saturation on Maker cards and the floating Active Maker while controls and search retain the full displacement effect.
- Native browser scrolling on Maker, user-group, and fold cards, without custom wheel animation or a transparent extended hit area.
- Fuzzy title search for both Table of Contents and Outline, with `Cmd/Ctrl+F` focusing the current search box.
- Long marker queues are grouped into stacks of `N` markers (default 20). Each stack starts expanded and shows its first title with the remaining count; clicking its card manually collapses or expands the Maker rows.
- Currently mounted user maker groups show the latest 20 groups by default, with search covering those mounted groups. Every group starts expanded, including the latest, previous, and newly streamed groups; an explicit click can manually collapse its contents.
- An active Maker does not change its stack or user group state. Manual collapse keeps the Maker selected, and dragging more than 4px from any Maker or group card scrolls the list without triggering that card's click action.
- Pointer dragging captures the active pointer and recovers after window blur, page hiding, lost capture, route changes, or a narrow-viewport boundary; an interrupted control drag rolls back its unsaved position.
- **Help and diagnostics** provides four illustrated steps for sending a redacted, current-tab diagnostic log. **Send diagnostics** downloads the JSON and opens a pre-addressed email; attach the downloaded file manually. **Download diagnostics** saves the file without opening email.
- **Outline**, which organizes AI response content by marker section for convenient reading and copying on every supported platform.
- A heart-shaped support entry at the right edge of the About & Settings header, opening the same-origin [Polaris support entry](https://jeffery-ho.github.io/polaris-landing/entry/extension/) in a new tab. The entry preserves the fixed `polaris_extension` source without relying on UTM parameters; the landing page loads optional GA4 and SLS analytics only after the visitor explicitly consents.
- Update notes place the same heart-shaped support entry as the leftmost feedback action, opening the support page in a new tab.
- While Outline is open, its modal blocks arrow, Home, and End keys from changing the underlying main tab; `Shift + ← / →` continues to switch chapters outside editable fields.
- Outline safely preserves rendered Markdown structure, including headings, nested and task lists, quotes, code, links, image labels, and wide tables.
- Complete raw Markdown pipe tables are also formatted in Outline when a source page leaves them unrendered.

## Settings

Feature-version upgrades show update notes inside the sidepanel when you open it. Dismissing the dialog marks that feature version as read; patch upgrades do not show it again. Select **What's New** in Settings to read the current feature-version notes on their own page.

Open **Settings** from the Polaris sidepanel to adjust:

- User group limit
- Fold group size
- H1, H2, H3, H4, bold-text, unordered-list, and ordered-list marker visibility for the current platform

Preferences are saved to `chrome.storage.sync`.

The Diagnostics section keeps a bounded session-only event log in the current tab. It records version, coarse platform/browser information, viewport and DPR, drag lifecycle, route/render counts, error names, and local interaction timings. It excludes AI text, titles, full URLs, account information, prompts, and stack traces.

## Outline

- Click **Outline** in the Polaris sidepanel.
- Available on every supported platform: ChatGPT, Claude, Gemini, Grok, Doubao, Kimi, Qwen, Yuanbao, Xiaohongshu Diandian AI, Manus, and DeepSeek.
- Reads currently mounted conversation content and rebuilds supported rendered Markdown with a strict element and URL allowlist; input fields, sidebars, and the extension's own interface are excluded.
- Expand chapters inline with the triangle controls. Open a chapter's bullet menu to focus its subtree, locate the original source, or copy content. Use the chapter path to return while preserving the reading position.
- Use the copy button at the top right of the Outline content area to copy the conversation, then optionally export Markdown or a standalone HTML file. Copies and exports include only loaded messages retained by the selected reading mode; earlier history may be missing. Chapter menus copy only that chapter. Exported files end with a local-export attribution using the published extension name. PDF export is not available.
- Search chapter titles from the sidepanel search field, or use `Cmd/Ctrl+F`; `Cmd/Ctrl+Shift+F` opens Outline. Matching is Unicode-aware and uses the existing fuzzy title search.
- Preserves the current chapter and reading position as a reply updates. AI images appear as labels with source location instead of preview downloads.

## Page-memory conversation indexing

Preferences offers two modes on supported platforms:

- **Standard mode** (default): the directory follows currently mounted messages. When the website removes a message from its DOM, Polaris removes it from navigation, search data and exports.
- **Long conversation mode** (Pro/trial): messages loaded by the website accumulate in the current page's memory. With the user's explicit consent (asked when the mode is first enabled, changeable in settings), Polaris backfills the user's own open conversation once per index: it renders messages the website has already delivered to the browser by scrolling only the website's own message container (older first, then newer) or pressing its own "load earlier" control, while the list is hidden beneath a still cover, then restores the reader's position. Shared conversations are never backfilled; it pauses while the page is hidden, and any wheel, pointer, touch or key input stops it. The directory, Outline, text search and exports can use these retained records even after their original DOM nodes unmount. Refreshing, closing the page, switching chats or returning to Standard mode releases the accumulated history.

Previous `historyMode: "complete"` preferences migrate to `"loaded"`. Standard mode never loads history. Long conversation mode's masked backfill is the only operation that moves the website list, and only while it is hidden; each step waits up to 2 seconds for in-view virtual-list rows to render, and it pauses after 90 seconds of visible activity or 600 steps with a **Continue loading** action, and reaching the top is never treated as proof of complete history. Polaris does not intercept or rewrite website requests, read account tokens, or access React/webpack internal state. It does not call private conversation or authentication endpoints. An already mounted original can be located and highlighted normally. If it is no longer mounted, **Read in Outline** opens the retained message without loading history; **Back to TOC** preserves the search and list position.

Page mutations are batched, unchanged message bodies and index records are reused, and only affected messages are reparsed. Long conversation mode remains off by default. Its initial index build publishes readable batches: the progress card stays above the growing Maker list, and the sidebar scrolls to the earliest indexed content once the first batch is available. Later batches preserve the sidebar's reading position. This alignment only scrolls Polaris; it does not navigate or scroll the website conversation. The progress card remains limited to the initial index build. Settings shows **Retry reading** for failed reads only. **Clear and rebuild this index** requires confirmation, releases the current page's retained history and rebuilds from mounted messages; unmounted content leaves navigation, search and export. This operation does not reload the website or touch its storage.

Search and exports explicitly describe their loaded-message scope. Polaris never fetches conversation data itself; exports wait until a running backfill finishes. The index preserves structured public user/assistant content, code, tables, image descriptions and attachment labels. Images are indexed as metadata rather than downloaded for indexing. Search uses normalized Unicode substring matching with paginated results. Polaris virtualizes its own directory, search results and Outline blocks; it does not replace or rebuild the website's conversation list. Unsupported or ambiguous DOM anchors produce a location notice.

## Privacy

Conversation indexing stays in the current page's memory; it is neither written to disk nor synchronized or uploaded. The removed IndexedDB conversation cache is deleted from the extension's own origin on startup, without reading its contents or touching website storage. ChatGPT and Gemini private API bridges, account-session access and internal-framework adapters have been removed. These changes describe Polaris's implementation; they do not constitute platform approval or establish the reason for any account restriction.

License installation and activation credentials remain separate in `chrome.storage.local` and are never synchronized. Diagnostic export is user-initiated: a bounded, redacted current-tab log is downloaded locally; an email draft opens only when requested, without automatic upload or attachment. The support page loads optional Google Analytics and Aliyun SLS only after explicit consent and does not receive AI conversation content or extension settings. See the [Privacy Policy](https://jeffery-ho.github.io/Polaris-AI-Chat-Navigator/privacy-policy.html) for details.

## Pro test integration

Settings → Pro and license provides lifetime purchase, redemption, recovery and device deactivation. The service supplies the seven-day trial and offer deadlines, with USD $12.90 welcome pricing and USD $19.99 afterward. Successfully initialized Free installations choose any two replaceable platforms and do not enable retention of unmounted messages or loaded-message text search. Conversation content remains in page memory only. Until the test service initializes successfully, current installations keep their existing behavior without a fabricated Pro status.

The background service owns installation credentials, pending purchase claims and per-device activation tokens in local storage. The UI receives only public license state. Payments use the test Worker at `polaris-license-test.hexianji.workers.dev`; secret keys stay server-side. The deployed test Worker and D1 have passed a real Stripe sandbox purchase, Webhook fulfillment, idempotent claim, cross-installation redemption, deactivation/reactivation and refund revocation. The WORK extension has also displayed an active Pro license through live redemption. Expired promotional quotes wait for refreshed server pricing; a changed price requires confirmation before a new Checkout opens. Transactional email remains unconfigured. Deployment configuration is documented in [the test Worker README](workers/license-test/README.md).

## Support

Visit the [Polaris support page](https://jeffery-ho.github.io/polaris-landing/entry/extension/) for the extension, issue tracker, and optional PayPal support link.

## Release

Do not commit `dist/` or load `dist.zip` as the extension. The release workflow builds from source and creates a versioned ZIP plus the stable `Polaris-AI.zip` alias from that fresh `dist/` directory (`cd dist && zip`). It validates both remote assets while the Release is still Draft, publishes only after that check, and then verifies the public Latest download URL. The same check fails if a root `manifest.json` reappears or if `dist/manifest.json` points at a file that is not in `dist/`. Git hooks do not run in CI.

## Version

Store descriptions and marketplace copy rules are maintained in [store-listing.md](store-listing.md).

Current version: `1.4.0(425)`

## License

MIT
