// Feedback animations: wrong-answer bounce, foil dismissal, word celebration.

import { randomFreePosition } from "../game/layout.js";
import { elements, prefersReducedMotion, viewportSize } from "./dom.js";
import { freezeMovingTile } from "./tray.js";

const bounceAnimations = new WeakMap();

export function cancelBounce(item) {
  bounceAnimations.get(item)?.cancel();
  bounceAnimations.delete(item);
}

// Slots, hints, the tray and the top controls must stay clickable, so a
// bounced tile should never be able to land (and get stuck) on top of them.
function interactiveKeepOutRects() {
  const selectors = [".topbar", "#answer-area", "#hint-area", "#letter-tray", "#hear-button", "#next-button"];
  return selectors
    .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
    .filter((rect) => rect && rect.width > 0 && rect.height > 0);
}

export function bounceToRandomLocation(item) {
  if (item.classList.contains("is-moving")) freezeMovingTile(item);
  const startRect = item.getBoundingClientRect();
  cancelBounce(item);
  item.classList.add("is-bounced");

  const target = randomFreePosition(viewportSize(), startRect.width, startRect.height, interactiveKeepOutRects());
  // Commit the final spot immediately (the running animation visually
  // overrides it) so no late "finish" callback can move the tile after the
  // child has already grabbed or placed it.
  item.style.left = `${target.x}px`;
  item.style.top = `${target.y}px`;
  if (prefersReducedMotion()) return;
  const arcTop = Math.max(8, Math.min(startRect.top, target.y) - 70);
  bounceAnimations.set(item, item.animate([
    { left: `${startRect.left}px`, top: `${startRect.top}px`, transform: "scale(1)" },
    { left: `${(startRect.left + target.x) / 2}px`, top: `${arcTop}px`, transform: "scale(1.15)", offset: .55 },
    { left: `${target.x}px`, top: `${target.y}px`, transform: "scale(1)" },
  ], { duration: 520, easing: "ease-out" }));
}

export function dismissFoil(item) {
  if (item.classList.contains("is-moving")) freezeMovingTile(item);
  const rect = item.getBoundingClientRect();
  cancelBounce(item);
  item.classList.add("is-vanishing");
  item.style.left = `${rect.left}px`;
  item.style.top = `${rect.top}px`;
  item.style.pointerEvents = "none";

  if (prefersReducedMotion()) {
    item.remove();
    return;
  }
  const animation = item.animate([
    { transform: "scale(1) rotate(0deg)", opacity: 1 },
    { transform: "scale(1.15) rotate(-8deg)", opacity: 1, offset: .25 },
    { transform: "scale(0) rotate(18deg)", opacity: 0 },
  ], { duration: 420, easing: "ease-in" });
  animation.addEventListener("finish", () => item.remove());
}

export function celebrateWord() {
  if (prefersReducedMotion()) return;
  const { card } = elements;
  card.classList.remove("is-celebrating");
  void card.offsetWidth; // Force reflow so the animation restarts every completion.
  card.classList.add("is-celebrating");
  card.addEventListener("animationend", () => card.classList.remove("is-celebrating"), { once: true });

  const pieces = ["🎉", "⭐", "✨", "🎊"];
  for (let index = 0; index < 10; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.textContent = pieces[Math.floor(Math.random() * pieces.length)];
    piece.style.left = `${10 + Math.random() * 80}%`;
    piece.style.setProperty("--drift", `${(Math.random() * 2 - 1) * 60}px`);
    piece.style.animationDelay = `${(Math.random() * .2).toFixed(2)}s`;
    piece.addEventListener("animationend", () => piece.remove());
    card.append(piece);
  }
}
