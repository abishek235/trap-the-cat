// Dependency-free browser game: Trap the Cat on a hex grid.

const VERSION = "0.1.4";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d", { alpha: false });
const resetBtn = document.getElementById("resetBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsDropdown = document.getElementById("settingsDropdown");
const toastEl = document.getElementById("toast");

const boardInfoEl = document.getElementById("boardInfo");
const blockedInfoEl = document.getElementById("blockedInfo");
const turnInfoEl = document.getElementById("turnInfo");
const versionTextEl = document.getElementById("versionText");

// Theme handling
const themeRadios = document.querySelectorAll('input[name="theme"]');

// Canvas colors based on theme
const canvasColors = {
  dark: {
    bg: "#070b16",
    gridGlow: "rgba(124, 92, 255, 0.08)",
    tileBase: "rgba(255,255,255,0.07)",
    tileEdge: "rgba(255,255,255,0.10)",
    tileBlocked: "rgba(0,0,0,0.72)",
    tileBlockedStroke: "rgba(255,255,255,0.07)",
    catBody: "#f2f3ff",
    catShadow: "rgba(0,0,0,0.55)",
    catGlow: "rgba(124, 92, 255, 0.55)",
    catEarInner: "rgba(255, 77, 109, 0.35)",
    catFace: "#0b1020",
    catNose: "rgba(255, 77, 109, 0.80)",
  },
  bright: {
    bg: "#fdfbf7",
    gridGlow: "rgba(255, 220, 100, 0.4)",
    tileBase: "rgba(0, 0, 0, 0.05)",
    tileEdge: "rgba(0, 0, 0, 0.1)",
    tileBlocked: "rgba(139, 90, 43, 0.85)",
    tileBlockedStroke: "rgba(100, 60, 25, 0.9)",
    catBody: "#8b5a2b", /* Brown cat */
    catShadow: "rgba(0,0,0,0.2)",
    catGlow: "rgba(139, 90, 43, 0.5)",
    catEarInner: "rgba(244, 194, 194, 0.8)",
    catFace: "#3e2723",
    catNose: "#d84315",
  },
};

function getCanvasColors() {
  const isBright = document.documentElement.getAttribute("data-theme") === "bright";
  return isBright ? canvasColors.bright : canvasColors.dark;
}

function setTheme(theme) {
  if (theme === "bright") {
    document.documentElement.setAttribute("data-theme", "bright");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem("theme", theme);
  } catch (err) {
    console.warn("Could not save theme to localStorage", err);
  }
  // Re-render canvas with new colors
  requestAnimationFrame(() => render());
}

// Load saved theme
let savedTheme = null;
try {
  savedTheme = localStorage.getItem("theme");
} catch (err) {
  console.warn("Could not read theme from localStorage", err);
}
if (savedTheme) {
  setTheme(savedTheme);
  themeRadios.forEach((radio) => {
    radio.checked = radio.value === savedTheme;
  });
}

// Settings dropdown toggle
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isShowing = settingsDropdown.classList.toggle("show");
  settingsBtn.setAttribute("aria-expanded", isShowing);
});

// Close dropdown when clicking outside
document.addEventListener("click", () => {
  settingsDropdown.classList.remove("show");
  settingsBtn.setAttribute("aria-expanded", "false");
});

settingsDropdown.addEventListener("click", (e) => {
  e.stopPropagation();
});

// Theme radio change handler
themeRadios.forEach((radio) => {
  radio.addEventListener("change", (e) => {
    setTheme(e.target.value);
    settingsDropdown.classList.remove("show");
    settingsBtn.setAttribute("aria-expanded", "false");
  });
});

/** @typedef {{q:number, r:number}} Hex */

const DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const state = {
  radius: 6, // total width is 2*radius+1 in "axial" rows
  blocked: new Set(), // key "q,r"
  cat: { q: 0, r: 0 },
  catAnim: null, // {from:{x,y}, to:{x,y}, startMs:number, durationMs:number}
  zoom: 1, // user-controlled zoom (pinch)
  turns: 0,
  over: false,
  overReason: "",
  pixelRatio: 1,
  layout: {
    size: 18, // computed
    originX: 0,
    originY: 0,
  },
  gesture: {
    pinching: false,
    startDist: 0,
    startZoom: 1,
    startCenter: { x: 0, y: 0 },
    panning: false,
  },
  camera: {
    offsetX: 0,
    offsetY: 0,
  },
  tap: {
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startMs: 0,
  },
};

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function keyOf(h) {
  return `${h.q},${h.r}`;
}

function eq(a, b) {
  return a.q === b.q && a.r === b.r;
}

function add(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}

function hexDistance(a, b) {
  // axial distance
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (a.q + a.r) - (b.q + b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

function isInside(h) {
  // For axial coords, hex is inside radius N if max(|q|,|r|,|q+r|) <= N
  const s = h.q + h.r;
  return Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(s)) <= state.radius;
}

function isEdge(h) {
  const s = h.q + h.r;
  return Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(s)) === state.radius;
}

function neighbors(h) {
  const out = [];
  for (const d of DIRS) {
    const n = add(h, d);
    if (!isInside(n)) continue;
    out.push(n);
  }
  return out;
}

function allHexes() {
  const out = [];
  for (let q = -state.radius; q <= state.radius; q++) {
    for (let r = -state.radius; r <= state.radius; r++) {
      const h = { q, r };
      if (isInside(h)) out.push(h);
    }
  }
  return out;
}

function isBlocked(h) {
  return state.blocked.has(keyOf(h));
}

function isWalkable(h) {
  return isInside(h) && !isBlocked(h) && !eq(h, state.cat);
}

function resizeCanvasToDisplaySize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  state.pixelRatio = dpr;

  // Compute layout: pointy-top hexes
  const padding = 18 * dpr;
  const availW = canvas.width - padding * 2;
  const availH = canvas.height - padding * 2;

  // approximate span of a radius-N hex board for pointy-top:
  // width ~ sqrt(3) * size * (2N+1)
  // height ~ 1.5 * size * (2N+1)
  const cols = 2 * state.radius + 1;
  const maxSizeW = availW / (Math.sqrt(3) * cols);
  const maxSizeH = availH / (1.5 * cols);
  const baseSize = Math.max(10 * dpr, Math.floor(Math.min(maxSizeW, maxSizeH)));
  const size = Math.floor(baseSize * state.zoom);

  state.layout.size = size;
  state.layout.originX = Math.floor(canvas.width / 2);
  state.layout.originY = Math.floor(canvas.height / 2);
}

function hexToPixel(h) {
  const size = state.layout.size;
  const x = size * Math.sqrt(3) * (h.q + h.r / 2);
  const y = size * 1.5 * h.r;
  return {
    x: state.layout.originX + state.camera.offsetX + x,
    y: state.layout.originY + state.camera.offsetY + y,
  };
}

function pixelToHex(px, py) {
  // Invert pointy-top axial conversion, then round to nearest hex.
  const size = state.layout.size;
  const x = (px - (state.layout.originX + state.camera.offsetX)) / size;
  const y = (py - (state.layout.originY + state.camera.offsetY)) / size;

  const q = (Math.sqrt(3) / 3) * x + (-1 / 3) * y;
  const r = (2 / 3) * y;
  return hexRound({ q, r });
}

function hexRound(frac) {
  // Convert axial to cube, round, then back.
  let x = frac.q;
  let z = frac.r;
  let y = -x - z;

  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);

  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  return { q: rx, r: rz };
}

function drawHex(centerX, centerY, size, fillStyle, strokeStyle, strokeWidth) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top
    const x = centerX + size * Math.cos(angle);
    const y = centerY + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();
}

