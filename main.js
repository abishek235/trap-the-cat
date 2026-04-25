// Dependency-free browser game: Trap the Cat on a hex grid.

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d", { alpha: false });
const resetBtn = document.getElementById("resetBtn");
const toastEl = document.getElementById("toast");

const boardInfoEl = document.getElementById("boardInfo");
const blockedInfoEl = document.getElementById("blockedInfo");
const turnInfoEl = document.getElementById("turnInfo");

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
  turns: 0,
  over: false,
  overReason: "",
  pixelRatio: 1,
  layout: {
    size: 18, // computed
    originX: 0,
    originY: 0,
  },
};

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
  const size = Math.max(10 * dpr, Math.floor(Math.min(maxSizeW, maxSizeH)));

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
  const catP = hexToPixel(state.cat);
  ctx.save();
  ctx.shadowColor = "rgba(124, 92, 255, 0.50)";
  ctx.shadowBlur = Math.floor(14 * state.pixelRatio);
  ctx.fillStyle = "#f1f2ff";
  ctx.beginPath();
  ctx.arc(catP.x, catP.y, Math.floor(size * 0.45), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // cat face
  ctx.save();
  ctx.fillStyle = "#0b1020";
  ctx.globalAlpha = 0.9;
  const eyeOffsetX = size * 0.16;
  const eyeOffsetY = size * -0.06;
  const eyeR = Math.max(2, Math.floor(size * 0.06));
  ctx.beginPath();
  ctx.arc(catP.x - eyeOffsetX, catP.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
  ctx.arc(catP.x + eyeOffsetX, catP.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // end state toast
  if (state.over) {
    showToast(state.overReason, state.overReason.includes("escaped") ? "lose" : "win");
  }

  updateStats();
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
  const step = computeCatStep();
  if (step.type === "escaped") {
    endGame("Cat escaped. You lose.");
    return;
  }
  if (step.type === "trapped") {
    endGame("Cat is trapped. You win!");
    return;
  }
  if (step.type === "move") {
    state.cat = step.to;
    if (isEdge(state.cat)) {
      endGame("Cat escaped. You lose.");
      return;
    }
  }
}

function playerBlock(h) {
  if (!isInside(h)) return;
  if (state.over) return;
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

function onPointer(evt) {
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

window.addEventListener("resize", () => render());

resetGame();
