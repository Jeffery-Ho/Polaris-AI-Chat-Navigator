# Builds

## Build Rule

- Build number uses plain integers from `1` to `999`, sorted by numeric order.
- Every code or documentation modification must record a new build.
- Bug fix updates the last version segment, for example `0.1.0` to `0.1.1`.
- Feature update updates the middle version segment, for example `0.1.0` to `0.2.0`.
- Major update updates the first version segment, for example `0.1.0` to `1.0.0`.
- Version update type must be declared by the user before recording a build.
- After each build is recorded, confirm the build number and version with the user.

## 275

- Date: 2026-10-13
- Version: 0.68.0
- Summary: Uses the browser sidepanel exclusively and restores in-panel update notes.
- Notes: Removes the standalone page, popup creation and recovery, and standalone chapter UI. Clears legacy window IDs while retaining preferences and source tracking. Requires Chrome 114 or a browser with the Side Panel API. Feature upgrades show localized update notes when the panel opens; dismissal is persisted and Settings can reopen the notes. The content script no longer automatically opens or records page update notices. Updated the current version to `0.68.0(275)`.

## 274

- Date: 2026-10-13
- Version: 0.67.7
- Summary: Aligns local project branding and repository links with Polaris: AI Chat Navigator.
- Notes: Updates the extension name, package name, page titles, navigation labels, documentation, privacy policy, copyright label, and diagnostic console prefix. Feedback, release-note, and privacy links use the renamed Polaris-AI-Chat-Navigator repository. Keeps the existing route-event and preference identifiers compatible. Updated the current version to `0.67.7(274)`.

## 273

- Date: 2026-10-13
- Version: 0.67.6
- Summary: Removes obsolete page-only display settings from the Polaris window.
- Notes: Removes Maximum markers and Tooltip width from both sidepanel and standalone settings, while retaining the active User group limit and Fold threshold controls. Preserves stored preferences and synchronizes the README settings list. Updated the current version to `0.67.6(273)`.

## 272

- Date: 2026-10-13
- Version: 0.67.5
- Summary: Restores Qwen user prompts as chapter roots instead of Full text placeholders.
- Notes: Includes recognized Qwen user messages in chapter extraction, keeping answer introductions and headings under their source prompt. Preserves repeated and unanswered prompts, multiple answer bodies, and Full text for orphan replies. Updated the current version to `0.67.5(272)`.

## 271

- Date: 2026-10-13
- Version: 0.67.4
- Summary: Restores DeepSeek user prompts as chapter roots instead of Full text placeholders.
- Notes: Passes mounted user messages and explicit reply ownership from the DeepSeek conversation scan to chapter extraction. Keeps answer introductions and headings under their source prompt, preserves repeated and unanswered prompts, and leaves replies across virtual-list gaps ungrouped. Updated the current version to `0.67.4(271)`.

## 270

- Date: 2026-10-13
- Version: 0.67.3
- Summary: Restores Doubao user prompts as sidepanel chapter roots.
- Notes: Passes recognized Doubao user messages into the chapter tree instead of dropping them at the ChatGPT-only gate. Groups answer introductions and headings under their source prompt, keeps repeated prompts and unanswered turns separate, and preserves Full text for orphan replies. Updated the current version to `0.67.3(270)`.

## 269

- Date: 2026-10-13
- Version: 0.67.2
- Summary: Aligns AI Maker card width with the search text field.
- Notes: Removes the 88% width constraint so AI Maker cards use the full available navigation width and resize with the sidepanel or standalone window. Updated the current version to `0.67.2(269)`.

## 268

- Date: 2026-10-13
- Version: 0.67.1
- Summary: Restores ChatGPT user messages as sidepanel chapter roots instead of Full text placeholders.
- Notes: Recognizes current ChatGPT user bubbles without legacy role or conversation-turn attributes. Groups answer introductions, headings, and successive answer bodies under their source prompt, preserves repeated prompts, and keeps unowned answer content available. Supports locating user sources and preserves content-command acknowledgements to avoid false source-location failures. Updated the current version to `0.67.1(268)`.

## 267

- Date: 2026-10-09
- Version: 0.67.0
- Summary: Adds a lightweight content fade between sidepanel Navigation and Chapters.
- Notes: Waits for chapter data before switching, keeps navigation and chapter reading positions, respects reduced-motion preferences, and leaves standalone interactions unchanged. Updated the current version to `0.67.0(267)`.

## 266

- Date: 2026-10-09
- Version: 0.66.3
- Summary: Fits chapter tables within the available sidepanel reading width.
- Notes: Reduces the minimum table column width from 96px to 64px so nested three-column tables wrap within their content region. Keeps horizontal scrolling inside wide tables and preserves standalone styling. Updated the current version to `0.66.3(266)`.

## 265

- Date: 2026-10-09
- Version: 0.66.2
- Summary: Matches the visible size of chapter disclosure triangles and bullets.
- Notes: Uses the same 6px marker size for both shapes while retaining the 24px by 28px disclosure target and state-aware tooltips. Updated the current version to `0.66.2(265)`.

## 264

- Date: 2026-10-09
- Version: 0.66.1
- Summary: Enlarges and aligns sidepanel chapter disclosure controls.
- Notes: Centers a 16px triangle icon with each bullet, increases the control width to 24px, and adds state-aware Expand/Collapse tooltips. Updated the current version to `0.66.1(264)`.

## 263

- Date: 2026-10-09
- Version: 0.66.0
- Summary: Rebuilds sidepanel Chapter View as an expandable reading outline with bullet menus.
- Notes: Adds subtree focus and breadcrumb return, explicit source location, source-range content ownership, copy without duplicate descendants, scoped search, and per-conversation session reading state. The standalone chapter view keeps its existing layout. Updated the current version to `0.66.0(263)`.

## 262

- Date: 2026-10-09
- Version: 0.65.0
- Summary: Adds DeepSeek final-answer navigation and Chapter View.
- Notes: Reads mounted virtual-list message DOM, groups final answers only across consecutive known items, excludes thinking content and controls, and reuses image previews, search, chapters, source jumps, and inner-scroll tracking. Updated the current version to `0.65.0(262)`.

## 261

- Date: 2026-10-08
- Version: 0.64.0
- Summary: Adds Manus conversation navigation and Chapter View.
- Notes: Scoped Manus message scanning groups every mounted AI reply with the user in the same turn, excludes non-message cards, and reuses heading, list, table, image-preview, search, and chapter behavior. Inner SimpleBar scrolling updates the existing active Maker state. Updated the current version to `0.64.0(261)`.

## 260

- Date: 2026-10-08
- Version: 0.63.0
- Summary: Jumps to a chapter's source conversation when its directory entry is selected.
- Notes: Selecting a chapter now updates the reading view and navigates the original conversation to the matching DOM node, bringing that window forward. The separate source-jump button was removed. Updated the current version to `0.63.0(260)`.

## 259

- Date: 2026-10-01
- Version: 0.62.0
- Summary: Restores user Maker image thumbnails across every supported AI platform.
- Notes: Claude, Grok, Doubao, Kimi, Qwen, Yuanbao, and Xiaohongshu now scan images inside the verified user-message container, joining the existing ChatGPT and Gemini support. Avatar regions, unrelated messages, unsafe URLs, and empty image sources remain excluded. Updated the current version to `0.62.0(259)`.

## 258

- Date: 2026-10-01
- Version: 0.61.7
- Summary: Prevents empty Gemini image sources from creating a false thumbnail column.
- Notes: Empty or whitespace-only image source attributes are now rejected before URL resolution, so they cannot resolve to the current Gemini page URL and insert a 36px thumbnail slot when a user Maker is toggled. Updated the current version to `0.61.7(258)`.

## 257

- Date: 2026-10-01
- Version: 0.61.6
- Summary: Removes Dia's native press inset from Gemini user Maker cards.
- Notes: User Maker cards now use a keyboard-accessible neutral container instead of a native button, so pointer presses cannot apply browser-owned text inset while Enter and Space activation remain available. Updated the current version to `0.61.6(257)`.

## 256

- Date: 2026-10-01
- Version: 0.61.5
- Summary: Keeps the Gemini user Maker text geometry stable when toggling its group.
- Notes: Side Panel user-group toggles now update the collapsed state and publish one window snapshot without rebuilding the content-script Maker interface. Updated the current version to `0.61.5(256)`.

## 255

- Date: 2026-10-01
- Version: 0.61.4
- Summary: Prevents native button press feedback from shrinking Gemini user Maker text.
- Notes: Disabled the browser-native button appearance on Maker cards while preserving the custom hover, focus, active-color, and chevron states. Updated the current version to `0.61.4(255)`.

## 254

- Date: 2026-10-01
- Version: 0.61.3
- Summary: Keeps Gemini user Maker text stationary during expand and collapse.
- Notes: Removed the press transform and transform transition from Maker cards while retaining the chevron rotation. User-message text now stays fixed throughout the click animation. Updated the current version to `0.61.3(254)`.

## 253

- Date: 2026-10-01
- Version: 0.61.2
- Summary: Keeps Gemini user Maker text stable after navigation clicks.
- Notes: Maker jumps now scroll directly to the source heading without rewriting the host page URL. This prevents Polaris's route bridge from treating its own jump as a Gemini conversation change, so the Side Panel no longer clears, rescans, and redraws the user Maker card after every click. Updated the current version to `0.61.2(253)`.

## 252

- Date: 2026-09-30
- Version: 0.61.1
- Summary: Keeps the selected chapter after jumping back to its source.
- Notes: A temporary loading snapshot from the same source tab no longer resets the chapter reader before the real page snapshot arrives. If a host rerender changes `markerKey`, Polaris restores the selected chapter by title and parent path; actual tab changes, route changes, and unsupported pages still clear the previous conversation state. Updated the current version to `0.61.1(252)`.

## 251

- Date: 2026-09-30
- Version: 0.61.0
- Summary: Aligns the chapter directory hierarchy with the source content shown in the reader.
- Notes: Window chapters are rebuilt from the current assistant replies, stop at reply boundaries, and use the same source nodes for directory hierarchy and body ranges. Parent chapters include their descendants, list-item chapters show the complete source row, nested items are indented, searches show parent paths, and selection remains attached to `markerKey` during updates. Updated the current version to `0.61.0(251)`.

## 250

- Date: 2026-09-30
- Version: 0.60.2
- Summary: Keeps the selected chapter aligned with its reading content and unifies the directory controls.
- Notes: After changing chapters, the active directory item is scrolled fully into view and matches the article below. The chapter list and directory button now share one surface, and the directory button uses the same circular treatment as Settings. Updated the current version to `0.60.2(250)`.

## 249

- Date: 2026-09-30
- Version: 0.60.1
- Summary: Restores the chapter list and inline reading layout with an expandable directory card.
- Notes: The directory button expands the existing chapter list over the reading area without moving the chapter content. Rows keep their full height, long titles wrap in the expanded list, and the list can cover the area above the article while keeping the brand row visible. Removes the dropdown and modal while retaining Markdown rendering. Updated the current version to `0.60.1(249)`.

## 248

- Date: 2026-09-30
- Version: 0.60.0
- Summary: Adds a compact chapter picker, an expandable table of contents, and Markdown reading cards.
- Notes: Chapters can be selected from a dropdown or the existing styled directory in a full-height dialog that overlays the reading card without moving it. Chapter content now renders supported Markdown blocks and inline formatting in a bordered card. Updated the current version to `0.60.0(248)`.

## 247

- Date: 2026-09-30
- Version: 0.59.7
- Summary: Hides the default floating platform icon before a supported platform is active.
- Notes: The window header now renders a platform favicon only for a recognized supported route, so the initial no-platform state keeps the brand and settings controls without a misleading Polaris icon. Updated the current version to `0.59.7(247)`.

## 246

- Date: 2026-09-29
- Version: 0.59.6
- Summary: Recognizes shared ChatGPT user turns marked with `data-turn="user"`.
- Notes: ChatGPT user-message discovery now treats the current shared-conversation turn marker as authoritative while retaining role and hidden-heading fallbacks. Updated the current version to `0.59.6(246)`.

## 245

