import qrcode from "qrcode-generator";
import { N, E, S, W, wallSlot } from "./tileset.js";

// Encode text as UTF-8 bytes (accents, emoji…) instead of the library's Latin-1 default.
const encoder = new TextEncoder();
qrcode.stringToBytes = (s) => Array.from(encoder.encode(s));

// Alignment pattern centre coordinates, by QR version (ISO/IEC 18004, annex E).
const ALIGNMENT = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
  [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

// Cheap deterministic hash -> [0, 1)
function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Share of the symbol's modules covered by landmarks, by error correction level.
// Linear progression, calibrated with tools/scan-test.mjs (≥ 99 % decoded).
export const LANDMARK_COVERAGE = { L: 0.015, M: 0.035, Q: 0.055, H: 0.075 };

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Modules the decoder needs outside the error correction: finder patterns with
// their separators and format info, timing lines, alignment and version info.
function forbiddenMap(n, version, special) {
  const no = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (
    (r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9)
    || r === 6 || c === 6 || special[r][c]
    || (version >= 7 && ((r < 6 && c >= n - 11 && c < n - 8) || (c < 6 && r >= n - 11 && r < n - 8)))
  )));
  return no;
}

// Picks random spots for landmarks within the module budget; no overlaps.
function placeLandmarks(n, version, special, { ecl, list, seed, amount }) {
  let budget = Math.round(n * n * (LANDMARK_COVERAGE[ecl] ?? 0) * amount);
  const smallest = Math.min(...list.map((lm) => lm.size * lm.size));
  if (!list.length || budget < smallest) return { placed: [], taken: null };
  const forbidden = forbiddenMap(n, version, special);
  const taken = Array.from({ length: n }, () => new Array(n).fill(false));
  const rng = mulberry32(seed * 7919 + 13);
  const placed = [];
  for (let tries = 0; tries < 3000 && budget >= smallest; tries++) {
    const fits = list.filter((lm) => lm.size * lm.size <= budget);
    if (!fits.length) break;
    const lm = fits[Math.floor(rng() * fits.length)];
    const r0 = Math.floor(rng() * (n - lm.size + 1)), c0 = Math.floor(rng() * (n - lm.size + 1));
    let ok = true;
    for (let r = r0 - 1; ok && r <= r0 + lm.size; r++) for (let c = c0 - 1; ok && c <= c0 + lm.size; c++) {
      if (r < 0 || c < 0 || r >= n || c >= n) continue;
      const inside = r >= r0 && c >= c0 && r < r0 + lm.size && c < c0 + lm.size;
      if (taken[r][c] || (inside && forbidden[r][c])) ok = false;
    }
    if (!ok) continue;
    for (let r = r0; r < r0 + lm.size; r++) for (let c = c0; c < c0 + lm.size; c++) taken[r][c] = true;
    placed.push({ ...lm, r: r0, c: c0 });
    budget -= lm.size * lm.size;
  }
  return { placed, taken };
}

// Which modules belong to finder / alignment patterns (rendered with the "special" tiles).
function specialMap(n, version) {
  const special = Array.from({ length: n }, () => new Array(n).fill(false));
  const mark = (r0, c0, size) => {
    for (let r = r0; r < r0 + size; r++) for (let c = c0; c < c0 + size; c++) special[r][c] = true;
  };
  mark(0, 0, 7); mark(0, n - 7, 7); mark(n - 7, 0, 7);
  const pos = ALIGNMENT[version] || [];
  for (const r of pos) for (const c of pos) {
    const last = pos[pos.length - 1];
    if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
    mark(r - 2, c - 2, 5);
  }
  return special;
}

/**
 * Turns text into a tile map: a list of draw operations from the spritesheet.
 * @param {string} text
 * @param {object} options  tileset: result of analyzeTileset(), world: index in tileset.worlds
 * @returns {{ n, version, cells, size, ops:{sx,sy,dx,dy,w,h}[], landmarks }}
 */
