// QRquest spritesheet format.
//
// The sheet is 16 tiles wide; the tile size is width / 16 (16 px, 32 px…).
// Each world is a band of 7 tile rows; the number of worlds is height / (7 × tile).
// Inside a band, every slot is optional unless noted: an empty (fully transparent)
// slot is simply not used, so worlds can have different numbers of inhabitants
// and landmarks.
//
//   row 0 : walls (required) — 16 autotiles, column = neighbour mask (N=1 E=2 S=4 W=8)
//   row 1 : special walls for finder/alignment patterns, same masks
//           (empty row → the regular walls are used)
//   row 2 : ground — columns 0-7 plain variants (at least one required),
//           columns 8-15 decorated variants
//   row 3 : inhabitants — columns 0-7 on ground clearings, 8-11 on any wall,
//           12-15 on wall fronts (wall with nothing below)
//   rows 4-6 : landmarks — 3×3 slots at columns 0, 3, 6 and
//              2×2 slots at columns 9, 11, 13 (rows 4-5)
//
// World names are read from an optional tiles.json: { "worlds": ["Forêt", …] }.

export const COLUMNS = 16;
export const ROWS_PER_WORLD = 7;

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export const ROW = { wall: 0, special: 1, ground: 2, props: 3, landmarks: 4 };
export const GROUND_SLOTS = { plain: [0, 8], decor: [8, 16] };
export const PROP_SLOTS = { ground: [0, 8], wall: [8, 12], "wall-front": [12, 16] };
export const LANDMARK_SLOTS = [
  { col: 0, size: 3 }, { col: 3, size: 3 }, { col: 6, size: 3 },
  { col: 9, size: 2 }, { col: 11, size: 2 }, { col: 13, size: 2 },
];

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
    throw new Error(`La largeur du tileset (${width}px) doit être 16 × la taille d'une tuile.`);
  }
  const worldCount = Math.floor(height / (tile * ROWS_PER_WORLD));
  if (worldCount < 1) {
    throw new Error(`Le tileset doit faire au moins ${tile * ROWS_PER_WORLD}px de haut (7 rangées de tuiles par monde).`);
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
    const missing = [];
    for (let m = 0; m < 16; m++) if (!filled(m, base + ROW.wall)) missing.push(m);
    const plain = range(GROUND_SLOTS.plain, base + ROW.ground);
    if (missing.length || !plain.length) {
      throw new Error(`Monde ${w + 1} : ${missing.length ? `tuiles de mur manquantes (${missing.join(", ")})` : "aucune tuile de sol simple"}.`);
    }
    const specialComplete = Array.from({ length: 16 }, (_, m) => filled(m, base + ROW.special)).every(Boolean);

    const props = Object.entries(PROP_SLOTS).flatMap(([slot, cols]) =>
      range(cols, base + ROW.props).map((col) => ({ slot, col })));
    const landmarks = LANDMARK_SLOTS
      .filter(({ col, size }) => filled(col, base + ROW.landmarks, size, size))
      .map(({ col, size }) => ({ col, size }));

    // UI accent: the wall colour, lightened
    const accent = average(15, base + ROW.wall).map((v) => Math.round(v + (255 - v) * 0.55));

    worlds.push({
      index: w,
      label: manifest.worlds?.[w] || `Monde ${w + 1}`,
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
      accent: `rgb(${accent.join(" ")})`,
    });
  }
  return { tile, width, height, worlds };
}