- Date: 2026-09-29
- Version: 0.59.5
- Summary: Restores user Maker cards on current ChatGPT conversation turns.
- Notes: ChatGPT user-message discovery now supports current `conversation-turn` wrappers while retaining legacy role attributes, strips the visible “You said” label from previews, and keeps nested wrappers from producing duplicate user groups. Updated the current version to `0.59.5(245)`.

## 244

- Date: 2026-09-29
- Version: 0.59.4
- Summary: Prevents Gemini display-contents scans from passing non-elements to getComputedStyle.
- Notes: Marker visibility scanning now ignores comment and other non-element child nodes while preserving text-node visibility and element-box checks. Updated the current version to `0.59.4(244)`.

## 243

- Date: 2026-09-29
- Version: 0.59.3
- Summary: Keeps expanded user Maker rows left aligned after interaction.
- Notes: Expanded window Maker cards and their text wrappers explicitly retain left alignment and zero text indentation after a user-group click. Updated the current version to `0.59.3(243)`.

## 242

- Date: 2026-09-29
- Version: 0.59.2
- Summary: Locks window Maker text to the left edge on Gemini and other platforms.
- Notes: Window Maker buttons and their text wrappers now explicitly reset flex alignment, text alignment, margins, padding, and text indentation so Gemini user messages do not appear centered while loading. Updated the current version to `0.59.2(242)`.

## 241

- Date: 2026-09-29
- Version: 0.59.1
- Summary: Removes excess Maker text indentation during window rendering.
- Notes: Folded and earlier Maker rows now align their text to the left edge. Hidden streaming indicators no longer reserve space, while active AI streaming shows a compact 10px loader on the left. Updated the current version to `0.59.1(241)`.

## 240

- Date: 2026-09-29
- Version: 0.59.0
- Summary: Gives Polaris settings a focused page-navigation header.
- Notes: Settings now use a cleaner circular gear icon. Entering settings replaces the brand header with a back-navigation bar and removes the duplicate in-body title and back button. Updated the current version to `0.59.0(240)`.

## 239

- Date: 2026-09-29
- Version: 0.58.0
- Summary: Simplifies the Polaris window title bar with a centered platform icon and circular settings control.
- Notes: The active platform is represented by its bundled favicon in a floating centered title-bar control. Settings now use a circular icon button with an accessible label and tooltip. Model labels are removed from the window header so platforms without model metadata keep the same layout. Updated the current version to `0.58.0(239)`.

## 238

- Date: 2026-09-29
- Version: 0.57.0
- Summary: Redesigns the browser side panel and standalone Polaris window around a warm terracotta visual system.
- Notes: The two window surfaces now share a responsive brand header, warm light and dark palettes, quieter left/right Maker cards, clear search-empty recovery, a compact chapter selector, and grouped settings entered from the brand area. Settings restore the previous view, search focus, and scroll position. Streaming updates retain keyed rows and use only a fixed loading indicator. The in-page floating panel, protocols, and stored configuration remain unchanged. Updated the current version to `0.57.0(238)`.

## 237

- Date: 2026-09-28
- Version: 0.56.13
- Summary: Reconciles Home and Side Panel Maker rows in place during AI streaming.
- Notes: The navigation body and Maker list now preserve keyed DOM nodes instead of rebuilding on every snapshot. Existing user-group text is written once and remains stable, while changing AI rows update in place with a reserved loading icon and text-color breathing. Snapshot revisions no longer reset conversation-scoped window state. Updated the current version to `0.56.13(237)`.

## 236

- Date: 2026-09-28
- Version: 0.56.12
- Summary: Keeps user Maker text stable while AI content streams.
- Notes: Existing user Maker rows are no longer rewritten during AI streaming scans, preventing transient text, width, and layout changes. Normal renders still synchronize the final user content, while the active AI Maker keeps the loading icon and text-color breathing treatment. Updated the current version to `0.56.12(236)`.

## 235

- Date: 2026-09-28
- Version: 0.56.11
- Summary: Keeps temporarily hidden assistant nodes out of the Chrome extension error list.
- Notes: A scan that only finds hidden or pre-rendered assistant nodes now emits one readable info line instead of a warning with an object argument. The scan behavior is unchanged, while Chrome no longer records the normal temporary state as an extension error or renders `[object Object]`. Updated the current version to `0.56.11(235)`.

## 234

- Date: 2026-09-28
- Version: 0.56.10
- Summary: Stabilizes AI Maker cards while response content streams.
- Notes: AI Maker cards now keep a stable width and single-line ellipsis while their titles update. Only the currently changing AI Maker shows a reserved left-side loading icon and text-color breathing, which stops after a short quiet period and respects reduced-motion preferences. Updated the current version to `0.56.10(234)`.

## 233

- Date: 2026-09-28
- Version: 0.56.9
- Summary: Unifies the side panel, in-page navigation, and in-page settings on one flat token palette.
- Notes: Shared CSS variables replace hardcoded colors. Surfaces use 1px borders, 6/8/12 radii, and 400/500/600 weights, with visible focus rings and reduced-motion handling. The ChatGPT model name is shown once in the window header. User cards no longer repeat the same text as title and preview. Liquid-glass displacement is disabled while the generator stays in place. Updated the current version to `0.56.9(233)`.

## 232

- Date: 2026-09-28
- Version: 0.56.8
- Summary: Prevents duplicate route-fallback warnings from polluting the extension error page.
- Notes: Route fallback delivery diagnostics are now emitted as a readable single-line info message instead of a warning with an object argument. Identical results for the same route are suppressed, while delivery behavior remains unchanged. Regression tests cover readable formatting, duplicate suppression, and the absence of the old warning. Updated the current version to `0.56.8(232)`.

## 231

- Date: 2026-09-28
- Version: 0.56.7
- Summary: Restores ChatGPT Maker jumps inside reverse-flow conversation scrollers.
- Notes: ChatGPT's conversation scroller can use `display: flex` with `flex-direction: column-reverse`, where upward positions require a negative `scrollTop`. Polaris now detects that layout and delegates the jump to the target element's native `scrollIntoView`, while normal scroll containers keep the existing header-offset calculation. Regression tests cover both paths. Updated the current version to `0.56.7(231)`.

## 230

- Date: 2026-09-27
- Version: 0.56.6
- Summary: ChatGPT adapter reads both legacy role messages and hashed CSS-module responses.
- Notes: chatgpt.com now renders assistant bodies as `MarkdownRoot-*` with `Heading-*`, `Paragraph-*`, `Blockquote-*`, `HorizontalRule-*`, and `VisualizationBlock-*`. The ChatGPT adapter keeps `[data-message-author-role]` and `[data-message-role]` user and assistant nodes, plus `.markdown` / `.prose`, and also treats an unwrapped `MarkdownRoot-*` as the assistant message. Inner bodies are not counted as a second message. Fixture tests cover the legacy conversation and the hashed response, including both in one thread. Updated the current version to `0.56.6(230)`.

## 229

- Date: 2026-09-27
- Version: 0.56.5
- Summary: Reads sections from hashed CSS-module markdown roots.
- Notes: `MarkdownRoot-*` and `Heading-*` class hashes did not match the platform selectors. The shared `[class*="markdown"]` fallback is case-sensitive, so the route fallback scanned the page, found no message nodes, and the side panel stayed empty. Prefix selectors now match those hash suffixes, including `h1`-`h6` inside the markdown root. The routine route fallback log is `console.info` and includes message-node, section, background, and side-panel delivery counts. Real delivery failures stay `console.warn`. Updated the current version to `0.56.5(229)`.

## 228

- Date: 2026-09-27
- Version: 0.56.4
- Summary: Recovers side-panel sections after the route bridge changes the URL.
- Notes: The injected `src/route-bridge.js` tag means the content script has started. A later `pushState` or `replaceState` cleared the snapshot and waited for a message mutation that does not arrive when the conversation DOM is already mounted. The side panel then kept republishing that empty cache. If that wait sees no new message node, a short fallback reads the DOM already on the page. A state request during the wait still republishes the cleared snapshot, so the previous conversation does not return before the new DOM arrives. A request with no cached containers scans again. A route-bridge load error is logged with `[Polaris]`. Updated the current version to `0.56.4(228)`.

## 227

- Date: 2026-09-27
- Version: 0.56.3
- Summary: Sends sections from display:contents message wrappers to the side panel.
- Notes: ChatGPT and Gemini often wrap a message in `display:contents`, which has no layout box. The scanner treated those wrappers as invisible, published an empty snapshot, and the side panel stayed on "No conversation here" while the headings were on the page. A contents wrapper is now visible when one of its children has a box. If assistant nodes are still discarded, the content script logs `[Polaris]`. A page snapshot that is not forwarded because the tab is not the current source tab is also logged. Updated the current version to `0.56.3(227)`.

## 226

- Date: 2026-09-27
- Version: 0.56.2
- Summary: Restores page snapshots when an already-open tab is injected without the i18n script.
- Notes: The declarative content script still runs `assets/i18n.js` before `src/content.js`. The scripting fallback now injects every content-script CSS and JS file from `chrome.runtime.getManifest()`, in that order, so Vite hashing cannot leave `content.js` without `PolarisI18n`. `content.js` logs `[Polaris]` and keeps observing the page if i18n is missing, and the existing instance guard still skips a second mount. Injection failures are logged. The repository root is no longer an extension package: root `manifest.json` is removed, `manifest.build.json` is the only manifest source, and the release check rejects a root manifest or a built manifest that points at a missing `dist/` file. Updated the current version to `0.56.2(226)`.

## 225

- Date: 2026-09-26
- Version: 0.56.1
- Summary: Restores content-script DOM access when an existing target tab has no receiver.
- Notes: After a supported target tab rejects the first state or command message, the service worker injects the packaged `src/content.js` and `src/styles.css` through the scripting API, retries the message while the content script starts, and keeps the existing DOM scan in the page context. A per-frame instance guard prevents duplicate observers and UI when declarative and dynamic injection overlap. Updated the current version to `0.56.1(225)`.

## 224

- Date: 2026-09-26
- Version: 0.56.0
- Summary: Adds a native browser side panel for the Polaris interface.
- Notes: The extension action now opens `sidepanel.html` through the browser Side Panel API, reusing navigation, Chapter View, settings, active supported-tab tracking, and the existing runtime message bridge. Browsers without the Side Panel API keep the standalone popup fallback. The source and built manifests, Vite entry points, side-panel readiness handling, release notes, README, and generated `dist/` output are synchronized. Updated the current version to `0.56.0(224)`.

## 223

- Date: 2026-09-22
- Version: 0.55.1
- Summary: Prevents unrelated page images from being assigned to user Makers.
- Notes: Maker thumbnails now accept only verified ChatGPT or Gemini user-upload attachment images owned by the same user message. Other platform images remain disabled until a semantic attachment selector is verified. Broken thumbnails are removed from the standalone window while preserving Maker text. Updated the current version to `0.55.1(223)`.

## 222

- Date: 2026-09-20
- Version: 0.55.0
- Summary: Refines the Polaris Maker surface and unrestricted search.
- Notes: The standalone window now uses a low-saturation blue-orange glass background, search accepts Chinese and unrestricted Unicode text while preserving Unicode-aware title matching, only user groups show chevrons, Maker cards use larger corners, the search and Tab controls use larger rounded corners with a neutral iOS-like light-gray segmented Tab surface, and the empty state shows bundled platform favicons below its explanatory copy. The window observes browser tab activation, URL updates, focus changes, and `prefers-color-scheme`, retrying supported-page state until the content script responds. Opening the extension page as a regular browser tab now keeps the existing conversation tab as the source instead of treating the whole browser window as Polaris. The source and built window entries load those images as regular image URLs. Updated the current version to `0.55.0(222)`.
- Release maintenance: The GitHub Release workflow now publishes and verifies the versioned ZIP plus the stable `Polaris-AI.zip` alias through a Draft Release. This changes release infrastructure only and intentionally does not consume a new extension build number.

## 221

- Date: 2026-09-20
- Version: 0.54.1
- Summary: Hardens standalone window reuse and refines the popup into a native utility-window surface.
- Notes: Cached window IDs are validated against the popup type and extension window URL, minimized windows are restored before focus, and focus races recreate the popup. The window keeps the browser's native close controls, uses a flatter tool-window layout, and preserves navigation, Chapter View, settings, and source-tab switching. Updated the current version to `0.54.1(221)`.

