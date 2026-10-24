// 城都彈珠研究所 —— 金銀的城都圖鑑（251 隻：一代 151 隻＋二代新 100 隻；no＝城都圖鑑編號、id＝全國編號）
(() => {
'use strict';

/* ============ 常數 ============ */
const W = 540;
let H = 820;                        // 棋盤高度會依螢幕比例調整
const GRAV = 1150, BALL_R = 7, MAX_V = 1100;
const GAME_BALLS = 100, ROUND_SEC = 30;
const SUN_GOAL = 20, SUN_REWARD = 5, MOON_GOAL = 40;
// 效能：index.html 開頭已決定 PERF.lite（省電）與 PERF.T（大螢幕放大倍率）
const PERF = window.PERF || { lite: false, T: 1, big: false };
let LITE = !!PERF.lite;
const maxOnBoard = () => (LITE ? 80 : 140);
const fx = n => (LITE ? Math.max(4, Math.round(n * 0.45)) : n);   // 粒子數量
const DAY_SEC = 60, ROAM_SEC = 20, NIGHT_RARE_MULT = 1.6;
const SAVE_KEY = 'johtoPachinko.v1';
const DEX_KEY = 'johtoPachinko.dex';       // 大廳讀這個算圖鑑進度
document.title = '城都彈珠研究所';
const BALL_NAME = { poke: '精靈球', great: '超級球', ultra: '高級球', master: '大師球', egg: '蛋' };
const TIER_NAME = { common: '普通', rare: '稀有', srare: '超稀有', legend: '傳說' };
const TIER_RANK = { common: 0, rare: 1, srare: 2, legend: 3 };
const LEGEND_POOLS = [[249, 250, 251], [243, 244, 245]];   // 左：固定輪流；右：三聖獸徘徊
const KIND_NAME = { steel: '鋼珠', gold: '金珠', silver: '銀珠' };
const FONT = '"Noto Sans TC",system-ui,sans-serif';
const PXFONT = '"Press Start 2P","Noto Sans TC",monospace';
const CX = 261;                     // 右側是發射軌道，台面中心略偏左
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad3 = n => String(n).padStart(3, '0');
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* ============ 資料整理 ============ */
const P = {};
POKEDEX.forEach(p => { P[p.id] = p; });
POKEDEX.forEach(p => { if (p.evoFrom && !P[p.evoFrom]) p.evoFrom = null; });   // 前置型不在本世代就當第一階
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
const EGG_POOL = POOL.filter(p => !p.evoFrom && p.bst < 320);        // 蛋會孵出的寶寶
const JP_POOL = POOL.filter(p => p.tier === 'rare' || p.tier === 'srare');
const STAGE_MULT = [1, 0.3, 0.1];
const imgSrc = (id, shiny) => `assets/${shiny ? 's' : 'n'}${id}.webp`;

// 球越高級，越容易抽到稀有／進化型；夜晚稀有以上 ×1.6
function weightFor(p, ball) {
  const c = p.capture, s = STAGE_MULT[p.stage];
  switch (ball) {
    case 'poke': return c * s;
    case 'great': return Math.pow(c, 0.6) * Math.pow(s, 0.7);
    case 'ultra': return Math.pow(c, 0.25) * Math.pow(s, 0.4);
    default: return 1 / Math.pow(c, 0.25);
  }
}
const WEIGHTS = {}, WEIGHTS_N = {};
['poke', 'great', 'ultra', 'master'].forEach(b => {
  let sum = 0, sumN = 0;
  WEIGHTS[b] = POOL.map(p => (sum += weightFor(p, b)));
  WEIGHTS_N[b] = POOL.map(p => (sumN += weightFor(p, b) * (p.tier === 'rare' || p.tier === 'srare' ? NIGHT_RARE_MULT : 1)));
});
function pickPokemon(ball) {
  const cum = (night ? WEIGHTS_N : WEIGHTS)[ball], r = Math.random() * cum[cum.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
  return POOL[lo].id;
}
const SHINY_RATE = { poke: 1 / 120, great: 1 / 80, ultra: 1 / 40, master: 1 / 15, egg: 1 / 20 };
function rollBallType() {
  const r = Math.random();
  return r < 0.006 ? 'master' : r < 0.05 ? 'ultra' : r < 0.22 ? 'great' : 'poke';
}

/* ============ 存檔 ============ */
const newGame = () => ({ balls: GAME_BALLS, shots: 0, caught: 0, newDex: 0, shiny: 0, best: null, ended: false });
const fresh = () => ({ dex: {}, sun: 0, moon: 0, charge: [0, 0], legIdx: [0, 0], box: [], recent: [], game: newGame(),
  stats: { caught: 0, shots: 0, rounds: 0, legend: 0, by: {}, balls: {}, kinds: {}, wheel: {} }, music: true, sfx: true });
if (/[?&]reset\b/.test(location.search)) {
  try { [SAVE_KEY, DEX_KEY].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  history.replaceState(null, '', location.pathname + (/[?&]tv\b/.test(location.search) ? '?tv' : ''));
}
let S;
try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
S = Object.assign(fresh(), S || {});
S.stats = Object.assign(fresh().stats, S.stats);
let shared = null;
try { shared = JSON.parse(localStorage.getItem(DEX_KEY)); } catch (e) {}
if (shared && shared.dex) { S.dex = shared.dex; S.recent = shared.recent || []; }
let saveT = 0;
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    localStorage.setItem(DEX_KEY, JSON.stringify({ dex: S.dex, recent: S.recent }));
  } catch (e) {}
}
const stat = (k, n = 1) => { S.stats[k] = (S.stats[k] || 0) + n; };
const statMap = (m, k, n = 1) => { const o = S.stats[m] = S.stats[m] || {}; o[k] = (o[k] || 0) + n; };
const dexOf = id => (S.dex[id] = S.dex[id] || { n: 0, s: 0, got: false, gotS: false });
const dexCount = () => POKEDEX.filter(p => S.dex[p.id] && S.dex[p.id].got).length;
const shinyCount = () => POKEDEX.filter(p => S.dex[p.id] && S.dex[p.id].gotS).length;
// 傳說只算口袋池裡抓得到的六隻（圖鑑裡的一代傳說這台抓不到）
const LEGEND_IDS = LEGEND_POOLS.flat();
const legendCount = () => LEGEND_IDS.filter(id => S.dex[id] && S.dex[id].got).length;
const N_LEGEND = LEGEND_IDS.length;

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
  // 背景音樂（城都版）：D–Bm–G–A ／ G–A–F#m–Bm，8 小節循環，比無印慢一點、高兩個半音
  let E = 60 / 126 / 2;
  const T = 2;
  const LEAD = [
    [78, 81, 86, 0, 85, 81, 78, 81], [83, 0, 86, 83, 78, 0, 83, 85], [86, 0, 83, 79, 83, 86, 88, 86], [85, 0, 81, 76, 81, 83, 85, 88],
    [86, 0, 86, 88, 90, 0, 88, 86], [85, 0, 85, 86, 88, 0, 86, 85], [83, 0, 81, 78, 81, 0, 83, 85], [86, 85, 83, 81, 79, 78, 76, 0],
  ];
  const ROOT = [48, 45, 41, 43, 41, 43, 40, 45].map(r => r + T);
  const CHD = {};
  [[48, [60, 64, 67]], [45, [57, 60, 64]], [41, [53, 57, 60]], [43, [55, 59, 62]], [40, [52, 55, 59]]].forEach(([r, c]) => { CHD[r + T] = c.map(m => m + T); });
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, n = LEAD[bar][i], r = ROOT[bar];
    if (n) { osc(bgm, 'square', hz(n), t, E * 0.9, 0.026); osc(bgm, 'triangle', hz(n), t, E * 1.4, 0.02); }
    osc(bgm, 'triangle', hz(i % 2 ? r + 12 : r), t, E * 0.85, 0.075);
    if (i % 2 === 1) CHD[r].forEach(m => osc(bgm, 'square', hz(m), t, E * 0.35, 0.007));
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
    launch(p) { if (!ac) return; noise(sfx, ac.currentTime, 0.12, 0.12, 'bandpass', 900 + p * 1800); osc(sfx, 'sine', 300 + p * 500, ac.currentTime, 0.14, 0.06, 900 + p * 900); },
    charge() { if (ac) osc(sfx, 'sine', 180, ac.currentTime, 0.1, 0.03, 260); },
    bump() { if (!ac) return; osc(sfx, 'triangle', 660, ac.currentTime, 0.12, 0.07); osc(sfx, 'triangle', 990, ac.currentTime + 0.05, 0.1, 0.05); },
    thud() { if (ac) osc(sfx, 'triangle', 220, ac.currentTime, 0.08, 0.04, 140); },
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
    spin() { if (!ac) return; [72, 76, 79, 84, 88].forEach((m, i) => osc(sfx, 'square', hz(m), ac.currentTime + i * 0.04, 0.06, 0.03)); },
    wheelTick() { if (ac) osc(sfx, 'square', 1800, ac.currentTime, 0.02, 0.014); },
    wheelStop() { if (!ac) return; osc(sfx, 'triangle', 320, ac.currentTime, 0.12, 0.12, 140); noise(sfx, ac.currentTime, 0.06, 0.08, 'lowpass', 1200); },
    hold() { if (ac) osc(sfx, 'sine', 1200, ac.currentTime, 0.12, 0.06, 1800); },
    dayNight(toNight) { duck(1.2); notes(toNight ? [[79, 0.12], [76, 0.12], [72, 0.3]] : [[72, 0.12], [76, 0.12], [79, 0.3]], 'triangle', 0.05); },
    egg() { notes([[76, 0.08], [79, 0.08], [83, 0.08], [88, 0.2]], 'triangle', 0.05); },
    gameOver() { duck(2.5); notes([[72, 0.12], [79, 0.12], [76, 0.12], [84, 0.12], [83, 0.12], [79, 0.12], [84, 0.6]], 'square', 0.045); },
  };
  return { init, play, setMusic, setSfx, suspend: () => ac && ac.suspend(), resume: () => ac && ac.resume() };
})();
const sfx = AU.play;

/* ============ 畫布與版面 ============ */
const cv = $('cv');
let ctx = cv.getContext('2d');
const frameEl = $('boardFrame'), wrapEl = $('boardWrap');
const CHROME_X = 22, CHROME_Y = 60;   // GBC 卡匣外框佔掉的空間（左右 padding、上方標籤列）
let scale = 1, bgK = 0, BG = null, BGN = null, wheelFace = null, wheelFaceK = 0;

