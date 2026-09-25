// Generates public/tree.svg: an ink-sketch of a deep-rooted tree beside a
// river (Psalm 1:3). Run with:  node scripts/make-tree.js
//
// Why a generator instead of a hand-drawn file? A tree drawn by code can be
// "grown" with branching rules, which looks far more organic than hand-placed
// lines. The random numbers come from a fixed seed, so every run produces the
// exact same picture. Change SEED to grow a different tree.

const fs = require('fs');
const path = require('path');

const SEED = 7;
const W = 360, H = 320;
const GROUND_Y = 196;   // where the trunk meets the earth
const TRUNK_X = 210;
const TRUNK_TOP = GROUND_Y - 50;

// Small seeded random-number generator (mulberry32).
let s = SEED >>> 0;
function rand() {
  s = (s + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + (b - a) * rand();
const r1 = (n) => Math.round(n * 10) / 10;
const rad = (deg) => (deg * Math.PI) / 180;

const strokes = []; // { d, w, o }

// One slightly bowed line from (x1,y1) to (x2,y2), like a pen stroke.
function penLine(x1, y1, x2, y2, w, opacity = 1, bow = 0.12) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
  const off = between(-bow, bow) * len;
  strokes.push({
    d: `M${r1(x1)} ${r1(y1)}Q${r1(mx + nx * off)} ${r1(my + ny * off)} ${r1(x2)} ${r1(y2)}`,
    w, o: opacity
  });
}

// ---- Branches (grow upward) ----
const leafSpots = [];
function branch(x, y, angle, len, width, depth) {
  const x2 = x + Math.cos(rad(angle)) * len;
  const y2 = y + Math.sin(rad(angle)) * len;
  penLine(x, y, x2, y2, width);
  // a second, lighter pass makes it read as a sketch rather than clip-art
  if (width > 1) penLine(x + between(-0.8, 0.8), y, x2 + between(-0.8, 0.8), y2, width * 0.45, 0.5);

  if (depth === 0 || len < 5) { leafSpots.push([x2, y2]); return; }
  if (depth <= 1) leafSpots.push([x2, y2]);
  const kids = depth > 3 ? 2 : (rand() < 0.2 ? 3 : 2);
  for (let i = 0; i < kids; i++) {
    const spread = kids === 3 ? [-30, 0, 30][i] : [-24, 24][i];
    const a = angle + spread + between(-12, 12);
    // gently pull branches back toward upright so the crown stays rounded
    const pulled = a + (-90 - a) * 0.08;
    branch(x2, y2, pulled, len * between(0.68, 0.8), width * 0.66, depth - 1);
  }
}

// ---- Roots (grow downward and outward, reaching for the river on the left) ----
function root(x, y, angle, len, width, depth) {
  const x2 = x + Math.cos(rad(angle)) * len;
  let y2 = y + Math.sin(rad(angle)) * len;
  y2 = Math.max(y2, GROUND_Y + 4); // roots stay underground
  if (y2 > H - 22) return;          // and stop before the bottom edge
  penLine(x, y, x2, y2, width, 0.8, 0.2);
  if (depth === 0 || len < 4) return;
  const kids = rand() < 0.5 ? 2 : 3;
  for (let i = 0; i < kids; i++) {
    const a = angle + between(-38, 38);
    // gravity: bend toward straight down (90deg) a little
    const bent = a + (90 - a) * 0.15;
    root(x2, y2, bent, len * between(0.62, 0.82), width * 0.62, depth - 1);
  }
}

// Trunk: a solid, dark tapered shape so it reads as one piece with the branches.
// (The old outline-plus-bark-lines version is still "drawn" and then thrown
// away, only so the random numbers stay in the same order: that keeps every
// branch, root and leaf exactly where it was.)
const before = strokes.length;
for (let i = -3; i <= 3; i++) {
  const edge = i === -3 || i === 3;
  const xb = TRUNK_X + i * 3.4, xt = TRUNK_X + i * 1.9;
  penLine(xb + between(-0.4, 0.4), GROUND_Y + 1, xt + between(-0.4, 0.4), TRUNK_TOP, edge ? 1.5 : 0.5, edge ? 1 : 0.5, 0.06);
}
penLine(TRUNK_X - 10.2, GROUND_Y + 1, TRUNK_X - 17, GROUND_Y + 6, 1.4, 1, 0.1);
penLine(TRUNK_X + 10.2, GROUND_Y + 1, TRUNK_X + 17, GROUND_Y + 6, 1.4, 1, 0.1);
strokes.splice(before);

const T = TRUNK_X, top = TRUNK_TOP - 4, base = GROUND_Y + 1;
strokes.push({
  // left edge: flared foot, gentle inward curve, narrower top; then back down the right edge
  d: `M${T - 18} ${base + 6}C${T - 11} ${base + 2} ${T - 9} ${base - 8} ${T - 8} ${base - 20}` +
     `S${T - 6.5} ${top + 12} ${T - 6} ${top}L${T + 6} ${top}` +
     `C${T + 6.5} ${top + 12} ${T + 8} ${base - 30} ${T + 8.5} ${base - 20}` +
     `S${T + 11} ${base + 2} ${T + 18} ${base + 6}Z`,
  w: 1.2, o: 1, fill: true
});
// Crown: two main limbs leave the top of the trunk
branch(TRUNK_X - 5, TRUNK_TOP, -136, 34, 4.4, 5);
branch(TRUNK_X - 2, TRUNK_TOP, -106, 36, 4.4, 6);
branch(TRUNK_X + 2, TRUNK_TOP, -76, 36, 4.4, 6);
branch(TRUNK_X + 5, TRUNK_TOP, -46, 32, 4.2, 5);

// Main roots: several leaders from the base, the longest reaching left toward the water.
[[160, 40, 3], [140, 34, 2.8], [115, 26, 2.6], [90, 24, 2.6], [65, 26, 2.6], [35, 30, 2.6], [15, 26, 2.2]].forEach(([a, l, w]) => {
  root(TRUNK_X + between(-5, 5), GROUND_Y + 3, a, l, w, 4);
});
root(TRUNK_X - 8, GROUND_Y + 5, 168, 62, 2.8, 4);
root(TRUNK_X - 6, GROUND_Y + 8, 150, 56, 2.4, 4);

// ---- Leaves: small looping ink marks clustered at branch tips ----
leafSpots.forEach(([x, y]) => {
  const n = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const cx = x + between(-7, 7), cy = y + between(-6, 5);
    const rx = between(1.6, 3.2), ry = rx * between(0.45, 0.7);
    const rot = between(-60, 60);
    const c = Math.cos(rad(rot)), sn = Math.sin(rad(rot));
    const p = (ax, ay) => `${r1(cx + ax * c - ay * sn)} ${r1(cy + ax * sn + ay * c)}`;
    // almond leaf shape: two arcs tip to tip
    strokes.push({ d: `M${p(-rx, 0)}Q${p(0, -ry * 2)} ${p(rx, 0)}Q${p(0, ry * 2)} ${p(-rx, 0)}`, w: 0.55, o: 0.8 });
  }
});

