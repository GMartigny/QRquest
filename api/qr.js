// QRquest web service — renders a pixel-art QR code as a PNG.
//
//   GET  /api/qr?text=…[&world=0][&ecl=Q][&seed=1][&scale=4]
//        → uses the site's default tileset
//   POST /api/qr?text=…[&names=Forêt,Donjon][…]   (body: the tileset PNG)
//        → uses the uploaded tileset (≤ 4 MB)
//
// Response: image/png, plus headers X-QR-Version, X-QR-Modules, X-QR-World,
// X-QR-Worlds. Errors are JSON { error } with a 4xx status.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { buildMap } from "../src/qrmap.js";
import { analyzeTileset } from "../src/tileset.js";
import { renderMap } from "../src/render.js";

const MAX_BODY = 4 * 1024 * 1024; // Vercel rejects bodies over 4.5 MB anyway
const MAX_TEXT = 1200;
const MAX_SIDE = 4096; // largest image we agree to render, in pixels
const ECL = new Set(["L", "M", "Q", "H"]);

let defaultTileset; // { sheet, tileset } cached between invocations
async function loadDefault() {
  if (!defaultTileset) {
    const dir = path.join(process.cwd(), "public");
    const sheet = PNG.sync.read(await readFile(path.join(dir, "tiles.png")));
    const manifest = JSON.parse(await readFile(path.join(dir, "tiles.json"), "utf8").catch(() => "{}"));
    defaultTileset = { sheet, tileset: analyzeTileset(sheet, manifest) };
  }
  return defaultTileset;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Tileset trop lourd (4 Mo max)."), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const fail = (status, message) => Object.assign(new Error(message), { status });

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "X-QR-Version, X-QR-Modules, X-QR-World, X-QR-Worlds");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  try {
    if (req.method !== "GET" && req.method !== "POST") throw fail(405, "Méthode non supportée (GET ou POST).");
    const q = new URL(req.url, "http://localhost").searchParams;

    const text = q.get("text");
    if (!text) throw fail(400, "Paramètre « text » manquant.");
    if (text.length > MAX_TEXT) throw fail(400, `Texte trop long (${MAX_TEXT} caractères max).`);
    const ecl = (q.get("ecl") || "Q").toUpperCase();
    if (!ECL.has(ecl)) throw fail(400, "« ecl » doit valoir L, M, Q ou H.");
    const seed = Number.parseInt(q.get("seed") || "1", 10) || 1;

    let sheet, tileset;
    if (req.method === "POST") {
      const body = await readBody(req);
      if (!body.length) throw fail(400, "Corps vide : envoyer le PNG du tileset.");
      try { sheet = PNG.sync.read(body); } catch { throw fail(400, "Le corps n'est pas un PNG lisible."); }
      const names = q.get("names");
      try {
        tileset = analyzeTileset(sheet, names ? { worlds: names.split(",").map((s) => s.trim()) } : {});
      } catch (err) { throw fail(422, `Tileset invalide : ${err.message}`); }
    } else {
      ({ sheet, tileset } = await loadDefault());
    }

    const worldParam = q.get("world") ?? "0";
    let world = Number.parseInt(worldParam, 10);
    if (Number.isNaN(world)) world = tileset.worlds.findIndex((w) => w.label.toLowerCase() === worldParam.toLowerCase());
    if (world < 0 || world >= tileset.worlds.length) throw fail(400, `Monde inconnu (0 à ${tileset.worlds.length - 1}).`);

    let map;
    try {
      map = buildMap(text, { tileset, world, ecl, seed });
    } catch {
      throw fail(400, "Texte trop long pour ce niveau de correction.");
    }
    const maxScale = Math.max(1, Math.floor(MAX_SIDE / map.size));
    const scale = Math.min(Math.max(Number.parseInt(q.get("scale") || "1", 10) || 1, 1), 8, maxScale);

    const img = renderMap(sheet, map, scale);
    const png = new PNG({ width: img.width, height: img.height });
    png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
    const out = PNG.sync.write(png);

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", out.length);
    res.setHeader("X-QR-Version", String(map.version));
    res.setHeader("X-QR-Modules", String(map.n));
    res.setHeader("X-QR-World", encodeURIComponent(tileset.worlds[world].label));
    res.setHeader("X-QR-Worlds", String(tileset.worlds.length));
    // Same parameters → same image: let browsers and the CDN cache GET results
    res.setHeader("Cache-Control", req.method === "GET" ? "public, max-age=3600, s-maxage=31536000" : "no-store");
    res.end(out);
  } catch (err) {
    res.statusCode = err.status || 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: err.status ? err.message : "Erreur interne." }));
    if (!err.status) console.error(err);
  }
}
