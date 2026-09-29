import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLevel } from "../src/game/content.js";
import { buildTiles, createInitialState, createStore, judgeDrop, orderLevels, OUTCOME, PHASE, reduce, shuffle } from "../src/game/rules.js";
import { bananaLevel, seededRandom } from "./helpers.js";

const banana = normalizeLevel(bananaLevel);
const rainbow = normalizeLevel({ level_id: 7, target_word: "rainbow", syllables: ["rain", "bow"], syllable_foils: ["train"] });

function loaded(overrides = {}) {
  return reduce(createInitialState(overrides), { type: "levels_loaded", levels: [banana, rainbow], levelIndex: 0 });
}

test("levels_loaded starts the first level with empty slots", () => {
  const state = loaded();
  assert.equal(state.phase, PHASE.playing);
  assert.deepEqual(state.placed, [null, null, null]);
});

test("judgeDrop covers correct, wrong slot, foil and filled slot", () => {
  assert.equal(judgeDrop(banana, [null, null, null], { syllable: "ba", isFoil: false }, 0), OUTCOME.correct);
  assert.equal(judgeDrop(banana, [null, null, null], { syllable: "ba", isFoil: false }, 1), OUTCOME.wrongSlot);
  assert.equal(judgeDrop(banana, [null, null, null], { syllable: "be", isFoil: true }, 0), OUTCOME.foil);
  assert.equal(judgeDrop(banana, ["ba", null, null], { syllable: "ba", isFoil: false }, 0), OUTCOME.slotFilled);
});

test("a repeated syllable fits either of its matching slots", () => {
  assert.equal(judgeDrop(banana, ["ba", null, null], { syllable: "na", isFoil: false }, 1), OUTCOME.correct);
  assert.equal(judgeDrop(banana, ["ba", null, null], { syllable: "na", isFoil: false }, 2), OUTCOME.correct);
});

test("correct drops fill slots, score, and complete the level", () => {
  let state = loaded();
  state = reduce(state, { type: "drop", slotIndex: 0, syllable: "ba", isFoil: false });
  state = reduce(state, { type: "drop", slotIndex: 2, syllable: "na", isFoil: false });
  assert.equal(state.phase, PHASE.playing);
  state = reduce(state, { type: "drop", slotIndex: 1, syllable: "na", isFoil: false });
  assert.equal(state.phase, PHASE.complete);
  assert.deepEqual(state.placed, ["ba", "na", "na"]);
  assert.equal(state.score.correct, 3);
  assert.deepEqual(state.lastOutcome, { kind: OUTCOME.correct, slotIndex: 1, syllable: "na", levelComplete: true });
});

test("wrong drops and foils count as mistakes without filling slots", () => {
  let state = loaded({ score: { correct: 5, mistakes: 1 } });
  state = reduce(state, { type: "drop", slotIndex: 0, syllable: "na", isFoil: false });
  assert.equal(state.lastOutcome.kind, OUTCOME.wrongSlot);
  state = reduce(state, { type: "drop", slotIndex: 0, syllable: "be", isFoil: true });
  assert.equal(state.lastOutcome.kind, OUTCOME.foil);
  assert.deepEqual(state.placed, [null, null, null]);
  assert.deepEqual(state.score, { correct: 5, mistakes: 3 });
  assert.equal(state.levelMistakes, 2);
  assert.deepEqual(state.levelMistakesByKind, { foil: 1, wrong_slot: 1 });
});

test("dropping onto a filled slot changes nothing but the outcome", () => {
  let state = loaded();
  state = reduce(state, { type: "drop", slotIndex: 0, syllable: "ba", isFoil: false });
  const next = reduce(state, { type: "drop", slotIndex: 0, syllable: "na", isFoil: false });
  assert.equal(next.lastOutcome.kind, OUTCOME.slotFilled);
  assert.deepEqual(next.score, state.score);
});

test("drops are ignored once the word is complete", () => {
  let state = loaded();
  ["ba", "na", "na"].forEach((syllable, slotIndex) => {
    state = reduce(state, { type: "drop", slotIndex, syllable, isFoil: false });
  });
  assert.equal(reduce(state, { type: "drop", slotIndex: 0, syllable: "be", isFoil: true }), state);
});

test("next_level advances and wraps; set_moving restarts the current word", () => {
  let state = loaded();
  state = reduce(state, { type: "drop", slotIndex: 0, syllable: "ba", isFoil: false });
  state = reduce(state, { type: "set_moving", enabled: true });
  assert.equal(state.movingEnabled, true);
  assert.deepEqual(state.placed, [null, null, null]);
  state = reduce(state, { type: "next_level" });
  assert.equal(state.levelIndex, 1);
  assert.deepEqual(state.placed, [null, null]);
  state = reduce(state, { type: "next_level" });
  assert.equal(state.levelIndex, 0);
});

test("reduce never mutates the previous state", () => {
  const state = Object.freeze(loaded());
  Object.freeze(state.placed);
  Object.freeze(state.score);
  assert.doesNotThrow(() => reduce(state, { type: "drop", slotIndex: 0, syllable: "ba", isFoil: false }));
});

test("createStore applies actions", () => {
  const store = createStore(createInitialState());
  store.dispatch({ type: "levels_loaded", levels: [banana] });
  assert.equal(store.getState().phase, PHASE.playing);
  store.dispatch({ type: "load_failed" });
  assert.equal(store.getState().phase, PHASE.error);
});

test("orderLevels restores a matching saved order and clamps the index", () => {
  const restored = orderLevels([banana, rainbow], { order: [7, 1], levelIndex: 9 });
  assert.equal(restored.restored, true);
  assert.deepEqual(restored.levels.map((level) => level.level_id), [7, 1]);
  assert.equal(restored.levelIndex, 1);
});

test("orderLevels reshuffles when the saved ids no longer match", () => {
  for (const saved of [null, { order: [1] }, { order: [1, 99] }, { order: [1, 1] }]) {
    const result = orderLevels([banana, rainbow], saved, seededRandom(3));
    assert.equal(result.restored, false);
    assert.equal(result.levelIndex, 0);
    assert.deepEqual(result.levels.map((level) => level.level_id).sort(), [1, 7]);
  }
});

test("buildTiles includes every syllable and foil exactly once", () => {
  const tiles = buildTiles(banana, seededRandom(5));
  assert.equal(tiles.length, 5);
  assert.deepEqual(tiles.map((tile) => tile.index).sort(), [0, 1, 2, 3, 4]);
  assert.deepEqual(tiles.filter((tile) => tile.isFoil).map((tile) => tile.syllable).sort(), ["be", "no"]);
});

test("shuffle returns a permutation without mutating its input", () => {
  const input = [1, 2, 3, 4, 5];
  const output = shuffle(input, seededRandom(9));
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.deepEqual([...output].sort(), input);
});
