// Controller: owns the store and performs every side effect (DOM, audio,
// storage, cr_event) in response to dispatched actions. Game rules live in
// `game/rules.js`; nothing here decides whether an answer is right.

import { levelAudioPaths, levelsPath, loadJSON, syllableAudioPath, validateLevels } from "./game/content.js";
import { buildTiles, createInitialState, createStore, currentLevel, orderLevels, OUTCOME, PHASE } from "./game/rules.js";
import { readLaunchParams } from "./game/launch.js";
import { createStorage } from "./game/storage.js";
import { emit, emitSummary, initEvents } from "./game/events.js";
import { playSyllable, playTone, playWord, preloadAudio, unlockAudio } from "./game/audio.js";
import { announce, elements } from "./ui/dom.js";
import { initInput, resetInput } from "./ui/input.js";
import { fillSlot, renderBoard, revealHint, showCompleteControls, showMovingToggle, showScore } from "./ui/board.js";
import { bounceToRandomLocation, celebrateWord, dismissFoil } from "./ui/effects.js";

// Once the word is spelled the game picks the next word on its own, after the
// word audio finishes plus a pause (or a fixed fallback if audio never ends).
const AUTO_ADVANCE_FALLBACK_MS = 7000;
const AUTO_ADVANCE_PAUSE_MS = 4000;
// Safety net if the last syllable clip never reports "ended".
const LAST_SYLLABLE_MAX_MS = 2000;

const launch = readLaunchParams(window.location.search);
const storage = createStorage(launch.lang);
const store = createStore(createInitialState({ score: storage.getScore(), movingEnabled: storage.getMoving() }));
initEvents(launch);

let sessionStarted = false;
let levelStartedAt = 0;
let autoAdvanceTimer = null;

/* ---------------- Level lifecycle ---------------- */

function renderCurrentLevel() {
  cancelAutoAdvance();
  resetInput();
  const state = store.getState();
  const level = currentLevel(state);
  renderBoard(level, {
    tiles: buildTiles(level),
    movingEnabled: state.movingEnabled,
    levelNumber: state.levelIndex + 1,
    levelCount: state.levels.length,
  });
  showScore(state.score);
  preloadAudio(levelAudioPaths(level));
  levelStartedAt = Date.now();

  if (!sessionStarted) {
    emit("game_start", { level_id: level.level_id });
    sessionStarted = true;
  }
  emit("level_start", { level_id: level.level_id, target_word: level.target_word });
}

function completeLevel() {
  const state = store.getState();
  const level = currentLevel(state);
  const durationSeconds = Math.round((Date.now() - levelStartedAt) / 1000);
  announce(`You spelled ${level.target_word}!`, "good");
  scheduleAutoAdvance();
  playWord(level, handleWordAudioEnded);
  celebrateWord();
  showCompleteControls();
  emit("level_complete", {
    level_id: level.level_id,
    target_word: level.target_word,
    mistakes: state.levelMistakes,
    foil_mistakes: state.levelMistakesByKind[OUTCOME.foil],
    wrong_slot_mistakes: state.levelMistakesByKind[OUTCOME.wrongSlot],
    duration_seconds: durationSeconds,
  });
  emitSummary({ timePlayedSeconds: durationSeconds, lastLevelId: level.level_id });
}

function cancelAutoAdvance() {
  window.clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = null;
}

function scheduleAutoAdvance() {
  cancelAutoAdvance();
  autoAdvanceTimer = window.setTimeout(goToNextLevel, AUTO_ADVANCE_FALLBACK_MS);
}

function handleWordAudioEnded() {
  if (store.getState().phase !== PHASE.complete) return;
  window.clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = window.setTimeout(goToNextLevel, AUTO_ADVANCE_PAUSE_MS);
}

function goToNextLevel() {
  cancelAutoAdvance();
  const state = store.dispatch({ type: "next_level" });
  storage.saveProgress(state.levels, state.levelIndex);
  renderCurrentLevel();
}

/* ---------------- Placement outcome ---------------- */

function handlePlace(item, slotIndex) {
  const before = store.getState();
  const state = store.dispatch({
    type: "drop",
    slotIndex,
    syllable: item.dataset.syllable,
    isFoil: item.dataset.foil === "true",
  });
  if (state === before) return; // Not accepting drops right now (e.g. word already complete).
  const level = currentLevel(state);
  const { kind, levelComplete } = state.lastOutcome;

  if (kind === OUTCOME.slotFilled) {
    announce("That space is already filled.");
    return;
  }

  storage.saveScore(state.score);
  showScore(state.score);

  if (kind === OUTCOME.foil) {
    announce("Not quite. Try a different syllable.", "bad");
    revealHint(slotIndex);
    playTone("bad");
    dismissFoil(item);
    return;
  }

  if (kind === OUTCOME.wrongSlot) {
    announce("That syllable goes somewhere else. Try again!", "bad");
    playTone("bad");
    bounceToRandomLocation(item);
    return;
  }

  fillSlot(item, slotIndex);
  announce("Great job!", "good");
  playTone("good");

  const clip = syllableAudioPath(level, slotIndex);
  if (!levelComplete) {
    playSyllable(clip, item.dataset.syllable);
    return;
  }
  // Let the last syllable finish before the full word starts, instead of the
  // two clips talking over each other.
  let wordStarted = false;
  const startWord = () => {
    if (wordStarted) return;
    wordStarted = true;
    completeLevel();
  };
  playSyllable(clip, item.dataset.syllable, startWord);
  window.setTimeout(startWord, LAST_SYLLABLE_MAX_MS);
}

/* ---------------- Controls ---------------- */

elements.hear.addEventListener("click", () => {
  const state = store.getState();
  // Hearing the word again postpones the automatic move to the next word.
  if (state.phase === PHASE.complete) scheduleAutoAdvance();
  playWord(currentLevel(state), handleWordAudioEnded);
});

elements.next.addEventListener("click", goToNextLevel);

elements.movingToggle.addEventListener("click", () => {
  const state = store.dispatch({ type: "set_moving", enabled: !store.getState().movingEnabled });
  storage.saveMoving(state.movingEnabled);
  showMovingToggle(state.movingEnabled);
  if (state.levels.length) renderCurrentLevel();
});

// Browsers keep audio suspended until a user gesture; resume on the first one.
["pointerdown", "keydown"].forEach((type) => {
  window.addEventListener(type, unlockAudio, { capture: true, once: true });
});

/* ---------------- Startup ---------------- */

async function init() {
  initInput({
    onPlace: handlePlace,
    isSlotFilled: (slotIndex) => Boolean(store.getState().placed[slotIndex]),
  });
  showMovingToggle(store.getState().movingEnabled);
  showScore(store.getState().score);
  try {
    const { levels, errors } = validateLevels(await loadJSON(levelsPath(launch.lang)), launch.lang);
    errors.forEach(({ index, level_id: levelId, problems }) => {
      console.warn(`Skipping level #${index} (level_id ${levelId}): ${problems.join("; ")}`);
      emit("error", { reason: "invalid_level", level_id: levelId, message: problems.join("; ") });
    });
    if (!levels.length) throw new Error("No valid levels configured");
    const ordered = orderLevels(levels, storage.getProgress());
    if (!ordered.restored) storage.saveProgress(ordered.levels, ordered.levelIndex);
    store.dispatch({ type: "levels_loaded", levels: ordered.levels, levelIndex: ordered.levelIndex });
    renderCurrentLevel();
  } catch (error) {
    store.dispatch({ type: "load_failed" });
    announce("The game could not load its levels.", "bad");
    emit("error", { reason: "levels_load_failed", message: error.message });
  }
}

init();