const bumpers = [{ x: 150, y: 0, r: 25, kind: 'sun', f: 0 }, { x: 380, y: 0, r: 25, kind: 'moon', f: 0 }];
const wheel = { x: CX, y: 0, R: 110, ang: 0, f: 0 };
const cup = { x: CX, y: 0, hw: 18, depth: 18, open: 10, f: 0 };
const catcher = { cx: CX, y: 0, hw: 46, depth: 40, open: 13, f: 0 };
const pockets = [{ side: 0, x0: 9, x1: 114, state: '', st: 0 }, { side: 1, x0: 426, x1: 513, state: '', st: 0 }];
// 右側發射軌道：直通道 x 513–531，頂端是四分之一圓弧（圓心 453,78，內徑 60、外徑 78）
const RAIL = { x0: 513, x1: 531, cx: 453, cy: 78, ri: 60, ro: 78, gy: GRAV * 0.5 };
const LAUNCH_X = 522;
let walls = [], pegs = [], grid = [], GC = 0, GR = 0, pegTop = 92, pegBot = 600, pocketTop = 700, STARS = [];
const CELL = 40;

function layout(newH) {
  H = newH; pegTop = 92; pegBot = H - 222;
  const span = pegBot - pegTop;
  bumpers.forEach(b => { b.y = Math.round(pegTop + span * 0.15); });
  wheel.y = Math.round(pegTop + span * 0.5);
  cup.y = wheel.y + wheel.R + 26;
  catcher.y = H - 168;
  pocketTop = H - 92;
  walls = [[9, -400, 9, H], [531, -400, 531, H], [0, -120, W, -120], [9, H - 150, 34, H - 126], [RAIL.x0, RAIL.cy, RAIL.x0, H + 20], [114, pocketTop, 114, H + 20], [426, pocketTop, 426, H + 20]];
  pegs = [];
  for (let row = 0, y = pegTop; y <= pegBot; y += 30, row++) {
    const off = row % 2 ? 20 : 0;
    for (let x = 30 + off; x <= 490; x += 40) {
      if (bumpers.some(b => Math.hypot(x - b.x, y - b.y) < b.r + 26)) continue;
      if (bumpers.some(b => Math.abs(x - b.x) < 46 && y > b.y + 30 && y < b.y + 68)) continue;
      if (Math.hypot(x - wheel.x, y - wheel.y) < wheel.R + 22) continue;
      if (Math.hypot(x - cup.x, y - cup.y - 8) < 36) continue;
      pegs.push({ x, y, r: 4, f: 0 });
    }
  }
  GC = Math.ceil(W / CELL); GR = Math.ceil((H + 60) / CELL);
  grid = Array.from({ length: GC * GR }, () => []);
  pegs.forEach(p => {
    for (let gx = Math.floor((p.x - 12) / CELL); gx <= Math.floor((p.x + 12) / CELL); gx++)
      for (let gy = Math.floor((p.y - 12) / CELL); gy <= Math.floor((p.y + 12) / CELL); gy++)
        if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) grid[gx + gy * GC].push(p);
  });
  STARS = Array.from({ length: LITE ? 28 : 70 }, () => ({ x: 14 + Math.random() * (W - 28), y: Math.random() * H * 0.75, s: 0.6 + Math.random() * 1.4, ph: Math.random() * 6.3, sp: 1.5 + Math.random() * 3 }));
  bgK = 0;
}

function fit() {
  const cw = wrapEl.clientWidth - CHROME_X, ch = wrapEl.clientHeight - CHROME_Y;
  if (cw <= 0 || ch <= 0) return;
  const newH = Math.round(clamp(W * ch / cw, 740, 1100));
  if (Math.abs(newH - H) > 3 || !pegs.length) layout(newH);
  scale = Math.min(cw / W, ch / H);
  // 實際螢幕像素 = 版面 px × 大螢幕放大倍率 T × 裝置像素比；省電模式壓低解析度上限
  const T = PERF.T || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 2);
  let k = scale * dpr * T;
  const cap = LITE ? 900000 : 2600000;                   // 畫布像素上限
  if (W * H * k * k > cap) k = Math.sqrt(cap / (W * H));
  frameEl.style.width = W * scale + 'px'; frameEl.style.height = H * scale + 'px';
  cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  if (bgK !== k) { BG = buildBackground(k, false); BGN = buildBackground(k, true); wheelFace = null; bgK = k; }
}

function buildBackground(k, isNight) {
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext('2d'); g.scale(k, k);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#0b2f28'); grd.addColorStop(0.55, '#06201a'); grd.addColorStop(1, '#041711');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // 金屬拉絲
  g.strokeStyle = 'rgba(232,200,114,.035)'; g.lineWidth = 1;
  for (let y = 0; y < H; y += 4) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
  const glow = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(bumpers[0].x, bumpers[0].y, 120, 'rgba(255,200,80,.12)');
  glow(bumpers[1].x, bumpers[1].y, 120, 'rgba(160,190,255,.12)');
  glow(wheel.x, wheel.y, 200, 'rgba(232,200,114,.12)');
  glow(CX, H - 140, 200, 'rgba(207,214,230,.07)');
  // 細點陣
  g.fillStyle = 'rgba(232,200,114,.06)';
  for (let y = 10; y < H; y += 18) for (let x = 10 + ((y / 18) % 2) * 9; x < RAIL.x0 - 4; x += 18) g.fillRect(x, y, 1.2, 1.2);
  // 發射軌道：直通道＋頂端弧
  g.fillStyle = 'rgba(232,200,114,.08)';
  g.fillRect(RAIL.x0, RAIL.cy, RAIL.x1 - RAIL.x0, H - RAIL.cy);
  g.beginPath(); g.arc(RAIL.cx, RAIL.cy, RAIL.ro, 0, -Math.PI / 2, true); g.arc(RAIL.cx, RAIL.cy, RAIL.ri, -Math.PI / 2, 0); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(232,200,114,.55)'; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(RAIL.x0, H); g.lineTo(RAIL.x0, RAIL.cy); g.arc(RAIL.cx, RAIL.cy, RAIL.ri, 0, -Math.PI / 2, true); g.stroke();
  g.beginPath(); g.moveTo(RAIL.x1 - 1, H); g.lineTo(RAIL.x1 - 1, RAIL.cy); g.arc(RAIL.cx, RAIL.cy, RAIL.ro - 1, 0, -Math.PI / 2, true); g.stroke();
  g.strokeStyle = 'rgba(232,200,114,.25)'; g.lineWidth = 1;
  for (let y = RAIL.cy + 20; y < H - 20; y += 26) { g.beginPath(); g.moveTo(RAIL.x0 + 3, y); g.lineTo(RAIL.x1 - 3, y); g.stroke(); }
  // 底部口袋
  pockets.forEach(pk => { g.fillStyle = 'rgba(167,139,250,.07)'; g.fillRect(pk.x0 + 1, pocketTop, pk.x1 - pk.x0 - 2, H - pocketTop); });
  const fade = g.createLinearGradient(0, H - 40, 0, H); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = fade; g.fillRect(0, H - 40, W, 40);
  if (isNight) {
    const ng = g.createLinearGradient(0, 0, 0, H);
    ng.addColorStop(0, 'rgba(8,18,70,.62)'); ng.addColorStop(1, 'rgba(6,12,40,.45)');
    g.fillStyle = ng; g.fillRect(0, 0, W, H);
  }
  // 靜止的金色小釘（被碰到發亮的那幾顆在 render 另外畫）
  for (const p of pegs) {
    g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(p.x - 1.2, p.y - 1.3, 1.2, 0, Math.PI * 2); g.fill();
  }
  // 省電模式沒有 CSS 網格罩，改成淡淡烤進背景
  if (LITE) {
    g.fillStyle = 'rgba(0,0,0,.08)';
    const st = 3 / Math.max(0.5, scale);
    for (let y = 0; y < H; y += st) g.fillRect(0, y, W, 1 / Math.max(0.5, scale));
  }
  return c;
}

const legendImgs = {};
LEGEND_POOLS.flat().forEach(id => { const im = new Image(); im.src = imgSrc(id, false); legendImgs[id] = im; });

