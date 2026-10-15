// Pure-JS compositing of a tile map into RGBA pixels (no canvas needed), used by
// the API and by the scan test. Alpha is blended the same way a browser would.

/**
 * @param {{ width:number, data:Uint8Array|Uint8ClampedArray|Buffer }} sheet RGBA spritesheet
 * @param {{ size:number, ops:{sx,sy,dx,dy,w,h}[] }} map result of buildMap()
 * @param {number} [scale] integer upscale factor (nearest neighbour)
 * @returns {{ width:number, height:number, data:Uint8ClampedArray }}
 */
export function renderMap(sheet, map, scale = 1) {
  const size = map.size;
  const base = new Uint8ClampedArray(size * size * 4);
  for (const { sx, sy, dx, dy, w, h } of map.ops) {
    for (let y = 0; y < h; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= size) continue;
      for (let x = 0; x < w; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= size) continue;
        const si = ((sy + y) * sheet.width + sx + x) * 4;
        const a = sheet.data[si + 3] / 255;
        if (!a) continue;
        const di = (ty * size + tx) * 4;
        for (let k = 0; k < 3; k++) base[di + k] = sheet.data[si + k] * a + base[di + k] * (1 - a);
        base[di + 3] = 255;
      }
    }
  }
  if (scale === 1) return { width: size, height: size, data: base };

  const out = size * scale;
  const data = new Uint8ClampedArray(out * out * 4);
  for (let y = 0; y < out; y++) {
    const row = ((y / scale) | 0) * size;
    for (let x = 0; x < out; x++) {
      const si = (row + ((x / scale) | 0)) * 4, di = (y * out + x) * 4;
      data[di] = base[si]; data[di + 1] = base[si + 1]; data[di + 2] = base[si + 2]; data[di + 3] = base[si + 3];
    }
  }
  return { width: out, height: out, data };
}
