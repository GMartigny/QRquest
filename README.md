# QRquest

A pixel-art QR code generator: every module of the QR code becomes a tile of a 2D RPG map (Forest, Dungeon, Tundra), with autotiling so that walls connect to each other.

## Getting started

```bash
npm install
npm run dev      # local server (site + web service on /api/qr)
npm run build    # production build in dist/
npm test         # checks that at least 99% of rendered QR codes decode (jsQR)
npm run tiles    # regenerates public/tiles.png
```

## Web service

QR codes are rendered server-side by a web service: `api/qr.js`, deployed as a Vercel function. The site uses it for the preview and the download, and it is open to everyone: you can call it from another site, a script or a plain `<img>` tag.

- **URL**: `https://qrquest-rpg.vercel.app/api/qr`
- **Locally**: `npm run dev` serves the same web service at `http://localhost:5173/api/qr`.

### Two ways to call it

| Method | Tileset used | Request body |
| --- | --- | --- |
| `GET` | the site's own (`public/tiles.png`) | none |
| `POST` | yours | the tileset PNG file (4 MB max) |

In both cases, options go in the URL (query string).

### Parameters

| Parameter | If missing | Purpose |
| --- | --- | --- |
| `text` | **required** | content of the QR code (1200 characters max, UTF-8: accents and emoji are fine) |
| `world` | `0` (first world) | world index (`0`, `1`…) or its name, case-insensitive (`Dungeon`, `tundra`…) |
| `ecl` | `Q` | error correction level: `L` (~7%), `M` (~15%), `Q` (~25%), `H` (~30%). The higher it is, the bigger the QR code and the more landmarks it can hold |
| `seed` | `1` | map seed. The same parameters always give the same image; change the seed for a different layout |
| `scale` | `1` | integer, blur-free upscale from 1 to 8. Clamped to that range automatically, and capped so the image never exceeds 4096 px |
| `names` | "World 1", "World 2"… | `POST` only: names of the uploaded tileset's worlds, comma-separated |

