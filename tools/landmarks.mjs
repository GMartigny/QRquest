// Landmark sprites (2×2 or 3×3 tiles), drawn procedurally with a tiny painter.
// They ignore the QR modules underneath; the error correction absorbs them.

export class Painter {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.px = Array.from({ length: h }, () => new Array(w).fill(null));
  }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y][x] = c;
  }
  get(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.px[y][x] : null; }
  rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); }
  ellipse(cx, cy, rx, ry, c, { top = true, bottom = true } = {}) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if ((!top && y < cy) || (!bottom && y > cy)) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, c);
      }
    }
  }
  circle(cx, cy, r, c, opts) { this.ellipse(cx, cy, r, r, c, opts); }
  line(x0, y0, x1, y1, c, thick = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
      if (thick <= 1) this.set(x, y, c);
      else this.circle(x, y, thick / 2, c);
    }
  }
  // Filled polygon (even-odd scanline)
  poly(points, c) {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i], [x1, y1] = points[(i + 1) % points.length];
        const yy = y + 0.5;
        if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) xs.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c);
    }
  }
  // Recolour existing pixels matching `from` inside a predicate
  shade(pred, c) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.px[y][x] && pred(x, y, this.px[y][x])) this.px[y][x] = c;
  }
  // 1px outline around every opaque pixel
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.px[y][x]) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.px[y][x] = c;
  }
}

