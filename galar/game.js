'use strict';
/* 伽勒爾落珠板（Plinko）：珠從頂端放下，經過交錯的釘子，落進底下 11 格之一就抓到格子上的寶可夢。 */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pad3 = Collect.pad3;

const C = Collect.create({ key: 'galarPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
const P = C.P;
const LEGENDS = [888, 889, 890];          // 傳說格輪流：蒼響／藏瑪然特／無極汰那
const RARE_LEGEND = 772;                  // 屬性：空（傳說格偶爾混進來）
const DEX_TOTAL = POKEDEX.length;
const LEGEND_TOTAL = POKEDEX.filter(p => p.tier === 'legend').length;

const CFG_KEY = 'galarPachinko.cfg';
const cfg = { music: true, sfx: true, auto: true };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); } catch (e) {}
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} };
const run = { drops: 0, caught: 0, miss: 0, newdex: 0, dmax: 0, legendRuns: 0, evos: 0, rounds: 1 };

/* ============ 幾何 ============ */
const W = 440, M = 11, NS = 11, SW = (W - 2 * M) / NS;   // 每格 38
const BR = 6, DR = 18, PR = 4, KR = 9;                    // 珠／極巨珠／釘／彈板半徑
let REST = 0.3, KICKV = 24, HDAMP = 0.97, FRIC = 0.6, GRAV = 900, DRAGX = 3, VXMAX = 200, MINDX = 60;
const MAXV = 950, DROP_Y = 72, MAX_BALLS = 40, DROP_EVERY = 0.75, AUTO_EVERY = 1.1;
const CENTER = 5;
const ROUND = 10;          // 一回 10 顆，丟完才結算
const MISS_N = 5;          // 每回隨機 5 格落空（中央永遠有獎）
let H = 800, pegTop = 116, pegBot = 600, slotTop = 650, ROWS = 11, rowH = 50;
let pegs = [], kickers = [], grid = [], GC = 0, GR = 0;
const CELL = 32;

function layout(h) {
  H = h; pegTop = 118; slotTop = H - 148; pegBot = slotTop - 24;
  ROWS = clamp(Math.round((pegBot - pegTop) / 50) + 1, 10, 12);
  rowH = (pegBot - pegTop) / (ROWS - 1);
  pegs = []; kickers = [];
  for (let r = 0; r < ROWS; r++) {
    const y = pegTop + r * rowH;
    if ((ROWS - 1 - r) % 2 === 0) {           // 對齊格子分隔線的那一排；牆邊換成彈板
      for (let k = 1; k < NS; k++) pegs.push({ x: M + SW * k, y, row: r, f: 0 });
      kickers.push({ x: M, y, side: 1, f: 0 }, { x: W - M, y, side: -1, f: 0 });
    } else {
      for (let k = 0; k < NS; k++) pegs.push({ x: M + SW * (k + 0.5), y, row: r, f: 0 });
    }
  }
  // 干擾寶可夢站的位置：左上、右上、中下（擋在中央路線上）
  const span = pegBot - pegTop;
  HZ_SPOT = [{ x: W * 0.27, y: pegTop + span * 0.28 }, { x: W * 0.73, y: pegTop + span * 0.28 }, { x: W * 0.5, y: pegTop + span * 0.64 }];
  pegs = pegs.filter(p => HZ_SPOT.every(z => Math.hypot(p.x - z.x, p.y - z.y) > 28));
  hz.forEach(z => { const sp = HZ_SPOT[z.spot]; z.x = sp.x; z.y = sp.y; });
  GC = Math.ceil(W / CELL); GR = Math.ceil(H / CELL);
  grid = Array.from({ length: GC * GR }, () => []);
  const pad = PR + DR + 2;
  for (const p of pegs) {
    for (let gx = Math.floor((p.x - pad) / CELL); gx <= Math.floor((p.x + pad) / CELL); gx++)
      for (let gy = Math.floor((p.y - pad) / CELL); gy <= Math.floor((p.y + pad) / CELL); gy++)
        if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) grid[gx + gy * GC].push(p);
  }
}

/* ============ 格子 ============ */
// 有獎的格子只顯示球種，抓到誰要等 10 顆丟完的結算才揭曉
const slots = Array.from({ length: NS }, (_, i) => ({ i, miss: false, ball: 'poke', boost: 0, flip: 0, lit: 0, litC: '#fff', dm: 0 }));
const BALL_ZH = { poke: '精靈球', great: '超級球', ultra: '高級球', master: '傳說' };
const DIST_BOOST = [2, 1, 0.5, 0, 0, 0];
function dealSlots() {
  // 左右各 2～3 格落空，合計 MISS_N 格
  const left = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5), right = [6, 7, 8, 9, 10].sort(() => Math.random() - 0.5);
  const nl = Math.random() < 0.5 ? 2 : 3, miss = new Set([...left.slice(0, nl), ...right.slice(0, MISS_N - nl)]);
  slots.forEach(s => {
    const d = Math.abs(s.i - CENTER);
    s.miss = miss.has(s.i); s.ball = d === 0 ? 'ultra' : d <= 2 ? 'great' : 'poke'; s.boost = DIST_BOOST[d]; s.flip = 1;
  });
}
function pickPrize(i, rareOnly) { return C.pick({ boost: slots[i].boost, filter: rareOnly ? p => p.tier !== 'common' : undefined }); }
dealSlots();

/* ============ 干擾寶可夢：停幾秒才出一次招，招式會把珠打飛 ============ */
const HZ_TYPES = {
  leaf: { id: 1, move: '飛葉快刀', color: '#4ade80', act: 2.6 },      // 妙蛙種子：一圈葉子繞著轉
  shock: { id: 810, move: '吵鬧', color: '#bef264', act: 1.9 },       // 敲音猴：一波波音波往外擴
  fire: { id: 813, move: '火花', color: '#fb923c', act: 2.0 },        // 炎兔兒：左右噴火球
  water: { id: 816, move: '水槍', color: '#38bdf8', act: 2.2 },       // 淚眼蜥：往上噴水把珠頂回去
};
const ZR = 15, LEAF_R = 40;
let HZ_SPOT = [], hz = [], shots = [], hzSerial = 0;
function dealHazards() {
  const others = ['shock', 'fire', 'water'].sort(() => Math.random() - 0.5).slice(0, 2);
  const kinds = ['leaf', ...others].sort(() => Math.random() - 0.5);
  hz = kinds.map((type, k) => ({ type, ...HZ_TYPES[type], k: 'z' + k, spot: k, x: HZ_SPOT[k].x, y: HZ_SPOT[k].y,
    state: 'idle', t: rand(1.2, 3.5), ang: Math.random() * 6, waves: [], emit: 0, f: 0, side: 1 }));
  shots = [];
  hz.forEach(z => img(C.img(z.id)));
}
function updateHazards(dt) {
  for (const z of hz) {
    z.f = Math.max(0, z.f - dt * 3);
    z.t -= dt;
    if (z.state === 'idle' && z.t <= 0) { z.state = 'wind'; z.t = 0.7; }
    else if (z.state === 'wind' && z.t <= 0) {
      z.state = 'act'; z.t = z.act; z.emit = 0;
      if (!SIM) { addFloat(z.x, z.y - 32, z.move + '！', z.color); sfx.hzGo(z.type); }
    } else if (z.state === 'act') {
      z.ang += dt * 4.5; z.emit -= dt;
      if (z.type === 'shock' && z.emit <= 0) { z.waves.push({ r: ZR }); z.emit = 0.6; }
      if (z.type === 'fire' && z.emit <= 0) { z.side = -z.side; shots.push({ id: 's' + (++hzSerial), kind: 'fire', x: z.x + z.side * 18, y: z.y, vx: z.side * 230, vy: 0, r: 6, life: 2 }); z.emit = 0.3; }
      if (z.type === 'water' && z.emit <= 0) { const a = -Math.PI / 2 + rand(-0.85, 0.85); shots.push({ id: 's' + (++hzSerial), kind: 'water', x: z.x, y: z.y - 14, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 7, life: 1.6 }); z.emit = 0.22; }
      if (z.t <= 0) { z.state = 'idle'; z.t = rand(2, 4.5); }
    }
    for (const w of z.waves) w.r += dt * 170;
    z.waves = z.waves.filter(w => w.r < 118);
  }
  for (const sh of shots) { sh.life -= dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt; if (sh.kind === 'water') sh.vy += 260 * dt; }
  shots = shots.filter(sh => sh.life > 0 && sh.x > M && sh.x < W - M && sh.y > 0 && sh.y < slotTop);
}
function hzFx(b, color) {
  if (SIM) { SIM.hz++; return; }
  burst(b.x, b.y, color, 7); sfx.clack();
}
function hazardHit(b) {
  for (const z of hz) {
    const dx = b.x - z.x, dy = b.y - z.y;
    if (dx > 130 || dx < -130 || dy > 130 || dy < -130) continue;
    // 身體本身是一塊擋板
    if (hitCircle(b, z.x, z.y, ZR, 0.5)) { if (Math.abs(b.vx) < 50) b.vx = (dx >= 0 ? 1 : -1) * rand(70, 120); z.f = 1; }
    if (z.state !== 'act' || b.age - (b.hz[z.k] || -9) < 0.3) continue;
    let hit = false;
    if (z.type === 'leaf') {
      for (let j = 0; j < 6 && !hit; j++) {
        const a = z.ang + j * Math.PI / 3, lx = z.x + Math.cos(a) * LEAF_R, ly = z.y + Math.sin(a) * LEAF_R;
        hit = (b.x - lx) ** 2 + (b.y - ly) ** 2 < (8 + b.r) ** 2;
      }
    } else if (z.type === 'shock') {
      const d = Math.hypot(dx, dy); hit = z.waves.some(w => Math.abs(d - w.r) < 6 + b.r);
    }
    if (hit) {
      const d = Math.hypot(dx, dy) || 1;
      b.hz[z.k] = b.age; b.vx = dx / d * 260; b.vy = dy / d * 130 - 150;
      hzFx(b, z.color);
    }
  }
  for (const sh of shots) {
    if ((b.x - sh.x) ** 2 + (b.y - sh.y) ** 2 > (sh.r + b.r) ** 2 || b.age - (b.hz[sh.id] || -9) < 0.3) continue;
    b.hz[sh.id] = b.age;
    if (sh.kind === 'fire') { b.vx = Math.sign(sh.vx) * 220; b.vy = Math.min(b.vy, -80); }
    else { b.vy = -230; b.vx *= 0.4; sh.life = 0; }
    hzFx(b, sh.kind === 'fire' ? '#fb923c' : '#38bdf8');
  }
}

