// 關都彈珠研究所 v2 —— 無印版（151 隻）
(() => {
'use strict';

/* ============ 常數 ============ */
const W = 540;
let H = 820;                        // 棋盤高度會依螢幕比例調整
const GRAV = 1150, BALL_R = 7, MAX_V = 1100;
const GAME_BALLS = 100, ROUND_SEC = 30;
const BOLT_GOAL = 20, BOLT_REWARD = 5, PBALL_GOAL = 40, MAX_ON_BOARD = 140;
const SAVE_KEY = 'kantoPachinko.v1';
const BALL_NAME = { poke: '精靈球', great: '超級球', ultra: '高級球', master: '大師球' };
const TIER_NAME = { common: '普通', rare: '稀有', srare: '超稀有', legend: '傳說' };
const TIER_RANK = { common: 0, rare: 1, srare: 2, legend: 3 };
const LEGEND_POOLS = [[144, 145, 146], [150, 151]];
const FONT = '"Outfit","Noto Sans TC",sans-serif';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad3 = n => String(n).padStart(3, '0');

/* ============ 資料整理 ============ */
const P = {};
POKEDEX.forEach(p => { P[p.id] = p; if (p.evoFrom > 151) p.evoFrom = null; });  // 皮丘等第二代以後的前置型不算
const CHILDREN = {};
POKEDEX.forEach(p => { if (p.evoFrom) (CHILDREN[p.evoFrom] = CHILDREN[p.evoFrom] || []).push(p.id); });
const stageOf = id => (P[id].evoFrom ? 1 + stageOf(P[id].evoFrom) : 0);
POKEDEX.forEach(p => {
  p.stage = stageOf(p.id);
  p.tier = (p.legendary || p.mythical) ? 'legend'
    : (p.capture <= 25 || p.bst >= 500) ? 'srare'
    : (p.capture <= 75 || (p.stage >= 1 && p.bst >= 450)) ? 'rare' : 'common';
});
const POOL = POKEDEX.filter(p => p.tier !== 'legend');
const STAGE_MULT = [1, 0.3, 0.1];
const imgSrc = (id, shiny) => `assets/${shiny ? 's' : 'n'}${id}.webp`;

// 球越高級，越容易抽到稀有／進化型
function weightFor(p, ball) {
  const c = p.capture, s = STAGE_MULT[p.stage];
  switch (ball) {
    case 'poke': return c * s;
    case 'great': return Math.pow(c, 0.6) * Math.pow(s, 0.7);
    case 'ultra': return Math.pow(c, 0.25) * Math.pow(s, 0.4);
    default: return 1 / Math.pow(c, 0.25);
  }
}
const WEIGHTS = {};
['poke', 'great', 'ultra', 'master'].forEach(b => { let sum = 0; WEIGHTS[b] = POOL.map(p => (sum += weightFor(p, b))); });
function pickPokemon(ball) {
  const cum = WEIGHTS[ball], r = Math.random() * cum[cum.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
  return POOL[lo].id;
}
const SHINY_RATE = { poke: 1 / 120, great: 1 / 80, ultra: 1 / 40, master: 1 / 15 };
function rollBallType() {
  const r = Math.random();
  return r < 0.006 ? 'master' : r < 0.05 ? 'ultra' : r < 0.22 ? 'great' : 'poke';
}

/* ============ 存檔 ============ */
const newGame = () => ({ balls: GAME_BALLS, shots: 0, caught: 0, newDex: 0, shiny: 0, best: null, ended: false });
const fresh = () => ({ dex: {}, bolt: 0, pball: 0, charge: [0, 0], legIdx: [0, 0], box: [], recent: [], game: newGame(),
  stats: { caught: 0, shots: 0, rounds: 0, center: 0, legend: 0 }, music: true, sfx: true });
if (/[?&]reset\b/.test(location.search)) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} history.replaceState(null, '', location.pathname); }
let S;
try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
S = Object.assign(fresh(), S || {});
delete S.balls;   // 舊版欄位
let saveT = 0;
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
const dexOf = id => (S.dex[id] = S.dex[id] || { n: 0, s: 0, got: false, gotS: false });
const dexCount = () => POKEDEX.filter(p => S.dex[p.id] && S.dex[p.id].got).length;
const shinyCount = () => POKEDEX.filter(p => S.dex[p.id] && S.dex[p.id].gotS).length;
const legendCount = () => POKEDEX.filter(p => p.tier === 'legend' && S.dex[p.id] && S.dex[p.id].got).length;

/* ============ 音樂與音效（WebAudio 即時合成，原創曲） ============ */
const AU = (() => {
  let ac = null, master, bgm, sfx, noiseBuf, nextT = 0, step = 0, lastTick = 0;
  const BGM_VOL = 0.5;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = S.music ? BGM_VOL : 0; bgm.connect(master);
    sfx = ac.createGain(); sfx.gain.value = S.sfx ? 1 : 0; sfx.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextT = ac.currentTime + 0.1;
    setInterval(schedule, 30);
  }
  function osc(dest, type, f, t, dur, vol, slideTo) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // 背景音樂：C–Am–F–G ／ F–G–Em–Am，8 小節循環
  const E = 60 / 132 / 2;
  const LEAD = [
    [76, 79, 84, 0, 83, 79, 76, 79], [81, 0, 84, 81, 76, 0, 81, 83], [84, 0, 81, 77, 81, 84, 86, 84], [83, 0, 79, 74, 79, 81, 83, 86],
    [84, 0, 84, 86, 88, 0, 86, 84], [83, 0, 83, 84, 86, 0, 84, 83], [81, 0, 79, 76, 79, 0, 81, 83], [84, 83, 81, 79, 77, 76, 74, 0],
  ];
  const ROOT = [48, 45, 41, 43, 41, 43, 40, 45];
  const CH = { 48: [60, 64, 67], 45: [57, 60, 64], 41: [53, 57, 60], 43: [55, 59, 62], 40: [52, 55, 59] };
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, n = LEAD[bar][i], r = ROOT[bar];
    if (n) { osc(bgm, 'square', hz(n), t, E * 0.9, 0.028); osc(bgm, 'triangle', hz(n), t, E * 1.4, 0.02); }
    osc(bgm, 'triangle', hz(i % 2 ? r + 12 : r), t, E * 0.85, 0.075);
    if (i % 2 === 1) CH[r].forEach(m => osc(bgm, 'square', hz(m), t, E * 0.35, 0.007));
    if (i === 0 || i === 4) osc(bgm, 'sine', 150, t, 0.16, 0.22, 45);
    if (i === 2 || i === 6) noise(bgm, t, 0.12, 0.09, 'bandpass', 1800);
    noise(bgm, t, 0.03, 0.025, 'highpass', 7000);
  }
  function duck(sec) {
    if (!ac || !S.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.12, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  function setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } }
  function setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); }
  function notes(list, type = 'square', vol = 0.05, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m), t, d * 0.95, vol); osc(sfx, 'triangle', hz(m - 12), t, d, vol * 0.8); } t += d; }
    return t - ac.currentTime;
  }
  const play = {
    tick() { if (!ac) return; const n = performance.now(); if (n - lastTick < 40) return; lastTick = n; osc(sfx, 'sine', 2200 + Math.random() * 800, ac.currentTime, 0.03, 0.018); },
    drop() { if (ac) osc(sfx, 'sine', 900, ac.currentTime, 0.08, 0.06, 500); },
    bump() { if (!ac) return; osc(sfx, 'triangle', 660, ac.currentTime, 0.12, 0.07); osc(sfx, 'triangle', 990, ac.currentTime + 0.05, 0.1, 0.05); },
    catch() { notes([[79, 0.06], [84, 0.06], [88, 0.12]], 'square', 0.035); },
    reward() { duck(1); notes([[72, 0.08], [76, 0.08], [79, 0.08], [84, 0.25]], 'square', 0.05); },
    shake() { if (!ac) return; noise(sfx, ac.currentTime, 0.18, 0.25, 'lowpass', 300); osc(sfx, 'sine', 90, ac.currentTime, 0.2, 0.25, 50); },
    tilt() { if (!ac) return; duck(2); for (let i = 0; i < 3; i++) osc(sfx, 'sawtooth', 110, ac.currentTime + i * 0.25, 0.2, 0.06); },
    fail() { if (ac) osc(sfx, 'triangle', 330, ac.currentTime, 0.18, 0.04, 200); },
    sparkle() { if (!ac) return; [84, 88, 91, 96, 100, 103].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + i * 0.05, 0.25, 0.04)); },
    pop() { if (ac) osc(sfx, 'sine', 600 + Math.random() * 300, ac.currentTime, 0.08, 0.05, 1200); },
    ding(rank = 0) { if (ac) osc(sfx, 'triangle', hz(84 + rank * 4), ac.currentTime, 0.25, 0.05); },
    drumroll(dur) {
      if (!ac) return; duck(dur + 3);
      const t0 = ac.currentTime;
      for (let t = 0; t < dur; t += 0.045) noise(sfx, t0 + t, 0.04, 0.03 + 0.14 * (t / dur), 'bandpass', 900 + 1600 * (t / dur));
      osc(sfx, 'sawtooth', 160, t0, dur, 0.025, 720);
      osc(sfx, 'square', 220, t0, dur, 0.012, 990);
    },
    flash() { if (!ac) return; noise(sfx, ac.currentTime, 0.6, 0.35, 'highpass', 2500); [72, 76, 79, 84].forEach(m => osc(sfx, 'square', hz(m), ac.currentTime, 0.5, 0.025)); },
    fanfareRare() { duck(1.6); notes([[72, 0.09], [76, 0.09], [79, 0.09], [84, 0.18], [79, 0.09], [84, 0.5]], 'square', 0.045); },
    fanfareBig() {
      duck(3.2);
      const d = notes([[67, 0.11], [72, 0.11], [76, 0.11], [79, 0.22], [76, 0.11], [79, 0.11], [84, 0.33], [0, 0.05], [83, 0.11], [84, 0.11], [86, 0.11], [88, 0.7]], 'square', 0.05);
      if (ac) [72, 76, 79, 84].forEach(m => osc(sfx, 'triangle', hz(m), ac.currentTime + d - 0.7, 1.2, 0.03));
    },
    gameOver() { duck(2.5); notes([[72, 0.12], [79, 0.12], [76, 0.12], [84, 0.12], [83, 0.12], [79, 0.12], [84, 0.6]], 'square', 0.045); },
  };
  return { init, play, setMusic, setSfx, suspend: () => ac && ac.suspend(), resume: () => ac && ac.resume() };
})();
const sfx = AU.play;

