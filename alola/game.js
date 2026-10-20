'use strict';
/* 阿羅拉・草叢散步：精靈球自己走路、草叢跳出寶可夢、丟球收集。沒有失敗，逃走的下一叢一定抓得到。 */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = t => clamp(t, 0, 1) * clamp(t, 0, 1);
const backOut = t => { t = clamp(t, 0, 1); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad3 = Collect.pad3;

const C = Collect.create({ key: 'alolaPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
const P = C.P;
const SHINY = 1 / 100;
const UB = new Set([793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806].filter(id => P[id]));
const ISLAND_DUR = 42;

/* ============ 四座島 ============ */
const ISLANDS = [
  { key: 'mele', zh: '美樂美樂島', en: 'MELEMELE ISLAND', range: [1, 100], guard: 785, style: 'hills', dot: '#a3d63c', bpmKey: 0,
    day: { skyT: '#6ec6f2', skyB: '#fff2b0', far: '#8fc75a', near: '#b9dc6c', sea: '#45c3f0', seaD: '#1590c8', sand: '#f6dfa0', g1: '#a6d65a', g2: '#8cc447', path: '#efd99e', b: ['#3f9c35', '#5dbb44', '#8fdc5e'], fl: '#ffd93d' } },
  { key: 'akala', zh: '阿卡拉島', en: 'AKALA ISLAND', range: [101, 200], guard: 786, style: 'volcano', dot: '#ff7aa2', bpmKey: 2,
    day: { skyT: '#ff9fbb', skyB: '#ffe3c8', far: '#9c4a63', near: '#d27a8a', sea: '#62cbe6', seaD: '#2b91ba', sand: '#ffd6c4', g1: '#98c95e', g2: '#80b14b', path: '#f4cbb6', b: ['#3e9442', '#58b552', '#88d36a'], fl: '#ff5d8f', lava: '#ff6a3d' } },
  { key: 'ula', zh: '烏拉烏拉島', en: "ULA'ULA ISLAND", range: [201, 300], guard: 787, style: 'peaks', dot: '#9b7bff', bpmKey: -3,
    day: { skyT: '#3a2b70', skyB: '#c39be0', far: '#4b3c80', near: '#7a62b3', sea: '#5d72d6', seaD: '#2e3b8f', sand: '#ddcbea', g1: '#62b07c', g2: '#4b9768', path: '#d2bee2', b: ['#2b8a66', '#3caa7c', '#6fd3a6'], fl: '#c4a3ff', snow: '#f1ecff' } },
  { key: 'poni', zh: '波尼島', en: 'PONI ISLAND', range: [301, 403], guard: 788, style: 'mesa', dot: '#38bdf8', bpmKey: 5,
    day: { skyT: '#3f9fe0', skyB: '#ccefff', far: '#4c7ea8', near: '#7aa7cf', sea: '#2ea8dc', seaD: '#11659d', sand: '#e7e3d1', g1: '#71b78c', g2: '#5aa077', path: '#d9d5c2', b: ['#2a7a59', '#3a976e', '#69c194'], fl: '#7dd3fc', stripe: '#3d6a91' } },
];
ISLANDS.forEach(is => {
  is.all = POKEDEX.filter(p => p.no >= is.range[0] && p.no <= is.range[1]);
  is.pool = is.all.filter(p => p.tier !== 'legend' && !UB.has(p.id));
});
const WORM_OTHER = POKEDEX.filter(p => p.tier === 'legend' && !ISLANDS.some(is => is.guard === p.id)).map(p => p.id);

/* ============ 顏色 ============ */
const hex2 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex2(a), B = hex2(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); };
const NIGHT_INK = '#0e1538';
const palCache = {};
function pal() {
  const k = G.island + (G.night ? 'n' : 'd');
  if (palCache[k]) return palCache[k];
  const d = ISLANDS[G.island].day, o = {};
  for (const key in d) o[key] = Array.isArray(d[key]) ? d[key].map(c => G.night ? mix(c, NIGHT_INK, 0.45) : c) : (G.night ? mix(d[key], NIGHT_INK, 0.5) : d[key]);
  if (G.night) { o.skyT = '#070b24'; o.skyB = mix(d.skyT, '#1a1f52', 0.72); o.fl = d.fl; o.lava = d.lava; }
  return (palCache[k] = o);
}

/* ============ 設定 ============ */
const CFG_KEY = 'alolaPachinko.cfg';
const cfg = { auto: true, music: true, sfx: true };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); } catch (e) {}
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} };

/* ============ 音樂與音效（WebAudio 合成；烏克麗麗刷弦） ============ */
const AU = (() => {
  let ac = null, master, bgm, sfx, noiseBuf, nextT = 0, step = 0, started = false;
  let key = 0, night = false;
  const BGM_VOL = 0.5;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = cfg.music ? BGM_VOL : 0; bgm.connect(master);
    sfx = ac.createGain(); sfx.gain.value = cfg.sfx ? 1 : 0; sfx.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextT = ac.currentTime + 0.1; started = true;
    setInterval(schedule, 30);
  }
  function osc(dest, type, f, t, dur, vol, slideTo) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000, fTo) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t);
    if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // 撥弦：鋸齒＋三角波過一個快速關閉的低通，聽起來像尼龍弦
  function pluck(dest, f, t, vol, dur = 0.8, bright = 2800) {
    const o1 = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o1.type = 'sawtooth'; o2.type = 'triangle'; o1.frequency.value = f; o2.frequency.value = f * 1.004;
    fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(bright, t); fl.frequency.exponentialRampToValueAtTime(Math.max(260, f * 1.3), t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(vol * 0.28, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(fl); o2.connect(fl); fl.connect(g).connect(dest);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function strum(dest, notes, t, vol, down = true) {
    const ns = down ? notes : notes.slice().reverse();
    ns.forEach((m, i) => pluck(dest, hz(m + key), t + i * 0.016, vol * (down ? 1 : 0.7), 0.55, down ? 3000 : 2200));
  }
  // 夏威夷風轉圈和弦：C C A7 A7 D7 G7 C G7
  const CH = { C: [60, 64, 67, 72], A7: [61, 64, 67, 69], D7: [62, 66, 69, 72], G7: [59, 62, 65, 67] };
  const PROG = ['C', 'C', 'A7', 'A7', 'D7', 'G7', 'C', 'G7'];
  const ROOT = { C: 48, A7: 45, D7: 50, G7: 43 };
  const LEAD = [
    [76, 0, 79, 0, 81, 79, 76, 0], [72, 0, 74, 76, 0, 74, 72, 0], [73, 0, 76, 0, 79, 76, 73, 0], [81, 0, 79, 0, 76, 0, 73, 0],
    [74, 0, 78, 0, 81, 0, 78, 76], [77, 0, 74, 0, 71, 0, 74, 0], [72, 76, 79, 84, 0, 79, 76, 0], [79, 0, 77, 0, 74, 0, 71, 0],
  ];
  const STRUM = [1, 0, 1, 2, 0, 2, 1, 2];   // 下 _ 下 上 _ 上 下 上
  let E = 60 / 108 / 2;
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) {
      const swing = (step & 1) ? E * 0.16 : 0;
      playStep(step, nextT + swing);
      nextT += E; step = (step + 1) % 64;
    }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, ch = PROG[bar], n = LEAD[bar][i];
    const v = night ? 0.6 : 1;
    if (STRUM[i]) strum(bgm, CH[ch], t, 0.03 * v, STRUM[i] === 1);
    if (i === 0 || i === 4) osc(bgm, 'sine', hz(ROOT[ch] + key + (i === 4 ? 7 : 0)), t, E * 1.8, 0.11 * v);
    if (n) {
      if (night) osc(bgm, 'sine', hz(n + key), t, E * 1.6, 0.035);
      else { pluck(bgm, hz(n + key + 12), t, 0.032, 0.5, 4200); osc(bgm, 'sine', hz(n + key), t, E * 1.2, 0.018); }
    }
    if (!night) {
      noise(bgm, t, 0.05, i % 2 ? 0.02 : 0.035, 'highpass', 7000);
      if (i === 0 || i === 3 || i === 6) osc(bgm, 'sine', 140, t, 0.14, 0.12, 60);
    } else if (i === 0) noise(bgm, t, 0.4, 0.015, 'bandpass', 1200);
  }
  function setIsland(k, isNight) { key = k; night = isNight; E = 60 / (isNight ? 88 : 108) / 2; }
  function duck(sec) {
    if (!ac || !cfg.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.15, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  function setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } }
  function setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); }
  function arp(list, vol = 0.05, gap = 0.08, delay = 0) {
    if (!ac) return;
    list.forEach((m, i) => { if (m) pluck(sfx, hz(m), ac.currentTime + delay + i * gap, vol, 0.7, 4000); });
  }
  const now = () => ac.currentTime;
  const play = {
    step() { if (ac) noise(sfx, now(), 0.04, 0.025, 'lowpass', 500); },
    rustle() { if (!ac) return; for (let i = 0; i < 4; i++) noise(sfx, now() + i * 0.09, 0.08, 0.09, 'bandpass', 2600 + i * 400); },
    alert() { if (!ac) return; osc(sfx, 'square', 1320, now(), 0.06, 0.04); osc(sfx, 'square', 1760, now() + 0.07, 0.1, 0.04); },
    land() { if (ac) osc(sfx, 'sine', 180, now(), 0.15, 0.2, 60); },
    throw() { if (!ac) return; noise(sfx, now(), 0.35, 0.12, 'bandpass', 500, 2600); osc(sfx, 'sine', 380, now(), 0.3, 0.05, 900); },
    hit() { if (!ac) return; osc(sfx, 'triangle', 900, now(), 0.1, 0.09, 1500); noise(sfx, now(), 0.06, 0.1, 'highpass', 3000); },
    absorb() { if (!ac) return; osc(sfx, 'sine', 300, now(), 0.45, 0.07, 1500); osc(sfx, 'triangle', 600, now() + 0.05, 0.4, 0.03, 2400); },
    drop() { if (ac) osc(sfx, 'sine', 240, now(), 0.1, 0.12, 90); },
    wobble(i) {
      if (!ac) return;
      noise(sfx, now(), 0.1, 0.18, 'lowpass', 500);
      osc(sfx, 'sine', 200 + i * 40, now(), 0.14, 0.2, 110);
      osc(sfx, 'square', 520 + i * 90, now() + 0.02, 0.04, 0.02);
    },
    click() {
      if (!ac) return; duck(1.2);
      osc(sfx, 'square', 2100, now(), 0.025, 0.08); noise(sfx, now(), 0.05, 0.25, 'highpass', 4000);
      osc(sfx, 'triangle', 880, now() + 0.03, 0.12, 0.08);
      [84, 88, 91].forEach((m, i) => osc(sfx, 'sine', hz(m), now() + 0.12 + i * 0.06, 0.3, 0.04));
    },
    pop() { if (ac) osc(sfx, 'sine', 500, now(), 0.14, 0.07, 1500); },
    escape() { if (!ac) return; osc(sfx, 'square', 700, now(), 0.06, 0.04); osc(sfx, 'triangle', 660, now() + 0.08, 0.35, 0.06, 200); },
    caught(rank) {
      if (rank >= 1) { duck(1.4); arp([72, 76, 79, 84, 0, 79, 84], 0.06, 0.09); }
      else arp([79, 84, 88], 0.05, 0.07);
    },
    fanfare() {
      if (!ac) return; duck(3.2);
      arp([67, 72, 76, 79, 0, 76, 79, 84, 0, 84, 86, 88], 0.065, 0.11);
      [72, 76, 79, 84].forEach(m => osc(sfx, 'triangle', hz(m), now() + 1.3, 1.4, 0.03));
    },
    sparkle() { if (!ac) return; [84, 88, 91, 96, 100, 103].forEach((m, i) => osc(sfx, 'sine', hz(m), now() + i * 0.05, 0.25, 0.04)); },
    flash() { if (!ac) return; noise(sfx, now(), 0.6, 0.3, 'highpass', 2500); },
    drumroll(dur) {
      if (!ac) return; duck(dur + 3);
      for (let t = 0; t < dur; t += 0.05) noise(sfx, now() + t, 0.045, 0.03 + 0.12 * (t / dur), 'bandpass', 700 + 1400 * (t / dur));
    },
    chest() { duck(1.5); arp([72, 76, 79, 84, 88, 91], 0.06, 0.06); this.sparkle(); },
    island() { if (!ac) return; duck(2.2); strum(sfx, [60, 64, 67, 72], now(), 0.07); arp([72, 74, 76, 79, 0, 84], 0.06, 0.12, 0.25); },
    worm() {
      if (!ac) return; duck(6);
      noise(sfx, now(), 2.6, 0.25, 'lowpass', 160, 60);
      osc(sfx, 'sawtooth', 55, now(), 2.4, 0.07, 38);
      osc(sfx, 'sine', 880, now() + 0.6, 1.6, 0.025, 1760);
    },
    thunder() { if (!ac) return; noise(sfx, now(), 0.1, 0.4, 'highpass', 3000); noise(sfx, now() + 0.05, 1.3, 0.35, 'lowpass', 900, 120); },
    evolve() { if (!ac) return; duck(3); for (let i = 0; i < 10; i++) osc(sfx, 'triangle', hz(60 + i * 3), now() + i * 0.14, 0.18, 0.04); arp([84, 0, 88, 91, 96], 0.07, 0.1, 1.5); },
  };
  return { init, play, setMusic, setSfx, setIsland, get started() { return started; },
    suspend: () => ac && ac.suspend(), resume: () => ac && ac.resume() };
})();
const sfx = AU.play;