let legend = null;          // { t, list, k, rot, seen:Set }
let streak = 0;

/* ============ 圖片快取 ============ */
const IMG = {};
function img(src) { let m = IMG[src]; if (!m) { m = IMG[src] = new Image(); m.decoding = 'async'; m.src = src; } return m; }
const ready = m => m.complete && m.naturalWidth > 0;

/* ============ 音樂與音效（WebAudio 即時合成，原創曲） ============ */
const AU = (() => {
  let ac = null, master, bgm, heavy, bright, sfx, noiseBuf, nextT = 0, step = 0, lastTick = 0, E = 60 / 136 / 2;
  const BGM_VOL = 0.45;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = cfg.music ? BGM_VOL : 0; bgm.connect(master);
    heavy = ac.createGain(); heavy.gain.value = 0; heavy.connect(bgm);
    bright = ac.createGain(); bright.gain.value = 0; bright.connect(bgm);
    sfx = ac.createGain(); sfx.gain.value = cfg.sfx ? 1 : 0; sfx.connect(master);
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
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000, attack = 0) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f;
    if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // 球場進行曲：D–Bm–G–A ／ D–F#m–G–A，8 小節循環
  const LEAD = [
    [74, 0, 74, 76, 78, 0, 74, 0], [71, 0, 74, 0, 78, 76, 74, 0], [79, 0, 78, 76, 74, 0, 71, 74], [76, 0, 0, 73, 76, 78, 79, 0],
    [81, 0, 78, 0, 74, 0, 78, 81], [78, 0, 73, 0, 69, 73, 76, 78], [79, 81, 79, 78, 76, 74, 76, 79], [78, 0, 76, 0, 73, 0, 0, 0],
  ];
  const ROOT = [50, 47, 43, 45, 50, 42, 43, 45];
  const CH = { 50: [62, 66, 69], 47: [59, 62, 66], 43: [55, 59, 62], 45: [57, 61, 64], 42: [54, 57, 61] };
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, n = LEAD[bar][i], r = ROOT[bar];
    if (n) { osc(bgm, 'sawtooth', hz(n), t, E * 0.85, 0.012); osc(bgm, 'square', hz(n), t, E * 0.9, 0.016); osc(bgm, 'triangle', hz(n - 12), t, E * 1.2, 0.02); }
    osc(bgm, 'triangle', hz(i % 2 ? r + 12 : r), t, E * 0.85, 0.08);
    if (i % 2 === 1) CH[r].forEach(m => osc(bgm, 'square', hz(m), t, E * 0.3, 0.006));
    if (i === 0 || i === 4) osc(bgm, 'sine', 140, t, 0.16, 0.22, 45);
    if (i === 2 || i === 6) { noise(bgm, t, 0.14, 0.1, 'bandpass', 1900); osc(bgm, 'triangle', 220, t, 0.06, 0.04, 140); }
    if (bar === 7 && i >= 4) noise(bgm, t + E / 2, 0.08, 0.06, 'bandpass', 2200);
    noise(bgm, t, 0.03, 0.02, 'highpass', 7500);
    // 極巨化：低音鋸齒＋重鼓
    osc(heavy, 'sawtooth', hz(r - 12), t, E * 0.9, 0.05);
    if (i % 2 === 0) osc(heavy, 'sine', 95, t, 0.22, 0.3, 38);
    if (i === 3 || i === 7) noise(heavy, t, 0.2, 0.12, 'lowpass', 500);
    // 傳說格：明亮琶音
    osc(bright, 'square', hz(CH[r][i % 3] + 24), t, E * 0.5, 0.014);
    if (i % 4 === 0) osc(bright, 'triangle', hz(CH[r][2] + 12), t, E * 3, 0.03);
  }
  function layer(g, on) { if (ac) g.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.25); }
  function duck(sec) {
    if (!ac || !cfg.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.25, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  function notes(list, type = 'square', vol = 0.05, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m), t, d * 0.95, vol); osc(sfx, 'triangle', hz(m - 12), t, d, vol * 0.8); } t += d; }
    return t - ac.currentTime;
  }
  const PENTA = [98, 95, 93, 90, 88, 86, 83, 81, 78, 76, 74, 71];
  const play = {
    tick(row) {
      if (!ac) return; const now = performance.now(); if (now - lastTick < 32) return; lastTick = now;
      osc(sfx, 'sine', hz(PENTA[clamp(row, 0, 11)]), ac.currentTime, 0.07, 0.022);
    },
    smash() { if (!ac) return; const now = performance.now(); if (now - lastTick < 50) return; lastTick = now; osc(sfx, 'square', 110 + Math.random() * 40, ac.currentTime, 0.08, 0.04, 60); },
    kick() { if (ac) osc(sfx, 'triangle', 320, ac.currentTime, 0.14, 0.08, 760); },
    drop() { if (ac) osc(sfx, 'sine', 900, ac.currentTime, 0.07, 0.04, 520); },
    clack() { if (ac) noise(sfx, ac.currentTime, 0.04, 0.05, 'bandpass', 3000); },
    land(i, rank) {
      if (!ac) return; const t = ac.currentTime, m = 72 + (5 - Math.abs(i - CENTER)) * 2 + rank * 3;
      osc(sfx, 'square', hz(m), t, 0.09, 0.035); osc(sfx, 'square', hz(m + 7), t + 0.06, 0.12, 0.03);
    },
    rare() { duck(1.2); notes([[74, 0.08], [78, 0.08], [81, 0.08], [86, 0.3]], 'square', 0.04); crowd(1.4, 0.07); },
    srare() { duck(1.8); notes([[74, 0.09], [78, 0.09], [81, 0.09], [86, 0.18], [81, 0.09], [86, 0.45]], 'square', 0.045); crowd(2, 0.1); },
    shiny() { if (!ac) return; [86, 90, 93, 98, 102, 105].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + i * 0.05, 0.3, 0.04)); },
    fanfare() {
      duck(3.4);
      const d = notes([[69, 0.11], [74, 0.11], [78, 0.11], [81, 0.22], [78, 0.11], [81, 0.11], [86, 0.33], [0, 0.05], [85, 0.11], [86, 0.11], [88, 0.11], [90, 0.7]], 'square', 0.05);
      if (ac) [74, 78, 81, 86].forEach(m => osc(sfx, 'triangle', hz(m), ac.currentTime + d - 0.7, 1.3, 0.03));
      crowd(3, 0.14);
    },
    roar() {
      if (!ac) return; const t = ac.currentTime;
      osc(sfx, 'sawtooth', 75, t, 0.7, 0.07, 38); osc(sfx, 'square', 150, t, 0.5, 0.03, 60);
      noise(sfx, t, 0.8, 0.16, 'lowpass', 420, 0.08);
    },
    whistle() {
      if (!ac) return; const t = ac.currentTime;
      for (let k = 0; k < 3; k++) { osc(sfx, 'sine', 2900, t + k * 0.22, k === 2 ? 0.5 : 0.14, 0.06, 2750); osc(sfx, 'sine', 3050, t + k * 0.22, k === 2 ? 0.5 : 0.14, 0.03); }
    },
    evo() { notes([[74, 0.07], [78, 0.07], [81, 0.07], [86, 0.07], [90, 0.07], [93, 0.3]], 'triangle', 0.06); },
    flip() { if (ac) osc(sfx, 'square', 1300, ac.currentTime, 0.03, 0.012, 1900); },
    miss() { if (ac) { osc(sfx, 'triangle', 330, ac.currentTime, 0.22, 0.05, 140); } },
    hit() { if (ac) { const t = ac.currentTime; osc(sfx, 'square', hz(84), t, 0.06, 0.03); osc(sfx, 'square', hz(91), t + 0.06, 0.1, 0.03); } },
    hzGo(type) {
      if (!ac) return; const t = ac.currentTime;
      noise(sfx, t, 0.35, 0.05, 'bandpass', type === 'fire' ? 1100 : type === 'water' ? 1800 : 3200, 0.05);
      osc(sfx, 'triangle', type === 'shock' ? 160 : 520, t, 0.25, 0.04, type === 'shock' ? 90 : 900);
    },
  };
  function crowd(dur, vol) {
    if (!ac) return; const t = ac.currentTime;
    noise(sfx, t, dur, vol, 'bandpass', 900, dur * 0.25); noise(sfx, t, dur * 0.8, vol * 0.6, 'bandpass', 2400, dur * 0.2);
  }
  return {
    init, play, crowd,
    setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } },
    setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); },
    heavy: on => layer(heavy, on), bright: on => layer(bright, on),
    tempo(bpm) { E = 60 / bpm / 2; },
    suspend: () => ac && ac.suspend(), resume: () => ac && !document.hidden && ac.resume(),
  };
})();
const sfx = AU.play;

