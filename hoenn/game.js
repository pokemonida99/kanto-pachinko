// 豐緣彈珠研究所 —— 紅藍寶石的豐緣圖鑑（202 隻）・彈珠機 pinball 版
(() => {
'use strict';

/* ============ 常數 ============ */
const W = 540;
let H = 1000;                       // 棋盤高度會依螢幕比例調整（740–1200）
const GRAV = 1150, BALL_R = 7, MAX_V = 2200;
const GAME_BALLS = 100, ROUND_SEC = 30, MAX_ON_BOARD = 140;
// 挑戰只有「500 顆收集賽」：?challenge=500
const QS = new URLSearchParams(location.search);
const CH = QS.get('challenge') === '500' ? '500' : null;
const CH_NAME = { 500: '500 顆收集賽' };
const SAVE_KEY = CH ? 'hoennPachinko.ch.' + CH : 'hoennPachinko.v1';
const DEX_KEY = 'hoennPachinko.dex';       // 一般模式的圖鑑（大廳也讀這個）；挑戰有自己的圖鑑，存檔時再併進共用圖鑑
const REC_KEY = 'hoennPachinko.records';   // 挑戰最佳紀錄
const selfURL = q => location.pathname + (q ? '?' + q : '');
const MODE_QS = CH ? 'challenge=' + CH : '';
if (CH) document.body.classList.add('challenge');
document.title = CH ? `挑戰：${CH_NAME[CH]}・豐緣彈珠研究所` : '豐緣彈珠研究所';
document.getElementById('brandSub').textContent = CH ? 'CHALLENGE · 500' : 'HOENN · 202';
const DEX_TOTAL = 202, LEGEND_TOTAL = 10;
const BALL_NAME = { poke: '精靈球', great: '超級球', ultra: '高級球', master: '大師球' };
const TIER_NAME = { common: '普通', rare: '稀有', srare: '超稀有', legend: '傳說' };
const TIER_RANK = { common: 0, rare: 1, srare: 2, legend: 3 };
const LEGEND_POOLS = [[383, 382, 384], [377, 378, 379]];   // 左外線道：固拉多／蓋歐卡／烈空坐；右外線道：三柱神
const SKY_LEGENDS = [380, 381, 385, 386];                  // 天空之柱開放中 1/50
const GEM_NAME = { steel: '鋼珠', ruby: '紅寶石珠', sapphire: '藍寶石珠', emerald: '綠寶石珠' };
const GEM_COL = { steel: '#dfe6f3', ruby: '#ff4d6d', sapphire: '#4f8dff', emerald: '#2fd6a0' };
const FONT = '"Noto Sans TC",sans-serif', NUM = '"Orbitron","Noto Sans TC",sans-serif';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad3 = n => String(n).padStart(3, '0');
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* ============ 資料整理 ============ */
const P = {};
POKEDEX.forEach(p => { P[p.id] = p; });
POKEDEX.forEach(p => { if (p.evoFrom && !P[p.evoFrom]) p.evoFrom = null; });   // 前置型不在豐緣圖鑑裡（含第四代的寶寶）就當起始型
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
const newGame = () => ({ balls: CH === '500' ? 500 : GAME_BALLS, shots: 0, caught: 0, newDex: 0, shiny: 0, best: null, ended: false });
const fresh = () => ({ dex: {}, charge: [0, 0], legIdx: [0, 0], box: [], recent: [], game: newGame(), nextGem: null,
  stats: { caught: 0, shots: 0, rounds: 0, legend: 0, by: {}, balls: {}, fired: {} }, music: true, sfx: true });
if (/[?&]reset\b/.test(location.search)) {
  try { [SAVE_KEY, DEX_KEY].forEach(k => localStorage.removeItem(k)); } catch (e) {}
  history.replaceState(null, '', selfURL(MODE_QS));
}
let S;
try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
S = Object.assign(fresh(), S || {});
S.stats = Object.assign(fresh().stats, S.stats);
let shared = null;
try { shared = JSON.parse(localStorage.getItem(DEX_KEY)); } catch (e) {}
if (!CH && shared && shared.dex) { S.dex = shared.dex; S.recent = shared.recent || []; }
let saveT = 0;
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(S));
    if (!CH) { localStorage.setItem(DEX_KEY, JSON.stringify({ dex: S.dex, recent: S.recent })); return; }
    // 挑戰裡抓到的也會點亮一般圖鑑
    const sh = JSON.parse(localStorage.getItem(DEX_KEY) || 'null') || { dex: {}, recent: [] };
    for (const id in S.dex) {
      const e = S.dex[id], t = sh.dex[id] = sh.dex[id] || { n: 0, s: 0, got: false, gotS: false };
      if (e.got) t.got = true;
      if (e.gotS) t.gotS = true;
    }
    localStorage.setItem(DEX_KEY, JSON.stringify(sh));
  } catch (e) {}
}
const stat = (k, n = 1) => { S.stats[k] = (S.stats[k] || 0) + n; };
const statMap = (m, k, n = 1) => { const o = S.stats[m] = S.stats[m] || {}; o[k] = (o[k] || 0) + n; };
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
  // 背景音樂：C–Am–F–G ／ F–G–Em–Am，8 小節循環（原創）
  let E = 60 / 132 / 2;
  const LEAD = [
    [76, 79, 84, 0, 83, 79, 76, 79], [81, 0, 84, 81, 76, 0, 81, 83], [84, 0, 81, 77, 81, 84, 86, 84], [83, 0, 79, 74, 79, 81, 83, 86],
    [84, 0, 84, 86, 88, 0, 86, 84], [83, 0, 83, 84, 86, 0, 84, 83], [81, 0, 79, 76, 79, 0, 81, 83], [84, 83, 81, 79, 77, 76, 74, 0],
  ];
  const ROOT = [48, 45, 41, 43, 41, 43, 40, 45];
  const CHD = { 48: [60, 64, 67], 45: [57, 60, 64], 41: [53, 57, 60], 43: [55, 59, 62], 40: [52, 55, 59] };
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, n = LEAD[bar][i], r = ROOT[bar];
    if (n) { osc(bgm, 'square', hz(n), t, E * 0.9, 0.028); osc(bgm, 'triangle', hz(n), t, E * 1.4, 0.02); }
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
    drop() { if (ac) osc(sfx, 'sine', 900, ac.currentTime, 0.08, 0.06, 500); },
    launch() { if (!ac) return; noise(sfx, ac.currentTime, 0.16, 0.2, 'bandpass', 1200); osc(sfx, 'sawtooth', 180, ac.currentTime, 0.2, 0.05, 900); },
    bump() { if (!ac) return; osc(sfx, 'triangle', 660, ac.currentTime, 0.12, 0.07); osc(sfx, 'triangle', 990, ac.currentTime + 0.05, 0.1, 0.05); },
    flip() { if (!ac) return; noise(sfx, ac.currentTime, 0.05, 0.14, 'lowpass', 900); osc(sfx, 'square', 170, ac.currentTime, 0.05, 0.04, 90); },
    sling() { if (!ac) return; osc(sfx, 'triangle', 520, ac.currentTime, 0.08, 0.08, 260); noise(sfx, ac.currentTime, 0.06, 0.1, 'bandpass', 2400); },
    target() { if (!ac) return; osc(sfx, 'square', 740, ac.currentTime, 0.07, 0.05); osc(sfx, 'square', 1100, ac.currentTime + 0.06, 0.12, 0.05); noise(sfx, ac.currentTime, 0.08, 0.08, 'lowpass', 1500); },
    boom() { if (!ac) return; duck(0.8); noise(sfx, ac.currentTime, 0.5, 0.4, 'lowpass', 400); osc(sfx, 'sine', 120, ac.currentTime, 0.45, 0.3, 30); },
    split() { if (!ac) return; osc(sfx, 'sine', 900, ac.currentTime, 0.1, 0.07, 1500); osc(sfx, 'sine', 1200, ac.currentTime + 0.05, 0.1, 0.07, 1900); },
    weather() { duck(1.2); notes([[74, 0.09], [78, 0.09], [81, 0.09], [86, 0.3]], 'triangle', 0.06); },
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
    wheelTick() { if (ac) osc(sfx, 'square', 1500, ac.currentTime, 0.015, 0.012); },
    wheelStop() { if (!ac) return; osc(sfx, 'triangle', 300, ac.currentTime, 0.1, 0.12, 120); noise(sfx, ac.currentTime, 0.05, 0.08, 'lowpass', 1200); },
    gameOver() { duck(2.5); notes([[72, 0.12], [79, 0.12], [76, 0.12], [84, 0.12], [83, 0.12], [79, 0.12], [84, 0.6]], 'square', 0.045); },
  };
  return { init, play, setMusic, setSfx, suspend: () => ac && ac.suspend(), resume: () => ac && ac.resume() };
})();
const sfx = AU.play;

/* ============ 畫布與版面 ============ */
const cv = $('cv'), ctx = cv.getContext('2d');
const frameEl = $('boardFrame'), wrapEl = $('boardWrap');
let scale = 1, bgK = 0, BG = null;