function drawCat(x, y, size, jumpT) {
  // "Jump" look: small vertical arc + squash/stretch
  const t = clamp01(jumpT ?? 0);
  const arc = Math.sin(Math.PI * t); // 0->1->0
  const jumpY = -arc * size * 0.25;
  const stretch = 1 + arc * 0.12;
  const squash = 1 - arc * 0.10;

  const cx = x;
  const cy = y + jumpY;
  const s = size;

  const colors = getCanvasColors();

  // shadow on tile
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = colors.catShadow;
  ctx.beginPath();
  ctx.ellipse(cx, y + s * 0.35, s * 0.45 * squash, s * 0.18 * squash, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // body + head (simple cute cat)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, stretch);

  const bodyR = s * 0.34;
  const headR = s * 0.30;

  // glow
  ctx.save();
  ctx.shadowColor = colors.catGlow;
  ctx.shadowBlur = Math.floor(14 * state.pixelRatio);
  ctx.fillStyle = colors.catBody;

  // body
  ctx.beginPath();
  ctx.ellipse(0, s * 0.16, bodyR * 1.05, bodyR * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();

  // head
  ctx.beginPath();
  ctx.arc(0, -s * 0.08, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ears
  ctx.fillStyle = colors.catBody;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.72, -s * 0.18);
  ctx.lineTo(-headR * 0.25, -s * 0.48);
  ctx.lineTo(-headR * 0.02, -s * 0.20);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(headR * 0.72, -s * 0.18);
  ctx.lineTo(headR * 0.25, -s * 0.48);
  ctx.lineTo(headR * 0.02, -s * 0.20);
  ctx.closePath();
  ctx.fill();

  // inner ears
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = colors.catEarInner;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.52, -s * 0.22);
  ctx.lineTo(-headR * 0.26, -s * 0.40);
  ctx.lineTo(-headR * 0.10, -s * 0.22);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(headR * 0.52, -s * 0.22);
  ctx.lineTo(headR * 0.26, -s * 0.40);
  ctx.lineTo(headR * 0.10, -s * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // tail
  ctx.save();
  ctx.strokeStyle = colors.catBody;
  ctx.lineWidth = Math.max(2, Math.floor(s * 0.08));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bodyR * 0.80, s * 0.18);
  ctx.quadraticCurveTo(bodyR * 1.15, s * 0.00 - arc * s * 0.10, bodyR * 0.95, -s * 0.12);
  ctx.stroke();
  ctx.restore();

  // face
  ctx.fillStyle = colors.catFace;
  ctx.globalAlpha = 0.90;
  const eyeOffsetX = s * 0.12;
  const eyeOffsetY = -s * 0.10;
  const eyeR = Math.max(2, Math.floor(s * 0.055));
  ctx.beginPath();
  ctx.arc(-eyeOffsetX, eyeOffsetY, eyeR, 0, Math.PI * 2);
  ctx.arc(eyeOffsetX, eyeOffsetY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // nose
  ctx.globalAlpha = 0.70;
  ctx.fillStyle = colors.catNose;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.02);
  ctx.lineTo(-s * 0.03, s * 0.03);
  ctx.lineTo(s * 0.03, s * 0.03);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function clearToast() {
  toastEl.className = "toast";
  toastEl.textContent = "";
}

function showToast(msg, variant) {
  toastEl.textContent = msg;
  toastEl.className = `toast toast--show ${variant ? `toast--${variant}` : ""}`.trim();
}

function updateStats() {
  const total = allHexes().length;
  const blocked = state.blocked.size;
  boardInfoEl.textContent = `radius ${state.radius} • ${total} tiles`;
  blockedInfoEl.textContent = `${blocked}`;
  turnInfoEl.textContent = `${state.turns}`;
}

function render() {
  resizeCanvasToDisplaySize();
  clearToast();

  const colors = getCanvasColors();

  // background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // subtle grid glow
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = colors.gridGlow;
  ctx.beginPath();
  ctx.arc(state.layout.originX, state.layout.originY, state.layout.size * (state.radius * 4.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const size = state.layout.size;
  const tiles = allHexes();

  for (const h of tiles) {
    const p = hexToPixel(h);
    const blocked = isBlocked(h);
    const onEdge = isEdge(h);
    const base = onEdge ? colors.tileEdge : colors.tileBase;
    const fill = blocked ? colors.tileBlocked : base;
    const stroke = blocked ? colors.tileBlockedStroke : colors.tileEdge;
    drawHex(p.x, p.y, size - 1, fill, stroke, Math.max(1, Math.floor(1 * state.pixelRatio)));
  }

  // cat
  let catX;
  let catY;
  let jumpT = 0;
  if (state.catAnim) {
    const now = performance.now();
    const t = clamp01((now - state.catAnim.startMs) / state.catAnim.durationMs);
    const e = easeOutCubic(t);
    catX = mix(state.catAnim.from.x, state.catAnim.to.x, e);
    catY = mix(state.catAnim.from.y, state.catAnim.to.y, e);
    jumpT = t;
  } else {
    const catP = hexToPixel(state.cat);
    catX = catP.x;
    catY = catP.y;
  }

  drawCat(catX, catY, size, jumpT);

  // end state toast
  if (state.over) {
    showToast(state.overReason, state.overReason.includes("escaped") ? "lose" : "win");
  }

  updateStats();

  if (state.catAnim) {
    const now = performance.now();
    const done = now - state.catAnim.startMs >= state.catAnim.durationMs;
    if (done) {
      const onDone = state.catAnim.onDone;
      state.catAnim = null;
      if (typeof onDone === "function") onDone();
      requestAnimationFrame(() => render());
      return;
    }
    requestAnimationFrame(() => render());
  }
}

function startCatJump(toHex, onDone) {
  const fromP = hexToPixel(state.cat);
  const toP = hexToPixel(toHex);
  state.catAnim = {
    from: { x: fromP.x, y: fromP.y },
    to: { x: toP.x, y: toP.y },
    startMs: performance.now(),
    durationMs: 180,
    onDone,
  };
  requestAnimationFrame(() => render());
}

function pickInitialBlocked() {
  state.blocked.clear();

  const tiles = allHexes().filter((h) => !eq(h, state.cat));
  const target = Math.floor(tiles.length * 0.12); // ~12% blocked

  // shuffle-ish by random sampling
  let attempts = 0;
  while (state.blocked.size < target && attempts < target * 20) {
    attempts++;
    const h = tiles[Math.floor(Math.random() * tiles.length)];
    if (eq(h, state.cat)) continue;
    if (isEdge(h) && Math.random() < 0.25) continue; // keep some edges open
    state.blocked.add(keyOf(h));
  }
}

function legalCatMoves() {
  return neighbors(state.cat).filter((n) => !isBlocked(n));
}

function computeCatStep() {
  if (isEdge(state.cat)) return { type: "escaped" };

  const moves = legalCatMoves();
  if (moves.length === 0) return { type: "trapped" };

  // Single optimized BFS from cat
  const frontier = [state.cat];
  const cameFrom = new Map();
  cameFrom.set(keyOf(state.cat), null);
  const dist = new Map();
  dist.set(keyOf(state.cat), 0);

  let minEdgeDist = Infinity;
  const bestEdges = [];

  let head = 0;
  while (head < frontier.length) {
    const current = frontier[head++];
    const d = dist.get(keyOf(current));

    if (d > minEdgeDist) break; // Found all shortest paths to edges

    if (isEdge(current)) {
      minEdgeDist = d;
      bestEdges.push(current);
      continue; // Stop expanding from this edge
    }

    for (const next of neighbors(current)) {
      if (isBlocked(next)) continue;
      const nk = keyOf(next);
      if (!cameFrom.has(nk)) {
        cameFrom.set(nk, current);
        dist.set(nk, d + 1);
        frontier.push(next);
      }
    }
  }

  if (bestEdges.length === 0) {
    return { type: "trapped_in" }; // Has moves, but no path to edge
  }

  // Tie-breaker: prefer edges further toward the pointy ends of the board
  let bestEdge = bestEdges[0];
  let bestScore = Math.abs(bestEdge.q) + Math.abs(bestEdge.r);
  for (let i = 1; i < bestEdges.length; i++) {
    const e = bestEdges[i];
    const score = Math.abs(e.q) + Math.abs(e.r);
    if (score > bestScore) {
      bestScore = score;
      bestEdge = e;
    }
  }

  // Backtrack from bestEdge to find the first step
  let step = bestEdge;
  let parent = cameFrom.get(keyOf(step));
  while (parent && !eq(parent, state.cat)) {
    step = parent;
    parent = cameFrom.get(keyOf(step));
  }

  return { type: "move", to: step };
}

function endGame(reason) {
  state.over = true;
  state.overReason = reason;
  render();
}

function catTurn() {
  const step = computeCatStep();

  if (step.type === "escaped") {
    endGame("Cat escaped. You lose.");
    return;
  }
  if (step.type === "trapped") {
    endGame("Cat is trapped. You win!");
    return;
  }
  if (step.type === "trapped_in") {
    endGame("Cat is trapped in. You win!");
    return;
  }

  if (step.type === "move") {
    const dest = step.to;
    startCatJump(dest, () => {
      state.cat = dest;
      if (isEdge(state.cat)) {
        endGame("Cat escaped. You lose.");
        return;
      }

      // Check if the cat became trapped as a result of its own move
      const nextStep = computeCatStep();
      if (!state.over && nextStep.type === "trapped_in") {
        endGame("Cat is trapped in. You win!");
      } else if (!state.over && nextStep.type === "trapped") {
        endGame("Cat is trapped. You win!");
      }
    });
  }
}

function playerBlock(h) {
  if (!isInside(h)) return;
  if (state.over) return;
  if (state.catAnim) return;
  if (eq(h, state.cat)) return;
  if (isBlocked(h)) return;

  state.blocked.add(keyOf(h));
  state.turns++;

  // cat responds
  catTurn();
  render();
}

function resetGame() {
  state.over = false;
  state.overReason = "";
  state.turns = 0;
  state.cat = { q: 0, r: 0 };
  state.catAnim = null;
  pickInitialBlocked();

  // if cat is already trapped, re-roll a few times
  for (let i = 0; i < 8; i++) {
    if (legalCatMoves().length > 0) break;
    pickInitialBlocked();
  }

  render();
}

function getEventCanvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  const clientX = evt.clientX ?? (evt.touches && evt.touches[0] && evt.touches[0].clientX);
  const clientY = evt.clientY ?? (evt.touches && evt.touches[0] && evt.touches[0].clientY);
  const x = (clientX - rect.left) * state.pixelRatio;
  const y = (clientY - rect.top) * state.pixelRatio;
  return { x, y };
}

function touchDistance(evt) {
  if (!evt.touches || evt.touches.length < 2) return 0;
  const rect = canvas.getBoundingClientRect();
  const t0 = evt.touches[0];
  const t1 = evt.touches[1];
  const x0 = (t0.clientX - rect.left) * state.pixelRatio;
  const y0 = (t0.clientY - rect.top) * state.pixelRatio;
  const x1 = (t1.clientX - rect.left) * state.pixelRatio;
  const y1 = (t1.clientY - rect.top) * state.pixelRatio;
  return Math.hypot(x1 - x0, y1 - y0);
}

function touchCenter(evt) {
  if (!evt.touches || evt.touches.length < 2) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const t0 = evt.touches[0];
  const t1 = evt.touches[1];
  const x0 = (t0.clientX - rect.left) * state.pixelRatio;
  const y0 = (t0.clientY - rect.top) * state.pixelRatio;
  const x1 = (t1.clientX - rect.left) * state.pixelRatio;
  const y1 = (t1.clientY - rect.top) * state.pixelRatio;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}

function onPointer(evt) {
  if (state.gesture.pinching) return;
  evt.preventDefault?.();
  const p = getEventCanvasPoint(evt);
  const h = pixelToHex(p.x, p.y);
  if (!isInside(h)) return;

  // basic "hit radius": if user clicks far outside the hex center, ignore
  const hp = hexToPixel(h);
  const dx = p.x - hp.x;
  const dy = p.y - hp.y;
  const dist = Math.hypot(dx, dy);
  if (dist > state.layout.size * 0.98) return;

  playerBlock(h);
}

resetBtn.addEventListener("click", () => resetGame());

canvas.addEventListener("click", onPointer, { passive: false });

function endPinch() {
  state.gesture.pinching = false;
  state.gesture.startDist = 0;
  state.gesture.panning = false;
}

canvas.addEventListener(
  "touchstart",
  (evt) => {
    // Two-finger gesture: pinch zoom + pan
    if (evt.touches && evt.touches.length >= 2) {
      evt.preventDefault();
      state.tap.active = false;
      state.gesture.pinching = true;
      state.gesture.panning = true;
      state.gesture.startDist = touchDistance(evt);
      state.gesture.startZoom = state.zoom;
      state.gesture.startCenter = touchCenter(evt);
      return;
    }

    // Single-finger: start a tap candidate (we'll commit on touchend)
    if (!evt.touches || evt.touches.length !== 1) return;
    const p = getEventCanvasPoint(evt);
    state.tap.active = true;
    state.tap.moved = false;
    state.tap.startX = p.x;
    state.tap.startY = p.y;
    state.tap.lastX = p.x;
    state.tap.lastY = p.y;
    state.tap.startMs = performance.now();
  },
  { passive: false },
);

canvas.addEventListener(
  "touchmove",
  (evt) => {
    if (state.gesture.pinching && evt.touches && evt.touches.length >= 2) {
      evt.preventDefault();
      const d = touchDistance(evt);
      const c = touchCenter(evt);

      if (state.gesture.startDist > 0) {
        const ratio = d / state.gesture.startDist;
        state.zoom = clamp(state.gesture.startZoom * ratio, 0.75, 2.25);
      }

      // two-finger pan: move camera by centroid delta
      const dx = c.x - state.gesture.startCenter.x;
      const dy = c.y - state.gesture.startCenter.y;
      state.camera.offsetX += dx;
      state.camera.offsetY += dy;
      state.gesture.startCenter = c;

      render();
      return;
    }

    if (state.tap.active && evt.touches && evt.touches.length === 1) {
      const p = getEventCanvasPoint(evt);
      state.tap.lastX = p.x;
      state.tap.lastY = p.y;
      const moved = Math.hypot(p.x - state.tap.startX, p.y - state.tap.startY);
      if (moved > 10 * state.pixelRatio) state.tap.moved = true;
    }
  },
  { passive: false },
);

canvas.addEventListener(
  "touchend",
  (evt) => {
    // If multi-touch gesture ended
    if (state.gesture.pinching) {
      if (!evt.touches || evt.touches.length < 2) endPinch();
      return;
    }

    // Commit tap on finger up if it was a quick, small-move touch.
    if (!state.tap.active) return;
    const dt = performance.now() - state.tap.startMs;
    const moved = Math.hypot(state.tap.lastX - state.tap.startX, state.tap.lastY - state.tap.startY);
    const okTap = !state.tap.moved && moved <= 10 * state.pixelRatio && dt <= 450;
    state.tap.active = false;
    if (!okTap) return;
    if (state.over || state.catAnim) return;

    const h = pixelToHex(state.tap.lastX, state.tap.lastY);
    if (!isInside(h)) return;
    const hp = hexToPixel(h);
    const dist = Math.hypot(state.tap.lastX - hp.x, state.tap.lastY - hp.y);
    if (dist > state.layout.size * 0.98) return;
    playerBlock(h);
  },
  { passive: false },
);

canvas.addEventListener(
  "touchcancel",
  () => {
    state.tap.active = false;
    endPinch();
  },
  { passive: true },
);

window.addEventListener("resize", () => render());

if (versionTextEl) versionTextEl.textContent = `v${VERSION}`;
resetGame();
