# PRD: Syllables Drag Into Place

## Product

An offline literacy game for young children. The child sees a picture, hears sounds and builds the pictured word by dragging its **syllables** into order (for example BA + NA + NA → "banana").

It adapts Curious Learning's "Drag Into Place" workshop brief (Ben Burrage, v1, April 2017), which spells words from single **letters**. This game uses syllables as the unit, but the content loader still accepts the brief's letter schema, so a letter-based level set runs unchanged.

## Users and context

- Children who are early readers. They may be pre-literate, so sound and pictures carry the instructions.
- The game runs inside the Curious Reader container: an Android/iOS WebView that loads it from `file://` **with no network connection**.

## Principles

1. **Offline first.** Everything ships in the package; no network requests, ever.
2. **Sound, not spelling drills.** Each correct syllable is spoken as it sounds *in that word*.
3. **Gentle feedback.** Mistakes bounce or fade away, with a hint; nothing punishes the child.
4. **Any screen.** The layout works on an unknown screen size, and pieces never leave the screen.
5. **Accessible.** Every drag action has a tap alternative, and feedback is announced to screen readers.

## Scope (from the brief)

| Tier | Included |
|---|---|
| MVP | Picture, answer spots, random tile placement, drag and drop, correct/incorrect feedback, word completion, next word, JSON levels |
| Better | Foils from JSON, hint area, foil feedback (fade out plus hint) |
| Great | Optional "moving tiles" mode: tiles drift left to right; tap to stop, then drag |

## Non-goals

- Multiple languages in the UI. Only English content ships, but content, storage and events are organized per language pack, so a new language needs content only (no code change).
- User accounts, servers or analytics SDKs. Reporting goes only through the container's `cr_event` bridge.
- A content-authoring pipeline. Each `lang/<code>/levels.json` is edited by hand and checked by `npm run check:content`. Delivery goes through the Curious Reader CMS as ZIP packages (DEVSPEC §10).

## Known gaps against the brief

- The picture is an emoji, not an image file. The hint is text, not a sprite.
- The wrong-answer sound is synthesized, not an audio file.
- In moving mode, tiles loop continuously and start partway across the screen.