/* ============ 畫布與版面 ============ */
const cv = $('cv'), ctx = cv.getContext('2d');
const frameEl = $('boardFrame'), wrapEl = $('boardWrap');
let scale = 1, bgK = 0, BG = null;

const bumpers = [{ x: 150, y: 0, r: 25, kind: 'bolt', f: 0 }, { x: 390, y: 0, r: 25, kind: 'pball', f: 0 }];
const ring = { x: 270, y: 0, R: 54, th: 8, ang: 0, coin: 11, f: 0 };
const ARC_SPAN = 1.66, ARC_N = 3;
const catcher = { cx: 270, y: 0, hw: 46, depth: 40, open: 13, f: 0 };
const pockets = [{ side: 0, x0: 9, x1: 114, state: '', st: 0 }, { side: 1, x0: 426, x1: 531, state: '', st: 0 }];
let walls = [], pegs = [], grid = [], GC = 0, GR = 0, pegTop = 92, pegBot = 600, pocketTop = 700;
const CELL = 40;

function layout(newH) {
  H = newH; pegTop = 92; pegBot = H - 222;
  const span = pegBot - pegTop;
  bumpers.forEach(b => { b.y = Math.round(pegTop + span * 0.17); });
  ring.y = Math.round(pegTop + span * 0.62);
  catcher.y = H - 168;
  pocketTop = H - 92;
  walls = [[9, 0, 9, H], [531, 0, 531, H], [9, H - 150, 34, H - 126], [531, H - 150, 506, H - 126], [114, pocketTop, 114, H + 20], [426, pocketTop, 426, H + 20]];
  pegs = [];
  for (let row = 0, y = pegTop; y <= pegBot; y += 30, row++) {
    const off = row % 2 ? 20 : 0;
    for (let x = 30 + off; x <= 510; x += 40) {
      if (bumpers.some(b => Math.hypot(x - b.x, y - b.y) < b.r + 26)) continue;
      if (bumpers.some(b => Math.abs(x - b.x) < 46 && y > b.y + 30 && y < b.y + 68)) continue;
      if (Math.hypot(x - ring.x, y - ring.y) < ring.R + 24) continue;
      if (Math.abs(x - ring.x) < 92 && y > ring.y - 94 && y < ring.y - 60) continue;
      pegs.push({ x, y, r: 4.5, f: 0 });
    }
  }
  GC = Math.ceil(W / CELL); GR = Math.ceil((H + 60) / CELL);
  grid = Array.from({ length: GC * GR }, () => []);
  pegs.forEach(p => {
    for (let gx = Math.floor((p.x - 12) / CELL); gx <= Math.floor((p.x + 12) / CELL); gx++)
      for (let gy = Math.floor((p.y - 12) / CELL); gy <= Math.floor((p.y + 12) / CELL); gy++)
        if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) grid[gx + gy * GC].push(p);
  });
  bgK = 0;
}

function fit() {
  const cw = wrapEl.clientWidth, ch = wrapEl.clientHeight;
  if (!cw || !ch) return;
  const newH = Math.round(clamp(W * ch / cw, 740, 1100));
  if (Math.abs(newH - H) > 3 || !pegs.length) layout(newH);
  scale = Math.min(cw / W, ch / H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2), k = scale * dpr;
  frameEl.style.width = W * scale + 'px'; frameEl.style.height = H * scale + 'px';
  cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (bgK !== k) { BG = buildBackground(k); bgK = k; }
}