## 220

- Date: 2026-09-18
- Version: 0.54.0
- Summary: Moves Polaris navigation into a standalone browser window.
- Notes: Clicking the extension icon opens or focuses one movable Polaris window. The window follows the active supported tab, renders Maker navigation, Chapter View, and settings with a Dia inspired glass layout, shows platform empty state on unsupported pages, and focuses the source tab after a Maker jump. Updated the current version to `0.54.0(220)`.

## 219

- Date: 2026-09-18
- Version: 0.53.10
- Summary: Reuses the main navigation chevron geometry in the Maker list.
- Notes: User and folded-group Maker chevrons now share the main navigation's 6px border geometry and optical centering offsets. Updated the current version to `0.53.10(219)`.

## 218

- Date: 2026-09-18
- Version: 0.53.9
- Summary: Centers all navigation arrows and dropdown chevrons optically.
- Notes: Control, Maker, fold, chapter-copy, and image-preview arrows now use fixed centered geometry with directional optical offsets. Updated the current version to `0.53.9(218)`.

## 217

- Date: 2026-09-17
- Version: 0.53.8
- Summary: Staggers Maker bubbles in the layout previews.
- Notes: Maker preview rows now use alternating offsets and widths so the list reads as separate staggered bubbles in both layout cards. Updated the current version to `0.53.8(217)`.

## 216

- Date: 2026-09-17
- Version: 0.53.7
- Summary: Removes decorative Mac traffic lights from layout previews.
- Notes: Layout previews now keep only the browser frame, capsule navigation, and white-background Maker list illustration. Updated the current version to `0.53.7(216)`.

## 215

- Date: 2026-09-17
- Version: 0.53.6
- Summary: Refines layout previews with Mac controls and Maker list content.
- Notes: Layout cards now show white-background Maker rows, larger capsule controls, and the Sidebar capsule group on the right.

## 214

- Date: 2026-09-15
- Version: 0.53.5
- Summary: Replaces layout setting pills with visual Top of Window and Sidebar previews.
- Notes: The Layout setting now uses accessible radio cards with browser-style previews, localized captions, and selected/focus states.

## 213

- Date: 2026-09-15
- Version: 0.53.4
- Summary: Keeps the portrait Maker arrangement inside a bounded vertical Sidebar container.
- Notes: Vertical Sidebar Maker rows now fill only the bounded Maker pane, preserving left-aligned AI entries and right-aligned user entries without spreading them across the viewport. The vertical container width is recalculated from the current control and viewport sizes when switching layouts. Updated the current version to `0.53.4(213)`.

## 212

- Date: 2026-09-15
- Version: 0.53.3
- Summary: Constrains the vertical Maker pane after a layout overflow regression.
- Notes: The vertical Maker pane and Maker rows are bounded to the Sidebar Maker width again, preventing AI and user entries from spreading to opposite viewport edges. The vertical search control remains right-aligned and icon-only when unfocused. Updated the current version to `0.53.3(212)`.

## 211

- Date: 2026-09-15
- Version: 0.53.2
- Summary: Restores the portrait-style Maker list arrangement in the vertical Sidebar.
- Notes: The vertical Maker pane now fills the available left column so AI Maker rows align left and user Maker rows align right while remaining vertically stacked. The search control stays right-aligned and icon-only when unfocused. Horizontal capsule layout remains unchanged. Updated the current version to `0.53.2(211)`.

## 210

- Date: 2026-09-15
- Version: 0.53.1
- Summary: Makes vertical Sidebar navigation icon-only and adds dedicated Chapters and About icons.
- Notes: The vertical layout now hides navigation text labels and the collapse chevron while retaining accessible labels on all three tabs. Chapters uses the supplied book-open SVG and About & Settings uses the supplied information SVG. Horizontal capsule layout remains unchanged. Updated the current version to `0.53.1(210)`.

## 209

- Date: 2026-09-15
- Version: 0.53.0
- Summary: Adds a switchable vertical right Sidebar layout for the main navigation and Maker list.
- Notes: About & Settings now offers Horizontal capsule and Vertical right Sidebar layouts. The vertical layout keeps the three main navigation tabs in a draggable right-side stack and places the Maker search/list pane to its left across viewport sizes. Existing Maker scanning, jumping, scrolling, folding, search, themes, and floating Active Maker behavior remain unchanged. Updated the current version to `0.53.0(209)`.

## 208

- Date: 2026-09-15
- Version: 0.52.0
- Summary: Adds an X profile entry beside the settings footer email action.
- Notes: About & Settings now shows an accessible X profile link before email and GitHub Issue. The link opens `https://x.com/JefferyHo_` in a new tab and reuses the existing Footer contact styling. Updated the current version to `0.52.0(208)`.

## 207

- Date: 2026-09-14
- Version: 0.51.5
- Summary: Adds an in-page image preview gallery for user Maker tooltip images.
- Notes: Clicking only the image in a user Maker tooltip opens a Polaris modal using the safe image URLs already present in the message. Multi-image messages support previous/next controls, a counter, keyboard arrow navigation, Escape, backdrop click, close control, scroll locking, focus restoration, and localized load-failure fallback. The preview backdrop and content surface now read the current AI content background color, apply the shared frosted-glass blur treatment without a fixed dark fill, and reuse the Chapter View close-button definition. Gallery navigation buttons reuse the Chapter View light-gray default action background with dark-gray text, image shadows are removed, and tooltip thumbnails show a top-right magnifier affordance with the shared light-gray background. The Maker button remains dedicated to expand/collapse. Updated the current version to `0.51.5(207)`.

## 206

- Date: 2026-09-14
- Version: 0.51.4
- Summary: Adds user-uploaded image thumbnails to Makers on every supported platform.
- Notes: User Makers now reuse the first safe HTTPS or same-origin blob image in their message, show `+N` for additional images, and retain a thumbnail-only Maker for image-only messages. Gemini attachment URLs are rescanned when lazy-loaded, and page-level `mavatar` classes no longer filter valid attachments. The user-title tooltip shows a 112×112 first-image preview matching the message thumbnail, is horizontally aligned beside the Maker and vertically centered, and omits the visible `图片` description for image-only messages while retaining localized accessibility labels. Maker and floating Active Maker tooltips share one z-index token, and the hovered Maker row is raised to that token so the tooltip stays above other Makers. Failed thumbnails preserve Maker expand/collapse behavior. No images are stored or uploaded. Updated the current version to `0.51.4(206)`.

## 205

- Date: 2026-09-14
- Version: 0.51.3
- Summary: Prevents Chinese user Maker titles from expanding their capsule.
- Notes: User Maker preview text now enforces its local font, single-line layout, and clipping against host-page typography rules, while preserving the expand/collapse chevron. Updated the current version to `0.51.3(205)`.

## 204

- Date: 2026-09-11
- Version: 0.51.2
- Summary: Keeps navigation Tab widths at their English-label baseline and truncates long user Maker titles.
- Notes: Navigation, Chapters, and About & Settings retain English-label minimum widths in Chinese. Long user Maker titles now use single-line ellipsis while retaining the expand/collapse chevron. Updated the current version to `0.51.2(204)`.

## 203

- Date: 2026-09-11
- Version: 0.51.1
- Summary: Uses concise supported platform names without company prefixes.
- Notes: README and Settings now display Claude, Gemini, Grok, Doubao, Kimi, Qwen, Yuanbao, and Diandian AI as concise platform names. Updated the current version to `0.51.1(203)` and regenerated `dist/` after `pnpm check` and `pnpm test`.

## 202

- Date: 2026-09-11
- Version: 0.51.0
- Summary: Adds Grok navigation support.
- Notes: Grok pages use semantic `main [data-testid="assistant-message"] .response-content-markdown.markdown` and `main [data-testid="user-message"]` containers for user grouping, headings, lists, tables, streaming updates, search, navigation, and Chapter View. Grok defaults to H1-H3, unordered-list, and bold-text markers; ordered lists remain disabled by default. Added `Doc/grok-support.md` and platform/Manifest regression tests. Run `pnpm check`, `pnpm test`, and one final `pnpm build`; confirm `dist/manifest.json` is `0.51.0(202)`. Signed-in Grok live interaction validation remains a separate acceptance step.

## 201

- Date: 2026-09-11
- Version: 0.50.0
- Summary: Adds Google Gemini navigation support.
- Notes: Gemini pages now use semantic `model-response message-content` and `user-query user-query-content` containers for user grouping, headings, lists, tables, streaming updates, search, navigation, and Chapter View. Gemini defaults to H1-H3, unordered-list, and bold-text markers; ordered lists remain disabled by default. Added `Doc/gemini-support.md` and platform/Manifest regression tests. Run `pnpm check`, `pnpm test`, and one final `pnpm build`; confirm `dist/manifest.json` is `0.50.0(201)`. Signed-in Gemini live interaction validation remains a separate acceptance step.

## 200

- Date: 2026-09-09
- Version: 0.49.2
- Summary: Replaces UTM-only support attribution with a same-origin landing entry.
- Notes: The settings and update-note support links now open `/entry/extension/`, allowing the landing page to pass `polaris_extension` through tab-scoped session storage when browsers remove UTM parameters. The extension itself sends no analytics. Run `pnpm check`, `pnpm test`, and one final `pnpm build`; confirm `dist/manifest.json` is `0.49.2(200)` and the existing support-page destination remains available.

## 199

- Date: 2026-09-09
- Version: 0.49.1
- Summary: 修复指针捕获导致的主导航按钮无法点击。
- Notes: 控制拖动现在按下后捕获最近的交互按钮/链接，避免 `click` 目标被重定向到整个控制胶囊；点击胶囊空白仍捕获胶囊本身。新增主导航指针捕获目标回归测试；`pnpm check` 通过，`pnpm test` 通过 164/164，最终 `pnpm build` 完成；`dist/manifest.json` 为 `0.49.1(199)`。登录态浏览器中的窄视口和七个平台手动验收仍待执行。

## 198

- Date: 2026-09-09
- Version: 0.49.0
- Summary: 恢复窄视口导航拖动并增加脱敏诊断日志导出。
- Notes: 抽离可测试的指针拖动生命周期，按 4px 阈值保留点击与列表原生滚动；控制胶囊和 Maker 卡片在 `pointerdown` 后捕获指针，并由 `pointerup`、`pointercancel`、`lostpointercapture`、窗口失焦、页面隐藏、`pagehide`、路由重置和根节点移除共享清理路径。异常结束回滚未保存的控制位置。诊断日志使用当前标签页 `sessionStorage`，最多 200 条事件和 128 KiB 事件数据，字段白名单排除正文、标题、完整 URL、账号信息、提示词和堆栈；设置页支持下载或下载后打开 `mailto:` 草稿，附件需手动添加。新增 8 项生命周期/导出/脱敏测试和 3 项接入测试；`pnpm check` 通过。最终 `pnpm test` 与单次 `pnpm build` 将在验收阶段记录，真机窄视口和七个平台手动验证仍待解锁后执行。

## 197

- Date: 2026-09-09
- Version: 0.48.4
- Summary: 即时同步页面、系统和浏览器主题变化。
- Notes: `prefers-color-scheme` 和页面主题属性变化现在通过独立的可销毁监听器在下一帧更新导航根节点与设置面板，不触发 Maker 重扫；保留页面实色背景优先、系统主题透明背景回退的判定顺序。主题测试通过 8/8，`pnpm test` 通过 151/151，`pnpm check` 通过，最终 `pnpm build` 完成；`dist/manifest.json` 为 `0.48.4(197)`。支持平台的登录态浏览器手动切换验收仍待执行。

## 196

- Date: 2026-09-08
- Version: 0.48.3
- Summary: Reduces long-conversation Maker scan and streaming-update work.
- Notes: The scan reuses visibility and layout reads, queries heading candidates once per assistant container, resolves headings through the nearest assistant ancestor, skips unrelated host mutations, and keeps the existing Maker recognition priority. `pnpm test` passed 146/146, `pnpm check` passed, and the final single `pnpm build` will be recorded after verification; live signed-in Performance validation remains pending.

