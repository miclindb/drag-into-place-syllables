// Pure game rules. All game state lives in one object that only `reduce()`
// changes; side effects (audio, storage, DOM, cr_event) are performed by the
// controller in `src/main.js` after dispatching, never in here.

export const PHASE = Object.freeze({
  loading: "loading",
  playing: "playing",
  complete: "complete",
  error: "error",
});

export const OUTCOME = Object.freeze({
  correct: "correct",
  wrongSlot: "wrong_slot",
  foil: "foil",
  slotFilled: "slot_filled",
});

export function createInitialState({ score = { correct: 0, mistakes: 0 }, movingEnabled = false } = {}) {
  return {
    phase: PHASE.loading,
    levels: [],
    levelIndex: 0,
    placed: [],
    score: { correct: score.correct ?? 0, mistakes: score.mistakes ?? 0 },
    levelMistakes: 0,
    levelMistakesByKind: { [OUTCOME.foil]: 0, [OUTCOME.wrongSlot]: 0 },
    movingEnabled: Boolean(movingEnabled),
    lastOutcome: null,
  };
}

export function currentLevel(state) {
  return state.levels[state.levelIndex] ?? null;
}

export function judgeDrop(level, placed, { syllable, isFoil }, slotIndex) {
  if (placed[slotIndex]) return OUTCOME.slotFilled;
  if (isFoil) return OUTCOME.foil;
  return syllable === level.syllables[slotIndex] ? OUTCOME.correct : OUTCOME.wrongSlot;
}

function startLevel(state, levelIndex) {
  const level = state.levels[levelIndex];
  return {
    ...state,
    phase: PHASE.playing,
    levelIndex,
    placed: Array(level.syllables.length).fill(null),
    levelMistakes: 0,
    levelMistakesByKind: { [OUTCOME.foil]: 0, [OUTCOME.wrongSlot]: 0 },
    lastOutcome: null,
  };
}

export function reduce(state, action) {
  switch (action.type) {
    case "levels_loaded":
      return startLevel({ ...state, levels: action.levels }, action.levelIndex ?? 0);

    case "load_failed":
      return { ...state, phase: PHASE.error, lastOutcome: null };

    case "drop": {
      const level = currentLevel(state);
      if (state.phase !== PHASE.playing || !level) return state;
      const { slotIndex, syllable, isFoil } = action;
      const kind = judgeDrop(level, state.placed, { syllable, isFoil }, slotIndex);
      if (kind === OUTCOME.slotFilled) {
        return { ...state, lastOutcome: { kind, slotIndex, syllable, levelComplete: false } };
      }
      if (kind !== OUTCOME.correct) {
        return {
          ...state,
          score: { ...state.score, mistakes: state.score.mistakes + 1 },
          levelMistakes: state.levelMistakes + 1,
          levelMistakesByKind: { ...state.levelMistakesByKind, [kind]: state.levelMistakesByKind[kind] + 1 },
          lastOutcome: { kind, slotIndex, syllable, levelComplete: false },
        };
      }
      const placed = state.placed.slice();
      placed[slotIndex] = syllable;
      const levelComplete = placed.every(Boolean);
      return {
        ...state,
        phase: levelComplete ? PHASE.complete : PHASE.playing,
        placed,
        score: { ...state.score, correct: state.score.correct + 1 },
        lastOutcome: { kind, slotIndex, syllable, levelComplete },
      };
    }

    case "next_level":
      if (!state.levels.length) return state;
      return startLevel(state, (state.levelIndex + 1) % state.levels.length);

    case "set_moving": {
      const next = { ...state, movingEnabled: Boolean(action.enabled) };
      // Switching modes rebuilds the board, so the current word starts over.
      return state.levels.length ? startLevel(next, state.levelIndex) : next;
    }

    default:
      return state;
  }
}

/** Tiny store: holds the state and applies `reduce()`. */
export function createStore(initialState) {
  let state = initialState;
  return {
    getState: () => state,
    dispatch(action) {
      state = reduce(state, action);
      return state;
    },
  };
}

export function shuffle(items, random = Math.random) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

/**
 * Restores a saved level order when it still matches the loaded level ids
 * exactly; otherwise shuffles a fresh order starting at the first word.
 */
export function orderLevels(levels, saved, random = Math.random) {
  const ids = new Set(levels.map((level) => level.level_id));
  const sameIds = saved
    && Array.isArray(saved.order)
    && saved.order.length === levels.length
    && new Set(saved.order).size === saved.order.length
    && saved.order.every((id) => ids.has(id));
  if (sameIds) {
    const byId = new Map(levels.map((level) => [level.level_id, level]));
    const index = Number.isInteger(saved.levelIndex) ? saved.levelIndex : 0;
    return {
      levels: saved.order.map((id) => byId.get(id)),
      levelIndex: Math.min(Math.max(index, 0), levels.length - 1),
      restored: true,
    };
  }
  return { levels: shuffle(levels, random), levelIndex: 0, restored: false };
}

/** Tray tiles for a level: every real syllable plus every foil, shuffled. */
export function buildTiles(level, random = Math.random) {
  const tiles = [
    ...level.syllables.map((syllable, index) => ({ syllable, index, isFoil: false })),
    ...level.foils.map((syllable, offset) => ({ syllable, index: level.syllables.length + offset, isFoil: true })),
  ];
  return shuffle(tiles, random);
}
