// Layout of public/tiles.png, shared by the app and the generator script.
//
// Each theme occupies 4 rows of 16 tiles (TILE × TILE px each):
//   row 0 : "wall" autotiles, index = neighbour mask (N=1, E=2, S=4, W=8)
//   row 1 : "special" autotiles for finder / alignment patterns, same mask
//   row 2 : ground tiles — 0..3 plain variants, 4..7 decorated variants
//   row 3 : props, transparent sprites drawn over a tile, in the order of `props`
//
// Prop slots:
//   ground     — on a light module whose 4 neighbours are light too
//   wall       — on any regular dark module
//   wall-front — on a dark module whose bottom face is exposed (nothing below)

export const TILE = 16;
export const COLUMNS = 16;
export const ROWS_PER_THEME = 4;

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export const THEMES = [
  {
    id: "forest",
    label: "Forêt",
    props: [
      { id: "sign", slot: "ground" },
      { id: "mushroom", slot: "ground" },
      { id: "rabbit", slot: "ground" },
      { id: "apples", slot: "wall" },
      { id: "owl", slot: "wall" },
      { id: "cardinal", slot: "wall" },
    ],
  },
  {
    id: "dungeon",
    label: "Donjon",
    props: [
      { id: "skull", slot: "ground" },
      { id: "potion", slot: "ground" },
      { id: "key", slot: "ground" },
      { id: "torch", slot: "wall-front" },
      { id: "banner", slot: "wall-front" },
      { id: "cobweb", slot: "wall" },
    ],
  },
  {
    id: "snow",
    label: "Toundra",
    props: [
      { id: "fox", slot: "ground" },
      { id: "snowman", slot: "ground" },
      { id: "sled", slot: "ground" },
      { id: "lantern", slot: "wall-front" },
      { id: "squirrel", slot: "wall" },
      { id: "robin", slot: "wall" },
    ],
  },
];

export const GROUND_PLAIN = 4;
export const GROUND_DECOR = 4;

export function themeRow(themeIndex, kind) {
  const offset = { wall: 0, special: 1, ground: 2, props: 3 }[kind];
  return themeIndex * ROWS_PER_THEME + offset;
}