/* ============ 圖片（含剪影快取） ============ */
const IMG = {};
function img(id, shiny) {
  const k = (shiny ? 's' : 'n') + id;
  if (IMG[k]) return IMG[k];
  const im = new Image(), rec = { im, ok: false, black: null, white: null };
  im.onload = () => {
    rec.ok = true;
    const mk = color => {
      const c = document.createElement('canvas'); c.width = im.naturalWidth || 160; c.height = im.naturalHeight || 160;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
      return c;
    };
    rec.black = mk('#0b0d1c'); rec.white = mk('#ffffff');
  };
  im.onerror = () => { rec.ok = true; rec.bad = true; };
  im.src = C.img(id, shiny);
  return (IMG[k] = rec);
}

/* ============ 狀態 ============ */
const G = {
  t: 0, ts: 1, cam: 0, speed: 0, island: 0, islandT: 0, night: false,
  state: 'walk', st: 0, objs: [], lastX: 0, enc: null, pending: null, bait: 0,
  heroPhase: 0, heroHop: 0, holding: false, sinceChest: 0,
  worm: { at: -1, active: false, dark: 0, crack: 0, nextBolt: 0 },
  parts: [], floats: [], bolts: [], gulls: [], flies: [], nextGull: 3, boltFlash: 0,
  travel: null, travelN: 0, pauses: new Set(), waitSpot: false, evoBusy: false, caught: 0,
};
const forced = /[?&]night\b/.test(location.search) ? true : /[?&]day\b/.test(location.search) ? false : null;
const calcNight = () => forced !== null ? forced : (h => h >= 18 || h < 6)(new Date().getHours());
G.night = calcNight();

/* ============ 畫布 ============ */
const stage = $('stage'), cv = $('cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, U = 1, horizonY = 0, shoreY = 0, beachY = 0, groundY = 0, heroX = 0;
function resize() {
  const r = stage.getBoundingClientRect();
  W = Math.max(200, r.width); H = Math.max(200, r.height);
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  U = clamp(Math.min(W * 0.95, H * 1.1) / 420, 0.72, 1.6);
  horizonY = H * 0.40; shoreY = H * 0.55; beachY = H * 0.635; groundY = H * 0.80;
  heroX = Math.max(64 * U, W * 0.18);
  if (W < 520) groundY = H * 0.78;
}
window.addEventListener('resize', resize);
const pkSize = () => Math.min(150, 116 * U);
const heroWorld = () => G.cam + heroX;

/* ============ 名單抽選 ============ */
const escapeChance = cap => clamp(0.5 * (1 - Math.log(cap / 3) / Math.log(85)), 0, 0.5);
const NIGHT_TYPES = ['ghost', 'dark', 'psychic', 'fairy', 'bug'];
function pickWild() {
  const is = ISLANDS[G.island];
  const bait = G.bait > 0;
  let filter = null;
  if (bait) filter = p => p.tier !== 'common';
  else if (G.night && Math.random() < 0.3) filter = p => p.types.some(t => NIGHT_TYPES.includes(t));
  if (bait) { G.bait--; refreshUI(); }
  return C.pick({ pool: is.pool, boost: bait ? 1 : 0, filter });
}
function pickWorm() {
  const r = Math.random();
  if (r < 0.45 && UB.size) return pick([...UB]);
  if (r < 0.8) return ISLANDS[G.island].guard;
  return pick(WORM_OTHER);
}
function ballFor(p, worm) {
  if (UB.has(p.id)) return 'beast';
  if (worm || p.tier === 'legend' || p.tier === 'srare') return 'ultra';
  return p.tier === 'rare' ? 'great' : 'poke';
}
function tierLabel(id) {
  if (UB.has(id)) return '究極異獸';
  if (ISLANDS.some(is => is.guard === id)) return '島嶼守護神';
  return C.tierName(id);
}
const isSpecial = e => e.shiny || e.tier === 'srare' || e.tier === 'legend';

/* ============ 物件生成（草叢、寶箱） ============ */
function spawnAhead() {
  while (G.lastX < G.cam + W + 260 * U) {
    G.lastX += rand(200, 320) * U;
    const chest = G.bait === 0 && G.sinceChest > 5 && Math.random() < 0.13;
    if (chest) { G.objs.push({ type: 'chest', x: G.lastX, open: 0 }); G.sinceChest = 0; }
    else { G.objs.push({ type: 'bush', x: G.lastX, shake: 0, seed: Math.random() * 1000, bang: 0 }); G.sinceChest++; }
  }
  G.objs = G.objs.filter(o => o.x > G.cam - 200 * U);
}
function resetObjs(first) {
  G.objs = [];
  G.lastX = G.cam + (first ? W * 0.55 : W * 0.75);
  spawnAhead();
}

/* ============ 遭遇 ============ */
function makeEnc(id, shiny, o) {
  const p = P[id];
  const willEsc = !o.retry && Math.random() < escapeChance(p.capture);
  img(id, shiny);
  return { id, shiny, tier: p.tier, rank: C.tierRank(id), ub: UB.has(id), retry: !!o.retry, worm: !!o.worm, obj: o.obj || null,
    willEsc, breakAt: 1 + Math.floor(Math.random() * 3), ball: ballFor(p, o.worm),
    x: 0, y: 0, scale: 1, colorT: 0, whiteT: 0, bx: 0, by: 0, brot: 0, bopen: 0, bshow: false, landX: 0, sx: 0, sy: 0 };
}
function setState(s) { G.state = s; G.st = 0; }
function startEncounter(obj) {
  let id, shiny, retry = false;
  if (G.pending) {
    ({ id, shiny } = G.pending); retry = true;
    if (G.pending.worm) { G.pending = null; obj.done = true; startWorm({ id, shiny, retry: true }); return; }
    G.pending = null;
  } else { id = pickWild(); shiny = Math.random() < SHINY; }
  G.enc = makeEnc(id, shiny, { retry, obj });
  G.enc.landX = obj.x + 86 * U;
  setState('rustle');
  sfx.rustle();
}
function startWorm(pre) {
  const id = pre ? pre.id : pickWorm(), shiny = pre ? pre.shiny : Math.random() < SHINY;
  G.enc = makeEnc(id, shiny, { retry: pre && pre.retry, worm: true });
  G.enc.landX = heroWorld() + 210 * U;
  G.worm.active = true; G.worm.nextBolt = 0.5;
  setState('worm');
  sfx.worm();
  toast(pre ? '究極之洞又打開了！這次一定抓得到！' : '天空裂開了……是究極之洞！');
}
function throwBall() {
  if (G.state !== 'ready' || !G.enc) return;
  const e = G.enc;
  e.bx0 = heroX + 8 * U; e.by0 = groundY - 64 * U;
  e.bx1 = e.landX - G.cam; e.by1 = groundY - pkSize() * 0.45;
  e.bshow = true; e.bopen = 0;
  G.heroHop = 1;
  setState('throw');
  sfx.throw();
}
function startChest(o) { G.chestObj = o; setState('chest'); }

/* ============ 島嶼與究極之洞 ============ */
function planWorm() { G.worm.at = Math.random() < 1 / 3 ? rand(8, 32) : -1; }
function startTravel(intro) {
  G.travel = { mode: G.travelN++ % 2 ? 'fly' : 'boat', switched: !!intro, intro: !!intro };
  setState('travel');
  if (intro) { G.st = 1.6; }
}
function arriveIsland() {
  if (!G.travel.intro) G.island = (G.island + 1) % ISLANDS.length;
  G.islandT = 0; G.cam = 0;
  resetObjs(true);
  planWorm();
  G.worm.active = false; G.worm.crack = 0; G.worm.dark = 0;
  AU.setIsland(ISLANDS[G.island].bpmKey, G.night);
  refreshUI();
}

/* ============ 粒子 ============ */
function addPart(o) { G.parts.push(Object.assign({ t: 0, life: 0.8, vx: 0, vy: 0, g: 0, size: 4, color: '#fff', kind: 'dot', world: false }, o)); }
function dust(wx, n = 3) {
  for (let i = 0; i < n; i++) addPart({ x: wx + rand(-6, 6) * U, y: groundY - rand(0, 4) * U, vx: rand(-30, -8) * U, vy: rand(-26, -8) * U, life: rand(0.4, 0.7), size: rand(4, 8) * U, color: '#ffffff', kind: 'puff', world: true });
}
function sparks(x, y, n, colors, spd = 160, world = true) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(0.3, 1) * spd * U;
    addPart({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120 * U, life: rand(0.5, 1), size: rand(3, 6) * U, color: pick(colors), kind: Math.random() < 0.5 ? 'star' : 'dot', world });
  }
}
function floatText(wx, y, text, color = '#fff') { G.floats.push({ x: wx, y, text, color, t: 0 }); }
function bolt(x0, y0, x1, y1) {
  const pts = [[x0, y0]], n = 9;
  for (let i = 1; i < n; i++) pts.push([lerp(x0, x1, i / n) + rand(-24, 24) * U, lerp(y0, y1, i / n)]);
  pts.push([x1, y1]);
  G.bolts.push({ pts, t: 0, life: 0.35 });
  G.boltFlash = 0.5;
  sfx.thunder();
}

