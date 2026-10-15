import "@fontsource/press-start-2p";
import "./style.css";
import { buildMap, drawMap } from "./qrmap.js";
import { analyzeTileset } from "./tileset.js";

const $ = (sel) => document.querySelector(sel);
const canvas = $("#qr");
const ctx = canvas.getContext("2d");
const textEl = $("#text");
const errorEl = $("#error");
const worldsEl = $("#themes");
const PREVIEW_SCALE = 2;

const store = {
  get(key, fallback) { try { return localStorage.getItem(`qrquest.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`qrquest.${key}`, value); } catch { /* storage unavailable */ } },
};

const state = {
  world: Number(store.get("theme", 0)) || 0,
  ecl: store.get("ecl", "Q"),
  seed: 1,
  map: null,
  tileset: null,
};
textEl.value = store.get("text", textEl.value);

let sheet = null; // current spritesheet image

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

// Load a spritesheet (URL) + optional names, then discover its worlds.
async function loadTileset(src, manifest = {}) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const probe = document.createElement("canvas");
  probe.width = image.naturalWidth;
  probe.height = image.naturalHeight;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(image, 0, 0);
  const pixels = pctx.getImageData(0, 0, probe.width, probe.height);
  return { image, tileset: analyzeTileset(pixels, await manifest) };
}

function useTileset({ image, tileset }) {
  sheet = image;
  state.tileset = tileset;
  state.world = Math.min(state.world, tileset.worlds.length - 1);
  buildWorldButtons();
  syncButtons();
  render();
}

const defaultTileset = () => loadTileset(
  "/tiles.png",
  fetch("/tiles.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
);

function buildWorldButtons() {
  worldsEl.replaceChildren(...state.tileset.worlds.map((w) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = w.label;
    b.dataset.world = w.index;
    return b;
  }));
}

function syncButtons() {
  worldsEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.world) === state.world));
  $("#ecl").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ecl === state.ecl));
  const world = state.tileset?.worlds[state.world];
  if (world) document.documentElement.style.setProperty("--theme", world.accent);
}

function render() {
  if (!state.tileset) return;
  const text = textEl.value;
  if (!text) return showError("Il faut un message pour lancer la quête.");
  try {
    state.map = buildMap(text, { tileset: state.tileset, world: state.world, ecl: state.ecl, seed: state.seed });
  } catch {
    return showError("Message trop long pour ce niveau de résistance.");
  }
  showError("");
  const { map } = state;
  // drawn at ×2; CSS shows it at ×1 on mobile, ×2 on desktop (see --qr-size)
  canvas.width = canvas.height = map.size * PREVIEW_SCALE;
  canvas.style.setProperty("--qr-size", `${map.size}px`);
  drawMap(ctx, map, sheet, PREVIEW_SCALE);
  canvas.classList.add("on"); // first draw switches the "CRT" on (animation runs once)
  canvas.setAttribute("aria-label", `QR code : ${text}`);
  $("#hud-level").textContent = `NIV. ${map.version}`;
  $("#hud-size").textContent = `${map.n}×${map.n}`;
  store.set("text", text);
  store.set("theme", state.world);
  store.set("ecl", state.ecl);
}

textEl.addEventListener("input", render);

worldsEl.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.world = Number(b.dataset.world);
  syncButtons();
  render();
});

$("#ecl").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.ecl = b.dataset.ecl;
  syncButtons();
  render();
});

$("#reroll").addEventListener("click", () => {
  state.seed = Math.floor(Math.random() * 1e9);
  render();
});

$("#download").addEventListener("click", () => {
  if (!state.map) return;
  const scale = Number($("#scale").value);
  const out = document.createElement("canvas");
  out.width = out.height = state.map.size * scale;
  drawMap(out.getContext("2d"), state.map, sheet, scale);
  const name = state.tileset.worlds[state.world].label
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  out.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qrquest-${name}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
});

// ---------- custom tileset ----------
const fileEl = $("#tileset-file");
const tilesetNameEl = $("#tileset-name");
const resetEl = $("#tileset-reset");

const warningsEl = $("#tileset-warnings");

function describe(tileset, name) {
  const n = tileset.worlds.length;
  tilesetNameEl.textContent = `${name} · ${n} monde${n > 1 ? "s" : ""} · tuiles ${tileset.tile}px`;
  // Contrast check between the average dark (walls) and light (ground) tiles
  const issues = tileset.worlds.filter((w) => w.contrast.level !== "good").map((w) => {
    const { delta, dark, light, inverted, level } = w.contrast;
    const li = document.createElement("li");
    li.className = level;
    li.textContent = inverted
      ? `⚠ ${w.label} : les murs (${dark}) sont plus clairs que le sol (${light}). Le QR sera inversé, beaucoup de lecteurs le refuseront.`
      : `⚠ ${w.label} : contraste ${level === "bad" ? "insuffisant" : "faible"} entre murs et sol (écart ${delta}/255, conseillé ≥ 140). Le QR risque de ne pas se lire.`;
    return li;
  });
  warningsEl.replaceChildren(...issues);
  warningsEl.hidden = !issues.length;
}

// the visible "Charger" label opens the hidden file input from the keyboard too
document.querySelector('label[for="tileset-file"]').addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileEl.click(); }
});

fileEl.addEventListener("change", async () => {
  const files = [...fileEl.files];
  fileEl.value = "";
  const png = files.find((f) => f.type.startsWith("image/"));
  const json = files.find((f) => f.name.endsWith(".json"));
  if (!png) return showError("Choisis une image PNG (et éventuellement son fichier .json de noms).");
  const url = URL.createObjectURL(png);
  try {
    const manifest = json ? JSON.parse(await json.text()) : {};
    const loaded = await loadTileset(url, manifest);
    useTileset(loaded);
    describe(loaded.tileset, png.name);
    resetEl.hidden = false;
  } catch (err) {
    URL.revokeObjectURL(url);
    showError(`Tileset invalide : ${err.message}`);
  }
});

resetEl.addEventListener("click", async () => {
  const loaded = await defaultTileset();
  useTileset(loaded);
  describe(loaded.tileset, "Par défaut");
  resetEl.hidden = true;
});

syncButtons();
defaultTileset()
  .then((loaded) => { useTileset(loaded); describe(loaded.tileset, "Par défaut"); })
  .catch((err) => showError(`Tileset invalide : ${err.message}`));
