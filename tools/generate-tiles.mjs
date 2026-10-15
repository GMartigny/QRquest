// Generates public/tiles.png — an original pixel-art tileset, dedicated to the
// public domain (CC0). Run with `npm run tiles`. Output is deterministic.
import { writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import {
  TILE, COLUMNS, ROWS_PER_THEME, THEMES, N, E, S, W, themeRow,
} from "../src/tileset.js";
import { PROPS } from "./props.mjs";
import { LANDMARKS, Painter } from "./landmarks.mjs";

const width = TILE * COLUMNS;
const height = TILE * ROWS_PER_THEME * THEMES.length;
const png = new PNG({ width, height });
png.data.fill(0);

// ---------- helpers ----------
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function put(col, row, x, y, color) {
  if (!color || x < 0 || y < 0 || x >= TILE || y >= TILE) return;
  const [r, g, b] = hex(color);
  const i = ((row * TILE + y) * width + col * TILE + x) * 4;
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
}

// Tile grid -> function(x, y) -> color|null
function drawTile(col, row, fn) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) put(col, row, x, y, fn(x, y));
}

// ---------- autotile shape ----------
const R = 4; // corner radius
function shapeFor(mask) {
  const has = (b) => (mask & b) !== 0;
  const inside = (x, y) => {
    // out of tile: inside only if that side connects to a neighbour
    if (y < 0) return has(N) && x >= 0 && x < TILE;
    if (y >= TILE) return has(S) && x >= 0 && x < TILE;
    if (x < 0) return has(W);
    if (x >= TILE) return has(E);
    const cx = x + 0.5, cy = y + 0.5;
    const round = (ox, oy) => (cx - ox) ** 2 + (cy - oy) ** 2 > R * R;
    if (!has(N) && !has(W) && x < R && y < R && round(R, R)) return false;
    if (!has(N) && !has(E) && x >= TILE - R && y < R && round(TILE - R, R)) return false;
    if (!has(S) && !has(W) && x < R && y >= TILE - R && round(R, TILE - R)) return false;
    if (!has(S) && !has(E) && x >= TILE - R && y >= TILE - R && round(TILE - R, TILE - R)) return false;
    return true;
  };
  const outline = (x, y) =>
    inside(x, y) && (!inside(x, y - 1) || !inside(x, y + 1) || !inside(x - 1, y) || !inside(x + 1, y));
  return {
    inside,
    outline,
    top: (x, y) => inside(x, y) && !outline(x, y) && outline(x, y - 1) && !inside(x, y - 2),
    bottom: (x, y) => inside(x, y) && !outline(x, y) && outline(x, y + 1) && !inside(x, y + 2),
  };
}

function autotileRow(row, seed, { texture, outline, top, bottom }) {
  for (let mask = 0; mask < 16; mask++) {
    const rng = mulberry32(seed * 100 + mask);
    const tex = texture(rng, mask);
    const sh = shapeFor(mask);
    drawTile(mask, row, (x, y) => {
      if (!sh.inside(x, y)) return null;
      if (sh.outline(x, y)) return outline;
      if (top && sh.top(x, y)) return typeof top === "function" ? top(x, y) : top;
      if (bottom && sh.bottom(x, y)) return bottom;
      return tex(x, y);
    });
  }
}

// ---------- textures ----------
// Leafy canopy: base noise + a few rounded leaf clusters with a dark underside.
function canopy(pal) {
  return (rng) => {
    const grid = [];
    for (let y = 0; y < TILE; y++) {
      grid.push([]);
      for (let x = 0; x < TILE; x++) grid[y].push(rng() < 0.05 ? pal.dark : pal.base);
    }
    for (let i = 0; i < 6; i++) {
      const bx = Math.floor(rng() * TILE), by = Math.floor(rng() * TILE), r = 1.6 + rng() * 1.2;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - bx, y - by);
        if (d <= r) grid[y][x] = y < by ? pal.light : pal.base;
        else if (d <= r + 1 && y > by) grid[y][x] = pal.dark;
      }
    }
    return (x, y) => grid[y][x];
  };
}

// Bricks 8×4, offset every other course; aligned on the tile grid so neighbours join.
function bricks(pal) {
  return (rng) => {
    const shade = [];
    for (let i = 0; i < 16; i++) shade.push(rng() < 0.25 ? pal.alt : pal.base);
    return (x, y) => {
      const course = Math.floor(y / 4);
      const off = course % 2 ? 4 : 0;
      const bx = (x + off) % 8;
      if (y % 4 === 3 || bx === 7) return pal.mortar;
      if (y % 4 === 0 && bx < 6) return pal.light;
      return shade[course * 2 + Math.floor(((x + off) % 16) / 8)];
    };
  };
}