/* ============ 更新 ============ */
function update(dt) {
  G.t += dt;
  const e = G.enc;
  if (G.state !== 'travel') G.islandT += dt;
  G.st += dt;

  // 走路速度
  const fast = G.holding && G.state === 'walk';
  const target = G.state === 'walk' ? (fast ? 2.6 : 1) * 92 * U : 0;
  G.speed = lerp(G.speed, target, clamp(dt * 8, 0, 1));
  if (G.speed < 1 && target === 0) G.speed = 0;
  G.cam += G.speed * dt;
  if (G.speed > 1) {
    const prev = G.heroPhase;
    G.heroPhase += G.speed * dt / (13 * U);
    if (Math.floor(prev / Math.PI) !== Math.floor(G.heroPhase / Math.PI)) { dust(heroWorld() + (Math.floor(G.heroPhase / Math.PI) % 2 ? 6 : -6) * U, fast ? 4 : 2); if (fast) sfx.step(); }
  }
  G.heroHop = Math.max(0, G.heroHop - dt * 2.6);
  spawnAhead();

  switch (G.state) {
    case 'walk': {
      if (G.islandT >= ISLAND_DUR) { startTravel(false); break; }
      if (G.worm.at >= 0 && G.islandT >= G.worm.at) { G.worm.at = -1; startWorm(null); break; }
      const hx = heroWorld();
      const o = G.objs.find(o => !o.done && hx >= o.x - (o.type === 'chest' ? 30 : 128) * U);
      if (o) { if (o.type === 'chest') startChest(o); else startEncounter(o); }
      break;
    }
    case 'rustle': {
      const o = e.obj; o.shake = 1;
      if (G.st > 0.25 && !o.bang) { o.bang = 0.001; sfx.alert(); }
      const im = img(e.id, e.shiny);
      if (G.st > 0.75 && (im.ok || G.st > 4)) {
        o.shake = 0.3;
        e.sx = o.x; e.sy = groundY - 20 * U;
        setState('emerge'); sfx.pop();
        sparks(o.x, groundY - 30 * U, 8, ISLANDS[G.island].day.b, 120);
      }
      break;
    }
    case 'worm': {
      if (G.st > 2.0 && img(e.id, e.shiny).ok) {
        e.sx = G.cam + W * 0.66; e.sy = H * 0.17;
        setState('emerge'); sfx.pop();
        bolt(W * 0.66, H * 0.17, e.landX - G.cam, groundY);
      }
      break;
    }
    case 'emerge': {
      const T = e.worm ? 0.9 : 0.55, k = clamp(G.st / T, 0, 1);
      e.x = lerp(e.sx, e.landX, k);
      e.y = lerp(e.sy, groundY, k) - Math.sin(Math.PI * k) * (e.worm ? 40 : 80) * U;
      e.scale = lerp(e.worm ? 0.2 : 0.35, 1, ease(k));
      if (k >= 1) {
        e.y = groundY; e.scale = 1;
        setState('ready'); sfx.land(); dust(e.landX, 6);
        if (e.obj) e.obj.shake = 0;
        if (e.shiny) { sparks(e.landX, groundY - pkSize() * 0.5, 14, ['#fff7ae', '#ffffff', '#ffd23f'], 140); sfx.sparkle(); }
        if (e.retry) floatText(e.landX, groundY - pkSize() - 6 * U, '又遇到了！', '#ffe066');
      }
      break;
    }
    case 'ready':
      if (cfg.auto && G.st > 0.6) throwBall();
      break;
    case 'throw': {
      const T = 0.48, k = clamp(G.st / T, 0, 1);
      e.bx = lerp(e.bx0, e.bx1, k); e.by = lerp(e.by0, e.by1, k) - Math.sin(Math.PI * k) * 90 * U; e.brot = k * 14;
      if (k >= 1) { setState('absorb'); sfx.hit(); sfx.absorb(); e.brot = 0; sparks(e.landX, e.by1, 10, ['#ffffff', '#ffe9a8'], 120); }
      break;
    }
    case 'absorb': {
      const k = clamp(G.st / 0.45, 0, 1);
      e.bopen = clamp(G.st / 0.1, 0, 1) * (1 - clamp((G.st - 0.38) / 0.08, 0, 1));
      e.whiteT = clamp(G.st / 0.12, 0, 1);
      e.scale = 1 - ease(k);
      e.by = e.by1 - Math.sin(Math.min(1, G.st / 0.2) * Math.PI) * 10 * U;
      if (k >= 1) { e.scale = 0; e.bopen = 0; setState('drop'); }
      break;
    }
    case 'drop': {
      const k = clamp(G.st / 0.35, 0, 1), gy = groundY - 13 * U;
      const b = k < 0.7 ? easeIn(k / 0.7) : 1 - Math.sin((k - 0.7) / 0.3 * Math.PI) * 0.12;
      e.by = lerp(e.by1, gy, b);
      if (k >= 1) { e.by = gy; setState('wobble'); sfx.drop(); dust(e.landX, 3); e.shakes = 0; }
      break;
    }
    case 'wobble': {
      const SH = 0.56, n = Math.floor((G.st - 0.25) / SH);
      if (G.st > 0.25 && n >= e.shakes && e.shakes < 3) {
        if (e.willEsc && e.shakes >= e.breakAt) { setState('escape'); sfx.escape(); e.whiteT = 1; e.colorT = 0; sparks(e.landX, e.by, 10, ['#ffffff', '#ff8f8f'], 160); break; }
        sfx.wobble(e.shakes); e.shakes++;
      }
      const u = ((G.st - 0.25) % SH) / SH;
      e.brot = G.st > 0.25 && u < 0.55 && e.shakes <= 3 ? Math.sin(u / 0.55 * Math.PI * 2) * 0.5 * (e.shakes % 2 ? 1 : -1) : 0;
      e.bx = e.bx1 + e.brot * 4 * U;
      if (e.shakes >= 3 && G.st > 0.25 + 3 * SH + 0.15) {
        if (e.willEsc) { setState('escape'); sfx.escape(); e.whiteT = 1; break; }
        e.brot = 0; e.bx = e.bx1; setState('click'); onCaught();
      }
      break;
    }
    case 'click':
      if (G.st > 0.65) { setState('popout'); sfx.pop(); e.bopen = 0; }
      break;
    case 'popout': {
      e.bopen = clamp(G.st / 0.12, 0, 1);
      e.scale = backOut(G.st / 0.4);
      e.whiteT = 0;
      e.colorT = clamp((G.st - 0.3) / 0.5, 0, 1);
      e.x = e.landX; e.y = e.by + 4 * U - Math.sin(clamp(G.st / 0.4, 0, 1) * Math.PI) * 20 * U;
      if (G.st > 0.3 && !e.shown) { e.shown = true; showCaught(e); sparks(e.landX, groundY - pkSize() * 0.5, 16, e.shiny ? ['#fff7ae', '#ffd23f', '#ff9ff3'] : ['#ffffff', '#c3f7e4', '#fff1a8'], 180); }
      if (G.st > 1.2 && !G.waitSpot) setState('collect');
      break;
    }
    case 'collect': {
      const k = clamp(G.st / 0.45, 0, 1);
      const tx = heroWorld(), ty = groundY - 40 * U;
      e.x = lerp(e.landX, tx, easeIn(k)); e.y = lerp(e.by, ty, easeIn(k)) - Math.sin(k * Math.PI) * 50 * U;
      e.scale = 1 - k * 0.85; e.bshow = false;
      if (k >= 1) {
        G.heroHop = 1; sparks(tx, ty, 8, ['#ffffff', '#ffe066'], 100);
        endEncounter();
        const evos = C.evolve();
        if (evos.length) { setState('evo'); runEvos(evos).then(() => setState('walk')); }
      }
      break;
    }
    case 'escape': {
      const k = G.st;
      e.bshow = k < 0.25; e.bopen = 1;
      e.scale = Math.min(1, k / 0.15);
      e.whiteT = clamp(1 - k / 0.2, 0, 1); e.colorT = 0;
      if (k < 0.7) { e.x = e.landX; e.y = groundY - Math.abs(Math.sin(k / 0.35 * Math.PI)) * 30 * U; }
      else { e.x += 560 * U * dt; e.y = groundY - Math.abs(Math.sin(k * 11)) * 26 * U; }
      if (!e.saidEsc && k > 0.3) { e.saidEsc = true; floatText(e.landX, groundY - pkSize() - 6 * U, '逃走了！', '#ffd1d1'); toast('牠跑進前面的草叢了，下一叢一定抓得到！'); }
      if (k > 1.6) { G.pending = { id: e.id, shiny: e.shiny, worm: e.worm }; endEncounter(); }
      break;
    }
    case 'chest': {
      const o = G.chestObj;
      o.open = clamp((G.st - 0.25) / 0.3, 0, 1);
      if (G.st > 0.45 && !o.given) {
        o.given = true; G.bait += 3; refreshUI(); sfx.chest();
        floatText(o.x, groundY - 70 * U, '超級餌 ×3！', '#ffe066');
        sparks(o.x, groundY - 30 * U, 22, ['#ffe066', '#fff', '#ffb347'], 200);
        toast('🍯 撿到超級餌！接下來 3 隻保證稀有以上');
      }
      if (G.st > 1.5) { o.done = true; setState('walk'); }
      break;
    }
    case 'travel': {
      const tr = G.travel;
      if (G.st > 2.1 && !tr.switched) { tr.switched = true; arriveIsland(); }
      if (tr.intro && !tr.arrived) { tr.arrived = true; arriveIsland(); }
      if (G.st > 1.7 && !tr.dinged) { tr.dinged = true; sfx.island(); }
      if (G.st > 4.4) { G.travel = null; setState('walk'); }
      break;
    }
  }

  // 究極之洞：變暗、裂縫、閃電
  const w = G.worm;
  w.dark = lerp(w.dark, w.active ? 0.58 : 0, clamp(dt * (w.active ? 2.2 : 1), 0, 1));
  w.crack = clamp(w.crack + dt * (w.active ? 0.9 : -0.8), 0, 1);
  if (w.active) {
    w.nextBolt -= dt;
    if (w.nextBolt <= 0 && w.crack > 0.3) { w.nextBolt = rand(1.0, 2.6); bolt(W * 0.66 + rand(-30, 30) * U, H * 0.17, rand(W * 0.3, W * 0.95), groundY + rand(-10, 20) * U); }
  }
  G.boltFlash = Math.max(0, G.boltFlash - dt * 2);
  G.bolts.forEach(b => b.t += dt); G.bolts = G.bolts.filter(b => b.t < b.life);

  // 草叢晃動、驚嘆號
  for (const o of G.objs) if (o.bang) o.bang += dt;

  // 粒子
  for (const p of G.parts) { p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  G.parts = G.parts.filter(p => p.t < p.life);
  G.floats.forEach(f => f.t += dt); G.floats = G.floats.filter(f => f.t < 1.6);

  // 海鷗（白天）、螢火（夜晚）
  G.nextGull -= dt;
  if (G.nextGull <= 0 && !G.night && G.state !== 'travel') {
    G.nextGull = rand(5, 13);
    const n = Math.random() < 0.35 ? 3 : 1, y0 = rand(H * 0.1, H * 0.3);
    for (let i = 0; i < n; i++) G.gulls.push({ x: W + 30 * U + i * 34 * U, y: y0 + i * 14 * U * (i % 2 ? 1 : -1), vx: -rand(70, 110) * U, ph: Math.random() * 6, s: rand(0.8, 1.2) });
  }
  G.gulls.forEach(g => { g.x += (g.vx - G.speed * 0.15) * dt; g.ph += dt * 7; g.y += Math.sin(G.t * 2 + g.ph) * 4 * U * dt; });
  G.gulls = G.gulls.filter(g => g.x > -60 * U);
  if (G.night && G.flies.length < 16) G.flies.push({ x: Math.random() * W, y: rand(beachY, H), ph: Math.random() * 6, v: rand(0.5, 1.2) });
  if (!G.night) G.flies.length = 0;
  for (const f of G.flies) { f.ph += dt * f.v; f.x += (Math.cos(f.ph * 0.7) * 14 * U - G.speed * 0.8) * dt; f.y += Math.sin(f.ph * 1.3) * 10 * U * dt; if (f.x < -10) f.x += W + 20; if (f.x > W + 10) f.x -= W + 20; }

  updateHUD();
}
function endEncounter() {
  const e = G.enc;
  if (e && e.obj) e.obj.done = true;
  if (e && e.worm) G.worm.active = false;
  G.enc = null;
  if (G.state !== 'evo') setState('walk');
}
function onCaught() {
  const e = G.enc;
  sfx.click();
  sparks(e.landX, e.by - 8 * U, 6, ['#ffe066', '#ffffff'], 90);
  floatText(e.landX, e.by - 30 * U, '喀！', '#ffffff');
  const res = C.add(e.id, e.shiny);
  e.isNew = res.isNew; G.caught++;
  refreshUI();
}

/* ============ 繪圖 ============ */
function sky(p) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, p.skyT); g.addColorStop(1, p.skyB);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizonY + 2);
  if (G.night) {
    for (let i = 0; i < 70; i++) {
      const x = hash(i, 1) * W, y = hash(i, 2) * horizonY * 0.95, tw = 0.5 + 0.5 * Math.sin(G.t * (1 + hash(i, 3) * 3) + i);
      ctx.globalAlpha = 0.3 + tw * 0.7; ctx.fillStyle = '#fff';
      const s = (hash(i, 4) < 0.15 ? 2.2 : 1.2) * U; ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    // 月亮
    const mx = W * 0.8, my = H * 0.11, mr = 22 * U;
    const gl = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3.5);
    gl.addColorStop(0, '#fff8d655'); gl.addColorStop(1, '#fff8d600');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(mx, my, mr * 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7); ctx.fill();
    ctx.fillStyle = p.skyT; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.25, mr * 0.85, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  } else {
    const sx = W * 0.82, sy = H * 0.12, sr = 26 * U;
    const gl = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.2);
    gl.addColorStop(0, '#fff6c0aa'); gl.addColorStop(1, '#fff6c000');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sx, sy, sr * 3.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff4b8'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    // 雲
    const off = G.cam * 0.04 + G.t * 6 * U, T = 260 * U;
    for (let i = Math.floor(off / T) - 1; i < Math.floor((off + W) / T) + 2; i++) {
      if (hash(i, 5) < 0.35) continue;
      const x = i * T - off + hash(i, 6) * 80 * U, y = H * (0.06 + hash(i, 7) * 0.2), s = (0.7 + hash(i, 8) * 0.6) * U;
      ctx.fillStyle = '#ffffffd0';
      ctx.beginPath();
      ctx.ellipse(x, y, 40 * s, 13 * s, 0, 0, 7); ctx.ellipse(x - 18 * s, y - 6 * s, 18 * s, 13 * s, 0, 0, 7);
      ctx.ellipse(x + 10 * s, y - 11 * s, 22 * s, 16 * s, 0, 0, 7);
      ctx.fill();
    }
  }
}
function mountains(p) {
  const st = ISLANDS[G.island].style;
  // 遠景
  const off = G.cam * 0.08, T = 180 * U;
  ctx.fillStyle = p.far;
  for (let i = Math.floor(off / T) - 2; i < Math.floor((off + W) / T) + 3; i++) {
    const x = i * T - off, r = hash(i, 11), h = (40 + r * 70) * U, w = (150 + hash(i, 12) * 120) * U;
    ctx.beginPath();
    if (st === 'mesa') {
      ctx.moveTo(x - w * 0.6, horizonY); ctx.lineTo(x - w * 0.4, horizonY - h * 1.1); ctx.lineTo(x + w * 0.35, horizonY - h * 1.1); ctx.lineTo(x + w * 0.6, horizonY);
      ctx.fill();
      ctx.fillStyle = p.stripe; for (let k = 1; k < 4; k++) { const yy = horizonY - h * 1.1 * k / 4; ctx.fillRect(x - w * 0.6 + (w * 0.2) * (1 - k / 4) * 1, yy, w * 1.2 - w * 0.4 * (1 - k / 4), 3 * U); }
      ctx.fillStyle = p.far;
    } else if (st === 'peaks') {
      const hh = h * 1.5;
      ctx.moveTo(x - w * 0.55, horizonY); ctx.lineTo(x, horizonY - hh); ctx.lineTo(x + w * 0.55, horizonY); ctx.fill();
      ctx.fillStyle = p.snow; ctx.beginPath(); ctx.moveTo(x, horizonY - hh); ctx.lineTo(x - w * 0.15, horizonY - hh * 0.73); ctx.lineTo(x - w * 0.05, horizonY - hh * 0.78); ctx.lineTo(x + w * 0.04, horizonY - hh * 0.7); ctx.lineTo(x + w * 0.15, horizonY - hh * 0.73); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.far;
    } else if (st === 'volcano' && hash(i, 13) < 0.3) {
      const hh = h * 1.6 + 30 * U;
      ctx.moveTo(x - w * 0.8, horizonY); ctx.lineTo(x - w * 0.12, horizonY - hh); ctx.lineTo(x + w * 0.12, horizonY - hh); ctx.lineTo(x + w * 0.8, horizonY); ctx.fill();
      ctx.fillStyle = p.lava; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(G.t * 3 + i);
      ctx.beginPath(); ctx.ellipse(x, horizonY - hh, w * 0.12, 5 * U, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      for (let k = 0; k < 4; k++) {
        const u = (G.t * 0.25 + k / 4) % 1;
        ctx.fillStyle = `rgba(120,110,120,${0.45 * (1 - u)})`;
        ctx.beginPath(); ctx.arc(x + u * 30 * U + Math.sin(u * 6) * 6 * U, horizonY - hh - u * 70 * U, (8 + u * 18) * U, 0, 7); ctx.fill();
      }
      ctx.fillStyle = p.far;
    } else {
      ctx.moveTo(x - w * 0.7, horizonY);
      ctx.quadraticCurveTo(x, horizonY - h * 2, x + w * 0.7, horizonY); ctx.fill();
    }
  }
  // 近丘
  const off2 = G.cam * 0.16;
  ctx.fillStyle = p.near;
  ctx.beginPath(); ctx.moveTo(0, horizonY + 2);
  for (let x = 0; x <= W + 10; x += 10) {
    const wx = (x + off2) / U;
    const y = horizonY - (14 + 10 * Math.sin(wx * 0.011) + 8 * Math.sin(wx * 0.027 + 1) + 5 * Math.sin(wx * 0.05)) * U;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W + 10, horizonY + 2); ctx.closePath(); ctx.fill();
}
function sea(p) {
  const g = ctx.createLinearGradient(0, horizonY, 0, shoreY);
  g.addColorStop(0, p.seaD); g.addColorStop(1, p.sea);
  ctx.fillStyle = g; ctx.fillRect(0, horizonY, W, shoreY - horizonY + 2);
  // 波浪線
  const off = G.cam * 0.3;
  ctx.strokeStyle = G.night ? '#ffffff30' : '#ffffff70'; ctx.lineWidth = 2 * U; ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const y = lerp(horizonY, shoreY, (k + 0.6) / 5.6), T = (70 + k * 25) * U, o = off * (0.5 + k * 0.2) + G.t * (8 + k * 4) * U;
    for (let i = Math.floor(o / T) - 1; i < Math.floor((o + W) / T) + 2; i++) {
      if (hash(i, k + 20) < 0.4) continue;
      const x = i * T - o, w = (14 + k * 6) * U;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y - (2 + k) * U * (1 + 0.5 * Math.sin(G.t * 2 + i)), x + w, y); ctx.stroke();
    }
  }
  // 月光倒影／陽光閃爍
  if (G.night) {
    ctx.fillStyle = '#fff6d040';
    for (let k = 0; k < 8; k++) { const y = lerp(horizonY, shoreY, k / 8), w = (10 + k * 6) * U * (0.7 + 0.3 * Math.sin(G.t * 3 + k)); ctx.fillRect(W * 0.8 - w / 2, y, w, 2 * U); }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = Math.sin(G.t * 3 + i * 1.7); if (a < 0.6) continue;
      ctx.fillStyle = `rgba(255,255,255,${(a - 0.6) * 2})`;
      const x = (hash(i, 30) * W - G.cam * 0.3 % W + W) % W, y = lerp(horizonY, shoreY, hash(i, 31));
      ctx.fillRect(x, y, 6 * U, 1.5 * U);
    }
  }
}
function beach(p) {
  // 沙灘＋浪花
  const wash = Math.sin(G.t * 0.9) * 5 * U;
  ctx.fillStyle = p.sand; ctx.fillRect(0, shoreY - 4 * U, W, beachY - shoreY + 8 * U);
  ctx.fillStyle = mix(p.sand, p.sea, 0.35);
  ctx.beginPath(); ctx.moveTo(0, shoreY - 4 * U);
  for (let x = 0; x <= W + 10; x += 12) ctx.lineTo(x, shoreY + wash + Math.sin((x + G.cam * 0.4) / (30 * U)) * 3 * U);
  ctx.lineTo(W + 10, shoreY - 4 * U); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = G.night ? '#ffffff60' : '#ffffffd0'; ctx.lineWidth = 3 * U;
  ctx.beginPath();
  for (let x = 0; x <= W + 10; x += 12) { const y = shoreY + wash + Math.sin((x + G.cam * 0.4) / (30 * U)) * 3 * U; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  // 地面
  const g = ctx.createLinearGradient(0, beachY, 0, H);
  g.addColorStop(0, p.g1); g.addColorStop(1, p.g2);
  ctx.fillStyle = g; ctx.fillRect(0, beachY, W, H - beachY);
  ctx.fillStyle = p.g1;
  ctx.beginPath(); ctx.moveTo(0, beachY + 2);
  for (let x = 0; x <= W + 10; x += 14) ctx.lineTo(x, beachY - (3 + 3 * Math.sin((x + G.cam * 0.9) / (18 * U))) * U);
  ctx.lineTo(W + 10, beachY + 2); ctx.closePath(); ctx.fill();
  // 小路
  ctx.fillStyle = p.path;
  const py0 = groundY - 18 * U, py1 = groundY + 24 * U;
  ctx.beginPath(); ctx.moveTo(0, py0);
  for (let x = 0; x <= W + 10; x += 16) ctx.lineTo(x, py0 + Math.sin((x + G.cam) / (40 * U)) * 2 * U);
  for (let x = W + 10; x >= 0; x -= 16) ctx.lineTo(x, py1 + Math.sin((x + G.cam) / (50 * U) + 2) * 3 * U);
  ctx.closePath(); ctx.fill();
  // 路上小石頭與花
  const T = 46 * U, off = G.cam;
  for (let i = Math.floor(off / T) - 1; i < Math.floor((off + W) / T) + 2; i++) {
    const x = i * T - off + hash(i, 40) * 30 * U, r = hash(i, 41);
    if (r < 0.35) { ctx.fillStyle = mix(p.path, '#000000', 0.12); ctx.beginPath(); ctx.ellipse(x, groundY + (r * 30 - 4) * U, 4 * U, 2.5 * U, 0, 0, 7); ctx.fill(); }
    else if (r > 0.75) {
      const y = beachY + (10 + hash(i, 42) * (groundY - beachY - 40 * U) / U) * U;
      ctx.fillStyle = p.fl; for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 3 * U, y + Math.sin(a) * 3 * U, 2.4 * U, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 1.6 * U, 0, 7); ctx.fill();
    }
  }
}
function palm(x, y, h, s, p, i) {
  const sway = Math.sin(G.t * 1.3 + i) * 0.06 + (G.worm.active ? Math.sin(G.t * 6 + i) * 0.08 : 0);
  const lean = (hash(i, 50) - 0.5) * 0.5 + sway * 0.5;
  const tx = x + Math.sin(lean) * h, ty = y - Math.cos(lean) * h;
  const trunk = G.night ? '#4a3a3a' : '#9b6b43', ring = G.night ? '#3a2c2c' : '#7d5233';
  ctx.strokeStyle = trunk; ctx.lineCap = 'round';
  const N = 7;
  for (let k = 0; k < N; k++) {
    const a = k / N, b = (k + 1) / N;
    const ax = lerp(x, tx, a) + Math.sin(a * Math.PI) * 10 * U * s, ay = lerp(y, ty, a);
    const bx = lerp(x, tx, b) + Math.sin(b * Math.PI) * 10 * U * s, by = lerp(y, ty, b);
    ctx.lineWidth = (9 - k * 0.7) * U * s; ctx.strokeStyle = k % 2 ? trunk : ring;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  const leaf = G.night ? '#1f5a40' : '#2f9a55', leaf2 = G.night ? '#2a6e4f' : '#49b96a';
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (k - 3) * 0.55 + sway * 2 + Math.sin(G.t * 2 + k + i) * 0.04;
    const L = (44 + hash(i * 7 + k, 51) * 14) * U * s;
    const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.6 + L * 0.35;
    const mx = tx + Math.cos(a) * L * 0.55, my = ty + Math.sin(a) * L * 0.55 - 8 * U * s;
    ctx.fillStyle = k % 2 ? leaf : leaf2;
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(mx - 6 * U * s, my - 8 * U * s, ex, ey);
    ctx.quadraticCurveTo(mx + 6 * U * s, my + 6 * U * s, tx, ty); ctx.fill();
  }
  ctx.fillStyle = G.night ? '#3c2a1e' : '#6b4423';
  [[-4, 3], [4, 4], [0, 7]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(tx + dx * U * s, ty + dy * U * s, 4 * U * s, 0, 7); ctx.fill(); });
}
function palms(p) {
  const off = G.cam * 0.5, T = 150 * U;
  for (let i = Math.floor(off / T) - 1; i < Math.floor((off + W) / T) + 2; i++) {
    if (hash(i, 52) < 0.38) continue;
    const x = i * T - off + hash(i, 53) * 60 * U, s = 0.75 + hash(i, 54) * 0.4;
    palm(x, lerp(shoreY, beachY, 0.75), (95 + hash(i, 55) * 50) * U * s, s, p, i);
  }
}
function foreground(p) {
  const off = G.cam * 1.25, T = 70 * U, base = H + 2;
  for (let i = Math.floor(off / T) - 1; i < Math.floor((off + W) / T) + 2; i++) {
    if (hash(i, 60) < 0.45) continue;
    const x = i * T - off + hash(i, 61) * 30 * U, h = (16 + hash(i, 62) * 18) * U;
    ctx.fillStyle = hash(i, 63) < 0.5 ? p.b[0] : p.b[1];
    for (let k = -2; k <= 2; k++) {
      const sw = Math.sin(G.t * 2 + i + k) * 3 * U;
      ctx.beginPath(); ctx.moveTo(x + k * 5 * U - 3 * U, base); ctx.lineTo(x + k * 7 * U + sw, base - h * (1 - Math.abs(k) * 0.18)); ctx.lineTo(x + k * 5 * U + 3 * U, base); ctx.fill();
    }
  }
}
function bush(o, p) {
  const x = o.x - G.cam, y = groundY + 2 * U;
  if (x < -100 * U || x > W + 100 * U) return;
  const w = 82 * U, h = 56 * U, sh = o.shake;
  ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.55, 7 * U, 0, 0, 7); ctx.fill();
  for (let layer = 0; layer < 3; layer++) {
    const N = 7 - layer, lw = w * (1 - layer * 0.14), lh = h * (1 - layer * 0.2);
    ctx.fillStyle = p.b[layer];
    for (let i = 0; i < N; i++) {
      const px = x - lw / 2 + lw * (i + 0.5) / N;
      const sway = Math.sin(G.t * 1.6 + i + o.seed) * 2 * U + (sh ? Math.sin(G.t * 38 + i * 1.7) * 7 * U * sh : 0);
      const th = lh * (0.7 + 0.3 * hash(i + layer * 10, o.seed));
      ctx.beginPath(); ctx.moveTo(px - lw / N * 0.95, y - layer * 2 * U); ctx.lineTo(px + sway, y - th); ctx.lineTo(px + lw / N * 0.95, y - layer * 2 * U); ctx.fill();
    }
  }
  ctx.fillStyle = p.b[0]; ctx.beginPath(); ctx.ellipse(x, y - 4 * U, w * 0.5, 10 * U, 0, Math.PI, 0); ctx.fill();
  if (ISLANDS[G.island].key === 'akala' || hash(1, o.seed) < 0.3) {
    ctx.fillStyle = p.fl;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + (hash(k, o.seed + 1) - 0.5) * w * 0.7, y - (10 + hash(k, o.seed + 2) * 22) * U, 3 * U, 0, 7); ctx.fill(); }
  }
  // 驚嘆號
  if (o.bang && o.bang < 1.4) {
    const s = backOut(o.bang / 0.2) * (o.bang > 1.1 ? 1 - (o.bang - 1.1) / 0.3 : 1), by = y - h - 26 * U;
    if (s > 0.01) {
      ctx.save(); ctx.translate(x, by); ctx.scale(s, s);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1d3340'; ctx.lineWidth = 2.5 * U;
      ctx.beginPath(); ctx.arc(0, 0, 15 * U, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4 * U, 13 * U); ctx.lineTo(0, 22 * U); ctx.lineTo(5 * U, 12 * U); ctx.fill();
      ctx.fillStyle = '#ef4444'; ctx.font = `900 ${22 * U}px Fredoka, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, 1 * U);
      ctx.restore();
    }
  }
}
function chest(o) {
  const x = o.x - G.cam, y = groundY + 2 * U;
  if (x < -100 * U || x > W + 100 * U) return;
  const w = 40 * U, h = 26 * U;
  if (o.open > 0 && !o.done) {
    ctx.save(); ctx.globalAlpha = o.open * 0.7; ctx.translate(x, y - h);
    for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4 + G.t * 0.3); ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8 * U, -70 * U); ctx.lineTo(8 * U, -70 * U); ctx.fill(); }
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.6, 5 * U, 0, 0, 7); ctx.fill();
  const bob = o.open ? 0 : Math.abs(Math.sin(G.t * 3)) * 3 * U;
  ctx.fillStyle = '#b8732f'; ctx.fillRect(x - w / 2, y - h - bob * 0, w, h);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(x - w / 2, y - h * 0.55, w, 4 * U); ctx.fillRect(x - 3 * U, y - h * 0.7, 6 * U, 9 * U);
  ctx.save(); ctx.translate(x - w / 2, y - h); ctx.rotate(-o.open * 1.9);
  ctx.fillStyle = '#d0883c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8 * U); ctx.quadraticCurveTo(w / 2, -18 * U, w, -8 * U); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(w / 2 - 3 * U, -12 * U, 6 * U, 12 * U);
  ctx.restore();
  if (!o.open) { ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(G.t * 5); ctx.font = `700 ${14 * U}px Fredoka`; ctx.textAlign = 'center'; ctx.fillText('✦', x + 16 * U, y - h - 12 * U - bob); ctx.globalAlpha = 1; }
}
const BALLS = {
  poke: { top: '#ee3b3b' }, great: { top: '#2f7fe8', deco: '#ee3b3b' },
  ultra: { top: '#2a2a2a', deco: '#ffd23f' }, beast: { top: '#1f3fa8', deco: '#ffd23f' },
};
function drawBall(x, y, r, type, rot = 0, open = 0, glow = 0) {
  const b = BALLS[type];
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  if (glow > 0) { ctx.fillStyle = `rgba(255,240,150,${glow * 0.5})`; ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, 7); ctx.fill(); }
  const lw = Math.max(1.5, r * 0.13);
  ctx.lineWidth = lw; ctx.strokeStyle = '#1d1d2a';
  ctx.fillStyle = '#f7f7f4'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.translate(-r, 0); ctx.rotate(-open * 1.4); ctx.translate(r, 0);
  ctx.fillStyle = b.top; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
  if (type === 'great') { ctx.fillStyle = b.deco; ctx.beginPath(); ctx.ellipse(-r * 0.55, -r * 0.45, r * 0.32, r * 0.16, -0.7, 0, 7); ctx.ellipse(r * 0.55, -r * 0.45, r * 0.32, r * 0.16, 0.7, 0, 7); ctx.fill(); }
  if (type === 'ultra') { ctx.fillStyle = b.deco; ctx.fillRect(-r * 0.62, -r * 0.92, r * 0.28, r * 0.85); ctx.fillRect(r * 0.34, -r * 0.92, r * 0.28, r * 0.85); }
  if (type === 'beast') { ctx.strokeStyle = b.deco; ctx.lineWidth = r * 0.1; for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.4 + k * 0.22), Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); } ctx.strokeStyle = '#1d1d2a'; ctx.lineWidth = lw; }
  ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, Math.PI * 2); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.55, r * 0.22, r * 0.12, -0.6, 0, 7); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#1d1d2a'; ctx.fillRect(-r, -lw * 0.9, r * 2, lw * 1.8);
  ctx.fillStyle = '#f7f7f4'; ctx.beginPath(); ctx.arc(0, 0, r * 0.33, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = glow > 0 ? '#fff8b0' : '#e8e8e2'; ctx.beginPath(); ctx.arc(0, 0, r * 0.17, 0, 7); ctx.fill();
  ctx.restore();
}
function hero() {
  const walk = clamp(G.speed / (60 * U), 0, 1), ph = G.heroPhase;
  const hop = Math.sin(G.heroHop * Math.PI) * 16 * U;
  const bob = Math.abs(Math.sin(ph)) * 4 * U * walk + hop + (walk < 0.1 ? Math.sin(G.t * 2.4) * 1.2 * U : 0);
  const tilt = Math.sin(ph) * 0.13 * walk - (G.state === 'throw' ? 0.25 * (1 - G.st / 0.48) : 0);
  const x = heroX, y = groundY, r = 22 * U;
  const cy = y - 13 * U - r - bob;
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, y + 2 * U, r * 0.85 * (1 - hop / (60 * U)), 5 * U, 0, 0, 7); ctx.fill();
  for (const leg of [1, 0]) {
    const lp = ph + leg * Math.PI;
    const hipX = x + (leg ? 7 : -7) * U, hipY = cy + r * 0.8;
    const fx = hipX + Math.cos(lp) * 7 * U * walk, fy = y - Math.max(0, Math.sin(lp)) * 7 * U * walk - hop;
    ctx.strokeStyle = leg ? '#3a3a4a' : '#2b2b3a'; ctx.lineWidth = 5.5 * U; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(fx, fy - 3 * U); ctx.stroke();
    ctx.fillStyle = leg ? '#d93a3a' : '#ef4b4b';
    ctx.beginPath(); ctx.ellipse(fx + 2.5 * U, fy - 2 * U, 6.5 * U, 3.8 * U, 0, 0, 7); ctx.fill();
  }
  drawBall(x, cy, r, 'poke', tilt);
  // 小眼睛（中間按鈕旁的閃光）
  if (G.night) { ctx.fillStyle = '#fff6b0'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(G.t * 4); ctx.beginPath(); ctx.arc(x, cy, 4 * U, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
}
function aura(x, y, e) {
  const col = e.worm ? '170,120,255' : e.rank >= 3 ? '200,120,255' : e.rank === 2 ? '255,190,60' : e.rank === 1 ? '90,160,255' : null;
  if (!col) return;
  const S = pkSize(), r = S * 0.62 * (1 + 0.06 * Math.sin(G.t * 5));
  const g = ctx.createRadialGradient(x, y - S * 0.45, S * 0.1, x, y - S * 0.45, r);
  g.addColorStop(0, `rgba(${col},.55)`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - S * 0.45, r, 0, 7); ctx.fill();
}
function drawPoke(e) {
  if (e.scale <= 0.01) return;
  const rec = img(e.id, e.shiny); if (!rec.ok || rec.bad) return;
  const S = pkSize() * e.scale, x = e.x - G.cam, yb = e.y + S * 0.06;
  if (['ready', 'emerge'].includes(G.state)) aura(x, e.y, e);
  if (e.scale > 0.6 && G.state !== 'collect') { ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(x, groundY + 2 * U, S * 0.32, 6 * U, 0, 0, 7); ctx.fill(); }
  const bob = G.state === 'ready' ? Math.abs(Math.sin(G.t * 4)) * 3 * U : 0;
  const dx = x - S / 2, dy = yb - S - bob;
  if (e.colorT < 1) { ctx.drawImage(rec.black, dx, dy, S, S); }
  if (e.colorT > 0) { ctx.globalAlpha = e.colorT; ctx.drawImage(rec.im, dx, dy, S, S); ctx.globalAlpha = 1; }
  if (e.whiteT > 0) { ctx.globalAlpha = e.whiteT; ctx.drawImage(rec.white, dx, dy, S, S); ctx.globalAlpha = 1; }
}
function wormhole() {
  const w = G.worm;
  if (w.dark > 0.01) { ctx.fillStyle = `rgba(14,4,36,${w.dark})`; ctx.fillRect(0, 0, W, H); }
  if (w.crack > 0.01) {
    const cx = W * 0.66, cy = H * 0.17, k = ease(w.crack), R = 70 * U * k;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.4);
    g.addColorStop(0, 'rgba(255,255,255,.6)'); g.addColorStop(0.4, 'rgba(120,220,255,.25)'); g.addColorStop(1, 'rgba(170,90,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 2.4, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(G.t * 0.7) * 0.08);
    ctx.beginPath();
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = i / N * Math.PI * 2, rr = R * (i % 2 ? 0.45 : 1) * (0.8 + 0.2 * hash(i, 70)) * (1 + 0.05 * Math.sin(G.t * 9 + i));
      const px = Math.cos(a) * rr * 1.5, py = Math.sin(a) * rr * 0.55;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.4);
    g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.35, '#b6f3ff'); g2.addColorStop(0.75, '#9b6bff'); g2.addColorStop(1, '#3b1a7a');
    ctx.fillStyle = g2; ctx.fill();
    ctx.strokeStyle = '#e0f7ff'; ctx.lineWidth = 2 * U; ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 6; i++) {
      const a = G.t * (0.6 + i * 0.1) + i, d = R * (1.2 + 0.4 * Math.sin(G.t * 2 + i));
      ctx.fillStyle = i % 2 ? '#c4b5fd' : '#a5f3fc';
      ctx.save(); ctx.translate(cx + Math.cos(a) * d * 1.4, cy + Math.sin(a) * d * 0.6); ctx.rotate(a * 2);
      ctx.fillRect(-4 * U * k, -4 * U * k, 8 * U * k, 8 * U * k); ctx.restore();
    }
  }
  for (const b of G.bolts) {
    const a = 1 - b.t / b.life;
    ctx.strokeStyle = `rgba(200,230,255,${a})`; ctx.lineWidth = 7 * U; ctx.lineJoin = 'round';
    ctx.beginPath(); b.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2.5 * U; ctx.stroke();
  }
  if (G.boltFlash > 0) { ctx.fillStyle = `rgba(230,240,255,${G.boltFlash * 0.45})`; ctx.fillRect(0, 0, W, H); }
}
function gulls() {
  ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const g of G.gulls) {
    const s = 10 * U * g.s, f = Math.sin(g.ph) * 0.6;
    ctx.lineWidth = 2.6 * U;
    ctx.beginPath();
    ctx.moveTo(g.x - s, g.y - f * s); ctx.quadraticCurveTo(g.x - s * 0.45, g.y - s * 0.5 - f * s * 0.5, g.x, g.y);
    ctx.quadraticCurveTo(g.x + s * 0.45, g.y - s * 0.5 - f * s * 0.5, g.x + s, g.y - f * s);
    ctx.stroke();
    ctx.fillStyle = '#ffb020'; ctx.beginPath(); ctx.arc(g.x - 1.5 * U, g.y + 0.5 * U, 1.4 * U, 0, 7); ctx.fill();
  }
}
function flies() {
  for (const f of G.flies) {
    const a = 0.4 + 0.6 * Math.max(0, Math.sin(f.ph * 3));
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 9 * U);
    g.addColorStop(0, `rgba(230,255,140,${a})`); g.addColorStop(1, 'rgba(230,255,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 9 * U, 0, 7); ctx.fill();
  }
}
function particles() {
  for (const p of G.parts) {
    const a = 1 - p.t / p.life, x = p.world ? p.x - G.cam : p.x;
    ctx.globalAlpha = a;
    if (p.kind === 'puff') { ctx.fillStyle = G.night ? '#c9c4e0' : p.color; ctx.globalAlpha = a * 0.6; ctx.beginPath(); ctx.arc(x, p.y, p.size * (1 + p.t), 0, 7); ctx.fill(); }
    else if (p.kind === 'star') { ctx.fillStyle = p.color; star(x, p.y, p.size * 1.4, p.t * 6); }
    else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, p.y, p.size * a, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of G.floats) {
    const a = f.t < 1.2 ? 1 : 1 - (f.t - 1.2) / 0.4, y = f.y - ease(f.t / 0.6) * 24 * U;
    ctx.globalAlpha = a; ctx.font = `900 ${18 * U}px "Noto Sans TC", sans-serif`;
    ctx.lineWidth = 4 * U; ctx.strokeStyle = '#1d3340'; ctx.strokeText(f.text, f.x - G.cam, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x - G.cam, y);
  }
  ctx.globalAlpha = 1;
}
function star(x, y, r, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = i / 10 * Math.PI * 2 - Math.PI / 2; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function travelScene() {
  const tr = G.travel, t = G.st;
  const a = t < 0.5 ? t / 0.5 : t > 3.9 ? 1 - (t - 3.9) / 0.5 : 1;
  if (a <= 0) return;
  const dest = ISLANDS[tr.switched ? G.island : (G.island + 1) % ISLANDS.length];
  ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
  const p = dest.day, night = G.night;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, night ? '#0a0f30' : p.skyT); g.addColorStop(0.55, night ? mix(p.skyT, '#1a1f52', 0.7) : p.skyB); g.addColorStop(0.551, night ? '#1b2a66' : p.seaD); g.addColorStop(1, night ? '#2a3f88' : p.sea);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const hy = H * 0.55, k = clamp((t - 0.3) / 3.8, 0, 1);
  // 目的地島影
  ctx.fillStyle = night ? '#1c2350' : p.far;
  const ix = lerp(W * 1.1, W * 0.72, k);
  ctx.beginPath(); ctx.moveTo(ix - 160 * U, hy); ctx.quadraticCurveTo(ix, hy - 110 * U, ix + 200 * U, hy); ctx.fill();
  // 雲／浪
  ctx.strokeStyle = '#ffffff80'; ctx.lineWidth = 2.5 * U;
  for (let i = 0; i < 18; i++) {
    const x = ((hash(i, 80) * W * 1.5 - t * (120 + hash(i, 81) * 140) * U) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.2, y = hy + 12 * U + hash(i, 82) * (H - hy);
    ctx.beginPath(); ctx.moveTo(x - 14 * U, y); ctx.quadraticCurveTo(x, y - 5 * U, x + 14 * U, y); ctx.stroke();
  }
  if (tr.mode === 'boat') {
    const bx = lerp(-80 * U, W + 80 * U, k), by = hy + 30 * U + Math.sin(t * 3) * 4 * U, rot = Math.sin(t * 2.2) * 0.05;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(rot);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-36 * U, -46 * U, 52 * U, 22 * U);
    ctx.fillStyle = '#7dd3fc'; for (let i = 0; i < 4; i++) ctx.fillRect(-31 * U + i * 12 * U, -41 * U, 7 * U, 7 * U);
    ctx.fillStyle = '#ef4444'; ctx.fillRect(4 * U, -64 * U, 10 * U, 20 * U);
    ctx.fillStyle = '#1e40af'; ctx.beginPath(); ctx.moveTo(-70 * U, -24 * U); ctx.lineTo(70 * U, -24 * U); ctx.lineTo(50 * U, 4 * U); ctx.lineTo(-56 * U, 4 * U); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(-60 * U, -16 * U, 122 * U, 4 * U);
    ctx.restore();
    drawBall(bx + 38 * U, by - 38 * U + Math.abs(Math.sin(t * 6)) * -3 * U, 13 * U, 'poke', Math.sin(t * 6) * 0.15);
    for (let i = 0; i < 3; i++) { const u = (t * 1.5 + i / 3) % 1; ctx.fillStyle = `rgba(200,200,210,${0.6 * (1 - u)})`; ctx.beginPath(); ctx.arc(bx + 9 * U - u * 30 * U, by - 70 * U - u * 40 * U, (6 + u * 12) * U, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#ffffffb0'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(bx - 70 * U - i * 16 * U, by + 2 * U, (7 - i) * U, 0, 7); ctx.fill(); }
  } else {
    // 大鳥載著主角飛過去
    const bx = lerp(-90 * U, W + 90 * U, k), by = H * 0.32 + Math.sin(t * 2) * 14 * U, f = Math.sin(t * 9);
    ctx.save(); ctx.translate(bx, by);
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.moveTo(-10 * U, -4 * U); ctx.lineTo(-70 * U, -40 * U * f - 6 * U); ctx.lineTo(-30 * U, 6 * U); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10 * U, -4 * U); ctx.lineTo(40 * U, -46 * U * f - 6 * U); ctx.lineTo(26 * U, 6 * U); ctx.fill();
    ctx.fillStyle = '#fb923c'; ctx.beginPath(); ctx.ellipse(0, 0, 44 * U, 18 * U, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(44 * U, -12 * U, 14 * U, 0, 7); ctx.fill();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(56 * U, -14 * U); ctx.lineTo(72 * U, -8 * U); ctx.lineTo(56 * U, -6 * U); ctx.fill();
    ctx.fillStyle = '#1d3340'; ctx.beginPath(); ctx.arc(48 * U, -15 * U, 2.5 * U, 0, 7); ctx.fill();
    ctx.fillStyle = '#fdba74'; ctx.beginPath(); ctx.moveTo(-40 * U, 0); ctx.lineTo(-64 * U, -10 * U); ctx.lineTo(-62 * U, 10 * U); ctx.fill();
    ctx.restore();
    drawBall(bx + 4 * U, by - 22 * U, 13 * U, 'poke', -0.2);
  }
  // 島名
  const tk = clamp((t - 1.0) / 0.4, 0, 1);
  if (tk > 0) {
    const s = backOut(tk), y = H * 0.2;
    ctx.save(); ctx.translate(W / 2, y); ctx.scale(s, s);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const big = Math.min(54 * U, W * 0.12);
    ctx.font = `600 ${16 * U}px Fredoka, sans-serif`; ctx.fillStyle = '#ffffff'; ctx.fillText('ALOLA!', 0, -big * 0.95);
    ctx.font = `900 ${big}px "Noto Sans TC", sans-serif`;
    ctx.lineWidth = 8 * U; ctx.strokeStyle = '#1d3340'; ctx.lineJoin = 'round'; ctx.strokeText(dest.zh, 0, 0);
    ctx.fillStyle = dest.dot; ctx.fillText(dest.zh, 0, 0);
    ctx.font = `700 ${17 * U}px Fredoka, sans-serif`; ctx.fillStyle = '#ffffff'; ctx.fillText(dest.en + '  ·  No.' + pad3(dest.range[0]) + '–' + pad3(dest.range[1]), 0, big * 0.85);
    ctx.restore();
  }
  ctx.restore();
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const p = pal();
  sky(p);
  if (!G.night) gulls();
  mountains(p);
  sea(p);
  beach(p);
  palms(p);
  for (const o of G.objs) o.type === 'bush' ? bush(o, p) : chest(o);
  if (G.worm.dark > 0.01 || G.worm.crack > 0.01 || G.bolts.length || G.boltFlash > 0) wormhole();
  if (G.night) flies();
  hero();
  const e = G.enc;
  if (e) {
    drawPoke(e);
    if (e.bshow) drawBall(e.bx, e.by, 13 * U, e.ball, e.brot, e.bopen, G.state === 'click' ? 1 - G.st / 0.65 : 0);
  }
  particles();
  foreground(p);
  if (G.state === 'travel') travelScene();
}

/* ============ UI ============ */
const setK = (k, v) => document.querySelectorAll(`[data-k="${k}"]`).forEach(el => { el.textContent = v; });
function refreshUI() {
  setK('dex', C.count());
  setK('shiny', C.shinyCount());
  setK('ultra', POKEDEX.filter(p => (p.tier === 'legend' || UB.has(p.id)) && C.has(p.id)).length);
  setK('bait', G.bait);
  $('baitChip').classList.toggle('on', G.bait > 0);
  const is = ISLANDS[G.island];
  $('isName').textContent = is.zh; $('isDot').style.background = is.dot;
  $('islList').innerHTML = ISLANDS.map((s, i) => `<div class="${i === G.island ? 'cur' : ''}"><i style="background:${s.dot}"></i>${s.zh}<em>${s.all.filter(p => C.has(p.id)).length}/${s.all.length}</em></div>`).join('');
  renderRecent();
}
function updateHUD() {
  $('isProg').style.width = (clamp(G.islandT / ISLAND_DUR, 0, 1) * 100).toFixed(1) + '%';
  $('hint').classList.toggle('show', G.state === 'ready' && !cfg.auto);
}
function renderRecent() {
  const r = C.recent();
  $('recent').innerHTML = r.length ? r.map(({ id, s }) => `<div class="ri ${P[id].tier}"><img src="${C.img(id, s)}" alt=""><div class="rn"><b>#${pad3(C.no(id))}</b>${P[id].zh}</div>${s ? '<span class="sh">✨</span>' : ''}</div>`).join('')
    : '<div class="empty-r">還沒有抓到寶可夢，往前走走看吧！</div>';
}
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }
function flashScreen(rainbow) { const f = $('flash'); f.classList.remove('go'); f.classList.toggle('rainbow', !!rainbow); void f.offsetWidth; f.classList.add('go'); }