function buildBackground(k) {
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext('2d'); g.scale(k, k);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0d1434'); grd.addColorStop(0.6, '#140f38'); grd.addColorStop(1, '#0a0b22');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(bumpers[0].x, bumpers[0].y, 130, 'rgba(255,209,102,.10)');
  glow(bumpers[1].x, bumpers[1].y, 130, 'rgba(255,77,94,.11)');
  glow(ring.x, ring.y, 190, 'rgba(255,79,163,.13)');
  glow(270, H - 140, 200, 'rgba(94,242,255,.08)');
  // 點陣
  g.fillStyle = 'rgba(255,255,255,.045)';
  for (let y = 10; y < H; y += 18) for (let x = 10 + ((y / 18) % 2) * 9; x < W; x += 18) g.fillRect(x, y, 1.2, 1.2);
  // 中央大精靈球浮水印
  g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 12;
  g.beginPath(); g.arc(ring.x, ring.y, 170, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(ring.x - 170, ring.y); g.lineTo(ring.x - 70, ring.y); g.moveTo(ring.x + 70, ring.y); g.lineTo(ring.x + 170, ring.y); g.stroke();
  // 發射軌道
  g.strokeStyle = 'rgba(94,242,255,.18)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(22, 24); g.lineTo(518, 24); g.stroke();
  // 底部口袋
  pockets.forEach(pk => { g.fillStyle = 'rgba(167,139,250,.07)'; g.fillRect(pk.x0 + 1, pocketTop, pk.x1 - pk.x0 - 2, H - pocketTop); });
  const fade = g.createLinearGradient(0, H - 40, 0, H); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = fade; g.fillRect(0, H - 40, W, 40);
  return c;
}

const legendImgs = {};
[144, 145, 146, 150, 151].forEach(id => { const im = new Image(); im.src = imgSrc(id, false); legendImgs[id] = im; });

const BALL_SPR = (() => {
  const c = document.createElement('canvas'), s = 40; c.width = c.height = s;
  const g = c.getContext('2d'), r = 17, cx = 20, cy = 20;
  g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff4d5e'; g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.fill();
  g.strokeStyle = '#0b0f24'; g.lineWidth = 3.5; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
  g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(cx, cy, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(cx - 6, cy - 8, 3.5, 0, Math.PI * 2); g.fill();
  return c;
})();

/* ============ 狀態 ============ */
let balls = [], parts = [], floats = [];
let time = 0, speed = 1, autoTest = false;
const pauses = new Set();
const isPaused = () => pauses.size > 0;
const launcher = { x: 270, tx: 270 };
let holding = false, holdT = 0, fireCD = 0;
const keys = {};
let tilt = 0, tiltLock = 0, shakeT = 0, shakeDir = 0;
let roundLeft = ROUND_SEC, pendingSummary = false;

/* ============ 物理 ============ */
function hitCircle(b, cx, cy, r, e) {
  let nx = b.x - cx, ny = b.y - cy;
  const d = Math.hypot(nx, ny), m = r + b.r;
  if (d >= m || d === 0) return false;
  nx /= d; ny /= d; b.x = cx + nx * m; b.y = cy + ny * m;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  b.nx = nx; b.ny = ny;
  return true;
}
function hitSeg(b, ax, ay, bx, by, e) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = ax + dx * t, py = ay + dy * t;
  let nx = b.x - px, ny = b.y - py;
  const d = Math.hypot(nx, ny);
  if (d >= b.r || d === 0) return false;
  nx /= d; ny /= d; b.x = px + nx * b.r; b.y = py + ny * b.r;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return true;
}
const normAng = a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const ringLit = () => time % 10 < 3;   // 每 10 秒亮 3 秒
const arcStarts = () => Array.from({ length: ARC_N }, (_, i) => ring.ang + i * Math.PI * 2 / ARC_N);

function stepBall(b, h) {
  b.vy += GRAV * h;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
  b.x += b.vx * h; b.y += b.vy * h;

  const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
  if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) {
    for (const p of grid[gx + gy * GC]) {
      if (hitCircle(b, p.x, p.y, p.r, 0.42)) { b.vx += (Math.random() - 0.5) * 30; b.vx *= 0.985; p.f = 1; sfx.tick(); }
    }
  }
  for (const w of walls) hitSeg(b, w[0], w[1], w[2], w[3], 0.4);

  for (const bp of bumpers) {
    if (hitCircle(b, bp.x, bp.y, bp.r, 0.9)) {
      const vn = b.vx * b.nx + b.vy * b.ny;
      if (vn < 380) { b.vx += (380 - vn) * b.nx; b.vy += (380 - vn) * b.ny; }
      if (time - (b.cool[bp.kind] || -1) > 0.25) { b.cool[bp.kind] = time; onBumper(bp); }
    }
  }

  const dx = b.x - ring.x, dy = b.y - ring.y, d = Math.hypot(dx, dy);
  if (d < ring.R + ring.th + b.r) {
    if (d < ring.coin + b.r) {
      if (ringLit()) { b.dead = true; onCenter(b); return; }
      hitCircle(b, ring.x, ring.y, ring.coin, 0.6);
    }
    const a = normAng(Math.atan2(dy, dx));
    for (const s of arcStarts()) {
      if (normAng(a - s) < ARC_SPAN && Math.abs(d - ring.R) < ring.th / 2 + b.r) {
        const nx = dx / d, ny = dy / d, sgn = d > ring.R ? 1 : -1;
        b.x = ring.x + nx * (ring.R + sgn * (ring.th / 2 + b.r));
        b.y = ring.y + ny * (ring.R + sgn * (ring.th / 2 + b.r));
        const vn = (b.vx * nx + b.vy * ny) * sgn;
        if (vn < 0) { b.vx -= 1.5 * vn * nx * sgn; b.vy -= 1.5 * vn * ny * sgn; }
        b.vx += -ny * 40; b.vy += nx * 40;
      }
      for (const ea of [s, s + ARC_SPAN]) hitCircle(b, ring.x + Math.cos(ea) * ring.R, ring.y + Math.sin(ea) * ring.R, ring.th / 2, 0.5);
    }
  }

  const c = catcher, top = c.y, bot = c.y + c.depth;
  if (b.y > top - 20 && b.y < bot + 30 && Math.abs(b.x - c.cx) < c.hw + 20) {
    hitSeg(b, c.cx - c.hw, top, c.cx - c.open, bot, 0.3);
    hitSeg(b, c.cx + c.hw, top, c.cx + c.open, bot, 0.3);
    if (b.y > bot - 4 && Math.abs(b.x - c.cx) < c.open) { b.dead = true; onCatch(b); return; }
  }

  if (b.y > H - 22) {
    b.dead = true;
    if (b.x < pockets[0].x1) onPocket(0, b);
    else if (b.x > pockets[1].x0) onPocket(1, b);
    else onLost(b);
  }
}

/* ============ 事件 ============ */
function addFloat(x, y, text, color = '#ffd166') { floats.push({ x, y, text, color, t: 0 }); }
function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 200;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: 0.6 + Math.random() * 0.5, color });
  }
}
function addToBox(item) { S.box.push(item); refreshUI(); }

function onBumper(bp) {
  bp.f = 1; sfx.bump();
  if (bp.kind === 'bolt') {
    if (++S.bolt >= BOLT_GOAL) {
      S.bolt = 0; S.game.balls += BOLT_REWARD; sfx.reward(); burst(bp.x, bp.y, '#ffd166', 26);
      addFloat(bp.x, bp.y - 46, `+${BOLT_REWARD} 彈珠`);
      toast(`⚡ 閃電碰滿 ${BOLT_GOAL} 次，彈珠 +${BOLT_REWARD}！`);
      refreshUI();
    }
  } else if (++S.pball >= PBALL_GOAL) {
    S.pball = 0; addToBox({ ball: 'great' }); sfx.reward(); burst(bp.x, bp.y, '#60a5fa', 26);
    addFloat(bp.x, bp.y - 46, '超級球 +1', '#60a5fa');
    toast(`精靈球碰滿 ${PBALL_GOAL} 次，送你一顆超級球！`);
  }
}
function onCatch(b) {
  const ball = rollBallType();
  addToBox({ ball });
  S.game.caught++; S.stats.caught++;
  catcher.f = 1; sfx.catch(); burst(b.x, catcher.y + catcher.depth, ball === 'master' ? '#a78bfa' : '#5ef2ff');
  addFloat(catcher.cx, catcher.y - 34, `${BALL_NAME[ball]} +1`, ball === 'master' ? '#c4b5fd' : ball === 'ultra' ? '#ffd166' : '#5ef2ff');
  if (ball === 'master') toast('哇！入口掉出了大師球！');
  refreshUI();
}
function onCenter() {
  S.stats.center++; S.game.caught++; S.stats.caught++;
  ring.f = 1;
  addToBox({ ball: 'ultra', shiny: true });
  sfx.sparkle(); sfx.fanfareRare();
  burst(ring.x, ring.y, '#ffd166', 34); burst(ring.x, ring.y, '#ff4fa3', 20);
  addFloat(ring.x, ring.y - 90, '閃光高級球！', '#ffd166');
  showBanner({ kind: 'shiny', tag: '閃光能量', title: '命中中心！', sub: '獲得必定閃光的高級球', img: imgSrc(25, true) });
}
const legendId = side => { const pool = LEGEND_POOLS[side]; return pool[S.legIdx[side] % pool.length]; };
function captureLegend(side) {
  const id = legendId(side);
  S.stats.legend++; S.game.caught++; S.stats.caught++;
  addToBox({ ball: 'master', fixed: id, shiny: Math.random() < 0.1 });
  S.charge[side] = 0; S.legIdx[side]++;
  const pk = pockets[side]; pk.state = '收服成功！'; pk.st = 2.4;
  burst((pk.x0 + pk.x1) / 2, H - 50, '#a78bfa', 40);
  legendBanner(id);
}
function onPocket(side, b) {
  const pk = pockets[side];
  if (Math.random() < 0.001 + S.charge[side] / 100 * 0.005 || S.charge[side] >= 100) return captureLegend(side);
  S.charge[side] = Math.min(100, S.charge[side] + 0.12);
  pk.state = '捕獲失敗'; pk.st = 1; sfx.fail();
  addFloat(b.x < 270 ? 62 : 478, pocketTop - 50, '充能 +0.12%', '#c4b5fd');
  if (S.charge[side] >= 100) captureLegend(side);
}
function onLost(b) {
  const side = b.x < W / 2 ? 0 : 1;
  S.charge[side] = Math.min(100, S.charge[side] + 0.02);
  if (S.charge[side] >= 100) captureLegend(side);
}

