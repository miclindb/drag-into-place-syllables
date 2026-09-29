// Input: pointer dragging plus an accessible tap-to-select / tap-a-slot path.
// Both end in the same `onPlace(item, slotIndex)` callback.

import { clampToViewport } from "../game/layout.js";
import { announce, viewportSize } from "./dom.js";
import { cancelBounce } from "./effects.js";
import { freezeMovingTile, returnTileHome } from "./tray.js";

const DRAG_THRESHOLD_PX = 6;
// Safety net: if neither "pointerup" nor "pointercancel" ever fires (a real
// touch/mouse gesture can be interrupted by the OS/browser mid-drag), a tile
// would otherwise stay stuck forever in "is-dragging" (pointer-events: none,
// fully unclickable). This caps how long a drag can remain unresolved.
const DRAG_WATCHDOG_MS = 8000;

let onPlace = () => {};
let isSlotFilled = () => false;
let activeDrag = null;
let selectedItem = null;

export function initInput(handlers) {
  onPlace = handlers.onPlace;
  isSlotFilled = handlers.isSlotFilled;
}

/* ---------------- Tap-to-select / tap-to-stop ---------------- */

export function clearSelection() {
  if (!selectedItem) return;
  selectedItem.classList.remove("is-selected");
  selectedItem.setAttribute("aria-pressed", "false");
  selectedItem = null;
}

function selectItem(item) {
  if (selectedItem === item) {
    clearSelection();
    return;
  }
  clearSelection();
  selectedItem = item;
  item.classList.add("is-selected");
  item.setAttribute("aria-pressed", "true");
  announce(`Selected ${item.textContent.trim()}. Choose a space for it.`);
}

function handleTileClick(event) {
  const item = event.currentTarget;
  if (item.dataset.suppressClick === "true") {
    delete item.dataset.suppressClick;
    return;
  }
  if (item.getAttribute("aria-disabled") === "true") return;
  if (item.classList.contains("is-moving")) freezeMovingTile(item);
  selectItem(item);
}

export function handleSlotActivate(slotIndex) {
  if (isSlotFilled(slotIndex)) {
    announce("That space is already filled.");
    return;
  }
  if (!selectedItem) {
    announce("Tap a syllable first, then tap a space for it.");
    return;
  }
  const item = selectedItem;
  clearSelection();
  onPlace(item, slotIndex);
}

/* ---------------- Pointer-based drag ---------------- */

function handlePointerDown(event) {
  const item = event.currentTarget;
  if (item.getAttribute("aria-disabled") === "true") return;
  const drag = {
    item,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    offsetX: 0,
    offsetY: 0,
    hasDragged: false,
    watchdog: null,
  };
  activeDrag = drag;
  drag.watchdog = window.setTimeout(() => finishDrag(drag, drag.lastX, drag.lastY), DRAG_WATCHDOG_MS);
  item.setPointerCapture(event.pointerId);
  item.addEventListener("pointermove", handlePointerMove);
  item.addEventListener("pointerup", handlePointerUp, { once: true });
  item.addEventListener("pointercancel", handlePointerCancel, { once: true });
  // "lostpointercapture" reliably fires whenever capture ends for *any*
  // reason, unlike "pointerup"/"pointercancel" which can be skipped entirely
  // by some interrupted gestures.
  item.addEventListener("lostpointercapture", handlePointerLost, { once: true });
}

function handlePointerMove(event) {
  const drag = activeDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  if (!drag.hasDragged) {
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (distance < DRAG_THRESHOLD_PX) return;
    beginDragVisual(drag, event);
  }
  updateDragPosition(drag, event);
}

function beginDragVisual(drag, event) {
  drag.hasDragged = true;
  const { item } = drag;
  if (item.classList.contains("is-moving")) freezeMovingTile(item);
  if (selectedItem === item) clearSelection();
  const rect = item.getBoundingClientRect();
  cancelBounce(item); // Grabbed mid-bounce: continue from where it is now.
  drag.offsetX = event.clientX - rect.left;
  drag.offsetY = event.clientY - rect.top;
  item.classList.add("is-dragging");
  item.style.left = `${rect.left}px`;
  item.style.top = `${rect.top}px`;
}

function updateDragPosition(drag, event) {
  const { item, offsetX, offsetY } = drag;
  const { x, y } = clampToViewport(viewportSize(), item.offsetWidth, item.offsetHeight, event.clientX - offsetX, event.clientY - offsetY);
  item.style.left = `${x}px`;
  item.style.top = `${y}px`;
}

function detachDragListeners(item) {
  item.removeEventListener("pointermove", handlePointerMove);
  item.removeEventListener("pointerup", handlePointerUp);
  item.removeEventListener("pointercancel", handlePointerCancel);
  item.removeEventListener("lostpointercapture", handlePointerLost);
}

// Shared cleanup for every way a drag can end (mouse/touch released
// normally, capture lost, or the watchdog timing it out).
function finishDrag(drag, clientX, clientY) {
  if (activeDrag !== drag) return; // Already finished via another path.
  activeDrag = null;
  window.clearTimeout(drag.watchdog);
  const { item } = drag;
  detachDragListeners(item);

  if (!drag.hasDragged) return; // Let the resulting click handle select/stop.

  // Resolve the drop target *while the dragged tile is still pointer-events:
  // none* (via "is-dragging"). Otherwise, for a tile that already bounced to
  // a fixed free-floating spot, removing "is-dragging" first would make the
  // tile itself hit-testable again right where it was dropped, so
  // elementFromPoint would find the tile instead of the slot underneath it.
  const target = document.elementFromPoint(clientX, clientY)?.closest(".slot");

  item.classList.remove("is-dragging");
  // A tile that has already bounced to a free-floating spot stays exactly
  // where the child dropped it instead of snapping back into the tray.
  if (!item.classList.contains("is-bounced")) returnTileHome(item);
  item.dataset.suppressClick = "true";
  window.setTimeout(() => delete item.dataset.suppressClick, 400);

  const slotIndex = target ? Number(target.dataset.slot) : -1;
  if (slotIndex >= 0 && !isSlotFilled(slotIndex)) onPlace(item, slotIndex);
}

function handlePointerUp(event) {
  const drag = activeDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  finishDrag(drag, event.clientX, event.clientY);
}

function handlePointerLost(event) {
  const drag = activeDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  finishDrag(drag, drag.lastX, drag.lastY);
}

function handlePointerCancel(event) {
  const drag = activeDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  activeDrag = null;
  window.clearTimeout(drag.watchdog);
  const { item } = drag;
  detachDragListeners(item);
  item.classList.remove("is-dragging");
  if (!item.classList.contains("is-bounced")) returnTileHome(item);
}

/** Wires a tray tile for dragging and tap-to-select. */
export function bindTile(item) {
  item.addEventListener("pointerdown", handlePointerDown);
  item.addEventListener("click", handleTileClick);
}

/** Drops any in-progress drag/selection (used when the board is rebuilt). */
export function resetInput() {
  if (activeDrag) {
    window.clearTimeout(activeDrag.watchdog);
    detachDragListeners(activeDrag.item);
    activeDrag = null;
  }
  selectedItem = null;
}