// 三種珠的貼圖：鋼珠（精靈球）、金珠、銀珠
function ballSprite(kind) {
  const c = document.createElement('canvas'), s = 40; c.width = c.height = s;
  const g = c.getContext('2d'), r = 17, cx = 20, cy = 20;
  if (kind === 'steel') {
    g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff4d5e'; g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.fill();
    g.strokeStyle = '#0b0f24'; g.lineWidth = 3.5; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
    g.fillStyle = '#f4f6ff'; g.beginPath(); g.arc(cx, cy, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
  } else {
    const gold = kind === 'gold';
    const rg = g.createRadialGradient(cx - 6, cy - 7, 2, cx, cy, r);
    if (gold) { rg.addColorStop(0, '#fff7cf'); rg.addColorStop(0.35, '#f0c85a'); rg.addColorStop(0.8, '#a87414'); rg.addColorStop(1, '#5a3f0a'); }
    else { rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.35, '#dfe6f3'); rg.addColorStop(0.8, '#8d97ad'); rg.addColorStop(1, '#3d4556'); }
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = gold ? '#4a3208' : '#2b3140'; g.lineWidth = 2.5; g.stroke();
    g.fillStyle = gold ? '#4a3208' : '#2b3140'; g.font = `900 13px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(gold ? '★' : '☾', cx, cy + 1);
  }
  g.fillStyle = 'rgba(255,255,255,.65)'; g.beginPath(); g.arc(cx - 6, cy - 8, 3.5, 0, Math.PI * 2); g.fill();
  return c;
}
const BALL_SPR = { steel: ballSprite('steel'), gold: ballSprite('gold'), silver: ballSprite('silver') };
const BALL_URL = {}; for (const k in BALL_SPR) BALL_URL[k] = BALL_SPR[k].toDataURL();
// 蛋（開箱聚光燈用）
const EGG_URL = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 200; const g = c.getContext('2d');
  g.translate(100, 104); g.scale(1, 1.25);
  const rg = g.createRadialGradient(-22, -30, 4, 0, 0, 70); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.6, '#eef5e8'); rg.addColorStop(1, '#b9cbb2');
  g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 66, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#3b5a3a'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#5fb37a';
  [[-24, -22, 11], [20, -8, 9], [-6, 24, 8], [26, 26, 6], [-32, 14, 6]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  return c.toDataURL();
})();

/* ============ 狀態 ============ */
let balls = [], parts = [], floats = [];
let time = 0, speed = 1, autoTest = false;
const pauses = new Set();
const isPaused = () => pauses.size > 0;
// 拉桿：按住蓄力（力道來回跑），放開發射；按住超過 1.1 秒自動連發
let charging = false, chargeT = 0, holdT = 0, power = 0, autoFired = false, fireCD = 0, burstLeft = 0, burstPower = 0;
const BURST = 10, POWER_HALF = 0.8;
let tilt = 0, tiltLock = 0, shakeT = 0, shakeDir = 0;
let roundLeft = ROUND_SEC, pendingSummary = false;
let night = false, dayLeft = DAY_SEC;          // 日夜
let roamIdx = 0, roamLeft = ROAM_SEC;         // 右口袋三聖獸徘徊
let attackT = 0;                              // 大入賞口
// 第 n 顆（從 1 數）是哪種珠：每 7 顆金珠、每 5 顆銀珠
const KIND_OF = n => (n % 7 === 0 ? 'gold' : n % 5 === 0 ? 'silver' : 'steel');
const nextKind = () => KIND_OF(S.game.shots + 1);
const KIND = { steel: { e: 0.42, jit: 1, shake: 1 }, gold: { e: 0.3, jit: 1 / 3, shake: 0 }, silver: { e: 0.65, jit: 1, shake: 1.8 } };
const powerOf = t => { const c = t % (POWER_HALF * 2); return c < POWER_HALF ? c / POWER_HALF : 1 - (c - POWER_HALF) / POWER_HALF; };

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
const bumperActive = bp => (bp.kind === 'sun') !== night;

// 軌道內：只受軌道牆限制、不碰釘；用一半重力，力道決定出口速度
function stepRail(b, h) {
  b.vy += RAIL.gy * h;
  b.x += b.vx * h; b.y += b.vy * h;
  if (b.y >= RAIL.cy) {
    if (b.x < RAIL.x0 + b.r) { b.x = RAIL.x0 + b.r; b.vx = Math.abs(b.vx) * 0.2; }
    if (b.x > RAIL.x1 - b.r) { b.x = RAIL.x1 - b.r; b.vx = -Math.abs(b.vx) * 0.2; }
    if (b.y > H - 22 && b.vy > 0) {   // 沒衝上去又滑回來：退還這顆
      b.dead = true; S.game.balls++; stat('railBack'); addFloat(LAUNCH_X - 30, H - 60, '退回', '#9fb3a8'); refreshUI();
    }
    return;
  }
  const dx = b.x - RAIL.cx, dy = b.y - RAIL.cy, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  const lo = RAIL.ro - b.r, li = RAIL.ri + b.r;
  if (d > lo) { b.x = RAIL.cx + nx * lo; b.y = RAIL.cy + ny * lo; const vn = b.vx * nx + b.vy * ny; if (vn > 0) { b.vx -= vn * nx; b.vy -= vn * ny; } }
  else if (d < li) { b.x = RAIL.cx + nx * li; b.y = RAIL.cy + ny * li; const vn = b.vx * nx + b.vy * ny; if (vn < 0) { b.vx -= vn * nx; b.vy -= vn * ny; } }
  if (b.x < RAIL.cx - 3) { b.rail = false; if (b.vy > 0) b.vy = 0; }   // 繞過頂端弧，往左飛出
}

function stepBall(b, h) {
  if (b.rail) { stepRail(b, h); return; }
  const K = KIND[b.kind];
  b.vy += GRAV * h;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
  b.x += b.vx * h; b.y += b.vy * h;

  const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
  if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) {
    for (const p of grid[gx + gy * GC]) {
      if (hitCircle(b, p.x, p.y, p.r, K.e)) { b.vx += (Math.random() - 0.5) * 30 * K.jit; b.vx *= 0.985; p.f = 1; sfx.tick(); }
    }
  }
  for (const w of walls) hitSeg(b, w[0], w[1], w[2], w[3], 0.4);
  // 軌道頂端的弧形外殼：從台面這側碰到就彈開；真的跑進弧裡就當作在軌道上
  if (b.x > RAIL.cx && b.y < RAIL.cy + 2) {
    const dx = b.x - RAIL.cx, dy = b.y - RAIL.cy, d = Math.hypot(dx, dy) || 1;
    if (d >= RAIL.ri + 2) { if (b.vx > 0) b.rail = true; return; }   // 從左邊衝進弧裡才算上軌道；剛出口往左飛的不算
    const lim = RAIL.ri - b.r;
    if (d > lim) {
      const nx = dx / d, ny = dy / d;
      b.x = RAIL.cx + nx * lim; b.y = RAIL.cy + ny * lim;
      const vn = b.vx * nx + b.vy * ny; if (vn > 0) { b.vx -= 1.4 * vn * nx; b.vy -= 1.4 * vn * ny; }
    }
  }

  for (const bp of bumpers) {
    const on = bumperActive(bp);
    if (hitCircle(b, bp.x, bp.y, bp.r, on ? 0.9 : 0.5)) {
      if (!on) { if (time - (b.cool[bp.kind] || -1) > 0.25) { b.cool[bp.kind] = time; sfx.thud(); } continue; }
      const vn = b.vx * b.nx + b.vy * b.ny;
      if (vn < 380) { b.vx += (380 - vn) * b.nx; b.vy += (380 - vn) * b.ny; }
      if (time - (b.cool[bp.kind] || -1) > 0.25) { b.cool[bp.kind] = time; onBumper(bp, b); }
    }
  }

  // 啟動口（輪盤本身是半透明顯示面板，彈珠直接穿過）
  const ct = cup.y, cb = cup.y + cup.depth;
  if (b.y > ct - 20 && b.y < cb + 20 && Math.abs(b.x - cup.x) < cup.hw + 20) {
    hitSeg(b, cup.x - cup.hw, ct, cup.x - cup.open, cb, 0.3);
    hitSeg(b, cup.x + cup.hw, ct, cup.x + cup.open, cb, 0.3);
    if (b.y > cb - 4 && Math.abs(b.x - cup.x) < cup.open) { b.dead = true; onCup(b); return; }
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
function addFloat(x, y, text, color = '#e8c872') { floats.push({ x, y, text, color, t: 0 }); }
function burst(x, y, color, n = 14) {
  n = fx(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 200;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, t: 0, life: 0.6 + Math.random() * 0.5, color });
  }
}
function addToBox(item) { S.box.push(item); refreshUI(); }
function giveBalls(n, why, x = wheel.x, y = wheel.y + wheel.R + 20) {
  S.game.balls += n; S.game.ended = false; stat('bonusBalls', n);
  addFloat(x, y, `${why} 彈珠 +${n}`, '#e8c872'); sfx.reward(); refreshUI();
}

function onBumper(bp, b) {
  const n = b.kind === 'silver' ? 2 : 1;
  bp.f = 1; sfx.bump();
  stat(bp.kind === 'sun' ? 'sunHits' : 'moonHits', n);
  if (n === 2) addFloat(bp.x + 30, bp.y - 30, '銀珠 ×2', '#cfd6e6');
  if (bp.kind === 'sun') {
    S.sun += n;
    if (S.sun >= SUN_GOAL) {
      S.sun = 0; stat('sunRewards'); burst(bp.x, bp.y, '#ffd166', 26);
      giveBalls(SUN_REWARD, '☀ 太陽', bp.x, bp.y - 46);
      toast(`☀ 太陽碰滿 ${SUN_GOAL} 次，彈珠 +${SUN_REWARD}！`);
    }
  } else {
    S.moon += n;
    if (S.moon >= MOON_GOAL) {
      S.moon = 0; addToBox({ ball: 'great' }); stat('moonRewards'); sfx.reward(); burst(bp.x, bp.y, '#60a5fa', 26);
      addFloat(bp.x, bp.y - 46, '超級球 +1', '#60a5fa');
      toast(`🌙 月亮碰滿 ${MOON_GOAL} 次，送你一顆超級球！`);
    }
  }
}
function onCatch(b) {
  const mult = b.kind === 'gold' ? 2 : 1;
  const ball = rollBallType();
  for (let i = 0; i < mult; i++) addToBox({ ball });
  S.game.caught += mult; S.stats.caught += mult; stat('entrance'); statMap('balls', ball, mult);
  if (attackT > 0) { S.game.balls += 2; stat('bonusBalls', 2); stat('attackIn'); addFloat(catcher.cx + 40, catcher.y - 10, '+2 珠', '#e8c872'); }
  catcher.f = 1; sfx.catch(); burst(b.x, catcher.y + catcher.depth, ball === 'master' ? '#a78bfa' : '#cfd6e6');
  addFloat(catcher.cx, catcher.y - 34, `${BALL_NAME[ball]} +${mult}${mult > 1 ? '（金珠）' : ''}`, ball === 'master' ? '#c4b5fd' : ball === 'ultra' ? '#e8c872' : '#cfd6e6');
  if (ball === 'master') toast('哇！入口掉出了大師球！');
  refreshUI();
}
const legendId = side => (side === 0 ? LEGEND_POOLS[0][S.legIdx[0] % 3] : LEGEND_POOLS[1][roamIdx]);
function captureLegend(side) {
  const id = legendId(side);
  S.stats.legend++; S.game.caught++; S.stats.caught++;
  addToBox({ ball: 'master', fixed: id, shiny: Math.random() < 0.1 });
  S.charge[side] = 0;
  if (side === 0) S.legIdx[0]++; else { roamIdx = (roamIdx + 1) % 3; roamLeft = ROAM_SEC; }
  const pk = pockets[side]; pk.state = '收服成功！'; pk.st = 2.4;
  burst((pk.x0 + pk.x1) / 2, H - 50, '#a78bfa', 40);
  legendBanner(id);
}
function onPocket(side, b) {
  const pk = pockets[side];
  stat('pocketIn');
  if (Math.random() < 0.001 + S.charge[side] / 100 * 0.005 || S.charge[side] >= 100) return captureLegend(side);
  S.charge[side] = Math.min(100, S.charge[side] + 0.12);
  pk.state = '捕獲失敗'; pk.st = 1; sfx.fail();
  addFloat((pk.x0 + pk.x1) / 2, pocketTop - 50, '充能 +0.12%', '#c4b5fd');
  if (S.charge[side] >= 100) captureLegend(side);
}
function onLost(b) {
  stat('lost');
  const side = b.x < CX ? 0 : 1;
  S.charge[side] = Math.min(100, S.charge[side] + 0.02);
  if (S.charge[side] >= 100) captureLegend(side);
}

/* ============ 中央機關：大輪盤 ============ */
const SECTORS = [
  { k: 'b5', label: '+5', deg: 60, col: '#e8c872', fg: '#2a1d00' },
  { k: 'great', label: '超級球', deg: 40, col: '#3b82f6', fg: '#fff' },
  { k: 'b10', label: '+10', deg: 40, col: '#cfd6e6', fg: '#1b2233' },
  { k: 'egg', label: '蛋', deg: 35, col: '#5fb37a', fg: '#fff' },
  { k: 'b5', label: '+5', deg: 45, col: '#e8c872', fg: '#2a1d00' },
  { k: 'ultra', label: '高級球', deg: 35, col: '#2a2a2a', fg: '#ffd166' },
  { k: 'b20', label: '+20', deg: 30, col: '#cfd6e6', fg: '#1b2233' },
  { k: 'shiny', label: '閃光', deg: 25, col: '#ff4fa3', fg: '#fff' },
  { k: 'great', label: '超級球', deg: 30, col: '#3b82f6', fg: '#fff' },
  { k: 'jp', label: '大獎', deg: 20, col: '#ff4d5e', fg: '#fff' },
];
{ let a = 0; SECTORS.forEach(s => { s.a0 = a * Math.PI / 180; a += s.deg; s.a1 = a * Math.PI / 180; }); }
const SECTOR_LABEL = { b5: '彈珠 +5', b10: '彈珠 +10', b20: '彈珠 +20', great: '超級球', ultra: '高級球', egg: '蛋', shiny: '閃光', jp: '大獎' };
const HOLD_MAX = 4, SPIN_SEC = 3.6, JP_BALLS = 15, ATTACK_SEC = 12;
const wh = { state: 'idle', hold: 0, from: 0, to: 0, t0: 0, result: -1, showT: 0, lastSector: -1, forced: null };
const easeOutCubic = k => 1 - Math.pow(1 - k, 3);
const pointerSector = () => { const a = normAng(-Math.PI / 2 - wheel.ang); return SECTORS.findIndex(s => a >= s.a0 && a < s.a1); };

function onCup(b) {
  const add = b.kind === 'gold' ? 2 : 1;
  cup.f = 1;
  burst(b.x, cup.y + cup.depth, '#e8c872', 10);
  if (wh.hold < HOLD_MAX) { wh.hold = Math.min(HOLD_MAX, wh.hold + add); sfx.hold(); addFloat(cup.x, cup.y - 14, `保留 +${add}`, '#e8c872'); }
  else addFloat(cup.x, cup.y - 14, '保留已滿', '#9fb3a8');
  stat('hold');
}
function startSpin() {
  wh.hold--; stat('spins');
  let idx;
  if (wh.forced) { idx = SECTORS.findIndex(s => s.k === wh.forced); wh.forced = null; }
  else { let r = Math.random() * 360; idx = SECTORS.findIndex(s => (r -= s.deg) < 0); if (idx < 0) idx = 0; }
  const s = SECTORS[idx], margin = 3 * Math.PI / 180;
  const local = s.a0 + margin + Math.random() * (s.a1 - s.a0 - margin * 2);   // 指針要停在格內的這個角度
  const base = -Math.PI / 2 - local;
  let to = base; while (to < wheel.ang + Math.PI * 2 * (4 + Math.random())) to += Math.PI * 2;
  wh.from = wheel.ang; wh.to = to; wh.t0 = time; wh.result = idx; wh.state = 'spin'; wh.lastSector = pointerSector();
  sfx.spin();
}
function awardSector(idx) {
  const s = SECTORS[idx];
  statMap('wheel', s.k);
  switch (s.k) {
    case 'b5': giveBalls(5, '輪盤'); break;
    case 'b10': giveBalls(10, '輪盤'); break;
    case 'b20': giveBalls(20, '輪盤'); burst(wheel.x, wheel.y, '#e8c872', 24); break;
    case 'great': addToBox({ ball: 'great' }); sfx.reward(); addFloat(wheel.x, wheel.y + wheel.R + 20, '超級球 +1', '#60a5fa'); break;
    case 'ultra': addToBox({ ball: 'ultra' }); sfx.reward(); addFloat(wheel.x, wheel.y + wheel.R + 20, '高級球 +1', '#ffd166'); break;
    case 'egg':
      addToBox({ egg: true, ball: 'egg' }); stat('eggs'); sfx.egg(); burst(wheel.x, wheel.y, '#5fb37a', 20);
      addFloat(wheel.x, wheel.y + wheel.R + 20, '🥚 蛋 +1', '#9ee7b4'); toast('🥚 得到一顆蛋！開箱時會孵出寶寶寶可夢'); break;
    case 'shiny':
      addToBox({ ball: 'ultra', shiny: true }); stat('shinyWheel'); sfx.sparkle(); sfx.fanfareRare();
      burst(wheel.x, wheel.y, '#ff4fa3', 30); addFloat(wheel.x, wheel.y + wheel.R + 20, '閃光高級球！', '#ff4fa3');
      showBanner({ kind: 'shiny', tag: '閃光格', title: '必定閃光！', sub: '獲得必定閃光的高級球', img: imgSrc(172, true) }); break;
    case 'jp': jackpot(); break;
  }
}
function jackpot() {
  const id = pick(JP_POOL).id;
  stat('jackpot'); statMap('jpBy', id);
  boardFlash(); flashScreen(true); sfx.flash(); sfx.fanfareBig();
  burst(wheel.x, wheel.y, '#e8c872', 50); burst(wheel.x, wheel.y, '#ff4d5e', 30); burst(wheel.x, wheel.y, '#cfd6e6', 30);
  for (let k = 0; k < 3; k++) addToBox({ ball: 'ultra', fixed: id, shiny: Math.random() < 0.1 });   // 三隻同一隻 → 開箱直接進化
  S.game.caught += 3; S.stats.caught += 3;
  giveBalls(JP_BALLS, '大獎');
  attackT = ATTACK_SEC;
  showBanner({ tag: '大獎', title: `${P[id].zh} ×3`, sub: `大入賞口打開 ${ATTACK_SEC} 秒，每顆 +2 珠`, img: imgSrc(id), hold: 3200 });
  toast('🎉 大獎！大入賞口 OPEN，瞄準下面的入口');
}
const wheelBusy = () => wh.state !== 'idle';
function updateWheel(dt) {
  if (cup.f > 0) cup.f -= dt * 3;
  if (wheel.f > 0) wheel.f -= dt * 1.2;
  if (attackT > 0) attackT = Math.max(0, attackT - dt);
  if (wh.state === 'idle') { if (wh.hold > 0) startSpin(); return; }
  if (wh.state === 'spin') {
    const k = Math.min(1, (time - wh.t0) / SPIN_SEC);
    wheel.ang = wh.from + (wh.to - wh.from) * easeOutCubic(k);
    const sec = pointerSector();
    if (sec !== wh.lastSector) { wh.lastSector = sec; sfx.wheelTick(); }
    if (k >= 1) { wheel.ang = wh.to; wh.state = 'bounce'; wh.t0 = time; sfx.wheelStop(); }
  } else if (wh.state === 'bounce') {   // 停下來彈一下
    const t = time - wh.t0;
    wheel.ang = wh.to + 0.03 * Math.sin(t * 22) * Math.exp(-t * 6);
    if (t > 0.45) { wheel.ang = wh.to; wh.state = 'show'; wh.t0 = time; wheel.f = 1; awardSector(wh.result); }
  } else if (wh.state === 'show') {     // 停格閃爍
    if (time - wh.t0 > 1.3) { wh.state = 'cool'; wh.t0 = time; }
  } else if (wh.state === 'cool') {
    if (time - wh.t0 > 0.4) wh.state = 'idle';
  }
}
function drawSector(g, s, R, hot) {
  g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, s.a0, s.a1); g.closePath();
  g.fillStyle = hot ? '#ffffff' : s.col; g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.stroke();
  const mid = (s.a0 + s.a1) / 2;
  g.save(); g.rotate(mid); g.translate(R * 0.66, 0); g.rotate(Math.PI / 2);
  const num = s.label[0] === '+';
  g.font = num ? `11px ${PXFONT}` : `900 ${s.deg < 30 ? 13 : 15}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = hot ? '#2a1d00' : s.fg;
  const was = ctx; ctx = g;   // pokeIcon／drawEgg 畫在 ctx 上，暫時換成快取畫布
  try {
    if (s.k === 'egg') { drawEgg(0, -14, 7); g.fillText(s.label, 0, 8); }
    else if (s.k === 'great' || s.k === 'ultra') { pokeIcon(0, -14, 7, s.k === 'great' ? '#3b82f6' : '#2a2a2a'); g.fillText(s.label, 0, 8); }
    else if (s.k === 'shiny') { g.fillText('✦', 0, -12); g.fillText(s.label, 0, 8); }
    else if (s.k === 'jp') { g.fillText('★', 0, -12); g.fillText(s.label, 0, 8); }
    else g.fillText(s.label, 0, 0);
  } finally { ctx = was; }
  g.restore();
}
function buildWheelFace(k) {
  const R = wheel.R, size = R * 2 + 4, c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size * k);
  const g = c.getContext('2d'); g.scale(k, k); g.translate(size / 2, size / 2);
  SECTORS.forEach(s => drawSector(g, s, R, false));
  wheelFace = c; wheelFaceK = k;
}
let RIM = null, HUB = null, gradY = -1;
function drawWheel() {
  const { x, y, R } = wheel;
  const spinning = wh.state === 'spin' || wh.state === 'bounce', showing = wh.state === 'show';
  const blink = showing && Math.sin(time * 18) > 0;
  ctx.save();
  ctx.globalAlpha = 0.92;
  // 外圈
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(x, y, R + 12, 0, Math.PI * 2); ctx.fill();
  if (gradY !== y) {
    gradY = y;
    RIM = ctx.createLinearGradient(x - R, y - R, x + R, y + R);
    RIM.addColorStop(0, '#f6e2a0'); RIM.addColorStop(0.5, '#a67c23'); RIM.addColorStop(1, '#f1d98f');
    HUB = ctx.createRadialGradient(x - 6, y - 8, 2, x, y, 30);
    HUB.addColorStop(0, '#fff3c4'); HUB.addColorStop(0.5, '#e8c872'); HUB.addColorStop(1, '#8d6a1a');
  }
  ctx.strokeStyle = RIM; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(x, y, R + 6, 0, Math.PI * 2); ctx.stroke();
  if (spinning || wheel.f > 0) { ctx.globalAlpha = 0.5 * (spinning ? 0.6 + Math.sin(time * 10) * 0.3 : wheel.f); ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(x, y, R + 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 0.92; }
  // 格子（快取成一張圖；停格閃爍時只重畫那一格）
  const k = bgK || 1;
  if (!wheelFace || wheelFaceK !== k) buildWheelFace(k);
  ctx.translate(x, y); ctx.rotate(wheel.ang);
  ctx.drawImage(wheelFace, -R - 2, -R - 2, R * 2 + 4, R * 2 + 4);
  if (showing && blink && wh.result >= 0) drawSector(ctx, SECTORS[wh.result], R, true);
  ctx.restore();
  // 中心轂＋保留燈
  ctx.save(); ctx.globalAlpha = 0.95;
  ctx.fillStyle = HUB; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a3f0a'; ctx.lineWidth = 2.5; ctx.stroke();
  for (let i = 0; i < HOLD_MAX; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 2, lx = x + Math.cos(a) * 17, ly = y + Math.sin(a) * 17, on = i < wh.hold;
    if (on) { ctx.fillStyle = 'rgba(255,77,94,.35)'; ctx.beginPath(); ctx.arc(lx, ly, 8, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = on ? '#ff4d5e' : 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();
  }
  // 指針（頂端，固定）
  const py = y - R - 14, wob = wh.state === 'bounce' ? Math.sin((time - wh.t0) * 22) * 3 : 0;
  ctx.fillStyle = showing ? (blink ? '#fff' : '#ff4d5e') : '#ff4d5e'; ctx.strokeStyle = '#2a1d00'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 11, py - 10 + wob); ctx.lineTo(x + 11, py - 10 + wob); ctx.lineTo(x, py + 14 + wob); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // 標題／結果
  const label = showing ? SECTOR_LABEL[SECTORS[wh.result].k] + '！' : spinning ? '轉動中…' : attackT > 0 ? `大入賞口 OPEN ${Math.ceil(attackT)}s` : '城都大輪盤';
  txt(label, x, y - R - 36, showing ? 20 : 13, showing ? (blink ? '#ffffff' : '#e8c872') : attackT > 0 ? '#ffd166' : '#9fb3a8', 900);
  // 啟動口
  txt('啟動口', cup.x, cup.y - 8, 11, '#e8c872', 800);
  ctx.fillStyle = 'rgba(232,200,114,.10)'; ctx.fillRect(cup.x - cup.open + 2, cup.y + cup.depth, (cup.open - 2) * 2, 10);
  neonLine([cup.x - cup.hw, cup.y, cup.x - cup.open, cup.y + cup.depth], cup.f > 0 ? '#ffffff' : '#e8c872', 4);
  neonLine([cup.x + cup.hw, cup.y, cup.x + cup.open, cup.y + cup.depth], cup.f > 0 ? '#ffffff' : '#e8c872', 4);
}
function drawEgg(x, y, r) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 1.25);
  ctx.fillStyle = '#f3f8ee'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2f4a2f'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#5fb37a';
  [[-2.5, -2.5, 1.6], [2.5, 0.5, 1.4], [-0.5, 3, 1.2]].forEach(([a, b, c]) => { ctx.beginPath(); ctx.arc(a, b, c, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}

/* ============ 操作：拉桿發射與搖台 ============ */
function queueBurst(p) {
  if (burstLeft <= 0) { burstLeft = BURST; burstPower = p; fireCD = 0; }
}
function fire(p) {
  if (isPaused() || S.game.ended) return false;
  if (tiltLock > 0) { toast('TILT 中，等台子解鎖…'); return false; }
  if (S.game.balls <= 0) { toast('這局的彈珠用完了'); return false; }
  if (balls.length >= maxOnBoard()) return false;
  S.game.balls--; S.game.shots++; S.stats.shots++;
  const kind = KIND_OF(S.game.shots); statMap('kinds', kind);
  // 出口速度由力道決定（弱：落右邊，強：飛到左邊），再換算成通道底部的初速
  const vExit = 120 + 980 * clamp(p, 0, 1) + (Math.random() - 0.5) * 40;
  const v0 = Math.sqrt(vExit * vExit + 2 * RAIL.gy * (H - 30 - (RAIL.cy - RAIL.ri - BALL_R - 2)));
  balls.push({ x: LAUNCH_X, y: H - 30, vx: 0, vy: -v0, r: BALL_R, kind, rail: true, cool: {}, age: 0, dead: false });
  sfx.launch(clamp(p, 0, 1)); refreshUI();
  return true;
}
function startCharge() {
  if (charging) return;
  AU.init();
  charging = true; chargeT = 0; holdT = 0; autoFired = false; sfx.charge();
  $('lever').classList.add('on');
}
function releaseCharge() {
  if (!charging) return;
  charging = false;
  $('lever').classList.remove('on');
  if (!autoFired) fire(power);
  power = 0; syncPowerUI();
}
function doShake(dir) {
  if (isPaused() || tiltLock > 0 || S.game.ended) return;
  tilt += 36;
  if (tilt > 100) {
    tilt = 0; tiltLock = 3.5; sfx.tilt(); stat('tilts');
    $('tiltMsg').classList.add('show'); toast('搖太兇了！台子鎖住 3.5 秒');
    return;
  }
  for (const b of balls) { if (b.rail) continue; const m = KIND[b.kind].shake; b.vx += dir * (180 + Math.random() * 90) * m; b.vy -= 110 * m; }
  shakeT = 0.28; shakeDir = dir; sfx.shake(); stat('shakes');
}
cv.addEventListener('pointerdown', () => AU.init());
const lever = $('lever');
lever.addEventListener('pointerdown', e => { e.preventDefault(); lever.setPointerCapture(e.pointerId); startCharge(); });
['pointerup', 'pointercancel'].forEach(t => lever.addEventListener(t, releaseCharge));
lever.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
  AU.init();
  const k = e.key.toLowerCase();
  if ($('mDex').classList.contains('show')) return;
  if (e.repeat) return;
  if (k === ' ') { e.preventDefault(); if (anyModal() || isPaused()) return; startCharge(); }
  else if (k === 'z') doShake(-1);
  else if (k === 'x') doShake(1);
  else if (k === 'p' || k === 'escape') { if (!anyModal()) togglePause(); }
  else if (k === 'b') { if (!anyModal()) requestOpen(); }
  else if (k === 'd') { if (!anyModal()) openDex(); }
  else if (k === 's') { if (!anyModal()) openStats(); }
});
window.addEventListener('keyup', e => { if (e.key === ' ') releaseCharge(); });
function bindPress(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); fn(); }); }
bindPress($('shakeL'), () => doShake(-1));
bindPress($('shakeR'), () => doShake(1));

