// QRquest spritesheet format.
//
// The sheet is 16 tiles wide; the tile size is width / 16 (16 px, 32 px…).
// Each world is a band of 13 tile rows; the number of worlds is height / (13 × tile).
// Inside a band, every slot is optional unless noted: an empty (fully transparent)
// slot is simply not used, so worlds can have different numbers of inhabitants
// and landmarks.
//
//   rows 0-3 : walls (required) — 16 autotiles in 2×2-tile slots, 8 per row pair,
//              slot index = neighbour mask (N=1 E=2 S=4 W=8). The module itself is
//              the slot's top-left tile; the rest may hold what spills down/right
//              onto neighbouring cells (2.5D cast shadow, semi-transparent).
//   rows 4-7 : special walls for finder/alignment patterns, same layout
//              (empty → the regular walls are used)
//   row 8  : ground — columns 0-7 plain variants (at least one required),
//            columns 8-15 decorated variants
//   row 9  : inhabitants — columns 0-7 on ground clearings, 8-11 on any wall,
//            12-15 on wall fronts (wall with nothing below)
//   rows 10-12 : landmarks — 3×3 slots at columns 0, 3, 6 and
//                2×2 slots at columns 9, 11, 13 (rows 10-11)
//
// Rendering draws all ground first, then walls row by row: a wall's spill-over
// is covered by any wall to its right or below, and shadows that are the wall
// shape shifted down-right never overlap each other.
//
// World names are read from an optional tiles.json: { "worlds": ["Forest", …] }.

export const COLUMNS = 16;
export const ROWS_PER_WORLD = 13;

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export const ROW = { wall: 0, special: 4, ground: 8, props: 9, landmarks: 10 };
/** Position (in tiles, relative to the wall band) of the 2×2 slot for a neighbour mask. */
export const wallSlot = (mask) => ({ col: (mask % 8) * 2, row: Math.floor(mask / 8) * 2 });
export const GROUND_SLOTS = { plain: [0, 8], decor: [8, 16] };
export const PROP_SLOTS = { ground: [0, 8], wall: [8, 12], "wall-front": [12, 16] };
export const LANDMARK_SLOTS = [
  { col: 0, size: 3 }, { col: 3, size: 3 }, { col: 6, size: 3 },
  { col: 9, size: 2 }, { col: 11, size: 2 }, { col: 13, size: 2 },
];

// Luminance gap (0-255, Rec. 709 luma as used by QR decoders) between the average
// dark tile and the average light tile. Calibrated with tools/scan-test-style
// renders: ≥ 140 reads reliably, 100-140 gets flaky, < 100 mostly fails.
export const CONTRAST = { good: 140, weak: 100 };

/** Column of a slot for a given kind, used by the generator to lay out the default sheet. */
export const slotColumn = (range, index) => range[0] + index;

/**
 * Reads a spritesheet's pixels and describes what it contains.
 * @param {{ width:number, height:number, data:Uint8ClampedArray|Buffer }} image RGBA pixels
 * @param {{ worlds?: string[] }} [manifest] optional names
 */
export function analyzeTileset(image, manifest = {}) {
  const { width, height, data } = image;
  const tile = width / COLUMNS;
  if (!Number.isInteger(tile) || tile < 4) {
    throw new Error(`Tileset width (${width}px) must be 16 × the tile size.`);
  }
  const worldCount = Math.floor(height / (tile * ROWS_PER_WORLD));
  if (worldCount < 1) {
    throw new Error(`The tileset must be at least ${tile * ROWS_PER_WORLD}px tall (${ROWS_PER_WORLD} tile rows per world).`);
  }

  // Is any pixel of the area (in tile units) not fully transparent?
  const filled = (col, row, w = 1, h = 1) => {
    for (let y = row * tile; y < (row + h) * tile; y++) {
      for (let x = col * tile; x < (col + w) * tile; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) return true;
      }
    }
    return false;
  };
  const range = ([from, to], row) => {
    const cols = [];
    for (let c = from; c < to; c++) if (filled(c, row)) cols.push(c);
    return cols;
  };
  // Average luma of (mostly) opaque pixels over several tiles ([col,row] pairs)
  const luma = (cells) => {
    let total = 0, weight = 0;
    for (const [col, row] of cells) for (let y = row * tile; y < (row + 1) * tile; y++) for (let x = col * tile; x < (col + 1) * tile; x++) {
      const i = (y * width + x) * 4, a = data[i + 3] / 255;
      if (a < 0.5) continue;
      total += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * a; weight += a;
    }
    return weight ? total / weight : 0;
  };
  // Average colour of opaque pixels in a tile
  const average = (col, row) => {
    let r = 0, g = 0, b = 0, count = 0;
    for (let y = row * tile; y < (row + 1) * tile; y++) for (let x = col * tile; x < (col + 1) * tile; x++) {
      const i = (y * width + x) * 4;
      if (!data[i + 3]) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
    }
    return count ? [r / count, g / count, b / count] : [128, 128, 128];
  };

  const worlds = [];
  for (let w = 0; w < worldCount; w++) {
    const base = w * ROWS_PER_WORLD;
    const masks = Array.from({ length: 16 }, (_, m) => m);
    const slotFilled = (band, m) => { const sl = wallSlot(m); return filled(sl.col, band + sl.row, 2, 2); };
    // the module cell of each wall slot (top-left tile)
    const cells = (band) => masks.map((m) => { const sl = wallSlot(m); return [sl.col, band + sl.row]; });
    const missing = masks.filter((m) => !slotFilled(base + ROW.wall, m));
    const plain = range(GROUND_SLOTS.plain, base + ROW.ground);
    if (missing.length || !plain.length) {
      throw new Error(`World ${w + 1}: ${missing.length ? `missing wall tiles (${missing.join(", ")})` : "no plain ground tile"}.`);
    }
    const specialComplete = masks.every((m) => slotFilled(base + ROW.special, m));

    const props = Object.entries(PROP_SLOTS).flatMap(([slot, cols]) =>
      range(cols, base + ROW.props).map((col) => ({ slot, col })));
    const landmarks = LANDMARK_SLOTS
      .filter(({ col, size }) => filled(col, base + ROW.landmarks, size, size))
      .map(({ col, size }) => ({ col, size }));

    // Contrast between dark modules (walls, special walls) and light ones (plain ground)
    const light = luma(plain.map((c) => [c, base + ROW.ground]));
    const dark = Math.max(luma(cells(base + ROW.wall)), specialComplete ? luma(cells(base + ROW.special)) : 0);
    const delta = light - dark;
    const contrast = {
      dark: Math.round(dark), light: Math.round(light), delta: Math.round(delta),
      level: delta >= CONTRAST.good ? "good" : delta >= CONTRAST.weak ? "weak" : "bad",
      inverted: delta < 0,
    };

    // UI accent: the wall colour, lightened
    const full = wallSlot(15);
    const accent = average(full.col, base + ROW.wall + full.row).map((v) => Math.round(v + (255 - v) * 0.55));

    worlds.push({
      index: w,
      label: manifest.worlds?.[w] || `World ${w + 1}`,
      rows: {
        wall: base + ROW.wall,
        special: base + (specialComplete ? ROW.special : ROW.wall),
        ground: base + ROW.ground,
        props: base + ROW.props,
        landmarks: base + ROW.landmarks,
      },
      ground: { plain, decor: range(GROUND_SLOTS.decor, base + ROW.ground) },
      props,
      landmarks,
      contrast,
      accent: `rgb(${accent.join(" ")})`,
    });
  }
  return { tile, width, height, worlds };
}