/* ============ 畫布 ============ */
const cv = $('cv'), ctx = cv.getContext('2d');
const frameEl = $('boardFrame'), wrapEl = $('boardWrap');
let scale = 1, K = 1, BG = null;

function fit() {
  const cw = wrapEl.clientWidth, ch = wrapEl.clientHeight;
  if (!cw || !ch) { if (!pegs.length) layout(800); return; }
  let s = cw / W, h = ch / s;
  if (h < 700) { h = 700; s = ch / 700; }
  if (h > 1000) h = 1000;
  s = Math.min(s, ch / h);
  layout(Math.round(h));
  scale = s;
  frameEl.style.width = W * s + 'px'; frameEl.style.height = H * s + 'px';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  K = s * dpr;
  cv.width = Math.round(W * K); cv.height = Math.round(H * K);
  buildBG();
}

const NUMF = '"Teko","Noto Sans TC",sans-serif', HEADF = '"Russo One","Noto Sans TC",sans-serif', ZHF = '"Noto Sans TC",sans-serif';
function buildBG() {
  BG = document.createElement('canvas'); BG.width = cv.width; BG.height = cv.height;
  const g = BG.getContext('2d'); g.setTransform(K, 0, 0, K, 0, 0);
  // 夜空
  let gr = g.createLinearGradient(0, 0, 0, pegTop);
  gr.addColorStop(0, '#060820'); gr.addColorStop(1, '#141c52');
  g.fillStyle = gr; g.fillRect(0, 0, W, pegTop);
  // 看台（三層斜坡）＋觀眾點點：左半紅、右半藍
  for (let t = 0; t < 3; t++) {
    const y0 = 26 + t * 22;
    g.fillStyle = ['#0d1236', '#111845', '#151d55'][t];
    g.fillRect(0, y0, W, 22);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, y0, W, 1);
  }
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 30; y < 92; y += 4.4) for (let x = 2; x < W; x += 4.6) {
    const r = rnd(); if (r < 0.18) continue;
    const left = x < W / 2;
    const c = r < 0.45 ? (left ? '#e8173a' : '#1e6bff') : r < 0.62 ? '#f4f6ff' : r < 0.8 ? (left ? '#ff6b85' : '#5fa8ff') : '#2a2f5c';
    g.fillStyle = c; g.globalAlpha = 0.35 + rnd() * 0.45;
    g.fillRect(x + rnd() * 1.5, y + rnd() * 1.5, 2.2, 2.4);
  }
  g.globalAlpha = 1;
  // 屋頂與燈架
  g.fillStyle = '#05061a'; g.fillRect(0, 0, W, 22);
  for (const lx of [64, W - 64]) {
    g.fillStyle = '#1a1f44'; g.fillRect(lx - 34, 3, 68, 18);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
      const x = lx - 30 + c * 10.6, y = 5 + r * 8;
      const rg = g.createRadialGradient(x + 3.5, y + 3, 0, x + 3.5, y + 3, 9);
      rg.addColorStop(0, 'rgba(255,255,240,.6)'); rg.addColorStop(1, 'rgba(255,255,240,0)');
      g.fillStyle = rg; g.fillRect(x - 6, y - 6, 19, 18);
      g.fillStyle = '#fffbe8'; g.fillRect(x, y, 7, 6);
    }
  }
  // 草皮：條紋對齊每一格
  const pt = pegTop - 14;
  for (let k = 0; k < NS; k++) {
    g.fillStyle = k % 2 ? '#1c7034' : '#22823e';
    g.fillRect(M + k * SW, pt, SW + 0.5, slotTop - pt);
  }
  gr = g.createLinearGradient(0, pt, 0, slotTop);
  gr.addColorStop(0, 'rgba(0,0,0,.35)'); gr.addColorStop(0.25, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = gr; g.fillRect(M, pt, W - 2 * M, slotTop - pt);
  // 球場白線
  const midY = (pt + slotTop) / 2;
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2;
  g.strokeRect(M + 5, pt + 6, W - 2 * M - 10, slotTop - pt - 6);
  g.beginPath(); g.moveTo(M + 5, midY); g.lineTo(W - M - 5, midY); g.stroke();
  g.beginPath(); g.arc(W / 2, midY, 48, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(W / 2, midY, 3, 0, Math.PI * 2); g.fill();
  g.strokeRect(W / 2 - 118, slotTop - 96, 236, 96);
  g.strokeRect(W / 2 - 56, slotTop - 38, 112, 38);
  g.beginPath(); g.arc(W / 2, slotTop - 96, 40, Math.PI * 1.17, Math.PI * 1.83); g.stroke();
  g.strokeRect(W / 2 - 118, pt + 6, 236, 70);
  g.beginPath(); g.arc(W / 2, pt + 76, 40, Math.PI * 0.17, Math.PI * 0.83); g.stroke();
  // 兩側牆：劍紅、盾藍
  gr = g.createLinearGradient(0, 0, M, 0); gr.addColorStop(0, '#7a0a1f'); gr.addColorStop(1, '#e8173a');
  g.fillStyle = gr; g.fillRect(0, pt, M, H - pt);
  gr = g.createLinearGradient(W - M, 0, W, 0); gr.addColorStop(0, '#1e6bff'); gr.addColorStop(1, '#0a2a7a');
  g.fillStyle = gr; g.fillRect(W - M, pt, M, H - pt);
  // 旗幟串
  for (let k = 0; k < 2; k++) {
    const y0 = 96 + k * 0, sag = 8;
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y0); g.quadraticCurveTo(W / 2, y0 + sag * 2, W, y0); g.stroke();
    const n = 30;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = t * W, y = y0 + sag * 4 * t * (1 - t);
      g.fillStyle = ['#e8173a', '#f4f6ff', '#1e6bff'][i % 3];
      g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.lineTo(x, y + 10); g.closePath(); g.fill();
    }
  }
  // 計分槽底板
  gr = g.createLinearGradient(0, slotTop, 0, H); gr.addColorStop(0, '#0c1238'); gr.addColorStop(1, '#05071c');
  g.fillStyle = gr; g.fillRect(M, slotTop, W - 2 * M, H - slotTop);
  g.fillStyle = 'rgba(255,255,255,.035)';
  for (let y = slotTop + 2; y < H; y += 4) for (let x = M + 2; x < W - M; x += 4) g.fillRect(x, y, 1.4, 1.4);
}

/* ============ 狀態 ============ */
let balls = [], parts = [], floats = [], flashes = [], confetti = [];
let time = 0, dropCount = 0, aimX = W / 2, carX = W / 2, holding = false, holdT = 0, autoT = 0;
let forceDmax = false, forceShiny = false, SIM = null, lastDmaxBanner = -99;
let ballSerial = 0;
const pauses = new Set();
let round = { n: 1, left: ROUND, hits: [], miss: 0, endT: -1 };

