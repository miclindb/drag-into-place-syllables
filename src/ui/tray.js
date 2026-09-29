// Tray layout: static tiles are scattered at random, non-overlapping spots
// (sizes measured at runtime, so any screen size works); moving tiles drift
// across the tray in lanes.

import { scatter } from "../game/layout.js";
import { elements } from "./dom.js";

const SCATTER_MIN_HEIGHT_PX = 200;
const SCATTER_GAP_PX = 10;
export const LANE_HEIGHT_PX = 68;
const TRAY_MOVING_HEIGHT_PX = 220;

let scatterWidth = 0;

// Tiles resting in the tray (not dragged, bounced, stopped or vanishing) are
// the ones the scatter layout owns.
function isTrayResident(item) {
  return !["is-bounced", "is-stopped", "is-vanishing", "is-dragging", "is-moving"]
    .some((name) => item.classList.contains(name));
}

export function returnTileHome(item) {
  if (item.dataset.homeX !== undefined) {
    item.style.left = `${item.dataset.homeX}px`;
    item.style.top = `${item.dataset.homeY}px`;
  } else {
    item.style.left = "";
    item.style.top = "";
  }
}

export function scatterTiles() {
  const { tray } = elements;
  if (!tray.classList.contains("tray-scattered")) return;
  const tiles = [...tray.querySelectorAll(".letter")].filter(isTrayResident);
  const width = tray.clientWidth;
  scatterWidth = width;
  if (!tiles.length || !width) return;

  const sizes = tiles.map((tile) => ({ w: tile.offsetWidth, h: tile.offsetHeight }));
  const { spots, height } = scatter(sizes, width, { minHeight: SCATTER_MIN_HEIGHT_PX, gap: SCATTER_GAP_PX });
  tray.style.height = `${height}px`;
  tiles.forEach((tile, index) => {
    tile.dataset.homeX = String(spots[index].x);
    tile.dataset.homeY = String(spots[index].y);
    returnTileHome(tile);
  });
}

/** Prepares the tray for a new board in either static or moving mode. */
export function resetTray(movingEnabled) {
  const { tray } = elements;
  tray.replaceChildren();
  tray.classList.toggle("tray-moving", movingEnabled);
  tray.classList.toggle("tray-scattered", !movingEnabled);
  tray.style.height = "";
  tray.style.minHeight = "";
}

/** Called after the tiles are appended, once they can be measured. */
export function layoutTray(movingEnabled, tileCount) {
  if (movingEnabled) {
    elements.tray.style.minHeight = `${Math.max(TRAY_MOVING_HEIGHT_PX, (tileCount || 1) * LANE_HEIGHT_PX)}px`;
  } else {
    scatterTiles();
  }
}

export function startDrifting(item, laneIndex) {
  const duration = 7 + Math.random() * 5;
  item.classList.add("is-moving");
  item.style.top = `${laneIndex * LANE_HEIGHT_PX}px`;
  item.style.animationDuration = `${duration}s`;
  item.style.animationDelay = `-${(Math.random() * duration).toFixed(2)}s`;
}

export function freezeMovingTile(item) {
  const rect = item.getBoundingClientRect();
  item.classList.remove("is-moving");
  item.classList.add("is-stopped");
  item.style.animation = "none";
  item.style.top = `${rect.top}px`;
  item.style.left = `${rect.left}px`;
}

let resizeTimer = null;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    // Only a width change can push tiles out of bounds; ignore height-only
    // changes (e.g. mobile address bar) so tiles don't reshuffle needlessly.
    if (elements.tray.clientWidth !== scatterWidth) scatterTiles();
  }, 150);
});
