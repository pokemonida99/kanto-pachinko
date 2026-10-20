'use strict';
/* 合眾彈珠打磚（Peggle 型）：頂部砲台射珠，打亮橘色寶可夢釘就抓到，打完全部橘釘清台換季 */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pad3 = Collect.pad3;

const C = Collect.create({ key: 'unovaPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
const P = C.P;
const TOTAL = POKEDEX.length;
const SHINY_RATE = 1 / 100;
const DRAGONS = [644, 643, 646];               // 捷克羅姆 → 雷希拉姆 → 酋雷姆 輪流
const DRAGON_LOOK = {
  644: { core: '#15161c', ring: '#3aa7ff', glow: 'rgba(58,167,255,', bolt: '#7fd0ff' },
  643: { core: '#f4f4f0', ring: '#ff6a3d', glow: 'rgba(255,120,70,', bolt: '#ffd28a' },
  646: { core: '#8a96a8', ring: '#9ff0ff', glow: 'rgba(160,240,255,', bolt: '#e4fbff' },
};
const SEASONS = [
  { zh: '春', en: 'SPRING', acc: '#ff8fb8', acc2: '#ffd1e3', rgb: '255,143,184', deer: 585, fx: '櫻花飄落的釘板', types: ['grass', 'fairy', 'bug', 'normal'] },
  { zh: '夏', en: 'SUMMER', acc: '#2fd38a', acc2: '#b5f5d6', rgb: '47,211,138', deer: 585, fx: '螢火蟲飛舞的盛夏', types: ['water', 'fire', 'electric', 'bug'] },
  { zh: '秋', en: 'AUTUMN', acc: '#ff7a2f', acc2: '#ffd0b0', rgb: '255,122,47', deer: 586, fx: '楓葉紛飛的秋天', types: ['ground', 'fighting', 'dark', 'rock', 'poison', 'psychic'] },
  { zh: '冬', en: 'WINTER', acc: '#9fe3ff', acc2: '#e8f8ff', rgb: '159,227,255', deer: 586, fx: '釘子結冰：碰到會滑一下', types: ['ice', 'steel', 'ghost', 'dragon', 'flying'] },
];

/* ============ 存檔（圖鑑在 Collect；這裡只記機台狀態） ============ */
const ST_KEY = 'unovaPachinko.state';
const G = { season: 0, clears: 0, dragonIdx: 0, dragonPending: false, auto: true, music: true, sfx: true, last: -1 };
try { Object.assign(G, JSON.parse(localStorage.getItem(ST_KEY)) || {}); } catch (e) {}
if (/[?&]reset\b/.test(location.search)) { try { localStorage.removeItem(ST_KEY); } catch (e) {} Object.assign(G, { season: 0, clears: 0, dragonIdx: 0, dragonPending: false }); }
const saveG = () => { try { localStorage.setItem(ST_KEY, JSON.stringify(G)); } catch (e) {} };
let SIM = false;                                // __sim 跑物理時不出聲、不存檔、不畫特效

/* ============ 音樂與音效（WebAudio 即時合成，四季變奏） ============ */
const AU = (() => {
  let ac = null, master, bgm, sfx, noiseBuf, nextT = 0, step = 0, lastTick = 0, lastPeg = 0;
  const BGM_VOL = 0.42;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
  // 四季：同一套骨架換調、速度、音色、節奏
  const SONGS = [
    { bpm: 112, root: 60, mode: MAJ, prog: [0, 5, 3, 4, 0, 5, 1, 4], lead: [4, 2, 0, 2, 4, 4, 7, -1], leadT: 'triangle', kit: 'soft' },
    { bpm: 134, root: 62, mode: MAJ, prog: [0, 4, 5, 3, 0, 4, 3, 4], lead: [7, -1, 4, 7, 9, 7, 4, 2], leadT: 'square', kit: 'pop' },
    { bpm: 98, root: 57, mode: MIN, prog: [0, 5, 2, 6, 0, 3, 4, 4], lead: [0, 2, 4, -1, 7, 4, 2, -1], leadT: 'sawtooth', kit: 'swing' },
    { bpm: 82, root: 64, mode: MIN, prog: [0, 3, 5, 4, 0, 5, 3, 6], lead: [7, -1, 4, -1, 2, 4, 0, -1], leadT: 'sine', kit: 'bells' },
  ];
  let song = SONGS[0], trans = 0, tempoMul = 1, E = 60 / 112 / 2;
  const deg = (root, mode, d) => root + mode[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = G.music ? BGM_VOL : 0; bgm.connect(master);
    sfx = ac.createGain(); sfx.gain.value = G.sfx ? 1 : 0; sfx.connect(master);
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
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, S = song, c = S.prog[bar];
    const root = S.root + trans, tone = d => deg(root, S.mode, d);
    // 主旋律：和弦根音＋圖形，奇數小節錯開三拍
    let v = S.lead[(i + (bar % 2) * 3) % 8];
    if (bar === 7 && i >= 4) v = i === 4 ? 0 : -1;
    if (v >= 0) {
      const m = tone(c + v) + 12;
      if (S.kit === 'bells') { osc(bgm, 'sine', hz(m), t, E * 3.2, 0.05); osc(bgm, 'sine', hz(m + 12), t, E * 1.5, 0.012); }
      else if (S.leadT === 'sawtooth') { osc(bgm, 'triangle', hz(m), t, E * 1.3, 0.05); osc(bgm, 'sawtooth', hz(m), t, E * 0.6, 0.008); }
      else { osc(bgm, S.leadT, hz(m), t, E * 0.9, S.leadT === 'square' ? 0.024 : 0.05); osc(bgm, 'sine', hz(m + 12), t, E * 0.5, 0.01); }
    }
    // 分散和弦
    if (i % 2 === 1 || S.kit === 'bells') {
      const arp = [c, c + 2, c + 4, c + 2][(i >> 1) % 4];
      osc(bgm, S.kit === 'bells' ? 'sine' : 'triangle', hz(tone(arp)), t, E * (S.kit === 'bells' ? 1.8 : 0.5), S.kit === 'bells' ? 0.018 : 0.022);
    }
    // 低音
    const br = tone(c) - 12;
    if (S.kit === 'bells') { if (i === 0) osc(bgm, 'triangle', hz(br), t, E * 7, 0.07); }
    else if (i === 0 || i === 4 || (S.kit === 'pop' && i === 6) || (S.kit === 'swing' && i === 3)) osc(bgm, 'triangle', hz(i === 4 && S.kit !== 'swing' ? br + 12 : br), t, E * 1.6, 0.08);
    // 鼓
    if (S.kit === 'bells') { noise(bgm, t, 0.04, i % 2 ? 0.012 : 0.022, 'highpass', 8000); if (i === 4) noise(bgm, t, 0.3, 0.02, 'bandpass', 5000); return; }
    if (i === 0 || (S.kit === 'pop' && i === 4) || (S.kit === 'swing' && i === 5)) osc(bgm, 'sine', 150, t, 0.15, S.kit === 'soft' ? 0.13 : 0.2, 45);
    if (i === 4 || (S.kit === 'soft' && i === 2 && bar % 2)) noise(bgm, t, 0.12, S.kit === 'soft' ? 0.05 : 0.08, 'bandpass', 1900);
    noise(bgm, t, 0.025, i % 2 ? 0.018 : 0.03, 'highpass', 7500);
  }
  function retime() { E = 60 / (song.bpm * tempoMul) / 2; }
  function duck(sec, to = 0.12) {
    if (!ac || !G.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * to, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  function setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } }
  function setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); }
  function setSeason(i) { song = SONGS[i]; trans = 0; tempoMul = 1; retime(); step = 0; }
  function fever(on) { trans = on ? 5 : 0; tempoMul = on ? 1.15 : 1; retime(); }   // 清台：音樂拔高
  function notes(list, type = 'square', vol = 0.05, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m + trans), t, d * 0.95, vol); osc(sfx, 'triangle', hz(m + trans - 12), t, d, vol * 0.8); } t += d; }
    return t - ac.currentTime;
  }
  const PENTA = [0, 2, 4, 7, 9];
  const ok = () => ac && !SIM;
  const play = {
    peg(k) {   // 每顆新釘子音高往上爬
      if (!ok()) return; const n = performance.now(); if (n - lastPeg < 25) return; lastPeg = n;
      const m = Math.min(108, 72 + 12 * Math.floor(k / 5) + PENTA[k % 5]) + (song.root - 60);
      osc(sfx, 'triangle', hz(m), ac.currentTime, 0.22, 0.06); osc(sfx, 'sine', hz(m + 12), ac.currentTime, 0.12, 0.025);
      if (song.kit === 'bells') osc(sfx, 'sine', hz(m + 24), ac.currentTime, 0.3, 0.015);
    },
    tick() { if (!ok()) return; const n = performance.now(); if (n - lastTick < 50) return; lastTick = n; osc(sfx, 'sine', 1900 + Math.random() * 500, ac.currentTime, 0.03, 0.018); },
    wall() { if (ok()) osc(sfx, 'triangle', 220, ac.currentTime, 0.06, 0.04, 160); },
    poke() { if (!ok()) return; [88, 95].forEach((m, i) => osc(sfx, 'square', hz(m), ac.currentTime + i * 0.06, 0.09, 0.025)); },
    ice() { if (!ok()) return; osc(sfx, 'sine', 2600, ac.currentTime, 0.12, 0.03, 4200); noise(sfx, ac.currentTime, 0.08, 0.04, 'highpass', 9000); },
    shoot() { if (!ok()) return; noise(sfx, ac.currentTime, 0.12, 0.18, 'lowpass', 900); osc(sfx, 'square', 520, ac.currentTime, 0.12, 0.03, 1300); },
    pop(k) { if (ok()) osc(sfx, 'sine', Math.min(2400, 500 + k * 55), ac.currentTime, 0.09, 0.06, Math.min(3600, 900 + k * 80)); },
    bucket() { duck(1.4); notes([[72, 0.07], [76, 0.07], [79, 0.07], [84, 0.07], [88, 0.3]], 'square', 0.045); },
    slow() {
      if (!ok()) return; duck(2.2, 0.25);
      const t0 = ac.currentTime;
      for (let i = 0; i < 4; i++) { osc(sfx, 'sine', 70, t0 + i * 0.5, 0.18, 0.3, 40); osc(sfx, 'sine', 70, t0 + i * 0.5 + 0.18, 0.14, 0.18, 40); }
      osc(sfx, 'sawtooth', 110, t0, 2, 0.012, 440);
    },
    clear() {
      if (!ok()) return; duck(3);
      noise(sfx, ac.currentTime, 1.4, 0.3, 'highpass', 3000);
      const d = notes([[72, 0.1], [76, 0.1], [79, 0.1], [84, 0.2], [79, 0.1], [84, 0.1], [88, 0.6]], 'square', 0.05);
      [72, 76, 79, 84, 88].forEach(m => osc(sfx, 'triangle', hz(m + trans), ac.currentTime + d - 0.6, 1.4, 0.025));
    },
    thunder() {
      if (!ok()) return; duck(3);
      noise(sfx, ac.currentTime, 0.25, 0.5, 'highpass', 1800);
      noise(sfx, ac.currentTime + 0.05, 2.2, 0.45, 'lowpass', 260);
      osc(sfx, 'sawtooth', 60, ac.currentTime, 1.2, 0.08, 30);
    },
    sparkle() { if (!ok()) return; [84, 88, 91, 96, 100, 103].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + i * 0.05, 0.25, 0.04)); },
    ding(rank = 0) { if (ok()) osc(sfx, 'triangle', hz(84 + rank * 4), ac.currentTime, 0.25, 0.05); },
    whoosh() { if (!ok()) return; noise(sfx, ac.currentTime, 0.7, 0.2, 'bandpass', 900); osc(sfx, 'sine', 300, ac.currentTime, 0.6, 0.04, 1200); },
    drumroll(dur) {
      if (!ok()) return; duck(dur + 3);
      const t0 = ac.currentTime;
      for (let t = 0; t < dur; t += 0.045) noise(sfx, t0 + t, 0.04, 0.03 + 0.14 * (t / dur), 'bandpass', 900 + 1600 * (t / dur));
      osc(sfx, 'sawtooth', 160, t0, dur, 0.025, 720);
    },
    flash() { if (!ok()) return; noise(sfx, ac.currentTime, 0.6, 0.3, 'highpass', 2500); [72, 76, 79, 84].forEach(m => osc(sfx, 'square', hz(m), ac.currentTime, 0.5, 0.022)); },
    fanfareRare() { duck(1.6); notes([[72, 0.09], [76, 0.09], [79, 0.09], [84, 0.18], [79, 0.09], [84, 0.5]], 'square', 0.045); },
    fanfareBig() {
      duck(3.2);
      const d = notes([[67, 0.11], [72, 0.11], [76, 0.11], [79, 0.22], [76, 0.11], [79, 0.11], [84, 0.33], [0, 0.05], [83, 0.11], [84, 0.11], [86, 0.11], [88, 0.7]], 'square', 0.05);
      if (ac) [72, 76, 79, 84].forEach(m => osc(sfx, 'triangle', hz(m + trans), ac.currentTime + d - 0.7, 1.2, 0.03));
    },
    evo() { duck(2); notes([[67, 0.08], [71, 0.08], [74, 0.08], [79, 0.08], [83, 0.08], [86, 0.08], [91, 0.4]], 'triangle', 0.06); },
    season() { if (!ok()) return; duck(2.2); noise(sfx, ac.currentTime, 1.2, 0.18, 'bandpass', 1400); notes([[79, 0.12], [84, 0.12], [88, 0.12], [91, 0.5]], 'triangle', 0.05, 0.5); },
  };
  return { init, play, setMusic, setSfx, setSeason, fever, suspend: () => ac && ac.suspend(), resume: () => ac && ac.resume() };
})();
const sfx = AU.play;