/* ============ 操作：發射與搖台 ============ */
function fire() {
  if (isPaused() || S.game.ended) return false;
  if (tiltLock > 0) { toast('TILT 中，等台子解鎖…'); return false; }
  if (S.game.balls <= 0) { toast('這局的彈珠用完了'); return false; }
  if (balls.length >= MAX_ON_BOARD) return false;
  S.game.balls--; S.game.shots++; S.stats.shots++;
  balls.push({ x: clamp(launcher.x + (Math.random() - 0.5) * 3, 24, W - 24), y: 30, vx: (Math.random() - 0.5) * 30, vy: 60, r: BALL_R, cool: {}, age: 0, dead: false });
  sfx.drop(); refreshUI();
  return true;
}
function doShake(dir) {
  if (isPaused() || tiltLock > 0 || S.game.ended) return;
  tilt += 36;
  if (tilt > 100) {
    tilt = 0; tiltLock = 3.5; sfx.tilt();
    $('tiltMsg').classList.add('show'); toast('搖太兇了！台子鎖住 3.5 秒');
    return;
  }
  for (const b of balls) { b.vx += dir * (180 + Math.random() * 90); b.vy -= 110; }
  shakeT = 0.28; shakeDir = dir; sfx.shake();
}
const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
cv.addEventListener('pointerdown', e => {
  AU.init();
  const p = toCanvas(e);
  launcher.tx = launcher.x = clamp(p.x, 24, W - 24);
  holding = true; holdT = 0; fire();
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => { if (holding || e.pointerType === 'mouse') launcher.tx = clamp(toCanvas(e).x, 24, W - 24); });
['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { holding = false; }));
window.addEventListener('keydown', e => {
  AU.init();
  const k = e.key.toLowerCase();
  if ($('mDex').classList.contains('show')) return;
  if (k === 'arrowleft' || k === 'arrowright') { keys[k] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (k === ' ') { e.preventDefault(); if (anyModal()) return; holding = true; holdT = 0; fire(); }
  else if (k === 'z') doShake(-1);
  else if (k === 'x') doShake(1);
  else if (k === 'p' || k === 'escape') { if (!anyModal()) togglePause(); }
  else if (k === 'b') { if (!anyModal()) openRound(); }
  else if (k === 'd') { if (!anyModal()) openDex(); }
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; if (k === ' ') holding = false; });
function bindPress(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); fn(); }); }
bindPress($('shakeL'), () => doShake(-1));
bindPress($('shakeR'), () => doShake(1));

/* ============ 更新 ============ */
function update(dt) {
  time += dt;
  ring.ang += dt * 1.1;
  catcher.cx = 270 + Math.sin(time * 0.6) * 130;

  if (keys.arrowleft) launcher.tx = clamp(launcher.tx - 340 * dt, 24, W - 24);
  if (keys.arrowright) launcher.tx = clamp(launcher.tx + 340 * dt, 24, W - 24);
  launcher.x += (launcher.tx - launcher.x) * Math.min(1, dt * 18);

  // 按住超過 0.35 秒才開始連發
  fireCD -= dt;
  if (holding) { holdT += dt; if (holdT > 0.35 && fireCD <= 0) { fire(); fireCD = 0.2; } }
  if (autoTest && fireCD <= 0) { launcher.tx = 270 + Math.sin(time * 1.7) * 200; if (fire()) fireCD = 0.16; }

  tilt = Math.max(0, tilt - 14 * dt);
  if (tiltLock > 0) { tiltLock -= dt; if (tiltLock <= 0) $('tiltMsg').classList.remove('show'); }
  if (shakeT > 0) shakeT -= dt;

  const SUB = 4, h = dt / SUB;
  for (let s = 0; s < SUB; s++) for (const b of balls) if (!b.dead) stepBall(b, h);
  for (const b of balls) { b.age += dt; if (b.age > 30) b.dead = true; }
  balls = balls.filter(b => !b.dead);

  for (const p of pegs) if (p.f > 0) p.f -= dt * 4;
  for (const bp of bumpers) if (bp.f > 0) bp.f -= dt * 3;
  if (ring.f > 0) ring.f -= dt * 1.5;
  if (catcher.f > 0) catcher.f -= dt * 3;
  for (const pk of pockets) if (pk.st > 0) { pk.st -= dt; if (pk.st <= 0) pk.state = ''; }
  for (const p of parts) { p.t += dt; p.vy += 400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.t < p.life);
  for (const f of floats) f.t += dt;
  floats = floats.filter(f => f.t < 1.2);

  roundLeft -= dt;
  if (roundLeft <= 0) { roundLeft = ROUND_SEC; if (S.box.length) openRound(); }

  // 100 顆用完且台面清空 → 結算
  if (!S.game.ended && S.game.balls <= 0 && !balls.length) {
    S.game.ended = true; pendingSummary = true;
    if (S.box.length) openRound(); else { pendingSummary = false; showSummary(); }
  }
  saveT -= dt; if (saveT <= 0) { saveT = 3; save(); }
}

/* ============ 繪製 ============ */
function txt(t, x, y, size, color = '#eef2ff', weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(7,11,31,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
}
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function pokeIcon(x, y, r) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = '#0b0f24'; ctx.lineWidth = r * 0.16;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function bolt(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(2, -12); ctx.lineTo(-7, 2); ctx.lineTo(-1, 2); ctx.lineTo(-3, 12); ctx.lineTo(7, -3); ctx.lineTo(1, -3); ctx.lineTo(4, -12); ctx.closePath();
  ctx.fill(); ctx.stroke(); ctx.restore();
}
function neonLine(pts, color, w) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [lw, a] of [[w + 8, 0.18], [w, 1]]) {
    ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}

