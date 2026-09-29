# DEVSPEC: Syllables Drag Into Place

This is the authoritative behavior spec. It builds on the [PRD](PRD.md) and sits above the [UISPEC](UISPEC.md) and [TESTSPEC](TESTSPEC.md).

## 1. Architecture

Plain ES modules with no framework and no build step. `index.html` loads `src/main.js`.

| Layer | Modules | Rule |
|---|---|---|
| Pure game logic | `src/game/rules.js`, `content.js` (except `loadJSON`), `layout.js`, `launch.js` | No DOM, no I/O; unit-tested in Node |
| I/O adapters | `src/game/audio.js`, `events.js`, `storage.js`, `content.js#loadJSON` | The only code that touches Web Audio, the bridge, localStorage or XHR |
| UI | `src/ui/dom.js`, `board.js`, `tray.js`, `input.js`, `effects.js` | DOM rendering, animation and input only; no game rules |
| Controller | `src/main.js` | Dispatches actions to the store, then performs side effects |

**State.** All game state is one object changed only by `reduce(state, action)` in `rules.js`, held by `createStore()`. Side effects (audio, storage, DOM, `cr_event`) run in the controller *after* dispatching, never inside the reducer. Transient UI state (the active drag, the selected tile, tray measurements) stays in the UI modules.

State fields: `phase` (`loading | playing | complete | error`), `levels`, `levelIndex`, `placed[]` (one syllable or `null` per slot), `score {correct, mistakes}`, `levelMistakes`, `levelMistakesByKind {foil, wrong_slot}`, `movingEnabled`, `lastOutcome`.

Actions:

| Action | Effect |
|---|---|
| `levels_loaded {levels, levelIndex}` | Start that level with empty slots |
| `load_failed` | `phase = error` |
| `drop {slotIndex, syllable, isFoil}` | Judge the drop (§3). Ignored unless `phase = playing` |
| `next_level` | Next level, wrapping to the first |
| `set_moving {enabled}` | Switch modes and restart the current word |

## 2. Content (`lang/<code>/levels.json`)

Content ships as one **language pack** per Curious Learning catalog language code (`english`, `isixhosa`, …):

```
lang/<code>/levels.json               the levels for that language
lang/<code>/audios/<word>.wav         word clips
lang/<code>/audios/syllables/<s>.wav  syllable clips
```

The pack for the launch language `cr_lang` (§7) is loaded at startup with XHR from `./lang/<code>/levels.json`. That file is the **single source of truth** for the language; there is no copy embedded in the HTML. Only `english` ships today.

```json
{
  "level_id": 1,
  "target_word": "banana",
  "syllables": ["ba", "na", "na"],
  "syllable_foils": ["be", "no"],
  "image": "🍌",
  "audio": "lang/english/audios/banana.wav",
  "syllable_audio_overrides": { "2": "lang/english/audios/syllables/na_unstressed.wav" }
}
```

- The brief's schema is also accepted: `letters` stands in for `syllables` and `foils` for `syllable_foils`.
- Audio paths are relative to `index.html`.
- The per-slot clip is `syllable_audio_overrides[slot]` if present, otherwise `lang/<code>/audios/syllables/<syllable>.wav`.

Validation rules (`validateLevels`). The same rules run at startup and in `npm run check:content`:

1. The file is a JSON array.
2. `level_id` is a unique integer.
3. `target_word`, every syllable and every foil contain only Roman letters `a–z` (case-insensitive).
4. The syllables joined together spell `target_word`, ignoring case.
5. No foil equals a real syllable of the same word.
6. Audio paths are relative (no leading `/`, no `scheme:`, no `..`) and inside the level's own pack, `lang/<code>/audios/`, so each pack is self-contained. Override keys are valid slot indexes.
7. *(Check script only.)* Every referenced audio file exists.

At runtime, an invalid level is skipped and reported as an `error` event (`reason: invalid_level`). If no level is valid, the game shows a load error.