/* ============ 更新 ============ */
function update(dt) {
  time += dt;
  if (attackT > 0) {
    catcher.cx += (CX - catcher.cx) * Math.min(1, dt * 4);
    catcher.hw += (96 - catcher.hw) * Math.min(1, dt * 4); catcher.open += (40 - catcher.open) * Math.min(1, dt * 4);
  } else {
    catcher.cx = CX + Math.sin(time * 0.6) * 130;
    catcher.hw += (46 - catcher.hw) * Math.min(1, dt * 4); catcher.open += (13 - catcher.open) * Math.min(1, dt * 4);
  }

  // 日夜
  dayLeft -= dt;
  if (dayLeft <= 0) {
    dayLeft = DAY_SEC; night = !night; stat(night ? 'nights' : 'days');
    sfx.dayNight(night); syncClockUI();
    toast(night ? '🌙 夜晚來了：月亮計數器啟動，稀有機率 ×1.6' : '☀ 天亮了：太陽計數器啟動');
  }
  // 右口袋三聖獸徘徊
  roamLeft -= dt;
  if (roamLeft <= 0) { roamLeft = ROAM_SEC; roamIdx = (roamIdx + 1) % 3; addFloat((pockets[1].x0 + pockets[1].x1) / 2, pocketTop - 60, `${P[legendId(1)].zh} 徘徊中`, '#c4b5fd'); }

  // 拉桿：力道來回跑；按住超過 1.1 秒自動連發（以當時力道）
  fireCD -= dt;
  if (charging) {
    chargeT += dt; holdT += dt; power = powerOf(chargeT);
    if (holdT > 1.1 && burstLeft <= 0) { holdT = 0; autoFired = true; queueBurst(power); }
  }
  if (burstLeft > 0 && fireCD <= 0) { if (fire(burstPower)) { burstLeft--; fireCD = 0.085; } else burstLeft = 0; }
  if (autoTest && fireCD <= 0) { if (fire(Math.random())) fireCD = 0.16; }

  tilt = Math.max(0, tilt - 14 * dt);
  if (tiltLock > 0) { tiltLock -= dt; if (tiltLock <= 0) $('tiltMsg').classList.remove('show'); }
  if (shakeT > 0) shakeT -= dt;

  const SUB = 4, h = dt / SUB;
  for (let s = 0; s < SUB; s++) for (const b of balls) if (!b.dead) stepBall(b, h);
  for (const b of balls) { b.age += dt; if (b.age > 30) b.dead = true; }
  balls = balls.filter(b => !b.dead);

  for (const p of pegs) if (p.f > 0) p.f -= dt * 4;
  for (const bp of bumpers) if (bp.f > 0) bp.f -= dt * 3;
  updateWheel(dt);
  if (catcher.f > 0) catcher.f -= dt * 3;
  for (const pk of pockets) if (pk.st > 0) { pk.st -= dt; if (pk.st <= 0) pk.state = ''; }
  for (const p of parts) { p.t += dt; p.vy += 400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.t < p.life);
  for (const f of floats) f.t += dt;
  floats = floats.filter(f => f.t < 1.2);

  roundLeft -= dt;
  if (roundLeft <= 0) {
    if (wheelBusy()) roundLeft = 0;                 // 輪盤還在轉：等轉完再開箱
    else { roundLeft = ROUND_SEC; if (S.box.length) openRound(); }
  }
  if (wantOpen && !wheelBusy()) { wantOpen = false; openRound(); }

  // 100 顆用完且台面清空 → 結算
  if (!S.game.ended && S.game.balls <= 0 && !balls.length && !wheelBusy() && !wh.hold) {
    S.game.ended = true; pendingSummary = true;
    if (S.box.length) openRound(); else { pendingSummary = false; showSummary(); }
  }
  saveT -= dt; if (saveT <= 0) { saveT = 3; save(); }
}