function render() {
  if (!BG) return;
  ctx.save();
  if (shakeT > 0) ctx.translate(shakeDir * Math.sin(shakeT * 70) * 6 * (shakeT / 0.28), 0);
  ctx.drawImage(BG, 0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // 發射器
  const locked = tiltLock > 0, lx = launcher.x;
  ctx.setLineDash([3, 6]); ctx.strokeStyle = locked ? 'rgba(255,77,94,.4)' : 'rgba(94,242,255,.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx, 40); ctx.lineTo(lx, pegTop - 12); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = locked ? 'rgba(255,77,94,.25)' : 'rgba(94,242,255,.16)';
  ctx.strokeStyle = locked ? '#ff4d5e' : '#5ef2ff'; ctx.lineWidth = 2;
  rr(lx - 20, 12, 40, 24, 12); ctx.fill(); ctx.stroke();
  if (S.game.balls > 0) ctx.drawImage(BALL_SPR, lx - 9, 15, 18, 18);

  // 釘子
  for (const p of pegs) {
    if (p.f > 0) { ctx.globalAlpha = p.f * 0.6; ctx.fillStyle = '#5ef2ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6 * p.f, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = p.f > 0 ? '#c9fbff' : '#6f7eae'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(p.x - 1.3, p.y - 1.4, 1.3, 0, Math.PI * 2); ctx.fill();
  }

  // 計數器：外圈進度環
  for (const bp of bumpers) {
    const isBolt = bp.kind === 'bolt', col = isBolt ? '#ffd166' : '#ff4d5e';
    const goal = isBolt ? BOLT_GOAL : PBALL_GOAL, n = isBolt ? S.bolt : S.pball;
    const sc = 1 + Math.max(0, bp.f) * 0.16;
    ctx.save(); ctx.translate(bp.x, bp.y); ctx.scale(sc, sc);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.beginPath(); ctx.arc(0, 0, bp.r + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, bp.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * n / goal); ctx.stroke(); ctx.lineCap = 'butt';
    if (bp.f > 0) { ctx.globalAlpha = bp.f * 0.5; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, bp.r + 16, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#141b3f'; ctx.beginPath(); ctx.arc(0, 0, bp.r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    if (isBolt) bolt(0, 0, 1.4); else pokeIcon(0, 0, bp.r - 6);
    ctx.restore();
    txt(`${n}/${goal}`, bp.x, bp.y + 46, 16, col);
    txt(isBolt ? `碰滿 +${BOLT_REWARD} 珠` : '碰滿送超級球', bp.x, bp.y + 63, 12, '#9aa6c8', 700);
  }

  // 中央轉盤
  const lit = ringLit(), pulse = 0.5 + Math.sin(time * 8) * 0.5;
  txt(lit ? '✦ 現在命中＝閃光！' : `中心充能中 ${Math.ceil(10 - time % 10)}s`, ring.x, ring.y - 78, lit ? 17 : 14, lit ? '#ffd166' : '#9aa6c8');
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = ring.th + 6;
  ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineCap = 'round';
  const arcCol = ring.f > 0 ? '#ffd166' : '#ff4fa3';
  for (const [lw, a] of [[ring.th + 10, 0.2], [ring.th, 1]]) {
    ctx.globalAlpha = a; ctx.strokeStyle = arcCol; ctx.lineWidth = lw;
    for (const s of arcStarts()) { ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.R, s, s + ARC_SPAN); ctx.stroke(); }
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  if (lit) { ctx.fillStyle = `rgba(255,209,102,${0.25 + pulse * 0.35})`; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.coin + 10 + pulse * 5, 0, Math.PI * 2); ctx.fill(); }
  const cg = ctx.createRadialGradient(ring.x - 3, ring.y - 3, 1, ring.x, ring.y, ring.coin);
  cg.addColorStop(0, lit ? '#fff6c0' : '#8b93b5'); cg.addColorStop(1, lit ? '#e0a400' : '#3b4266');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.coin, 0, Math.PI * 2); ctx.fill();
  if (lit) txt('★', ring.x, ring.y + 1, 12, '#7a4b00', 900);

  // 傳說口袋
  for (const pk of pockets) {
    const id = legendId(pk.side), cx = (pk.x0 + pk.x1) / 2;
    const im = legendImgs[id];
    if (im.complete && im.naturalWidth) ctx.drawImage(im, cx - 36, pocketTop + 2, 72, 72);
    txt(P[id].zh, cx, H - 12, 12, '#e9e2ff', 900);
    const ch = S.charge[pk.side];
    txt('傳說保底', cx, pocketTop - 40, 11, '#9aa6c8', 700);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; rr(cx - 42, pocketTop - 30, 84, 10, 5); ctx.fill();
    if (ch > 0) { ctx.fillStyle = '#a78bfa'; rr(cx - 42, pocketTop - 30, Math.max(10, 84 * ch / 100), 10, 5); ctx.fill(); }
    txt(`${Math.floor(ch)}%`, cx, pocketTop - 12, 12, '#c4b5fd');
    if (pk.state) {
      const ok = pk.state.includes('成功');
      ctx.fillStyle = ok ? 'rgba(255,209,102,.9)' : 'rgba(20,27,63,.9)';
      rr(cx - 38, pocketTop + 28, 76, 20, 10); ctx.fill();
      txt(pk.state, cx, pocketTop + 38, 11, ok ? '#3a1a7a' : '#9aa6c8', 900);
    }
  }

  // 入口
  const c = catcher;
  txt('⇣ 入口得寶可夢', c.cx, c.y - 18, 13, '#5ef2ff');
  ctx.fillStyle = 'rgba(94,242,255,.10)'; ctx.fillRect(c.cx - c.open + 2, c.y + c.depth, (c.open - 2) * 2, H - c.y - c.depth);
  neonLine([c.cx - c.hw, c.y, c.cx - c.open, c.y + c.depth], c.f > 0 ? '#ffd166' : '#5ef2ff', 6);
  neonLine([c.cx + c.hw, c.y, c.cx + c.open, c.y + c.depth], c.f > 0 ? '#ffd166' : '#5ef2ff', 6);
  if (c.f > 0) { ctx.fillStyle = `rgba(255,209,102,${c.f * 0.5})`; ctx.beginPath(); ctx.arc(c.cx, c.y + c.depth, 28, 0, Math.PI * 2); ctx.fill(); }

  // 底部分隔
  for (const w of walls.slice(2)) neonLine(w, 'rgba(167,139,250,.75)', 3);

  for (const b of balls) ctx.drawImage(BALL_SPR, b.x - b.r - 1, b.y - b.r - 1, b.r * 2 + 2, b.r * 2 + 2);

  for (const p of parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
  ctx.globalAlpha = 1;
  for (const f of floats) { ctx.globalAlpha = 1 - f.t / 1.2; txt(f.text, f.x, f.y - f.t * 40, 16, f.color); }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/* ============ 介面 ============ */
function setK(k, v) { document.querySelectorAll(`[data-k="${k}"]`).forEach(e => { e.textContent = v; }); }
function setBar(k, r) { document.querySelectorAll(`[data-bar="${k}"]`).forEach(e => { e.style.width = (r * 100).toFixed(1) + '%'; }); }
function refreshUI() {
  const dc = dexCount(), sc = shinyCount(), lc = legendCount();
  setK('balls', S.game.balls); setK('dex', dc); setK('shiny', sc); setK('legend', lc);
  setK('caught', S.game.caught); setK('shots', S.game.shots); setK('newdex', S.game.newDex);
  setBar('dex', dc / 151); setBar('shiny', sc / 151); setBar('legend', lc / 5);
  $('ammoChip').classList.toggle('low', S.game.balls <= 10);
  $('boxCnt').textContent = S.box.length;
  $('btnBox').classList.toggle('ready', S.box.length > 0);
}
function renderRecent() {
  const html = S.recent.slice(0, 12).map(r => `<div class="rc-mini ${r.s ? 'shiny' : ''}" title="${P[r.id].zh}"><img src="${imgSrc(r.id, r.s)}" alt="${P[r.id].zh}"></div>`).join('')
    || '<div style="grid-column:1/-1;font-size:12px;color:var(--mut)">開箱後會出現在這裡</div>';
  document.querySelectorAll('[data-recent]').forEach(e => { e.innerHTML = html; });
}
let lastBoxSec = -1;
function updateTimerUI() {
  const sec = Math.ceil(roundLeft);
  if (sec === lastBoxSec) return;
  lastBoxSec = sec;
  $('boxTime').textContent = `開箱 ${sec}s`;
  $('boxRing').style.strokeDashoffset = (106.8 * roundLeft / ROUND_SEC).toFixed(1);
  const tb = $('tiltBar'); tb.style.width = tilt + '%'; tb.classList.toggle('hot', tilt > 60);
}
let toastT = null;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }
let bannerT = null;
function showBanner({ kind = '', tag, title, sub, img, sil = false, hold = 2600 }) {
  const el = $('banner'), im = el.querySelector('img');
  el.className = 'banner ' + kind;
  im.src = img; im.classList.toggle('sil', sil);
  el.querySelector('.tag').textContent = tag; el.querySelector('b').textContent = title; el.querySelector('.sub').textContent = sub;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), hold);
}
function boardFlash() { const f = $('bflash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
function legendBanner(id) {
  showBanner({ tag: '傳說反應', title: '？？？', sub: '有東西被大師球吸進去了…', img: imgSrc(id), sil: true, hold: 4000 });
  sfx.drumroll(1.1);
  setTimeout(() => {
    boardFlash(); sfx.flash(); sfx.fanfareBig();
    const el = $('banner');
    el.querySelector('img').classList.remove('sil');
    el.querySelector('.tag').textContent = '傳說寶可夢';
    el.querySelector('b').textContent = P[id].zh;
    el.querySelector('.sub').textContent = '收服成功！開箱時登錄圖鑑';
  }, 1150);
}

/* ============ 暫停／抽屜 ============ */
function pause(reason) { pauses.add(reason); holding = false; syncPauseUI(); }
function resume(reason) { pauses.delete(reason); syncPauseUI(); }
function togglePause() { pauses.has('user') ? resume('user') : pause('user'); }
function syncPauseUI() {
  const u = pauses.has('user');
  $('pauseOv').classList.toggle('show', u);
  $('btnPause').textContent = u ? '▶' : '⏸';
  $('btnPause').classList.toggle('on', u);
  $('drPause').textContent = u ? '▶ 繼續' : '⏸ 暫停';
}
const anyModal = () => ['mReveal', 'mDex', 'mSum'].some(id => $(id).classList.contains('show')) || $('drawer').classList.contains('show');
function openDrawer() { $('drawer').classList.add('show'); $('scrim').classList.add('show'); pause('drawer'); }
function closeDrawer() { $('drawer').classList.remove('show'); $('scrim').classList.remove('show'); resume('drawer'); }
$('btnPause').addEventListener('click', () => { AU.init(); togglePause(); });
$('btnResume').addEventListener('click', () => resume('user'));
$('btnMenu').addEventListener('click', () => { AU.init(); openDrawer(); });
$('drClose').addEventListener('click', closeDrawer);
$('scrim').addEventListener('click', closeDrawer);
$('drPause').addEventListener('click', () => { togglePause(); closeDrawer(); });
$('drDex').addEventListener('click', () => { closeDrawer(); openDex(); });
$('drBox').addEventListener('click', () => { closeDrawer(); openRound(); });
$('drNew').addEventListener('click', () => {
  if (!confirm('重開一局會把彈珠重設為 100 顆（圖鑑會保留），確定嗎？')) return;
  closeDrawer(); startNewGame();
});
$('btnBox').addEventListener('click', () => { AU.init(); openRound(); });
function syncSwitches() { $('swMusic').classList.toggle('on', S.music); $('swSfx').classList.toggle('on', S.sfx); }
$('swMusic').addEventListener('click', () => { AU.init(); S.music = !S.music; AU.setMusic(S.music); syncSwitches(); save(); });
$('swSfx').addEventListener('click', () => { AU.init(); S.sfx = !S.sfx; AU.setSfx(S.sfx); syncSwitches(); save(); });

/* ============ 開箱演出 ============ */
let skipping = false, sleepers = [];
const sleep = ms => new Promise(r => {
  if (skipping) return r();
  const t = setTimeout(r, ms);
  sleepers.push(() => { clearTimeout(t); r(); });
});
function skipAll() { skipping = true; sleepers.forEach(f => f()); sleepers = []; }

function openRound() {
  if (anyModal()) return;
  if (!S.box.length) { toast('收集倉是空的，先讓彈珠落進入口吧！'); return; }
  pause('reveal');
  const items = S.box.map(b => {
    const id = b.fixed || pickPokemon(b.ball);
    const shiny = !!b.shiny || Math.random() < SHINY_RATE[b.ball];
    return { id, shiny, ball: b.ball, tier: P[id].tier };
  });
  S.box = []; S.stats.rounds++; roundLeft = ROUND_SEC;

  const before = { dex: dexCount(), shiny: shinyCount(), legend: legendCount() };
  const news = [];
  for (const it of items) {
    const e = dexOf(it.id);
    it.isNew = !e.got;
    e.got = true;
    if (it.shiny) { e.s++; e.gotS = true; S.game.shiny++; } else e.n++;
    if (it.isNew) news.push(it);
    const score = TIER_RANK[it.tier] + (it.shiny ? 1.5 : 0) + it.id / 1000;
    if (!S.game.best || score > S.game.best.score) S.game.best = { id: it.id, shiny: it.shiny, score };
    S.recent.unshift({ id: it.id, s: it.shiny });
  }
  // 集滿 3 隻相同（非閃光）自動進化，可連鎖
  const evos = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const p of POKEDEX) {
      const e = S.dex[p.id];
      if (e && e.n >= 3 && CHILDREN[p.id]) {
        const kids = CHILDREN[p.id], to = kids[Math.floor(Math.random() * kids.length)];
        e.n -= 3;
        const t = dexOf(to), isNew = !t.got;
        t.got = true; t.n++;
        evos.push({ from: p.id, to, isNew });
        S.recent.unshift({ id: to, s: false });
        changed = true;
      }
    }
  }
  S.recent = S.recent.slice(0, 24);
  const after = { dex: dexCount(), shiny: shinyCount(), legend: legendCount() };
  S.game.newDex += after.dex - before.dex;
  save(); refreshUI(); renderRecent();

  $('mReveal').classList.add('show');
  runReveal(items).then(() => {
    $('rvNext').onclick = () => {
      showDexUpdate(news, evos, before, after);
      $('rvNext').onclick = closeReveal;
    };
  });
}
function closeReveal() {
  $('mReveal').classList.remove('show');
  resume('reveal');
  if (pendingSummary) { pendingSummary = false; showSummary(); }
}

