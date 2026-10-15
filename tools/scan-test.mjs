// Renders QR maps with the real spritesheet (no browser) and checks they decode
// with jsQR. Images are box-downscaled to 8, ~5 and 4 px per module to mimic what
// a phone camera actually captures (pixel-level texture gets averaged out).
// Works with any sheet: `node tools/scan-test.mjs [path/to/tiles.png]`.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { buildMap } from "../src/qrmap.js";
import { analyzeTileset } from "../src/tileset.js";

const sheetPath = process.argv.slice(2).find((a) => !a.startsWith("--")) || new URL("../public/tiles.png", import.meta.url).pathname;
const sheet = PNG.sync.read(readFileSync(sheetPath));
const manifestPath = sheetPath.replace(/\.png$/, ".json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const tileset = analyzeTileset(sheet, manifest);
for (const w of tileset.worlds) {
  const c = w.contrast;
  console.log(`${w.label}: ${w.ground.plain.length}+${w.ground.decor.length} sols, ${w.props.length} habitants, ${w.landmarks.length} bâtiments, contraste ${c.delta}/255 (${c.level})`);
}

function render(map) {
  const out = new PNG({ width: map.size, height: map.size });
  for (const { sx, sy, dx, dy, w, h } of map.ops) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((sy + y) * sheet.width + sx + x) * 4;
      const a = sheet.data[si + 3] / 255;
      if (!a) continue; // transparent: keep what's below
      const di = ((dy + y) * map.size + dx + x) * 4;
      for (let k = 0; k < 3; k++) out.data[di + k] = Math.round(sheet.data[si + k] * a + out.data[di + k] * (1 - a));
      out.data[di + 3] = 255;
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

// ~8, ~5 and ~4 px per module whatever the tile size
const FACTORS = [2, 3, 4].map((f) => Math.max(1, Math.round((f * tileset.tile) / 16)));
const samples = [
  "https://github.com/GMartigny/QRquest",
  "Bonjour, aventurier ! Ta quête commence ici. ⚔️",
  "WIFI:T:WPA;S:Taverne;P:hydromel-42;;",
  "x".repeat(300),
];

const outDir = process.argv.includes("--save") ? new URL("../test-output/", import.meta.url) : null;
if (outDir) mkdirSync(outDir, { recursive: true });

let failures = 0;
for (const [t, theme] of tileset.worlds.entries()) {
  for (const ecl of ["L", "M", "Q", "H"]) {
    for (const [i, text] of samples.entries()) {
      for (const seed of [1, 42]) {
        const map = buildMap(text, { tileset, world: t, ecl, seed });
        const png = render(map);
        for (const f of FACTORS) {
          const [data, w] = downscale(png, f);
          const res = jsQR(data, w, w);
          if (res?.data !== text) {
            failures++;
            console.log(`FAIL ${theme.label} ecl=${ecl} sample=${i} seed=${seed} v${map.version} ${(tileset.tile / f).toFixed(1)}px/module`);
          }
        }
        if (outDir && seed === 1 && ecl === "Q" && i < 2) writeFileSync(new URL(`world${t + 1}-${i}.png`, outDir), PNG.sync.write(png));
      }
    }
  }
}
const total = tileset.worlds.length * 4 * samples.length * 2 * FACTORS.length;
// Landmarks deliberately spend part of the error correction: accept ≥ 99 %.
const rate = (total - failures) / total;
console.log(`${total - failures}/${total} QR codes decoded (${(rate * 100).toFixed(1)} %)`);
process.exit(rate >= 0.99 ? 0 : 1);
