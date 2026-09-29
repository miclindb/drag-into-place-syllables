# Syllables Drag Into Place

An offline literacy game for Curious Learning's Curious Reader container. The child sees a picture and drags syllable tiles into the answer slots to build the word (BA + NA + NA → banana), hearing each syllable as it lands. It runs from a local `file://` WebView with no network connection.

## Quick start

```bash
npm start        # http://localhost:8765/ (no install step; Node ≥ 20)
npm run check    # content + offline + unit tests; run before calling a change done
npm run package  # check, then build the Curious Reader ZIPs into dist/
```

## Where to go next

| Document | Answers |
|---|---|
| [docs/specs/](docs/specs/README.md) | What must the game do? PRD → **DEVSPEC** (authoritative) → UISPEC → TESTSPEC |
| [DECISIONS.md](DECISIONS.md) | Why is the code built this way? |
| [docs/RELEASE.md](docs/RELEASE.md) | How do I package, verify and upload a release to the Curious Reader CMS? |
| [third-party-game-spec.md](third-party-game-spec.md) | The container team's requirements for every Curious Reader game |
| [agent.md](agent.md) | Standing rules for AI agents working here |

## Repository layout

```
index.html, styles.css    Page shell and styles
lang/<code>/              One language pack per catalog code (only english ships):
  levels.json             level content, the single source of truth for that language
  audios/                 word clips, plus audios/syllables/ for syllable clips
icons/<code>.png          Tile icon per language (512×512 true PNG), uploaded beside the lang ZIP
src/main.js               Controller: store + side effects
src/game/                 Pure logic (rules, content, layout, launch) and I/O adapters (audio, events, storage)
src/ui/                   DOM rendering, tray layout, input, animations
scripts/                  serve, validate-content, check-offline, package (+ lib/zip.mjs)
test/                     node:test suites
docs/specs/               Living specs
```

## Commands

| Command | Does |
|---|---|
| `npm start` | Serve the game locally (optional port argument: `npm start -- 9000`) |
| `npm run check:content` | Validate every `lang/<code>/levels.json` and check that every referenced audio file exists in its pack |
| `npm run check:offline` | Fail on network loads, media elements or absolute paths in shipped files |
| `npm test` | Unit tests |
| `npm run check` | All of the above |
| `npm run package` | `check`, then write `dist/` (engine ZIP, lang ZIPs, icons, upload manifest) and the merged `build/` tree |

## Adding or changing a word

1. Edit `lang/english/levels.json` (schema in [DEVSPEC §2](docs/specs/DEVSPEC.md#2-content-langcodelevelsjson)).
2. Add `lang/english/audios/<word>.wav` and any missing `lang/english/audios/syllables/<syllable>.wav` files.
3. If a syllable sounds different in one position, add a `syllable_audio_overrides` entry.
4. Run `npm run check`.

## Adding a language

1. Confirm the code exists in the Curious Learning language catalog (for example `isixhosa`); uploads with unknown codes are rejected.
2. Create `lang/<code>/levels.json` with audio paths under `lang/<code>/audios/`, and add the clips.
3. Add a square tile icon `icons/<code>.png` (true PNG, 512×512).
4. Run `npm run package`.