/* ============ 繪製 ============ */
function txt(t, x, y, size, color = '#f3efe2', weight = 800) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,20,16,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
}
function ptxt(t, x, y, size, color = '#f3efe2') {   // 像素字（數字用）
  ctx.font = `${size}px ${PXFONT}`;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,20,16,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
}
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function pokeIcon(x, y, r, top = '#ff4d5e') {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = top; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = '#0b0f24'; ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.fillStyle = '#f4f6ff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
const SUN_GRAD = {};
function sunIcon(x, y, r, dim) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = dim ? '#6b5a2a' : '#ffd166'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3)); ctx.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8)); ctx.stroke(); }
  const key = (dim ? 'd' : 'b') + r;
  let g = SUN_GRAD[key];
  if (!g) {
    g = SUN_GRAD[key] = ctx.createRadialGradient(-2, -2, 1, 0, 0, r);
    if (dim) { g.addColorStop(0, '#8a7a3a'); g.addColorStop(1, '#4a3f1a'); } else { g.addColorStop(0, '#fff6c0'); g.addColorStop(1, '#f59e0b'); }
  }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function moonIcon(x, y, r, dim) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = dim ? '#4a5570' : '#dfe6f3';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = dim ? '#1b2233' : '#141b3f';
  ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.25, r * 0.82, 0, Math.PI * 2); ctx.fill();
  if (!dim) { ctx.fillStyle = '#fff'; [[-r * 0.3, r * 0.45], [-r * 0.55, -r * 0.1]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(a, b, 1.6, 0, Math.PI * 2); ctx.fill(); }); }
  ctx.restore();
}
const NEON_LITE = [[0, 1]];
function neonLine(pts, color, w) {
  if (LITE) NEON_LITE[0][0] = w + 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [lw, a] of (LITE ? NEON_LITE : [[w + 8, 0.18], [w, 1]])) {
    ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}