let cardT = 0;
function showCaught(e) {
  if (isSpecial(e)) { G.waitSpot = true; showSpot(e).then(() => { G.waitSpot = false; }); return; }
  sfx.caught(e.rank);
  const c = $('card');
  c.className = 'card ' + e.tier + (e.shiny ? ' shiny' : '');
  $('cTier').textContent = tierLabel(e.id);
  $('cImg').src = C.img(e.id, e.shiny);
  $('cNo').textContent = '#' + pad3(C.no(e.id));
  $('cName').textContent = (e.shiny ? '✨' : '') + P[e.id].zh;
  $('cNew').style.display = e.isNew ? '' : 'none';
  void c.offsetWidth; c.classList.add('show');
  clearTimeout(cardT); cardT = setTimeout(() => c.classList.remove('show'), 1900);
}
function showSpot(e) {
  return new Promise(res => {
    const sp = $('spot');
    const hint = e.shiny ? ['✨ 閃光寶可夢！', '#ffd166', '#ffd16633'] : e.tier === 'legend' ? ['⚡ ' + tierLabel(e.id) + '！', '#d8b4fe', '#c084fc33']
      : e.ub ? ['🌀 究極異獸！', '#a5f3fc', '#67e8f933'] : ['★ 超稀有！', '#fbbf24', '#fbbf2433'];
    sp.style.setProperty('--hint', hint[1]); sp.style.setProperty('--ray', hint[2]);
    $('spHint').textContent = hint[0];
    $('spImg').src = C.img(e.id, e.shiny);
    $('spName').textContent = (e.shiny ? '✨' : '') + P[e.id].zh;
    $('spMeta').textContent = `#${pad3(C.no(e.id))} · ${tierLabel(e.id)}${e.isNew ? ' · NEW!' : ''}`;
    $('spImg').style.animation = 'none'; void sp.offsetWidth; $('spImg').style.animation = '';
    sp.classList.add('show');
    flashScreen(e.shiny); sfx.flash(); sfx.fanfare();
    let done = false;
    const fin = () => { if (done) return; done = true; sp.classList.remove('show'); sp.removeEventListener('pointerdown', fin); res(); };
    setTimeout(() => sp.addEventListener('pointerdown', fin), 500);
    setTimeout(fin, 3400);
  });
}
async function runEvos(evos) {
  G.evoBusy = true;
  for (const ev of evos) {
    const el = $('evo');
    $('evFrom').textContent = P[ev.from].zh;
    $('evText').innerHTML = '……';
    const a = $('evA'), b = $('evB');
    a.src = C.img(ev.from, false); b.src = C.img(ev.to, false);
    a.style.animation = b.style.animation = 'none'; void el.offsetWidth; a.style.animation = b.style.animation = '';
    el.classList.add('show'); sfx.evolve();
    await sleep(1650);
    $('evText').innerHTML = `進化成 <b>${P[ev.to].zh}</b>！${ev.isNew ? ' NEW' : ''} <span style="font-family:Fredoka;color:#5d7380">#${pad3(C.no(ev.to))}</span>`;
    flashScreen(false);
    await sleep(1300);
    el.classList.remove('show');
    await sleep(200);
  }
  G.evoBusy = false;
  refreshUI();
}

