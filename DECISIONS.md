# Architecture decisions

This log records why the code is shaped the way it is. The behavior itself is specified in [docs/specs/DEVSPEC.md](docs/specs/DEVSPEC.md).

## Structure adopted from Word Smash (September 2026)

The project was restructured after [Word Smash](https://github.com/tinsleygalyean/word-smash), another Curious Reader game with the same offline constraints. Only the structures that fit a small, framework-free game were adopted.

| Adopted | Why |
|---|---|
| **Separate modules for logic, I/O and UI** (`src/game/*`, `src/ui/*`, controller in `src/main.js`) | The old single 900-line `app.js` mixed rules, DOM work and I/O, so nothing could be tested in isolation |
| **One pure reducer for game state; side effects only in the controller** | Rules can be unit-tested without a browser, and every state change is in one place |
| **XHR for JSON and audio; Web Audio instead of media elements** | Media elements and the Fetch API fail on the container's `file://` WebView, while XHR returns status 0 and works. The old code quietly fell back to speech synthesis there |
| **`cr_event` over `window.ReactNativeWebView.postMessage` with the full envelope** | A window CustomEvent never reaches the React Native container. The CustomEvent is kept only as a development mirror |
| **One source of truth for content, plus a validator** | The copy of `levels.json` embedded in `index.html` had drifted (it was missing the audio overrides). It was removed, and `npm run check:content` enforces the rules |
| **Language-scoped storage keys** | `cr_lang` is already a launch parameter; scoping now avoids a migration later. The old keys are still read |
| **Offline check with a self-test canary** | This makes "no network, no media elements" a failing check, not a guideline |
| **Spec chain `docs/specs/` (PRD → DEVSPEC → UISPEC → TESTSPEC)** | agent.md already required these specs, but they didn't exist |

| Not adopted | Why |
|---|---|
| React, TypeScript, Vite, a pnpm monorepo | Too heavy for about 1,000 lines of vanilla JS. Plain ES modules need no build and can be served as they are |
| A Google Sheets content pipeline | Only English content ships. A hand-edited `levels.json` per pack plus a validator is enough |
| A fixed 1200×540 reference canvas | The brief requires a screen "of an unknown size". Layout is measured at runtime |
| Self-hosted WOFF2 fonts | The CSS uses system font stacks only; no web font is loaded |

## No bundler: native ES modules

`index.html` loads `./src/main.js` as `type="module"`. The Curious Reader WebView allows file access (Word Smash also ships module scripts and XHR to it). Desktop browsers block both on `file://` unless Chrome is started with `--allow-file-access-from-files` (TESTSPEC's offline check), so use `npm start` (http) for everyday development.

## Curious Reader third-party game spec (v1.8, September 2026)

The game was brought in line with the container team's handoff spec (`third-party-game-spec.md`).

| Change | Why |
|---|---|
| **Layout A (engine + lang ZIPs), no core tier** | Nothing is shared across languages: the pictures are emoji in `levels.json` and every clip is language-specific. The spec reserves the core (`-book-`) tier for content reused across languages |
| **Content moved to `lang/english/` (`levels.json`, `audios/`)** | The engine ZIP must not contain `lang/`, and the container's tooling expects per-language audio under `lang/<code>/audios/`. Audio must stay inside its own pack so each lang ZIP is self-contained |
| **`cr_lang` codes follow the catalog (`english`, not `en`)** | The container sends catalog codes. English progress saved under `dip_en_*` is still read |
| **No per-drop events** | The spec forbids per-tap events ("per-puzzle granularity is the floor"). `answer_correct`/`answer_incorrect` were dropped; `level_complete` now carries `foil_mistakes` and `wrong_slot_mistakes` |
| **Own store-only ZIP writer instead of a zip dependency or the `zip` CLI** | Keeps the project dependency-free and portable. Store-only is what the spec recommends, and fixed timestamps make archives reproducible |
| **Audio is decoded only after the first gesture** | Creating the AudioContext before a gesture logs autoplay warnings; the spec's offline test requires a clean console. Preloading still fetches the bytes up front, via `Promise.allSettled` |
| **Speech-synthesis fallback kept, instead of the spec's silent buffer (deliberate deviation from §2.3)** | The spec's goal is that a missing or undecodable clip never crashes playback, and the fallback meets it: it runs no network code and always reports "ended" so sequencing continues. Hearing the syllable spoken helps a pre-literate child more than silence. The voice is en-US, so revisit this before shipping a non-English pack |
| **Engine slug `syllables-drag-into-place`** | Readable and matches `sub_app_id`. The slug is permanent once reserved, so confirm it with Curious Learning first (see [docs/RELEASE.md](docs/RELEASE.md)) |

## Tests use `node:test`

Built into Node ≥ 20, with no dependencies to install or audit. Only the pure modules and the Node-side scripts are unit-tested. DOM behavior is covered by the manual checklist in TESTSPEC.

## `sub_app_id = syllables_drag_into_place`

It must stay stable across releases, because changing it orphans data already collected. Confirm it with the container team before the first upload.

## Earlier decisions carried over

- **Bounce commits its final position immediately.** A late animation `finish` callback used to move a tile that had already been grabbed or placed.
- **The drop target is resolved while the tile still has `pointer-events: none`.** Otherwise a bounced tile hit-tests itself.
- **Drag watchdog and `lostpointercapture`.** Interrupted gestures can skip `pointerup` and `pointercancel`, which left tiles stuck in the dragging state.
- **Per-slot syllable audio overrides.** The same spelling can sound different by position (banana's last "na", tomato's last "to").