const LANE_X = 506;                                   // 發射通道內牆（通道 506–531，珠在 x≈522）
const ARC_R = 112, arcC = { x: 531 - ARC_R, y: ARC_R };  // 右上弧形軌道
const wheel = { x: 440, y: 158, r: 45, ang: 0, w: 0, spun: 0, spinning: false, lastIdx: -1, f: 0, hitT: -9 };
const WHEEL_SEG = ['ruby', 'sapphire', 'emerald', 'star', 'ruby', 'sapphire', 'emerald', 'ruby'];
const targets = [{ x: 222, ch: 'R', col: '#ff4d6d' }, { x: 270, ch: 'S', col: '#4f8dff' }, { x: 318, ch: 'E', col: '#2fd6a0' }].map(t => ({ ...t, y: 0, up: true, f: 0 }));
const TW = 17, TR = 6;                                // 標靶半寬、厚度
const sky = { x: 270, y: 0, hw: 30, depth: 24, open: 11, f: 0, t: 0 };
const catcher = { cx: 270, y: 0, hw: 46, depth: 40, open: 13, f: 0, baseHw: 46 };
const F_REST = 25 * Math.PI / 180, F_UP = -32 * Math.PI / 180, F_TH = 7, F_LEN = 110;
const F_RATE_UP = (F_REST - F_UP) / 0.08, F_RATE_DN = (F_REST - F_UP) / 0.14, FLIP_K = 1.25, FLIP_MAX = 1050;   // 翻板最多把珠打到約 1050（晴天 ×1.25、藍寶石 ×1.3）
const flippers = [{ side: 0, px: 112, py: 0, len: F_LEN, ang: F_REST, w: 0, pressed: false, f: 0 }, { side: 1, px: 428, py: 0, len: F_LEN, ang: F_REST, w: 0, pressed: false, f: 0 }];
const slings = [{ side: 0, apex: [150, 0], top: [80, 0], bot: [80, 0], f: 0, cool: -9 }, { side: 1, apex: [390, 0], top: [452, 0], bot: [452, 0], f: 0, cool: -9 }];
const pockets = [{ side: 0, x0: 9, x1: 80, state: '', st: 0 }, { side: 1, x0: 452, x1: LANE_X, state: '', st: 0 }];
let walls = [], pegs = [], grid = [], GC = 0, GR = 0, pegTop = 92, pegBot = 600;
const CELL = 40;

function layout(newH) {
  H = newH; pegTop = 92; pegBot = H - 330;
  const span = pegBot - pegTop;
  targets.forEach(t => { t.y = Math.round(pegTop + span * 0.45); });
  sky.y = targets[0].y + 62;
  catcher.y = H - 300;
  flippers.forEach(f => { f.py = H - 70; });
  slings.forEach(s => { s.apex[1] = H - 200; s.top[1] = H - 262; s.bot[1] = H - 150; });
  walls = [
    [9, 0, 9, H], [531, 0, 531, H], [9, 0, 531, 0],   // 外牆
    [9, 70, 60, 0],                                  // 左上斜角
    [LANE_X, ARC_R + 8, LANE_X, H + 20],             // 發射通道內牆
    [80, H - 262, 80, H + 20], [452, H - 262, 452, H + 20],   // 外線道導軌（彈射器底邊延伸到底）
    [80, H - 150, 110, H - 80], [452, H - 150, 430, H - 80],   // 內線道導板 → 翻板
  ];
  pegs = [];
  for (let row = 0, y = pegTop; y <= pegBot; y += 30, row++) {
    const off = row % 2 ? 20 : 0;
    for (let x = 30 + off; x <= 482; x += 40) {
      if (Math.hypot(x - wheel.x, y - wheel.y) < wheel.r + 30) continue;
      if (Math.abs(x - 270) < 82 && y > targets[0].y - 34 && y < sky.y + sky.depth + 26) continue;
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
  const newH = Math.round(clamp(W * ch / cw, 740, 1200));
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
  // 左紅寶石、右藍寶石
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#5c0a24'); grd.addColorStop(0.44, '#3b0f2c'); grd.addColorStop(0.56, '#101f4c'); grd.addColorStop(1, '#0b2d72');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const v = g.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,.5)'); v.addColorStop(0.45, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.4)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  const glow = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  // 火山剪影（左）＋岩漿光
  g.fillStyle = 'rgba(30,0,12,.6)';
  g.beginPath(); g.moveTo(9, H * 0.8); g.lineTo(60, H * 0.56); g.lineTo(96, H * 0.6); g.lineTo(135, H * 0.47); g.lineTo(172, H * 0.62); g.lineTo(240, H * 0.8); g.closePath(); g.fill();
  glow(135, H * 0.47, 60, 'rgba(255,120,40,.45)');
  // 海浪（右）
  g.strokeStyle = 'rgba(120,190,255,.16)'; g.lineWidth = 3;
  for (let row = 0; row < 4; row++) {
    const y0 = H * (0.58 + row * 0.06);
    g.beginPath();
    for (let x = 280; x <= 540; x += 6) g.lineTo(x, y0 + Math.sin((x + row * 40) / 22) * 5);
    g.stroke();
  }
  // 中央翠綠光與兩側寶石光
  glow(270, H * 0.46, 240, 'rgba(47,214,160,.22)');
  glow(140, H * 0.2, 130, 'rgba(255,100,80,.12)');
  glow(400, H * 0.3, 130, 'rgba(80,140,255,.14)');
  glow(270, H - 60, 160, 'rgba(47,214,160,.1)');
  // 點陣
  g.fillStyle = 'rgba(255,255,255,.04)';
  for (let y = 10; y < H; y += 18) for (let x = 10 + ((y / 18) % 2) * 9; x < W; x += 18) g.fillRect(x, y, 1.2, 1.2);
  // 發射通道與外線道底色
  g.fillStyle = 'rgba(0,0,0,.38)'; g.fillRect(LANE_X, ARC_R, 531 - LANE_X, H - ARC_R);
  pockets.forEach(pk => { g.fillStyle = 'rgba(167,139,250,.09)'; g.fillRect(pk.x0 + 1, H - 262, pk.x1 - pk.x0 - 2, 262); });
  // 金屬軌道
  const metal = path => {
    for (const [lw, col] of [[7, 'rgba(0,0,0,.55)'], [3.5, '#c9d1dd'], [1.2, 'rgba(255,255,255,.85)']]) { g.lineWidth = lw; g.strokeStyle = col; g.lineCap = 'round'; g.beginPath(); path(); g.stroke(); }
  };
  walls.slice(3).forEach(w => metal(() => { g.moveTo(w[0], w[1]); g.lineTo(w[2], w[3]); }));
  metal(() => g.arc(arcC.x, arcC.y, ARC_R, -Math.PI / 2, 0));
  metal(() => { g.moveTo(9, 0); g.lineTo(arcC.x, 0); });
  // 流失口
  const fade = g.createLinearGradient(0, H - 40, 0, H); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,.5)');
  g.fillStyle = fade; g.fillRect(0, H - 40, W, 40);
  return c;
}

const legendImgs = {};
[...LEGEND_POOLS.flat(), ...SKY_LEGENDS].forEach(id => { const im = new Image(); im.src = imgSrc(id, false); legendImgs[id] = im; });

// 四種珠的貼圖
const BALL_SPR = {};
(() => {
  const mk = (c0, c1, c2, facet) => {
    const c = document.createElement('canvas'), s = 40; c.width = c.height = s;
    const g = c.getContext('2d'), r = 17, cx = 20, cy = 20;
    const rg = g.createRadialGradient(cx - 6, cy - 7, 1, cx, cy, r);
    rg.addColorStop(0, c0); rg.addColorStop(0.45, c1); rg.addColorStop(1, c2);
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    if (facet) {
      g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.2;
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 6; g.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); } g.closePath(); g.stroke();
      g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 6; g.moveTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * 16.5, cy + Math.sin(a) * 16.5); } g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(cx - 6, cy - 8, 4, 2.6, -0.6, 0, Math.PI * 2); g.fill();
    return c;
  };
  BALL_SPR.steel = mk('#ffffff', '#c3cde0', '#515b78', false);
  BALL_SPR.ruby = mk('#ffc0cc', '#e8164f', '#5a0018', true);
  BALL_SPR.sapphire = mk('#c6dbff', '#2b6cff', '#071a5e', true);
  BALL_SPR.emerald = mk('#ccffea', '#1fbf85', '#03402a', true);
})();

/* ============ 狀態 ============ */
let balls = [], parts = [], floats = [], rings = [], rain = [];
let time = 0, speed = 1, autoTest = false;
const pauses = new Set();
const isPaused = () => pauses.size > 0;
const plunger = { power: 0, charging: false, holdT: 0, auto: false, kick: 0 };
let fireCD = 0, burstLeft = 0, burstPower = 0.5;
const BURST = 10;
const keyHold = { L: false, R: false }, btnHold = { L: false, R: false }, forceHold = [false, false], autoFlipT = [-9, -9];
const ptrs = new Map();       // pointerId → 'L' | 'R' | 'P'
let tilt = 0, tiltLock = 0, shakeT = 0, shakeDir = 0;
let roundLeft = ROUND_SEC, pendingSummary = false;
// 天氣
const WX = {
  sun: { ico: '☀', name: '晴天', dur: 25, note: '翻板 +25%・紅寶石珠變多' },
  rain: { ico: '🌧', name: '雨天', dur: 25, note: '重力 ×0.85・入口變寬' },
  clear: { ico: '🌈', name: '晴朗無雲', dur: 8, note: '入口得球 ×2・翻板 1/10 閃光珠' },
};
const WX_SEQ = ['sun', 'rain', 'clear'];
const wx = { mode: 'sun', left: 25 };
// 每 6 顆有 1 顆寶石珠：這一組的第幾顆、什麼顏色
const gemPlan = { group: -1, slot: 0, color: 'ruby' };

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
// 有厚度的線段（翻板、標靶）：兩端圓頭
function hitCapsule(b, ax, ay, bx, by, rad, e) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = ax + dx * t, py = ay + dy * t;
  let nx = b.x - px, ny = b.y - py;
  const d = Math.hypot(nx, ny), m = rad + b.r;
  if (d >= m || d === 0) return false;
  nx /= d; ny /= d; b.x = px + nx * m; b.y = py + ny * m;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  b.nx = nx; b.ny = ny; b.ct = t;
  return true;
}
// 圓弧內側（右上角的發射軌道）
function hitArc(b, cx, cy, R, e) {
  if (b.x < cx || b.y > cy) return false;
  const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), m = R - b.r;
  if (d <= m || d === 0) return false;
  const nx = -dx / d, ny = -dy / d;
  b.x = cx - nx * m; b.y = cy - ny * m;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return true;
}
const normAng = a => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const flipTip = f => [f.px + (f.side ? -Math.cos(f.ang) : Math.cos(f.ang)) * f.len, f.py + Math.sin(f.ang) * f.len];
const gravNow = b => GRAV * (wx.mode === 'rain' && b.type !== 'sapphire' ? 0.85 : 1);
function launchV(p) { return Math.sqrt(2 * GRAV * (wx.mode === 'rain' ? 0.85 : 1) * (H - 40)) * (1 + 0.32 * p); }
const mkBall = (x, y, vx, vy, type = 'steel') => ({ x, y, vx, vy, r: BALL_R, type, cool: {}, age: 0, dead: false, fuse: -1, flipT: -9, slT: -9, shiny: false });