/* ============ 台面幾何 ============ */
const W = 480;
let H = 780;
const BR = 7, GRAV = 760, LAUNCH = 610, MAX_V = 1150, HSTEP = 1 / 240;
const E_PEG = 0.72, E_WALL = 0.78, GAP = 2 * BR + 8;   // 任兩個障礙物之間至少要留 GAP，珠子才不會卡在縫裡
const MAXA = 1.45;                                     // 砲口最大偏角（弧度，0 = 正下方）
const FX0 = 40, FW = 400, FT = 150;
const fieldBot = () => H - 128;
const cannon = { x: W / 2, y: 46, a: 0, ta: 0, recoil: 0 };
const bucket = { x: W / 2, y: 0, w: 86, t: 0, f: 0 };
const CELL = 48;
let pegs = [], grid = [], GC = 0, GR = 0;
let board = { cleared: false, t: 0, tpl: 0 };
let ball = null, state = 'boot', shot = null;
let time = 0, acc = 0, timeScale = 1, slowOn = false, feverHold = 0, clearFx = 0, shakeT = 0;
let autoT = 0, autoAim = null, pointerDown = false;
const cam = { x: W / 2, y: 0, z: 1 };
let parts = [], floats = [], flyers = [], ambient = [], bolts = [];
const imgCache = {};
function pimg(id, shiny) {
  const k = id + (shiny ? 's' : '');
  if (!imgCache[k]) { const im = new Image(); im.src = C.img(id, shiny); imgCache[k] = im; }
  return imgCache[k];
}

const toXY = (u, v) => [FX0 + u * FW, FT + v * (fieldBot() - FT)];
function placePeg(p) {
  if (p.shape === 'c') { [p.x, p.y] = toXY(p.u, p.v); }
  else { [p.x1, p.y1] = toXY(p.u1, p.v1); [p.x2, p.y2] = toXY(p.u2, p.v2); p.x = (p.x1 + p.x2) / 2; p.y = (p.y1 + p.y2) / 2; }
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? clamp(((px - ax) * dx + (py - ay) * dy) / L, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
// 兩個障礙物表面之間的距離
function shapeGap(a, b) {
  if (a.shape === 'c' && b.shape === 'c') return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  if (a.shape === 's' && b.shape === 'c') return shapeGap(b, a);
  if (b.shape === 's' && a.shape === 'c') return segDist(a.x, a.y, b.x1, b.y1, b.x2, b.y2) - a.r - b.th;
  let d = Infinity;
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    d = Math.min(d, segDist(a.x1 + (a.x2 - a.x1) * t, a.y1 + (a.y2 - a.y1) * t, b.x1, b.y1, b.x2, b.y2));
    d = Math.min(d, segDist(b.x1 + (b.x2 - b.x1) * t, b.y1 + (b.y2 - b.y1) * t, a.x1, a.y1, a.x2, a.y2));
  }
  return d - a.th - b.th;
}
const wallGap = p => p.shape === 'c' ? Math.min(p.x - p.r, W - p.x - p.r) : Math.min(p.x1, p.x2, W - p.x1, W - p.x2) - p.th;

/* ---------- 排列樣板（u,v 是場地內的比例座標） ---------- */
const peg = (u, v) => ({ u, v });
const brick = (u1, v1, u2, v2) => ({ u1, v1, u2, v2, brick: true });
const TEMPLATES = [
  // 交錯格子＋兩側斜磚
  () => {
    const out = [brick(0.0, 0.3, 0.1, 0.38), brick(1.0, 0.3, 0.9, 0.38), brick(0.0, 0.72, 0.1, 0.8), brick(1.0, 0.72, 0.9, 0.8), brick(0.42, 0.56, 0.58, 0.56)];
    for (let r = 0; r < 7; r++) {
      const n = r % 2 ? 8 : 9;
      for (let i = 0; i < n; i++) out.push(peg(r % 2 ? (i + 0.5) / 8 : i / 8, 0.02 + r * 0.16));
    }
    return out;
  },
  // 同心圓環＋底部弧
  () => {
    const out = [brick(0.02, 0.55, 0.1, 0.66), brick(0.98, 0.55, 0.9, 0.66), brick(0.3, 0.8, 0.42, 0.8), brick(0.58, 0.8, 0.7, 0.8)];
    const fh = fieldBot() - FT, cy = 0.4;
    const ring = (R, n, off) => { for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2; out.push(peg(0.5 + Math.cos(a) * R / FW, cy + Math.sin(a) * R / fh)); } };
    out.push(peg(0.5, cy));
    ring(68, 7, 0.3); ring(146, 14, 0);
    for (let i = 0; i < 9; i++) out.push(peg(i / 8, 0.92 + Math.sin(i / 8 * Math.PI) * 0.06));
    out.push(peg(0.03, 0.02), peg(0.97, 0.02), peg(0.1, 0.12), peg(0.9, 0.12));
    return out;
  },
  // 波浪線，偶數條中間是一條磚
  () => {
    const out = [];
    for (let k = 0; k < 5; k++) {
      const vb = 0.04 + k * 0.235, wv = u => vb + 0.05 * Math.sin(u * Math.PI * 3 + k * 1.3);
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        if (k % 2 === 0 && i >= 4 && i <= 6) continue;
        out.push(peg(u, wv(u)));
      }
      if (k % 2 === 0) out.push(brick(0.38, wv(0.38), 0.62, wv(0.62)));
    }
    return out;
  },
  // 菱形群＋人字磚
  () => {
    const out = [];
    const fh = fieldBot() - FT;
    const dia = (u, v) => { out.push(peg(u, v), peg(u - 46 / FW, v), peg(u + 46 / FW, v), peg(u, v - 46 / fh), peg(u, v + 46 / fh)); };
    const chev = (u, v) => { out.push(brick(u - 0.09, v + 0.05, u, v), brick(u, v, u + 0.09, v + 0.05)); };
    chev(0.5, 0.0); chev(0.15, 0.45); chev(0.85, 0.45); chev(0.5, 0.66);
    dia(0.2, 0.14); dia(0.8, 0.14); dia(0.5, 0.36); dia(0.2, 0.7); dia(0.8, 0.7); dia(0.5, 0.92);
    return out;
  },
];

