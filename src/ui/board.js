// Board rendering: picture, answer slots, hint area, tray tiles and status.

import { elements, announce } from "./dom.js";
import { bindTile, handleSlotActivate } from "./input.js";
import { layoutTray, resetTray, returnTileHome, startDrifting } from "./tray.js";
import { cancelBounce } from "./effects.js";

export function renderBoard(level, { tiles, movingEnabled, levelNumber, levelCount }) {
  elements.picture.textContent = level.image || "🖼️";
  elements.picture.setAttribute("aria-label", `Picture clue for ${level.target_word}`);
  elements.prompt.textContent = "Build the word from its syllables";
  elements.progress.textContent = `Word ${levelNumber} of ${levelCount}`;
  elements.answer.replaceChildren();
  elements.hints.replaceChildren();
  resetTray(movingEnabled);
  elements.next.hidden = true;
  elements.hear.hidden = true;
  announce("");

  level.syllables.forEach((syllable, index) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "slot";
    slot.dataset.slot = String(index);
    slot.textContent = "?";
    slot.setAttribute("aria-label", `Syllable space ${index + 1}, empty`);
    slot.addEventListener("click", () => handleSlotActivate(index));
    elements.answer.append(slot);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.dataset.hint = String(index);
    const icon = document.createElement("span");
    icon.className = "hint-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = level.image || "🖼️";
    const text = document.createElement("span");
    text.className = "hint-text";
    text.textContent = syllable.toUpperCase();
    hint.append(icon, text);
    elements.hints.append(hint);
  });

  tiles.forEach(({ syllable, index, isFoil }, laneIndex) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "letter syllable";
    item.textContent = syllable.toUpperCase();
    item.dataset.syllable = syllable;
    item.dataset.foil = String(isFoil);
    item.dataset.id = `${level.level_id}-${index}`;
    item.setAttribute("aria-label", `${syllable.toUpperCase()} syllable`);
    item.setAttribute("aria-pressed", "false");
    bindTile(item);
    if (movingEnabled) startDrifting(item, laneIndex);
    else item.classList.add("is-scattered");
    elements.tray.append(item);
  });

  layoutTray(movingEnabled, tiles.length);
}

export function revealHint(slotIndex) {
  elements.hints.querySelector(`[data-hint="${slotIndex}"]`)?.classList.add("is-visible");
}

/** Locks a correctly placed tile and shows its syllable in the slot. */
export function fillSlot(item, slotIndex) {
  const slot = elements.answer.querySelector(`[data-slot="${slotIndex}"]`);
  slot.textContent = item.textContent;
  slot.classList.add("is-filled", "is-correct");
  slot.disabled = true;
  slot.setAttribute("aria-label", `Syllable space ${slotIndex + 1}, filled with ${item.textContent.trim()}`);
  // A tile that had bounced away from an earlier wrong guess needs to return
  // to its home spot in the tray, otherwise it stays floating on top of the
  // answer slot it was just dropped on (looking like a ghostly overlap).
  item.classList.remove("is-bounced", "is-stopped", "is-moving");
  cancelBounce(item);
  returnTileHome(item);
  item.style.animation = "";
  item.setAttribute("aria-disabled", "true");
  item.disabled = true;
}

export function showScore(score) {
  elements.score.textContent = `⭐ ${score.correct}   ✖ ${score.mistakes}`;
}

export function showMovingToggle(enabled) {
  elements.movingToggle.setAttribute("aria-pressed", String(enabled));
  elements.movingToggle.textContent = `🎯 Moving tiles: ${enabled ? "On" : "Off"}`;
}

export function showCompleteControls() {
  elements.hear.hidden = false;
  elements.next.hidden = false;
}
