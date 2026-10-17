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

- Click the browser extension icon to open the Polaris browser sidepanel. It follows the active supported tab and contains navigation, Chapter View, and Settings.
- Maker navigation is generated only from currently mounted user and AI response DOM. A route change removes the previous list immediately; only a later non-Polaris page mutation can populate the new list. DOM removal also removes its Makers, and a DOM remount receives new runtime keys.
- Progressive Maker rendering begins during streaming output as soon as the first non-empty supported marker is available; fixed 120ms render batches reuse existing Maker nodes and update only changed items, preserving list scrolling, focus, hover, and manual collapse state. Wheel, trackpad, or list-drag input on a Maker or group card immediately takes control from temporary Active Maker positioning, so any Maker can remain outside the list viewport while streaming continues.
- Click-to-jump navigation, active-section highlighting, and a scrollable marker queue.
- Sidepanel Chapter View reads as an expandable outline. Each bullet opens chapter actions: focus a subtree, locate its source, copy the chapter, or copy all chapter content. Search and returning to an ancestor preserve the reading state within the panel session.
- User Maker tooltips show the first message image; clicking that image opens an in-page preview, with previous/next navigation for multi-image messages. The Maker capsule itself remains an expand/collapse control.
- Visible titles inside AI markers, user groups, and the floating active marker are left-aligned; user group capsules remain on the queue's right edge while AI markers and folded stacks remain on the left.
- Platform-specific marker filters for H1, H2, H3, H4, bold text, unordered lists, and ordered lists.
- Settings synchronization through `chrome.storage.sync`.
- Settings opens six separate icon cards: **Preferences**, **Help and diagnostics**, **Feedback**, **What's New**, **About**, and **Privacy Policy**. The policy opens directly from Settings in a new tab. Back and Escape return through the menu, preserving the previous navigation or chapter view, search focus, and reading position. Preferences keep live controls during conversation updates.
- **About** centers the 40px app icon, name, and actual version; adds a short product introduction, developer credit, and thanks; and lists all 11 supported platforms with their bundled icons.
- **Feedback** keeps GitHub Issues and developer email as text rows, with personal X and Xiaohongshu profiles in a separate horizontal icon row with hover hints and accessible labels. Profile links open in a new tab.
- Light and dark adaptive glass styling, with lightweight blur and saturation on Maker cards and the floating Active Maker while controls and search retain the full displacement effect.
- Native browser scrolling on Maker, user-group, and fold cards, without custom wheel animation or a transparent extended hit area.
- Fuzzy title search for both the navigation marker queue and Chapter View, with `Cmd/Ctrl+F` focusing the current search box.
- Long marker queues are grouped into stacks of `N` markers (default 20). Each stack starts expanded and shows its first title with the remaining count; clicking its card manually collapses or expands the Maker rows.
- Currently mounted user maker groups show the latest 20 groups by default, with search covering those mounted groups. Every group starts expanded, including the latest, previous, and newly streamed groups; an explicit click can manually collapse its contents.
- An active Maker does not change its stack or user group state. Manual collapse keeps the Maker selected, and dragging more than 4px from any Maker or group card scrolls the list without triggering that card's click action.
- Pointer dragging captures the active pointer and recovers after window blur, page hiding, lost capture, route changes, or a narrow-viewport boundary; an interrupted control drag rolls back its unsaved position.
- **Help and diagnostics** provides four illustrated steps for sending a redacted, current-tab diagnostic log. **Send diagnostics** downloads the JSON and opens a pre-addressed email; attach the downloaded file manually. **Download diagnostics** saves the file without opening email.
- **Chapter View**, which organizes AI response content by marker section for convenient reading and copying on every supported platform.
- A heart-shaped support entry at the right edge of the About & Settings header, opening the same-origin [Polaris support entry](https://jeffery-ho.github.io/polaris-landing/entry/extension/) in a new tab. The entry preserves the fixed `polaris_extension` source without relying on UTM parameters; the landing page loads optional GA4 and SLS analytics only after the visitor explicitly consents.
- Update notes place the same heart-shaped support entry as the leftmost feedback action, opening the support page in a new tab.
- While Chapter View is open, its modal blocks arrow, Home, and End keys from changing the underlying main tab; `Shift + ← / →` continues to switch chapters outside editable fields.
- Chapter View safely preserves rendered Markdown structure, including headings, nested and task lists, quotes, code, links, images, and wide tables.
- Complete raw Markdown pipe tables are also formatted in Chapter View when a source page leaves them unrendered.

## Settings

Feature-version upgrades show update notes inside the sidepanel when you open it. Dismissing the dialog marks that feature version as read; patch upgrades do not show it again. Select **What's New** in Settings to read the current feature-version notes on their own page.

Open **Settings** from the Polaris sidepanel to adjust:

- User group limit
- Fold group size
- H1, H2, H3, H4, bold-text, unordered-list, and ordered-list marker visibility for the current platform

Preferences are saved to `chrome.storage.sync`.

The Diagnostics section keeps a bounded session-only event log in the current tab. It records version, coarse platform/browser information, viewport and DPR, drag lifecycle, route/render counts, and error names. It excludes AI text, titles, full URLs, account information, prompts, and stack traces.

## Chapter View

- Click **Chapters** in the Polaris sidepanel.
- Available on every supported platform: ChatGPT, Claude, Gemini, Grok, Doubao, Kimi, Qwen, Yuanbao, Xiaohongshu Diandian AI, Manus, and DeepSeek.
- Reads currently mounted conversation content and rebuilds supported rendered Markdown with a strict element and URL allowlist; input fields, sidebars, and the extension's own interface are excluded.
- Expand chapters inline with the triangle controls. Open a chapter's bullet menu to focus its subtree, locate the original source, or copy content. Use the chapter path to return while preserving the reading position.
- Search chapter titles from the sidepanel search field, or use `Cmd/Ctrl+F`; `Cmd/Ctrl+Shift+F` opens Chapters. Matching is Unicode-aware and uses the existing fuzzy title search.
- Preserves the current chapter and reading position as a reply updates. Images load from existing `http`/`https` page URLs, with previews and source location available through the existing controls.

## Privacy

Polaris: AI Chat Navigator processes only currently mounted AI response content locally in your browser and does not transmit it to the developer or third-party servers. It does not retain Maker conversation history across page refreshes, routes, or DOM removal. Diagnostic export is user-initiated: the extension keeps only a bounded, redacted current-tab session log, downloads it locally, and opens a `mailto:` draft only when requested; it does not upload the log or attach it automatically. The separate support page only loads optional Google Analytics and Aliyun SLS after the visitor explicitly consents, and never sends AI conversation content or extension settings. See the [Privacy Policy](https://jeffery-ho.github.io/Polaris-AI-Chat-Navigator/privacy-policy.html) for details.

## Support

Visit the [Polaris support page](https://jeffery-ho.github.io/polaris-landing/entry/extension/) for the extension, issue tracker, and optional PayPal support link.

## Release

Do not commit `dist/` or load `dist.zip` as the extension. The release workflow builds from source and creates a versioned ZIP plus the stable `Polaris-AI.zip` alias from that fresh `dist/` directory (`cd dist && zip`). It validates both remote assets while the Release is still Draft, publishes only after that check, and then verifies the public Latest download URL. The same check fails if a root `manifest.json` reappears or if `dist/manifest.json` points at a file that is not in `dist/`. Git hooks do not run in CI.

## Version

Current version: `0.72.7(291)`

## License

MIT