function fitGrid(el, n, aspect) {
  const w = el.clientWidth, h = el.clientHeight, gap = 8;
  let best = 0, bc = 1;
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c);
    const cw = (w - gap * (c - 1)) / c, chh = (h - gap * (rows - 1)) / rows;
    const s = Math.min(cw, chh * aspect, 170);
    if (s > best) { best = s; bc = c; }
  }
  best = Math.max(best, 60);
  el.style.gridTemplateColumns = `repeat(${bc}, ${Math.floor(best)}px)`;
  el.style.gridAutoRows = `${Math.floor(best / aspect)}px`;
}
const isSpecial = it => it.shiny || it.tier === 'srare' || it.tier === 'legend';
function badgesHTML(it) {
  const b = [];
  if (it.isNew) b.push('<span class="badge">NEW</span>');
  if (it.shiny) b.push('<span class="badge t shiny">閃光</span>');
  if (it.tier !== 'common') b.push(`<span class="badge t ${it.tier}">${TIER_NAME[it.tier]}</span>`);
  return b.join('');
}

async function runReveal(items) {
  skipping = false;
  const order = { legend: 0, srare: 1, rare: 2, common: 3 };
  const list = items.slice().sort((a, b) => (b.shiny - a.shiny) || (order[a.tier] - order[b.tier]) || (a.id - b.id));
  const nSpecial = list.filter(isSpecial).length;
  $('rvTag').textContent = '開箱';
  $('rvTitle').textContent = '去吧，精靈球！';
  $('rvRight').textContent = `${list.length} 顆`;
  $('rvNote').textContent = nSpecial ? `有 ${nSpecial} 顆球在發光…` : '';
  $('rvNext').disabled = true; $('rvNext').textContent = '下一步'; $('rvNext').onclick = null;
  $('rvSkip').style.display = '';
  const body = $('rvBody');
  body.innerHTML = `<div class="rgrid">${list.map(it => `<div class="rc ball ${it.tier} ${it.shiny ? 'isshiny' : ''}">
      <span class="no">No.${pad3(it.id)}</span><div class="badges">${badgesHTML(it)}</div>
      <img src="${imgSrc(it.id, it.shiny)}" alt=""><div class="nm">？？？</div>
      <div class="ballw"><span class="pb ${it.ball}"></span></div></div>`).join('')}</div>`;
  const gridEl = body.firstElementChild, cards = [...gridEl.children];
  await new Promise(r => requestAnimationFrame(r));
  fitGrid(gridEl, cards.length, 0.82);

  await sleep(700);
  // 第一波：球打開，全部先變成 ？？？ 剪影
  const step1 = clamp(900 / cards.length, 25, 90);
  for (let i = 0; i < cards.length; i++) {
    cards[i].classList.remove('ball'); cards[i].classList.add('sil');
    if (isSpecial(list[i])) cards[i].classList.add('hot');
    if (i % 2 === 0) sfx.pop();
    await sleep(step1);
  }
  await sleep(600);
  // 第二波：一般的依序閃光揭曉
  const step2 = clamp(1600 / cards.length, 40, 160);
  for (let i = cards.length - 1; i >= 0; i--) {
    if (isSpecial(list[i])) continue;
    revealCard(cards[i], list[i]);
    if (!skipping) { sfx.ding(TIER_RANK[list[i].tier]); if (list[i].tier === 'rare') sfx.sparkle(); }
    await sleep(step2);
  }
  // 特別的逐一聚光燈揭曉
  for (let i = cards.length - 1; i >= 0; i--) {
    if (!isSpecial(list[i])) continue;
    if (!skipping) await spotlight(list[i]);
    revealCard(cards[i], list[i]);
  }
  const hasLegend = list.some(i => i.tier === 'legend'), hasShiny = list.some(i => i.shiny), hasRare = list.some(i => i.tier !== 'common');
  $('rvTitle').textContent = hasLegend ? '傳說寶可夢降臨！' : hasShiny ? '閃光寶可夢出現了！' : hasRare ? '稀有寶可夢登場！' : '開箱完成！';
  $('rvNote').textContent = '集滿 3 隻相同寶可夢會自動進化';
  $('rvSkip').style.display = 'none';
  $('rvNext').disabled = false;
  skipping = false;
}
function revealCard(card, it) {
  card.classList.remove('sil', 'hot', 'ball'); card.classList.add('show');
  card.querySelector('.nm').textContent = (it.shiny ? '✨' : '') + P[it.id].zh;
}
function flashScreen(rainbow) {
  const f = $('flash'); f.classList.remove('go'); f.classList.toggle('rainbow', !!rainbow); void f.offsetWidth; f.classList.add('go');
}
async function spotlight(it) {
  const sp = $('spot');
  const hint = it.tier === 'legend' ? ['⚡ 傳說反應！！！', '#c4b5fd', 'rgba(167,139,250,.14)']
    : it.shiny ? ['✨ 閃光反應！！', '#ffd166', 'rgba(255,209,102,.13)']
    : ['★ 超稀有反應！', '#fbbf24', 'rgba(251,191,36,.1)'];
  sp.className = 'spot show' + (it.shiny ? ' shiny' : '');
  sp.style.setProperty('--hint', hint[1]); sp.style.setProperty('--ray', hint[2]);
  $('spHint').textContent = hint[0];
  $('spImg').src = imgSrc(it.id, it.shiny);
  $('spName').textContent = '？？？';
  $('spMeta').innerHTML = `<span class="pb ${it.ball}"></span>${BALL_NAME[it.ball]}`;
  sfx.drumroll(1.5);
  await waitTapOr(1500, false);
  if (skipping) return;
  flashScreen(it.shiny);
  sfx.flash();
  await sleep(120);
  sp.classList.add('revealed');
  $('spHint').textContent = it.tier === 'legend' ? '傳說寶可夢' : it.shiny ? '閃光寶可夢' : TIER_NAME[it.tier] + '寶可夢';
  $('spName').textContent = P[it.id].zh;
  $('spMeta').innerHTML = `No.${pad3(it.id)} ${badgesHTML(it)}`;
  if (it.tier === 'legend' || it.shiny) sfx.fanfareBig(); else sfx.fanfareRare();
  await waitTapOr(3200, true);
  sp.className = 'spot';
}
function waitTapOr(ms, allowTap) {
  return new Promise(r => {
    if (skipping) return r();
    const sp = $('spot');
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(t); sp.removeEventListener('click', onTap); r(); };
    const onTap = () => { if (allowTap) fin(); };
    const t = setTimeout(fin, ms);
    sp.addEventListener('click', onTap);
    sleepers.push(fin);
  });
}
$('rvSkip').addEventListener('click', () => { skipAll(); $('spot').className = 'spot'; });

