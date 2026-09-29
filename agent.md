# Agent Guidelines - Syllables Drag Into Place

You are an autonomous AI software developer working on a Curious Reader third-party game. Start with [README.md](README.md); it maps every other document.

## Core Rules & Constraints
1. **Spec-Driven**: Read and follow all specs in `docs/specs/` (PRD, DEVSPEC, UISPEC, TESTSPEC) before generating code. DEVSPEC wins over any summary, including this file. When behavior changes, update the spec chain in order.
2. **Offline WebView Compliance**:
   - MUST work completely offline from a `file://` WebView.
   - All asset paths MUST be relative (`./assets/...`).
   - DO NOT make any external network/HTTP requests.
   - Load JSON and binaries only via XHR (`loadJSON` in `src/game/content.js`, `loadBinary` in `src/game/audio.js`). Never use the Fetch API or media elements; `npm run check:offline` fails the build on them.
3. **Container Events (`cr_event`)**:
   - Report through `emit()`/`emitSummary()` in `src/game/events.js`. That module posts the envelope to `window.ReactNativeWebView.postMessage` and mirrors it as a window `cr_event` CustomEvent. Its absence outside the container is not a bug.
   - The finest event granularity is one word: never emit per drop, per tap or per frame.
4. **Launch Parameters**:
   - Parse `cr_lang`, `cr_book`, and `cr_user_id` from URL query parameters (`src/game/launch.js`). Language codes are Curious Learning catalog codes (`english`), not ISO codes.
5. **Packaging**: The container requirements are in `third-party-game-spec.md`. `npm run package` builds the Layout A ZIPs (DEVSPEC §10). Never reserve slugs, upload or promote on the CMS without explicit human approval; see `docs/RELEASE.md`.

## Architecture notes that are easy to get wrong
- Game state changes only in `reduce()` (`src/game/rules.js`). Side effects (audio, storage, DOM, events) belong in the controller (`src/main.js`), never in the reducer.
- Keep `src/game/` free of DOM access (except the I/O adapters) so it stays unit-testable in Node.
- `lang/<code>/levels.json` is the single source of truth for each language. Do not embed copies of it elsewhere. Audio for a pack lives only under `lang/<code>/audios/`, and `lang/` never ships in the engine ZIP.
- Syllables are spoken as they sound *in the word*. Use `syllable_audio_overrides` when a position changes the sound.

## Before claiming done
Run `npm run check` (content + offline + unit tests). For UI changes, also follow the manual checklist in `docs/specs/TESTSPEC.md`. Before a release, run `npm run package` and the TESTSPEC offline `file://` check.