/* ============ 圖鑑 ============ */
let dexIsl = 'all', dexFil = 'all', dexPage = 0;
const shinyView = new Set();
function dexList() {
  let list = POKEDEX;
  if (dexIsl === 'ultra') list = list.filter(p => p.tier === 'legend' || UB.has(p.id));
  else if (dexIsl !== 'all') { const r = ISLANDS[+dexIsl].range; list = list.filter(p => p.no >= r[0] && p.no <= r[1]); }
  const E = id => C.store.dex[id] || {};
  if (dexFil === 'got') list = list.filter(p => E(p.id).got);
  if (dexFil === 'miss') list = list.filter(p => !E(p.id).got);
  if (dexFil === 'shiny') list = list.filter(p => E(p.id).gotS);
  return list;
}
function openDex() {
  pause('dex'); $('dex').classList.add('show');
  $('dxCnt').innerHTML = `已登錄 <b>${C.count()}</b>/403　閃光 <b>${C.shinyCount()}</b>`;
  $('dxIsl').innerHTML = [['all', '全部'], ...ISLANDS.map((s, i) => [String(i), s.zh]), ['ultra', '🌀 究極・傳說']].map(([k, t]) => `<button data-i="${k}" class="${k === dexIsl ? 'on' : ''}">${t}</button>`).join('');
  $('dxFil').innerHTML = [['all', '全部'], ['got', '已登錄'], ['miss', '未登錄'], ['shiny', '✨ 閃光']].map(([k, t]) => `<button data-f="${k}" class="${k === dexFil ? 'on' : ''}">${t}</button>`).join('');
  requestAnimationFrame(renderDex);
}
function closeDex() { $('dex').classList.remove('show'); resume('dex'); }
function renderDex() {
  const grid = $('dxGrid'), box = grid.parentElement;
  const w = box.clientWidth - 28, h = box.clientHeight - 16;
  const cols = Math.max(3, Math.floor((w + 6) / 88)), rows = Math.max(2, Math.floor((h + 6) / 100)), per = cols * rows;
  const list = dexList(), pages = Math.max(1, Math.ceil(list.length / per));
  dexPage = clamp(dexPage, 0, pages - 1);
  grid.style.gridTemplateColumns = `repeat(${cols},1fr)`; grid.style.gridTemplateRows = `repeat(${rows},1fr)`;
  grid.innerHTML = list.slice(dexPage * per, dexPage * per + per).map(p => {
    const e = C.store.dex[p.id] || {}, sh = e.gotS && shinyView.has(p.id);
    return `<div class="dcell ${e.got ? p.tier : 'miss'} ${e.gotS ? 'gotS' : ''} ${sh ? 'sh' : ''}" data-id="${p.id}"><span class="n">#${pad3(p.no)}</span>
      ${e.got ? `<span class="c">×${(e.n || 0) + (e.s || 0)}</span>` : ''}${e.gotS ? '<span class="st">✨</span>' : ''}
      <img src="${C.img(p.id, sh)}" alt="" loading="lazy"><div class="nm">${e.got ? p.zh : '？？？'}</div></div>`;
  }).join('') || '<div class="empty-r" style="grid-column:1/-1;align-self:center;text-align:center">還沒有符合的寶可夢</div>';
  $('dxPage').textContent = `${dexPage + 1}/${pages}`;
}
$('dxGrid').addEventListener('click', ev => {
  const c = ev.target.closest('.dcell'); if (!c) return;
  const id = +c.dataset.id, e = C.store.dex[id];
  if (!(e && e.gotS)) return;
  shinyView.has(id) ? shinyView.delete(id) : shinyView.add(id);
  renderDex();
});
$('dxIsl').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; dexIsl = b.dataset.i; dexPage = 0; $('dxIsl').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderDex(); });
$('dxFil').addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return; dexFil = b.dataset.f; dexPage = 0; $('dxFil').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderDex(); });
$('dxPrev').addEventListener('click', () => { dexPage--; renderDex(); });
$('dxNext').addEventListener('click', () => { dexPage++; renderDex(); });
$('dxClose').addEventListener('click', closeDex);
$('dex').addEventListener('click', ev => { if (ev.target === $('dex')) closeDex(); });
let swipeX = null;
$('dxGrid').addEventListener('pointerdown', ev => { swipeX = ev.clientX; });
$('dxGrid').addEventListener('pointerup', ev => { if (swipeX === null) return; const dx = ev.clientX - swipeX; swipeX = null; if (Math.abs(dx) > 50) { dexPage += dx < 0 ? 1 : -1; renderDex(); } });
window.addEventListener('resize', () => { if ($('dex').classList.contains('show')) renderDex(); });