function buildBoard(animate = true) {
  let ti = Math.floor(Math.random() * TEMPLATES.length);
  if (ti === G.last) ti = (ti + 1) % TEMPLATES.length;
  G.last = ti;
  const items = TEMPLATES[ti]();
  pegs = [];
  const ok = c => wallGap(c) >= GAP - 2 && pegs.every(q => shapeGap(c, q) >= GAP);
  const make = it => it.brick ? { shape: 's', u1: it.u1, v1: it.v1, u2: it.u2, v2: it.v2, th: 6 } : { shape: 'c', u: it.u, v: it.v, r: 9 };
  for (const it of items.filter(i => i.brick)) { const c = make(it); placePeg(c); if (ok(c)) pegs.push(c); }
  for (const it of items.filter(i => !i.brick)) { const c = make(it); placePeg(c); if (c.v >= -0.02 && c.v <= 1.06 && ok(c)) pegs.push(c); }
  // 補到約 60 顆
  for (let tries = 0; pegs.length < 60 && tries < 800; tries++) {
    const c = make(peg(Math.random(), Math.random())); placePeg(c);
    if (ok(c)) pegs.push(c);
  }
  pegs.forEach(p => { p.kind = 'blue'; });
  // 龍釘
  if (G.dragonPending) {
    const d = { shape: 'c', r: 26, kind: 'dragon', id: DRAGONS[G.dragonIdx % 3], u: rand(0.3, 0.7), v: rand(0.32, 0.58) };
    placePeg(d);
    pegs = pegs.filter(q => shapeGap(d, q) >= GAP);
    pegs.push(d);
  }
  // 橘色寶可夢釘：先挑彼此分散的，再補滿 15 顆
  const cands = pegs.filter(p => p.shape === 'c' && p.kind === 'blue').sort(() => Math.random() - 0.5);
  const chosen = [];
  for (const p of cands) if (chosen.length < 15 && chosen.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 72)) chosen.push(p);
  for (const p of cands) if (chosen.length < 15 && !chosen.includes(p)) chosen.push(p);
  for (const p of chosen) {
    p.kind = 'poke'; p.id = C.pick({ boost: 0 });
    let room = wallGap(p) - GAP + p.r;
    for (const q of pegs) if (q !== p) room = Math.min(room, shapeGap(p, q) - GAP + p.r);
    p.r = clamp(Math.floor(room), 10, 16);
    if (!SIM) pimg(p.id);
  }
  if (G.dragonPending && !SIM) pimg(DRAGONS[G.dragonIdx % 3]);
  // 由上往下依序掉進來
  pegs.forEach(p => { p.lit = false; p.gone = false; p.dying = -1; p.f = 0; p.appear = animate ? (p.y - FT) / 900 + Math.random() * 0.12 : -1; });
  board = { cleared: false, t: 0, tpl: ti };
  rebuildGrid();
  if (!SIM) { saveG(); refreshUI(); }
}
function rebuildGrid() {
  GC = Math.ceil(W / CELL); GR = Math.ceil((H + 40) / CELL);
  grid = Array.from({ length: GC * GR }, () => []);
  for (const p of pegs) {
    const m = BR + 3 + (p.shape === 'c' ? p.r : p.th);
    const x0 = p.shape === 'c' ? p.x : Math.min(p.x1, p.x2), x1 = p.shape === 'c' ? p.x : Math.max(p.x1, p.x2);
    const y0 = p.shape === 'c' ? p.y : Math.min(p.y1, p.y2), y1 = p.shape === 'c' ? p.y : Math.max(p.y1, p.y2);
    for (let gx = Math.max(0, Math.floor((x0 - m) / CELL)); gx <= Math.min(GC - 1, Math.floor((x1 + m) / CELL)); gx++)
      for (let gy = Math.max(0, Math.floor((y0 - m) / CELL)); gy <= Math.min(GR - 1, Math.floor((y1 + m) / CELL)); gy++) grid[gx + gy * GC].push(p);
  }
}
function relayout() {
  bucket.y = H - 44;
  pegs.forEach(placePeg);
  rebuildGrid();
}

/* ============ 物理 ============ */
// 回傳撞擊時的法向速度（≥0），沒碰到回傳 false
function hitCircle(b, cx, cy, r, e) {
  let nx = b.x - cx, ny = b.y - cy;
  const d = Math.hypot(nx, ny), m = r + b.r;
  if (d >= m) return false;
  if (d < 1e-6) { nx = 0; ny = -1; } else { nx /= d; ny /= d; }
  b.x = cx + nx * m; b.y = cy + ny * m;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return Math.max(0, -vn);
}
function hitCapsule(b, ax, ay, bx, by, th, e) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return hitCircle(b, ax + dx * t, ay + dy * t, th, e);
}
const hitPeg = (b, p) => p.shape === 'c' ? hitCircle(b, p.x, p.y, p.r, E_PEG) : hitCapsule(b, p.x1, p.y1, p.x2, p.y2, p.th, E_PEG);

function newBall(a) {
  return { x: cannon.x + Math.sin(a) * 40, y: cannon.y + Math.cos(a) * 40, vx: Math.sin(a) * LAUNCH, vy: Math.cos(a) * LAUNCH, r: BR, age: 0, slowT: 0, trail: [] };
}
// 共用的一步：真的珠（real）與預測（onHit 回呼）都走這裡
function stepBall(b, h, real, onHit) {
  b.vy += GRAV * h;
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
  b.x += b.vx * h; b.y += b.vy * h;
  if (b.x < BR) { b.x = BR; if (b.vx < 0) { b.vx = -b.vx * E_WALL; if (real && b.vx > 60) sfx.wall(); } }
  if (b.x > W - BR) { b.x = W - BR; if (b.vx > 0) { b.vx = -b.vx * E_WALL; if (real && b.vx < -60) sfx.wall(); } }
  if (b.y < BR) { b.y = BR; if (b.vy < 0) b.vy = -b.vy * E_WALL; }
  hitCircle(b, cannon.x, cannon.y, 24, 0.6);
  const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
  if (gx >= 0 && gy >= 0 && gx < GC && gy < GR) {
    for (const p of grid[gx + gy * GC]) {
      if (p.gone) continue;
      const imp = hitPeg(b, p);
      if (imp === false) continue;
      if (real) onPegHit(b, p, imp); else if (onHit) onHit(p);
    }
  }
  if (real) {
    // 桶子：兩側邊緣是實體，掉進中間＝免費再一顆
    const L = bucket.x - bucket.w / 2, R = bucket.x + bucket.w / 2, y = bucket.y;
    if (b.y > y - 20 && b.y < y + 40 && b.x > L - 20 && b.x < R + 20) {
      hitCapsule(b, L, y, L + 8, y + 26, 4, 0.5);
      hitCapsule(b, R, y, R - 8, y + 26, 4, 0.5);
      if (b.y > y + 6 && b.vy > 0 && b.x > L + 8 && b.x < R - 8) return 'bucket';
    }
  }
  if (b.y > H + 16) return 'out';
  return null;
}
let simStats = null;
const LIVE = window.__live = { shots: 0, pegs: 0, caught: 0, bucket: 0, clears: 0, t0: performance.now(), log: [] };   // 實際遊玩的統計（測試用）
function stepReal(b, h) {
  const r = stepBall(b, h, true);
  if (!(isFinite(b.x) && isFinite(b.y) && isFinite(b.vx) && isFinite(b.vy))) { if (simStats) simStats.nan++; console.warn('ball NaN'); return 'out'; }
  if (r) return r;
  b.age += h;
  // 卡珠保險：慢太久就把旁邊亮著的釘子先清掉，沒有可清的就推一下
  if (Math.hypot(b.vx, b.vy) < 40) b.slowT += h; else b.slowT = Math.max(0, b.slowT - h * 2);
  if (b.slowT > 1.0) { b.slowT = 0; unstick(b, 34); }
  if (b.age > 22 && !b.late) { b.late = true; unstick(b, 140); }
  if (b.age > 35) { if (simStats) simStats.timeouts++; return 'out'; }
  return null;
}
function unstick(b, range) {
  const near = pegs.filter(p => p.lit && !p.gone && (p.shape === 'c' ? Math.hypot(p.x - b.x, p.y - b.y) - p.r : segDist(b.x, b.y, p.x1, p.y1, p.x2, p.y2) - p.th) < BR + range);
  if (near.length) { near.forEach(p => popNow(p)); if (simStats) simStats.unstickPop++; }
  else { b.vx += rand(-1, 1) * 160; b.vy -= 120; if (simStats) simStats.unstickKick++; }
}
function popNow(p) { p.gone = true; p.dying = 0; if (!SIM) { sfx.pop(4); burst(p.x, p.y, pegColor(p), 8); } }