// ---- Ground and riverbank ----
// Bank: from the right edge, over the tree, then sloping down into the water.
strokes.push({ d: `M354 ${GROUND_Y + 1}C300 ${GROUND_Y - 3} 250 ${GROUND_Y + 2} ${TRUNK_X} ${GROUND_Y}C185 ${GROUND_Y - 1} 165 ${GROUND_Y + 1} 150 ${GROUND_Y + 8}S132 ${GROUND_Y + 24} 124 ${GROUND_Y + 30}`, w: 1.3, o: 1 });
// Grass tufts along the bank
for (let i = 0; i < 22; i++) {
  const x = between(158, 350);
  if (Math.abs(x - TRUNK_X) < 10) continue;
  const baseY = GROUND_Y + (x < 185 ? (185 - x) * 0.25 : 0);
  for (let k = 0; k < 3; k++) {
    penLine(x + k * 1.4, baseY, x + k * 1.4 + between(-3, 3), baseY - between(3, 7), 0.5, 0.75, 0.3);
  }
}
// Soil hatching (short diagonal strokes)
for (let i = 0; i < 40; i++) {
  const x = between(150, 350), y = between(GROUND_Y + 8, GROUND_Y + 90);
  if (Math.hypot(x - TRUNK_X, (y - GROUND_Y) * 1.4) > 120) continue;
  penLine(x, y, x + 4, y - 2.5, 0.4, 0.35, 0.05);
}

// ---- River: flowing lines with gaps, fading toward the edges ----
for (let row = 0; row < 11; row++) {
  const y = GROUND_Y + 30 + row * 8 + between(-1.5, 1.5);
  let x = between(4, 16);
  const rightEdge = 124 - row * 3 + between(-6, 6);   // water hugs the bank
  while (x < rightEdge) {
    const len = between(16, 40);
    const x2 = Math.min(x + len, rightEdge);
    const amp = between(1, 2.2);
    strokes.push({
      d: `M${r1(x)} ${r1(y)}C${r1(x + (x2 - x) * 0.3)} ${r1(y - amp)} ${r1(x + (x2 - x) * 0.7)} ${r1(y + amp)} ${r1(x2)} ${r1(y)}`,
      w: 0.7, o: 0.45 + 0.4 * rand()
    });
    x = x2 + between(6, 16);
  }
}
// A few ripples on the surface near the far bank
for (let i = 0; i < 5; i++) {
  const x = between(20, 90), y = GROUND_Y + 22 + between(-3, 3);
  penLine(x, y, x + between(8, 16), y, 0.6, 0.5, 0.15);
}

// ---- Assemble ----
const body = strokes.map(({ d, w, o, fill }) =>
  `<path d="${d}" stroke-width="${r1(w)}"${o < 1 ? ` stroke-opacity="${r1(o)}"` : ''}${fill ? ' fill="#2b2f31"' : ''}/>`
).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ink sketch of a tree with deep roots beside a river">` +
  `<g fill="none" stroke="#2b2f31" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`;

const out = path.join(__dirname, '..', 'public', 'tree.svg');
fs.writeFileSync(out, svg);
console.log(`Wrote ${out} (${svg.length} bytes, ${strokes.length} strokes)`);