## 3. Rules

`judgeDrop(level, placed, tile, slotIndex)` checks these in order:

| Outcome | When | State change |
|---|---|---|
| `slot_filled` | The slot is already filled | None |
| `foil` | The tile is a foil | `mistakes + 1` |
| `correct` | The syllable equals `level.syllables[slotIndex]` | Fill the slot, `correct + 1`; `phase = complete` when all slots are filled |
| `wrong_slot` | Anything else | `mistakes + 1` |

Repeated syllables are compared by text, so either "na" tile fits either "na" slot.

Level order: a saved order is restored only if it contains exactly the loaded `level_id`s. Otherwise the levels are shuffled and play starts at the first one.

## 4. Side effects per outcome

| Outcome | Audio | Visual | Event |
|---|---|---|---|
| `correct` | Good tone, then the slot's syllable clip | Slot fills; tile locked and returned to its home spot | — |
| `wrong_slot` | Bad tone | Tile bounces to a random free spot on screen | — |
| `foil` | Bad tone | Foil fades out; that slot's hint is revealed | — |
| Word complete | Last syllable clip ends (max 2 s), then the full-word clip | Celebration; "Hear word" and "Next word" appear | `level_complete`, then `summary_data` |

Individual drops are not reported: the container contract makes one word the finest event granularity (§6). Their counts are summarized in `level_complete`.

**Auto-advance.** 4 s after the word audio ends, or 7 s after completion if audio never reports that it ended, the next word loads. Pressing "Hear word" restarts that wait.

## 5. Audio

- Clips are loaded with XHR (`responseType: arraybuffer`; status 200, or 0 on `file://`), decoded with `decodeAudioData` and played through Web Audio. Each level's clips are preloaded with `Promise.allSettled`, so a missing clip never blocks the others. Until the first user gesture creates the audio context, preloading fetches bytes only; decoded buffers are cached.
- There are two channels, `word` and `syllable`. A new clip replaces the one on the same channel, and the replaced clip does not report "ended".
- If a clip fails to load or decode, speech synthesis (an en-US voice) is used instead.
- The audio context is resumed on the first `pointerdown` or `keydown`.

## 6. `cr_event` contract

Each message goes to `window.ReactNativeWebView.postMessage` as the JSON string `{"type":"cr_event","payload":{…}}`. Outside the container this does nothing. The same payload is also dispatched on `window` as a `cr_event` CustomEvent (with the payload as `detail`) so it can be observed during development.

The payload envelope has these fields: `payload_id` (a new UUID v4 each time), `cr_user_id`, `sub_app_id` = `syllables_drag_into_place`, `payload_version` = 1, `collection`, `timestamp` (ISO 8601), `data`, and `options` (summary_data only).

`user_sessions_data` events: `data` always includes `type`, `lang` and `book`. Each event type is sent at most once per word (per-drop or per-frame events are forbidden by the container contract); durations are always in seconds.

| `type` | Extra data |
|---|---|
| `game_start` | `level_id` |
| `level_start` | `level_id`, `target_word` |
| `level_complete` | `level_id`, `target_word`, `mistakes`, `foil_mistakes`, `wrong_slot_mistakes`, `duration_seconds` |
| `error` | `reason` (`levels_load_failed` \| `invalid_level`), `message`, `level_id?` |

`summary_data` is sent once per completed word. Its `data` is `{lang, words_completed: 1, total_time_played, last_level_id}` and its `options` are `{lang: replace, words_completed: add, total_time_played: add, last_level_id: replace}`. The `add` fields always carry the change for this word, never a running total.

Reporting never throws. A message larger than 64 KB is dropped with a console warning.

## 7. Launch parameters and storage

The query string may set `cr_lang`, `cr_book` and `cr_user_id`. The container always sends `cr_lang` (the Layout A URL template is `?cr_lang={lang}`) and appends `cr_user_id`; `cr_book` is never sent to this Layout A game but is still read and reported.