function stepFlippers(h) {
  for (const f of flippers) {
    const target = f.pressed ? F_UP : F_REST, rate = f.pressed ? F_RATE_UP : F_RATE_DN;
    const d = target - f.ang, step = Math.sign(d) * Math.min(Math.abs(d), rate * h);
    f.ang += step; f.w = step / h;
  }
}

function stepBall(b, h) {
  b.vy += gravNow(b) * h;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
  b.x += b.vx * h; b.y += b.vy * h;

  // 釘子
  const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
  if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) {
    const e = b.type === 'sapphire' ? 0.75 : 0.42;
    for (const p of grid[gx + gy * GC]) {
      if (hitCircle(b, p.x, p.y, p.r, e)) {
        b.vx += (Math.random() - 0.5) * 30; b.vx *= 0.985; p.f = 1; sfx.tick();
        if (b.type === 'ruby' && b.fuse < 0) { b.fuse = 1.5; sfx.ding(2); }   // 紅寶石：碰到第一個釘子開始倒數
      }
    }
  }
  for (const w of walls) hitSeg(b, w[0], w[1], w[2], w[3], 0.4);
  hitArc(b, arcC.x, arcC.y, ARC_R, 0.9);

  // 掉回發射通道底：自動補射
  if (b.x > LANE_X && b.y > H - 50 && b.vy > 0) {
    b.y = H - 50; b.vx = 0; b.vy = -launchV(0.5 + Math.random() * 0.5); plunger.kick = 1; sfx.drop();
  }

  // 寶石轉輪：珠撞到會讓它轉
  if (Math.abs(b.x - wheel.x) < 70 && Math.abs(b.y - wheel.y) < 70 && hitCircle(b, wheel.x, wheel.y, wheel.r, 0.55)) {
    const vt = -b.vx * b.ny + b.vy * b.nx;
    wheel.w = clamp(wheel.w + vt / wheel.r * 0.5, -36, 36); wheel.spinning = true; wheel.f = 1;
    if (time - wheel.hitT > 0.2) { wheel.hitT = time; sfx.bump(); stat('wheelHits'); }
  }

  // R·S·E 標靶
  if (Math.abs(b.y - targets[0].y) < 30 && Math.abs(b.x - 270) < 80) {
    for (const t of targets) if (t.up && hitCapsule(b, t.x - TW, t.y, t.x + TW, t.y, TR, 0.5)) dropTarget(t);
  }
  // 天空之柱入口
  if (b.y > sky.y - 20 && b.y < sky.y + sky.depth + 24 && Math.abs(b.x - sky.x) < sky.hw + 20) {
    if (sky.t > 0) {
      hitSeg(b, sky.x - sky.hw, sky.y, sky.x - sky.open, sky.y + sky.depth, 0.3);
      hitSeg(b, sky.x + sky.hw, sky.y, sky.x + sky.open, sky.y + sky.depth, 0.3);
      if (b.y > sky.y + sky.depth - 4 && Math.abs(b.x - sky.x) < sky.open) { b.dead = true; onSkyIn(b); return; }
    } else {
      hitSeg(b, sky.x - sky.hw, sky.y, sky.x + sky.hw, sky.y, 0.5);
      hitSeg(b, sky.x - sky.hw, sky.y, sky.x - sky.open, sky.y + sky.depth, 0.4);
      hitSeg(b, sky.x + sky.hw, sky.y, sky.x + sky.open, sky.y + sky.depth, 0.4);
    }
  }

  // 入口（會移動）
  const c = catcher, top = c.y, bot = c.y + c.depth;
  if (b.y > top - 20 && b.y < bot + 30 && Math.abs(b.x - c.cx) < c.hw + 20) {
    hitSeg(b, c.cx - c.hw, top, c.cx - c.open, bot, 0.3);
    hitSeg(b, c.cx + c.hw, top, c.cx + c.open, bot, 0.3);
    if (b.y > bot - 4 && Math.abs(b.x - c.cx) < c.open) { b.dead = true; onCatch(b); return; }
  }

  // 彈射器 slingshot
  for (const s of slings) {
    if (Math.abs(b.x - s.apex[0]) > 110 || b.y < s.top[1] - 20 || b.y > s.bot[1] + 20) continue;
    const kick = time - b.slT > 0.1, e = kick ? 1.1 : 0.5;
    const h1 = hitSeg(b, s.apex[0], s.apex[1], s.top[0], s.top[1], e), h2 = hitSeg(b, s.apex[0], s.apex[1], s.bot[0], s.bot[1], e);
    if ((h1 || h2) && kick) {
      b.slT = time;
      const cx = (s.apex[0] + s.top[0] + s.bot[0]) / 3, cy = (s.apex[1] + s.top[1] + s.bot[1]) / 3;
      const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) || 1;
      b.vx += dx / d * 220; b.vy += dy / d * 220;
      s.f = 1; if (time - s.cool > 0.1) { s.cool = time; sfx.sling(); stat('slingHits'); }
    }
  }

  // 翻板：會旋轉的線段，接觸點線速度（ω×r）的法線分量給珠
  if (b.y > H - 200) for (const f of flippers) {
    const [tx, ty] = flipTip(f);
    if (!hitCapsule(b, f.px, f.py, tx, ty, F_TH, 0.3)) continue;
    const r = b.ct * f.len, a = f.ang;
    const sx = (f.side ? Math.sin(a) : -Math.sin(a)) * r * f.w, sy = Math.cos(a) * r * f.w;
    const vs = sx * b.nx + sy * b.ny;
    if (vs > 0) {
      const k = FLIP_K * (wx.mode === 'sun' ? 1.25 : 1) * (b.type === 'sapphire' ? 1.3 : 1);
      const cap = FLIP_MAX * k / FLIP_K, want = Math.min(vs * k, cap), vn = b.vx * b.nx + b.vy * b.ny, sp0 = Math.hypot(b.vx, b.vy);
      if (vn < want) { b.vx += (want - vn) * b.nx; b.vy += (want - vn) * b.ny; }
      const sp1 = Math.hypot(b.vx, b.vy), cap2 = Math.max(sp0, cap);
      if (sp1 > cap2) { b.vx *= cap2 / sp1; b.vy *= cap2 / sp1; }   // 連續幾個子步都在推，總量不超過上限
    }
    if (time - b.flipT > 0.15) { b.flipT = time; onFlip(b, f, vs); if (b.dead) return; }
  }

  if (b.y > H - 22) {
    b.dead = true;
    if (b.x < 112) onPocket(0, b);
    else if (b.x > 428) onPocket(1, b);
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
function giveBalls(n, why, x = 270, y = 300) {
  S.game.balls += n; S.game.ended = false; stat('bonusBalls', n);
  addFloat(x, y, `${why} 彈珠 +${n}`, '#ffd166'); sfx.reward(); refreshUI();
}

function onCatch(b) {
  const n = wx.mode === 'clear' ? 2 : 1;
  let ball = 'poke';
  for (let i = 0; i < n; i++) {
    ball = rollBallType();
    addToBox({ ball, shiny: !!b.shiny });
    S.game.caught++; S.stats.caught++; stat('entrance'); statMap('balls', ball);
    if (b.shiny) stat('shinyIn');
  }
  catcher.f = 1; sfx.catch(); burst(b.x, catcher.y + catcher.depth, b.shiny ? '#ffd166' : ball === 'master' ? '#a78bfa' : '#2fd6a0');
  addFloat(catcher.cx, catcher.y - 34, `${b.shiny ? '✨' : ''}${BALL_NAME[ball]} +${n}`, b.shiny ? '#ffd166' : ball === 'master' ? '#c4b5fd' : ball === 'ultra' ? '#ffd166' : '#2fd6a0');
  if (ball === 'master') toast('哇！入口掉出了大師球！');
  refreshUI();
}
function onSkyIn(b) {
  sky.f = 1; stat('skyIn');
  if (Math.random() < 1 / 50) {
    const id = pick(SKY_LEGENDS);
    S.stats.legend++; S.game.caught++; S.stats.caught++;
    addToBox({ ball: 'master', fixed: id, shiny: Math.random() < 0.1 });
    burst(sky.x, sky.y + sky.depth, '#a78bfa', 40);
    legendBanner(id);
    return;
  }
  const n = wx.mode === 'clear' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const ball = Math.random() < 0.15 ? 'master' : 'ultra', shiny = b.shiny || Math.random() < 1 / 8;
    addToBox({ ball, shiny });
    S.game.caught++; S.stats.caught++; statMap('balls', ball);
    addFloat(sky.x, sky.y - 30 - i * 18, `${shiny ? '✨' : ''}${BALL_NAME[ball]} +1`, shiny ? '#ffd166' : '#2fd6a0');
  }
  sfx.catch(); sfx.sparkle(); burst(sky.x, sky.y + sky.depth, '#2fd6a0', 20);
  refreshUI();
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
  stat('pocketIn');
  if (Math.random() < 0.001 + S.charge[side] / 100 * 0.005 || S.charge[side] >= 100) return captureLegend(side);
  S.charge[side] = Math.min(100, S.charge[side] + 0.12);
  pk.state = '捕獲失敗'; pk.st = 1; sfx.fail();
  addFloat(side ? 440 : 100, H - 190, '充能 +0.12%', '#c4b5fd');
  if (S.charge[side] >= 100) captureLegend(side);
}
function onLost(b) {
  stat('lost');
  const side = b.x < W / 2 ? 0 : 1;
  S.charge[side] = Math.min(100, S.charge[side] + 0.02);
  if (S.charge[side] >= 100) captureLegend(side);
}
// 翻板打到珠：綠寶石分裂、晴朗無雲 1/10 變閃光珠
function onFlip(b, f, vs) {
  if (vs > 50) { stat('flipHits'); f.f = 1; }
  if (b.type === 'emerald') {
    b.dead = true; stat('splits'); sfx.split(); burst(b.x, b.y, '#2fd6a0', 18);
    addFloat(b.x, b.y - 24, '分裂！', '#2fd6a0');
    for (const s of [-1, 1]) { const nb = mkBall(b.x + s * 9, b.y - 2, b.vx + s * 150, Math.min(b.vy, -120), 'steel'); nb.flipT = time; nb.shiny = b.shiny; balls.push(nb); }
    return;
  }
  if (wx.mode === 'clear' && vs > 50 && !b.shiny && Math.random() < 0.1) {
    b.shiny = true; stat('shinyBalls'); sfx.sparkle(); addFloat(b.x, b.y - 24, '✨ 閃光珠！', '#ffd166');
  }
}
// 紅寶石珠爆炸：推開半徑 90 內的珠、附近釘子發光
function explode(b) {
  b.dead = true; stat('rubyBoom'); sfx.boom();
  burst(b.x, b.y, '#ff4d6d', 36); burst(b.x, b.y, '#ffd166', 14);
  rings.push({ x: b.x, y: b.y, t: 0 });
  for (const o of balls) {
    if (o === b || o.dead) continue;
    const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
    if (d < 90 && d > 0) { o.vx += dx / d * 320; o.vy += dy / d * 320; }
  }
  for (const p of pegs) if (Math.hypot(p.x - b.x, p.y - b.y) < 90) p.f = 1;
  shakeT = 0.2; shakeDir = Math.random() < 0.5 ? -1 : 1;
}

