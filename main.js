// Dependency-free browser game: Trap the Cat on a hex grid.

const VERSION = "0.1.1";

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d", { alpha: false });
const resetBtn = document.getElementById("resetBtn");
const toastEl = document.getElementById("toast");

const boardInfoEl = document.getElementById("boardInfo");
const blockedInfoEl = document.getElementById("blockedInfo");
const turnInfoEl = document.getElementById("turnInfo");
const versionTextEl = document.getElementById("versionText");

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
    x: state.layout.originX + x,
    y: state.layout.originY + y,
  };
}

function pixelToHex(px, py) {
  // Invert pointy-top axial conversion, then round to nearest hex.
  const size = state.layout.size;
  const x = (px - state.layout.originX) / size;
  const y = (py - state.layout.originY) / size;

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

  // shadow on tile
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
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
  ctx.shadowColor = "rgba(124, 92, 255, 0.55)";
  ctx.shadowBlur = Math.floor(14 * state.pixelRatio);
  ctx.fillStyle = "#f2f3ff";

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
  ctx.fillStyle = "#f2f3ff";
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
  ctx.fillStyle = "rgba(255, 77, 109, 0.35)";
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
  ctx.strokeStyle = "#f2f3ff";
  ctx.lineWidth = Math.max(2, Math.floor(s * 0.08));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bodyR * 0.80, s * 0.18);
  ctx.quadraticCurveTo(bodyR * 1.15, s * 0.00 - arc * s * 0.10, bodyR * 0.95, -s * 0.12);
  ctx.stroke();
  ctx.restore();

  // face
  ctx.fillStyle = "#0b1020";
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
  ctx.fillStyle = "rgba(255, 77, 109, 0.80)";
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

  // background
  ctx.fillStyle = "#070b16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // subtle grid glow
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = "rgba(124, 92, 255, 0.08)";
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
    const base = onEdge ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.07)";
    const fill = blocked ? "rgba(0,0,0,0.72)" : base;
    const stroke = blocked ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.10)";
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

function bfsDistancesFrom(start) {
  /** @type {Map<string, number>} */
  const dist = new Map();
  const q = [start];
  dist.set(keyOf(start), 0);
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const curD = dist.get(keyOf(cur));
    for (const n of neighbors(cur)) {
      const nk = keyOf(n);
      if (dist.has(nk)) continue;
      if (isBlocked(n)) continue;
      dist.set(nk, curD + 1);
      q.push(n);
    }
  }
  return dist;
}

function canCatReachAnyEdge() {
  if (isEdge(state.cat)) return true;
  const dist = bfsDistancesFrom(state.cat);
  for (const h of allHexes()) {
    if (!isEdge(h)) continue;
    if (isBlocked(h)) continue;
    if (dist.has(keyOf(h))) return true;
  }
  return false;
}

function computeCatStep() {
  // If already on edge: escaped.
  if (isEdge(state.cat)) return { type: "escaped" };

  const moves = legalCatMoves();
  if (moves.length === 0) return { type: "trapped" };

  // Find nearest edge via BFS from cat.
  const dist = bfsDistancesFrom(state.cat);
  let bestEdge = null;
  let bestD = Infinity;

  for (const h of allHexes()) {
    if (!isEdge(h)) continue;
    if (isBlocked(h)) continue;
    const d = dist.get(keyOf(h));
    if (d == null) continue;
    if (d < bestD) {
      bestD = d;
      bestEdge = h;
    } else if (d === bestD && bestEdge) {
      // tie-break: closer (as-the-crow-flies) to center line
      const a = Math.abs(h.q) + Math.abs(h.r);
      const b = Math.abs(bestEdge.q) + Math.abs(bestEdge.r);
      if (a > b) bestEdge = h;
    }
  }

  if (!bestEdge) {
    // No edge reachable. Still move to maximize freedom (degree), then maximize distance to nearest blocked? (simple)
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const deg = neighbors(m).filter((n) => !isBlocked(n)).length;
      const score = deg * 10 - hexDistance(m, { q: 0, r: 0 }) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return { type: "move", to: best };
  }

  // Choose neighbor that reduces distance to the chosen best edge (using BFS distances from edge).
  const distFromEdge = bfsDistancesFrom(bestEdge);
  let bestMove = null;
  let bestMoveD = Infinity;
  for (const m of moves) {
    const d = distFromEdge.get(keyOf(m));
    if (d == null) continue;
    if (d < bestMoveD) {
      bestMoveD = d;
      bestMove = m;
    } else if (d === bestMoveD && bestMove) {
      // tie-break: prefer continuing direction (keep cat feeling "smart")
      const a = hexDistance(m, bestEdge);
      const b = hexDistance(bestMove, bestEdge);
      if (a < b) bestMove = m;
    }
  }

  if (!bestMove) {
    // Shouldn't happen, but keep it safe.
    return { type: "move", to: moves[0] };
  }

  return { type: "move", to: bestMove };
}

function endGame(reason) {
  state.over = true;
  state.overReason = reason;
  render();
}

function catTurn() {
  // New win rule: if cat cannot reach the edge anymore, it is "trapped in".
  if (!canCatReachAnyEdge()) {
    endGame("Cat is trapped in. You win!");
    return;
  }

  const step = computeCatStep();
  if (step.type === "escaped") {
    endGame("Cat escaped. You lose.");
    return;
  }
  if (step.type === "trapped") {
    // Still a win (stronger than being enclosed): no legal moves.
    endGame("Cat is trapped. You win!");
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

      // After moving, immediately check the "trapped in" condition again.
      if (!state.over && !canCatReachAnyEdge()) {
        endGame("Cat is trapped in. You win!");
      }
    });
    return; // rest will run after animation ends
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
canvas.addEventListener("touchstart", onPointer, { passive: false });

canvas.addEventListener(
  "touchstart",
  (evt) => {
    if (!evt.touches || evt.touches.length < 2) return;
    evt.preventDefault();
    state.gesture.pinching = true;
    state.gesture.startDist = touchDistance(evt);
    state.gesture.startZoom = state.zoom;
  },
  { passive: false },
);

canvas.addEventListener(
  "touchmove",
  (evt) => {
    if (!state.gesture.pinching) return;
    if (!evt.touches || evt.touches.length < 2) return;
    evt.preventDefault();
    const d = touchDistance(evt);
    if (state.gesture.startDist <= 0) return;
    const ratio = d / state.gesture.startDist;
    state.zoom = clamp(state.gesture.startZoom * ratio, 0.75, 2.25);
    render();
  },
  { passive: false },
);

function endPinch() {
  state.gesture.pinching = false;
  state.gesture.startDist = 0;
}

canvas.addEventListener("touchend", () => endPinch(), { passive: true });
canvas.addEventListener("touchcancel", () => endPinch(), { passive: true });

window.addEventListener("resize", () => render());

if (versionTextEl) versionTextEl.textContent = `v${VERSION}`;
resetGame();