## 195

- Date: 2026-09-08
- Version: 0.48.2
- Summary: Isolates Maker-list overscroll from the host conversation scroll container.
- Notes: The native Maker-list scroll remains unchanged, while vertical overscroll containment prevents wheel and trackpad input over Maker cards from chaining into the conversation at the list boundaries. `pnpm test` passed 141/141, `pnpm check` passed, and the final single `pnpm build` completed successfully; generated `dist/manifest.json` is `0.48.2(195)`. Live signed-in validation remains pending.

## 188

- Date: 2026-09-01
- Version: 0.44.4
- Summary: Deduplicates adjacent H1/H2 representations of the same text Maker.
- Notes: Doubao can expose the same semantic title as consecutive H1 and H2 nodes. Adjacent text Makers within one user-reply group now deduplicate by normalized title without comparing level, preserving the first node for navigation. Different titles, non-adjacent repeats, table Makers, and video Makers remain distinct. `pnpm test` passed 128/128, `pnpm check` passed, and the final single `pnpm build` completed successfully; `dist/manifest.json` is `0.44.4(188)`. Live signed-in validation remains pending for ChatGPT, Doubao, Kimi, Qianwen, Yuanbao, and Xiaohongshu Diandian.

## 187

- Date: 2026-09-01
- Version: 0.44.3
- Summary: Deduplicates repeated Makers across sibling response nodes in one user-reply group.
- Notes: The first pass used the outer assistant container as its boundary, but Doubao can render one answer in sibling containers. Deduplication now runs after user-group association, so adjacent text headings with the same level and normalized title collapse even when they originate from sibling nodes. Separate user questions, non-adjacent repeats, table Makers, and video Makers remain distinct. `pnpm test` passed 127/127, `pnpm check` passed, and the final single `pnpm build` completed successfully; `dist/manifest.json` is `0.44.3(187)`. Live signed-in validation remains pending for ChatGPT, Doubao, Kimi, Qianwen, Yuanbao, and Xiaohongshu Diandian.

## 186

- Date: 2026-09-01
- Version: 0.44.2
- Summary: Deduplicates adjacent repeated text Makers within one AI reply across all supported platforms.
- Notes: Heading collection now keeps the first of two adjacent text headings only when they share the same outer assistant-response container, level, and normalized title. Different replies, non-adjacent repeats, table Makers, and video Makers remain distinct. `pnpm test` passed 125/125, `pnpm check` passed, and the final single `pnpm build` completed successfully; `dist/manifest.json` is `0.44.2(186)`. Live signed-in validation remains pending for ChatGPT, Doubao, Kimi, Qianwen, Yuanbao, and Xiaohongshu Diandian.

## 185

- Date: 2026-09-01
- Version: 0.44.1
- Summary: Keeps Settings scrolling stable during long conversations.
- Notes: A stable visible-settings signature skips Shadow DOM replacement during unrelated host-page mutations. A genuine settings update preserves the settings body's scroll position, so the bottom Marker filter controls remain reachable. `pnpm test` passed 119/119, `pnpm check` passed, and the final single `pnpm build` completed successfully; `dist/manifest.json` is `0.44.1(185)`. Live signed-in long-conversation validation remains pending because no controllable browser session is available.

## 184

- Date: 2026-09-01
- Version: 0.44.0
- Summary: Makes Maker stacks and user groups expanded by default.
- Notes: User groups and Maker stacks now use collapsed-key state, so every new group starts expanded and only an explicit click can hide it. Active Maker scrolling only synchronizes selection and never changes either group state. `pnpm test` passed 116/116, `pnpm check` passed, and the final `pnpm build` completed successfully; `dist/manifest.json` is `0.44.0(184)`. Live signed-in visual validation remains pending.

## 183

- Date: 2026-09-01
- Version: 0.43.3
- Summary: Keeps the scrolling Maker list below the search bar.
- Notes: The scrolling list has an explicit lower stacking layer while the search control has the higher layer, so the list and its shadow buffer cannot cover the field. `pnpm test` passed 116/116, `pnpm check` passed, and the final `pnpm build` completed successfully; `dist/manifest.json` is `0.43.3(183)`. Live visual validation remains pending.

## 182

- Date: 2026-09-01
- Version: 0.43.2
- Summary: Removes Maker snapshots and rebuilds navigation solely from mounted DOM.
- Notes: The release clears only legacy `polaris.makerSnapshot.v1/v2` keys and their indexes once, then stores a non-conversation cleanup marker. It retains route notifications only, waits for a host DOM mutation after navigation, and no longer rehydrates, reads conversation APIs, or scrolls to recover unmounted Makers. `pnpm test` passed 115/115 and `pnpm check` passed before the final verification build; `dist/manifest.json` is `0.43.2(182)`. Live signed-in route-switch and expanded-group validation remains pending because this automated run has no controllable extension session.

## 181

- Date: 2026-09-01
- Version: 0.43.1
- Summary: Prevents stale ChatGPT Makers during session changes and removes active history loading.
- Notes: A route activation now invalidates the prior ChatGPT session and removes the queue immediately. Only a response confirmed for the current route can hydrate its snapshot and mount AI Makers; stale callbacks and assistant IDs remain excluded. The historical Maker scan, its interaction lock, UI, localization, styles, tests, and release note were removed without deleting existing local snapshots. `pnpm test` passed 177/177 and `pnpm check` passed before the final single build; live signed-in ChatGPT route-switch and expanded-group validation remains pending.

## 180

- Date: 2026-08-28
- Version: 0.43.0
- Summary: Adds explicit, cancellable loading of historical Makers on every supported platform.
- Notes: A dedicated history card now scans earlier host content without reusing the local earlier-question disclosure. ChatGPT refreshes its active branch before the shared DOM scan, while the other platforms use controlled conversation scrolling. Each run is scope-isolated, lasts at most ten seconds, keeps incrementally reconciled records, reports partial ChatGPT results, and restores the reading position by message anchor, bottom distance, or original scroll position. Conversation and Maker navigation locks are released on every terminal path, with keyboard and pointer cancellation preserved. `pnpm test` passed 195/195, `pnpm check` passed, and the single `pnpm build` completed successfully; `dist/manifest.json` is `0.43.0(180)`. Live unpacked-extension validation on signed-in ChatGPT and non-ChatGPT long conversations remains pending because no controllable logged-in extension session was available in this automated run.

## 179

- Date: 2026-08-28
- Version: 0.42.4
- Summary: Keeps every user Maker group collapsed by default and rebuilds runtime Maker ordering on refresh.
- Notes: Latest, previous, and newly streamed user groups now remain collapsed until the user expands them or search temporarily reveals a match. Refresh and route activation restart the page-memory `marker-N` sequence while snapshots retain stable `makerKey` values. ChatGPT rebuilds from the full active branch; partial observations on other platforms preserve cached group and Maker order, insert identified records by nearby anchors, and append unanchored memory-only Makers after cached history. `pnpm test` passed 174/174, `pnpm check` passed, and the single `pnpm build` completed successfully; `dist/manifest.json` is `0.42.4(179)`. Live unpacked-extension refresh and route-switch validation remains pending because it was not available in this automated run.

## 178

- Date: 2026-08-28
- Version: 0.42.3
- Summary: Restores historical Maker snapshots and DOM mappings when assistant IDs are temporarily unavailable.
- Notes: Stable conversations now identify responses by platform, stable user group, and assistant ordinal; real assistant IDs are runtime aliases that migrate existing v2 records without changing `makerKey`. ChatGPT uses its active branch plus confirmed DOM group order, and ambiguous partial multi-reply DOM remains memory-only; other platforms derive identities only for verified user groups and otherwise remain memory-only. Restored 21, 25, or 80-group histories keep the 20-group default and expose the earlier-question entry. `pnpm test` passed 167/167, `pnpm check` passed, and the final `pnpm build` completed successfully; `dist/manifest.json` is `0.42.3(178)`. The build was regenerated after review found and fixed the ambiguous ChatGPT fallback. Live unpacked-extension refresh and remapping validation on ChatGPT and another signed-in platform remains pending because the controllable browser had no open signed-in extension session.

## 177

- Date: 2026-08-28
- Version: 0.42.2
- Summary: Reduces Maker-list compositing cost while preserving native high-precision scrolling.
- Notes: AI Makers, user groups, fold cards, and the floating Active Maker now retain their existing backgrounds, borders, shadows, active colors, blur, and saturation without creating per-element SVG displacement or chromatic-aberration filters. Controls and search keep the full liquid-glass effect. Active tracking only toggles the previous and next elements, and floating scroll updates no longer calculate a filter. Native passive wheel scrolling, the 4 px drag threshold, and manual-scroll ownership remain unchanged. `pnpm test` passed 151/151, `pnpm check` passed, and the single `pnpm build` completed successfully; `dist/manifest.json` is `0.42.2(177)`. Live unpacked-extension Performance and light/dark visual validation in long static and streaming ChatGPT conversations remains pending because no controllable signed-in extension session was available.

## 176

- Date: 2026-08-28
- Version: 0.42.1
- Summary: Removes Maker-list main-thread work from the wheel and scroll hot paths.
- Notes: Maker, user-group, and fold cards now use native browser wheel scrolling and only cancel the temporary 1.2-second Active Maker positioning; the transparent extension area no longer captures wheel input. A cached active-element tracker updates at most the previous and next Maker, floating-state scroll work uses that cache, and liquid-glass filters no longer refresh across the full list during ordinary scrolling. Card dragging retains its 4 px threshold and manual-scroll ownership. `pnpm test` passed 150/150, `pnpm check` passed, and the single `pnpm build` completed successfully; `dist/manifest.json` is `0.42.1(176)`. Live unpacked-extension Performance validation in a long static and streaming ChatGPT conversation remains pending because no controllable signed-in extension session was available.

## 175

- Date: 2026-08-28
- Version: 0.42.0
- Summary: Extends the resilient Maker snapshot model to every supported AI chat platform.
- Notes: ChatGPT, Doubao, Kimi, Qianwen, Yuanbao, and Xiaohongshu Diandian now share platform-aware Maker identity, reconciliation, DOM remapping, and missing-target recovery. Version 2 stores an independent seven-day, 20-conversation, 2 MB LRU namespace per platform; unverified conversation or message identities remain memory-only, and one platform's Storage failure does not disable another. ChatGPT v1 snapshots migrate lazily without changing Maker keys. `pnpm test` passed 142/142, `pnpm check` passed, and the final `pnpm build` completed successfully; `dist/manifest.json` is `0.42.0(175)`. Live unpacked-extension validation across the five newly migrated platforms remains pending because no controllable browser session with the extension and signed-in conversations was available.

## 174

- Date: 2026-08-28
- Version: 0.41.1
- Summary: Lets manual Maker grouping and scrolling override the active item.
- Notes: Stack and user groups can remain collapsed while one of their Makers stays selected. Dragging more than 4 px from any Maker or group card scrolls the queue and suppresses the click, while a light click keeps the existing jump or collapse action. Wheel, trackpad, and drag input continue to cancel temporary Active Maker positioning. `pnpm test` passed 118/118, `pnpm check` passed, and the single `pnpm build` completed successfully; `dist/manifest.json` is `0.41.1(174)`. Live unpacked-extension validation remains pending because no controllable Chrome session was available.

## 173

- Date: 2026-08-28
- Version: 0.41.0
- Summary: Adds resilient local snapshots for ChatGPT Makers.
- Notes: ChatGPT Makers now use stable keys and seven-day `chrome.storage.local` snapshots containing only user first-line previews, Maker titles, and positioning metadata. Snapshots keep at most 20 conversations or 2 MB, are not synchronized, and fall back to the in-memory model when storage is unavailable. Cached Makers attempt a two-second DOM remap before restoring the previous scroll position and showing the not-loaded notice. `pnpm test` passed 113/113, `pnpm check` passed, and the single `pnpm build` completed successfully; `dist/manifest.json` is `0.41.0(173)`.

## 172