/* ============ 標靶與天空之柱 ============ */
function dropTarget(t) {
  t.up = false; t.f = 1; stat('targetHits'); sfx.target(); burst(t.x, t.y, t.col, 12);
  addFloat(t.x, t.y - 26, t.ch, t.col);
  if (targets.every(x => !x.up) && sky.t <= 0) openSky();
}
function openSky() {
  sky.t = 10; sky.f = 1; stat('skyOpen');
  giveBalls(15, '天空之柱', sky.x, sky.y + 70);
  boardFlash(); sfx.flash(); sfx.fanfareRare();
  burst(sky.x, sky.y, '#2fd6a0', 40); burst(sky.x, sky.y, '#ffd166', 24);
  showBanner({ tag: '天空之柱', title: 'R·S·E 全倒！', sub: '入口開放 10 秒：必出高級球以上、1/8 閃光、1/50 幻之寶可夢', img: imgSrc(384), hold: 3200 });
  toast('🏛 天空之柱 OPEN！彈珠 +15，瞄準中央入口');
}
function updateSky(dt) {
  if (sky.f > 0) sky.f -= dt * 2;
  for (const t of targets) if (t.f > 0) t.f -= dt * 3;
  if (sky.t > 0) {
    sky.t -= dt;
    if (sky.t <= 0) { sky.t = 0; targets.forEach(t => { t.up = true; }); toast('天空之柱關閉，R·S·E 重新立起'); }
  }
}

/* ============ 寶石轉輪 ============ */
const wheelIdx = () => Math.floor(normAng(-Math.PI / 2 - wheel.ang) / (Math.PI * 2 / WHEEL_SEG.length)) % WHEEL_SEG.length;
function updateWheel(dt) {
  if (wheel.f > 0) wheel.f -= dt * 3;
  if (!wheel.spinning) return;
  wheel.ang += wheel.w * dt; wheel.spun += Math.abs(wheel.w * dt);
  const dec = (1.0 + Math.abs(wheel.w) * 0.3) * dt;
  wheel.w = Math.abs(wheel.w) <= dec ? 0 : wheel.w - Math.sign(wheel.w) * dec;
  const idx = wheelIdx();
  if (idx !== wheel.lastIdx) { wheel.lastIdx = idx; sfx.wheelTick(); }
  if (wheel.w === 0) {
    wheel.spinning = false;
    if (wheel.spun > 0.9) wheelStop(idx);
    wheel.spun = 0;
  }
}
function wheelStop(idx) {
  const seg = WHEEL_SEG[idx];
  stat('wheelSpins'); sfx.wheelStop();
  burst(wheel.x, wheel.y, seg === 'star' ? '#ffd166' : GEM_COL[seg], 18);
  if (seg === 'star') { stat('wheelStars'); giveBalls(5, '寶石轉輪 ★', wheel.x, wheel.y + 64); }
  else { setNextGem(seg); addFloat(wheel.x, wheel.y + 64, `下一顆寶石：${GEM_NAME[seg]}`, GEM_COL[seg]); }
  refreshUI();
}
// 這一組的寶石珠還沒發就直接換色，否則留給下一組
function setNextGem(c) {
  const g = Math.floor(S.game.shots / 6);
  if (gemPlan.group === g && S.game.shots % 6 <= gemPlan.slot) gemPlan.color = c; else S.nextGem = c;
}
function randGem() {
  const sun = wx.mode === 'sun', r = Math.random() * (sun ? 4 : 3);
  return r < (sun ? 2 : 1) ? 'ruby' : r < (sun ? 3 : 2) ? 'sapphire' : 'emerald';
}
function ensurePlan() {
  const g = Math.floor(S.game.shots / 6);
  if (gemPlan.group === g) return;
  gemPlan.group = g; gemPlan.slot = Math.floor(Math.random() * 6);
  gemPlan.color = S.nextGem || randGem(); S.nextGem = null;
}
function nextType() { ensurePlan(); return S.game.shots % 6 === gemPlan.slot ? gemPlan.color : 'steel'; }

/* ============ 天氣 ============ */
function setWx(mode, quiet) {
  wx.mode = mode; wx.left = WX[mode].dur;
  document.body.classList.remove('wx-sun', 'wx-rain', 'wx-clear'); document.body.classList.add('wx-' + mode);
  catcher.baseHw = mode === 'rain' ? 69 : 46;
  if (!quiet) { toast(`${WX[mode].ico} ${WX[mode].name}：${WX[mode].note}`); sfx.weather(); boardFlash(); stat('wx_' + mode); }
  lastWxSec = -1;
}
function updateWx(dt) {
  wx.left -= dt;
  if (wx.left <= 0) setWx(WX_SEQ[(WX_SEQ.indexOf(wx.mode) + 1) % WX_SEQ.length]);
  if (wx.mode === 'rain') {
    for (let i = 0; i < 3 && rain.length < 90; i++) rain.push({ x: Math.random() * (W + 60), y: -10, l: 10 + Math.random() * 14, s: 500 + Math.random() * 300 });
    for (const r of rain) { r.y += r.s * dt; r.x -= r.s * 0.25 * dt; }
    rain = rain.filter(r => r.y < H + 20);
  } else if (rain.length) rain = [];
}

/* ============ 操作：發射、翻板、搖台 ============ */
function queueBurst(power) { if (burstLeft <= 0) { burstLeft = BURST; burstPower = power; fireCD = 0; } }
function fire(power = 0.5) {
  if (isPaused() || S.game.ended) return false;
  if (tiltLock > 0) { toast('TILT 中，等台子解鎖…'); return false; }
  if (S.game.balls <= 0) { toast('這局的彈珠用完了'); return false; }
  if (balls.length >= MAX_ON_BOARD) return false;
  let type = nextType();
  if (type === 'steel' && wx.mode === 'sun' && Math.random() < 1 / 12) type = 'ruby';   // 晴天：紅寶石珠變多
  S.game.balls--; S.game.shots++; S.stats.shots++; statMap('fired', type);
  balls.push(mkBall(522, H - 46, 0, -launchV(clamp(power, 0, 1)), type));
  plunger.kick = 1; sfx.launch(); refreshUI();
  return true;
}
function plungerDown() { if (plunger.charging) return; plunger.charging = true; plunger.power = 0; plunger.holdT = 0; plunger.auto = false; }
function plungerUp() {
  if (!plunger.charging) return;
  plunger.charging = false;
  if (!plunger.auto && burstLeft <= 0) fire(plunger.power);
  plunger.power = 0;
}
function doShake(dir) {
  if (isPaused() || tiltLock > 0 || S.game.ended) return;
  tilt += 36;
  if (tilt > 100) {
    tilt = 0; tiltLock = 3.5; sfx.tilt(); stat('tilts');
    $('tiltMsg').classList.add('show'); toast('搖太兇了！台子鎖住 3.5 秒');
    syncFlip();
    return;
  }
  for (const b of balls) { b.vx += dir * (180 + Math.random() * 90); b.vy -= 110; }
  shakeT = 0.28; shakeDir = dir; sfx.shake(); stat('shakes');
}
function syncFlip() {
  const vals = [...ptrs.values()];
  flippers.forEach((f, i) => {
    const side = i ? 'R' : 'L';
    const want = (keyHold[side] || btnHold[side] || forceHold[i] || vals.includes(side) || time - autoFlipT[i] < 0.12) && tiltLock <= 0;
    if (want && !f.pressed) { stat('flips'); sfx.flip(); }
    f.pressed = want;
  });
  $('flipL').classList.toggle('on', flippers[0].pressed);
  $('flipR').classList.toggle('on', flippers[1].pressed);
}
const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
let hintT = 0;
cv.addEventListener('pointerdown', e => {
  AU.init(); e.preventDefault();
  const p = toCanvas(e);
  let zone = null;
  if (p.x > 470 && p.y > H - 280) zone = 'P';
  else if (p.y > H * 0.5) zone = p.x < W / 2 ? 'L' : 'R';
  if (!zone) { if (time - hintT > 3) { hintT = time; toast('下半部左右＝翻板，右下角拉桿＝發射'); } return; }
  ptrs.set(e.pointerId, zone);
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  if (zone === 'P') plungerDown(); else syncFlip();
});
['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, e => {
  const zone = ptrs.get(e.pointerId); if (!zone) return;
  ptrs.delete(e.pointerId);
  if (zone === 'P') plungerUp(); else syncFlip();
}));
cv.addEventListener('contextmenu', e => e.preventDefault());
function bindHold(el, side) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); try { el.setPointerCapture(e.pointerId); } catch (err) {} btnHold[side] = true; syncFlip(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, () => { btnHold[side] = false; syncFlip(); }));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
bindHold($('flipL'), 'L'); bindHold($('flipR'), 'R');
window.addEventListener('keydown', e => {
  AU.init();
  const k = e.key.toLowerCase();
  if ($('mDex').classList.contains('show')) return;
  if (k === 'arrowleft' || k === 'arrowright' || k === ' ') e.preventDefault();
  if (anyModal()) { if (!e.repeat && (k === 'p' || k === 'escape') && pauses.has('user')) togglePause(); return; }
  if (k === 'z' || k === 'arrowleft') { keyHold.L = true; syncFlip(); }
  else if (k === 'x' || k === 'arrowright') { keyHold.R = true; syncFlip(); }
  if (e.repeat) return;
  if (k === ' ') plungerDown();
  else if (k === 'a') doShake(-1);
  else if (k === 'd') doShake(1);
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'b') requestOpen();
  else if (k === 'c') openDex();
  else if (k === 's') openStats();
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'z' || k === 'arrowleft') { keyHold.L = false; syncFlip(); }
  else if (k === 'x' || k === 'arrowright') { keyHold.R = false; syncFlip(); }
  else if (k === ' ') plungerUp();
});
function bindPress(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); fn(); }); }
bindPress($('nudgeL'), () => doShake(-1));
bindPress($('nudgeR'), () => doShake(1));
function releaseAll() { ptrs.clear(); keyHold.L = keyHold.R = false; btnHold.L = btnHold.R = false; plunger.charging = false; plunger.power = 0; syncFlip(); }