// Irregular stone blocks (ruins / rocks).
function stones(pal) {
  return (rng) => {
    const cut = 5 + Math.floor(rng() * 6);
    const cut2 = 4 + Math.floor(rng() * 8);
    return (x, y) => {
      const seam = y === 7 || y === 15 || (y < 7 && x === cut) || (y > 7 && x === cut2);
      if (seam) return pal.mortar;
      if (y === 0 || y === 8) return pal.light;
      return rng() < 0.1 ? pal.alt : pal.base;
    };
  };
}

// Conifers: diagonal needle stripes forming a chevron pattern.
function pines(pal) {
  return (rng) => (x, y) => {
    const cx = x % 8;
    const v = (y + Math.abs(cx - 3.5) * 1.2) % 4;
    if (v < 1) return pal.light;
    if (cx === 0 && rng() < 0.4) return pal.dark;
    return rng() < 0.08 ? pal.dark : pal.base;
  };
}

// Ice blocks with diagonal sheen.
function ice(pal) {
  return (rng) => (x, y) => {
    if ((x + y) % 11 === 0) return pal.light;
    if (x === 7 && y > 2 && y < 13) return pal.mortar;
    return rng() < 0.1 ? pal.alt : pal.base;
  };
}

// ---------- ground ----------
function groundRow(row, seed, pal, decorate) {
  for (let v = 0; v < 8; v++) {
    const rng = mulberry32(seed * 100 + v);
    const grid = [];
    for (let y = 0; y < TILE; y++) {
      grid.push([]);
      for (let x = 0; x < TILE; x++) {
        const r = rng();
        grid[y].push(r < 0.06 ? pal.speck : r < 0.12 ? pal.high : pal.base);
      }
    }
    if (pal.seams) pal.seams(grid, v);
    if (v >= 4) decorate(grid, v - 4, rng);
    drawTile(v, row, (x, y) => grid[y][x]);
  }
}

const set = (grid, x, y, c) => { if (x >= 0 && y >= 0 && x < TILE && y < TILE) grid[y][x] = c; };

// ---------- themes ----------
const themes = {
  forest() {
    const t = 0;
    autotileRow(themeRow(t, "wall"), 11, {
      texture: canopy({ base: "#22502b", light: "#2b5e34", dark: "#1b4523" }),
      outline: "#0c2211", top: "#3d7d45", bottom: "#123018",
    });
    autotileRow(themeRow(t, "special"), 12, {
      texture: stones({ base: "#33373e", alt: "#2d3036", light: "#40454d", mortar: "#222429" }),
      outline: "#131518", top: "#4f5560", bottom: "#1b1d21",
    });
    groundRow(themeRow(t, "ground"), 13,
      { base: "#cbe59a", high: "#d4eaa8", speck: "#c0de8c" },
      (g, k, rng) => {
        const x = 3 + Math.floor(rng() * 9), y = 4 + Math.floor(rng() * 8);
        if (k === 0) { // grass tufts
          for (const [dx, dy] of [[0, 0], [2, 0], [1, -1], [-1, -1], [3, -1], [6, 3], [7, 2], [5, 2]]) set(g, x + dx, y + dy, "#b0d27c");
        } else if (k === 1) { // red flower
          for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) set(g, x + dx, y + dy, "#e8737b");
          set(g, x, y, "#f6d86b"); set(g, x, y + 2, "#8fbf5e");
        } else if (k === 2) { // white flowers
          for (const [ox, oy] of [[0, 0], [4, 3]]) {
            for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) set(g, x + ox + dx, y + oy + dy, "#ffffff");
            set(g, x + ox, y + oy, "#f6d86b");
          }
        } else { // pebbles
          set(g, x, y, "#b4b8a0"); set(g, x + 1, y, "#c4c8b2"); set(g, x + 4, y + 2, "#b4b8a0");
        }
      });
  },
  dungeon() {
    const t = 1;
    autotileRow(themeRow(t, "wall"), 21, {
      texture: bricks({ base: "#3d3550", alt: "#372f49", light: "#4b4263", mortar: "#272134" }),
      outline: "#140f1d", top: "#625785", bottom: "#211b2d",
    });
    autotileRow(themeRow(t, "special"), 22, {
      texture: stones({ base: "#2a3a44", alt: "#25333c", light: "#36505c", mortar: "#18232a" }),
      outline: "#0b1216", top: "#4a6b78", bottom: "#141e24",
    });
    groundRow(themeRow(t, "ground"), 23,
      {
        base: "#e8dcbc", high: "#efe6cc", speck: "#dacca6",
        seams(g) { for (let i = 0; i < TILE; i++) { g[15][i] = "#d3c49c"; g[i][15] = "#d3c49c"; g[7][i] = i < 8 ? "#d3c49c" : g[7][i]; } },
      },
      (g, k, rng) => {
        const x = 3 + Math.floor(rng() * 8), y = 2 + Math.floor(rng() * 8);
        if (k === 0) { // crack
          for (const [dx, dy] of [[0, 0], [1, 1], [1, 2], [2, 3], [3, 3], [0, -1]]) set(g, x + dx, y + dy, "#bfae84");
        } else if (k === 1) { // bone
          for (let i = 0; i < 4; i++) set(g, x + i, y + 2, "#fbf7ec");
          set(g, x - 1, y + 1, "#fbf7ec"); set(g, x - 1, y + 3, "#fbf7ec"); set(g, x + 4, y + 1, "#fbf7ec"); set(g, x + 4, y + 3, "#fbf7ec");
        } else if (k === 2) { // coin
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(g, x + dx, y + dy, "#f0c64a");
          set(g, x, y, "#fde69a");
        } else { // rubble
          set(g, x, y, "#c9b68a"); set(g, x + 1, y, "#c9b68a"); set(g, x + 3, y + 1, "#c9b68a");
        }
      });
  },
  snow() {
    const t = 2;
    autotileRow(themeRow(t, "wall"), 31, {
      texture: pines({ base: "#1f4540", light: "#2b5b54", dark: "#163430" }),
      outline: "#0b1d1b", top: (x) => (x % 3 === 0 ? "#7f9fa6" : "#3d6d66"), bottom: "#122a27",
    });
    autotileRow(themeRow(t, "special"), 32, {
      texture: ice({ base: "#26375a", alt: "#223150", light: "#3a5282", mortar: "#18233c" }),
      outline: "#0c1220", top: "#55709f", bottom: "#141d33",
    });
    groundRow(themeRow(t, "ground"), 33,
      { base: "#eef4fa", high: "#ffffff", speck: "#dbe6f1" },
      (g, k, rng) => {
        const x = 3 + Math.floor(rng() * 8), y = 3 + Math.floor(rng() * 8);
        if (k === 0) { // footprints
          for (const [dx, dy] of [[0, 0], [0, 1], [3, 3], [3, 4], [0, 6], [0, 7]]) set(g, x + dx, y + dy, "#c3d3e4");
        } else if (k === 1) { // twig
          for (const [dx, dy] of [[0, 0], [1, 0], [2, 1], [3, 1], [2, 0]]) set(g, x + dx, y + dy, "#a8927a");
        } else if (k === 2) { // drift
          for (let i = 0; i < 6; i++) set(g, x + i, y, "#d3e0ee");
          for (let i = 1; i < 5; i++) set(g, x + i, y - 1, "#ffffff");
        } else { // pebble
          set(g, x, y, "#b8c4d2"); set(g, x + 1, y, "#c8d3df");
        }
      });
  },
};