function onPegHit(b, p, imp) {
  if (b.slowT > 0.3) b.vx += rand(-1, 1) * 20;   // 只有快卡住時才抖一下，平常物理是確定的（自動連發的預測才準）
  // 冬天：釘子結冰，反彈 ×1.2、方向亂偏 ±15°
  if (G.season === 3 && p.kind !== 'dragon' && imp > 50 && time - (p.iceT || -1) > 0.08) {
    p.iceT = time;
    const a = rand(-1, 1) * Math.PI / 12, c = Math.cos(a), s = Math.sin(a);
    const vx = (b.vx * c - b.vy * s) * 1.2, vy = (b.vx * s + b.vy * c) * 1.2;
    b.vx = vx; b.vy = vy;
    if (!SIM) { sfx.ice(); burst(b.x, b.y, '#e8f8ff', 5, 0.6); }
  }
  p.f = 1;
  if (p.lit) { if (imp > 60) sfx.tick(); return; }
  p.lit = true; p.litT = time;
  shot.lit.push(p); shot.hits++;
  sfx.peg(shot.hits);
  if (!SIM) burst(p.x, p.y, pegColor(p), p.kind === 'blue' ? 5 : 10);
  if (p.kind === 'poke') {
    shot.caught.push({ id: p.id });
    sfx.poke();
    if (!SIM) addFloat(p.x, p.y - p.r - 10, P[p.id].zh, '#ffd166');
    if (!board.cleared && !pegs.some(q => q.kind === 'poke' && !q.lit)) feverHit(p);
  } else if (p.kind === 'dragon') {
    shot.caught.push({ id: p.id, dragon: true });
    G.dragonPending = false; G.dragonIdx++;
    if (!SIM) { saveG(); dragonFx(p); }
    else if (simStats) simStats.dragon++;
  }
}

/* ============ 演出：粒子、文字、鏡頭 ============ */
const pegColor = p => p.kind === 'poke' ? '#ff8a1f' : p.kind === 'dragon' ? DRAGON_LOOK[p.id].ring : '#6aa8ff';
function burst(x, y, color, n = 12, sp = 1) {
  if (SIM) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(60, 260) * sp;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: rand(0.4, 0.8), t: 0, color, s: rand(2, 4) });
  }
}
function addFloat(x, y, text, color = '#fff', size = 15) { if (!SIM) floats.push({ x, y, text, color, size, t: 0 }); }
function feverHit(p) {
  board.cleared = true;
  if (shot) shot.cleared = true;
  if (SIM) return;
  feverHold = 1.0; clearFx = 3.2; shakeT = 0.5;
  flashScreen(true);
  sfx.clear(); AU.fever(true);
  const S = SEASONS[G.season];
  burst(p.x, p.y, S.acc, 50, 1.6); burst(p.x, p.y, '#ffffff', 30, 1.3); burst(p.x, p.y, '#ff8a1f', 30, 1.1);
  document.documentElement.style.setProperty('--accA', `rgba(${S.rgb},.7)`);
}
function dragonFx(p) {
  const L = DRAGON_LOOK[p.id];
  flashScreen(false); sfx.thunder(); shakeT = 0.7;
  for (let i = 0; i < 4; i++) bolts.push({ x0: rand(30, W - 30), x1: p.x, y1: p.y, t: 0, life: 0.5 + i * 0.12, color: L.bolt });
  burst(p.x, p.y, L.bolt, 40, 1.5); burst(p.x, p.y, '#ffffff', 20, 1.2);
  addFloat(p.x, p.y - 44, '傳說的龍！', L.bolt, 22);
}
function flashScreen(rainbow) {
  const f = $('flash'); f.classList.remove('go'); f.classList.toggle('rainbow', !!rainbow); void f.offsetWidth; f.classList.add('go');
}

