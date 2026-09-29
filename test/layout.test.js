import { test } from "node:test";
import assert from "node:assert/strict";
import { clampToViewport, randomFreePosition, rectsOverlap, scatter } from "../src/game/layout.js";
import { seededRandom } from "./helpers.js";

const GAP = 10;

function boxes(sizes, spots) {
  return spots.map(({ x, y }, index) => ({ left: x, top: y, right: x + sizes[index].w, bottom: y + sizes[index].h }));
}

for (const width of [268, 340, 700, 1100]) {
  test(`scatter keeps tiles inside a ${width}px area without overlaps`, () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const sizes = [72, 55, 75, 57, 110, 62].map((w) => ({ w, h: 54 }));
      const { spots, height } = scatter(sizes, width, { minHeight: 200, gap: GAP, random: seededRandom(seed) });
      const placed = boxes(sizes, spots);
      assert.equal(spots.length, sizes.length);
      placed.forEach((box) => {
        assert.ok(box.left >= 0 && box.right <= width, `x out of bounds (seed ${seed})`);
        assert.ok(box.top >= 0 && box.bottom <= height, `y out of bounds (seed ${seed})`);
      });
      placed.forEach((a, i) => placed.slice(i + 1).forEach((b) => assert.ok(!rectsOverlap(a, b), `overlap (seed ${seed})`)));
    }
  });
}

test("scatter falls back to a grid when the area is too narrow to sample", () => {
  const sizes = Array.from({ length: 8 }, () => ({ w: 60, h: 54 }));
  const { spots, height } = scatter(sizes, 60, { minHeight: 10, gap: GAP, random: seededRandom(2) });
  const placed = boxes(sizes, spots);
  placed.forEach((a, i) => placed.slice(i + 1).forEach((b) => assert.ok(!rectsOverlap(a, b))));
  assert.ok(placed.every((box) => box.bottom <= height));
});

test("scatter handles no tiles", () => {
  assert.deepEqual(scatter([], 300, { minHeight: 200 }), { spots: [], height: 200 });
});

test("randomFreePosition stays on screen and avoids keep-out areas", () => {
  const viewport = { width: 800, height: 600 };
  const keepOut = [{ left: 0, top: 0, right: 800, bottom: 300 }];
  const random = seededRandom(11);
  for (let index = 0; index < 50; index += 1) {
    const { x, y } = randomFreePosition(viewport, 60, 60, keepOut, { random });
    assert.ok(x >= 0 && x + 60 <= viewport.width);
    assert.ok(y >= 300 && y + 60 <= viewport.height);
  }
});

test("clampToViewport never lets a dragged tile leave the screen", () => {
  const viewport = { width: 400, height: 300 };
  assert.deepEqual(clampToViewport(viewport, 60, 60, -50, -10), { x: 0, y: 0 });
  assert.deepEqual(clampToViewport(viewport, 60, 60, 390, 290), { x: 340, y: 240 });
  assert.deepEqual(clampToViewport(viewport, 60, 60, 100, 100), { x: 100, y: 100 });
});