// Deterministic noise for textures
const noise = (x, y, s = 1) => {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export const LANDMARKS = {
  // ---------------- forest ----------------
  tavern(p) {
    // chimney
    p.rect(32, 3, 6, 12, "#7d7f88"); p.rect(31, 2, 8, 2, "#5e6068");
    p.circle(36, 0, 2, "#d9dde4");
    // walls (half-timbered)
    p.rect(7, 22, 34, 23, "#eadcb6");
    for (const x of [7, 23, 40]) p.rect(x, 22, 2, 23, "#6b4a2e");
    p.rect(7, 22, 34, 2, "#6b4a2e"); p.rect(7, 33, 34, 2, "#6b4a2e");
    p.line(9, 35, 22, 44, "#6b4a2e", 2); p.line(25, 44, 39, 35, "#6b4a2e", 2);
    // stone base
    for (let x = 7; x < 41; x += 4) p.rect(x, 43, 3, 3, (x / 4) % 2 ? "#8c8f99" : "#a2a6b0");
    // roof
    p.poly([[2, 23], [24, 4], [46, 23]], "#b5493b");
    for (let y = 8; y < 23; y += 3) p.shade((x, yy) => yy === y, "#8e372d");
    p.rect(2, 22, 45, 2, "#7a2f27");
    // door
    p.rect(19, 32, 10, 14, "#7a5230"); p.circle(24, 32, 5, "#7a5230", { bottom: false });
    p.rect(23, 28, 2, 18, "#5e3f24"); p.set(21, 39, "#f0c64a");
    // windows (lit)
    for (const x of [11, 31]) { p.rect(x, 26, 6, 5, "#f6d86b"); p.rect(x + 2, 26, 1, 5, "#6b4a2e"); p.rect(x, 28, 6, 1, "#6b4a2e"); }
    // hanging sign with a mug
    p.rect(40, 26, 7, 1, "#4a3a2a"); p.rect(41, 27, 6, 7, "#d9b27a"); p.rect(42, 29, 3, 4, "#f0c64a"); p.rect(42, 29, 3, 1, "#ffffff"); p.set(45, 30, "#f0c64a"); p.set(45, 31, "#f0c64a");
    p.outline("#2a1a14");
  },
  oak(p) {
    // roots + trunk
    p.poly([[18, 46], [21, 30], [27, 30], [30, 46]], "#6b4a2e");
    p.line(14, 46, 20, 41, "#6b4a2e", 3); p.line(34, 46, 28, 41, "#6b4a2e", 3);
    p.rect(23, 33, 1, 10, "#4f361f"); p.rect(26, 36, 1, 6, "#4f361f");
    p.circle(25, 39, 2, "#3a2716"); // knot hole
    // canopy
    const blobs = [[24, 16, 15], [11, 22, 9], [37, 22, 9], [16, 9, 8], [33, 9, 8], [24, 27, 9]];
    for (const [x, y, r] of blobs) p.circle(x, y, r, "#2e6a30");
    for (const [x, y, r] of blobs) p.circle(x - 1, y - 2, r - 2, "#3f8a3e");
    for (const [x, y, r] of blobs) p.circle(x - 3, y - 4, r / 3, "#5aa84e");
    p.shade((x, y, c) => c === "#3f8a3e" && noise(x, y, 3) < 0.12, "#2e6a30");
    for (const [x, y] of [[10, 18], [30, 6], [38, 24], [20, 24], [28, 15]]) { p.rect(x, y, 2, 2, "#d8463c"); p.set(x, y, "#f39486"); }
    p.outline("#14301a");
  },
  well(p) {
    // posts + roof
    p.rect(5, 6, 2, 14, "#7a5230"); p.rect(25, 6, 2, 14, "#7a5230");
    p.poly([[2, 8], [16, 0], [30, 8]], "#b5493b"); p.rect(2, 7, 29, 2, "#7a2f27");
    p.rect(7, 9, 18, 1, "#5e3f24"); p.line(16, 10, 16, 14, "#c8b088"); p.rect(14, 14, 5, 3, "#8a6a40");
    // stone ring
    p.rect(4, 18, 24, 11, "#9a9ea8");
    for (let y = 18; y < 29; y += 3) for (let x = 4 + ((y / 3) % 2) * 3; x < 28; x += 6) p.rect(x, y, 1, 3, "#6e7280");
    for (let y = 20; y < 29; y += 3) p.rect(4, y, 24, 1, "#6e7280");
    p.ellipse(16, 18, 12, 4, "#b8bcc6"); p.ellipse(16, 18, 9, 2.5, "#24446e");
    p.outline("#22242c");
  },
  campfire(p) {
    // stones ring
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2;
      p.circle(16 + Math.cos(ang) * 12, 24 + Math.sin(ang) * 5, 2.4, a % 2 ? "#8c8f99" : "#a2a6b0");
    }
    // logs
    p.line(8, 27, 24, 21, "#7a5230", 3); p.line(8, 21, 24, 27, "#6b4a2e", 3);
    // flames
    p.poly([[9, 23], [12, 10], [15, 16], [17, 4], [20, 15], [22, 11], [24, 23]], "#ff8a2a");
    p.poly([[12, 23], [14, 14], [16, 18], [18, 9], [20, 23]], "#ffc94a");
    p.poly([[14, 23], [16, 17], [18, 23]], "#fff3b0");
    p.outline("#2a1a14");
  },

  // ---------------- dungeon ----------------
  crypt(p) {
    // facade blocks
    p.rect(4, 12, 40, 34, "#6a6280");
    for (let y = 12; y < 46; y += 5) {
      p.rect(4, y, 40, 1, "#4e4766");
      for (let x = 4 + ((y / 5) % 2) * 4; x < 44; x += 8) p.rect(x, y, 1, 5, "#4e4766");
    }
    // pediment
    p.poly([[1, 13], [24, 1], [47, 13]], "#7c7494"); p.rect(1, 12, 47, 2, "#544c6e");
    // pillars
    for (const x of [7, 36]) { p.rect(x, 14, 5, 32, "#8e86a8"); p.rect(x + 1, 14, 1, 32, "#a8a0c2"); p.rect(x - 1, 14, 7, 2, "#a8a0c2"); }
    // dark arched doorway + stairs going down
    p.rect(16, 24, 16, 22, "#120e1a"); p.circle(24, 24, 8, "#120e1a", { bottom: false });
    for (let i = 0; i < 4; i++) p.rect(18 + i, 36 + i * 3, 12 - i * 2, 1, "#3a3350");
    // skull keystone
    p.rect(21, 6, 6, 5, "#f6f1e4"); p.rect(22, 11, 4, 1, "#f6f1e4"); p.set(22, 8, "#120e1a"); p.set(25, 8, "#120e1a");
    // green glow at the bottom of the stairs
    p.shade((x, y, c) => c === "#120e1a" && y > 40 && noise(x, y) < 0.5, "#1e3a2a");
    p.outline("#0c0a12");
  },
  altar(p) {
    // altar block
    p.rect(8, 26, 32, 18, "#6a6280"); p.rect(6, 23, 36, 4, "#8e86a8"); p.rect(6, 23, 36, 1, "#a8a0c2");
    for (const y of [32, 38]) p.rect(8, y, 32, 1, "#4e4766");
    // cloth
    p.rect(16, 27, 16, 12, "#7e1e2c"); p.poly([[16, 39], [24, 44], [32, 39]], "#7e1e2c");
    p.rect(16, 27, 16, 1, "#c89a3c"); p.rect(23, 30, 2, 6, "#c89a3c"); p.rect(21, 32, 6, 2, "#c89a3c");
    // orb
    p.circle(24, 15, 6, "#7c4ed8"); p.circle(23, 14, 4, "#b07cff"); p.rect(21, 12, 2, 2, "#f0e0ff");
    p.rect(20, 21, 9, 2, "#c89a3c");
    // candles
    for (const x of [10, 15, 33, 38]) {
      const h = x === 15 || x === 33 ? 7 : 5;
      p.rect(x, 23 - h, 2, h, "#f2ead8"); p.rect(x, 21 - h, 2, 2, "#ffb030"); p.set(x, 20 - h, "#fff3b0");
    }
    p.outline("#0c0a12");
  },
  chest(p) {
    // Kept free of nested dark/light bands: those can fool a scanner into seeing
    // an extra finder pattern.
    for (const [x, y] of [[3, 27], [27, 26]]) { p.rect(x, y, 3, 2, "#f0c64a"); p.set(x, y, "#fde69a"); }
    p.rect(4, 14, 24, 13, "#9a5a2a");
    p.ellipse(16, 14, 12, 6, "#a8662f", { bottom: false });
    p.rect(4, 14, 24, 1, "#7a4620");
    for (const [x, y] of [[4, 25], [26, 25], [4, 14], [26, 14]]) p.rect(x, y, 2, 2, "#f0c64a");
    p.rect(14, 13, 4, 4, "#f0c64a"); p.set(15, 15, "#5a3418"); p.set(16, 15, "#5a3418");
    p.rect(7, 10, 5, 1, "#c8844a");
    p.outline("#2a1a10");
  },
  slime(p) {
    p.ellipse(16, 26, 13, 4, "#3f9a48");
    p.ellipse(16, 24, 13, 13, "#6cd36b", { bottom: false });
    p.rect(3, 24, 27, 4, "#6cd36b");
    p.ellipse(16, 27, 13, 2, "#3f9a48", { top: false });
    p.ellipse(11, 15, 3, 4, "#b8f0a0"); p.set(10, 13, "#ffffff");
    p.rect(12, 20, 2, 3, "#111111"); p.rect(19, 20, 2, 3, "#111111"); p.set(12, 20, "#ffffff"); p.set(19, 20, "#ffffff");
    p.rect(15, 24, 3, 1, "#2a6a30");
    p.outline("#14301a");
  },

  // ---------------- snow ----------------
  igloo(p) {
    p.ellipse(24, 44, 22, 3, "#d6e2f0");
    p.circle(24, 42, 21, "#f4f8ff", { bottom: false });
    // block courses
    for (let y = 24; y < 42; y += 5) p.shade((x, yy, c) => yy === y && c === "#f4f8ff", "#c8d6e8");
    for (let y = 21; y < 42; y += 5) for (let x = (y % 2) * 4; x < 48; x += 8) p.shade((xx, yy, c) => xx === x && yy >= y && yy < y + 5 && c === "#f4f8ff", "#c8d6e8");
    p.circle(17, 30, 6, "#ffffff", { bottom: false });
    // tunnel
    p.rect(15, 33, 18, 12, "#e8f0fa"); p.circle(24, 33, 9, "#e8f0fa", { bottom: false });
    p.rect(19, 36, 10, 9, "#2c3a50"); p.circle(24, 36, 5, "#2c3a50", { bottom: false });
    p.outline("#5a7090");
  },
  crevasse(p) {
    const path = [[3, 8], [10, 14], [8, 20], [17, 24], [16, 31], [26, 31], [30, 38], [38, 37], [45, 44]];
    const widths = [1, 3, 4, 6, 5, 6, 4, 3, 1];
    // icy lip
    for (let i = 0; i + 1 < path.length; i++) p.line(...path[i], ...path[i + 1], "#a9d2f0", widths[i] + 4);
    for (let i = 0; i + 1 < path.length; i++) p.line(...path[i], ...path[i + 1], "#5e8fbe", widths[i] + 2);
    for (let i = 0; i + 1 < path.length; i++) p.line(...path[i], ...path[i + 1], "#1a2a44", widths[i]);
    // side cracks
    p.line(17, 24, 24, 18, "#1a2a44"); p.line(30, 38, 29, 45, "#1a2a44"); p.line(8, 20, 2, 23, "#1a2a44");
    // ice shards
    for (const [x, y] of [[22, 22], [34, 33], [12, 26]]) { p.rect(x, y, 2, 2, "#ffffff"); p.set(x + 2, y + 1, "#d6ecff"); }
  },
  icehole(p) {
    p.ellipse(15, 20, 14, 9, "#bfe0f5"); p.ellipse(15, 19, 13, 8, "#d8eefc");
    p.ellipse(15, 20, 9, 5, "#1e3a5a"); p.ellipse(13, 19, 3, 1.5, "#3c6890");
    // rod + line
    p.line(30, 3, 22, 13, "#8a6a40", 2); p.line(22, 13, 17, 21, "#e8e8e8");
    // fish on the ice
    p.ellipse(26, 28, 3.5, 2, "#f08a3a"); p.poly([[29, 28], [31, 26], [31, 30]], "#f08a3a"); p.set(24, 27, "#111111");
    p.outline("#5a7090");
  },
  rock(p) {
    p.poly([[3, 29], [5, 15], [12, 7], [22, 6], [28, 14], [30, 29]], "#7a8490");
    p.poly([[16, 29], [22, 12], [28, 14], [30, 29]], "#5e6874");
    p.line(10, 22, 15, 26, "#5e6874"); p.line(20, 20, 18, 25, "#4c5560");
    // snow cap
    p.poly([[5, 16], [12, 7], [22, 6], [28, 14], [24, 15], [20, 12], [15, 15], [9, 14]], "#f4f8ff");
    p.rect(13, 8, 4, 1, "#ffffff");
    p.ellipse(16, 30, 15, 2, "#dde8f3");
    p.outline("#2e3640");
  },
};
