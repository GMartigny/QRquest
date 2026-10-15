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

const sheet = new Image();

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

// Load the spritesheet + optional names, then discover its worlds.
async function loadTileset() {
  sheet.src = "/tiles.png";
  const manifest = fetch("/tiles.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  await sheet.decode();
  const probe = document.createElement("canvas");
  probe.width = sheet.naturalWidth;
  probe.height = sheet.naturalHeight;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  pctx.drawImage(sheet, 0, 0);
  const pixels = pctx.getImageData(0, 0, probe.width, probe.height);
  return analyzeTileset(pixels, await manifest);
}

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
  canvas.width = canvas.height = map.size;
  drawMap(ctx, map, sheet, 1);
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

syncButtons();
loadTileset()
  .then((tileset) => {
    state.tileset = tileset;
    state.world = Math.min(state.world, tileset.worlds.length - 1);
    buildWorldButtons();
    syncButtons();
    render();
  })
  .catch((err) => showError(`Tileset invalide : ${err.message}`));
