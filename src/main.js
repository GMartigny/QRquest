import "@fontsource/press-start-2p";
import "./style.css";
import { buildMap, drawMap } from "./qrmap.js";
import { THEMES } from "./tileset.js";

const $ = (sel) => document.querySelector(sel);
const canvas = $("#qr");
const ctx = canvas.getContext("2d");
const textEl = $("#text");
const errorEl = $("#error");

const store = {
  get(key, fallback) { try { return localStorage.getItem(`qrquest.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`qrquest.${key}`, value); } catch { /* storage unavailable */ } },
};

const state = {
  theme: Math.min(Number(store.get("theme", 0)) || 0, THEMES.length - 1),
  ecl: store.get("ecl", "Q"),
  props: store.get("props", "0.07"),
  seed: 1,
  map: null,
};
textEl.value = store.get("text", textEl.value);

const sheet = new Image();
sheet.src = "/tiles.png";

// Theme buttons
const themesEl = $("#themes");
THEMES.forEach((t, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = t.label;
  b.dataset.theme = i;
  themesEl.append(b);
});

function syncButtons() {
  themesEl.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.theme) === state.theme));
  $("#ecl").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ecl === state.ecl));
  $("#props").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.props === state.props));
  document.body.dataset.theme = THEMES[state.theme].id;
}

function render() {
  if (!sheet.complete || !sheet.naturalWidth) return;
  const text = textEl.value;
  errorEl.hidden = true;
  if (!text) {
    errorEl.textContent = "Il faut un message pour lancer la quête.";
    errorEl.hidden = false;
    return;
  }
  try {
    state.map = buildMap(text, { ecl: state.ecl, theme: state.theme, seed: state.seed, props: Number(state.props) });
  } catch {
    errorEl.textContent = "Message trop long pour ce niveau de résistance.";
    errorEl.hidden = false;
    return;
  }
  const { map } = state;
  canvas.width = canvas.height = map.size;
  drawMap(ctx, map, sheet, 1);
  canvas.setAttribute("aria-label", `QR code : ${text}`);
  $("#hud-level").textContent = `NIV. ${map.version}`;
  $("#hud-size").textContent = `${map.n}×${map.n}`;
  store.set("text", text);
  store.set("theme", state.theme);
  store.set("ecl", state.ecl);
  store.set("props", state.props);
}

sheet.addEventListener("load", render);
textEl.addEventListener("input", render);

themesEl.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.theme = Number(b.dataset.theme);
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

$("#props").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.props = b.dataset.props;
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
  out.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qrquest-${THEMES[state.theme].id}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, "image/png");
});

syncButtons();
render();