function showDexUpdate(news, evos, before, after) {
  $('rvTag').textContent = '圖鑑';
  $('rvTitle').textContent = '圖鑑已更新';
  $('rvRight').textContent = `新登錄 ${after.dex - before.dex} 種`;
  $('rvNote').textContent = '圖鑑一旦點亮就永久保留';
  $('rvNext').textContent = '繼續冒險';
  const bar = (label, a, b, total, grad) => `<div class="prog"><span>${label}${b > a ? `<span class="plus">+${b - a}</span>` : ''}</span><span class="num">${b} / ${total}</span>
    <div class="bar"><i style="width:${a / total * 100}%;background:${grad}" data-w="${b / total * 100}%"></i></div></div>`;
  let html = `<div class="upd"><section>${bar('關都圖鑑', before.dex, after.dex, 151, 'linear-gradient(90deg,#5ef2ff,#60a5fa)')}
    ${bar('閃光圖鑑', before.shiny, after.shiny, 151, 'linear-gradient(90deg,#ff5f9e,#ffd166)')}
    ${bar('傳說寶可夢', before.legend, after.legend, 5, 'linear-gradient(90deg,#a78bfa,#ff4fa3)')}</section>`;
  if (evos.length) html += `<section><h4>進化！</h4><div class="evos">${evos.map(e => `<div class="evo"><img src="${imgSrc(e.from)}" alt="">×3<span class="ar">➜</span><img src="${imgSrc(e.to)}" alt="">${P[e.to].zh}${e.isNew ? ' <span class="badge">NEW</span>' : ''}</div>`).join('')}</div></section>`;
  html += `<section><h4>本輪新登錄</h4>${news.length ? `<div class="news">${news.map(it => `<div><img src="${imgSrc(it.id, it.shiny)}" alt="">${P[it.id].zh}</div>`).join('')}</div>` : '<div class="empty">沒有新種類，重複的寶可夢會累積起來準備進化</div>'}</section></div>`;
  $('rvBody').innerHTML = html;
  setTimeout(() => $('rvBody').querySelectorAll('.bar i').forEach(i => { i.style.width = i.dataset.w; }), 80);
  if (evos.length) sfx.fanfareRare();
}

