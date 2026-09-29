// Shared DOM references and small DOM helpers.

export const elements = {
  card: document.querySelector(".game-card"),
  picture: document.querySelector("#picture"),
  prompt: document.querySelector("#prompt"),
  progress: document.querySelector("#progress"),
  score: document.querySelector("#score"),
  movingToggle: document.querySelector("#moving-toggle"),
  answer: document.querySelector("#answer-area"),
  hints: document.querySelector("#hint-area"),
  tray: document.querySelector("#letter-tray"),
  feedback: document.querySelector("#feedback"),
  hear: document.querySelector("#hear-button"),
  next: document.querySelector("#next-button"),
};

// Clearing then re-setting the text (next frame) forces assistive tech to
// re-announce messages even when back-to-back feedback text is identical.
export function announce(message, type = "") {
  elements.feedback.className = `feedback ${type}`;
  elements.feedback.textContent = "";
  window.requestAnimationFrame(() => {
    elements.feedback.textContent = message;
  });
}

export function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}
