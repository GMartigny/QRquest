// Layout of public/tiles.png, shared by the app and the generator script.
//
// Each theme occupies 3 rows of 16 tiles (TILE × TILE px each):
//   row 0 : "wall" autotiles, index = neighbour mask (N=1, E=2, S=4, W=8)
//   row 1 : "special" autotiles for finder / alignment patterns, same mask
//   row 2 : ground tiles — 0..3 plain variants, 4..7 decorated variants

export const TILE = 16;
export const COLUMNS = 16;
export const ROWS_PER_THEME = 3;

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export const THEMES = [
  { id: "forest", label: "Forêt" },
  { id: "dungeon", label: "Donjon" },
  { id: "snow", label: "Toundra" },
];

export const GROUND_PLAIN = 4;
export const GROUND_DECOR = 4;

export function themeRow(themeIndex, kind) {
  const offset = { wall: 0, special: 1, ground: 2 }[kind];
  return themeIndex * ROWS_PER_THEME + offset;
}