/* ============ 物理 ============ */
function hitCircle(b, cx, cy, r, e, fr = 1) {
  let nx = b.x - cx, ny = b.y - cy;
  const d = Math.hypot(nx, ny), m = r + b.r;
  if (d >= m || d === 0) return false;
  nx /= d; ny /= d; b.x = cx + nx * m; b.y = cy + ny * m;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const tx = -ny, ty = nx, vt = (b.vx * tx + b.vy * ty) * fr, vn2 = -e * vn;
    b.vx = nx * vn2 + tx * vt; b.vy = ny * vn2 + ty * vt;
  }
  b.nx = nx; b.ny = ny;
  return true;
}
function stepBall(b, h) {
  b.vy += GRAV * h;
  if (!b.dmax) { b.vx *= 1 - DRAGX * h; if (b.vx > VXMAX) b.vx = VXMAX; else if (b.vx < -VXMAX) b.vx = -VXMAX; }
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAXV) { b.vx *= MAXV / sp; b.vy *= MAXV / sp; }
  b.x += b.vx * h; b.y += b.vy * h;
  b.rot += b.vx * h / b.r;

  // 牆
  if (b.x < M + b.r) { b.x = M + b.r; if (b.vx < 0) b.vx = -b.vx * 0.5; }
  if (b.x > W - M - b.r) { b.x = W - M - b.r; if (b.vx > 0) b.vx = -b.vx * 0.5; }
  if (b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy = 0; }

  // 釘子
  const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
  if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) {
    for (const p of grid[gx + gy * GC]) {
      if (b.dmax) {
        // 極巨珠：釘子擋不住，只會被推偏一點（像把釘子撞彎）
        const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), m = PR + b.r;
        if (d < m && d > 0) {
          // 只推左右、不托住它，所以一定掉得下去
          const o = Math.min(m - d, 8), nx = dx / d;
          b.vx += nx * o * 2600 * h;
          b.vx *= 0.995; b.vy *= 0.9985;
          if (p.f < 0.5) { p.f = 1; p.wob = 1; if (!SIM) sfx.smash(); }
        }
      } else if (hitCircle(b, p.x, p.y, PR, REST, FRIC)) {
        b.vx += (Math.random() - 0.5) * KICKV; b.vx *= HDAMP;
        // 一定往左或往右偏，不會停在釘子頂上
        if (Math.abs(b.vx) < MINDX) b.vx = (b.x - p.x > 0.5 ? 1 : b.x - p.x < -0.5 ? -1 : Math.random() < 0.5 ? -1 : 1) * rand(MINDX, MINDX * 1.5);
        p.f = 1; if (!SIM) sfx.tick(p.row);
      }
    }
  }
  // 干擾寶可夢（極巨珠太大，招式打不動它）
  if (!b.dmax) hazardHit(b);
  // 兩側彈板：往中間彈回去（極巨珠太大，直接擦過）
  if (!b.dmax && (b.x < M + KR + b.r + 1 || b.x > W - M - KR - b.r - 1)) {
    for (const k of kickers) {
      if (Math.abs(b.y - k.y) > KR + b.r) continue;
      if (hitCircle(b, k.x, k.y, KR, 0.3) && b.age - (b.kickAt || -9) > 0.15) {
        b.kickAt = b.age;
        b.vx = k.side * rand(150, 240);
        b.vy = Math.min(b.vy * 0.5, 120);
        k.f = 1; if (!SIM) sfx.kick(); else SIM.kicks++;
      }
    }
  }
  // 格子分隔線（極巨珠太大，直接落袋）
  if (!b.dmax && b.y > slotTop - b.r - 3) {
    const k = Math.round((b.x - M) / SW);
    if (k >= 1 && k < NS) {
      const x = M + SW * k;
      if (b.y < slotTop) hitCircle(b, x, slotTop, 2.5, 0.3);
      else if (Math.abs(b.x - x) < b.r + 1.5) {
        b.x = x + Math.sign(b.x - x || 1) * (b.r + 1.5);
        b.vx = -b.vx * 0.3;
      }
    }
  }
  if (b.y > slotTop + (b.dmax ? -2 : 26)) { b.dead = true; land(b); }
}
function collideBalls() {
  const n = balls.length;
  for (let i = 0; i < n; i++) {
    const a = balls[i]; if (a.dead) continue;
    for (let j = i + 1; j < n; j++) {
      const b = balls[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r;
      if (dx > m || dx < -m || dy > m || dy < -m) continue;
      const d = Math.hypot(dx, dy);
      if (d >= m || d === 0) continue;
      const nx = dx / d, ny = dy / d, o = m - d;
      const ma = a.r * a.r, mb = b.r * b.r, ia = 1 / ma, ib = 1 / mb, sum = ia + ib;
      a.x -= nx * o * ia / sum; a.y -= ny * o * ia / sum;
      b.x += nx * o * ib / sum; b.y += ny * o * ib / sum;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const jj = -(1.3) * vn / sum;
        a.vx -= jj * ia * nx; a.vy -= jj * ia * ny;
        b.vx += jj * ib * nx; b.vy += jj * ib * ny;
      }
      // 極巨珠把小珠撞飛
      if (a.dmax !== b.dmax) {
        const small = a.dmax ? b : a, sg = a.dmax ? 1 : -1;
        if (time - (small.knock || -9) > 0.2) {
          small.knock = time;
          small.vx += nx * sg * 260; small.vy += ny * sg * 160 - 60;
          if (!SIM) { burst(small.x, small.y, '#ff4d6d', 6); sfx.clack(); } else SIM.knocks++;
        }
      }
    }
  }
}
function physics(dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
  for (let s = 0; s < n; s++) {
    for (const b of balls) if (!b.dead) stepBall(b, h);
    if (!(SIM && SIM.noBB)) collideBalls();
  }
  for (const b of balls) {
    if (b.dead) continue;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy)) {
      b.dead = true; if (SIM) SIM.nan++; else console.warn('NaN ball removed'); continue;
    }
    b.age += dt;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 30) b.still += dt; else b.still = Math.max(0, b.still - dt * 2);
    if (b.still > 0.5) {           // 卡住了：輕輕推一下
      b.vx += (Math.random() < 0.5 ? -1 : 1) * rand(90, 160); b.vy -= 50; b.still = 0; b.nudges++;
      if (SIM) SIM.nudges++;
    }
    if (b.age > 30) { b.dead = true; if (SIM) { SIM.stuck++; if (b.dmax) SIM.stuckD++; SIM.stuckAt.push([Math.round(b.x), Math.round(b.y)]); } else land(b); }
    if (SIM) SIM.maxAge = Math.max(SIM.maxAge, b.age);
  }
  balls = balls.filter(b => !b.dead);
}

/* ============ 放珠 ============ */
function drop(x) {
  if (balls.length >= MAX_BALLS) return false;
  if (!SIM) { if (round.left <= 0) return false; round.left--; }
  dropCount++; if (!SIM) run.drops++;
  const dmax = forceDmax || (dropCount % 10 === 0 && !(SIM && SIM.noDmax));
  const shiny = forceShiny || Math.random() < 1 / 100;
  forceDmax = false; forceShiny = false;
  const r = dmax ? DR : BR;
  balls.push({ id: ++ballSerial, x: clamp(x + rand(-1.5, 1.5), M + r + 1, W - M - r - 1), y: DROP_Y, vx: rand(-15, 15), vy: 40,
    r, dmax, shiny, age: 0, still: 0, nudges: 0, rot: 0, hue: Math.random() * 360, hz: {} });
  if (SIM) { if (dmax) SIM.dmaxDrops++; return true; }
  if (dmax) {
    run.dmax++; sfx.roar(); addFloat(carX, DROP_Y - 40, '極巨珠！', '#ff4d6d');
    if (time - lastDmaxBanner > 25) { lastDmaxBanner = time; banner('極巨化！', '最後一顆！招式打不動它，中了保證稀有以上', 'rgba(232,23,58,.92)'); }
  } else sfx.drop();
  if (shiny) toast('✨ 閃光珠落下了！');
  refreshUI();
  return true;
}

/* ============ 落袋 ============ */
function land(b) {
  const i = clamp(Math.floor((b.x - M) / SW), 0, NS - 1);
  if (SIM) { SIM.landed++; SIM.bySlot[i]++; if (b.dmax) SIM.dmaxLanded++; streakHit(i); return; }
  catchAt(i, b);
}
function catchAt(i, b) {
  const s = slots[i], cx = M + SW * (i + 0.5);
  const isLegend = !!(legend && i === CENTER);
  // 中央連擊：落中央 +1；中央旁邊兩格不算斷；其他格子就歸零
  if (!legend) streakHit(i);
  if (s.miss && !isLegend) {
    run.miss++; round.miss++;
    s.lit = 1; s.litC = '#5b6290';
    addFloat(cx, slotTop - 8, '落空', '#9ea8d6'); sfx.miss();
    refreshUI(); return;
  }
  const id = isLegend ? legend.list[legend.k] : pickPrize(i, b.dmax);
  const shiny = !!b.shiny;
  const res = C.add(id, shiny), evos = C.evolve();
  run.caught++; if (res.isNew) run.newdex++; run.evos += evos.length;
  round.hits.push({ id, shiny, isNew: res.isNew, dmax: !!b.dmax, legend: isLegend, evos });
  // 只亮格子＋小提示框，是誰等結算再看
  s.lit = 1; s.litC = isLegend ? '#c084fc' : b.dmax ? '#ff4d6d' : s.ball === 'ultra' ? '#ffcc33' : s.ball === 'great' ? '#7cc4ff' : '#ffffff';
  if (b.dmax) s.dm = 1;
  burst(cx, slotTop + 10, s.litC, 14);
  hitTip(i, isLegend ? '⚡ 傳說格命中！' : b.dmax ? '極巨命中！' : '有中了！', s.litC);
  sfx.land(i, isLegend ? 3 : s.ball === 'ultra' ? 2 : s.ball === 'great' ? 1 : 0); sfx.hit();
  if (isLegend) { cameraFlashes(10); arenaFlash = 1; }
  refreshUI();
}
function hitTip(i, text, color) {
  const el = $('hit'); el.textContent = text; el.style.setProperty('--hc', color);
  el.style.left = clamp((M + SW * (i + 0.5)) / W * 100, 14, 86) + '%';
  el.style.top = ((slotTop - 30) / H * 100) + '%';
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
}