- Date: 2026-08-27
- Version: 0.40.0
- Summary: Adds consent-based attribution for the Polaris support entry.
- Notes: The extension adds fixed `utm_source=polaris_extension`, `utm_medium=support_entry`, and `utm_campaign=polaris_support` parameters to its settings-header support link. The separate landing page loads GA4 only after an explicit visitor choice and then measures that arrival plus the video-loading play button. The extension sends no telemetry and adds no analytics host permission. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.40.0(172)` and its description remains unchanged. Update the Chrome Web Store privacy disclosure before publishing this version.

## 171

- Date: 2026-08-27
- Version: 0.39.1
- Summary: Moves the support entry into the About & Settings header.
- Notes: The heart control opens `https://jeffery-ho.github.io/polaris-landing/` in a new tab from the settings header's right edge; it is no longer rendered in the draggable navigation header. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.39.1(171)` and its description remains unchanged.

## 170

- Date: 2026-08-27
- Version: 0.39.0
- Summary: Adds a heart-shaped support entry to the Polaris header.
- Notes: The rightmost header control opens `https://jeffery-ho.github.io/polaris-landing/` in a new tab, stays outside the draggable control capsule, and shares the existing liquid-glass surface. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.39.0(170)` and its description remains unchanged.

## 169

- Date: 2026-08-27
- Version: 0.38.8
- Summary: Redirects the former project support page to the standalone landing page.
- Notes: `support.html` now immediately redirects to `https://jeffery-ho.github.io/polaris-landing/` and exposes a no-script fallback link. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.8(169)` and its description remains unchanged.

## 168

- Date: 2026-08-27
- Version: 0.38.7
- Summary: Moves the published support page to its dedicated GitHub Pages repository.
- Notes: The canonical support URL is now `https://jeffery-ho.github.io/polaris-landing/`; the original project-page `support.html` remains available as a compatibility entry. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.7(168)` and its description remains unchanged.

## 167

- Date: 2026-08-27
- Version: 0.38.6
- Summary: Limits the support video frame to 960px.
- Notes: The video frame uses `width: min(100%, 960px)` so it remains responsive while exposing the PayPal CTA earlier on desktop. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.6(167)` and its description remains unchanged.

## 166

- Date: 2026-08-27
- Version: 0.38.5
- Summary: Keeps the support thumbnail visible until the video is ready for uninterrupted playback.
- Notes: The support page preloads its MP4, shows `assets/polaris-introduction-thumbnail.jpg` during loading, and starts playback only after its buffered ranges cover the full video duration. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.5(166)` and its description remains unchanged.

## 165

- Date: 2026-08-27
- Version: 0.38.4
- Summary: Adds the Polaris tab icon to the support page.
- Notes: The support page now declares `icons/gpt-voyager-icon-32.png` as its PNG favicon. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.4(165)` and its description remains unchanged.

## 164

- Date: 2026-08-27
- Version: 0.38.3
- Summary: Gives the PayPal CTA an Apple Blue liquid-glass treatment.
- Notes: The support page CTA now uses a translucent Apple Blue surface with blur, a light glass edge, inset highlights, and stronger hover elevation while retaining high-contrast white text. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.3(164)` and its description remains unchanged.

## 163

- Date: 2026-08-27
- Version: 0.38.2
- Summary: Shows loading feedback before the support video begins playback.
- Notes: The support page now keeps a visible loading prompt until the muted MP4 starts, shows a buffering prompt when playback pauses for data, and calls `video.play()` after `canplay`. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.2(163)` and its description remains unchanged.

## 162

- Date: 2026-08-27
- Version: 0.38.1
- Summary: Gives Maker hover tips a compact diffuse shadow.
- Notes: Hover tips now use a centered 12px diffuse shadow with reduced opacity instead of the former 12px-down, 32px-blur shadow. The shadow stays visually close to each Maker, reducing lower-edge clipping without changing tip position, width, or list behavior. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.1(162)` and its description remains unchanged.

## 161

- Date: 2026-08-27
- Version: 0.38.0
- Summary: Adds the Polaris support page on GitHub Pages.
- Notes: `support.html` provides the selected light-glass layout with the Chrome Web Store and GitHub Issues links, a responsive muted-autoplay video slot, and a high-contrast direct PayPal CTA. The video source is `assets/polaris-introduction.mp4`; its current source file is approximately 68 MB. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.38.0(161)` and its description remains unchanged.

## 160

- Date: 2026-08-27
- Version: 0.37.6
- Summary: Preserves the full hover-tip shadow around the Maker queue.
- Notes: The scrollable Maker queue expands its shared shadow buffer from 18px to 32px, allowing the 12px-offset, 32px-blur tip shadow to render without lower-edge clipping. The existing shadow, tooltip width, scroll behavior, and four-sided safe padding remain unchanged. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.37.6(160)` and its description remains unchanged.

## 159

- Date: 2026-08-27
- Version: 0.37.5
- Summary: Improves the navigation search placeholder contrast at rest.
- Notes: The navigation search placeholder now uses the theme's secondary text color instead of muted text, keeping it legible against the default main-navigation glass background in both themes. Typed text, hover background, focus behavior, and layout remain unchanged. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.37.5(159)` and its description remains unchanged.

## 158

- Date: 2026-08-27
- Version: 0.37.4
- Summary: Aligns the navigation search bar's default background with the main navigation.
- Notes: The search bar now uses the main navigation glass background by default and switches to its previous input background only while hovered. Search behavior, focus behavior, and layout remain unchanged. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.37.4(158)` and its description remains unchanged.

## 157

- Date: 2026-08-27
- Version: 0.37.3
- Summary: Removes the duplicate leading count badge from folded Maker groups.
- Notes: Folded Maker groups now render the first title followed by the existing remaining-count label and disclosure arrow. The leading total-count badge, its render data, and unused styles are removed; grouping, expansion, ARIA labels, and the compact width limit remain unchanged. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.37.3(157)` and its description remains unchanged.

## 156

- Date: 2026-08-27
- Version: 0.37.2
- Summary: Lets manual Maker-list scrolling override temporary Active Maker positioning.
- Notes: Wheel, trackpad, and actual list-drag input cancel the short Active Maker visibility lease without stopping user-driven list animation. The clicked Maker still receives its initial positioning when the host page settles, while later streaming snapshots preserve the user's viewport and allow that Maker to remain outside the visible list. Route changes, extension invalidation, and missing conversations clear pending positioning frames. Run `pnpm test`, `pnpm check`, then run `pnpm build` exactly once; confirm `dist/manifest.json` is `0.37.2(156)` and its description remains unchanged.

## 155

- Date: 2026-08-27
- Version: 0.37.1
- Summary: Keeps a loaded previous Maker group collapsible while the next reply streams.
- Notes: The ChatGPT unloaded-reply guard now treats existing group Makers as direct evidence that the reply is available, even when assistant conversation metadata briefly lags behind the DOM. Historical groups still show the notice only when they are neither the latest group nor backed by an assistant message or any Maker. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.37.1(155)` and its description remains unchanged.

## 154

- Date: 2026-08-27
- Version: 0.37.0
- Summary: Keeps the Maker list stable and interactive while AI replies stream.
- Notes: A route-scoped keyed reconciler now reuses existing Maker rows, patches growing titles in place, and performs DOM operations only for real additions, removals, or ordering changes. Streaming snapshots no longer clear the list or cancel its scroll animation; a visual anchor preserves the user's current position and adjusts active animation targets and drag baselines by the same delta. Manual collapse state remains authoritative, and collapsed navigation applies the latest snapshot once reopened. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.37.0(154)` and its description remains unchanged.

## 153

- Date: 2026-08-26
- Version: 0.36.6
- Summary: Keeps the previous user group's loaded Makers available when the newest group expands.
- Notes: After the initial snapshot, a directly preceding group first observed with an assistant reply opens once; subsequent renders preserve manual collapse and reappearance state. ChatGPT marker grouping prefers current assistant-to-user metadata, falls back only to the same remembered assistant ID, and recovers still-connected headings from orphan by DOM identity without guessing from duplicate titles. Route changes and extension invalidation clear the association cache. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.36.6(153)` and its description remains unchanged.

## 152

- Date: 2026-08-26
- Version: 0.36.5
- Summary: Prevents Chapter View from controlling the underlying main tabs with navigation keys.
- Notes: The control capsule now resolves keyboard navigation through an internal state-aware helper. While the chapter modal is open, Arrow Left, Arrow Right, Home, and End return no tab target, so the active main tab and focus remain unchanged; closing the modal restores the existing wrapped navigation, while `Shift + Arrow Left/Right` continues to switch chapters outside editable fields. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.36.5(152)` and its description remains unchanged.

## 151

- Date: 2026-08-26
- Version: 0.36.4
- Summary: Left-aligns visible Maker titles without changing their queue placement.
- Notes: AI markers, user groups, and the floating active marker now align their visible text and internal content from the left. User group capsules remain right-aligned in the queue, while AI markers and folded stacks remain left-aligned; existing widths, padding, chevron budgets, navigation, and hover behavior are unchanged. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.36.4(151)` and its description remains unchanged.

## 150

- Date: 2026-08-26
- Version: 0.36.3
- Summary: Prevents Maker hover motion from replaying during streaming refreshes.
- Notes: Mutation-driven progressive renders and ChatGPT conversation refreshes temporarily suppress transitions while the Marker list is rebuilt, then restore the existing idle hover animation after the first painted frame. A generation guard prevents stale frame callbacks from restoring motion during a newer refresh; route changes and extension invalidation reset pending suppression. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.36.3(150)` and its description remains unchanged.

## 149

- Date: 2026-08-26
- Version: 0.36.2
- Summary: Lets historical empty Maker groups toggle when their AI reply exists.
- Notes: The unloaded-reply notice now depends on whether the ChatGPT conversation branch contains an assistant message for that user turn, rather than whether the group currently has visible Makers. Historical groups with an AI message remain expandable and collapsible even with zero Makers; only historical groups with no AI message show the notice. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.36.2(149)` and its description remains unchanged.

## 148

- Date: 2026-08-26
- Version: 0.36.1
- Summary: Keeps the newest user Maker group expanded while its AI markers begin streaming.
- Notes: User-group expansion now tracks every seen group key and auto-expands only a newly observed latest group, even when it has no AI markers yet. Subsequent renders preserve manual collapse state when the same group key is temporarily omitted and later returns. The latest empty group remains toggleable, while unloaded historical ChatGPT groups keep the existing notice. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.36.1(148)` and its description remains unchanged.

## 147

- Date: 2026-08-26
- Version: 0.36.0
- Summary: Starts progressive Maker rendering as soon as streaming output contains its first valid marker.
- Notes: Relevant DOM mutations now enter a two-state scheduler that waits for a non-empty supported Maker, then renders the latest snapshot at most once per fixed 120ms window without sliding the first deadline. Route changes and extension invalidation reset the scheduler; empty headings no longer produce placeholder Makers. Run `pnpm test`, `pnpm check`, then `pnpm build`; confirm `dist/manifest.json` is `0.36.0(147)`, reload `dist/` in Tabbit Browser, and verify Makers appear before a long response finishes while editor mutations remain ignored.

## 146

- Date: 2026-08-26
- Version: 0.35.8
- Summary: Keeps safe viewport spacing and concise Maker titles in minimized control mode.
- Notes: Minimized navigation preserves the normal viewport inset. AI, user, folded, and floating Maker titles use a 160px single-line ellipsis while full labels and interactions remain unchanged; the user Maker pill reserves its 16px horizontal padding plus 14px for a non-shrinking 8px collapse chevron and gap, and a folded group can expand to 280px so its count, remainder, and chevron remain visible. Run `pnpm test`, then `pnpm build`, reload `dist/` in Dia, and verify title truncation, complete chevrons, hover labels, navigation, and restore behavior.

## 145

- Date: 2026-08-25
- Version: 0.35.7
- Summary: Ensures Dia's drag-click suppression never blocks Maker buttons.
- Notes: Even after a completed drag, capture-phase suppression clears its state but lets Maker clicks reach their navigation handlers. Run `pnpm test`, then `pnpm build`, reload `dist/` in Dia, and verify a distant normal heading and a table Maker jump.

## 144

