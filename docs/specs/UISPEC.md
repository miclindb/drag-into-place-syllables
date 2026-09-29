# UISPEC: Syllables Drag Into Place

This spec builds on the [DEVSPEC](DEVSPEC.md); for behavior and timings, DEVSPEC wins. It describes what the child sees, hears and does.

## Screen

From top to bottom:

1. **Top bar.** Title; "Word N of M"; score (⭐ correct, ✖ mistakes); the "🎯 Moving tiles: On/Off" toggle.
2. **Picture.** A round, yellow-framed picture of the word (currently an emoji).
3. **Answer area.** One dashed square slot ("?") per syllable, centered.
4. **Hint area.** Hidden per slot until that slot's hint is revealed. A revealed hint shows the picture icon and the syllable.
5. **Tray.** The syllable and foil tiles.
6. **Feedback line.** A status message (green when good, red when not). It is announced to screen readers.
7. **After completion.** "🔊 Hear word" and "Next word" buttons.

## Tiles

- Tiles are rounded, colored buttons showing the syllable in upper case. Their colors rotate through orange, red and blue.
- **Static mode.** Tiles sit at random, non-overlapping spots inside the tray, and a new layout is made for each word.
- **Moving mode.** Tiles drift left to right in their own lanes and loop. Tapping a tile stops it where it is; a stopped tile can then be dragged or tap-placed.
- **Locked tiles.** A correctly placed tile stays at its home spot, faded to 45% and not interactive.

## Interactions

| Child does | Result |
|---|---|
| Drags a tile | The tile follows the finger, tilted and slightly enlarged, and can't leave the screen |
| Drops it on nothing | The tile returns to its home spot. A tile that already bounced stays where it was dropped |
| Drops it on the correct slot | The slot pops green and shows the syllable; the syllable sound plays |
| Drops it on the wrong slot | Bad tone; the tile bounces in an arc to a random free spot on screen |
| Drops a foil on a slot | Bad tone; the foil spins and fades away; that slot's hint appears |
| Taps a tile, then taps a slot | The same result as dropping it there. The selected tile gets a yellow outline |
| Taps a filled slot | "That space is already filled." |
| Fills every slot | The card shakes gently, confetti rises, the word is spoken, and the buttons appear |
| Waits after completion | The next word loads automatically (DEVSPEC §4) |

## Messages

| Moment | Text |
|---|---|
| Correct | "Great job!" |
| Wrong slot | "That syllable goes somewhere else. Try again!" |
| Foil | "Not quite. Try a different syllable." |
| Tile selected | "Selected BA. Choose a space for it." |
| Slot tapped with nothing selected | "Tap a syllable first, then tap a space for it." |
| Word complete | "You spelled banana!" |
| Load failure | "The game could not load its levels." |

## Motion and accessibility

- With `prefers-reduced-motion`, there is no drift, bounce arc, card shake or confetti. Tiles jump straight to their new spots.
- All tiles and slots are native `<button>`s with descriptive `aria-label`s. Tiles use `aria-pressed` to show whether they are selected.
- Feedback uses `role="status"` with `aria-live="polite"`. It is re-announced even when the same message repeats.
- On narrow screens (540 px wide or less), the top bar stacks and tiles and slots shrink to 54 px.