/* ============ 傳說格 ============ */
// 中央連擊：落中央 +1；落在金銀銅框（中間 5 格）不算斷；落到外側 6 格就歸零。滿 5 開傳說格
function streakHit(i) {
  if (i === CENTER) { streak++; if (streak >= 5) { if (SIM) { SIM.legends++; streak = 0; } else startLegend(); } }
  else if (Math.abs(i - CENTER) >= 3) streak = 0;
}
function startLegend() {
  streak = 0; run.legendRuns++;
  const list = LEGENDS.slice().sort(() => Math.random() - 0.5);
  if (Math.random() < 0.3) list.push(RARE_LEGEND);
  legend = { t: 10, list, k: 0, rot: 0, seen: new Set() };
  slots[CENTER].flip = 1; list.forEach(id => img(C.img(id)));
  sfx.whistle(); AU.crowd(3, 0.16); AU.bright(true); AU.tempo(150);
  banner('LEGEND ZONE', '傳說格開放 10 秒！瞄準中央', 'rgba(124,58,237,.92)');
  cameraFlashes(20);
  refreshUI();
}
function endLegend() {
  legend = null; AU.bright(false); AU.tempo(136);
  slots[CENTER].flip = 1;
  toast('傳說格關閉了，再連擊 5 次中央就會再開');
}

/* ============ 結算：10 顆丟完才揭曉抓到誰（直接顯示，不先黑影） ============ */
let sumTimer = 0;
const rankOf = h => (h.legend ? 4 : 0) + (h.shiny ? 3 : 0) + C.tierRank(h.id);
function showSummary() {
  round.endT = -2;
  pause('sum');
  const hits = round.hits;
  $('sumT').textContent = `第 ${round.n} 回 結果`;
  $('sumHit').innerHTML = `中了 <b>${hits.length}</b> / ${ROUND} 顆`;
  $('sumGrid').innerHTML = hits.length ? hits.map((h, k) => {
    const cls = h.legend ? 'legend' : P[h.id].tier;
    const tag = (h.legend ? '傳說' : C.tierName(h.id)) + (h.dmax ? '・極巨' : '');
    return `<div class="sc ${cls}${h.shiny ? ' shiny' : ''}" style="animation-delay:${k * 0.09}s">
      ${h.isNew ? '<span class="nw">NEW</span>' : ''}<img src="${C.img(h.id, h.shiny)}" alt="">
      <div class="no">#${pad3(C.no(h.id))}</div><div class="nm">${h.shiny ? '✨' : ''}${P[h.id].zh}</div><div class="tg">${tag}</div></div>`;
  }).join('') : '<div class="sumempty">這回合全部落空了…<br>再來 10 顆！</div>';
  const evos = hits.flatMap(h => h.evos);
  $('sumEvo').innerHTML = evos.map(e => `<div class="se"><img src="${C.img(e.from)}" alt=""><span class="ar">➜</span><img src="${C.img(e.to)}" alt=""><span>${P[e.from].zh} 進化成 <b>${P[e.to].zh}</b></span>${e.isNew ? '<span class="nw">NEW</span>' : ''}</div>`).join('');
  $('mSum').classList.add('show');
  const best = hits.reduce((m, h) => Math.max(m, rankOf(h)), -1);
  if (best >= 4) sfx.fanfare(); else if (best >= 3) sfx.shiny(); else if (best >= 2) sfx.srare(); else if (best >= 1) sfx.rare();
  if (evos.length) setTimeout(() => sfx.evo(), 700);
  renderRecent(); refreshUI();
  clearInterval(sumTimer);
  if (cfg.auto) {
    let n = 10; $('sumNote').textContent = `${n} 秒後自動開始下一回`;
    sumTimer = setInterval(() => {
      if ($('mDex').classList.contains('show')) return;
      n--; $('sumNote').textContent = `${n} 秒後自動開始下一回`;
      if (n <= 0) nextRound();
    }, 1000);
  } else $('sumNote').textContent = '';
}
function nextRound() {
  clearInterval(sumTimer); sumTimer = 0;
  $('mSum').classList.remove('show');
  round = { n: round.n + 1, left: ROUND, hits: [], miss: 0, endT: -1 };
  run.rounds = round.n;
  dealSlots(); dealHazards();
  holding = false; autoT = 0.8;
  resume('sum');
  sfx.whistle();
  toast(`第 ${round.n} 回：10 顆珠，落空格換位置了`);
  refreshUI();
}
$('sumNext').addEventListener('click', () => { AU.init(); nextRound(); });

/* ============ 特效 ============ */
let arenaFlash = 0, shakeT = 0;
function addFloat(x, y, text, color) { floats.push({ x, y, text, color, t: 0 }); }
function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(60, 260);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: rand(0.4, 0.8), t: 0, c: color, s: rand(1.5, 3.2), g: 500 });
  }
  if (parts.length > 500) parts.splice(0, parts.length - 500);
}
function confettiRain(n) {
  for (let i = 0; i < n; i++) confetti.push({ x: rand(M, W - M), y: rand(-60, 0), vx: rand(-30, 30), vy: rand(60, 160), r: Math.random() * 6, vr: rand(-8, 8), c: ['#e8173a', '#f4f6ff', '#1e6bff', '#ffcc33'][i % 4], t: 0, w: rand(3, 6), h: rand(5, 9) });
  if (confetti.length > 260) confetti.splice(0, confetti.length - 260);
}
function cameraFlashes(n) { for (let i = 0; i < n; i++) flashes.push({ x: rand(4, W - 4), y: rand(30, 92), t: -Math.random() * 0.6, d: rand(0.12, 0.25) }); }
function dmaxCloud(b) {
  for (let i = 0; i < 2; i++) {
    const a = Math.random() * Math.PI * 2, rr = b.r * rand(0.6, 1.3);
    parts.push({ x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr, vx: rand(-30, 30), vy: rand(-80, -20), life: rand(0.5, 1), t: 0,
      c: Math.random() < 0.6 ? '#ff2a4f' : '#ff7ad9', s: rand(5, 11), g: -40, cloud: true });
  }
}

/* ============ 主迴圈 ============ */
function update(dt) {
  time += dt;
  // 放珠
  carX += (aimX - carX) * Math.min(1, dt * 16);
  if (holding) { holdT -= dt; if (holdT <= 0) { if (drop(carX)) holdT = DROP_EVERY; else holdT = 0.05; } }
  else if (cfg.auto && round.left > 0) {
    autoT -= dt;
    if (autoT <= 0.35 && !update.aimed) { aimX = clamp(W / 2 + rand(-160, 160), M + BR, W - M - BR); update.aimed = true; }   // 先移過去再放
    if (autoT <= 0) { drop(carX); autoT = AUTO_EVERY; update.aimed = false; }
  }
  updateHazards(dt);
  physics(dt);
  // 10 顆都落袋了 → 結算
  if (round.left <= 0 && round.endT === -1 && !balls.length) round.endT = 1;
  if (round.endT > 0) { round.endT -= dt; if (round.endT <= 0) showSummary(); }
  // 格子
  for (const s of slots) {
    s.flip = Math.max(0, s.flip - dt * 2.5); s.lit = Math.max(0, s.lit - dt * 1.6); s.dm = Math.max(0, s.dm - dt * 0.8);
  }
  if (legend) {
    legend.t -= dt; legend.rot += dt;
    if (legend.rot > 0.9) { legend.rot = 0; legend.k = (legend.k + 1) % legend.list.length; slots[CENTER].flip = 1; }
    if (Math.random() < dt * 14) cameraFlashes(1);
    if (legend.t <= 0) endLegend();
  }
  for (const p of pegs) if (p.f > 0) p.f = Math.max(0, p.f - dt * 4);
  for (const k of kickers) if (k.f > 0) k.f = Math.max(0, k.f - dt * 3);
  // 粒子
  const dm = balls.some(b => b.dmax);
  if (dm !== update.dm) { update.dm = dm; AU.heavy(dm); }
  for (const b of balls) {
    if (b.dmax) dmaxCloud(b);
    if (b.shiny && Math.random() < 0.6) parts.push({ x: b.x + rand(-4, 4), y: b.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-20, 20), life: 0.6, t: 0, c: `hsl(${(time * 300 + b.hue) % 360},100%,70%)`, s: 2, g: 0 });
  }
  for (const p of parts) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  parts = parts.filter(p => p.t < p.life);
  for (const f of floats) f.t += dt;
  floats = floats.filter(f => f.t < 1.2);
  for (const f of flashes) f.t += dt;
  flashes = flashes.filter(f => f.t < f.d);
  for (const c of confetti) { c.t += dt; c.x += (c.vx + Math.sin(c.t * 4 + c.r) * 30) * dt; c.y += c.vy * dt; c.r += c.vr * dt; }
  confetti = confetti.filter(c => c.y < H + 10);
  arenaFlash = Math.max(0, arenaFlash - dt * 0.6);
}