/* ============ 結算 ============ */
function showSummary() {
  const g = S.game;
  pause('summary');
  sfx.gameOver();
  const best = g.best;
  $('sumBest').innerHTML = best
    ? `<img src="${imgSrc(best.id, best.shiny)}" alt=""><b>${best.shiny ? '✨' : ''}${P[best.id].zh}</b><small>本局最佳收穫・${TIER_NAME[P[best.id].tier]}</small>`
    : '<b>這局沒有收穫</b><small>下次瞄準移動的入口試試看！</small>';
  $('sumGrid').innerHTML = [['發射', g.shots], ['捕獲', g.caught], ['新登錄', g.newDex], ['閃光', g.shiny]]
    .map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  $('mSum').classList.add('show');
}
function startNewGame() {
  S.game = newGame(); balls = []; pendingSummary = false; roundLeft = ROUND_SEC;
  save(); refreshUI(); toast('新的一局開始！共 100 顆彈珠');
}
$('sumAgain').addEventListener('click', () => { $('mSum').classList.remove('show'); resume('summary'); startNewGame(); });
$('sumDex').addEventListener('click', () => { $('mSum').classList.remove('show'); resume('summary'); startNewGame(); openDex(); });

/* ============ 圖鑑（分頁，不用捲動） ============ */
let dexFilter = 'all', dexPage = 0;
const shinyView = new Set();
function openDex() {
  pause('dex'); dexPage = 0;
  $('mDex').classList.add('show');
  $('dxTop').innerHTML = `<span>已登錄 <b>${dexCount()}</b>/151</span><span>閃光 <b>${shinyCount()}</b></span><span>傳說 <b>${legendCount()}</b>/5</span>
    <div class="tabs">${[['all', '全部'], ['got', '已登錄'], ['miss', '未登錄'], ['shiny', '閃光']].map(([f, t]) => `<button data-f="${f}" class="${f === dexFilter ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  requestAnimationFrame(renderDex);
}
function closeDex() { $('mDex').classList.remove('show'); resume('dex'); }
function renderDex() {
  const gridEl = $('dxGrid'), box = gridEl.parentElement;
  const w = box.clientWidth, h = box.clientHeight;
  const cols = Math.max(3, Math.floor((w + 6) / 84)), rows = Math.max(2, Math.floor((h + 6) / 104));
  const per = cols * rows;
  const list = POKEDEX.filter(p => {
    const e = S.dex[p.id];
    return dexFilter === 'all' || (dexFilter === 'got' ? e && e.got : dexFilter === 'miss' ? !(e && e.got) : e && e.gotS);
  });
  const pages = Math.max(1, Math.ceil(list.length / per));
  dexPage = clamp(dexPage, 0, pages - 1);
  gridEl.style.gridTemplateColumns = `repeat(${cols},1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${rows},1fr)`;
  gridEl.innerHTML = list.slice(dexPage * per, dexPage * per + per).map(p => {
    const e = S.dex[p.id] || {}, sh = shinyView.has(p.id) && e.gotS;
    return `<div class="dcell ${e.got ? '' : 'miss'} ${sh ? 'sh' : ''}" data-id="${p.id}"><span class="n">${pad3(p.id)}</span>
      ${e.got ? `<span class="c">×${(e.n || 0) + (e.s || 0)}</span>` : ''}${e.gotS ? '<span class="st">✨</span>' : ''}
      <img src="${imgSrc(p.id, sh)}" alt=""><div class="nm">${e.got ? p.zh : '？？？'}</div></div>`;
  }).join('') || '<div class="empty" style="grid-column:1/-1">還沒有符合的寶可夢</div>';
  $('dxPage').textContent = `${dexPage + 1}/${pages}`;
}
$('dxGrid').addEventListener('click', e => {
  const c = e.target.closest('.dcell'); if (!c) return;
  const id = +c.dataset.id;
  if (!(S.dex[id] && S.dex[id].gotS)) return;
  shinyView.has(id) ? shinyView.delete(id) : shinyView.add(id);
  renderDex();
});
$('dxTop').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]'); if (!b) return;
  dexFilter = b.dataset.f; dexPage = 0;
  $('dxTop').querySelectorAll('button[data-f]').forEach(x => x.classList.toggle('on', x === b));
  renderDex();
});
$('dxPrev').addEventListener('click', () => { dexPage--; renderDex(); });
$('dxNext').addEventListener('click', () => { dexPage++; renderDex(); });
$('dxClose').addEventListener('click', closeDex);
let swipeX = null;
$('dxGrid').addEventListener('pointerdown', e => { swipeX = e.clientX; });
$('dxGrid').addEventListener('pointerup', e => {
  if (swipeX === null) return;
  const dx = e.clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 50) { dexPage += dx < 0 ? 1 : -1; renderDex(); }
});
window.addEventListener('keydown', e => {
  if (!$('mDex').classList.contains('show')) return;
  if (e.key === 'ArrowRight') { dexPage++; renderDex(); }
  if (e.key === 'ArrowLeft') { dexPage--; renderDex(); }
  if (e.key === 'Escape') closeDex();
});

/* ============ 測試工具 ============ */
$('dbBalls').addEventListener('click', () => { S.game.balls += 100; S.game.ended = false; refreshUI(); toast('測試：+100 彈珠'); });
$('dbBox').addEventListener('click', () => { for (let i = 0; i < 10; i++) S.box.push({ ball: rollBallType() }); refreshUI(); toast('測試：收集倉 +10'); });
$('dbSpeed').addEventListener('click', e => { speed = speed % 3 + 1; e.target.textContent = `速度 ×${speed}`; e.target.classList.toggle('on', speed > 1); });
$('dbAuto').addEventListener('click', e => { autoTest = !autoTest; e.target.textContent = `自動發射：${autoTest ? '開' : '關'}`; e.target.classList.toggle('on', autoTest); });
$('dbLegend').addEventListener('click', () => { S.charge = S.charge.map(c => Math.min(99, c + 50)); toast('測試：兩側傳說充能 +50%'); });
$('dbReset').addEventListener('click', () => {
  if (!confirm('確定要清除所有存檔（圖鑑、彈珠）嗎？')) return;
  const keep = { music: S.music, sfx: S.sfx };
  S = Object.assign(fresh(), keep); balls = []; save(); refreshUI(); renderRecent(); toast('存檔已清除，重新開始！');
});
window.__pachinko = () => ({ S, paused: isPaused(), roundLeft, H });
window.__sim = (sec, fireOn = true) => { const was = autoTest; autoTest = fireOn; for (let i = 0; i < sec * 60; i++) update(1 / 60); autoTest = was; return S.stats; };

/* ============ 主迴圈 ============ */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!isPaused()) for (let i = 0; i < speed; i++) update(dt);
  render(); updateTimerUI();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { holding = false; save(); AU.suspend(); } else AU.resume();
  last = performance.now();
});
window.addEventListener('beforeunload', save);
new ResizeObserver(fit).observe(wrapEl);
window.addEventListener('resize', () => { fit(); if ($('mDex').classList.contains('show')) renderDex(); });
fit(); syncSwitches(); refreshUI(); renderRecent();
if (S.game.ended) showSummary();
requestAnimationFrame(frame);
})();
