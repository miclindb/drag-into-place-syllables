// Pure layout math. Callers measure the DOM and pass plain numbers in, so
// everything here is testable without a browser. `random` is injectable for
// deterministic tests.

export function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function tryScatter(sizes, width, height, gap, random) {
  const taken = [];
  for (const { w, h } of sizes) {
    const maxX = Math.max(0, width - w);
    const maxY = Math.max(0, height - h);
    let spot = null;
    for (let attempt = 0; attempt < 80 && !spot; attempt += 1) {
      const x = random() * maxX;
      const y = random() * maxY;
      const box = { left: x - gap, top: y - gap, right: x + w + gap, bottom: y + h + gap };
      if (!taken.some((rect) => rectsOverlap(box, rect))) spot = { x, y, box };
    }
    if (!spot) return null;
    taken.push(spot.box);
  }
  return taken.map((box) => ({ x: box.left + gap, y: box.top + gap }));
}

// Wrap-around rows; only used if random sampling keeps colliding (tiny screens).
function gridLayout(sizes, width, gap) {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const spots = sizes.map(({ w, h }) => {
    if (x > 0 && x + w > width) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    const spot = { x, y };
    x += w + gap;
    rowHeight = Math.max(rowHeight, h);
    return spot;
  });
  return { spots, height: y + rowHeight };
}

/**
 * Random, non-overlapping spots for tiles of the given sizes inside an area
 * `width` wide. Grows the area's height as needed and returns it.
 */
export function scatter(sizes, width, { minHeight = 200, gap = 10, random = Math.random } = {}) {
  if (!sizes.length || width <= 0) return { spots: [], height: minHeight };
  const area = sizes.reduce((sum, { w, h }) => sum + (w + gap * 2) * (h + gap * 2), 0);
  let height = Math.max(minHeight, Math.ceil((area * 2.2) / width));
  for (let pass = 0; pass < 6; pass += 1) {
    const spots = tryScatter(sizes, width, height, gap, random);
    if (spots) return { spots: spots.map(({ x, y }) => ({ x: Math.round(x), y: Math.round(y) })), height: Math.ceil(height) };
    height = Math.round(height * 1.25);
  }
  const grid = gridLayout(sizes, width, gap);
  return { spots: grid.spots, height: Math.max(minHeight, Math.ceil(grid.height)) };
}

/** Random top-left position keeping a `width`×`height` box inside the viewport. */
export function randomViewportPosition(viewport, width, height, { margin = 12, random = Math.random } = {}) {
  const maxX = Math.max(margin, viewport.width - width - margin);
  const maxY = Math.max(margin, viewport.height - height - margin);
  return {
    x: margin + random() * (maxX - margin),
    y: margin + random() * (maxY - margin),
  };
}

/**
 * Like `randomViewportPosition`, but avoids the `keepOut` rects (slots, tray,
 * controls) so a bounced tile never covers something the child must tap.
 */
export function randomFreePosition(viewport, width, height, keepOut, { pad = 8, attempts = 20, random = Math.random } = {}) {
  let candidate = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    candidate = randomViewportPosition(viewport, width, height, { random });
    const box = {
      left: candidate.x - pad,
      top: candidate.y - pad,
      right: candidate.x + width + pad,
      bottom: candidate.y + height + pad,
    };
    if (!keepOut.some((rect) => rectsOverlap(box, rect))) return candidate;
  }
  return candidate; // Rare (very small/cramped viewport): use the last sample anyway.
}

/** Clamps a dragged tile's top-left so it can never leave the viewport. */
export function clampToViewport(viewport, width, height, x, y) {
  return {
    x: Math.max(0, Math.min(viewport.width - width, x)),
    y: Math.max(0, Math.min(viewport.height - height, y)),
  };
}