- `cr_lang` is lowercased; if it is missing or is not a safe catalog code (`[a-z0-9][a-z0-9_-]*`), the default `english` is used.
- `cr_book` and `cr_user_id` default to `""`. `cr_user_id` is opaque and is only forwarded in event envelopes.

localStorage keys (all reads and writes fail silently):

| Key | Value |
|---|---|
| `dip_<lang>_progress` | `{order: level_id[], levelIndex}` |
| `dip_<lang>_score` | `{correct, mistakes}` |
| `dip_moving` | `true`/`false` |

For `lang = english` only, when the new keys are absent, the keys from before catalog codes (`dip_en_progress`, `dip_en_score`) and then the original keys (`dragIntoPlace.progress.v1`, `.score.v1`, `.movingTiles.v1`) are still read.

## 8. Layout constants

| Constant | Value |
|---|---|
| Drag threshold | 6 px |
| Drag watchdog | 8 s |
| Scatter gap | 10 px |
| Minimum tray height (static mode) | 200 px |
| Moving-mode lane height | 68 px |
| Minimum tray height (moving mode) | 220 px |
| Tile drift time | 7–12 s per crossing |
| Bounce | 520 ms |
| Foil fade | 420 ms |

- Static tiles are scattered at random, non-overlapping spots inside the tray. If sampling fails, a wrapping grid is used. The tiles are re-scattered when the tray's width changes.
- Dragged tiles are clamped to the viewport. Bounced tiles avoid the top bar, answer area, hint area, tray and buttons.

## 9. Offline requirements (enforced by `npm run check:offline`)

The game must run from `file://` with no network. The shipped files (`index.html`, `styles.css`, `src/**/*.js`) must not contain:

- `fetch(`
- `<audio` or `new Audio(`
- `new WebSocket(`, `new EventSource(` or `sendBeacon(`
- `serviceWorker`, or Cache Storage calls (`caches.open(` and friends)
- `sourceMappingURL` comments
- CSS `@import`
- absolute `src`/`href`/`srcset`/`url(/…)` paths
- external URLs where a resource is loaded

Load JSON and binary files only through `loadJSON` or `loadBinary` (XHR).

## 10. Packaging (`npm run package`)

The game ships to the Curious Reader container as a **Layout A (2-tier)** game: one engine tier plus one lang tier per language. There is no content unit shared across languages, so there is no core (`-book-`) tier. The engine slug is `syllables-drag-into-place` (`ENGINE_SLUG` in `scripts/package.mjs`).

| Artifact (in `dist/`) | Contents |
|---|---|
| `<engine>-core.zip` | The engine: `index.html` at the root, `styles.css`, `src/`, and `assets/` if present. No `lang/` |
| `<engine>-lang-<code>.zip` | Only `lang/<code>/`: `levels.json` and `audios/` |
| `<engine>-lang-<code>.png` | The tile icon, copied from `icons/<code>.png`. Uploaded alongside the lang ZIP, never inside it |
| `upload-manifest.json` | Engine slug, layout, and the size and sha256 of every artifact |

`build/` receives the merged tree a device gets after extracting engine → lang, for the offline test.

Rules. Packaging runs every check first and writes nothing if any fails:

1. Every pack passes §2, and the engine's HTML, CSS and JS pass §9.
2. The ZIPs merge cleanly: the engine has no `lang/` entries and each lang ZIP holds only `lang/<code>/`.
3. No `.map` files ship.
4. Every `.png`, `.jpg`, `.webp`, `.wav` and `.mp3` really is the format its extension claims. Pack audio is MP3 or WAV only.
5. Each language has `icons/<code>.png`: a true PNG, square, at least 192×192 (512×512 recommended).
6. ZIPs are store-only (no compression, fastest to extract), with fixed timestamps so the same input gives byte-identical archives.
