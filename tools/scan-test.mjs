// Renders QR maps with the real spritesheet (no browser) and checks they decode
// with jsQR. Images are box-downscaled to 8, ~5 and 4 px per module to mimic what
// a phone camera actually captures (pixel-level texture gets averaged out).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { buildMap } from "../src/qrmap.js";
import { TILE, THEMES } from "../src/tileset.js";

const sheet = PNG.sync.read(readFileSync(new URL("../public/tiles.png", import.meta.url)));

function render(map) {
  const out = new PNG({ width: map.size, height: map.size });
  for (const { sx, sy, dx, dy, w = TILE, h = TILE } of map.ops) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((sy + y) * sheet.width + sx + x) * 4;
      if (sheet.data[si + 3] === 0) continue; // transparent: keep what's below
      const di = ((dy + y) * map.size + dx + x) * 4;
      sheet.data.copy(out.data, di, si, si + 4);
    }
  }
  return out;
}

function downscale(png, f) {
  const w = Math.floor(png.width / f), out = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) {
    let t = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) t += png.data[((y * f + j) * png.width + x * f + i) * 4 + k];
    out[(y * w + x) * 4 + k] = t / (f * f);
  }
  return [out, w];
}

const FACTORS = [2, 3, 4];
const samples = [
  "https://github.com/GMartigny/QRquest",
  "Bonjour, aventurier ! Ta quête commence ici. ⚔️",
  "WIFI:T:WPA;S:Taverne;P:hydromel-42;;",
  "x".repeat(300),
];

const outDir = process.argv.includes("--save") ? new URL("../test-output/", import.meta.url) : null;
if (outDir) mkdirSync(outDir, { recursive: true });

let failures = 0;
for (const [t, theme] of THEMES.entries()) {
  for (const ecl of ["L", "M", "Q", "H"]) {
    for (const [i, text] of samples.entries()) {
      for (const seed of [1, 42]) {
        const map = buildMap(text, { ecl, theme: t, seed });
        const png = render(map);
        for (const f of FACTORS) {
          const [data, w] = downscale(png, f);
          const res = jsQR(data, w, w);
          if (res?.data !== text) {
            failures++;
            console.log(`FAIL ${theme.id} ecl=${ecl} sample=${i} seed=${seed} v${map.version} ${(16 / f).toFixed(1)}px/module`);
          }
        }
        if (outDir && seed === 1 && ecl === "Q" && i < 2) writeFileSync(new URL(`${theme.id}-${i}.png`, outDir), PNG.sync.write(png));
      }
    }
  }
}
const total = THEMES.length * 4 * samples.length * 2 * FACTORS.length;
// Landmarks deliberately spend part of the error correction: accept ≥ 99 %.
const rate = (total - failures) / total;
console.log(`${total - failures}/${total} QR codes decoded (${(rate * 100).toFixed(1)} %)`);
process.exit(rate >= 0.99 ? 0 : 1);