/* ============ 更新 ============ */
function update(dt) {
  time += dt;
  updateWx(dt);
  catcher.cx = 270 + Math.sin(time * 0.6) * 110;
  catcher.hw += (catcher.baseHw - catcher.hw) * Math.min(1, dt * 4);

  // 拉桿蓄力；按住超過 1.1 秒以當時力道連發 10 顆
  if (plunger.charging) {
    plunger.power = Math.min(1, plunger.power + dt / 0.9); plunger.holdT += dt;
    if (plunger.holdT > 1.1 && burstLeft <= 0) { plunger.holdT = 0; plunger.auto = true; queueBurst(plunger.power); }
  }
  if (plunger.kick > 0) plunger.kick -= dt * 5;
  fireCD -= dt;
  if (burstLeft > 0 && fireCD <= 0) { if (fire(burstPower)) { burstLeft--; fireCD = 0.085; } else burstLeft = 0; }
  if (autoTest) {
    if (fireCD <= 0 && fire(Math.random())) fireCD = 0.16;
    // 自動翻板：有珠落到翻板上方就揮
    flippers.forEach((f, i) => {
      if (time - autoFlipT[i] < 0.3) return;
      if (balls.some(b => !b.dead && b.y > H - 190 && b.y < H - 60 && b.vy > 0 && (i ? b.x > 250 : b.x < 290))) autoFlipT[i] = time;
    });
  }
  syncFlip();

  tilt = Math.max(0, tilt - 14 * dt);
  if (tiltLock > 0) { tiltLock -= dt; if (tiltLock <= 0) { $('tiltMsg').classList.remove('show'); syncFlip(); } }
  if (shakeT > 0) shakeT -= dt;

  const SUB = 6, h = dt / SUB;
  for (let s = 0; s < SUB; s++) { stepFlippers(h); for (const b of balls) if (!b.dead) stepBall(b, h); }
  for (const b of balls) {
    b.age += dt; if (b.age > 40) b.dead = true;
    if (b.fuse > 0 && !b.dead) { b.fuse -= dt; if (b.fuse <= 0) explode(b); }
  }
  balls = balls.filter(b => !b.dead);

  for (const p of pegs) if (p.f > 0) p.f -= dt * 4;
  for (const f of flippers) if (f.f > 0) f.f -= dt * 4;
  for (const s of slings) if (s.f > 0) s.f -= dt * 5;
  updateWheel(dt); updateSky(dt);
  if (catcher.f > 0) catcher.f -= dt * 3;
  for (const pk of pockets) if (pk.st > 0) { pk.st -= dt; if (pk.st <= 0) pk.state = ''; }
  for (const p of parts) { p.t += dt; p.vy += 400 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.t < p.life);
  for (const r of rings) r.t += dt;
  rings = rings.filter(r => r.t < 0.5);
  for (const f of floats) f.t += dt;
  floats = floats.filter(f => f.t < 1.2);

  roundLeft -= dt;
  if (roundLeft <= 0) { roundLeft = ROUND_SEC; if (S.box.length) openRound(); }

  // 彈珠用完且台面清空 → 結算
  if (!S.game.ended && S.game.balls <= 0 && !balls.length && burstLeft <= 0) {
    S.game.ended = true; pendingSummary = true;
    if (S.box.length) openRound(); else { pendingSummary = false; showSummary(); }
  }
  saveT -= dt; if (saveT <= 0) { saveT = 3; save(); }
}

/* ============ 繪製 ============ */
function txt(t, x, y, size, color = '#f1f7ff', weight = 800, font = FONT) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,10,20,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
}
const ntxt = (t, x, y, size, color, weight = 800) => txt(t, x, y, size, color, weight, NUM);
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function neonLine(pts, color, w) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [lw, a] of [[w + 8, 0.18], [w, 1]]) {
    ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}
function capsule(ax, ay, bx, by, rad) {
  const a = Math.atan2(by - ay, bx - ax);
  ctx.beginPath(); ctx.arc(ax, ay, rad, a + Math.PI / 2, a - Math.PI / 2); ctx.arc(bx, by, rad, a - Math.PI / 2, a + Math.PI / 2); ctx.closePath();
}