- Date: 2026-08-25
- Version: 0.35.6
- Summary: Keeps Maker clicks separate from marker-list dragging in Dia.
- Notes: Pressing a Maker no longer initializes list dragging, so pointer movement cannot suppress its click; list dragging remains available from blank list space. Run `pnpm test`, then `pnpm build`, reload `dist/` in Dia, and verify a distant normal heading and a table Maker jump.

## 143

- Date: 2026-08-25
- Version: 0.35.5
- Summary: Restores Maker navigation inside Dia's conversation scroll container.
- Notes: All Maker types now calculate the nearest vertical conversation container target position, reserving the fixed-header height and safety gap; without an internal container, navigation falls back to `scrollIntoView`. Run `pnpm test`, then `pnpm build`, reload `dist/` in Dia, and verify both a table Maker and a normal heading Maker in the long ChatGPT conversation.

## 142

- Date: 2026-08-25
- Version: 0.35.4
- Summary: Restores navigation for duplicate table markers after a ChatGPT table rerender.
- Notes: A matching table at the original candidate index is now preferred before unique title-and-fingerprint fallback, so repeated identical tables remain jumpable. Run `pnpm test`, then `pnpm build`, reload `dist/` in Dia, and verify the target table in the long ChatGPT conversation.

## 141

- Date: 2026-08-25
- Version: 0.35.3
- Summary: Makes table markers follow the H3 filter instead of the incorrect H2 filter.
- Notes: On the verified ChatGPT conversation, H3 was enabled while H2 was disabled, so the prior H2 classification removed all ten recognized table markers. Run `pnpm test`, then `pnpm build` and reload `dist/`.

## 140

- Date: 2026-08-25
- Version: 0.35.2
- Summary: Keeps table marker navigation valid after marker filtering rerenders the page.
- Notes: A stale table marker target is resolved again by its title, content fingerprint, and current table-candidate index before scrolling; identical duplicate tables are not selected. Run `pnpm test`, then `pnpm build` and reload `dist/`.

## 139

- Date: 2026-08-25
- Version: 0.35.1
- Summary: Fixes table marker navigation inside conversation scroll containers.
- Notes: Table markers calculate the nearest vertical conversation container's target scroll position, reserving the existing fixed-header height and a safety gap; without such a container, navigation falls back to `scrollIntoView`. Run `pnpm test`, then `pnpm build` and reload `dist/`.

## 138

- Date: 2026-08-25
- Version: 0.35.0
- Summary: Adds one navigation marker for each visible AI response table across supported platforms.
- Notes: The marker title joins the first row's non-empty cells and respects the existing H2 visibility setting; tables with fewer than two populated first-row cells are ignored. Run `pnpm test`, then `pnpm build` and reload `dist/`.

## 137

- Date: 2026-08-25
- Version: 0.34.0
- Summary: Safely formats mixed raw Markdown and preserves Unicode in Chapter View.
- Notes: Raw text now supports common blocks, inline styles, nested task lists, and mixed table cells; raw HTML and image syntax remain text. Run `pnpm test`, then `pnpm build` and reload `dist/`.

## 136

- Date: 2026-08-25
- Version: 0.33.1
- Summary: Uses a more opaque same-color surface when AI maker groups are hovered.
- Notes: The count-fold group retains its original surface when expanded and increases only its same-color background opacity on hover; individual markers, user markers, tabs, and the floating active entry are unchanged. Run `pnpm check`, then `pnpm build` and reload `dist/`.

## 135

- Date: 2026-08-25
- Version: 0.33.0
- Summary: Formats complete raw Markdown pipe tables inside Chapter View.
- Notes: Only a header, delimiter row, and equal-width data rows are converted; incomplete text remains a paragraph. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 134

- Date: 2026-08-25
- Version: 0.32.0
- Summary: Lets empty Chapter View sections jump back to their source heading.
- Notes: The action closes the modal, restores page scrolling, and synchronizes the matching navigation marker. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 133

- Date: 2026-08-25
- Version: 0.31.0
- Summary: Expands Chapter View into a richer, safe Markdown reader.
- Notes: Chapters preserve headings, deletion, nested and task lists, images, and complex tables through a strict DOM and URL allowlist. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 132

- Date: 2026-08-25
- Version: 0.30.1
- Summary: Restores the Settings panel after dismissing its update-notes dialog.
- Notes: The manual entry preserves the active Settings tab while the dialog is open. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 131

- Date: 2026-08-25
- Version: 0.30.0
- Summary: Adds a settings entry for reopening the current feature-version update notes.
- Notes: The entry sits beside the loaded version and opens the same localized notice dialog without changing read status. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 130

- Date: 2026-08-25
- Version: 0.29.4
- Summary: Limits update notices to feature-version (`0.xx`) summaries.
- Notes: Patch releases remain in `builds.md` and `changelog.md` but do not create separate notice cards or prompts. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 129

- Date: 2026-08-25
- Version: 0.29.3
- Summary: Replaces update-notice feedback text actions with mail and GitHub icons.
- Notes: The icon buttons retain localized ARIA labels and hover tooltips. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 128

- Date: 2026-08-25
- Version: 0.29.2
- Summary: Shows release notes from the newest version to the oldest.
- Notes: The three-note limit remains unchanged; only the displayed order is reversed. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 127

- Date: 2026-08-25
- Version: 0.29.1
- Summary: Refines the version-update notice title, close control, and friendly visual cues.
- Notes: The title now includes a small sparkle icon, the feedback line includes an emoji cue, and the close xmark uses centered CSS strokes. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 126

- Date: 2026-08-25
- Version: 0.29.0
- Summary: Adds localized version-update notices with direct feedback actions.
- Notes: First installs and version upgrades show up to three recent release notes. Closing the dialog records the current version locally. Every release must add its bundled note to `src/release-notes.js`. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 125

- Date: 2026-08-25
- Version: 0.28.6
- Summary: Restores Doubao user maker groups after its sent-message DOM update.
- Notes: Polaris classifies the semantic `bg-g-send-msg-bubble-bg` bubble as an internal user message while retaining legacy selectors. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 124

- Date: 2026-08-25
- Version: 0.28.5
- Summary: Shows the unloaded-reply toast whenever a ChatGPT user group has no visible AI makers.
- Notes: The notice now follows the rendered child list, so every empty ChatGPT group provides feedback on click. Run `pnpm build` and load `dist/`.

## 123

- Date: 2026-08-25
- Version: 0.28.4
- Summary: Moves the global unloaded-reply glass toast to the top center.
- Notes: The toast enters from above and remains non-interactive. Run `pnpm build` and load `dist/`.

## 122

- Date: 2026-08-25
- Version: 0.28.3
- Summary: Styles unloaded-reply notices as a global glass toast.
- Notes: The toast is bottom-centered, theme-aware, non-interactive, and uses the same blur, border, and shadow language as navigation. Run `pnpm build` and load `dist/`.

## 121

- Date: 2026-08-25
- Version: 0.28.2
- Summary: Shows a notice when a ChatGPT history user group has no mounted reply DOM.
- Notes: The notice only applies to conversation-tree groups without AI heading DOM; other empty user groups retain their existing behavior. Run `pnpm build` and load `dist/`.

## 120

- Date: 2026-08-25
- Version: 0.28.1
- Summary: Restores the blue background for user maker groups in light page themes.
- Notes: The light-theme rule now preserves user maker and hover colors while active AI makers remain black. Run `pnpm build` and load `dist/`.

## 119

- Date: 2026-08-25
- Version: 0.28.0
- Summary: Makes maker-list scrolling continuous and follows the ChatGPT page visual theme.
- Notes: Native scrolling retains trackpad momentum inside the list; the outer hit area uses requestAnimationFrame animation. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 118

- Date: 2026-08-25
- Version: 0.27.1
- Summary: Reads the active ChatGPT conversation branch for long-conversation user groups.
- Notes: Historical user groups no longer depend on mounted DOM rows; only mounted assistant headings remain jumpable. Run `pnpm test`, then `pnpm build` and load `dist/`.

## 117

- Date: 2026-08-25
- Version: 0.27.0
- Summary: Adds a configurable first-screen limit for user maker groups.
- Notes: The latest 20 user groups remain visible by default; earlier groups expand from a single control, while search always includes every matching group. Run `pnpm build` and load `dist/`.

## 116

- Date: 2026-08-25
- Version: 0.26.13
- Summary: Keeps every user-message group visible in the AI maker navigation list.
- Notes: User groups without recognized AI heading makers remain as empty, collapsible rows; run `pnpm build` and load `dist/`.

## 115

- Date: 2026-08-24
- Version: 0.26.12
- Summary: Synchronizes the packaged extension name with the product name.
- Notes: The generated manifest now uses Polaris: AI Chat Navigator — Smart Headings & Quick Jump. Run `pnpm build` and load `dist/`.

## 114

- Date: 2026-08-24
- Version: 0.26.11
- Summary: Synchronizes the build manifest version with the release record.
- Notes: Both source manifests and the generated extension manifest use 0.26.11(114); run `pnpm build` and load `dist/`.

## 113

- Date: 2026-08-24
- Version: 0.26.10
- Summary: Softens the chapter search focus treatment and caps its width.
- Notes: The focused search field uses a theme-appropriate light gray surface and does not grow beyond 360px, preserving space around the action buttons. Run `pnpm build` and load `dist/`.

## 112

- Date: 2026-08-24
- Version: 0.26.9
- Summary: Keeps chapter tabs visible when the dialog shrinks to the viewport.
- Notes: The dialog now uses the available viewport height; only the chapter body scrolls while the header, tabs and shortcut hint remain visible. Run `pnpm build` and load `dist/`.

## 111

- Date: 2026-08-24
- Version: 0.26.8
- Summary: Lets the chapter dialog header size itself to its contents.
- Notes: The header no longer has a minimum height; its search field and actions determine the rendered height. Run `pnpm build` and load `dist/`.

## 110

- Date: 2026-08-24
- Version: 0.26.7
- Summary: Fixes chapter dialog overflow and keyboard event propagation.
- Notes: The dialog uses natural content height and the overlay scrolls on short viewports; Shift+Left/Right switches only chapters. Run `pnpm build` and load `dist/`.

## 109

- Date: 2026-08-23
- Version: 0.26.6
- Summary: Refines the rating card action and hover treatment.
- Notes: The action is black and spans the full card content width; hovering the card does not apply a dark border. Run `pnpm build` and load `dist/`.

## 108

- Date: 2026-08-23
- Version: 0.26.5
- Summary: Stacks the rating card and emphasizes its action.
- Notes: The prompt appears above a prominent full-width green Rate Now action; run `pnpm build` and load `dist/`.

## 107

- Date: 2026-08-23
- Version: 0.26.4
- Summary: Adds a local 24-hour dismissal to the rating card.
- Notes: Dismissal clears on extension reinstall and does not sync across devices; run `pnpm build` and load `dist/`.

## 106

- Date: 2026-08-23
- Version: 0.26.3
- Summary: Moves the rating card below the supported-platform description.
- Notes: The rating card now appears before the settings heading and configuration items; run `pnpm build` and load `dist/`.

## 105

- Date: 2026-08-23
- Version: 0.26.2
- Summary: Replaces the full-width reset control with a localized Chrome Web Store rating card.
- Notes: Reset moves into the settings title row as a compact control; run `pnpm build` and load `dist/`.

## 104

- Date: 2026-08-23
- Version: 0.26.1
- Summary: Reorganizes settings information and adds a supported-platform overview.
- Notes: The Header retains the Polaris identity, the Footer shows version and feedback actions, and the platform overview is localized. Run `pnpm build` and load `dist/`.

## 103

- Date: 2026-08-23
- Version: 0.26.0
- Summary: Adds keyboard chapter paging and a persistent shortcut hint.
- Notes: Shift+Left/Right cycles chapters outside editable fields; run `pnpm build` and load `dist/`.

## 102

- Date: 2026-08-23
- Version: 0.25.1
- Summary: Removes the visible settings synchronization status.
- Notes: Preferences continue to use Chrome Storage Sync internally; the footer now contains only feedback actions. Run `pnpm build` and load `dist/`.

## 101