/* ---------- 季節環境粒子（畫面座標） ---------- */
function seedAmbient() {
  ambient = [];
  const n = [36, 26, 30, 80][G.season];
  for (let i = 0; i < n; i++) ambient.push(newAmb(true));
}
function newAmb(anyY) {
  const s = G.season;
  const a = { x: Math.random() * W, y: anyY ? Math.random() * H : -10, ph: Math.random() * 6.28, rot: Math.random() * 6.28 };
  if (s === 0) Object.assign(a, { vy: rand(22, 45), vx: rand(8, 26), sz: rand(3, 5.5), spin: rand(-2, 2) });
  if (s === 1) Object.assign(a, { y: anyY ? Math.random() * H : H + 10, vy: -rand(6, 18), vx: rand(-8, 8), sz: rand(1.5, 3) });
  if (s === 2) Object.assign(a, { vy: rand(30, 55), vx: rand(-15, 15), sz: rand(5, 8), spin: rand(-2.5, 2.5) });
  if (s === 3) Object.assign(a, { vy: rand(25, 70), vx: rand(-10, 10), sz: rand(1, 3) });
  return a;
}
function updateAmbient(dt) {
  const s = G.season;
  for (let i = 0; i < ambient.length; i++) {
    const a = ambient[i];
    a.ph += dt; a.rot += (a.spin || 0) * dt;
    a.x += (a.vx + Math.sin(a.ph * 1.3) * (s === 1 ? 14 : 18)) * dt; a.y += a.vy * dt;
    if (a.y > H + 12 || a.y < -14 || a.x < -20 || a.x > W + 20) ambient[i] = newAmb(false);
  }
}
function drawAmbient() {
  const s = G.season;
  for (const a of ambient) {
    ctx.save(); ctx.translate(a.x, a.y);
    if (s === 0) { ctx.rotate(a.rot); ctx.fillStyle = 'rgba(255,170,200,.75)'; ctx.beginPath(); ctx.ellipse(0, 0, a.sz, a.sz * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (s === 1) { const al = 0.35 + 0.35 * Math.sin(a.ph * 3); ctx.fillStyle = `rgba(200,255,140,${al})`; ctx.beginPath(); ctx.arc(0, 0, a.sz * 2.2, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = `rgba(240,255,200,${al + 0.3})`; ctx.beginPath(); ctx.arc(0, 0, a.sz * 0.7, 0, Math.PI * 2); ctx.fill(); }
    else if (s === 2) { ctx.rotate(a.rot); ctx.fillStyle = 'rgba(255,120,50,.8)'; leaf(a.sz); }
    else { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(0, 0, a.sz, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
function leaf(r) {   // 楓葉
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}

/* ============ 回合流程 ============ */
let timers = [];
const pauses = new Set();
const paused = () => pauses.size > 0;
function waitTap(ms, el) {
  return new Promise(res => {
    let done = false;
    const fin = () => { if (done) return; done = true; if (el) el.removeEventListener('pointerdown', fin); res(); };
    timers.push({ t: ms / 1000, r: fin });
    if (el) el.addEventListener('pointerdown', fin);
  });
}
const wait = ms => waitTap(ms, null);

function fire(a) {
  if (state !== 'ready' || ball) return;
  a = clamp(a, -MAXA, MAXA);
  cannon.a = cannon.ta = a;
  ball = newBall(a);
  shot = { hits: 0, lit: [], caught: [], cleared: false };
  state = 'flying'; acc = 0; autoT = 0; autoAim = null; cannon.recoil = 1;
  if (simStats) simStats.shots++; else LIVE.log.push({ fire: +time.toFixed(1) });
  if (!SIM) { sfx.shoot(); burst(ball.x, ball.y, '#ffffff', 8, 0.6); }
}

async function endShot(how) {
  const b = ball; ball = null; state = 'post';
  if (SIM) return simEnd(how);
  Object.assign(LIVE.log[LIVE.log.length - 1] || {}, { end: +time.toFixed(1), n: shot.caught.length, sp: shot.caught.map(c => P[c.id].tier).join('') });
  LIVE.shots++; LIVE.pegs += shot.lit.length; LIVE.caught += shot.caught.length; if (how === 'bucket') LIVE.bucket++;
  try {
    if (how === 'bucket') {
      sfx.bucket(); bucket.f = 1;
      addFloat(bucket.x, bucket.y - 30, 'FREE BALL!', '#ffffff', 26);
      burst(bucket.x, bucket.y, SEASONS[G.season].acc, 30, 1.2); burst(bucket.x, bucket.y, '#ffd166', 20, 1.1);
      await wait(650);
    }
    await wait(200);
    await popLit();
    const items = shot.caught;
    if (items.length) {
      items.forEach(it => { it.shiny = Math.random() < SHINY_RATE; const r = C.add(it.id, it.shiny); it.isNew = r.isNew; it.tier = P[it.id].tier; });
      refreshUI();
      await revealCatches(items);
    }
    const evos = C.evolve();
    if (evos.length) await showEvos(evos);
    if (board.cleared) await seasonClear();
  } catch (e) { console.error(e); }
  $('catch').classList.remove('show');
  $('spot').className = 'spot';
  refreshUI();
  Object.assign(LIVE.log[LIVE.log.length - 1] || {}, { done: +time.toFixed(1) });
  state = 'ready'; autoT = 0; autoAim = null;
}
async function popLit() {
  const lit = shot.lit.filter(p => !p.gone);
  const gap = lit.length > 18 ? 35 : 60;
  for (let i = 0; i < lit.length; i++) {
    const p = lit[i];
    p.gone = true; p.dying = 0;
    sfx.pop(i);
    burst(p.x, p.y, pegColor(p), p.kind === 'blue' ? 6 : 14);
    if (p.kind !== 'blue') flyers.push({ id: p.id, x: p.x, y: p.y, t: 0 });
    await wait(gap);
  }
  if (lit.length) await wait(280);
}

/* ---------- 揭曉 ---------- */
const isSpecial = it => it.shiny || it.tier === 'srare' || it.tier === 'legend';
function badges(it) {
  const b = [];
  if (it.isNew) b.push('<span class="badge new">NEW</span>');
  if (it.shiny) b.push('<span class="badge shiny">閃光</span>');
  if (it.tier !== 'common') b.push(`<span class="badge ${it.tier}">${C.tierName(it.id)}</span>`);
  return b.join('');
}
function sizeCards(n) {
  const wr = $('boardWrap'), w = wr.clientWidth - 32, h = wr.clientHeight - 160;
  let best = 60;
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c), cw = Math.min((w - 10 * (c - 1)) / c, ((h - 10 * (rows - 1)) / rows) * 0.8, 150);
    best = Math.max(best, cw);
    if (cw >= best) $('cGrid').style.gridTemplateColumns = `repeat(${c}, auto)`;
  }
  $('cGrid').style.setProperty('--cw', Math.floor(best) + 'px');
}
async function revealCatches(items) {
  const order = { legend: 0, srare: 1, rare: 2, common: 3 };
  const list = items.slice().sort((a, b) => (order[b.tier] - order[a.tier]) || (a.shiny - b.shiny));
  const ov = $('catch');
  $('cTitle').textContent = list.some(i => i.tier === 'legend') ? 'LEGEND!' : 'GET!';
  $('cSub').textContent = `抓到 ${list.length} 隻`;
  $('cGrid').innerHTML = list.map(it => `<div class="cc sil ${isSpecial(it) ? 'hot' : ''}"><span class="no">#${pad3(C.no(it.id))}</span><div class="bd">${badges(it)}</div>
    <img src="${C.img(it.id, it.shiny)}" alt=""><div class="nm">${it.shiny ? '✨' : ''}${P[it.id].zh}</div></div>`).join('');
  sizeCards(list.length);
  ov.classList.add('show');
  let skip = false;
  const onTap = () => { skip = true; };
  ov.addEventListener('pointerdown', onTap);
  const w = ms => skip ? Promise.resolve() : waitTap(ms, ov);
  await w(420);
  const cards = [...$('cGrid').children];
  const stepMs = clamp(900 / list.length, 110, 260);
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (isSpecial(it)) { await spotlight(it); }
    else { sfx.ding(C.tierRank(it.id)); if (it.tier === 'rare') sfx.sparkle(); }
    cards[i].classList.remove('sil', 'hot'); cards[i].classList.add('open', it.tier);
    if (it.shiny) cards[i].classList.add('isshiny');
    await w(stepMs);
  }
  skip = false;
  await waitTap(1000, ov);
  ov.removeEventListener('pointerdown', onTap);
  ov.classList.remove('show');
  await wait(220);
}
async function showEvos(evos) {
  const ov = $('catch');
  $('cTitle').textContent = '進化！';
  $('cSub').textContent = '同一種集滿 3 隻';
  $('cGrid').style.gridTemplateColumns = '1fr';
  $('cGrid').innerHTML = evos.map(e => `<div class="evrow"><img src="${C.img(e.from)}" alt=""><span class="x">×3</span><span class="ar">➜</span>
    <img src="${C.img(e.to)}" alt=""><span>${P[e.to].zh}</span>${e.isNew ? '<span class="badge new">NEW</span>' : ''}</div>`).join('');
  ov.classList.add('show');
  sfx.evo(); flashScreen(false);
  await waitTap(2000 + evos.length * 300, ov);
  ov.classList.remove('show');
  await wait(220);
}
async function spotlight(it, tag) {
  const sp = $('spot'), legend = it.tier === 'legend';
  const hint = legend ? '⚡ 傳說反應！！！' : it.shiny ? '✨ 閃光反應！！' : tag || (it.tier === 'srare' ? '★ 超稀有反應！' : '★ 稀有反應！');
  sp.className = 'spot show' + (legend ? ' legend' : '') + (it.shiny ? ' shiny' : '');
  $('spHint').textContent = hint;
  $('spImg').src = C.img(it.id, it.shiny);
  $('spName').textContent = '？？？';
  $('spMeta').textContent = tag && !legend ? tag : '';
  sfx.drumroll(1.3);
  await wait(1300);
  flashScreen(it.shiny || legend); sfx.flash();
  sp.classList.add('revealed');
  $('spHint').textContent = legend ? '傳說寶可夢' : it.shiny ? '閃光寶可夢' : (tag || C.tierName(it.id) + '寶可夢');
  $('spName').textContent = (it.shiny ? '✨' : '') + P[it.id].zh;
  $('spMeta').innerHTML = `#${pad3(C.no(it.id))} ${badges(it)}`;
  if (legend || it.shiny) sfx.fanfareBig(); else sfx.fanfareRare();
  await waitTap(2900, sp);
  sp.className = 'spot';
  await wait(120);
}

/* ---------- 清台 → 季節獎勵 → 換季 ---------- */
const seasonPool = s => p => p.tier !== 'common' && p.types.some(t => SEASONS[s].types.includes(t));
async function seasonClear() {
  const S = SEASONS[G.season];
  await wait(300);
  const id = C.pick({ boost: 2, filter: seasonPool(G.season) });
  const it = { id, shiny: Math.random() < SHINY_RATE, tier: P[id].tier };
  it.isNew = C.add(id, it.shiny).isNew;
  refreshUI();
  await spotlight(it, `${S.zh}季清台獎勵`);
  const evos = C.evolve();
  if (evos.length) await showEvos(evos);
  G.clears++; G.season = (G.season + 1) % 4; LIVE.clears++;
  if (G.clears % 3 === 0) G.dragonPending = true;
  saveG();
  await seasonTransition();
}
async function seasonTransition() {
  const S = SEASONS[G.season], ov = $('sov');
  $('sovKj').textContent = S.zh; $('sovEn').textContent = S.en;
  $('sovSub').textContent = `第 ${G.clears + 1} 台${G.dragonPending ? '・龍釘出現！' : ''}`;
  ov.style.setProperty('--acc', S.acc);
  ov.classList.remove('show'); void ov.offsetWidth; ov.classList.add('show');
  sfx.season();
  await wait(800);
  applySeason();
  buildBoard(true);
  if (G.dragonPending) toast('⚡ 龍釘出現了！打到就能抓到傳說的龍');
  await wait(1200);
  ov.classList.remove('show');
}
function applySeason() {
  const S = SEASONS[G.season], st = document.documentElement.style;
  st.setProperty('--acc', S.acc); st.setProperty('--acc2', S.acc2); st.setProperty('--accA', `rgba(${S.rgb},.35)`);
  document.querySelector('meta[name=theme-color]').content = '#0d0d0f';
  AU.setSeason(G.season); AU.fever(false);
  seedAmbient(); buildBG();
}

/* ---------- 自動連發：抽幾個隨機角度，挑預測路徑最有料的 ---------- */
const AUTO_DELAY = 0.55;
function predictShot(a, maxT = 7) {
  const b = newBall(a), hit = new Set();
  for (let t = 0; t < maxT; t += HSTEP) if (stepBall(b, HSTEP, false, p => hit.add(p))) break;
  let poke = 0, dragon = 0, blue = 0;
  hit.forEach(p => { if (p.kind === 'poke') poke++; else if (p.kind === 'dragon') dragon++; else blue++; });
  return { poke, dragon, blue };
}
function chooseAutoAngle() {
  let best = null;
  for (let k = 0; k < 7; k++) {
    const a = rand(-1.3, 1.3), r = predictShot(a);
    const score = r.poke * 10 + r.dragon * 30 + r.blue * 0.6 + Math.random() * 3;
    if (!best || score > best.score) best = { a, score };
  }
  return best;
}

/* ============ 主迴圈 ============ */
function update(rdt) {
  time += rdt;
  if (paused()) return;
  for (const tm of timers.slice()) { tm.t -= rdt; if (tm.t <= 0) { timers.splice(timers.indexOf(tm), 1); tm.r(); } }
  board.t += rdt;

  // 最後一顆橘釘：慢動作＋鏡頭放大
  let slowWant = false, focus = null;
  if (ball && !board.cleared) {
    const rem = pegs.filter(p => p.kind === 'poke' && !p.lit);
    if (rem.length === 1) {
      const p = rem[0], dx = p.x - ball.x, dy = p.y - ball.y, d = Math.hypot(dx, dy);
      if (d < 100 && dx * ball.vx + dy * ball.vy > 0) { slowWant = true; focus = p; }
    }
  }
  if (feverHold > 0) { feverHold -= rdt; slowWant = true; }
  timeScale += ((slowWant ? 0.16 : 1) - timeScale) * Math.min(1, rdt * (slowWant ? 9 : 4));
  if (slowWant && !slowOn && !board.cleared) sfx.slow();
  slowOn = slowWant;
  const dt = rdt * timeScale;

  // 砲台
  cannon.a += (cannon.ta - cannon.a) * Math.min(1, rdt * 9);
  cannon.recoil = Math.max(0, cannon.recoil - rdt * 4);
  if (state === 'ready' && G.auto && !pointerDown && board.t > 1.1) {
    autoT += rdt;
    if (autoT > AUTO_DELAY && !autoAim) { autoAim = chooseAutoAngle(); cannon.ta = autoAim.a; }
    if (autoAim && autoT > AUTO_DELAY + 0.45 && Math.abs(cannon.a - cannon.ta) < 0.02) fire(cannon.ta);
  }

  // 珠
  if (ball) {
    acc += dt;
    let n = 0;
    while (ball && acc >= HSTEP && n < 60) {
      acc -= HSTEP; n++;
      const r = stepReal(ball, HSTEP);
      if (r) { endShot(r); break; }
    }
    if (ball) { ball.trail.push(ball.x, ball.y); if (ball.trail.length > 24) ball.trail.splice(0, 2); }
  }
  // 桶子左右來回
  bucket.t += dt;
  bucket.x = W / 2 + Math.sin(bucket.t * 0.85) * (W / 2 - bucket.w / 2 - 12);
  bucket.f = Math.max(0, bucket.f - rdt * 1.5);

  for (const p of pegs) {
    if (p.f > 0) p.f = Math.max(0, p.f - rdt * 3);
    if (p.dying >= 0 && p.dying < 1) p.dying = Math.min(1, p.dying + rdt * 4);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.t += dt;
    if (q.t > q.life) { parts.splice(i, 1); continue; }
    q.vy += 500 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.98;
  }
  for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += rdt; floats[i].y -= 30 * rdt; if (floats[i].t > 1.3) floats.splice(i, 1); }
  for (let i = flyers.length - 1; i >= 0; i--) { flyers[i].t += rdt; if (flyers[i].t > 0.8) flyers.splice(i, 1); }
  for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t += rdt; if (bolts[i].t > bolts[i].life) bolts.splice(i, 1); }
  clearFx = Math.max(0, clearFx - rdt);
  shakeT = Math.max(0, shakeT - rdt);
  updateAmbient(rdt);

  // 鏡頭
  let tz = 1, tx = W / 2, ty = H / 2;
  if (slowWant && ball) {
    const f = focus || ball;
    tz = 1.9; tx = (ball.x + f.x) / 2; ty = (ball.y + f.y) / 2;
  }
  const k = Math.min(1, rdt * (tz > cam.z ? 6 : 3));
  cam.z += (tz - cam.z) * k; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
}

/* ============ 畫面 ============ */
const cv = $('cv'), ctx = cv.getContext('2d'), wrapEl = $('boardWrap');
let scale = 1, dpr = 1, BG = null;
function fit() {
  const w = wrapEl.clientWidth, h = wrapEl.clientHeight;
  if (!w || !h) return;
  const nh = Math.round(clamp(W * h / w, 700, 900));
  if (nh !== H) { H = nh; relayout(); }
  bucket.y = H - 44;
  if (cam.z === 1) cam.y = H / 2;
  scale = Math.min((w - 8) / W, (h - 8) / H);
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.style.width = Math.floor(W * scale) + 'px'; cv.style.height = Math.floor(H * scale) + 'px';
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
  buildBG();
}
// 背板：黑底＋飛雲市天際線，窗戶是季節色
function buildBG() {
  const S = SEASONS[G.season];
  BG = document.createElement('canvas');
  BG.width = cv.width || W; BG.height = cv.height || H;
  const g = BG.getContext('2d');
  g.setTransform(BG.width / W, 0, 0, BG.height / H, 0, 0);
  const lg = g.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, '#0e0e11'); lg.addColorStop(1, '#16161b');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  // 左上白斜角（黑白雙色）
  g.fillStyle = 'rgba(255,255,255,.035)';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.62, 0); g.lineTo(0, H * 0.55); g.closePath(); g.fill();
  // 月亮／太陽
  const rg = g.createRadialGradient(W * 0.8, H * 0.2, 10, W * 0.8, H * 0.2, 150);
  rg.addColorStop(0, `rgba(${S.rgb},.16)`); rg.addColorStop(1, `rgba(${S.rgb},0)`);
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  g.strokeStyle = `rgba(${S.rgb},.18)`; g.lineWidth = 2;
  g.beginPath(); g.arc(W * 0.8, H * 0.2, 46, 0, Math.PI * 2); g.stroke();
  // 砲台光
  const cg = g.createRadialGradient(W / 2, 0, 10, W / 2, 0, 200);
  cg.addColorStop(0, 'rgba(255,255,255,.08)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = cg; g.fillRect(0, 0, W, 220);
  // 天際線
  let seed = 7 + G.season * 13;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let layer = 0; layer < 2; layer++) {
    let x = -10;
    while (x < W + 10) {
      const bw = 18 + rnd() * 34, bh = (layer ? 60 : 110) + rnd() * (layer ? 90 : 170);
      const top = H - bh;
      g.fillStyle = layer ? '#1d1d24' : '#141419';
      g.fillRect(x, top, bw, bh);
      if (rnd() < 0.3) g.fillRect(x + bw / 2 - 1, top - 16, 2, 16);
      g.fillStyle = `rgba(${S.rgb},${layer ? 0.22 : 0.12})`;
      for (let wy = top + 8; wy < H - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (rnd() < 0.28) g.fillRect(wx, wy, 3, 4);
      x += bw + 2 + rnd() * 6;
    }
  }
  // 底部霧
  const fg = g.createLinearGradient(0, H - 200, 0, H);
  fg.addColorStop(0, 'rgba(14,14,17,0)'); fg.addColorStop(1, `rgba(${S.rgb},.10)`);
  g.fillStyle = fg; g.fillRect(0, H - 200, W, 200);
  // 側邊白色導軌
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, 3, H); g.fillRect(W - 3, 0, 3, H);
}
const ease = t => 1 - Math.pow(1 - t, 3);
const back = t => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
function drawPeg(p) {
  let s = 1, al = 1;
  if (p.appear >= 0) { const t = clamp((board.t - p.appear) / 0.35, 0, 1); if (t <= 0) return; s = back(t); }
  if (p.gone) { if (p.dying < 0 || p.dying >= 1) return; s *= 1 + p.dying * 0.7; al = 1 - p.dying; }
  const winter = G.season === 3, pulse = 0.5 + 0.5 * Math.sin(time * 8);
  ctx.save(); ctx.globalAlpha = al;
  if (p.shape === 's') {
    ctx.translate(p.x, p.y); ctx.scale(s, s); ctx.translate(-p.x, -p.y);
    ctx.lineCap = 'round';
    if (p.lit) { ctx.strokeStyle = 'rgba(140,200,255,.35)'; ctx.lineWidth = p.th * 2 + 10; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); }
    ctx.strokeStyle = p.lit ? '#cfe6ff' : '#2f6fe0'; ctx.lineWidth = p.th * 2;
    ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
    ctx.strokeStyle = p.lit ? '#fff' : winter ? 'rgba(235,250,255,.85)' : 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x1, p.y1 - 2); ctx.lineTo(p.x2, p.y2 - 2); ctx.stroke();
    ctx.restore(); return;
  }
  ctx.translate(p.x, p.y); ctx.scale(s * (1 + p.f * 0.15), s * (1 + p.f * 0.15));
  const r = p.r;
  if (p.kind === 'blue') {
    if (p.lit) { ctx.fillStyle = 'rgba(140,200,255,.3)'; ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = p.lit ? '#cfe6ff' : '#2f6fe0';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill();
  } else if (p.kind === 'poke') {
    const im = pimg(p.id);
    if (p.lit) { ctx.fillStyle = `rgba(255,209,102,${0.3 + pulse * 0.25})`; ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = p.lit ? '#fff7dc' : '#f4f3ee';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (im.complete && im.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.clip();
      const z = r * 2.3; ctx.drawImage(im, -z / 2, -z / 2 - 1, z, z); ctx.restore();
    }
    ctx.strokeStyle = p.lit ? '#ffd166' : '#ff8a1f'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  } else {
    const L = DRAGON_LOOK[p.id], im = pimg(p.id);
    const gl = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r + 26);
    gl.addColorStop(0, L.glow + (0.5 + pulse * 0.3) + ')'); gl.addColorStop(1, L.glow + '0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, r + 26, 0, Math.PI * 2); ctx.fill();
    // 閃電弧
    ctx.strokeStyle = L.bolt; ctx.lineWidth = 2; ctx.globalAlpha = al * (0.5 + 0.5 * Math.random());
    for (let k = 0; k < 3; k++) {
      let a = Math.random() * Math.PI * 2; ctx.beginPath();
      for (let j = 0; j < 5; j++) { const rr = r + 3 + Math.random() * 12; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); a += 0.18; }
      ctx.stroke();
    }
    ctx.globalAlpha = al;
    ctx.fillStyle = L.core; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (im.complete && im.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, Math.PI * 2); ctx.clip();
      const z = r * 2.4; ctx.drawImage(im, -z / 2, -z / 2, z, z); ctx.restore();
    }
    ctx.strokeStyle = L.ring; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  }
  if (winter && p.kind !== 'dragon') {   // 結冰
    ctx.strokeStyle = 'rgba(235,250,255,.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r + 1.5, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    ctx.fillStyle = 'rgba(220,245,255,.18)'; ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, Math.PI * 2); ctx.fill();
    const tw = 0.5 + 0.5 * Math.sin(time * 3 + p.x);
    ctx.fillStyle = `rgba(255,255,255,${tw})`; ctx.fillRect(r * 0.45 - 0.5, -r * 0.75 - 3, 1, 6); ctx.fillRect(r * 0.45 - 3, -r * 0.75 - 0.5, 6, 1);
  }
  ctx.restore();
}
function drawCannon() {
  const S = SEASONS[G.season];
  ctx.save(); ctx.translate(cannon.x, cannon.y);
  ctx.save(); ctx.rotate(-cannon.a);
  const L = 44 - cannon.recoil * 8;
  ctx.fillStyle = '#f4f3ee'; ctx.strokeStyle = '#0d0d0f'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.rect(-9, 0, 18, L); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0d0d0f'; ctx.fillRect(-9, L * 0.45, 18, 5);
  ctx.fillStyle = S.acc; ctx.fillRect(-10, L - 8, 20, 8); ctx.strokeRect(-10, L - 8, 20, 8);
  if (state === 'ready' && !ball) { ctx.fillStyle = '#e8e8ee'; ctx.beginPath(); ctx.arc(0, L + 1, BR, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // 底座：黑白半圓
  ctx.lineWidth = 3; ctx.strokeStyle = '#0d0d0f';
  ctx.fillStyle = '#f4f3ee'; ctx.beginPath(); ctx.arc(0, 0, 26, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  ctx.fillStyle = '#0d0d0f'; ctx.beginPath(); ctx.arc(0, 0, 26, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.strokeStyle = '#f4f3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = S.acc; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawAim() {
  if (!(state === 'ready' && (pointerDown || autoAim))) return;
  const b = newBall(cannon.ta);
  let stop = false;
  ctx.fillStyle = pointerDown ? '#ffffff' : 'rgba(255,255,255,.45)';
  for (let i = 0; i < 160 && !stop; i++) {
    if (stepBall(b, HSTEP * 2, false, () => { stop = true; })) break;
    if (i % 6 === 0) { ctx.beginPath(); ctx.arc(b.x, b.y, 2.4 - i / 120, 0, Math.PI * 2); ctx.fill(); }
  }
}
function drawBucket() {
  const S = SEASONS[G.season], L = bucket.x - bucket.w / 2, R = bucket.x + bucket.w / 2, y = bucket.y;
  ctx.save();
  if (bucket.f > 0) { ctx.fillStyle = `rgba(${S.rgb},${bucket.f * 0.5})`; ctx.beginPath(); ctx.arc(bucket.x, y + 10, 70 * (1 + (1 - bucket.f)), 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#0d0d0f'; ctx.strokeStyle = '#f4f3ee'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + 8, y + 26); ctx.lineTo(R - 8, y + 26); ctx.lineTo(R, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = S.acc; ctx.fillRect(L + 6, y + 9, bucket.w - 12, 5);
  ctx.fillStyle = '#f4f3ee'; ctx.font = '400 13px "Bebas Neue",Impact,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('FREE BALL', bucket.x, y + 24);
  ctx.restore();
}
function drawBall(b) {
  const S = SEASONS[G.season];
  ctx.strokeStyle = `rgba(${S.rgb},.55)`; ctx.lineCap = 'round';
  for (let i = 2; i < b.trail.length; i += 2) {
    ctx.lineWidth = (i / b.trail.length) * BR * 1.4;
    ctx.beginPath(); ctx.moveTo(b.trail[i - 2], b.trail[i - 1]); ctx.lineTo(b.trail[i], b.trail[i + 1]); ctx.stroke();
  }
  const g = ctx.createRadialGradient(b.x - 2.5, b.y - 2.5, 1, b.x, b.y, BR);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#d9dbe4'); g.addColorStop(1, '#7c7f8c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI * 2); ctx.fill();
}
function txt(t, x, y, size, color, font = 'num', align = 'center') {
  ctx.font = font === 'num' ? `400 ${size}px "Bebas Neue",Impact,sans-serif` : `900 ${size}px "Noto Sans TC",sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = '#0d0d0f'; ctx.strokeText(t, x, y);
  ctx.fillStyle = color; ctx.fillText(t, x, y);
}
function render() {
  const S = SEASONS[G.season];
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  if (BG) ctx.drawImage(BG, 0, 0, W, H); else { ctx.fillStyle = '#0e0e11'; ctx.fillRect(0, 0, W, H); }
  drawAmbient();
  ctx.save();
  let sx = 0, sy = 0;
  if (shakeT > 0) { sx = rand(-1, 1) * shakeT * 10; sy = rand(-1, 1) * shakeT * 10; }
  ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  drawBucket();
  for (const p of pegs) drawPeg(p);
  for (const bo of bolts) {
    ctx.strokeStyle = bo.color; ctx.lineWidth = 3 * (1 - bo.t / bo.life); ctx.globalAlpha = 1 - bo.t / bo.life;
    ctx.beginPath(); ctx.moveTo(bo.x0, 0);
    for (let i = 1; i <= 8; i++) { const t = i / 8; ctx.lineTo(bo.x0 + (bo.x1 - bo.x0) * t + (i < 8 ? rand(-18, 18) : 0), bo.y1 * t); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  drawAim();
  if (ball) drawBall(ball);
  drawCannon();
  for (const q of parts) { ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.color; ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
  ctx.globalAlpha = 1;
  for (const f of flyers) {   // 抓到的寶可夢往上飛
    const t = ease(f.t / 0.8), im = pimg(f.id), z = 30 + 26 * Math.sin(t * Math.PI);
    if (im.complete && im.naturalWidth) { ctx.globalAlpha = 1 - t * 0.6; ctx.drawImage(im, f.x + (W / 2 - f.x) * t - z / 2, f.y + (-30 - f.y) * t - z / 2, z, z); }
  }
  ctx.globalAlpha = 1;
  for (const f of floats) { ctx.globalAlpha = clamp(1.3 - f.t, 0, 1); txt(f.text, f.x, f.y, f.size, f.color, /[A-Z!]/.test(f.text) ? 'num' : 'zh'); }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 慢動作暗角
  if (timeScale < 0.9) {
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${(1 - timeScale) * 0.75})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }
  // 台面上的小字：剩下幾顆寶可夢釘、季節
  const left = pegs.filter(p => p.kind === 'poke' && !p.lit).length;
  ctx.save();
  ctx.fillStyle = '#ff8a1f'; ctx.translate(18, 22); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
  txt(`× ${left}`, 32, 23, 24, '#f4f3ee', 'num', 'left');
  txt(`${S.en} ${S.zh}`, W - 14, 23, 22, S.acc, 'zh', 'right');
  txt(`#${G.clears + 1}`, W - 14, 46, 18, '#f4f3ee', 'num', 'right');
  if (clearFx > 0) {
    const t = 3.2 - clearFx, a = clamp(clearFx / 0.6, 0, 1), sc = t < 0.3 ? back(t / 0.3) : 1;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.42); ctx.scale(sc, sc); ctx.rotate(-0.06);
    ctx.fillStyle = S.acc; ctx.fillRect(-W, -36, W * 2, 72);
    txt('UNOVA CLEAR!', 0, -2, 64, '#ffffff');
    txt('清台！季節獎勵準備中', 0, 46, 18, '#ffffff', 'zh');
    ctx.restore();
  }
}

/* ============ 輸入 ============ */
function aimAt(e) {
  const r = cv.getBoundingClientRect();
  const x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
  cannon.ta = clamp(Math.atan2(x - cannon.x, y - cannon.y), -MAXA, MAXA);
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); AU.init();
  if (state !== 'ready' || paused()) return;
  pointerDown = true; autoAim = null; autoT = 0; aimAt(e);
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
});
cv.addEventListener('pointermove', e => { if (pointerDown) aimAt(e); });
cv.addEventListener('pointerup', e => {
  if (!pointerDown) return;
  pointerDown = false; aimAt(e);
  if (state === 'ready' && !paused()) fire(cannon.ta);
});
cv.addEventListener('pointercancel', () => { pointerDown = false; });
window.addEventListener('keydown', e => {
  if ($('mDex').classList.contains('show')) {
    if (e.key === 'ArrowRight') { dexPage++; renderDex(); }
    if (e.key === 'ArrowLeft') { dexPage--; renderDex(); }
    if (e.key === 'Escape') closeDex();
    return;
  }
  if (e.key === 'p' || e.key === 'P') togglePause();
  if (state !== 'ready' || paused()) return;
  if (e.key === 'ArrowLeft') cannon.ta = clamp(cannon.ta + 0.06, -MAXA, MAXA);
  if (e.key === 'ArrowRight') cannon.ta = clamp(cannon.ta - 0.06, -MAXA, MAXA);
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); AU.init(); fire(cannon.ta); }
});
document.addEventListener('pointerdown', () => AU.init(), { passive: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) AU.suspend(); else AU.resume(); });

