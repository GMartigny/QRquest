// Generates public/tiles.png — an original pixel-art tileset, dedicated to the
// public domain (CC0). Run with `npm run tiles`. Output is deterministic.
import { writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import {
  COLUMNS, ROWS_PER_WORLD, ROW, N, E, S, W, GROUND_SLOTS, PROP_SLOTS, LANDMARK_SLOTS, analyzeTileset, wallSlot,
} from "../src/tileset.js";

// Content of the default sheet. The app does not read this: it discovers worlds,
// inhabitants and landmarks from the PNG itself (see src/tileset.js).
const TILE = 16;
const THEMES = [
  {
    id: "forest", label: "Forêt", shadow: "#0b2a1266",
    props: { ground: ["sign", "mushroom", "rabbit"], wall: ["apples", "owl", "cardinal"], "wall-front": [] },
    landmarks: { 3: ["tavern", "oak"], 2: ["well", "campfire"] },
  },
  {
    id: "dungeon", label: "Donjon", shadow: "#3a280c55",
    props: { ground: ["skull", "potion", "key"], wall: ["cobweb"], "wall-front": ["torch", "banner"] },
    landmarks: { 3: ["crypt", "altar"], 2: ["chest", "slime"] },
  },
  {
    id: "snow", label: "Toundra", shadow: "#1a3a6044",
    props: { ground: ["fox", "snowman", "sled"], wall: ["squirrel", "robin"], "wall-front": ["lantern"] },
    landmarks: { 3: ["igloo", "crevasse"], 2: ["icehole", "rock"] },
  },
];
// Landmarks lying flat on the ground: no cast shadow
const FLAT_LANDMARKS = new Set(["crevasse", "icehole"]);
const themeRow = (t, kind) => t * ROWS_PER_WORLD + ROW[kind];
import { PROPS } from "./props.mjs";
import { LANDMARKS, Painter } from "./landmarks.mjs";

const width = TILE * COLUMNS;
const height = TILE * ROWS_PER_WORLD * THEMES.length;
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
// "#rrggbb" or "#rrggbbaa" (partial transparency)
const hex = (h) => [1, 3, 5, 7].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function put(col, row, x, y, color) {
  if (!color || x < 0 || y < 0 || x >= TILE || y >= TILE) return;
  const [r, g, b, a] = hex(color);
  const i = ((row * TILE + y) * width + col * TILE + x) * 4;
  png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
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

// 2.5D walls. Each mask gets a 2×2-tile slot: the module is the top-left tile,
// the cast shadow (wall shape shifted down-right) spills onto the neighbours.
const FACE = 6;   // height of the vertical front face, shown when nothing is below
const SHADOW = 4; // shadow offset, down and right
function autotileRow(band, seed, { texture, face, lip, outline, top, shadow, flat = false }) {
  for (let mask = 0; mask < 16; mask++) {
    const rng = mulberry32(seed * 100 + mask);
    const tex = texture(rng, mask);
    const faceTex = face ? face(mulberry32(seed * 100 + mask + 50)) : null;
    const sh = shapeFor(mask);
    const inCell = (x, y) => x >= 0 && y >= 0 && x < TILE && y < TILE && sh.inside(x, y);
    const front = !flat && !(mask & S); // flat tiles (finder patterns) have no thickness
    const slot = wallSlot(mask);
    const plot = (x, y, c) => put(slot.col + Math.floor(x / TILE), band + slot.row + Math.floor(y / TILE), x % TILE, y % TILE, c);
    for (let y = 0; y < TILE + SHADOW; y++) {
      for (let x = 0; x < TILE + SHADOW; x++) {
        if (!inCell(x, y)) {
          if (!flat && inCell(x - SHADOW, y - SHADOW)) plot(x, y, shadow);
          continue;
        }
        let c;
        if (sh.outline(x, y)) c = outline;
        else if (front && y >= TILE - FACE) c = y === TILE - FACE ? lip : faceTex(x, y);
        else if (top && sh.top(x, y)) c = typeof top === "function" ? top(x, y) : top;
        else c = tex(x, y);
        plot(x, y, c);
      }
    }
  }
}

// Front-face textures (vertical side of a wall)
const trunks = (pal) => (rng) => (x) => (x % 4 === 1 || x % 4 === 2 ? (rng() < 0.15 ? pal.knot : pal.bark) : pal.gap);
const faceBricks = (pal) => () => (x, y) => {
  const row = y - (TILE - FACE) - 1; // 0..FACE-2 below the lip
  const off = row >= 3 ? 4 : 0;
  if (row === 2 || (x + off) % 8 === 7) return pal.mortar;
  return pal.base;
};
const faceBlocks = (pal) => (rng) => (x) => (x % 6 === 5 ? pal.mortar : rng() < 0.1 ? pal.alt : pal.base);
const slate = (pal) => (rng) => (x, y) => (rng() < 0.12 ? pal.alt : (x + y * 3) % 13 === 0 ? pal.light : pal.base);

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
    const col = v < 4 ? GROUND_SLOTS.plain[0] + v : GROUND_SLOTS.decor[0] + v - 4;
    drawTile(col, row, (x, y) => grid[y][x]);
  }
}