- Date: 2026-08-23
- Version: 0.25.0
- Summary: Adds semantic Markdown and table rendering to chapter content.
- Notes: Preserves safe emphasis, code, links, quotes, lists and tables from AI responses; run `pnpm build` and load `dist/`.

## 100

- Date: 2026-08-23
- Version: 0.24.16
- Summary: Limits chapter dialog content to the selected chapter.
- Notes: Switching a chapter chip replaces the body instead of showing adjacent chapter content; run `pnpm build` and load `dist/`.

## 99

- Date: 2026-08-23
- Version: 0.24.15
- Summary: Combines chapter copy actions into a dropdown menu.
- Notes: The menu offers current-chapter and full-text copying, then closes after selection; Escape closes it before closing the dialog. Run `pnpm build` and load `dist/`.

## 98

- Date: 2026-08-23
- Version: 0.24.14
- Summary: Gives the chapter modal solid black-and-white theme backgrounds.
- Notes: Light mode uses white and dark mode uses near-black, while the overlay and controls retain their hierarchy; run `pnpm build` and load `dist/`.

## 97

- Date: 2026-08-23
- Version: 0.24.13
- Summary: Reduces chapter modal mask opacity in both themes.
- Notes: The background remains distinguishable without excessively darkening the page; run `pnpm build` and load `dist/`.

## 96

- Date: 2026-08-23
- Version: 0.24.12
- Summary: Makes the chapter modal use the same glass tokens as settings.
- Notes: The modal now shares the glass background, border, shadow and blur in both themes; run `pnpm build` and load `dist/`.

## 95

- Date: 2026-08-23
- Version: 0.24.11
- Summary: Aligns selected checkbox control borders with the selected state.
- Notes: The chip and check control use the same theme-highlight border; run `pnpm build` and load `dist/`.

## 94

- Date: 2026-08-23
- Version: 0.24.10
- Summary: Unifies settings control default borders with a theme-aware gray.
- Notes: Hover, selected and keyboard-focus highlights remain unchanged; run `pnpm build` and load `dist/`.

## 93

- Date: 2026-08-23
- Version: 0.24.9
- Summary: Removes default borders from slider tracks and unchecked checkboxes.
- Notes: Selected and keyboard-focus states remain visible; run `pnpm build` and load `dist/`.

## 92

- Date: 2026-08-23
- Version: 0.24.8
- Summary: Standardizes rectangular extension controls on 24pt corners.
- Notes: Pills, markers and icon buttons remain fully rounded; run `pnpm build` and load `dist/`.

## 91

- Date: 2026-08-23
- Version: 0.24.7
- Summary: Unifies rectangular controls with large corner radii.
- Notes: Pills and icon buttons remain fully rounded; run `pnpm build` and load `dist/`.

## 90

- Date: 2026-08-23
- Version: 0.24.6
- Summary: Makes the settings panel use the same glass tokens as the Tab capsule.
- Notes: The panel keeps its 14pt radius and layout, while the background, border, shadow and blur match the top controls. Run `pnpm build` and load `dist/`.

## 89

- Date: 2026-08-23
- Version: 0.24.5
- Summary: Restores the full-width native Hero-style reset button and smooth slider dragging.
- Notes: Slider progress updates locally while dragging, then applies and syncs on release. Run `pnpm build` and load `dist/`.

## 88

- Date: 2026-08-23
- Version: 0.24.4
- Summary: Restores the native settings panel glass surface and Hero-style control states.
- Notes: Keeps the native implementation and the smaller content bundle. Run `pnpm build` and load `dist/`.

## 87

- Date: 2026-08-22
- Version: 0.24.3
- Summary: Removes the HeroUI and React runtime from the settings panel.
- Notes: Native DOM controls preserve the existing glass design, keyboard focus, syncing and feedback links. Run `pnpm build` and load `dist/`.

## 86

- Date: 2026-08-22
- Version: 0.24.2
- Summary: Renames the About tab to About&Settings.
- Notes: Chinese uses “关于与设置”; the existing configuration panel remains unchanged. Run `pnpm build` and load `dist/`.

## 85

- Date: 2026-08-22
- Version: 0.24.1
- Summary: Replaces the feedback Issue document icon with the GitHub mark.
- Notes: The link, tooltip, aria label and circular HeroUI-style button remain unchanged; run `pnpm build` and load `dist/`.

## 84

- Date: 2026-08-22
- Version: 0.24.0
- Summary: Adds About feedback actions and stabilizes Xiaohongshu Diandian user-to-AI maker mapping.
- Notes: The original marker folding behavior remains unchanged; run `pnpm build` and load `dist/`.

## 83

- Date: 2026-08-22
- Version: 0.23.0
- Summary: Aligns settings panel and maker widths with the Tab control capsule and shows full maker titles within that width.
- Notes: Long titles wrap instead of being truncated; run `pnpm build` and load `dist/`.

## 82

- Date: 2026-08-22
- Version: 0.23.0
- Summary: Rebuilds the settings panel with HeroUI React components in an isolated Shadow DOM.
- Notes: Run `pnpm build` and load `dist/`; Slider changes apply immediately and synchronize on release.

## 81

- Date: 2026-08-22
- Version: 0.22.0
- Summary: Reworks the settings panel with fixed app and sync regions, slider controls, and unified theme highlights.
- Notes: The visible app name is Polaris; the Manifest name is unchanged; the displayed version format is `0.22.0(81)`.

## 80

- Date: 2026-08-22
- Version: 0.21.0
- Summary: Adds a compact control-capsule mode.
- Notes: Hovering or focusing the capsule reveals a round minimize or maximize button. Compact mode keeps the Voyager icon and current tab title, preserves open settings, and syncs across supported sites.

## 79

- Date: 2026-08-22
- Version: 0.20.1
- Summary: Removes obsolete manual navigation offsets.
- Notes: Top gap and Right offset are removed from settings because the control capsule can be positioned directly. Maximum markers remains configurable.

## 78

- Date: 2026-08-22
- Version: 0.20.0
- Summary: Enables touchpad marker scrolling and movable navigation controls.
- Notes: Marker queues support two-finger scrolling and press-drag scrolling without accidental activation. The full control capsule can be dragged and its synchronized viewport position is restored across supported sites.

## 77

- Date: 2026-08-18
- Version: 0.19.0
- Summary: Shows a copy-success toast after Chapter View copy actions.
- Notes: Copy current chapter and copy full text display a transient toast only when clipboard write succeeds.

## 76

- Date: 2026-08-18
- Version: 0.18.5
- Summary: Replaces the Chapter View close button with a circular glass close icon.
- Notes: Keeps the close action accessible through an aria label and hover/focus states.

## 75

- Date: 2026-08-18
- Version: 0.18.4
- Summary: Hides the navigation search box when the marker queue is collapsed.
- Notes: The search box now follows the navigation expand/collapse state.

## 74

- Date: 2026-08-18
- Version: 0.18.3
- Summary: Aligns fold-card edge padding with regular text markers.
- Notes: Changes fold-card horizontal padding from 10px to 8px to match marker pills.

## 73

- Date: 2026-08-18
- Version: 0.18.2
- Summary: Adds a count bubble to the left side of each marker fold card.
- Notes: The bubble shows the number of markers stacked in that group while the card label keeps the first title and remaining count.

## 72

- Date: 2026-08-18
- Version: 0.18.1
- Summary: Changes marker folding to full groups of the configured threshold.
- Notes: Only full groups collapse, trailing markers stay visible, cards show the first title plus remaining count, and stack layers use vertical offset with bottom spacing.

## 71

- Date: 2026-08-18
- Version: 0.18.0
- Summary: Folds the first N navigation markers into an expandable stack card.
- Notes: Adds a configurable fold threshold (default 20), in-place expand/collapse with a count, and search bypasses folding.

## 70

- Date: 2026-08-18
- Version: 0.17.0
- Summary: Adds fuzzy title search to the navigation marker queue and Chapter View.
- Notes: Matches titles by Unicode-aware, case-insensitive subsequence after removing whitespace; Command/Control+F focuses the current search box.

## 69

- Date: 2026-08-18
- Version: 0.16.8
- Summary: Adds browser-language internationalization for the extension UI.
- Notes: Uses Chinese for `zh*` browser languages and English otherwise, with English as the missing-key fallback.

## 68

- Date: 2026-08-18
- Version: 0.16.7
- Summary: Speeds up control-tab switching and restores the navigation icon and chevron.
- Notes: Switching settings and navigation tabs updates only tab state; clicking the active navigation tab still re-renders to collapse or expand the marker queue.

## 67

- Date: 2026-08-18
- Version: 0.16.6
- Summary: Adds explicit settings-menu dismissal.
- Notes: Pressing Escape or clicking outside the control capsule and settings panel returns to the navigation tab.

## 66

- Date: 2026-08-18
- Version: 0.16.5
- Summary: Restores the dark glass surface for normal markers in dark mode.
- Notes: Hovered, selected, and floating active markers remain white with black text.

## 65

- Date: 2026-08-18
- Version: 0.16.4
- Summary: Fixes dark-mode marker overrides.
- Notes: Moves the dark-mode marker rules after their base styles so normal, selected, and floating active markers render with white backgrounds.

## 64

- Date: 2026-08-18
- Version: 0.16.3
- Summary: Uses a white marker surface in dark mode.
- Notes: Normal, hovered, selected, and floating active markers use white or near-white backgrounds with black text in dark mode.

## 63

- Date: 2026-08-18
- Version: 0.16.2
- Summary: Aligns selected control tabs and markers with the light and dark themes.
- Notes: Light mode uses black with white text; dark mode uses white with black text for selected tabs, markers, and the floating active marker.

## 62

- Date: 2026-08-18
- Version: 0.16.1
- Summary: Changes the selected tab in the control capsule to black.
- Notes: The black selected state applies only to the navigation, Chapter View, and settings tabs; marker highlighting is unchanged.

## 61

- Date: 2026-08-18
- Version: 0.16.0
- Summary: Consolidates navigation, Chapter View, and settings into one tabbed glass capsule.
- Notes: Adds SPA route lifecycle cleanup so the overlay is removed after leaving a supported route and rebuilt when returning.

## 60

- Date: 2026-08-17
- Version: 0.15.0
- Summary: Renames Explosion Mode to Chapter View and adds chapter/full-text copying.
- Notes: Fixes selected chapter chips being overridden by the right-rail active marker, and moves all modal actions into the content header.

## 59

- Date: 2026-08-17
- Version: 0.14.9
- Summary: Markers return to a 12pt-spaced document-order queue.
- Notes: Restores queue scrolling, the expanded wheel hit area and the floating active marker; clicking scrolls directly to its matching heading.

## 58

- Date: 2026-08-17
- Version: 0.14.8
- Summary: Markers now follow their mapped heading rows in the visible conversation.
- Notes: Replaces the scrollable queue with a DOM-positioned rail, hides off-screen headings, and keeps the legacy maximum-count preference only for backward compatibility.

## 57

- Date: 2026-08-17
- Version: 0.14.7
- Summary: Restores the marker queue and scrolls selected messages to the conversation top.
- Notes: Restores queue scrolling, floating active marker and height limit; clicking uses the containing AI message container, falling back to the heading.

## 56

- Date: 2026-08-17
- Version: 0.14.6
- Summary: Visible messages retain all of their markers.
- Notes: A marker stays eligible while its AI message is visible; its own heading DOM remains the position anchor and is clamped to the rail edge when off-screen.

## 55

- Date: 2026-08-17
- Version: 0.14.5
- Summary: Marker positions now follow their individual heading DOM targets.
- Notes: Replaces whole-message centering with the visible marker target's vertical center while retaining the message container as a layout-change observer.

## 54

- Date: 2026-08-17
- Version: 0.14.4
- Summary: Right-side markers now follow the visible AI message DOM.
- Notes: Groups markers at each message center, avoids collisions, limits dense views by the configured maximum, and updates positions on scroll and message resizing.

## 53

- Date: 2026-08-17
- Version: 0.14.3
- Summary: Markers no longer use soft drop shadows.
- Notes: Removes the shared glass shadow from regular and floating active markers while retaining their one-pixel glass border.

## 52

- Date: 2026-08-17
- Version: 0.14.2
- Summary: Navigation hover backgrounds now match the reset button hover state.
- Notes: Reuses the same shared hover fill for markers and top controls while preserving the active selection color.