/* ============ 介面 ============ */
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }
function setK(k, v) { document.querySelectorAll(`[data-k="${k}"]`).forEach(e => { e.textContent = v; }); }
function refreshUI() {
  const S = SEASONS[G.season], dc = C.count();
  setK('dex', dc); setK('shiny', C.shinyCount());
  setK('skj', S.zh); setK('sen', S.en); setK('sno', `第 ${G.clears + 1} 台`); setK('sno2', `#${G.clears + 1}`); setK('sfx', S.fx);
  document.querySelectorAll('[data-bar="dex"]').forEach(e => { e.style.width = (dc / TOTAL * 100).toFixed(1) + '%'; });
  $('deer').src = C.img(S.deer);
  const pk = pegs.filter(p => p.kind === 'poke'), left = pk.filter(p => !p.lit).length;
  setK('left', left);
  $('dots').innerHTML = pk.map((p, i) => `<i class="${i < left ? '' : 'off'}"></i>`).join('');
  const toNext = 3 - (G.clears % 3);
  setK('dragonHint', G.dragonPending ? '⚡ 現在台上有龍釘！' : `再清 ${toNext} 台出現`);
  $('drag').innerHTML = DRAGONS.map(id => `<div class="${C.has(id) ? 'got' : ''}"><img src="${C.img(id)}" alt=""><span>${C.has(id) ? P[id].zh : '？？？'}</span></div>`).join('');
  renderRecent();
  syncSwitches();
}
function renderRecent() {
  const rc = C.recent();
  $('recent').innerHTML = rc.slice(0, 16).map(r => `<div class="${r.s ? 's' : ''}"><img src="${C.img(r.id, r.s)}" alt="" title="${P[r.id].zh}"></div>`).join('') || '<div class="empty">還沒有抓到寶可夢，打亮橘色釘子吧！</div>';
  $('rcList').innerHTML = rc.map(r => `<div class="${r.s ? 's' : ''}"><img src="${C.img(r.id, r.s)}" alt="">${r.s ? '✨' : ''}${P[r.id].zh}</div>`).join('') || '<div class="empty">還沒有抓到寶可夢</div>';
}
function syncSwitches() {
  $('swAuto').classList.toggle('on', G.auto); $('swMusic').classList.toggle('on', G.music); $('swSfx').classList.toggle('on', G.sfx);
  $('bAuto').classList.toggle('on', G.auto);
  $('bMusic').classList.toggle('off', !G.music); $('bSfx').classList.toggle('off', !G.sfx);
  const up = pauses.has('user');
  $('bPause').classList.toggle('on', up); $('pPause').classList.toggle('on', up);
  $('bPause').firstChild.textContent = up ? '▶' : '⏸';
  $('pPause').textContent = up ? '▶ 繼續' : '⏸ 暫停';
  $('pov').classList.toggle('show', up);
}
function pause(r) { pauses.add(r); pointerDown = false; syncSwitches(); }
function resume(r) { pauses.delete(r); syncSwitches(); }
function togglePause() { pauses.has('user') ? resume('user') : pause('user'); }
const toggleAuto = () => { G.auto = !G.auto; autoT = 0; autoAim = null; saveG(); syncSwitches(); toast(G.auto ? '🔁 自動連發：開' : '自動連發：關（自己瞄準射吧）'); };
const toggleMusic = () => { G.music = !G.music; AU.init(); AU.setMusic(G.music); saveG(); syncSwitches(); };
const toggleSfx = () => { G.sfx = !G.sfx; AU.init(); AU.setSfx(G.sfx); saveG(); syncSwitches(); };
const goHome = () => { saveG(); location.href = '../'; };
const tap = (id, fn) => $(id).addEventListener('click', fn);
tap('bHome', goHome); tap('pHome', goHome);
tap('bDex', () => openDex()); tap('pDex', () => openDex());
tap('bRecent', () => { pause('recent'); renderRecent(); $('mRecent').classList.add('show'); });
tap('rcClose', () => { $('mRecent').classList.remove('show'); resume('recent'); });
tap('bAuto', toggleAuto); tap('swAuto', toggleAuto);
tap('bPause', togglePause); tap('pPause', togglePause); tap('pov', () => resume('user'));
tap('bMusic', toggleMusic); tap('swMusic', toggleMusic);
tap('bSfx', toggleSfx); tap('swSfx', toggleSfx);