/* ============ 暫停與控制 ============ */
function pause(r) { G.pauses.add(r); G.holding = false; syncPause(); }
function resume(r) { G.pauses.delete(r); syncPause(); }
function syncPause() {
  $('paused').classList.toggle('show', G.pauses.has('user'));
  document.querySelectorAll('[data-act="pause"]').forEach(b => { b.classList.toggle('on', G.pauses.has('user')); b.innerHTML = G.pauses.has('user') ? (b.classList.contains('bb') ? '▶<small>繼續</small>' : '▶ 繼續') : (b.classList.contains('bb') ? '⏸<small>暫停</small>' : '⏸ 暫停'); });
}
function togglePause() { G.pauses.has('user') ? resume('user') : pause('user'); }
function syncSwitches() {
  document.querySelectorAll('[data-sw]').forEach(b => b.classList.toggle('on', !!cfg[b.dataset.sw]));
  $('autoChip').classList.toggle('off', !cfg.auto); $('autoChip').textContent = cfg.auto ? 'AUTO' : 'MANUAL';
}
document.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => {
  AU.init();
  const k = b.dataset.sw; cfg[k] = !cfg[k]; saveCfg(); syncSwitches();
  if (k === 'music') AU.setMusic(cfg.music);
  if (k === 'sfx') AU.setSfx(cfg.sfx);
  if (k === 'auto') toast(cfg.auto ? '🤖 自動丟球：開' : '👆 自動丟球：關（點畫面丟球）');
}));
document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
  AU.init();
  const a = b.dataset.act;
  if (a === 'home') location.href = '../';
  if (a === 'dex') openDex();
  if (a === 'pause') togglePause();
}));
$('resumeBtn').addEventListener('click', () => resume('user'));

