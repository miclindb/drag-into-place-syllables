# TESTSPEC: Syllables Drag Into Place

This spec builds on the [DEVSPEC](DEVSPEC.md) and [UISPEC](UISPEC.md) and describes how their requirements are verified.

## Gates

Run `npm run check` before calling any change done. It runs:

| Gate | Command | Fails when |
|---|---|---|
| Content | `npm run check:content` | A `lang/<code>/levels.json` breaks a DEVSPEC §2 rule, or a referenced audio file is missing from its pack |
| Offline | `npm run check:offline` | A shipped file contains a DEVSPEC §9 pattern, or a pattern's self-test fixture doesn't match |
| Unit | `npm test` | Any `node:test` case in `test/` fails |
| Package | `npm run package` | Any gate above fails, or a DEVSPEC §10 packaging rule fails (nothing is written then) |

No dependencies are needed: everything runs on Node ≥ 20.

## Automated coverage

| Test file | Covers |
|---|---|
| `test/content.test.js` | Every shipped language pack is valid; pack paths; the letters/foils schema is accepted; spelling mismatches, non-Roman text, foil-equals-syllable, bad audio paths, audio outside the pack, duplicate ids and a non-array file are rejected; per-slot audio overrides and per-language syllable clips (DEVSPEC §2) |
| `test/rules.test.js` | All four drop outcomes; repeated syllables; scoring and mistakes by kind; level completion; drops ignored after completion; next/wrap; mode switch restarts; the reducer is pure; level-order restore and reshuffle; tile building; shuffling (§1, §3) |
| `test/layout.test.js` | Scatter stays in bounds without overlaps at 268–1100 px widths across 25 seeds; grid fallback; bounce targets avoid keep-out areas; drag clamping (§8) |
| `test/events.test.js` | Envelope fields; the window mirror; summary deltas and options; fresh ids; oversize messages dropped; no-op and never throws outside the container; `english` default (§6) |
| `test/storage.test.js` | Language-scoped round trips; legacy-key and `en`-code migration; new keys win; corrupt or throwing storage; launch parameters and `cr_lang` sanitizing (§7) |
| `test/offline.test.js` | Pattern fixtures; the shipped files are clean; violations are reported with file and line (§9) |
| `test/package.test.js` | ZIP writer (CRC, round trip, reproducible, unsafe names, `unzip -t`); true-format and icon checks; the repository passes every packaging check; engine/lang ZIP contents, clean merge, packed audio, icons and upload manifest; a failing check writes nothing (§10) |

## Manual checks (browser, `npm start`)

Run these after UI, audio or input changes. Use both a desktop viewport and a width of about 340 px.

1. **Scatter.** Tiles are at random spots with no overlaps, all inside the tray. Resizing the width re-scatters them.
2. **Foil.** Dropping a foil on slot N fades it out and reveals hint N.
3. **Wrong slot.** The tile bounces to an on-screen spot that doesn't cover the controls. Grabbing it mid-bounce and placing it correctly returns it to its home spot.
4. **Correct.** The slot fills and the syllable clip plays (banana's last "na" uses the unstressed clip).
5. **Completion.** The last syllable finishes, then the word plays, the celebration runs and the buttons appear. The game auto-advances.
6. **Tap path.** Tapping a tile and then a slot places it. Tapping a filled slot shows the "already filled" message.
7. **Moving mode.** Tiles drift; tapping one stops it; it can then be placed. Switching back to static mode re-scatters the tiles.
8. **Bridge.** With a stub `window.ReactNativeWebView.postMessage` and `?cr_user_id=…`, the messages carry the DEVSPEC §6 envelope, and no message is sent per drop: one word gives `level_complete` plus `summary_data`.
9. **Recorded audio.** Clips play through Web Audio, not speech synthesis. To check, spy on `speechSynthesis.speak`: it should not be called while the clips exist.
10. **Reduced motion.** With reduced motion emulated, tiles don't drift or animate.

## Offline `file://` check (before every upload)

This is the container spec's self-verification test (§7b, §7c), run on the packaged output:

1. `npm run package`, then extract the engine ZIP and one lang ZIP into an empty folder (`unzip -n` must not report any overwrite). `build/` holds the same tree.
2. Start Chrome with `--allow-file-access-from-files`. Like the container WebView, this lets module scripts and XHR load from `file://`; without it desktop Chrome blocks both.
3. Set DevTools Network to **Offline** and open `file:///…/index.html?cr_lang=english&cr_user_id=test`.
4. Check: the first word appears within 10 seconds; recorded clips play (not speech synthesis); progress survives a reload; the Network tab shows no request other than `file:`; the console shows no errors; without a bridge stub, nothing is posted.
5. `file dist/*.png` reports `PNG image data`.

## Device check (human)

Run the game in the Curious Reader container from `file://`: all audio plays, progress survives an app restart, events reach the container, and the diagnostic log shows zero `NETGUARD_BLOCK` entries. Done with the Curious Learning team once the content is uploaded to the development channel.
