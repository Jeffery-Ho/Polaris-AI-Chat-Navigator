# Polaris: AI Chat Navigator Guidelines

## Heading Marker Rule

- Recognize and render heading markers according to the current platform level limit.
- `level-4` markers are only supported on Xiaohongshu Diandian.
- `usableHeadings` may include unordered-list marker items independently from heading level filters.
- Future changes to heading extraction must preserve per-platform level limits unless the user explicitly asks to change them.
- Kimi pages must only render assistant Markdown body headings up to `H2`.
- Kimi share page titles such as `.share-title` must not render as markers.
- Qianwen pages may render assistant Markdown body headings up to `H3`.
- Qianwen video lists may render one `level-2` marker using the first visible video title only.
- Yuanbao pages must only render Markdown body headings up to `H2`.
- Yuanbao video big-card titles may render as `level-2` markers.
- Xiaohongshu Diandian pages may render assistant Markdown body headings up to `H4`.
- Xiaohongshu Diandian support must cover `diandian.xiaohongshu.com`, `www.xiaohongshu.com/ai_chat`, `www.askdiandian.com`, and `www.diandianlife.top`.
- Unordered list heading markers must use a separate unordered-list marker option and must not be controlled by the H3 marker filter.
- Ordered-list markers must use a separate per-platform option, default to disabled, and must not be controlled by heading-level or unordered-list filters.
- Bold-text markers must use a separate per-platform option, default to enabled, and must not be controlled by heading-level or unordered-list filters.
- Unordered list extraction must only accept clear title items: leading bold title, `标题：正文` style title, or short standalone title text.
- A leading bold title in an unordered-list item is a bold-text marker and follows the bold-text option; text-derived list titles continue to follow the unordered-list option.
- A leading bold title in an ordered-list item is a bold-text marker and follows the bold-text option; text-derived list titles continue to follow the ordered-list option.
- Unordered list extraction must ignore nested list items, tables, code blocks, blockquotes, and long body-like list content.

## Assistant Container Rule

- Detect the current chat site from `window.location.hostname`.
- Do not add a manual UI switch for choosing the assistant container source.
- Use site-specific assistant containers first, then fall back to generic Markdown containers.
- Assistant container collection must exclude user input editors such as `textarea`, `input`, `contenteditable`, `role="textbox"`, and ProseMirror.
- On Kimi, prefer assistant containers under `.segment-assistant .markdown`.
- On Qianwen, prefer assistant containers under `[class*="message-select-wrapper-answer"] .qk-markdown`.
- On Yuanbao, prefer AI response containers under `data-conv-speaker="ai"` and include `hyc-common-markdown` content plus video big-card titles.
- On Xiaohongshu Diandian, prefer Markdown containers using `markdown-styles-diandian-main`, `markdown-styles-pc-main`, or `markdown-styles-xhs-main`.
- On Xiaohongshu Diandian deep research pages, include `markdown-styles-deep-research`.
- On Xiaohongshu main-site AI chat pages, include `xhs-ai-chat-page` chat containers such as `round-item`, `scroll-container`, and `chat-container`.

## Floating Tooltip Rule

- The marker list must default to top-down display from below the page header.
- Mutations inside user input editors or the extension navigation root must not trigger marker recomputation.
- Do not auto-scroll the marker list to the bottom during initial render or heading growth.
- The right-side navigation container must leave enough horizontal room for marker tooltips.
- Do not constrain the list to marker width if tooltip labels need to extend left into the page.
- Transparent layout space must not block clicks in the ChatGPT content area.
- Inactive markers must use one consistent theme-aware translucent glass background without per-item opacity variation.
- Marker and navigation button glass styling must use pure CSS only: translucent backgrounds, `backdrop-filter`, `-webkit-backdrop-filter`, border highlights, and shadows. Do not add external libraries, JS filters, or SVG filters for this effect unless explicitly requested.
- Settings menu panels and settings inputs should use the same liquid glass material family as markers and navigation buttons.
- Settings trigger must not show the glass-mode 1px outline stroke.
- Settings inputs and the compact settings reset button should inherit the theme-aware glass input/reset background variables.
- Settings inputs must not show a separate focus outline.
- The compact settings reset button must not show the glass-mode 1px outline stroke.
- Settings menu panels should use a stronger liquid glass treatment than compact buttons through higher blur/saturation and menu-specific glass shadow.
- Settings menu form controls should follow an Arco Design inspired style: compact 32px inputs/buttons, 6px radius, light border tokens, blue checkbox selected state, and subtle grey hover fills.
- Liquid glass enhancement must use only a local JS-generated SVG data-URL filter with pure CSS glass fallback; do not add external libraries, remote scripts, WebGL, canvas, or html2canvas unless explicitly requested.
- Liquid glass displacement should follow the nikdelvin-style per-element data-URL SVG filter, recomputed from element size with `ResizeObserver`.
- Marker pills, floating active markers, and the collapse toggle must not show a grey 1px outline stroke in glass mode.
- Keep marker hover in a pale blue tone, and marker selected state in a stronger blue, not orange.
- Only the clicked active marker may use the selected blue state.
- Active marker matching must use an internal marker key, not the heading DOM id.
- Marker focus must not add a separate visual highlight.
- Marker type filtering must be saved per platform with fixed keys `chatgpt`, `claude`, `gemini`, `grok`, `doubao`, `kimi`, `qianwen`, `yuanbao`, `xiaohongshu`, and `default`.
- Marker type filtering is based on supported heading levels for the current platform; Xiaohongshu Diandian includes H4, while other existing platforms keep their prior H1-H3 or H1-H2 limits.
- Unordered list marker filtering is a separate per-platform boolean and must not affect the heading level filters.
- Marker type filtering must keep at least one enabled level for the current platform.
- If filtering leaves zero visible markers, keep the navigation controls visible so users can reopen settings and re-enable marker types.
- If the active marker is fully outside the browser viewport, show one clickable floating active marker 20pt above the bottom of the visible marker list.
- Clicking the floating active marker must return the marker list to the selected marker and jump the page anchor to the selected heading.
- Floating active marker clicks must start page anchor scrolling before scrolling or focusing the marker list.
- Marker and floating marker clicks may briefly re-apply active marker list scrolling while the host page settles, but must not permanently override manual marker-list scrolling.
- Marker list content must right-align with the collapse toggle, while any shadow buffer expands outside that content edge.
- Marker list scroll containers must leave compensated padding for marker glass shadows so shadows are not visibly clipped.
- Marker list wheel scrolling should use the right-side plugin maximum width as its hit area without enabling transparent click interception.
- Keep the settings menu layered above heading markers.
- The settings menu may use a limited transparent hover guard while open; it must not intercept page clicks when the menu is closed.

