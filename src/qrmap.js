import qrcode from "qrcode-generator";
import { TILE, N, E, S, W, GROUND_PLAIN, GROUND_DECOR, themeRow } from "./tileset.js";

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
 * @returns {{ n:number, version:number, cells:number, size:number, ops:{sx,sy,dx,dy}[] }}
 */
export function buildMap(text, { ecl = "Q", quiet = 2, seed = 1, theme = 0, decor = 0.22 } = {}) {
  const qr = qrcode(0, ecl);
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const version = (n - 17) / 4;
  const special = specialMap(n, version);
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
  const kind = (r, c) => (dark(r, c) ? (special[r][c] ? "special" : "wall") : null);

  const cells = n + quiet * 2;
  const ops = [];
  const groundRow = themeRow(theme, "ground");

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const r = y - quiet, c = x - quiet;
      // ground under every cell (rounded wall corners let it show through)
      const h = hash(x, y, seed);
      const variant = h < decor
        ? GROUND_PLAIN + Math.floor(hash(y, x, seed + 7) * GROUND_DECOR)
        : Math.floor(hash(x + 31, y + 17, seed) * GROUND_PLAIN);
      ops.push({ sx: variant * TILE, sy: groundRow * TILE, dx: x * TILE, dy: y * TILE });

      const k = kind(r, c);
      if (!k) continue;
      let mask = 0;
      if (kind(r - 1, c) === k) mask |= N;
      if (kind(r, c + 1) === k) mask |= E;
      if (kind(r + 1, c) === k) mask |= S;
      if (kind(r, c - 1) === k) mask |= W;
      ops.push({ sx: mask * TILE, sy: themeRow(theme, k) * TILE, dx: x * TILE, dy: y * TILE });
    }
  }
  return { n, version, cells, size: cells * TILE, ops };
}

/** Draws a map onto a 2D canvas context at an integer pixel scale. */
export function drawMap(ctx, map, sheet, scale = 1) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, map.size * scale, map.size * scale);
  for (const { sx, sy, dx, dy } of map.ops) {
    ctx.drawImage(sheet, sx, sy, TILE, TILE, dx * scale, dy * scale, TILE * scale, TILE * scale);
  }
}