function firstTouch() { AU.init(); $('sndHint').classList.add('hide'); }
stage.addEventListener('pointerdown', ev => {
  if (ev.target.closest('.spot, .paused, .evo')) return;
  ev.preventDefault();
  firstTouch();
  if (G.pauses.size) return;
  if (G.state === 'ready') throwBall();
  else G.holding = true;
});
['pointerup', 'pointercancel', 'pointerleave'].forEach(n => stage.addEventListener(n, () => { G.holding = false; }));
window.addEventListener('pointerdown', () => firstTouch(), { once: true });
window.addEventListener('keydown', ev => {
  if ($('dex').classList.contains('show')) {
    if (ev.key === 'ArrowRight') { dexPage++; renderDex(); }
    if (ev.key === 'ArrowLeft') { dexPage--; renderDex(); }
    if (ev.key === 'Escape') closeDex();
    return;
  }
  if (ev.code === 'Space') { ev.preventDefault(); firstTouch(); if (G.state === 'ready' && !G.pauses.size) throwBall(); else G.holding = true; }
  if (ev.key === 'p' || ev.key === 'P') togglePause();
  if (ev.key === 'd' || ev.key === 'D') openDex();
});
window.addEventListener('keyup', ev => { if (ev.code === 'Space') G.holding = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) AU.suspend(); else AU.resume(); });