THEMES.forEach(({ id }) => themes[id]());

// ---------- props ----------
function drawSprite(col, row, { rows, pal }) {
  rows.forEach((line, y) => {
    [...line].forEach((ch, x) => { if (ch !== ".") put(col, row, x, y, pal[ch]); });
  });
}

// Luminance check: a prop must not flip its module (jsQR uses Rec. 709 luma).
const luma = (i) => 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
function composite(propCol, propRow, baseCol, baseRow, region) {
  let total = 0, count = 0;
  for (let y = region; y < TILE - region; y++) for (let x = region; x < TILE - region; x++) {
    const pi = ((propRow * TILE + y) * width + propCol * TILE + x) * 4;
    const bi = ((baseRow * TILE + y) * width + baseCol * TILE + x) * 4;
    total += luma(png.data[pi + 3] ? pi : bi); count++;
  }
  return total / count;
}

let bad = 0;
THEMES.forEach((theme, t) => {
  theme.props.forEach((prop, col) => {
    const sprite = PROPS[prop.id];
    if (!sprite) throw new Error(`Missing sprite ${prop.id}`);
    drawSprite(col, themeRow(t, "props"), sprite);
    const ground = prop.slot === "ground";
    const baseRow = themeRow(t, ground ? "ground" : "wall");
    const baseCol = ground ? 0 : 15;
    const full = composite(col, themeRow(t, "props"), baseCol, baseRow, 0);
    const center = composite(col, themeRow(t, "props"), baseCol, baseRow, 4);
    const ok = ground ? full > 165 && center > 150 : full < 90 && center < 85;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "BAD "} ${theme.id}/${prop.id.padEnd(9)} ${prop.slot.padEnd(10)} luma ${full.toFixed(0)} (centre ${center.toFixed(0)})`);
  });
});
// ---------- landmarks ----------
THEMES.forEach((theme, t) => {
  for (const lm of theme.landmarks) {
    const draw = LANDMARKS[lm.id];
    if (!draw) throw new Error(`Missing landmark ${lm.id}`);
    const p = new Painter(lm.size * TILE, lm.size * TILE);
    draw(p);
    p.px.forEach((line, y) => line.forEach((c, x) => {
      if (c) put(lm.col + Math.floor(x / TILE), themeRow(t, "landmarks") + Math.floor(y / TILE), x % TILE, y % TILE, c);
    }));
  }
});

if (bad) { console.error(`${bad} prop(s) would change their module's colour`); process.exit(1); }

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/tiles.png", import.meta.url), PNG.sync.write(png));
console.log(`public/tiles.png ${width}×${height}`);