const set = (grid, x, y, c) => { if (x >= 0 && y >= 0 && x < TILE && y < TILE) grid[y][x] = c; };

// ---------- themes ----------
const themes = {
  forest() {
    const t = 0;
    autotileRow(themeRow(t, "wall"), 11, {
      texture: canopy({ base: "#22502b", light: "#2b5e34", dark: "#1b4523" }),
      face: trunks({ bark: "#4a3422", knot: "#3a281a", gap: "#16100a" }), lip: "#123018",
      outline: "#0c2211", top: "#3d7d45", shadow: "#0b2a1266",
    });
    autotileRow(themeRow(t, "special"), 12, {
      texture: stones({ base: "#33373e", alt: "#2d3036", light: "#40454d", mortar: "#222429" }),
      outline: "#131518", top: "#4f5560", flat: true,
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
      texture: slate({ base: "#2e2840", alt: "#29233a", light: "#3c3454" }),
      face: faceBricks({ base: "#3d3550", mortar: "#221c30" }), lip: "#4b4263",
      outline: "#140f1d", top: "#4f466b", shadow: "#3a280c55",
    });
    autotileRow(themeRow(t, "special"), 22, {
      texture: stones({ base: "#2a3a44", alt: "#25333c", light: "#36505c", mortar: "#18232a" }),
      outline: "#0b1216", top: "#4a6b78", flat: true,
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
      face: trunks({ bark: "#3e2c20", knot: "#30221a", gap: "#0f1a19" }), lip: "#122a27",
      outline: "#0b1d1b", top: (x) => (x % 3 === 0 ? "#7f9fa6" : "#3d6d66"), shadow: "#1a3a6044",
    });
    autotileRow(themeRow(t, "special"), 32, {
      texture: ice({ base: "#26375a", alt: "#223150", light: "#3a5282", mortar: "#18233c" }),
      outline: "#0c1220", top: "#55709f", flat: true,
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
  for (const [slot, ids] of Object.entries(theme.props)) {
    ids.forEach((id, i) => {
      const col = PROP_SLOTS[slot][0] + i;
      const sprite = PROPS[id];
      if (!sprite) throw new Error(`Missing sprite ${id}`);
      drawSprite(col, themeRow(t, "props"), sprite);
      const ground = slot === "ground";
      const fullSlot = wallSlot(15);
      const baseRow = ground ? themeRow(t, "ground") : themeRow(t, "wall") + fullSlot.row;
      const baseCol = ground ? 0 : fullSlot.col;
      const full = composite(col, themeRow(t, "props"), baseCol, baseRow, 0);
      const center = composite(col, themeRow(t, "props"), baseCol, baseRow, 4);
      const ok = ground ? full > 165 && center > 150 : full < 90 && center < 85;
      if (!ok) bad++;
      console.log(`${ok ? "ok  " : "BAD "} ${theme.id}/${id.padEnd(9)} ${slot.padEnd(10)} luma ${full.toFixed(0)} (centre ${center.toFixed(0)})`);
    });
  }
});
// ---------- landmarks ----------
THEMES.forEach((theme, t) => {
  for (const size of [3, 2]) {
    const slots = LANDMARK_SLOTS.filter((sl) => sl.size === size);
    (theme.landmarks[size] || []).forEach((id, i) => {
      const draw = LANDMARKS[id];
      if (!draw || !slots[i]) throw new Error(`Landmark ${id}: sprite or ${size}×${size} slot missing`);
      const p = new Painter(size * TILE, size * TILE);
      draw(p);
      // 2.5D: standing landmarks cast the same down-right shadow as walls
      if (!FLAT_LANDMARKS.has(id)) { p.shift(-2, -2); p.castShadow(3, theme.shadow); }
      p.px.forEach((line, y) => line.forEach((c, x) => {
        if (c) put(slots[i].col + Math.floor(x / TILE), themeRow(t, "landmarks") + Math.floor(y / TILE), x % TILE, y % TILE, c);
      }));
    });
  }
});

if (bad) { console.error(`${bad} prop(s) would change their module's colour`); process.exit(1); }

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/tiles.png", import.meta.url), PNG.sync.write(png));
writeFileSync(new URL("../public/tiles.json", import.meta.url), JSON.stringify({ worlds: THEMES.map((t) => t.label) }, null, 2) + "\n");

// Sanity check: what the app will discover from this sheet
const found = analyzeTileset(png, { worlds: THEMES.map((t) => t.label) });
for (const w of found.worlds) {
  console.log(`${w.label}: ${w.ground.plain.length}+${w.ground.decor.length} sols, ${w.props.length} habitants, ${w.landmarks.length} bâtiments`);
}
console.log(`public/tiles.png ${width}×${height}`);