export function buildMap(text, {
  tileset, world = 0, ecl = "Q", quiet = 2, seed = 1, decor = 0.22, props = 0.07, landmarks = 1,
} = {}) {
  if (!tileset) throw new Error("buildMap: tileset manquant (analyzeTileset)");
  const T = tileset.tile;
  const wd = tileset.worlds[Math.min(world, tileset.worlds.length - 1)];

  const qr = qrcode(0, ecl);
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const version = (n - 17) / 4;
  const special = specialMap(n, version);
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
  const kind = (r, c) => (dark(r, c) ? (special[r][c] ? "special" : "wall") : null);

  const { placed, taken } = placeLandmarks(n, version, special, { ecl, list: wd.landmarks, seed, amount: landmarks });
  const covered = (r, c) => taken && r >= 0 && c >= 0 && r < n && c < n && taken[r][c];

  const cells = n + quiet * 2;
  const ops = [];
  const tileOp = (col, row, x, y) => ops.push({ sx: col * T, sy: row * T, dx: x * T, dy: y * T, w: T, h: T });
  const bySlot = (...slots) => wd.props.filter((p) => slots.includes(p.slot));
  const groundProps = bySlot("ground");
  const { plain, decor: decorated } = wd.ground;
  const pick = (list, h) => list[Math.floor(h * list.length)];

  // Props live on "safe" cells only: a ground prop needs a clearing (4 light
  // neighbours) away from the finder/alignment patterns, a wall-front prop needs
  // the bottom face of the wall to be exposed.
  const nearSpecial = (r, c) => {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n && special[rr][cc]) return true;
    }
    return false;
  };
  const pickProp = (x, y, candidates) => {
    if (!candidates.length || hash(x + 101, y + 53, seed) >= props) return null;
    return pick(candidates, hash(y + 7, x + 211, seed));
  };

  // Pass 1: ground everywhere (+ inhabitants of clearings). Walls come after so
  // their semi-transparent spill-over (cast shadows) lands on finished ground.
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const r = y - quiet, c = x - quiet;
      const clearing = !kind(r, c) && !kind(r - 1, c) && !kind(r + 1, c) && !kind(r, c - 1) && !kind(r, c + 1)
        && !nearSpecial(r, c) && !covered(r, c);
      const groundProp = clearing ? pickProp(x, y, groundProps) : null;
      const useDecor = !groundProp && decorated.length && hash(x, y, seed) < decor;
      const variant = useDecor ? pick(decorated, hash(y, x, seed + 7)) : pick(plain, hash(x + 31, y + 17, seed));
      tileOp(variant, wd.rows.ground, x, y);
      if (groundProp) tileOp(groundProp.col, wd.rows.props, x, y);
    }
  }

  // Pass 2: walls row by row; each wall slot is 2×2 tiles anchored on its cell,
  // so later walls (right / below) cover what earlier ones spill onto them.
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const r = y - quiet, c = x - quiet;
      const k = kind(r, c);
      if (!k) continue;
      let mask = 0;
      if (kind(r - 1, c) === k) mask |= N;
      if (kind(r, c + 1) === k) mask |= E;
      if (kind(r + 1, c) === k) mask |= S;
      if (kind(r, c - 1) === k) mask |= W;
      const slot = wallSlot(mask);
      ops.push({ sx: slot.col * T, sy: (wd.rows[k] + slot.row) * T, dx: x * T, dy: y * T, w: 2 * T, h: 2 * T });

      if (k === "wall" && !covered(r, c)) {
        const wallProp = pickProp(x, y, bySlot("wall", ...(mask & S ? [] : ["wall-front"])));
        if (wallProp) tileOp(wallProp.col, wd.rows.props, x, y);
      }
    }
  }

  // landmarks on top of everything, regardless of the modules underneath
  for (const lm of placed) {
    const size = lm.size * T;
    ops.push({ sx: lm.col * T, sy: wd.rows.landmarks * T, dx: (lm.c + quiet) * T, dy: (lm.r + quiet) * T, w: size, h: size });
  }
  return { n, version, cells, size: cells * T, ops, landmarks: placed.map(({ col, size, r, c }) => ({ col, size, r, c })) };
}

/** Draws a map onto a 2D canvas context at an integer pixel scale. */
export function drawMap(ctx, map, sheet, scale = 1) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, map.size * scale, map.size * scale);
  for (const { sx, sy, dx, dy, w, h } of map.ops) {
    ctx.drawImage(sheet, sx, sy, w, h, dx * scale, dy * scale, w * scale, h * scale);
  }
}