function render() {
  if (!BG) return;
  ctx.save();
  if (shakeT > 0) ctx.translate(shakeDir * Math.sin(shakeT * 70) * 6 * (shakeT / 0.28), 0);
  ctx.drawImage(night ? BGN : BG, 0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // 夜晚：星星（深藍罩已烤進背景）
  if (night) {
    ctx.fillStyle = '#fff';
    for (const s of STARS) {
      const a = 0.35 + 0.65 * (0.5 + Math.sin(time * s.sp + s.ph) * 0.5);
      ctx.globalAlpha = a; ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
      if (s.s > 1.6) { ctx.fillRect(s.x - s.s * 1.5, s.y - 0.4, s.s * 3, 0.8); ctx.fillRect(s.x - 0.4, s.y - s.s * 1.5, 0.8, s.s * 3); }
    }
    ctx.globalAlpha = 1;
  }

  // 軌道出口
  const locked = tiltLock > 0;
  ctx.setLineDash([3, 6]); ctx.strokeStyle = locked ? 'rgba(255,77,94,.45)' : 'rgba(232,200,114,.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(RAIL.cx - 4, 12); ctx.lineTo(RAIL.cx - 4 - 120 - power * 300, 12); ctx.stroke(); ctx.setLineDash([]);
  if (charging) { ctx.fillStyle = `rgba(232,200,114,${0.3 + power * 0.5})`; ctx.beginPath(); ctx.arc(LAUNCH_X, H - 30, 6 + power * 6, 0, Math.PI * 2); ctx.fill(); }
  if (S.game.balls > 0 && !charging) ctx.drawImage(BALL_SPR[nextKind()], LAUNCH_X - 8, H - 38, 16, 16);

  // 金色小釘：靜止的已在背景裡，這裡只畫正在發亮的
  ctx.fillStyle = '#fff3c4';
  for (const p of pegs) {
    if (p.f <= 0) continue;
    ctx.globalAlpha = p.f * 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6 * p.f, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }

  // 計數器：太陽／月亮（不當班的半暗）
  for (const bp of bumpers) {
    const isSun = bp.kind === 'sun', on = bumperActive(bp), col = isSun ? '#ffd166' : '#9db4ff';
    const goal = isSun ? SUN_GOAL : MOON_GOAL, n = isSun ? S.sun : S.moon;
    const sc = 1 + Math.max(0, bp.f) * 0.16;
    ctx.save(); ctx.translate(bp.x, bp.y); ctx.scale(sc, sc);
    if (!on) ctx.globalAlpha = 0.5;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.1)';
    ctx.beginPath(); ctx.arc(0, 0, bp.r + 9, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, bp.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * n / goal); ctx.stroke(); ctx.lineCap = 'butt';
    if (bp.f > 0 && on) { ctx.globalAlpha = bp.f * 0.5; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, bp.r + 16, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = on ? '#0b2f28' : '#0a1410'; ctx.beginPath(); ctx.arc(0, 0, bp.r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = on ? col : '#3d4556'; ctx.lineWidth = 2.5; ctx.stroke();
    if (isSun) sunIcon(0, 0, 11, !on); else moonIcon(0, 0, 12, !on);
    ctx.restore();
    ptxt(`${n}/${goal}`, bp.x, bp.y + 46, 9, on ? col : '#6b7589');
    txt(on ? (isSun ? `碰滿 +${SUN_REWARD} 珠` : '碰滿送超級球') : (isSun ? '白天才算' : '夜晚才算'), bp.x, bp.y + 63, 11, on ? '#9fb3a8' : '#55665e', 700);
  }

  drawWheel();

  // 傳說口袋
  for (const pk of pockets) {
    const id = legendId(pk.side), cx = (pk.x0 + pk.x1) / 2;
    const im = legendImgs[id];
    if (im.complete && im.naturalWidth) ctx.drawImage(im, cx - 36, pocketTop + 2, 72, 72);
    txt(P[id].zh, cx, H - 12, 12, '#e9e2ff', 900);
    const ch = S.charge[pk.side];
    if (pk.side === 0) txt('傳說保底', cx, pocketTop - 40, 11, '#9fb3a8', 700);
    else { txt('徘徊中', cx - 18, pocketTop - 40, 11, '#9fb3a8', 700); ptxt(`${Math.ceil(roamLeft)}s`, cx + 22, pocketTop - 40, 8, '#c4b5fd'); }
    ctx.fillStyle = 'rgba(255,255,255,.08)'; rr(cx - 40, pocketTop - 30, 80, 10, 5); ctx.fill();
    if (ch > 0) { ctx.fillStyle = '#a78bfa'; rr(cx - 40, pocketTop - 30, Math.max(10, 80 * ch / 100), 10, 5); ctx.fill(); }
    ptxt(`${Math.floor(ch)}%`, cx, pocketTop - 12, 8, '#c4b5fd');
    if (pk.state) {
      const ok = pk.state.includes('成功');
      ctx.fillStyle = ok ? 'rgba(232,200,114,.92)' : 'rgba(6,32,26,.9)';
      rr(cx - 38, pocketTop + 28, 76, 20, 10); ctx.fill();
      txt(pk.state, cx, pocketTop + 38, 11, ok ? '#3a1a7a' : '#9fb3a8', 900);
    }
  }

  // 入口
  const c = catcher;
  const atk = attackT > 0, cc = atk ? (Math.sin(time * 14) > 0 ? '#e8c872' : '#ff4d5e') : c.f > 0 ? '#ffffff' : '#cfd6e6';
  if (atk) txt(`大入賞口 OPEN ${Math.ceil(attackT)}s`, c.cx, c.y - 20, 16, '#e8c872', 900);
  else txt('⇣ 入口得寶可夢', c.cx, c.y - 18, 13, '#cfd6e6');
  ctx.fillStyle = 'rgba(207,214,230,.10)'; ctx.fillRect(c.cx - c.open + 2, c.y + c.depth, (c.open - 2) * 2, H - c.y - c.depth);
  neonLine([c.cx - c.hw, c.y, c.cx - c.open, c.y + c.depth], cc, 6);
  neonLine([c.cx + c.hw, c.y, c.cx + c.open, c.y + c.depth], cc, 6);
  if (c.f > 0) { ctx.fillStyle = `rgba(232,200,114,${c.f * 0.5})`; ctx.beginPath(); ctx.arc(c.cx, c.y + c.depth, 28, 0, Math.PI * 2); ctx.fill(); }

  // 底部分隔
  for (const w of walls.slice(3)) if (w[0] !== RAIL.x0) neonLine(w, 'rgba(167,139,250,.75)', 3);

  for (const b of balls) ctx.drawImage(BALL_SPR[b.kind], b.x - b.r - 1, b.y - b.r - 1, b.r * 2 + 2, b.r * 2 + 2);

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
  setBar('dex', dc / POKEDEX.length); setBar('shiny', sc / POKEDEX.length); setBar('legend', lc / N_LEGEND);
  $('ammoChip').classList.toggle('low', S.game.balls <= 10);
  $('boxCnt').textContent = S.box.length;
  $('btnBox').classList.toggle('ready', S.box.length > 0);
  const nk = nextKind();
  $('nextImg').src = BALL_URL[nk]; $('nextName').textContent = KIND_NAME[nk];
}
function syncClockUI() {
  $('clkIcon').textContent = night ? '🌙' : '☀️';
  $('clkLbl').textContent = night ? '夜晚' : '白天';
  $('clkChip').classList.toggle('night', night);
}
let lastPw = -1;
function syncPowerUI() {
  const p = Math.round(power * 100);
  if (p === lastPw) return;
  lastPw = p;
  $('pwBar').style.width = p + '%'; $('pwNum').textContent = p + '%';
  $('leverKnob').style.transform = `translateY(${(power * 100).toFixed(0)}%)`;
}
function renderRecent() {
  const html = S.recent.slice(0, 12).map(r => `<div class="rc-mini ${r.s ? 'shiny' : ''}" title="${P[r.id].zh}"><img src="${imgSrc(r.id, r.s)}" alt="${P[r.id].zh}"></div>`).join('')
    || '<div style="grid-column:1/-1;font-size:12px" class="mut">開箱後會出現在這裡</div>';
  document.querySelectorAll('[data-recent]').forEach(e => { e.innerHTML = html; });
}
let lastBoxSec = -1, lastClk = -1;
function updateTimerUI() {
  const sec = Math.ceil(roundLeft);
  if (sec !== lastBoxSec) {
    lastBoxSec = sec;
    $('boxTime').textContent = `開箱 ${sec}s`;
    $('boxRing').style.strokeDashoffset = (106.8 * roundLeft / ROUND_SEC).toFixed(1);
  }
  const ck = Math.ceil(dayLeft);
  if (ck !== lastClk) { lastClk = ck; $('clkNum').textContent = ck; }
  const tb = $('tiltBar'); tb.style.width = tilt + '%'; tb.classList.toggle('hot', tilt > 60);
  syncPowerUI();
}
let toastT = null;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }
let bannerT = null;
function showBanner({ kind = '', tag, title, sub, img, sil = false, hold = 2600 }) {
  const el = $('banner'), im = freshImg(el.querySelector('img'), img);
  el.className = 'banner ' + kind;
  im.classList.toggle('sil', sil);
  el.querySelector('.tag').textContent = tag; el.querySelector('b').textContent = title; el.querySelector('.sub').textContent = sub;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), hold);
}
// iPhone Safari 有時候拿掉黑影濾鏡後不會重畫，揭曉時直接換一張新的 <img>
function freshImg(old, src) {
  const n = document.createElement('img');
  n.alt = old.alt || ''; n.src = src;
  if (old.id) n.id = old.id;
  old.replaceWith(n);
  return n;
}
function boardFlash() { const f = $('bflash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
function legendBanner(id) {
  showBanner({ tag: '傳說反應', title: '？？？', sub: '有東西被大師球吸進去了…', img: imgSrc(id), sil: true, hold: 4000 });
  sfx.drumroll(1.1);
  setTimeout(() => {
    boardFlash(); sfx.flash(); sfx.fanfareBig();
    const el = $('banner');
    freshImg(el.querySelector('img'), imgSrc(id));
    el.querySelector('.tag').textContent = '傳說寶可夢';
    el.querySelector('b').textContent = P[id].zh;
    el.querySelector('.sub').textContent = '收服成功！開箱時登錄圖鑑';
  }, 1150);
}

/* ============ 暫停／抽屜 ============ */
function pause(reason) { pauses.add(reason); charging = false; burstLeft = 0; $('lever').classList.remove('on'); syncPauseUI(); }
function resume(reason) { pauses.delete(reason); syncPauseUI(); }
function togglePause() { pauses.has('user') ? resume('user') : pause('user'); }
function syncPauseUI() {
  const u = pauses.has('user');
  $('pauseOv').classList.toggle('show', u);
  $('btnPause').textContent = u ? '▶' : '⏸';
  $('btnPause').classList.toggle('on', u);
  $('drPause').textContent = u ? '▶ 繼續' : '⏸ 暫停';
}
const anyModal = () => ['mReveal', 'mDex', 'mSum', 'mStats'].some(id => $(id).classList.contains('show')) || $('drawer').classList.contains('show');
function openDrawer() { $('drawer').classList.add('show'); $('scrim').classList.add('show'); pause('drawer'); }
function closeDrawer() { $('drawer').classList.remove('show'); $('scrim').classList.remove('show'); resume('drawer'); }
$('btnPause').addEventListener('click', () => { AU.init(); togglePause(); });
$('btnResume').addEventListener('click', () => resume('user'));
$('btnMenu').addEventListener('click', () => { AU.init(); openDrawer(); });
$('drClose').addEventListener('click', closeDrawer);
$('scrim').addEventListener('click', closeDrawer);
$('drPause').addEventListener('click', () => { togglePause(); closeDrawer(); });
$('drDex').addEventListener('click', () => { closeDrawer(); openDex(); });
$('drBox').addEventListener('click', () => { closeDrawer(); requestOpen(); });
$('drNew').addEventListener('click', () => {
  if (!confirm('重開一局會把彈珠重設為 100 顆（圖鑑會保留），確定嗎？')) return;
  closeDrawer(); startNewGame();
});
$('drLobby').addEventListener('click', () => { save(); location.href = '../'; });
$('btnBox').addEventListener('click', () => { AU.init(); requestOpen(); });
function syncSwitches() { $('swMusic').classList.toggle('on', S.music); $('swSfx').classList.toggle('on', S.sfx); $('swLite').classList.toggle('on', LITE); $('swBig').classList.toggle('on', !!PERF.big); }
$('swLite').addEventListener('click', () => setLite(!LITE, true));
$('swBig').addEventListener('click', () => setBig(!PERF.big));
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

let wantOpen = false;
function requestOpen() {
  if (!S.box.length) { toast('收集倉是空的，先讓彈珠落進入口吧！'); return; }
  if (wheelBusy()) { wantOpen = true; toast('輪盤轉完就開箱'); return; }
  openRound();
}
// gift：禮物直接給的寶可夢，不經過收集倉
function openRound(gift) {
  if (anyModal()) return;
  if (!gift && !S.box.length) { toast('收集倉是空的，先讓彈珠落進入口吧！'); return; }
  pause('reveal');
  const items = (gift || S.box).map(b => {
    if (b.egg) {   // 蛋：孵出本世代的寶寶
      const id = pick(EGG_POOL).id;
      stat('hatched');
      return { id, shiny: Math.random() < SHINY_RATE.egg, ball: 'egg', tier: P[id].tier, egg: true, gift: false };
    }
    const id = b.fixed || pickPokemon(b.ball);
    const shiny = !!b.shiny || Math.random() < SHINY_RATE[b.ball];
    return { id, shiny, ball: b.ball, tier: P[id].tier, gift: !!gift };
  });
  if (!gift) { S.box = []; S.stats.rounds++; roundLeft = ROUND_SEC; }

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
    stat('got'); statMap('by', it.id); if (it.shiny) stat('shinyGot');
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
        evos.push({ from: p.id, to, isNew }); stat('evo');
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
const isSpecial = it => it.gift || it.egg || it.shiny || it.tier === 'srare' || it.tier === 'legend';
function badgesHTML(it) {
  const b = [];
  if (it.isNew) b.push('<span class="badge">NEW</span>');
  if (it.egg) b.push('<span class="badge t egg">孵化</span>');
  if (it.shiny) b.push('<span class="badge t shiny">閃光</span>');
  if (it.tier !== 'common') b.push(`<span class="badge t ${it.tier}">${TIER_NAME[it.tier]}</span>`);
  return b.join('');
}

async function runReveal(items) {
  skipping = false;
  const order = { legend: 0, srare: 1, rare: 2, common: 3 };
  const list = items.slice().sort((a, b) => (b.shiny - a.shiny) || (order[a.tier] - order[b.tier]) || (P[a.id].no - P[b.id].no));
  const nSpecial = list.filter(isSpecial).length, nEgg = list.filter(i => i.egg).length;
  $('rvTag').textContent = '開箱';
  $('rvTitle').textContent = '去吧，精靈球！';
  $('rvRight').textContent = `${list.length} 顆`;
  $('rvNote').textContent = nEgg ? `有 ${nEgg} 顆蛋在動…` : nSpecial ? `有 ${nSpecial} 顆球在發光…` : '';
  $('rvNext').disabled = true; $('rvNext').textContent = '下一步'; $('rvNext').onclick = null;
  $('rvSkip').style.display = '';
  const body = $('rvBody');
  body.innerHTML = `<div class="rgrid">${list.map(it => `<div class="rc ball ${it.tier} ${it.shiny ? 'isshiny' : ''}">
      <span class="no">No.${pad3(P[it.id].no)}</span><div class="badges">${badgesHTML(it)}</div>
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
  $('rvTitle').textContent = hasLegend ? '傳說寶可夢降臨！' : hasShiny ? '閃光寶可夢出現了！' : nEgg ? '蛋孵化了！' : hasRare ? '稀有寶可夢登場！' : '開箱完成！';
  $('rvNote').textContent = '集滿 3 隻相同寶可夢會自動進化';
  $('rvSkip').style.display = 'none';
  $('rvNext').disabled = false;
  skipping = false;
}
function revealCard(card, it) {
  card.classList.remove('sil', 'hot', 'ball'); card.classList.add('show');
  freshImg(card.querySelector('img'), imgSrc(it.id, it.shiny));
  card.querySelector('.nm').textContent = (it.shiny ? '✨' : '') + P[it.id].zh;
}
function flashScreen(rainbow) {
  const f = $('flash'); f.classList.remove('go'); f.classList.toggle('rainbow', !!rainbow); void f.offsetWidth; f.classList.add('go');
}
async function spotlight(it) {
  const sp = $('spot');
  const hint = it.tier === 'legend' ? ['⚡ 傳說反應！！！', '#c4b5fd', 'rgba(167,139,250,.14)']
    : it.shiny ? ['✨ 閃光反應！！', '#ff4fa3', 'rgba(255,79,163,.13)']
    : it.egg ? ['🥚 蛋在動…', '#9ee7b4', 'rgba(95,179,122,.14)']
    : it.tier === 'srare' ? ['★ 超稀有反應！', '#e8c872', 'rgba(232,200,114,.1)']
    : ['★ 稀有反應！', '#60a5fa', 'rgba(96,165,250,.1)'];
  sp.className = 'spot show' + (it.shiny ? ' shiny' : '') + (it.egg ? ' egg' : '');
  sp.style.setProperty('--hint', hint[1]); sp.style.setProperty('--ray', hint[2]);
  $('spHint').textContent = hint[0];
  freshImg($('spImg'), it.egg ? EGG_URL : imgSrc(it.id, it.shiny));
  $('spName').textContent = it.egg ? '蛋' : '？？？';
  $('spMeta').innerHTML = `<span class="pb ${it.ball}"></span>${BALL_NAME[it.ball]}`;
  sfx.drumroll(1.5);
  await waitTapOr(1500, false);
  if (skipping) return;
  flashScreen(it.shiny);
  sfx.flash();
  await sleep(120);
  sp.classList.remove('egg');
  freshImg($('spImg'), imgSrc(it.id, it.shiny));
  sp.classList.add('revealed');
  $('spHint').textContent = it.tier === 'legend' ? '傳說寶可夢' : it.shiny ? '閃光寶可夢' : it.egg ? '孵出了寶寶寶可夢！' : TIER_NAME[it.tier] + '寶可夢';
  $('spName').textContent = P[it.id].zh;
  $('spMeta').innerHTML = `No.${pad3(P[it.id].no)} ${badgesHTML(it)}`;
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
  const N = POKEDEX.length;
  $('rvTag').textContent = '圖鑑';
  $('rvTitle').textContent = '圖鑑已更新';
  $('rvRight').textContent = `新登錄 ${after.dex - before.dex} 種`;
  $('rvNote').textContent = '圖鑑一旦點亮就永久保留';
  $('rvNext').textContent = '繼續冒險';
  const bar = (label, a, b, total, grad) => `<div class="prog"><span>${label}${b > a ? `<span class="plus">+${b - a}</span>` : ''}</span><span class="num">${b} / ${total}</span>
    <div class="bar"><i style="width:${a / total * 100}%;background:${grad}" data-w="${b / total * 100}%"></i></div></div>`;
  let html = `<div class="upd"><section>${bar('城都圖鑑', before.dex, after.dex, N, 'linear-gradient(90deg,#5ef2ff,#2d8a5e)')}
    ${bar('閃光圖鑑', before.shiny, after.shiny, N, 'linear-gradient(90deg,#ff5f9e,#e8c872)')}
    ${bar('傳說寶可夢', before.legend, after.legend, N_LEGEND, 'linear-gradient(90deg,#a78bfa,#ff4fa3)')}</section>`;
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
  $('sumHead').textContent = '本局結束'; $('sumRight').textContent = `用掉 ${g.shots} 顆`;
  const best = g.best;
  $('sumBest').innerHTML = best
    ? `<img src="${imgSrc(best.id, best.shiny)}" alt=""><b>${best.shiny ? '✨' : ''}${P[best.id].zh}</b><small>最佳收穫・${TIER_NAME[P[best.id].tier]}</small>`
    : '<b>這局沒有收穫</b><small>下次瞄準移動的入口試試看！</small>';
  $('sumGrid').innerHTML = [['發射', g.shots], ['捕獲', g.caught], ['新登錄', g.newDex], ['閃光', g.shiny]].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  $('mSum').classList.add('show');
}
function startNewGame() {
  S.game = newGame();
  balls = []; pendingSummary = false; roundLeft = ROUND_SEC;
  wh.hold = 0; attackT = 0;
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
  $('dxTop').innerHTML = `<span>已登錄 <b>${dexCount()}</b>/${POKEDEX.length}</span><span>閃光 <b>${shinyCount()}</b></span><span>傳說 <b>${legendCount()}</b>/${N_LEGEND}</span>
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
    return `<div class="dcell ${e.got ? '' : 'miss'} ${sh ? 'sh' : ''}" data-id="${p.id}"><span class="n">${pad3(p.no)}</span>
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

/* ============ 數據統計 ============ */
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—');
function openStats() { pause('stats'); renderStats(); $('mStats').classList.add('show'); }
function closeStats() { $('mStats').classList.remove('show'); resume('stats'); }
function renderStats() {
  const st = S.stats, g = k => st[k] || 0;
  const tiles = [
    ['用了幾顆彈珠', g('shots')], ['回收彈珠', g('bonusBalls')], ['入口命中', g('entrance'), pct(g('entrance'), g('shots'))],
    ['啟動口', g('hold'), pct(g('hold'), g('shots'))], ['輪盤轉動', g('spins')],
    ['大獎', g('jackpot'), g('jackpot') ? '1/' + (g('spins') / g('jackpot')).toFixed(1) : ''], ['閃光格', g('shinyWheel')], ['得到蛋', g('eggs')], ['孵化', g('hatched')], ['大入賞口', g('attackIn')],
    ['太陽碰撞', g('sunHits')], ['月亮碰撞', g('moonHits')], ['夜晚次數', g('nights')], ['傳說口袋', g('pocketIn')], ['傳說收服', g('legend')],
    ['搖台', g('shakes')], ['TILT', g('tilts')], ['退回彈珠', g('railBack')], ['開箱次數', g('rounds')], ['禮物彈珠', g('giftBalls')], ['禮物寶可夢', g('giftPoke')], ['得到寶可夢', g('got')], ['閃光', g('shinyGot')], ['進化', g('evo')],
  ];
  const balls = st.balls || {}, kinds = st.kinds || {}, wheelN = st.wheel || {};
  const top = Object.entries(st.by || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const html = `<div class="stgrid">${tiles.map(([k, v, e]) => `<div class="stile"><small>${k}</small><b>${v}</b>${e ? `<em>${e}</em>` : ''}</div>`).join('')}</div>
    <div class="stsec"><h4>發過的珠</h4><div class="strow">${['steel', 'gold', 'silver'].map(k => `<span class="chipb"><img src="${BALL_URL[k]}" alt="">${KIND_NAME[k]} <b>${kinds[k] || 0}</b></span>`).join('')}</div></div>
    <div class="stsec"><h4>輪盤停的格</h4><div class="strow">${Object.keys(SECTOR_LABEL).map(k => `<span class="chipb">${SECTOR_LABEL[k]} <b>${wheelN[k] || 0}</b></span>`).join('')}</div></div>
    <div class="stsec"><h4>入口掉出的球</h4><div class="strow">${['poke', 'great', 'ultra', 'master'].map(b => `<span class="chipb"><span class="pb ${b}"></span>${BALL_NAME[b]} <b>${balls[b] || 0}</b></span>`).join('')}</div></div>
    <div class="stsec"><h4>最常抓到的寶可夢</h4>${top.length ? `<div class="sttop">${top.map(([id, n], i) => `<div><i>${i + 1}</i><img src="${imgSrc(+id)}" alt="">${P[id].zh}<br><b>×${n}</b></div>`).join('')}</div>` : '<div class="empty">開箱後就會開始統計</div>'}</div>`;
  $('stBody').innerHTML = html;
}
$('stClose').addEventListener('click', closeStats);
$('drStats').addEventListener('click', () => { closeDrawer(); openStats(); });
$('sideStats').addEventListener('click', () => { AU.init(); openStats(); });

/* ============ 禮物 ============ */
const RARE_POOL = POOL.filter(p => p.tier === 'rare'), SRARE_POOL = POOL.filter(p => p.tier === 'srare');
$('giftBalls').addEventListener('click', () => {
  closeDrawer();
  S.game.balls += 100; S.game.ended = false; stat('giftBalls', 100);
  sfx.reward(); burst(LAUNCH_X - 40, H - 60, '#e8c872', 30); addFloat(LAUNCH_X - 60, H - 80, '+100 彈珠');
  toast('🎁 收到 100 顆彈珠！'); refreshUI(); save();
});
$('giftPoke').addEventListener('click', () => {
  closeDrawer();
  const pool = Math.random() < 0.25 ? SRARE_POOL : RARE_POOL;   // 稀有 75%、超稀有 25%
  stat('giftPoke');
  openRound([{ ball: 'ultra', fixed: pick(pool).id }]);
});

/* ============ 測試工具 ============ */
$('dbBalls').addEventListener('click', () => { S.game.balls += 100; S.game.ended = false; refreshUI(); toast('測試：+100 彈珠'); });
$('dbBox').addEventListener('click', () => { for (let i = 0; i < 10; i++) S.box.push({ ball: rollBallType() }); refreshUI(); toast('測試：收集倉 +10'); });
$('dbSpeed').addEventListener('click', e => { speed = speed % 3 + 1; e.target.textContent = `速度 ×${speed}`; e.target.classList.toggle('on', speed > 1); });
$('dbAuto').addEventListener('click', e => { autoTest = !autoTest; e.target.textContent = `自動發射：${autoTest ? '開' : '關'}`; e.target.classList.toggle('on', autoTest); });
$('dbLegend').addEventListener('click', () => { S.charge = S.charge.map(c => Math.min(99, c + 50)); toast('測試：兩側傳說充能 +50%'); });
$('dbNight').addEventListener('click', () => { dayLeft = 0.01; closeDrawer(); });
$('dbWheel').addEventListener('click', () => { wh.hold = Math.min(HOLD_MAX, wh.hold + 1); closeDrawer(); toast('測試：輪盤保留 +1'); });
$('dbReset').addEventListener('click', () => {
  if (!confirm('確定要清除所有存檔嗎？（城都圖鑑也會清空）')) return;
  const keep = { music: S.music, sfx: S.sfx };
  S = Object.assign(fresh(), keep); balls = []; save(); refreshUI(); renderRecent(); toast('存檔已清除，重新開始！');
});
window.__pachinko = () => ({ S, paused: isPaused(), roundLeft, H, wh, attackT, night, dayLeft, roamIdx, balls, power });
window.__spin = k => { wh.forced = k; wh.hold = Math.min(HOLD_MAX, wh.hold + 1); };   // k：b5/b10/b20/great/ultra/egg/shiny/jp
window.__night = on => { night = !!on; dayLeft = DAY_SEC; syncClockUI(); };
window.__fire = p => fire(p);
// 量測：連畫 n 幀的平均毫秒（含輪盤轉動與夜晚）
window.__perf = () => ({ lite: LITE, big: PERF.big, T: PERF.T, k: bgK, canvas: [cv.width, cv.height], fps: +fps.last.toFixed(1), litePref: PERF.litePref || null });
window.__lite = on => setLite(on, false);
window.__bench = (n = 300) => { const t0 = performance.now(); for (let i = 0; i < n; i++) { time += 1 / 60; render(); } return +((performance.now() - t0) / n).toFixed(3); };
window.__sim = (sec, fireOn = true) => { const was = autoTest; autoTest = fireOn; for (let i = 0; i < sec * 60; i++) update(1 / 60); autoTest = was; return S.stats; };

/* ============ 主迴圈 ============ */
let last = performance.now();
const fps = { t: 0, n: 0, slow: 0, warm: 2, last: 0 };
function frame(now) {
  const el = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  // 低階機一幀可能 40–60ms：拆成多個 ≤34ms 的小步，物理不穿牆、遊戲速度也不會變慢
  const steps = Math.max(1, Math.ceil(el / 0.034)), dt = el / steps;
  if (!isPaused()) for (let i = 0; i < speed * steps; i++) update(dt);
  render(); updateTimerUI();
  watchFps(el);
  requestAnimationFrame(frame);
}
// 沒手動選過省電模式時：連續兩個 3 秒區間平均低於 40fps 就自動切省電
function watchFps(el) {
  if (LITE || PERF.litePref || document.hidden || isPaused()) { fps.t = fps.n = 0; return; }
  if (fps.warm > 0) { fps.warm -= el; return; }
  fps.t += el; fps.n++;
  if (fps.t < 3) return;
  fps.last = fps.n / fps.t;
  fps.slow = fps.last < 40 ? fps.slow + 1 : 0;
  fps.t = fps.n = 0;
  if (fps.slow >= 2) { setLite(true, false); toast('畫面有點卡，已自動切到省電模式（選單可以關）'); }
}
function setLite(on, remember) {
  LITE = !!on;
  if (remember) { PERF.litePref = on ? 'lite' : 'full'; try { localStorage.setItem('johtoPachinko.perf', PERF.litePref); } catch (e) {} }
  document.documentElement.classList.toggle('lite', LITE);
  STARS = STARS.slice(0, LITE ? 28 : 70);
  while (STARS.length < (LITE ? 28 : 70)) STARS.push({ x: 14 + Math.random() * (W - 28), y: Math.random() * H * 0.75, s: 0.6 + Math.random() * 1.4, ph: Math.random() * 6.3, sp: 1.5 + Math.random() * 3 });
  bgK = 0; fit(); syncSwitches();
}
function setBig(on) {
  PERF.bigPref = on ? 'on' : 'off';
  try { localStorage.setItem('johtoPachinko.big', PERF.bigPref); } catch (e) {}
  if (PERF.apply) PERF.apply();
  bgK = 0; fit(); syncSwitches();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { charging = false; $('lever').classList.remove('on'); save(); AU.suspend(); } else AU.resume();
  last = performance.now();
});
window.addEventListener('beforeunload', save);
new ResizeObserver(fit).observe(wrapEl);
window.addEventListener('resize', () => { bgK = 0; fit(); if ($('mDex').classList.contains('show')) renderDex(); });
if (document.fonts && document.fonts.load) {
  document.fonts.load('12px "Press Start 2P"').then(() => { wheelFace = null; }).catch(() => {});
  if (document.fonts.ready) document.fonts.ready.then(() => { wheelFace = null; });
}
fit(); syncSwitches(); syncClockUI(); refreshUI(); renderRecent();
if (S.game.ended) showSummary();
requestAnimationFrame(frame);
})();
