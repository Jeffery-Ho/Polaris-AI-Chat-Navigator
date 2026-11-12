# Long conversation mode

## Scope

Use only the website's own DOM and the current page's in-memory index. In long conversation mode, earlier messages may be mounted only through the website's own list mechanics beneath a mask, restoring the reader's position. Do not add private API calls, authentication access, request interception or imports.

## Current implementation

- [x] Read retained message content from an explicit action when its original DOM is unmounted; preserve TOC search and return position.
- [x] Batch page mutations and reparse only affected message bodies; reuse unchanged index records.
- [x] Replace the always-visible re-read action with a scoped, confirmed clear-and-rebuild action. Keep retry for failed reads only.
- [x] Verify initial progress, subsequent non-blocking updates, route changes, reset cancellation, both themes, narrow sidepanels and packaged passive behavior.
- [x] Publish readable batches during initial long-mode indexing; align only the Maker sidebar once, preserving later reading positions and keeping the website conversation stationary.

Validated in 1.3.0(422), 2026-11-12: syntax checks, Chrome and Firefox production builds, and 709 tests passed. Local browser fixtures cover Chinese/English, light/dark, 320px/400px, retained reading, real scroll restoration and confirmed resets. A 500-message / 10-update DOM-index simulation reduced normalized messages from 5,000 to 10 (680ms to 66ms in this local run); this is not a whole-website performance measurement. Installed-extension host acceptance remains unverified.

- [x] Backfill unmounted messages beneath a mask in long conversation mode, with explicit consent, shared-chat exclusion, hidden-page pause, stop, timeout and resume (1.5.0(426)).

## Follow-up

- [ ] Installed-extension acceptance for 1.5.0(426) on the user's own ChatGPT and Gemini chats (not share pages): consent prompt, masked backfill hides scrolling, restores position, and Makers grow with unmounted content.

- [ ] Finish installed-extension acceptance for 1.4.0(425): progressive Maker rendering, one-time sidebar alignment and a stationary website conversation. All 718 tests pass; WORK was enabled by the user, but browser state fences and native tool timeouts prevented confirming the reload from 1.3.2(424).
- [ ] Navigate between individual search occurrences and add search scope filters.
- [ ] Preserve paragraph anchors across reader resizing and content updates.
- [ ] Expose mounted versus retained availability in the list without repeated failed jumps.
- [ ] Measure website-side CSS rendering containment separately before considering an optional optimization.