## 51

- Date: 2026-08-17
- Version: 0.14.1
- Summary: Navigation control backgrounds now match the settings panel.
- Notes: Makes the inactive marker and top control backgrounds reuse the settings panel's shared glass background while preserving hover, active, and form-control surfaces.

## 50

- Date: 2026-07-06
- Version: 0.14.0
- Summary: Explosion mode now reuses marker sections across every supported platform.
- Notes: Switches section boundary detection from native DOM headings to the sorted `collectHeadings()` result so chips and adjacent reading blocks stay aligned on ChatGPT, Doubao, Kimi, Qianwen, Yuanbao, and Xiaohongshu Diandian.

## 49

- Date: 2026-07-06
- Version: 0.14.0
- Summary: Adds a full-screen explosion mode for selecting AI reply text.
- Notes: Reuses assistant container detection to collect only AI replies, opens from a control button or `Cmd/Ctrl+Shift+F`, locks background scroll, and supports copying the current text selection.

## 48

- Date: 2026-06-11
- Version: 0.13.4
- Summary: Marker tooltip text now wraps within the configured width.
- Notes: Replaces single-line ellipsis clipping with normal wrapping and long-word breaking while keeping the existing tooltip maximum width setting.

## 47

- Date: 2026-06-08
- Version: 0.13.3
- Summary: Typing in chat input no longer causes marker churn.
- Notes: Ignores mutations inside user input editors and the extension navigation root, and excludes editable input containers from assistant Markdown container collection.

## 46

- Date: 2026-06-07
- Version: 0.13.2
- Summary: Navigation controls remain visible when filters hide every marker.
- Notes: Keeps the toggle and settings controls available after marker filters produce an empty list, and restores the previous light-mode glass background variables while retaining the BoomBranch-like dark theme.

## 45

- Date: 2026-06-07
- Version: 0.13.1
- Summary: Global glass styling now follows a BoomBranch-like light and dark theme.
- Notes: Updates shared glass variables so markers, controls, settings, inputs, and tooltips use consistent translucent surfaces, subtle borders, and soft shadows across light and dark modes.

## 44

- Date: 2026-06-07
- Version: 0.13.0
- Summary: Unordered-list heading markers now have their own marker option.
- Notes: Adds a per-platform `enabledUnorderedListByPlatform` setting and `unordered-list` source type so unordered-list markers are no longer controlled by H3.

## 43

- Date: 2026-06-07
- Version: 0.12.1
- Summary: Xiaohongshu main-site AI chat now receives the Diandian content script.
- Notes: Adds `www.xiaohongshu.com` injection for SPA navigation into `/ai_chat`, keeps collection disabled on ordinary Xiaohongshu pages, and recognizes `xhs-ai-chat-page` chat containers used by the main-site Diandian page.

## 42

- Date: 2026-06-07
- Version: 0.12.0
- Summary: Xiaohongshu Diandian now supports H4 heading markers.
- Notes: Extends Diandian Markdown heading collection and marker settings to H1-H4, migrates old Diandian settings to enable H4 once, and preserves the previous limits for other platforms.

## 41

- Date: 2026-06-07
- Version: 0.11.1
- Summary: Xiaohongshu Diandian injection now covers the actual production domains.
- Notes: Adds `www.askdiandian.com` and `www.diandianlife.top` to extension matches, and includes deep research Markdown containers for Diandian pages.

## 40

- Date: 2026-06-07
- Version: 0.11.0
- Summary: Xiaohongshu Diandian and unordered list heading markers are now supported.
- Notes: Adds Diandian host injection with H1-H3 assistant Markdown markers, and recognizes clear unordered-list title items across platforms as level-3 markers.

## 39

- Date: 2026-06-07
- Version: 0.10.3
- Summary: Collapse toggle chevron now points up when expanded and down when collapsed.
- Notes: Fixes the default expanded state direction so the icon matches the "collapse all" action.

## 38

- Date: 2026-06-07
- Version: 0.10.2
- Summary: README now highlights the latest marker filtering and liquid glass features.
- Notes: Rewrites README into a concise GitHub-facing overview and updates the displayed version.

## 37

- Date: 2026-06-07
- Version: 0.10.1
- Summary: Settings menu controls now follow an Arco Design inspired style.
- Notes: Refines settings input, checkbox, reset button, spacing, text hierarchy, and hover states with Arco-like tokens while retaining the liquid glass menu shell.

## 36

- Date: 2026-06-07
- Version: 0.10.0
- Summary: Settings can filter marker heading levels per platform.
- Notes: Adds per-platform H1/H2/H3 marker type filters in the settings menu, preserves at least one enabled level, and migrates old configs with defaults.

## 35

- Date: 2026-06-07
- Version: 0.9.9
- Summary: Marker list wheel scrolling now uses the plugin maximum width as its hit area.
- Notes: Adds a non-click-blocking wheel hit test across the right-side plugin width so users can scroll the marker list without aiming directly at a marker pill.

## 34

- Date: 2026-06-05
- Version: 0.9.8
- Summary: Settings input focus and reset button strokes are removed.
- Notes: Removes the yellow focused outline from settings inputs and strips the glass outline stroke from the reset button.

## 33

- Date: 2026-06-05
- Version: 0.9.7
- Summary: Settings controls now better match the liquid glass styling.
- Notes: Removes the settings trigger outline stroke, sets settings inputs and reset button to #f5f5f5, and strengthens the settings menu glass material.

## 32

- Date: 2026-06-05
- Version: 0.9.6
- Summary: Marker list content now right-aligns with the collapse button.
- Notes: Keeps a right-side shadow buffer outside the marker content edge so marker pills align with the toggle while glass shadows remain unclipped.

## 31

- Date: 2026-06-05
- Version: 0.9.5
- Summary: Settings button hover now matches the collapse button pale blue state.
- Notes: Reuses the collapse button hover color for the settings trigger to avoid the dark liquid-glass hover.

## 30

- Date: 2026-06-05
- Version: 0.9.4
- Summary: Inactive markers now use a white glass background.
- Notes: Replaces the grey inactive marker fill with a translucent white material to better match liquid glass styling.

## 29

- Date: 2026-06-05
- Version: 0.9.3
- Summary: Settings menu and inputs now participate in the liquid glass material.
- Notes: Adds the menu panel and settings inputs to the per-element liquid glass filter pipeline.

## 28

- Date: 2026-06-05
- Version: 0.9.2
- Summary: Marker list scrolling no longer clips marker glass shadows.
- Notes: Adds a compensated shadow buffer around the marker list scroll area.

## 27

- Date: 2026-06-05
- Version: 0.9.1
- Summary: Liquid glass now follows the nikdelvin data-URL displacement filter approach.
- Notes: Generates per-element SVG displacement filters from element size and observes glass controls with ResizeObserver.

## 26

- Date: 2026-06-05
- Version: 0.9.0
- Summary: Liquid glass styling now uses a local JS-injected SVG filter enhancement.
- Notes: Adds a hidden SVG filter with turbulence, displacement, and blur, while retaining the pure CSS glass fallback and avoiding WebGL, canvas, and third-party dependencies.

## 25

- Date: 2026-06-05
- Version: 0.8.1
- Summary: Marker pills and the collapse toggle no longer show grey outline strokes.
- Notes: Keeps the glass shadow and material blur while removing the 1px border-like stroke from marker and toggle surfaces.

## 24

- Date: 2026-06-05
- Version: 0.8.0
- Summary: Markers and navigation buttons now use pure CSS glass material styling.
- Notes: Adds backdrop blur, saturation, translucent fills, and inner highlights while preserving inactive, hover, and active color semantics.

## 23

- Date: 2026-06-05
- Version: 0.7.8
- Summary: Settings reset hover state now uses marker-like pale blue contrast.
- Notes: Applies the same visible hover/focus color in dark and light menu themes.

## 22

- Date: 2026-06-05
- Version: 0.7.7
- Summary: Active marker list scrolling now persists briefly after marker clicks.
- Notes: Re-applies active marker visibility while the host page settles, without permanently fighting manual marker-list scrolling.

## 21

- Date: 2026-06-05
- Version: 0.7.6
- Summary: Inactive markers now use one consistent default grey background.
- Notes: Removes per-item opacity variation while keeping hover and active colors unchanged.

## 20

- Date: 2026-06-05
- Version: 0.7.5
- Summary: Floating active marker clicks now keep a smooth page scroll effect.
- Notes: Preserves one-click behavior by starting page scrolling before marker-list scrolling and focus updates.

## 19

- Date: 2026-06-05
- Version: 0.7.4
- Summary: Floating active marker clicks now jump the page anchor immediately with one click.
- Notes: Runs the page anchor jump before marker-list scrolling and keeps focus from scrolling the page again.

## 18

- Date: 2026-06-05
- Version: 0.7.3
- Summary: Floating active marker now returns both the marker list and the page anchor to the selected heading.
- Notes: Keeps the selected marker active while off-screen and preserves the floating marker 20pt above the visible marker list bottom.

## 17

- Date: 2026-06-05
- Version: 0.7.2
- Summary: Active marker selection now persists after click and uses the floating marker only when the selected marker leaves the screen.
- Notes: Positions the floating active marker 20pt above the visible marker list bottom.

## 16

- Date: 2026-06-05
- Version: 0.7.1
- Summary: Clicked marker highlighting now stays unique and persists while the marker list is scrolled.
- Notes: Uses internal marker keys for active matching and shows a clickable bottom floating active marker 20pt above the visible list bottom only when the active item is fully outside the browser viewport.

## 15

- Date: 2026-06-04
- Version: 0.7.0
- Summary: Marker lists now default to top-down display from below the page header.
- Notes: Removes automatic bottom scroll when headings are added.

## 14

- Date: 2026-06-04
- Version: 0.6.0
- Summary: Qianwen pages are supported with assistant body H1-H3 markers and first-video title markers.
- Notes: Adds `www.qianwen.com` and `qianwen.com` extension matches.

## 13

- Date: 2026-06-04
- Version: 0.5.0
- Summary: Kimi pages are supported with assistant body H1-H2 markers.
- Notes: Adds `www.kimi.com` and `kimi.com` extension matches while excluding Kimi share page titles from markers.

## 12

- Date: 2026-06-04
- Version: 0.4.0
- Summary: Yuanbao pages are supported with H1-H2 body markers and video big-card title markers.
- Notes: Adds `yb.tencent.com` and `yuanbao.tencent.com` extension matches.

## 11

- Date: 2026-06-04
- Version: 0.3.2
- Summary: Settings menu hover guard keeps the menu open while moving through the left-side blank area.
- Notes: Bug fix for premature menu close when moving from the settings trigger toward the settings menu.

## 7

- Date: 2026-06-03
- Version: 0.1.0
- Summary: MIT license added, changes published to GitHub, and release zip prepared.
- Notes: Release tag is `v0.1.0-build.7`.

## 6

- Date: 2026-06-03
- Version: 0.1.0
- Summary: Version/build text is placed to the right of sync status with `12pt` spacing.
- Notes: Version unchanged because no version update type was declared for this layout adjustment.

## 5

- Date: 2026-06-03
- Version: 0.1.0
- Summary: Settings menu shows the loaded extension version and build.
- Notes: The value comes from Manifest `version_name`.

## 4

- Date: 2026-06-03
- Version: 0.1.0
- Summary: Settings menu is layered above heading markers.
- Notes: Version unchanged because no version update type was declared for this overlay fix.

## 3

- Date: 2026-06-03
- Version: 0.1.0
- Summary: Sync status labels now read `同步已启用` and `同步未启用`.
- Notes: Version unchanged because no version update type was declared for this text-only change.

## 2

- Date: 2026-06-03
- Version: 0.1.0
- Summary: Settings menu shows `chrome.storage.sync` availability status.
- Notes: Green `同步已启用` means sync storage access succeeded; grey `同步未启用` means unavailable or failed.

## 1

- Date: 2026-06-03
- Version: 0.1.0
- Summary: Polaris for Web now persists front-end settings through `chrome.storage.sync`.
- Notes: Reload the unpacked extension in each browser after pulling this code build.