## Search Rule

- Navigation marker search and Chapter View search match only the existing marker or chapter titles.
- Fuzzy matching is Unicode-aware, case-insensitive subsequence matching after removing whitespace; it must not introduce pinyin or initials matching.
- Navigation search filters the document-order marker queue in place; clicking a matching marker must jump to the matching heading.
- Chapter View search filters the section chips in place; clicking a matching chip must switch the modal to that section without closing the overlay or jumping the underlying page.
- Command/Control+F focuses the search input for the current context; Command/Control+Shift+F continues to open Chapter View.
- Search queries are per-context, are cleared when closing Chapter View, and are cleared again on supported-route changes.
- When a navigation search filters out the active marker, the floating active marker stays hidden and restores when the query is cleared.

## Fold Rule

- When no search is active, group the visible markers by `foldThreshold` (default 20); only full groups are collapsed, and each full group becomes one stack card in document order.
- The trailing partial group stays as individual markers.
- Each stack card shows the first marker's preview title followed by the remaining count, and expands or collapses independently in place.
- Stack-card pseudo layers use only a vertical downward offset and keep enough spacing below so the next marker is not covered.
- Search results must bypass folding and show all matching markers.
- When the active marker is inside a collapsed full group, expand only that group automatically.

## Glass Theme Rule

- Global extension surfaces should use BoomBranch-like glass styling: dark mode uses near-black translucent backgrounds, subtle `white/10` borders, and soft dark shadows.
- Light mode should mirror the same hierarchy with bright translucent backgrounds, low-contrast slate borders, and soft shadows.
- Light mode should keep the earlier Polaris light glass backgrounds for marker, toggle, settings menu, inputs, and compact reset controls.
- Marker pills, floating active marker, settings trigger, collapse toggle, settings menu, inputs, options, and compact reset button should inherit from shared glass variables instead of one-off hardcoded backgrounds.
- Active markers may use a cyan/blue accent, but inactive and hover states should stay quiet and glass-like.

## Toggle Button Rule

- The collapse toggle should include the extension icon in a 32px shell, using a 96px image resource for high-density displays.
- Keep the icon decorative for assistive technology; the button label comes from the action text and `aria-expanded`.
- Keep the collapse toggle background in a pale blue, Polaris-like tone, separate from the settings trigger color.
- The collapse toggle chevron must point up while the marker list is expanded and down while it is collapsed.

## Config Storage Rule

- Persist front-end settings in `chrome.storage.sync` with `gpt-paragraph-nav-config`.
- Use one shared config for all supported sites.
- Do not show sync status in the settings menu; keep synchronization internal to configuration persistence.
- Show the loaded extension `version_name` in the settings menu as read-only version/build information.
- Keep the Polaris icon and name in the settings Header; place version/build text and the update-notes entry on the left of the fixed Footer and feedback actions on the right.
- Update notices must place the heart-shaped support action as the leftmost feedback action, use the same red heart treatment as settings, and open the support page in a new tab.
- When sync config is empty, migrate valid legacy `localStorage` config without deleting the legacy value.
- The compact settings reset button hover/focus state must remain visible on light menus and may reuse the marker hover pale blue; place the full-width rating card directly below the supported-platform description, before the settings items. Stack its prompt above a prominent full-width black Rate Now action. Do not use a default black outline on card hover, and align the action width with the upper card content including its dismiss button. The card uses a separate pale-yellow surface, opens the Chrome Web Store in a new tab, and has a dismiss button that hides it locally for 24 hours.

## Version And Build Rule

- Build number uses plain integers from `1` to `999`, sorted by numeric order.
- Every code or documentation modification must record a new build.
- Bug fix updates the last version segment, feature update updates the middle segment, and major update updates the first segment.
- Ask the user to declare the update type before changing the version.
- After each build is recorded, confirm the build number and version with the user.
- Every feature update must add a localized `x.y.0` entry in `src/release-notes.js`; patch updates remain in release records without a separate in-product notice.
