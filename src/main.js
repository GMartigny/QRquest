import "@fontsource/press-start-2p";
import "./style.css";
import { analyzeTileset } from "./tileset.js";

const $ = (sel) => document.querySelector(sel);
const canvas = $("#qr");
const ctx = canvas.getContext("2d");
const textEl = $("#text");
const errorEl = $("#error");
const worldsEl = $("#themes");
const PREVIEW_SCALE = 1; // strict ×1 preview (CSS only shrinks it when space runs out)
const API = "/api/qr";
const MAX_UPLOAD = 4 * 1024 * 1024; // the API refuses bigger tilesets

const store = {
  get(key, fallback) { try { return localStorage.getItem(`qrquest.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`qrquest.${key}`, value); } catch { /* storage unavailable */ } },
};

const state = {
  world: Number(store.get("theme", 0)) || 0,
  ecl: store.get("ecl", "Q"),
  seed: 1,
  rendered: false,
  tileset: null,  // analysed locally: world list, accents, contrast warnings
  upload: null,   // { file, names } when a custom tileset is used (sent to the API)
};
textEl.value = store.get("text", textEl.value);


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

function useTileset({ tileset }, upload = null) {
  state.tileset = tileset;
  state.upload = upload;
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

// Ask the API for the PNG (GET with the default tileset, POST with a custom one)
function request(scale, signal) {
  const params = new URLSearchParams({
    text: textEl.value, world: state.world, ecl: state.ecl, seed: state.seed, scale,
  });
  if (!state.upload) return fetch(`${API}?${params}`, { signal });
  if (state.upload.names) params.set("names", state.upload.names.join(","));
  return fetch(`${API}?${params}`, {
    method: "POST", body: state.upload.file, headers: { "Content-Type": "image/png" }, signal,
  });
}

async function readError(res) {
  try { return (await res.json()).error; } catch { return `Erreur ${res.status}`; }
}

let pending = null;
async function render() {
  if (!state.tileset) return;
  const text = textEl.value;
  if (!text) return showError("Il faut un message pour lancer la quête.");
  pending?.abort();
  const controller = (pending = new AbortController());
  try {
    const res = await request(PREVIEW_SCALE, controller.signal);
    if (!res.ok) return showError(await readError(res));
    const bitmap = await createImageBitmap(await res.blob());
    if (controller.signal.aborted) return;
    showError("");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.style.setProperty("--qr-size", `${bitmap.width / PREVIEW_SCALE}px`);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    canvas.classList.add("on"); // first draw switches the "CRT" on (animation runs once)
    state.rendered = true;
    canvas.setAttribute("aria-label", `QR code : ${text}`);
    const n = res.headers.get("X-QR-Modules");
    $("#hud-level").textContent = `NIV. ${res.headers.get("X-QR-Version")}`;
    $("#hud-size").textContent = `${n}×${n}`;
    store.set("text", text);
    store.set("theme", state.world);
    store.set("ecl", state.ecl);
  } catch (err) {
    if (err.name !== "AbortError") showError("Impossible de joindre l'API de rendu.");
  }
}

// typing: wait for a short pause before calling the API
let typingTimer;
const renderSoon = () => { clearTimeout(typingTimer); typingTimer = setTimeout(render, 250); };

textEl.addEventListener("input", renderSoon);

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

$("#download").addEventListener("click", async () => {
  if (!state.rendered) return;
  const button = $("#download");
  button.disabled = true;
  try {
    const res = await request(Number($("#scale").value));
    if (!res.ok) return showError(await readError(res));
    const name = state.tileset.worlds[state.world].label
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = `qrquest-${name}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {
    showError("Impossible de joindre l'API de rendu.");
  } finally {
    button.disabled = false;
  }
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
  if (png.size > MAX_UPLOAD) return showError("Tileset trop lourd : 4 Mo maximum.");
  const url = URL.createObjectURL(png);
  try {
    const manifest = json ? JSON.parse(await json.text()) : {};
    const loaded = await loadTileset(url, manifest);
    URL.revokeObjectURL(url);
    useTileset(loaded, { file: png, names: manifest.worlds || null });
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
