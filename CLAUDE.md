# CLAUDE.md - Polaris: AI Chat Navigator

Chrome MV3 extension (Chrome 114+, Side Panel API) that turns headings, list titles, bold text and tables in AI chat answers into a sidepanel outline of jumpable Makers. Plain JavaScript, WXT 0.21.4 + Vite, pnpm, Node 22+.

## Commands

```bash
pnpm install   # install deps, build dist/, enable .githooks
pnpm dev       # WXT dev Chromium with auto reload (.output/chrome-mv3-dev/)
pnpm build     # production package into dist/
pnpm check     # node --check on every script in src/, public/src/, scripts/, entrypoints/
pnpm test      # node --test (jsdom); package tests read dist/, so build first
```

## Layout

- `entrypoints/`: thin WXT shells (`background.js`, `content.js`, `sidepanel/`) that call initializers in `src/`.
- `src/content.js`: content script; per-platform DOM detection and Maker extraction.
- `src/window.js` / `src/window.css`: sidepanel UI (Navigation, Chapters, Settings), exported as `initializeSidepanel()`.
- `src/background.js`: service worker; tracks the source tab, injects scripts, relays snapshots and commands.
- `src/*-messages.js`, `src/marker-*.js`, `src/sidepanel-chapter-*.js`: extracted single-purpose modules.
- `src/i18n.js`: en/zh strings via `createI18n()`. `src/release-notes.js`: in-panel What's New entries.
- `src/supported-sites.js`: `SUPPORTED_MATCHES`, the only list of supported sites (content matches, host permissions, resource matches).
- `public/`: static files copied as-is (`icons/`, `src/route-bridge.js`); extension URLs stay unchanged.
- `manifest.build.json`: product metadata, permissions, web-accessible resources, version. WXT generates entrypoint paths.
- `test/`: one `*.test.js` per module or platform.

## Rules

1. Never edit `dist/` or `.output/`; never add a root `manifest.json`.
2. Platform detection and heading-level limits follow `guideline.md`; keep per-platform limits unless asked.
3. Makers come only from currently mounted DOM; exclude user input editors (`textarea`, `contenteditable`, ProseMirror).
4. Adding a site: edit `SUPPORTED_MATCHES` only; never add site lists to `manifest.build.json`.
5. User-facing strings need both `en` and `zh`.
6. New features and fixes include tests.
7. KISS: minimal interpretation of the request; ask before adding scope.

## Versioning and records

Every change records a build:

- Bump `version` and `version_name` (`x.y.z(build)`) in `manifest.build.json`; build number increments by 1.
- Fix bumps patch, feature bumps minor, major bumps major. Confirm the bump type with the user.
- Add an entry at the top of `builds.md` (English) and `changelog.md` (Chinese).
- User-visible features also get a `src/release-notes.js` entry.

## Verification

Run `pnpm check`, `pnpm build`, then `pnpm test` before declaring done. For UI/CSS changes, check light and dark themes.

## Git

English commit messages, PR titles and descriptions. Imperative summary, e.g. `Add DeepSeek DOM navigation support`.