/* ============ 主迴圈 ============ */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!G.pauses.size) {
    // 夜晚每分鐘檢查一次
    if (Math.floor(G.t / 60) !== Math.floor((G.t + dt) / 60)) { const n = calcNight(); if (n !== G.night) { G.night = n; AU.setIsland(ISLANDS[G.island].bpmKey, n); } }
    let left = dt * G.ts;
    while (left > 0) { const d = Math.min(0.05, left); update(d); left -= d; }
  }
  render();
  requestAnimationFrame(frame);
}

/* ============ 測試用 ============ */
window.__alola = {
  G, C,
  worm() { G.worm.at = G.islandT; },
  island() { G.islandT = ISLAND_DUR; },
  chest() { const x = heroWorld() + 160 * U; G.objs.forEach(o => { if (!o.done && o.x < x + 300 * U) o.x += 300 * U; }); G.objs.push({ type: 'chest', x, open: 0 }); G.objs.sort((a, b) => a.x - b.x); },
  speed(n) { G.ts = n; },
  shiny() { G.pending = { id: pick(ISLANDS[G.island].pool).id, shiny: true, worm: false }; },
  state: () => ({ state: G.state, island: ISLANDS[G.island].zh, islandT: +G.islandT.toFixed(1), caught: G.caught, dex: C.count(), bait: G.bait, pending: G.pending }),
};

resize();
syncSwitches(); syncPause();
AU.setIsland(ISLANDS[0].bpmKey, G.night);
refreshUI();
startTravel(true);
requestAnimationFrame(frame);