/* ---------- 圖鑑（分頁、點閃光切換） ---------- */
let dexFilter = 'all', dexPage = 0;
const shinyView = new Set();
function openDex() {
  pause('dex'); dexPage = 0;
  $('mDex').classList.add('show');
  const legends = POKEDEX.filter(p => p.tier === 'legend');
  $('dxSt').innerHTML = `已登錄 <b>${C.count()}</b>/${TOTAL}　閃光 <b>${C.shinyCount()}</b>　傳說 <b>${legends.filter(p => C.has(p.id)).length}</b>/${legends.length}`;
  requestAnimationFrame(renderDex);
}
function closeDex() { $('mDex').classList.remove('show'); resume('dex'); }
function renderDex() {
  const gridEl = $('dxGrid'), box = gridEl.parentElement;
  const w = box.clientWidth - 20, h = box.clientHeight - 20;
  const cols = Math.max(3, Math.floor((w + 6) / 86)), rows = Math.max(2, Math.floor((h + 6) / 104));
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
    return `<div class="dcell ${e.got ? '' : 'miss'} ${sh ? 'sh' : ''} ${e.gotS ? 'hasS' : ''}" data-id="${p.id}"><span class="n">#${pad3(C.no(p.id))}</span>
      ${e.got ? `<span class="c">×${(e.n || 0) + (e.s || 0)}</span>` : ''}${e.gotS ? '<span class="st">✨</span>' : ''}
      <img src="${C.img(p.id, sh)}" alt="" loading="lazy"><div class="nm">${e.got ? p.zh : '？？？'}</div></div>`;
  }).join('') || '<div class="rlist"><div class="empty">還沒有符合的寶可夢</div></div>';
  $('dxPage').textContent = `${dexPage + 1}/${pages}`;
}
$('dxGrid').addEventListener('click', e => {
  const c = e.target.closest('.dcell'); if (!c) return;
  const id = +c.dataset.id;
  if (!(C.store.dex[id] && C.store.dex[id].gotS)) return;
  shinyView.has(id) ? shinyView.delete(id) : shinyView.add(id);
  renderDex();
});
$('dxTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]'); if (!b) return;
  dexFilter = b.dataset.f; dexPage = 0;
  $('dxTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderDex();
});
tap('dxPrev', () => { dexPage--; renderDex(); });
tap('dxNext', () => { dexPage++; renderDex(); });
tap('dxClose', closeDex);
let swipeX = null;
$('dxGrid').addEventListener('pointerdown', e => { swipeX = e.clientX; });
$('dxGrid').addEventListener('pointerup', e => {
  if (swipeX === null) return;
  const dx = e.clientX - swipeX; swipeX = null;
  if (Math.abs(dx) > 50) { dexPage += dx < 0 ? 1 : -1; renderDex(); }
});
window.addEventListener('resize', () => { fit(); if ($('mDex').classList.contains('show')) renderDex(); });