Density settings (decorations, inhabitants, landmarks) are not parameters. The share of modules covered by landmarks depends on `ecl` only (see [How it works](#how-it-works)).

### Response

On success: status `200`, an `image/png` body, and these headers:

| Header | Content |
| --- | --- |
| `X-QR-Version` | QR code version (1 to 40) |
| `X-QR-Modules` | modules per side (21 for version 1, +4 per version) |
| `X-QR-World` | name of the world used, URL-encoded (`encodeURIComponent`) |
| `X-QR-Worlds` | number of worlds in the tileset |

The image is `(modules + 4) × tile size × scale` pixels wide: the QR code plus a 2-module margin on each side. With the default tileset (16 px tiles), a 33-module QR code at `scale=1` is 592 px wide.

### Errors

On error, the body is JSON, `{ "error": "message" }`:

| Status | When |
| --- | --- |
| `400` | `text` missing or too long, invalid `ecl`, unknown world, empty `POST` body or not a PNG, text too long for the correction level |
| `405` | method other than `GET`, `POST` or `OPTIONS` |
| `413` | tileset over 4 MB (Vercel itself rejects bodies over 4.5 MB) |
| `422` | readable PNG that isn't a valid tileset, e.g. wrong width or missing walls (see [Tileset](#tileset)) |
| `500` | unexpected internal error |

### Cache and CORS

- **Cache**: `GET` responses can be cached (1 h in the browser, long-term on Vercel's CDN), since the same parameters give the same image. `POST` responses are never cached.
- **CORS**: open to all origins (`Access-Control-Allow-Origin: *`). The `X-QR-*` headers are readable from JavaScript on any site.

### Examples

In an HTML page, with the default tileset:

```html
<img src="https://qrquest-rpg.vercel.app/api/qr?text=https%3A%2F%2Fexample.com&world=Tundra&scale=2"
     alt="QR code to example.com" style="image-rendering: pixelated">
```

From the command line:

```bash
# default tileset
curl -o qr.png "https://qrquest-rpg.vercel.app/api/qr?text=Hello&world=Dungeon&ecl=H&scale=4"

# your own tileset, with its world names
curl -o qr.png --data-binary @my-tileset.png -H "Content-Type: image/png" \
  "https://qrquest-rpg.vercel.app/api/qr?text=Hello&world=Volcano&names=Beach,Volcano"
```

In JavaScript, with a tileset picked by the user:

```js
const params = new URLSearchParams({ text: "Hello", world: 0, ecl: "Q", scale: 4 });
const res = await fetch(`https://qrquest-rpg.vercel.app/api/qr?${params}`, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: fileInput.files[0], // the tileset PNG
});
if (!res.ok) throw new Error((await res.json()).error);
console.log("Version", res.headers.get("X-QR-Version"));
img.src = URL.createObjectURL(await res.blob());
```

### Limits

- **Text**: 1200 characters. The real limit is in UTF-8 bytes: an accented letter counts as 2 bytes, an emoji as 4. 1200 unaccented characters fit even at `H`, but at `H` a fully accented text tops out around 630 characters. Beyond that, the API returns a 400 error ("Text too long for this error correction level.").
- **Uploaded tileset**: 4 MB max.
- **Image**: 4096 px per side max. `scale` is reduced if needed.
- **Scanning**: landmarks use up part of the error correction. In tests (jsQR), at least 99% of generated QR codes decode. For the most reliable scanning, prefer `ecl=H`.

## How it works

- `src/qrmap.js` (shared by the API and the tools) encodes the text (UTF-8) with `qrcode-generator`, then turns the matrix into draw operations: a ground tile under every cell, and for each dark module a wall tile picked from its neighbours (mask N=1, E=2, S=4, W=8 → 16 variants).
- Finder (corner) and alignment patterns use a "special" tile family (ruins, obsidian, ice).
- The ground varies randomly (re-rollable seed) with a few decorations.
- Each world has its inhabitants: sign, mushroom, rabbit, owl… in the forest; skull, potion, key, torch, banner, cobweb in the dungeon; white fox, snowman, sled, lantern, squirrel, robin in the tundra. They are placed at random on safe cells: a clearing (ground surrounded by ground, away from finder patterns), a wall, or a wall front (nothing below). `npm run tiles` checks that none of them changes its cell's brightness.
- A few 2×2 or 3×3 landmarks (tavern, big oak, well, campfire; crypt, altar, chest, slime; igloo, crevasse, ice-fishing hole, rock) are placed anywhere, regardless of the modules underneath: error correction makes up for them. They only avoid what the decoder reads outside error correction (finder + format info, timing lines, alignment, version info) and cover a share of modules that grows linearly with the level: 1.5% at L, 3.5% at M, 5.5% at Q, 7.5% at H (≥ 99% of QR codes decoded by jsQR at every level).

## Tileset

The tileset can be swapped without touching the code. In the interface, **📂 Load** uses your PNG for the session (also select its `.json` to name the worlds), and **⬇ Template** downloads the default tileset as a starting point. The PNG is sent to the API for rendering, and it is also analysed in the browser for the interface (worlds, contrast). To change the site's tileset, drop in another `public/tiles.png` (and optionally `public/tiles.json`). The app reads the image and works out everything else:

- **tile size** = width ÷ 16 (16 px, 32 px…);
- **number of worlds** = height ÷ (13 × tile size): one band of 13 rows per world;
- **ground, inhabitants and landmarks**: each cell is a slot, used only if it isn't fully transparent. So each world can have a different number of them.

Layout of a band (columns 0 to 15):

| Rows | Content |
| --- | --- |
| 0-3 | **walls (required)**: 16 slots of 2×2 tiles, 8 per row pair, index = neighbour mask (N=1, E=2, S=4, W=8). The module is the slot's top-left tile; the rest holds what spills down and to the right (semi-transparent cast shadow) |
| 4-7 | "special" walls for finder patterns, same layout (empty → regular walls are used) |
| 8 | ground: columns 0-7 plain variants (at least one), 8-15 decorated variants |
| 9 | inhabitants: columns 0-7 on the ground, 8-11 on a wall, 12-15 on a wall front (nothing below) |
| 10-12 | landmarks: 3×3 slots at columns 0, 3 and 6; 2×2 slots at columns 9, 11 and 13 (rows 10-11) |

World names (optional, otherwise "World 1", "World 2"…) go in `public/tiles.json`:

```json
{ "worlds": ["Forest", "Dungeon", "Tundra"] }
```

**2.5D rendering**: all the ground is drawn first, then the walls row by row. A wall therefore spills onto the neighbouring ground (shadow), and that spill is covered by any wall to its right or below. If the shadow is the wall's shape shifted down and to the right, two shadows never overlap. In the default tileset, only finder and alignment patterns are raised walls: a vertical front face when nothing is below, and a cast shadow. The other dark cells are flat tiles. Standing landmarks cast the same shadow as walls, drawn inside their slot (the crevasse and the ice-fishing hole, lying flat, have none).

Partial transparency (alpha channel) is supported, for example for a slime or ice.

The interface accent colour is taken from each world's wall colour.

On load, the app compares the average brightness of the walls (dark cells) and the plain ground (light cells) of each world, and warns if the gap is weak (< 140/255), insufficient (< 100/255) or inverted. These thresholds come from measurements with jsQR: ≥ 140 reads reliably, and decoding drops sharply below.

To check a custom tileset from the command line: `node tools/scan-test.mjs path/to/tiles.png` prints what was detected, the contrast and the decode rate. Keep walls dark, ground light, and inhabitants that respect their cell's brightness: that contrast is what makes the QR code scannable.

The default tileset is generated by `npm run tiles` (`tools/generate-tiles.mjs`) and dedicated to the public domain (CC0).

## License

Code under the MIT license, tileset under CC0.