/* ============ 繪圖 ============ */
function drawBall(b) {
  const r = b.r;
  if (b.dmax) {
    const g = ctx.createRadialGradient(b.x, b.y, r * 0.6, b.x, b.y, r * 2.6);
    g.addColorStop(0, 'rgba(255,42,79,.55)'); g.addColorStop(1, 'rgba(255,42,79,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  }
  if (b.shiny) {
    ctx.fillStyle = `hsla(${(time * 300 + b.hue) % 360},100%,65%,.45)`;
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fillStyle = b.dmax ? '#ff2a4f' : '#e8173a'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fillStyle = '#f6f7ff'; ctx.fill();
  ctx.fillStyle = '#10132b'; ctx.fillRect(-r, -r * 0.13, r * 2, r * 0.26);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(b.x - r * 0.35, b.y - r * 0.4, r * 0.25, 0, Math.PI * 2); ctx.fill();
}
function drawBallIcon(x, y, r, kind) {
  const top = { poke: '#e8173a', great: '#1e6bff', ultra: '#22232e', master: '#7c3aed' }[kind];
  ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.fillStyle = top; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.fillStyle = '#f6f7ff'; ctx.fill();
  if (kind === 'great') { ctx.fillStyle = '#e8173a'; ctx.fillRect(x - r * 0.78, y - r * 0.62, r * 0.42, r * 0.3); ctx.fillRect(x + r * 0.36, y - r * 0.62, r * 0.42, r * 0.3); }
  if (kind === 'ultra') { ctx.fillStyle = '#ffcc33'; ctx.fillRect(x - r * 0.62, y - r * 0.82, r * 0.24, r * 0.68); ctx.fillRect(x + r * 0.38, y - r * 0.82, r * 0.24, r * 0.68); ctx.fillRect(x - r * 0.62, y - r * 0.56, r * 1.24, r * 0.2); }
  if (kind === 'master') {
    ctx.fillStyle = '#ff7ad9'; ctx.beginPath(); ctx.arc(x - r * 0.55, y - r * 0.5, r * 0.22, 0, Math.PI * 2); ctx.arc(x + r * 0.55, y - r * 0.5, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `600 ${r * 0.9}px ${NUMF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('M', x, y - r * 0.48);
  }
  ctx.fillStyle = '#10132b'; ctx.fillRect(x - r, y - r * 0.12, r * 2, r * 0.24);
  ctx.beginPath(); ctx.arc(x, y, r * 0.36, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function vText(text, x, y, avail, color) {
  const fs = Math.min(12.5, avail / text.length);
  ctx.fillStyle = color; ctx.font = `700 ${fs}px ${ZHF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let c = 0; c < text.length; c++) ctx.fillText(text[c], x, y + c * fs * 1.04);
}
function drawSlot(s) {
  const i = s.i, x0 = M + i * SW, y0 = slotTop, w = SW, h = H - slotTop, cx = x0 + w / 2;
  const isLeg = legend && i === CENTER;
  const sx = Math.max(0.05, Math.abs(Math.cos(s.flip * Math.PI)));   // 換位置時翻牌
  ctx.save(); ctx.translate(cx, 0); ctx.scale(sx, 1); ctx.translate(-cx, 0);
  if (s.miss && !isLeg) {
    ctx.fillStyle = 'rgba(38,6,16,.8)'; ctx.fillRect(x0 + 1, y0, w - 2, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x0 + 1, y0, w - 2, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,77,109,.1)'; ctx.lineWidth = 4;
    for (let k = -h; k < w + h; k += 12) { ctx.beginPath(); ctx.moveTo(x0 + k, y0); ctx.lineTo(x0 + k - h, y0 + h); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,77,109,.45)'; ctx.lineWidth = 1.2; ctx.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 8, y0 + 22); ctx.lineTo(cx + 8, y0 + 38); ctx.moveTo(cx + 8, y0 + 22); ctx.lineTo(cx - 8, y0 + 38); ctx.stroke(); ctx.lineCap = 'butt';
    vText('落空', cx, y0 + 54, 30, '#ff8fa3');
  } else {
    const kind = isLeg ? 'master' : s.ball;
    const fc = isLeg ? `hsl(${(time * 200) % 360},90%,70%)` : s.dm > 0 ? '#ff2a4f' : kind === 'ultra' ? '#ffcc33' : kind === 'great' ? '#7cc4ff' : '#c9d2f5';
    if (isLeg || kind === 'ultra') {
      const g = ctx.createLinearGradient(0, y0, 0, H);
      if (isLeg) { g.addColorStop(0, '#5b21b6'); g.addColorStop(1, '#1e0b44'); } else { g.addColorStop(0, 'rgba(255,204,51,.28)'); g.addColorStop(1, 'rgba(255,204,51,.04)'); }
      ctx.fillStyle = g; ctx.fillRect(x0 + 1, y0, w - 2, h);
    }
    ctx.strokeStyle = fc; ctx.lineWidth = kind === 'poke' ? 1.2 : 2.2; ctx.strokeRect(x0 + 2, y0 + 2, w - 4, h - 4);
    drawBallIcon(cx, y0 + 30 + Math.sin(time * 3 + i) * 1.5, 11, kind);
    vText(BALL_ZH[kind], cx, y0 + 52, h - 62, isLeg ? '#fff' : '#e8ecff');
  }
  ctx.restore();
  if (s.lit > 0) { ctx.fillStyle = s.litC; ctx.globalAlpha = s.lit * 0.55; ctx.fillRect(x0 + 1, y0, w - 2, h); ctx.globalAlpha = 1; }
}
function drawHazards() {
  for (const z of hz) {
    if (z.state === 'act' && z.type === 'leaf') {
      ctx.strokeStyle = 'rgba(74,222,128,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(z.x, z.y, LEAF_R, 0, Math.PI * 2); ctx.stroke();
      for (let j = 0; j < 6; j++) {
        const a = z.ang + j * Math.PI / 3;
        ctx.save(); ctx.translate(z.x + Math.cos(a) * LEAF_R, z.y + Math.sin(a) * LEAF_R); ctx.rotate(a + time * 9);
        ctx.fillStyle = '#4ade80'; ctx.strokeStyle = '#14532d'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.restore();
      }
    }
    for (const wv of z.waves) {
      ctx.strokeStyle = `rgba(190,242,100,${(1 - wv.r / 118) * 0.85})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(z.x, z.y, wv.r, 0, Math.PI * 2); ctx.stroke();
    }
    // 底座：蓄力時發光，出招時抖
    const glow = z.state === 'wind' ? 0.5 + Math.sin(time * 30) * 0.5 : z.state === 'act' ? 0.6 : 0;
    if (glow > 0) {
      const g = ctx.createRadialGradient(z.x, z.y, 4, z.x, z.y, 34);
      g.addColorStop(0, z.color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = glow * 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(z.x, z.y, 34, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(6,10,34,.82)'; ctx.beginPath(); ctx.arc(z.x, z.y + 6, ZR + 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = z.color; ctx.lineWidth = 2 + z.f * 2; ctx.stroke();
    const m = img(C.img(z.id)), jx = z.state === 'act' ? rand(-1, 1) : 0;
    if (ready(m)) ctx.drawImage(m, z.x - 22 + jx, z.y - 28 + Math.sin(time * 2.4 + z.spot) * 1.5, 44, 44);
    if (z.state === 'wind') {
      ctx.fillStyle = z.color; ctx.font = `900 16px ${ZHF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText('！', z.x + 18, z.y - 26); ctx.fillText('！', z.x + 18, z.y - 26);
    }
  }
  for (const sh of shots) {
    if (sh.kind === 'fire') {
      const g = ctx.createRadialGradient(sh.x, sh.y, 1, sh.x, sh.y, sh.r * 2.2);
      g.addColorStop(0, '#fff7c2'); g.addColorStop(0.35, '#fb923c'); g.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r * 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(56,189,248,.75)'; ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(sh.x - 2, sh.y - 2.5, sh.r * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function render() {
  ctx.setTransform(K, 0, 0, K, 0, 0);
  if (shakeT > 0) ctx.translate(rand(-2, 2), rand(-2, 2));
  if (BG) ctx.drawImage(BG, 0, 0, W, H);
  // 燈光
  const lg = !!legend, li = lg ? 0.32 + Math.sin(time * 20) * 0.08 : 0.09 + arenaFlash * 0.25;
  ctx.globalCompositeOperation = 'lighter';
  for (const lx of [64, W - 64]) {
    const g = ctx.createLinearGradient(0, 10, 0, slotTop);
    g.addColorStop(0, `rgba(255,252,230,${li})`); g.addColorStop(1, 'rgba(255,252,230,0)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(lx - 30, 18); ctx.lineTo(lx + 30, 18);
    const tx = lx < W / 2 ? W * 0.72 : W * 0.28;
    ctx.lineTo(tx + 120, slotTop); ctx.lineTo(tx - 120, slotTop); ctx.closePath(); ctx.fill();
  }
  if (lg) {
    for (let k = 0; k < 4; k++) {
      const a = time * 1.6 + k * Math.PI / 2, x = W / 2 + Math.sin(a) * 160;
      const g = ctx.createLinearGradient(0, 0, 0, slotTop);
      g.addColorStop(0, `hsla(${(k * 90 + time * 120) % 360},100%,70%,.22)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W / 2 - 8, 0); ctx.lineTo(W / 2 + 8, 0); ctx.lineTo(x + 40, slotTop); ctx.lineTo(x - 40, slotTop); ctx.closePath(); ctx.fill();
    }
  }
  for (const f of flashes) {
    if (f.t < 0) continue;
    const a = 1 - f.t / f.d, g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 10);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(f.x - 10, f.y - 10, 20, 20);
  }
  ctx.globalCompositeOperation = 'source-over';

  // LED 跑馬燈
  const ly = pegTop - 22;
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, ly - 8, W, 15);
  ctx.save(); ctx.beginPath(); ctx.rect(0, ly - 8, W, 15); ctx.clip();
  ctx.font = `600 15px ${NUMF}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const msg = legend ? `★ LEGEND ZONE ★ 傳說格 ${legend.t.toFixed(1)}s ★ 瞄準中央 ★ ` : `GALAR LEAGUE ★ 第 ${round.n} 回 ★ 剩 ${round.left} 顆 ★ 第 10 顆是極巨珠 ★ 小心中間的寶可夢出招 ★ 中央連擊 ${streak}/5 ★ `;
  ctx.fillStyle = legend ? '#e9d5ff' : '#ffcc33';
  const mw = ctx.measureText(msg).width, off = (time * 40) % mw;
  for (let x = -off; x < W; x += mw) ctx.fillText(msg, x, ly + 1);
  ctx.restore();

  // 釘子
  for (const p of pegs) {
    const r = PR + p.f * 1.4;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(p.x + 1, p.y + 1.6, PR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.f > 0 ? `rgb(255,${Math.round(255 - p.f * 60)},${Math.round(255 - p.f * 200)})` : '#eef1ff';
    ctx.beginPath(); ctx.arc(p.x + (p.wob ? Math.sin(time * 60) * p.f * 1.5 : 0), p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  // 彈板
  for (const k of kickers) {
    const c = k.side > 0 ? '#ff4d6d' : '#3fb8ff';
    ctx.fillStyle = c; ctx.globalAlpha = 0.85 + k.f * 0.15;
    ctx.beginPath(); ctx.arc(k.x, k.y, KR + k.f * 3, k.side > 0 ? -Math.PI / 2 : Math.PI / 2, k.side > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    if (k.f > 0) { ctx.fillStyle = `rgba(255,255,255,${k.f * 0.6})`; ctx.beginPath(); ctx.arc(k.x, k.y, KR * 1.8, 0, Math.PI * 2); ctx.fill(); }
  }
  // 干擾寶可夢
  drawHazards();
  // 格子
  for (const s of slots) drawSlot(s);
  ctx.fillStyle = '#d6def7';
  for (let k = 1; k < NS; k++) { const x = M + SW * k; ctx.fillRect(x - 1, slotTop, 2, H - slotTop); ctx.beginPath(); ctx.arc(x, slotTop, 2.5, 0, Math.PI * 2); ctx.fill(); }
  // 中央連擊燈
  const cx = W / 2, py = slotTop - 9;
  if (!legend) for (let k = 0; k < 5; k++) {
    ctx.fillStyle = k < streak ? '#ffcc33' : 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.arc(cx - 12 + k * 6, py, 2.3, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = '#e9d5ff'; ctx.font = `700 15px ${NUMF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(legend.t.toFixed(1), cx, py);
  }
  // 放珠器
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M, DROP_Y - 20); ctx.lineTo(W - M, DROP_Y - 20); ctx.stroke();
  ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath(); ctx.moveTo(carX, DROP_Y); ctx.lineTo(carX, pegTop - 6); ctx.stroke(); ctx.setLineDash([]);
  const nextD = (dropCount + 1) % 10 === 0;
  ctx.save(); ctx.translate(carX, DROP_Y - 20);
  ctx.fillStyle = '#10132b'; ctx.strokeStyle = nextD ? '#ff2a4f' : '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-18, -9); ctx.lineTo(18, -9); ctx.lineTo(12, 9); ctx.lineTo(-12, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8173a'; ctx.fillRect(-16, -7, 16, 4); ctx.fillStyle = '#1e6bff'; ctx.fillRect(0, -7, 16, 4);
  ctx.fillStyle = nextD ? '#ff2a4f' : '#ffcc33'; ctx.font = `600 13px ${NUMF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(nextD ? 'MAX' : '▼', 0, 3);
  ctx.restore();
  // 這回剩下的珠（屋頂中央）
  ctx.fillStyle = 'rgba(0,0,0,.55)'; rrect(W / 2 - 92, 3, 184, 17, 8); ctx.fill();
  ctx.fillStyle = '#ffcc33'; ctx.font = `600 15px ${NUMF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`R${round.n}`, W / 2 - 86, 12.5);
  for (let k = 0; k < ROUND; k++) {
    const px = W / 2 - 52 + k * 14.5, on = k < round.left, last = k === ROUND - 1;
    ctx.fillStyle = on ? (last ? '#ff2a4f' : '#e8173a') : 'rgba(255,255,255,.14)';
    ctx.beginPath(); ctx.arc(px, 11.5, last ? 5.5 : 4.6, Math.PI, 0); ctx.fill();
    ctx.fillStyle = on ? '#f6f7ff' : 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.arc(px, 11.5, last ? 5.5 : 4.6, 0, Math.PI); ctx.fill();
  }
  // 珠
  for (const p of parts) if (p.cloud) {
    const a = 1 - p.t / p.life;
    ctx.fillStyle = p.c; ctx.globalAlpha = a * 0.35; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 + p.t), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const b of balls) drawBall(b);
  for (const p of parts) if (!p.cloud) {
    ctx.fillStyle = p.c; ctx.globalAlpha = 1 - p.t / p.life; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  for (const c of confetti) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c;
    ctx.fillRect(-c.w / 2, -c.h / 2 * Math.abs(Math.cos(c.t * 6)), c.w, c.h * Math.abs(Math.cos(c.t * 6)) + 0.5); ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floats) {
    ctx.globalAlpha = 1 - f.t / 1.2; ctx.font = `900 13px ${ZHF}`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(f.text, f.x, f.y - f.t * 40);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.t * 40);
  }
  ctx.globalAlpha = 1;
  // 極巨化紅霧暈邊
  if (update.dm) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(232,23,58,0)'); g.addColorStop(1, `rgba(232,23,58,${0.28 + Math.sin(time * 6) * 0.06})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (legend) {
    ctx.strokeStyle = `hsla(${(time * 200) % 360},100%,70%,.7)`; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
  }
}

function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!pauses.size) update(dt);
  shakeT = Math.max(0, shakeT - dt);
  render();
  requestAnimationFrame(frame);
}

/* ============ UI ============ */
function setK(k, v) { document.querySelectorAll(`[data-k="${k}"]`).forEach(e => { e.textContent = v; }); }
function setBar(k, r) { document.querySelectorAll(`[data-bar="${k}"]`).forEach(e => { e.style.width = (r * 100).toFixed(1) + '%'; }); }
const legendCount = () => POKEDEX.filter(p => p.tier === 'legend' && C.has(p.id)).length;
function refreshUI() {
  const dc = C.count(), sc = C.shinyCount(), lc = legendCount();
  setK('dex', dc); setK('shiny', sc); setK('legend', lc);
  setBar('dex', dc / DEX_TOTAL); setBar('shiny', Math.min(1, sc / 40)); setBar('legend', lc / LEGEND_TOTAL);
  for (const k in run) setK(k, run[k]);
  setK('left', round.left);
}
function renderRecent() {
  const r = C.recent();
  $('recent').innerHTML = r.slice(0, 16).map(e => `<div class="${e.s ? 's' : ''}" title="${P[e.id] ? P[e.id].zh : ''}"><img src="${C.img(e.id, e.s)}" alt=""></div>`).join('');
  $('strip').innerHTML = r.length ? r.slice(0, 10).map(e => `<img class="${e.s ? 's' : ''}" src="${C.img(e.id, e.s)}" alt="">`).join('') : '<span class="ph">還沒抓到寶可夢・點這裡看圖鑑</span>';
}
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }
function banner(title, sub, color) {
  const el = $('banner'); $('banT').textContent = title; $('banS').textContent = sub;
  el.style.setProperty('--bc', color); el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
}
function syncSwitches() {
  document.querySelectorAll('[data-sw]').forEach(e => e.classList.toggle('on', !!cfg[e.dataset.sw]));
  document.querySelectorAll('[data-mbtn]').forEach(e => { e.textContent = cfg.music ? '🎵' : '🔇'; e.classList.toggle('on', cfg.music); });
  document.querySelectorAll('[data-sbtn]').forEach(e => { e.textContent = cfg.sfx ? '🔊' : '🔈'; e.classList.toggle('on', cfg.sfx); });
  const p = pauses.has('user');
  document.querySelectorAll('[data-pbtn]').forEach(e => { e.textContent = p ? '▶' : '⏸'; });
  setK('pauseLbl', p ? '▶ 繼續' : '⏸ 暫停');
  $('pauseOv').classList.toggle('show', p);
}
function pause(r) { pauses.add(r); holding = false; syncSwitches(); }
function resume(r) { pauses.delete(r); last = performance.now(); syncSwitches(); }
const ACT = {
  dex: openDex,
  pause: () => (pauses.has('user') ? resume('user') : pause('user')),
  home: () => { location.href = '../'; },
  auto: () => { cfg.auto = !cfg.auto; saveCfg(); syncSwitches(); toast(cfg.auto ? '自動落珠：開（結算後也會自動下一回）' : '自動落珠：關（拖曳選位置，按住放珠）'); },
  music: () => { cfg.music = !cfg.music; AU.setMusic(cfg.music); saveCfg(); syncSwitches(); },
  sfx: () => { cfg.sfx = !cfg.sfx; AU.setSfx(cfg.sfx); saveCfg(); syncSwitches(); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  AU.init(); ACT[el.dataset.act]();
});
document.addEventListener('pointerdown', () => AU.init(), { capture: true });

// 板子操作：拖曳選位置，按住連續放珠
function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); if (pauses.size) return;
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  aimX = clamp(toLogical(e).x, M + BR, W - M - BR); carX = aimX;
  holding = true; holdT = 0;
});
cv.addEventListener('pointermove', e => { if (holding) aimX = clamp(toLogical(e).x, M + BR, W - M - BR); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => cv.addEventListener(t, () => { holding = false; autoT = DROP_EVERY; }));
cv.addEventListener('contextmenu', e => e.preventDefault());
const keys = new Set();
document.addEventListener('keydown', e => {
  if ($('mDex').classList.contains('show')) {
    if (e.key === 'Escape' || e.key === 'd' || e.key === 'D') closeDex();
    else if (e.key === 'ArrowLeft') { dexPage--; renderDex(); } else if (e.key === 'ArrowRight') { dexPage++; renderDex(); }
    return;
  }
  if ($('mSum').classList.contains('show')) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); AU.init(); nextRound(); } return; }
  AU.init();
  if (e.key === ' ') { e.preventDefault(); if (!pauses.size && !holding) { holding = true; holdT = 0; } }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { keys.add(e.key); e.preventDefault(); }
  else if (e.key === 'a' || e.key === 'A') ACT.auto();
  else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') ACT.pause();
  else if (e.key === 'd' || e.key === 'D') openDex();
});
document.addEventListener('keyup', e => { if (e.key === ' ') { holding = false; autoT = DROP_EVERY; } keys.delete(e.key); });
setInterval(() => {
  if (keys.has('ArrowLeft')) aimX = clamp(aimX - 6, M + BR, W - M - BR);
  if (keys.has('ArrowRight')) aimX = clamp(aimX + 6, M + BR, W - M - BR);
}, 16);
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause('hidden'); AU.suspend(); } else { resume('hidden'); AU.resume(); } });

/* ============ 圖鑑 ============ */
let dexPage = 0, dexFilter = 'all';
const shinyView = new Set();
function openDex() {
  pause('dex'); dexPage = 0;
  $('mDex').classList.add('show');
  renderDexTop();
  requestAnimationFrame(renderDex);
}
function renderDexTop() {
  $('dxTop').innerHTML = `<span>已登錄 <b>${C.count()}</b>/${DEX_TOTAL}</span><span>閃光 <b>${C.shinyCount()}</b></span><span>傳說 <b>${legendCount()}</b>/${LEGEND_TOTAL}</span>
    <div class="tabs">${[['all', '全部'], ['got', '已登錄'], ['miss', '未登錄'], ['shiny', '閃光']].map(([f, t]) => `<button data-f="${f}" class="${f === dexFilter ? 'on' : ''}">${t}</button>`).join('')}</div>`;
}
function closeDex() { $('mDex').classList.remove('show'); resume('dex'); }
function renderDex() {
  const gridEl = $('dxGrid'), box = gridEl.parentElement;
  const w = box.clientWidth - 24, h = box.clientHeight - 8;
  const cols = Math.max(3, Math.floor((w + 6) / 86)), rows = Math.max(2, Math.floor((h + 6) / 100));
  const per = cols * rows;
  const list = POKEDEX.filter(p => {
    const e = C.store.dex[p.id];
    return dexFilter === 'all' || (dexFilter === 'got' ? e && e.got : dexFilter === 'miss' ? !(e && e.got) : e && e.gotS);
  });
  const pages = Math.max(1, Math.ceil(list.length / per));
  dexPage = clamp(dexPage, 0, pages - 1);
  gridEl.style.gridTemplateColumns = `repeat(${cols},1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${rows},1fr)`;
  gridEl.innerHTML = list.slice(dexPage * per, dexPage * per + per).map(p => {
    const e = C.store.dex[p.id] || {}, sh = shinyView.has(p.id) && e.gotS;
    return `<div class="dcell ${e.got ? p.tier : 'miss'} ${sh ? 'sh' : ''} ${e.gotS ? 'can' : ''}" data-id="${p.id}"><span class="n">#${pad3(C.no(p.id))}</span>
      ${e.got ? `<span class="c">×${(e.n || 0) + (e.s || 0)}</span>` : ''}${e.gotS ? '<span class="st">✨</span>' : ''}
      <img src="${C.img(p.id, sh)}" alt="" loading="lazy"><div class="nm">${e.got ? p.zh : '？？？'}</div></div>`;
  }).join('') || '<div class="empty" style="grid-column:1/-1">還沒有符合的寶可夢</div>';
  $('dxPage').textContent = `${dexPage + 1}/${pages}`;
}
$('dxGrid').addEventListener('click', e => {
  const c = e.target.closest('.dcell'); if (!c) return;
  const id = +c.dataset.id, en = C.store.dex[id];
  if (!(en && en.gotS)) return;
  shinyView.has(id) ? shinyView.delete(id) : shinyView.add(id);
  renderDex();
});
$('dxTop').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]'); if (!b) return;
  dexFilter = b.dataset.f; dexPage = 0; renderDexTop(); renderDex();
});
$('dxPrev').addEventListener('click', () => { dexPage--; renderDex(); });
$('dxNext').addEventListener('click', () => { dexPage++; renderDex(); });
$('dxClose').addEventListener('click', closeDex);
$('dxX').addEventListener('click', closeDex);
$('mDex').addEventListener('click', e => { if (e.target === $('mDex')) closeDex(); });
let swX = null;
$('dxGrid').addEventListener('pointerdown', e => { swX = e.clientX; });
$('dxGrid').addEventListener('pointerup', e => {
  if (swX == null) return; const dx = e.clientX - swX; swX = null;
  if (Math.abs(dx) > 50) { dexPage += dx < 0 ? 1 : -1; renderDex(); }
});
window.addEventListener('resize', () => { fit(); if ($('mDex').classList.contains('show')) renderDex(); });
if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(wrapEl);

/* ============ 測試用 ============ */
// __sim(秒)：不畫圖、不存檔，直接跑物理，檢查有沒有卡珠或 NaN
window.__sim = (sec = 120, { spread = 1, hold = false, noDmax = false, noBB = false, every = 0 } = {}) => {
  const saved = { balls, dropCount, time, streak };
  balls = []; dropCount = 0;
  SIM = { landed: 0, bySlot: Array(NS).fill(0), nudges: 0, stuck: 0, nan: 0, maxAge: 0, kicks: 0, knocks: 0, dmaxDrops: 0, dmaxLanded: 0, maxBalls: 0, drops: 0, stuckD: 0, stuckAt: [], legends: 0, hz: 0, prize: 0, noDmax, noBB };
  const dt = 1 / 60;
  let t = 0, at = 0, sweep = 0;
  try {
    for (let f = 0; f < sec * 60; f++) {
      t += dt; time += dt; at -= dt;
      if (at <= 0) {
        sweep += 0.37;
        const x = W / 2 + Math.sin(sweep) * (W / 2 - M - 10) * spread + rand(-16, 16);
        if (drop(x)) SIM.drops++;
        at = every || (hold ? 0.05 : DROP_EVERY);
      }
      updateHazards(dt);
      physics(dt);
      SIM.maxBalls = Math.max(SIM.maxBalls, balls.length);
    }
    SIM.onBoard = balls.length;
    SIM.prize = SIM.bySlot.reduce((a, n, i) => a + (slots[i].miss ? 0 : n), 0);
    SIM.prizeRate = +(SIM.prize / Math.max(1, SIM.landed)).toFixed(3);
    return SIM;
  } finally {
    const out = SIM; SIM = null; balls = saved.balls; dropCount = saved.dropCount; time = saved.time; streak = saved.streak;
    void out;
  }
};
// __run(秒)：用遊戲時間跑完整主迴圈（含抓到、存檔、揭曉排隊），給背景分頁 rAF 被節流時測試用
window.__run = (sec = 60) => { for (let f = 0; f < sec * 60; f++) update(1 / 60); render(); return __state(); };
window.__dmax = () => { forceDmax = true; };
window.__shiny = () => { forceShiny = true; };
window.__legend = () => startLegend();
window.__catch = (n = 20, slot) => { for (let k = 0; k < n; k++) catchAt(slot != null ? slot : Math.floor(Math.random() * NS), { dmax: false, shiny: false }); };
window.__state = () => ({ balls: balls.length, dex: C.count(), run: { ...run }, legend: legend && { t: legend.t, list: legend.list }, streak, slots: slots.map(s => s.miss ? 'x' : s.ball), round: { n: round.n, left: round.left, hits: round.hits.length, miss: round.miss, endT: round.endT }, hz: hz.map(z => z.type + ':' + z.state) });
window.__next = () => nextRound();

/* ============ 開始 ============ */
syncSwitches();
fit(); dealHazards(); refreshUI(); renderRecent();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => buildBG());
requestAnimationFrame(t => { last = t; frame(t); });
setTimeout(() => toast('一回 10 顆・避開落空格和寶可夢的招式'), 600);