/* ============ 開始 ============ */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
applySeason();
fit();
buildBoard(true);
seedAmbient();
refreshUI();
state = 'ready';
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => buildBG());
requestAnimationFrame(frame);

/* ============ 測試工具 ============ */
// __sim(秒數)：不畫面、不存檔，用自動連發跑物理，檢查卡珠／NaN／清台速度。
// 「估計實際秒數」把演出時間也算進去（瞄準 1 秒、每顆亮釘 0.06 秒、揭曉每次約 2.4 秒、清台約 9 秒）。
function simEnd(how) {
  const st = simStats;
  st.maxShot = Math.max(st.maxShot, st.curAge || 0);
  const lit = shot.lit.filter(p => !p.gone);
  lit.forEach(p => { p.gone = true; });
  st.est += 0.45 + lit.length * 0.06 + (shot.caught.length ? 2.4 : 0) + (how === 'bucket' ? 0.65 : 0);
  st.catches += shot.caught.length; if (how === 'bucket') st.bucket++;
  if (board.cleared) {
    st.clears++; st.est += 9;
    if (st.firstClear == null) st.firstClear = Math.round(st.est);
    G.clears++; G.season = (G.season + 1) % 4; if (G.clears % 3 === 0) G.dragonPending = true;
    st.seasons.add(G.season);
    buildBoard(false);
  }
  state = 'ready';
}
window.__sim = function (sec = 120, opt = {}) {
  const keep = { pegs, board, ball, state, shot, G: { ...G }, bucketT: bucket.t };
  const st = simStats = { sec, shots: 0, catches: 0, clears: 0, firstClear: null, dragon: 0, bucket: 0, unstickPop: 0, unstickKick: 0, timeouts: 0, nan: 0, maxShot: 0, est: 0, seasons: new Set([G.season]) };
  SIM = true;
  try {
    if (opt.season != null) G.season = opt.season;
    if (opt.dragon) G.dragonPending = true;
    buildBoard(false); ball = null; state = 'ready';
    let t = 0;
    while (t < sec) {
      if (state === 'ready') { fire(opt.random ? rand(-1.3, 1.3) : chooseAutoAngle().a); st.est += 1.0; }
      bucket.t += HSTEP; bucket.x = W / 2 + Math.sin(bucket.t * 0.85) * (W / 2 - bucket.w / 2 - 12);
      const r = stepReal(ball, HSTEP);
      t += HSTEP; st.est += HSTEP; st.curAge = ball ? ball.age : 0;
      if (r) { st.curAge = ball.age; endShot(r); }
    }
  } finally {
    SIM = false;
    Object.assign(G, keep.G);
    pegs = keep.pegs; board = keep.board; ball = keep.ball; state = keep.state; shot = keep.shot; bucket.t = keep.bucketT;
    rebuildGrid();
    simStats = null;
  }
  st.seasons = [...st.seasons].map(s => SEASONS[s].zh).join('');
  st.est = Math.round(st.est); st.maxShot = +st.maxShot.toFixed(1);
  return st;
};
// 開發用：__dev.clear() 直接清台、__dev.dragon() 下一台出龍釘、__dev.season(i) 切季節
window.__dev = {
  clear() { pegs.forEach(p => { if (p.kind === 'poke') p.lit = true; }); board.cleared = true; if (state === 'ready') { shot = { hits: 0, lit: pegs.filter(p => p.kind === 'poke'), caught: [], cleared: true }; endShot('out'); } },
  dragon() { G.dragonPending = true; buildBoard(true); refreshUI(); },
  season(i) { G.season = i % 4; applySeason(); buildBoard(true); refreshUI(); },
  hitAllPoke() { if (!ball) return; pegs.filter(p => p.kind === 'poke' && !p.lit).forEach(p => onPegHit(ball, p, 0)); },
};