function render() {
  if (!BG) return;
  ctx.save();
  if (shakeT > 0) ctx.translate(shakeDir * Math.sin(shakeT * 70) * 6 * (shakeT / 0.28), 0);
  ctx.drawImage(BG, 0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // 拉桿（發射通道底）
  {
    const lx = 518.5, pw = plunger.charging ? plunger.power : 0, pull = pw * 26 - Math.max(0, plunger.kick) * 10;
    const rodTop = H - 36 + pull;
    ctx.strokeStyle = '#8b94a8'; ctx.lineWidth = 2;
    ctx.beginPath(); for (let y = rodTop + 6; y < H - 4; y += 4) ctx.lineTo(lx + (((y / 4) | 0) % 2 ? 6 : -6), y); ctx.stroke();
    const rg = ctx.createLinearGradient(lx - 8, 0, lx + 8, 0); rg.addColorStop(0, '#ff8a9c'); rg.addColorStop(0.5, '#ff3b5c'); rg.addColorStop(1, '#8a0b26');
    ctx.fillStyle = rg; rr(lx - 8, rodTop, 16, 12, 4); ctx.fill();
    ctx.fillStyle = '#c9d1dd'; ctx.fillRect(lx - 2.5, rodTop + 12, 5, H - rodTop - 12);
    if (plunger.charging) { ctx.fillStyle = `rgba(255,154,46,${0.25 + pw * 0.5})`; ctx.fillRect(LANE_X + 2, H - 40 - pw * 180, 531 - LANE_X - 4, pw * 180 + 20); ntxt(`${Math.round(pw * 100)}%`, lx, H - 60 - pw * 180, 11, '#ffd166'); }
    if (S.game.balls > 0 && !balls.some(b => b.x > LANE_X && b.y > H - 120)) ctx.drawImage(BALL_SPR[nextType()], lx - 8, H - 58 + pull, 16, 16);
    txt('PULL', lx, H - 8, 7, '#93a8c4', 700);
  }

  // 釘子
  for (const p of pegs) {
    if (p.f > 0) { ctx.globalAlpha = p.f * 0.6; ctx.fillStyle = '#2fd6a0'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6 * p.f, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = p.f > 0 ? '#d9fff1' : p.x < 270 ? '#c08a93' : '#8fa3cf'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(p.x - 1.3, p.y - 1.4, 1.3, 0, Math.PI * 2); ctx.fill();
  }

  // 寶石轉輪
  {
    const n = WHEEL_SEG.length, seg = Math.PI * 2 / n;
    ctx.save(); ctx.translate(wheel.x, wheel.y);
    if (wheel.f > 0) { ctx.globalAlpha = wheel.f * 0.5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, wheel.r + 12, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    for (let i = 0; i < n; i++) {
      const a0 = wheel.ang + i * seg, s = WHEEL_SEG[i];
      ctx.fillStyle = s === 'star' ? '#ffd166' : GEM_COL[s];
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, wheel.r, a0, a0 + seg); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (s === 'star') { ctx.save(); ctx.rotate(a0 + seg / 2); ctx.fillStyle = '#5a3a00'; ctx.font = `900 14px ${FONT}`; ctx.fillText('★', wheel.r * 0.66, 0); ctx.restore(); }
    }
    ctx.strokeStyle = '#e6ebf5'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, wheel.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#121c33'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 指針（在上方）
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, -wheel.r - 10); ctx.lineTo(8, -wheel.r - 10); ctx.lineTo(0, -wheel.r + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    txt(wheel.spinning ? '轉動中…' : '寶石轉輪', wheel.x, wheel.y + wheel.r + 16, 11, '#ffd166', 800);
  }

  // R·S·E 標靶
  for (const t of targets) {
    if (t.up) {
      const g = ctx.createLinearGradient(0, t.y - TR, 0, t.y + TR); g.addColorStop(0, '#fff'); g.addColorStop(0.3, t.col); g.addColorStop(1, '#222');
      ctx.fillStyle = 'rgba(0,0,0,.4)'; capsule(t.x - TW, t.y + 3, t.x + TW, t.y + 3, TR); ctx.fill();
      ctx.fillStyle = g; capsule(t.x - TW, t.y, t.x + TW, t.y, TR); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.stroke();
      ntxt(t.ch, t.x, t.y + 0.5, 11, '#fff', 900);
    } else {
      if (t.f > 0) { ctx.globalAlpha = t.f; ctx.fillStyle = '#fff'; capsule(t.x - TW, t.y, t.x + TW, t.y, TR + 4); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); capsule(t.x - TW, t.y, t.x + TW, t.y, TR); ctx.stroke(); ctx.setLineDash([]);
      ntxt(t.ch, t.x, t.y + 0.5, 10, 'rgba(255,255,255,.3)', 900);
    }
  }
  txt('打倒 R·S·E 開天空之柱', 270, targets[0].y - 24, 11, '#93a8c4', 700);

  // 天空之柱入口
  {
    const open = sky.t > 0, pulse = 0.5 + Math.sin(time * 10) * 0.5;
    const col = open ? (Math.sin(time * 14) > 0 ? '#2fd6a0' : '#ffd166') : 'rgba(150,170,200,.55)';
    if (open) {
      ctx.fillStyle = `rgba(47,214,160,${0.15 + pulse * 0.2})`; ctx.fillRect(sky.x - sky.open + 2, sky.y + sky.depth, (sky.open - 2) * 2, 40);
      ctx.fillStyle = `rgba(47,214,160,${0.08 + pulse * 0.08})`; ctx.beginPath(); ctx.arc(sky.x, sky.y + 10, 60 + pulse * 6, 0, Math.PI * 2); ctx.fill();
      ntxt(`${Math.ceil(sky.t)}s`, sky.x, sky.y + sky.depth + 22, 15, '#ffd166', 900);
      txt('天空之柱 OPEN', sky.x, sky.y - 12, 13, '#2fd6a0', 900);
    } else {
      ctx.fillStyle = 'rgba(20,30,50,.85)'; ctx.fillRect(sky.x - sky.hw, sky.y - 4, sky.hw * 2, 8);
      ctx.strokeStyle = 'rgba(200,215,235,.7)'; ctx.lineWidth = 1.5; for (let x = sky.x - sky.hw + 6; x < sky.x + sky.hw; x += 8) { ctx.beginPath(); ctx.moveTo(x, sky.y - 4); ctx.lineTo(x - 4, sky.y + 4); ctx.stroke(); }
      txt('天空之柱', sky.x, sky.y + sky.depth + 10, 10, 'rgba(200,215,235,.6)', 700);
    }
    neonLine([sky.x - sky.hw, sky.y, sky.x - sky.open, sky.y + sky.depth], col, 4);
    neonLine([sky.x + sky.hw, sky.y, sky.x + sky.open, sky.y + sky.depth], col, 4);
    if (sky.f > 0) { ctx.fillStyle = `rgba(255,209,102,${sky.f * 0.5})`; ctx.beginPath(); ctx.arc(sky.x, sky.y + sky.depth, 26, 0, Math.PI * 2); ctx.fill(); }
  }

  // 入口
  {
    const c = catcher, cc = c.f > 0 ? '#ffd166' : wx.mode === 'clear' ? (Math.sin(time * 12) > 0 ? '#2fd6a0' : '#ffd166') : wx.mode === 'rain' ? '#4f8dff' : '#2fd6a0';
    txt(wx.mode === 'clear' ? '⇣ 入口得球 ×2！' : wx.mode === 'rain' ? '⇣ 入口（雨天加寬）' : '⇣ 入口得寶可夢', c.cx, c.y - 18, 13, cc);
    ctx.fillStyle = 'rgba(47,214,160,.12)'; ctx.fillRect(c.cx - c.open + 2, c.y + c.depth, (c.open - 2) * 2, 30);
    neonLine([c.cx - c.hw, c.y, c.cx - c.open, c.y + c.depth], cc, 6);
    neonLine([c.cx + c.hw, c.y, c.cx + c.open, c.y + c.depth], cc, 6);
    if (c.f > 0) { ctx.fillStyle = `rgba(255,209,102,${c.f * 0.5})`; ctx.beginPath(); ctx.arc(c.cx, c.y + c.depth, 28, 0, Math.PI * 2); ctx.fill(); }
  }

  // 彈射器 slingshot
  for (const s of slings) {
    const col = s.side ? '#4f8dff' : '#ff4d6d';
    ctx.fillStyle = s.f > 0 ? `rgba(255,255,255,${0.35 + s.f * 0.6})` : (s.side ? 'rgba(20,72,184,.75)' : 'rgba(179,18,58,.75)');
    ctx.beginPath(); ctx.moveTo(s.apex[0], s.apex[1]); ctx.lineTo(s.top[0], s.top[1]); ctx.lineTo(s.bot[0], s.bot[1]); ctx.closePath(); ctx.fill();
    neonLine([s.top[0], s.top[1], s.apex[0], s.apex[1], s.bot[0], s.bot[1]], s.f > 0 ? '#ffffff' : col, 4);
    ctx.fillStyle = '#e6ebf5'; [s.apex, s.top, s.bot].forEach(p => { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); });
  }

  // 傳說外線道
  for (const pk of pockets) {
    const id = legendId(pk.side), cx = (pk.x0 + pk.x1) / 2, w = pk.x1 - pk.x0, im = legendImgs[id], sz = Math.min(w - 10, 56);
    const ch = S.charge[pk.side];
    txt('傳說', cx, H - 178, 10, '#c4b5fd', 700);
    ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(cx - w / 2 + 6, H - 168, w - 12, 6, 3); ctx.fill();
    if (ch > 0) { ctx.fillStyle = '#a78bfa'; rr(cx - w / 2 + 6, H - 168, Math.max(6, (w - 12) * ch / 100), 6, 3); ctx.fill(); }
    ntxt(`${Math.floor(ch)}%`, cx, H - 152, 10, '#c4b5fd');
    if (im.complete && im.naturalWidth) ctx.drawImage(im, cx - sz / 2, H - 140, sz, sz);
    txt(P[id].zh, cx, H - 76, 10, '#e9e2ff', 900);
    if (pk.state) {
      const ok = pk.state.includes('成功');
      ctx.fillStyle = ok ? 'rgba(255,209,102,.9)' : 'rgba(20,27,63,.9)';
      rr(cx - 30, H - 64, 60, 18, 9); ctx.fill();
      txt(pk.state, cx, H - 55, 10, ok ? '#3a1a7a' : '#9aa6c8', 900);
    }
  }
  txt('流失口', 270, H - 12, 10, 'rgba(147,168,196,.6)', 700);

  // 翻板
  for (const f of flippers) {
    const [tx, ty] = flipTip(f), col0 = f.side ? '#8fb6ff' : '#ff9db0', col1 = f.side ? '#1448b8' : '#b3123a';
    if (f.f > 0 || f.pressed) { ctx.globalAlpha = 0.35 + Math.max(0, f.f) * 0.4; ctx.fillStyle = f.side ? '#4f8dff' : '#ff4d6d'; capsule(f.px, f.py, tx, ty, F_TH + 7); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(0,0,0,.45)'; capsule(f.px, f.py + 4, tx, ty + 4, F_TH); ctx.fill();
    const g = ctx.createLinearGradient(f.px, f.py - F_TH, f.px, f.py + F_TH); g.addColorStop(0, col0); g.addColorStop(0.5, col1); g.addColorStop(1, '#1a0a14');
    ctx.fillStyle = g; capsule(f.px, f.py, tx, ty, F_TH); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#e6ebf5'; ctx.beginPath(); ctx.arc(f.px, f.py, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a2440'; ctx.beginPath(); ctx.arc(f.px, f.py, 2, 0, Math.PI * 2); ctx.fill();
  }

  // 珠
  for (const b of balls) {
    const spr = BALL_SPR[b.type] || BALL_SPR.steel;
    if (b.fuse > 0) {
      const k = 1 - b.fuse / 1.5, on = Math.sin(time * (14 + k * 50)) > 0;
      if (on) { ctx.fillStyle = 'rgba(255,77,109,.45)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6 + k * 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,209,102,.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(b.x, b.y, 90 * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    if (b.shiny) {
      ctx.fillStyle = 'rgba(255,209,102,.35)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2); ctx.fill();
      const a = time * 6; ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) { const aa = a + i * 2.1; ctx.beginPath(); ctx.arc(b.x + Math.cos(aa) * 11, b.y + Math.sin(aa) * 11, 1.6, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.drawImage(spr, b.x - b.r - 1, b.y - b.r - 1, b.r * 2 + 2, b.r * 2 + 2);
  }

  // 爆炸圓環、粒子、浮字
  for (const r of rings) { const k = r.t / 0.5; ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, 90 * Math.sqrt(k), 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (const p of parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5); }
  ctx.globalAlpha = 1;
  // 雨絲
  if (rain.length) {
    ctx.strokeStyle = 'rgba(170,205,255,.45)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const r of rain) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.l * 0.25, r.y + r.l); }
    ctx.stroke();
  }
  for (const f of floats) { ctx.globalAlpha = 1 - f.t / 1.2; txt(f.text, f.x, f.y - f.t * 40, 15, f.color); }
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
  setBar('dex', dc / DEX_TOTAL); setBar('shiny', sc / DEX_TOTAL); setBar('legend', lc / LEGEND_TOTAL);
  $('dmd').classList.toggle('low', S.game.balls <= 10);
  $('boxCnt').textContent = S.box.length;
  $('btnBox').classList.toggle('ready', S.box.length > 0);
  // 下一顆珠與轉輪結果
  const t = nextType();
  $('dmNext').className = 'gb ' + t; $('dmNextN').textContent = GEM_NAME[t];
  const pending = gemPlan.group === Math.floor(S.game.shots / 6) && S.game.shots % 6 <= gemPlan.slot;
  $('dmGem').textContent = pending ? `本組寶石：${GEM_NAME[gemPlan.color]}` : `下組：${S.nextGem ? GEM_NAME[S.nextGem] : '轉輪決定'}`;
}
function renderRecent() {
  const html = S.recent.slice(0, 12).map(r => `<div class="rc-mini ${r.s ? 'shiny' : ''}" title="${P[r.id].zh}"><img src="${imgSrc(r.id, r.s)}" alt="${P[r.id].zh}"></div>`).join('')
    || '<div style="grid-column:1/-1;font-size:12px;color:var(--mut)">開箱後會出現在這裡</div>';
  document.querySelectorAll('[data-recent]').forEach(e => { e.innerHTML = html; });
}
let lastBoxSec = -1, lastWxSec = -1, lastPwr = -1;
function updateTimerUI() {
  const pw = plunger.charging ? plunger.power : 0;
  if (pw !== lastPwr) { lastPwr = pw; $('pwrBar').style.width = (pw * 100).toFixed(0) + '%'; }
  const tb = $('tiltBar'); tb.style.width = tilt + '%'; tb.classList.toggle('hot', tilt > 60);
  const ws = Math.ceil(wx.left);
  if (ws !== lastWxSec) {
    lastWxSec = ws;
    $('dmWx').textContent = WX[wx.mode].ico; $('dmWxT').textContent = ws; $('dmWxN').textContent = `${WX[wx.mode].name}：${WX[wx.mode].note}`;
  }
  const sec = Math.ceil(roundLeft);
  if (sec === lastBoxSec) return;
  lastBoxSec = sec;
  $('boxTime').textContent = `開箱 ${sec}s`;
  $('boxRing').style.strokeDashoffset = (106.8 * roundLeft / ROUND_SEC).toFixed(1);
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
    el.querySelector('.tag').textContent = P[id].mythical ? '幻之寶可夢' : '傳說寶可夢';
    el.querySelector('b').textContent = P[id].zh;
    el.querySelector('.sub').textContent = '收服成功！開箱時登錄圖鑑';
  }, 1150);
}

/* ============ 暫停／抽屜 ============ */
function pause(reason) { pauses.add(reason); releaseAll(); burstLeft = 0; syncPauseUI(); }
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
  if (!confirm(CH ? '重新挑戰會清掉這次挑戰的進度，確定嗎？' : '重開一局會把彈珠重設為 100 顆（圖鑑會保留），確定嗎？')) return;
  closeDrawer(); startNewGame();
});
$('btnBox').addEventListener('click', () => { AU.init(); requestOpen(); });
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

function requestOpen() {
  if (!S.box.length) { toast('收集倉是空的，先讓彈珠落進入口吧！'); return; }
  openRound();
}
// gift：禮物直接給的寶可夢，不經過收集倉
function openRound(gift) {
  if (anyModal()) return;
  if (!gift && !S.box.length) { toast('收集倉是空的，先讓彈珠落進入口吧！'); return; }
  pause('reveal');
  const items = (gift || S.box).map(b => {
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
const isSpecial = it => it.gift || it.shiny || it.tier === 'srare' || it.tier === 'legend';
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
  $('rvTitle').textContent = hasLegend ? '傳說寶可夢降臨！' : hasShiny ? '閃光寶可夢出現了！' : hasRare ? '稀有寶可夢登場！' : '開箱完成！';
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
    : it.shiny ? ['✨ 閃光反應！！', '#ffd166', 'rgba(255,209,102,.13)']
    : it.tier === 'srare' ? ['★ 超稀有反應！', '#fbbf24', 'rgba(251,191,36,.1)']
    : ['★ 稀有反應！', '#60a5fa', 'rgba(96,165,250,.1)'];
  sp.className = 'spot show' + (it.shiny ? ' shiny' : '');
  sp.style.setProperty('--hint', hint[1]); sp.style.setProperty('--ray', hint[2]);
  $('spHint').textContent = hint[0];
  freshImg($('spImg'), imgSrc(it.id, it.shiny));
  $('spName').textContent = '？？？';
  $('spMeta').innerHTML = `<span class="pb ${it.ball}"></span>${BALL_NAME[it.ball]}`;
  sfx.drumroll(1.5);
  await waitTapOr(1500, false);
  if (skipping) return;
  flashScreen(it.shiny);
  sfx.flash();
  await sleep(120);
  freshImg($('spImg'), imgSrc(it.id, it.shiny));
  sp.classList.add('revealed');
  $('spHint').textContent = it.tier === 'legend' ? (P[it.id].mythical ? '幻之寶可夢' : '傳說寶可夢') : it.shiny ? '閃光寶可夢' : TIER_NAME[it.tier] + '寶可夢';
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
  $('rvTag').textContent = '圖鑑';
  $('rvTitle').textContent = '圖鑑已更新';
  $('rvRight').textContent = `新登錄 ${after.dex - before.dex} 種`;
  $('rvNote').textContent = '圖鑑一旦點亮就永久保留';
  $('rvNext').textContent = '繼續冒險';
  const bar = (label, a, b, total, grad) => `<div class="prog"><span>${label}${b > a ? `<span class="plus">+${b - a}</span>` : ''}</span><span class="num">${b} / ${total}</span>
    <div class="bar"><i style="width:${a / total * 100}%;background:${grad}" data-w="${b / total * 100}%"></i></div></div>`;
  let html = `<div class="upd"><section>${bar('豐緣圖鑑', before.dex, after.dex, DEX_TOTAL, 'linear-gradient(90deg,#2fd6a0,#4f8dff)')}
    ${bar('閃光圖鑑', before.shiny, after.shiny, DEX_TOTAL, 'linear-gradient(90deg,#ff5f9e,#ffd166)')}
    ${bar('傳說寶可夢', before.legend, after.legend, LEGEND_TOTAL, 'linear-gradient(90deg,#a78bfa,#ff4fa3)')}</section>`;
  if (evos.length) html += `<section><h4>進化！</h4><div class="evos">${evos.map(e => `<div class="evo"><img src="${imgSrc(e.from)}" alt="">×3<span class="ar">➜</span><img src="${imgSrc(e.to)}" alt="">${P[e.to].zh}${e.isNew ? ' <span class="badge">NEW</span>' : ''}</div>`).join('')}</div></section>`;
  html += `<section><h4>本輪新登錄</h4>${news.length ? `<div class="news">${news.map(it => `<div><img src="${imgSrc(it.id, it.shiny)}" alt="">${P[it.id].zh}</div>`).join('')}</div>` : '<div class="empty">沒有新種類，重複的寶可夢會累積起來準備進化</div>'}</section></div>`;
  $('rvBody').innerHTML = html;
  setTimeout(() => $('rvBody').querySelectorAll('.bar i').forEach(i => { i.style.width = i.dataset.w; }), 80);
  if (evos.length) sfx.fanfareRare();
}

/* ============ 結算 ============ */
const loadRec = () => { try { return JSON.parse(localStorage.getItem(REC_KEY)) || {}; } catch (e) { return {}; } };
const saveRec = r => { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) {} };
const today = () => new Date().toLocaleDateString('zh-TW');
function showSummary() {
  const g = S.game, st = S.stats;
  pause('summary');
  sfx.gameOver();
  let head = '本局結束', right = `用掉 ${g.shots} 顆`, rec = '';
  let grid = [['發射', g.shots], ['捕獲', g.caught], ['新登錄', g.newDex], ['閃光', g.shiny]];
  if (CH) {
    const r = loadRec(), dc = dexCount(), sc = shinyCount();
    const old = r.b500, isNew = !old || dc > old.score || (dc === old.score && sc > old.shiny);
    if (isNew) r.b500 = { score: dc, shiny: sc, date: today() };
    head = `收集到 ${dc} 種！`;
    rec = isNew ? `🏆 新紀錄！500 顆收集 ${dc} 種` : `最佳紀錄：${old.score} 種（${old.date}）`;
    grid = [['收集', `${dc}/${DEX_TOTAL}`], ['發射', g.shots], ['天空之柱', st.skyOpen || 0], ['閃光', sc]];
    saveRec(r); renderRecords();
  }
  $('sumHead').textContent = head; $('sumRight').textContent = right; $('sumRec').textContent = rec;
  const best = g.best;
  $('sumBest').innerHTML = best
    ? `<img src="${imgSrc(best.id, best.shiny)}" alt=""><b>${best.shiny ? '✨' : ''}${P[best.id].zh}</b><small>最佳收穫・${TIER_NAME[P[best.id].tier]}</small>`
    : '<b>這局沒有收穫</b><small>用翻板把珠打回上面，瞄準移動的入口！</small>';
  $('sumGrid').innerHTML = grid.map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  $('sumAgain').textContent = CH ? '再挑戰一次' : '再來一局（100 顆）';
  $('mSum').classList.add('show');
}
function startNewGame() {
  if (CH) { S = Object.assign(fresh(), { music: S.music, sfx: S.sfx }); renderRecent(); }
  else S.game = newGame();
  balls = []; pendingSummary = false; roundLeft = ROUND_SEC; burstLeft = 0;
  sky.t = 0; targets.forEach(t => { t.up = true; }); wheel.w = 0; wheel.spinning = false; gemPlan.group = -1;
  save(); refreshUI(); toast(CH ? `挑戰開始：${CH_NAME[CH]}` : '新的一局開始！共 100 顆彈珠');
}
$('sumExit').addEventListener('click', () => { save(); location.href = selfURL(''); });
$('drLobby').addEventListener('click', () => { save(); location.href = '../'; });
$('sumAgain').addEventListener('click', () => { $('mSum').classList.remove('show'); resume('summary'); startNewGame(); });
$('sumDex').addEventListener('click', () => { $('mSum').classList.remove('show'); resume('summary'); if (!CH) startNewGame(); openDex(); });

/* ============ 圖鑑（分頁，不用捲動） ============ */
let dexFilter = 'all', dexPage = 0;
const shinyView = new Set();
function openDex() {
  if (anyModal()) return;
  pause('dex'); dexPage = 0;
  $('mDex').classList.add('show');
  $('dxTop').innerHTML = `<span>已登錄 <b>${dexCount()}</b>/${DEX_TOTAL}</span><span>閃光 <b>${shinyCount()}</b></span><span>傳說 <b>${legendCount()}</b>/${LEGEND_TOTAL}</span>
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
function openStats() { if (anyModal()) return; pause('stats'); renderStats(); $('mStats').classList.add('show'); }
function closeStats() { $('mStats').classList.remove('show'); resume('stats'); }
function renderStats() {
  const st = S.stats, g = k => st[k] || 0;
  $('stRight').textContent = CH ? `挑戰：${CH_NAME[CH]}` : '豐緣・彈珠機';
  const tiles = [
    ['用了幾顆彈珠', g('shots')], ['回收彈珠', g('bonusBalls')], ['入口命中', g('entrance'), pct(g('entrance'), g('shots'))],
    ['天空之柱入口', g('skyIn')], ['天空之柱開啟', g('skyOpen')], ['標靶打倒', g('targetHits')],
    ['翻板次數', g('flips')], ['翻板擊中', g('flipHits')], ['彈射器', g('slingHits')],
    ['轉輪轉動', g('wheelSpins')], ['轉輪 ★', g('wheelStars')], ['紅寶石爆炸', g('rubyBoom')], ['綠寶石分裂', g('splits')], ['閃光珠', g('shinyBalls')],
    ['外線道', g('pocketIn')], ['傳說收服', g('legend')], ['搖台', g('shakes')], ['TILT', g('tilts')],
    ['開箱次數', g('rounds')], ['禮物彈珠', g('giftBalls')], ['禮物寶可夢', g('giftPoke')], ['得到寶可夢', g('got')], ['閃光', g('shinyGot')], ['進化', g('evo')],
  ];
  const balls = st.balls || {}, fired = st.fired || {};
  const top = Object.entries(st.by || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $('stBody').innerHTML = `<div class="stgrid">${tiles.map(([k, v, e]) => `<div class="stile"><small>${k}</small><b>${v}</b>${e ? `<em>${e}</em>` : ''}</div>`).join('')}</div>
    <div class="stsec"><h4>發射的珠子</h4><div class="strow">${['steel', 'ruby', 'sapphire', 'emerald'].map(t => `<span class="chipb"><span class="gb ${t}"></span>${GEM_NAME[t]} <b>${fired[t] || 0}</b></span>`).join('')}</div></div>
    <div class="stsec"><h4>入口掉出的球</h4><div class="strow">${['poke', 'great', 'ultra', 'master'].map(b => `<span class="chipb"><span class="pb ${b}"></span>${BALL_NAME[b]} <b>${balls[b] || 0}</b></span>`).join('')}</div></div>
    <div class="stsec"><h4>最常抓到的寶可夢</h4>${top.length ? `<div class="sttop">${top.map(([id, n], i) => `<div><i>${i + 1}</i><img src="${imgSrc(+id)}" alt="">${P[id].zh}<br><b>×${n}</b></div>`).join('')}</div>` : '<div class="empty">開箱後就會開始統計</div>'}</div>`;
}
$('stClose').addEventListener('click', closeStats);
$('drStats').addEventListener('click', () => { closeDrawer(); openStats(); });
$('sideStats').addEventListener('click', () => { AU.init(); openStats(); });
$('sideCh').addEventListener('click', () => { AU.init(); openDrawer(); });

/* ============ 禮物（挑戰中不能用） ============ */
const RARE_POOL = POOL.filter(p => p.tier === 'rare'), SRARE_POOL = POOL.filter(p => p.tier === 'srare');
$('giftBalls').addEventListener('click', () => {
  if (CH) return;
  closeDrawer();
  S.game.balls += 100; S.game.ended = false; stat('giftBalls', 100);
  sfx.reward(); burst(518, H - 60, '#ffd166', 30); addFloat(470, H - 90, '+100 彈珠');
  toast('🎁 收到 100 顆彈珠！'); refreshUI(); save();
});
$('giftPoke').addEventListener('click', () => {
  if (CH) return;
  closeDrawer();
  const pool = Math.random() < 0.25 ? SRARE_POOL : RARE_POOL;   // 稀有 75%、超稀有 25%
  stat('giftPoke');
  openRound([{ ball: 'ultra', fixed: pool[Math.floor(Math.random() * pool.length)].id }]);
});

/* ============ 挑戰 ============ */
function renderRecords() {
  const r = loadRec();
  document.querySelectorAll('[data-rec="500"]').forEach(e => { e.textContent = r.b500 ? `最佳：${r.b500.score} 種・閃光 ${r.b500.shiny}（${r.b500.date}）` : '還沒有紀錄'; });
}
document.querySelectorAll('.chbtn').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.ch;
  if (!confirm(`開始挑戰「${CH_NAME[k]}」？\n會用全新的圖鑑從零計算，原本的圖鑑不受影響；挑戰中抓到的也會點亮原本的圖鑑。`)) return;
  save();
  try { localStorage.removeItem('hoennPachinko.ch.' + k); } catch (e) {}
  location.href = selfURL('challenge=' + k);
}));
if (CH) $('drNew').textContent = '🔄 重新挑戰';

/* ============ 測試工具 ============ */
$('dbBalls').addEventListener('click', () => { S.game.balls += 100; S.game.ended = false; refreshUI(); toast('測試：+100 彈珠'); });
$('dbBox').addEventListener('click', () => { for (let i = 0; i < 10; i++) S.box.push({ ball: rollBallType() }); refreshUI(); toast('測試：收集倉 +10'); });
$('dbSpeed').addEventListener('click', e => { speed = speed % 3 + 1; e.target.textContent = `速度 ×${speed}`; e.target.classList.toggle('on', speed > 1); });
$('dbAuto').addEventListener('click', e => { autoTest = !autoTest; e.target.textContent = `自動發射：${autoTest ? '開' : '關'}`; e.target.classList.toggle('on', autoTest); });
$('dbLegend').addEventListener('click', () => { S.charge = S.charge.map(c => Math.min(99, c + 50)); toast('測試：兩側傳說充能 +50%'); });
$('dbSky').addEventListener('click', () => { closeDrawer(); if (sky.t <= 0) { targets.forEach(t => { t.up = false; }); openSky(); } });
$('dbWx').addEventListener('click', () => { setWx(WX_SEQ[(WX_SEQ.indexOf(wx.mode) + 1) % WX_SEQ.length]); });
$('dbReset').addEventListener('click', () => {
  if (!confirm('確定要清除所有存檔嗎？（這台的圖鑑也會清空）')) return;
  const keep = { music: S.music, sfx: S.sfx };
  S = Object.assign(fresh(), keep); balls = []; gemPlan.group = -1; save(); refreshUI(); renderRecent(); toast('存檔已清除，重新開始！');
});
window.__pachinko = () => ({ S, paused: isPaused(), roundLeft, H, wx: { ...wx }, sky: sky.t, targets: targets.map(t => t.up), wheel: { ang: wheel.ang, w: wheel.w, spinning: wheel.spinning }, balls: balls.length, flippers: flippers.map(f => ({ ang: f.ang, pressed: f.pressed })), nextType: nextType(), gemPlan: { ...gemPlan } });
window.__balls = () => balls;
window.__sim = (sec, fireOn = true) => { const was = autoTest; autoTest = fireOn; for (let i = 0; i < sec * 60; i++) update(1 / 60); autoTest = was; return S.stats; };
window.__wx = m => setWx(m);
window.__sky = () => { targets.forEach(t => { t.up = false; }); openSky(); };
window.__wheel = w => { wheel.w = w; wheel.spinning = true; };
window.__wheelStop = idx => wheelStop(idx);
window.__explodeTest = () => { const a = __drop(270, 300, 'ruby'), c = __drop(320, 300, 'steel'); a.fuse = 0.01; update(1 / 60); return { steelVx: Math.round(c.vx), rubyDead: a.dead }; };
window.__gem = c => { gemPlan.group = Math.floor(S.game.shots / 6); gemPlan.slot = S.game.shots % 6; gemPlan.color = c; refreshUI(); };
window.__drop = (x = 270, y = 60, type = 'steel') => { const b = mkBall(x, y, 0, 0, type); balls.push(b); return b; };
window.__fire = (p = 0.5) => fire(p);
// 把珠放在翻板上方，揮一下翻板，回傳珠被打出的最大向上速度
window.__flipTest = (side = 0, type = 'steel') => {
  const f = flippers[side], a = F_REST, r = 60;
  const px = f.px + (side ? -Math.cos(a) : Math.cos(a)) * r, py = f.py + Math.sin(a) * r;
  const nx = (side ? -1 : 1) * Math.sin(a), ny = -Math.cos(a);
  const b = mkBall(px + nx * 15, py + ny * 15, 0, 0, type); balls.push(b);
  for (let i = 0; i < 6; i++) update(1 / 60);     // 先讓珠落在翻板上
  forceHold[side] = true;
  let minVy = 0;
  for (let i = 0; i < 12; i++) { update(1 / 60); minVy = Math.min(minVy, b.vy); }
  forceHold[side] = false;
  for (let i = 0; i < 10; i++) update(1 / 60);
  return { minVy: Math.round(minVy), x: Math.round(b.x), y: Math.round(b.y), dead: b.dead, type: b.type };
};

/* ============ 主迴圈 ============ */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (!isPaused()) for (let i = 0; i < speed; i++) update(dt);
  render(); updateTimerUI();
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { releaseAll(); save(); AU.suspend(); } else AU.resume();
  last = performance.now();
});
window.addEventListener('blur', releaseAll);
window.addEventListener('beforeunload', save);
new ResizeObserver(fit).observe(wrapEl);
window.addEventListener('resize', () => { fit(); if ($('mDex').classList.contains('show')) renderDex(); });
fit(); setWx('sun', true); syncSwitches(); refreshUI(); renderRecent(); renderRecords();
if (CH && !S.game.shots && !S.game.ended) setTimeout(() => toast(`挑戰開始：${CH_NAME[CH]}（共 500 顆）`), 400);
if (S.game.ended) showSummary();
requestAnimationFrame(frame);
})();
