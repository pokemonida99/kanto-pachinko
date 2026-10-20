'use strict';
/* 卡洛斯卡包研究所：挑卡包 → 撕封 → 5 張卡一張張翻 → 收進卡冊 */
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad3 = Collect.pad3;

const C = Collect.create({ key: 'kalosPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
const P = C.P;
const SHINY_RATE = 1 / 60;
const SUBS = [
  { zh: '中央', en: 'CENTRAL', c: '#ff6fae', bar: 'linear-gradient(90deg,#ff8cc0,#e8467c)', cover: 658 },
  { zh: '海岸', en: 'COASTAL', c: '#4aa8ff', bar: 'linear-gradient(90deg,#8fe3ff,#2f8cf0)', cover: 131 },
  { zh: '山岳', en: 'MOUNTAIN', c: '#8b74ff', bar: 'linear-gradient(90deg,#c9b2ff,#6b54d6)', cover: 715 },
];
const BOOK = [0, 1, 2].map(s => POKEDEX.filter(p => p.sub === s).sort((a, b) => a.subNo - b.subNo));
BOOK.forEach((l, s) => { SUBS[s].n = l.length; });
const POOL = BOOK.map(l => l.filter(p => p.tier !== 'legend'));
const SRARE = POOL.map(l => l.filter(p => p.tier === 'srare'));
const LEGS = BOOK.map(l => l.filter(p => p.tier === 'legend'));
const LEGEND_PACK = [716, 717, 718];
const TYPE = {
  normal: ['一般', '#a8a77a'], fire: ['火', '#ee8130'], water: ['水', '#6390f0'], electric: ['電', '#e8bf1c'], grass: ['草', '#6fbf44'],
  ice: ['冰', '#6cc9c4'], fighting: ['格鬥', '#c22e28'], poison: ['毒', '#a33ea1'], ground: ['地面', '#d0aa4f'], flying: ['飛行', '#9a83ea'],
  psychic: ['超能力', '#f95587'], bug: ['蟲', '#98ab14'], rock: ['岩石', '#b6a136'], ghost: ['幽靈', '#735797'], dragon: ['龍', '#6f35fc'],
  dark: ['惡', '#705746'], steel: ['鋼', '#9a9ab8'], fairy: ['妖精', '#d685ad'],
};
const TIER_LBL = { common: 'COMMON', rare: 'RARE', srare: 'SUPER RARE', legend: 'LEGEND' };

/* ============ 狀態（另一個 key，不動 .dex 格式） ============ */
const ST_KEY = 'kalosPachinko.state';
const S = { opened: 0, legendN: 0, music: true, sfx: true, chain: false };
try { Object.assign(S, JSON.parse(localStorage.getItem(ST_KEY)) || {}); } catch (e) {}
if (/[?&]reset\b/.test(location.search)) { S.opened = 0; S.legendN = 0; }
const saveS = () => { try { localStorage.setItem(ST_KEY, JSON.stringify(S)); } catch (e) {} };
const kindOf = n => (n % 30 === 0 ? 'legend' : n % 10 === 0 ? 'special' : 'normal');
const nextKind = () => kindOf(S.opened + 1);

/* ============ 音樂音效（WebAudio 即時合成） ============ */
const AU = (() => {
  let ac = null, master, bgm, bgmLP, sfx, noiseBuf, nextT = 0, step = 0, lastCr = 0;
  const BGM_VOL = 0.42;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = S.music ? BGM_VOL : 0; bgm.connect(master);
    bgmLP = ac.createBiquadFilter(); bgmLP.type = 'lowpass'; bgmLP.frequency.value = 2600; bgmLP.connect(bgm);
    sfx = ac.createGain(); sfx.gain.value = S.sfx ? 1 : 0; sfx.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextT = ac.currentTime + 0.1;
    setInterval(schedule, 30);
  }
  function osc(dest, type, f, t, dur, vol, slideTo, det = 0) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = det;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000, fTo) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = 1.2;
    if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // 背景音樂：巴黎街角的手風琴圓舞曲（3/4 拍），Am–Dm–G–C／F–Dm–E–Am
  const E = 0.2;
  const LEAD = [
    [76, 0, 74, 72, 71, 72], [74, 0, 77, 76, 74, 72], [71, 0, 74, 79, 77, 74], [76, 0, 0, 72, 0, 0],
    [77, 0, 76, 77, 81, 77], [76, 0, 74, 72, 74, 77], [76, 0, 75, 76, 80, 83], [81, 0, 0, 76, 0, 0],
    [72, 0, 71, 72, 76, 72], [74, 0, 72, 74, 77, 74], [79, 0, 77, 76, 74, 71], [72, 0, 76, 79, 84, 0],
    [81, 0, 79, 77, 76, 77], [74, 0, 76, 77, 81, 79], [76, 0, 80, 83, 80, 76], [81, 0, 0, 0, 0, 0],
  ];
  const ROOT = [45, 50, 43, 48, 41, 50, 40, 45, 45, 50, 43, 48, 41, 50, 40, 45];
  const CH = { 45: [57, 60, 64], 50: [57, 62, 65], 43: [55, 59, 62], 48: [55, 60, 64], 41: [57, 60, 65], 40: [56, 59, 64] };
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % (LEAD.length * 6); }
  }
  function playStep(s, t) {
    const bar = Math.floor(s / 6), i = s % 6, n = LEAD[bar][i], r = ROOT[bar];
    if (n) {
      const len = LEAD[bar][i + 1] === 0 ? E * 1.8 : E * 0.95;
      osc(bgmLP, 'sawtooth', hz(n), t, len, 0.012, 0, -7); osc(bgmLP, 'sawtooth', hz(n), t, len, 0.012, 0, 7);
      osc(bgmLP, 'triangle', hz(n), t, len * 1.2, 0.03);
    }
    if (i === 0) { osc(bgm, 'triangle', hz(r), t, E * 1.8, 0.11); osc(bgm, 'sine', hz(r - 12), t, E * 1.6, 0.08); }
    if (i === 2 || i === 4) CH[r].forEach(m => { osc(bgmLP, 'square', hz(m), t, E * 0.6, 0.006); osc(bgmLP, 'triangle', hz(m), t, E * 0.7, 0.012); });
    if (i === 2 || i === 4) noise(bgm, t, 0.04, 0.02, 'highpass', 8000);
  }
  function duck(sec) {
    if (!ac || !S.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.15, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  function setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } }
  function setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); }
  function notes(list, type = 'square', vol = 0.045, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m), t, d * 0.95, vol); osc(sfx, 'triangle', hz(m - 12), t, d, vol * 0.8); } t += d; }
    return t - ac.currentTime;
  }
  const play = {
    ui() { if (ac) osc(sfx, 'sine', 880, ac.currentTime, 0.06, 0.05, 1320); },
    pick() { if (!ac) return; const t = ac.currentTime; noise(sfx, t, 0.25, 0.12, 'bandpass', 600, 2400); osc(sfx, 'triangle', hz(79), t + 0.05, 0.15, 0.04); },
    crinkle() {
      if (!ac) return; const n = performance.now(); if (n - lastCr < 45) return; lastCr = n;
      noise(sfx, ac.currentTime, 0.05, 0.12, 'bandpass', 2500 + Math.random() * 3000);
    },
    rip() {
      if (!ac) return; const t0 = ac.currentTime;
      for (let i = 0; i < 9; i++) noise(sfx, t0 + i * 0.03 + Math.random() * 0.01, 0.06, 0.28 - i * 0.02, 'bandpass', 4200 - i * 330);
      noise(sfx, t0, 0.38, 0.14, 'highpass', 1800, 600);
    },
    deal() { if (!ac) return; const t = ac.currentTime; noise(sfx, t, 0.09, 0.14, 'bandpass', 3200, 1400); osc(sfx, 'sine', 300, t, 0.05, 0.03, 180); },
    flip() { if (!ac) return; const t = ac.currentTime; noise(sfx, t, 0.12, 0.13, 'bandpass', 1500, 4500); osc(sfx, 'sine', 520, t + 0.06, 0.08, 0.04, 900); },
    common() { if (ac) { osc(sfx, 'triangle', hz(84), ac.currentTime, 0.3, 0.05); osc(sfx, 'sine', hz(91), ac.currentTime + 0.06, 0.25, 0.03); } },
    rare() { duck(1); notes([[84, 0.07], [88, 0.07], [91, 0.07], [96, 0.3]], 'triangle', 0.05); },
    srare() {
      duck(2.4);
      const d = notes([[72, 0.1], [76, 0.1], [79, 0.1], [84, 0.2], [79, 0.1], [84, 0.1], [88, 0.55]], 'square', 0.04);
      if (ac) [76, 79, 84, 88].forEach(m => osc(sfx, 'triangle', hz(m), ac.currentTime + d - 0.55, 1.1, 0.025));
    },
    legend() {
      duck(4);
      const d = notes([[69, 0.16], [72, 0.16], [76, 0.16], [81, 0.32], [79, 0.16], [81, 0.16], [84, 0.48], [83, 0.16], [84, 0.16], [88, 0.9]], 'square', 0.045);
      if (!ac) return; const t = ac.currentTime + d - 0.9;
      [69, 76, 81, 85, 88].forEach(m => { osc(sfx, 'sawtooth', hz(m), t, 1.6, 0.012, 0, -6); osc(sfx, 'sawtooth', hz(m), t, 1.6, 0.012, 0, 6); });
      noise(sfx, t, 1.2, 0.1, 'highpass', 5000);
    },
    shiny() {
      if (!ac) return; duck(2.2); const t = ac.currentTime;
      [96, 100, 103, 108, 103, 108, 112, 115].forEach((m, i) => osc(sfx, 'sine', hz(m), t + i * 0.06, 0.4, 0.035));
      [84, 88, 91].forEach(m => osc(sfx, 'triangle', hz(m), t + 0.5, 1.2, 0.03));
      noise(sfx, t, 1.3, 0.07, 'highpass', 9000);
    },
    glow(dur) {
      if (!ac) return; duck(dur + 1.5); const t = ac.currentTime;
      osc(sfx, 'sawtooth', 180, t, dur, 0.02, 760); osc(sfx, 'sine', 360, t, dur, 0.04, 1520);
      for (let x = 0; x < dur; x += 0.09) noise(sfx, t + x, 0.06, 0.02 + 0.08 * (x / dur), 'bandpass', 1200 + 2400 * (x / dur));
    },
    newp(i = 0) { if (ac) { osc(sfx, 'sine', hz(88 + i * 2), ac.currentTime, 0.12, 0.05, hz(95 + i * 2)); } },
    evolve() {
      duck(2.8); if (!ac) return; const t = ac.currentTime;
      for (let i = 0; i < 16; i++) osc(sfx, 'triangle', hz(60 + i * 2), t + i * 0.08, 0.12, 0.035);
      notes([[84, 0.12], [88, 0.12], [91, 0.12], [96, 0.6]], 'square', 0.04, 1.35);
    },
    page() { if (ac) noise(sfx, ac.currentTime, 0.28, 0.14, 'bandpass', 900, 3800); },
    collect() { if (!ac) return; const t = ac.currentTime; for (let i = 0; i < 5; i++) noise(sfx, t + i * 0.05, 0.06, 0.1, 'bandpass', 2600 + i * 200); osc(sfx, 'sine', hz(84), t + 0.3, 0.2, 0.04, hz(96)); },
    enter() { if (ac) noise(sfx, ac.currentTime, 0.2, 0.08, 'bandpass', 500, 1500); },
  };
  return { init, play, setMusic, setSfx, suspend: () => ac && ac.suspend(), resume: () => ac && ac.resume() };
})();
const sfx = AU.play;

/* ============ 粒子（Canvas 只做粒子） ============ */
const FX = (() => {
  const cv = $('fx'), g = cv.getContext('2d');
  let parts = [], dpr = 1;
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
  resize(); addEventListener('resize', resize);
  const RB = ['#ff6fae', '#ffb86b', '#fff27a', '#7cf2a6', '#6fd8ff', '#a58bff'];
  function burst(x, y, kind, n = 24) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * (kind === 'bit' ? 4 : 6);
      const col = kind === 'gold' ? (Math.random() < .5 ? '#ffe39a' : '#fff7db') : kind === 'silver' ? (Math.random() < .5 ? '#ffffff' : '#c9d4ff')
        : kind === 'bit' ? (Math.random() < .5 ? '#fff' : '#ffd1e6') : RB[i % RB.length];
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'bit' ? 2 : 1), life: 1, decay: 0.012 + Math.random() * 0.016,
        r: kind === 'bit' ? 3 + Math.random() * 4 : 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * 0.3,
        kind: kind === 'bit' ? 'bit' : kind === 'conf' ? 'conf' : 'star', col, grav: kind === 'bit' || kind === 'conf' ? 0.18 : 0.03,
      });
    }
  }
  function glitter(rect, n = 3) {
    for (let i = 0; i < n; i++) parts.push({
      x: rect.left + Math.random() * rect.width, y: rect.top + Math.random() * rect.height, vx: 0, vy: -0.3, life: 1, decay: 0.03,
      r: 1.5 + Math.random() * 3.5, rot: 0, vr: 0, kind: 'star', col: RB[(Math.random() * RB.length) | 0], grav: 0,
    });
  }
  function confetti(n = 80) {
    for (let i = 0; i < n; i++) parts.push({
      x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - .5) * 2, vy: 2 + Math.random() * 3, life: 1, decay: 0.004,
      r: 4 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * 0.25, kind: 'conf', col: RB[i % RB.length], grav: 0.02,
    });
  }
  function star(x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.28 : r, a = i * Math.PI / 4; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function step() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (!parts.length) return;
    parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.vx *= 0.985; p.rot += p.vr; p.life -= p.decay;
      g.globalAlpha = clamp(p.life, 0, 1); g.fillStyle = p.col;
      if (p.kind === 'star') { g.shadowColor = p.col; g.shadowBlur = 8; star(p.x, p.y, p.r * (0.6 + 0.4 * Math.sin(p.life * 12))); g.shadowBlur = 0; }
      else { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9); g.restore(); }
    }
    g.globalAlpha = 1;
  }
  return { burst, glitter, confetti, step };
})();

/* ============ 傾斜與全息（滑鼠位置或陀螺儀） ============ */
const tilt = { px: -1, py: -1, mouse: false, gx: 0, gy: 0, gyro: false, lastMove: 0 };
const live = new Set();          // 正在畫面上要跟著傾斜的卡片
addEventListener('pointermove', e => { tilt.px = e.clientX; tilt.py = e.clientY; tilt.mouse = e.pointerType === 'mouse'; tilt.lastMove = performance.now(); }, { passive: true });
addEventListener('pointerdown', e => { tilt.px = e.clientX; tilt.py = e.clientY; tilt.lastMove = performance.now(); }, { passive: true });
document.addEventListener('mouseleave', () => { tilt.px = -1; });
let gyroAsked = false;
function askGyro() {
  if (gyroAsked || typeof DeviceOrientationEvent === 'undefined') return;
  gyroAsked = true;
  const on = () => addEventListener('deviceorientation', e => {
    if (e.gamma == null) return;
    tilt.gyro = true; tilt.gx = clamp(e.gamma / 35, -1, 1) * 0.5; tilt.gy = clamp((e.beta - 45) / 35, -1, 1) * 0.5;
  });
  if (typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') on(); }).catch(() => {});
  else on();
}
function tiltStep(now) {
  const t = now / 1000, fresh = now - tilt.lastMove < 2500;
  // 沒有輸入時慢慢自己晃，讓全息一直有在流動
  let ax = Math.sin(t * 0.7) * 0.22, ay = Math.cos(t * 0.53) * 0.18;
  if (tilt.gyro) { ax = tilt.gx; ay = tilt.gy; }
  else if (fresh && tilt.px >= 0) { ax = tilt.px / innerWidth - 0.5; ay = tilt.py / innerHeight - 0.5; }
  for (const c of live) {
    const r = c.el.getBoundingClientRect();
    let mx = 0.5 + ax, my = 0.5 + ay, rx = ax * 14, ry = -ay * 14;
    const over = fresh && tilt.px >= r.left && tilt.px <= r.right && tilt.py >= r.top && tilt.py <= r.bottom;
    if (over && !tilt.gyro) { mx = (tilt.px - r.left) / r.width; my = (tilt.py - r.top) / r.height; rx = (mx - 0.5) * 30; ry = -(my - 0.5) * 30; }
    c.rx += (rx - c.rx) * 0.15; c.ry += (ry - c.ry) * 0.15; c.mx += (mx - c.mx) * 0.2; c.my += (my - c.my) * 0.2;
    if (c.anim) {
      const p = clamp((now - c.anim.t0) / c.anim.dur, 0, 1), e = c.anim.ease(p);
      c.flip = c.anim.from + (c.anim.to - c.anim.from) * e;
      if (p >= 1) { const a = c.anim; c.anim = null; a.done(); }
    }
    const k = c.flip > 90 ? 1 : 0.35;      // 背面朝上時晃小一點
    c.inner.style.transform = `rotateX(${(c.ry * k).toFixed(2)}deg) rotateY(${(c.flip + c.rx * k).toFixed(2)}deg)`;
    c.el.style.setProperty('--mx', c.mx.toFixed(3)); c.el.style.setProperty('--my', c.my.toFixed(3));
    if (c.sparkle && c.flip > 150 && Math.random() < 0.35) FX.glitter(r, 1);
  }
}
const easeIO = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOutBack = p => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
function animFlip(c, to, dur, ease = easeOutBack) {
  return new Promise(res => { c.anim = { from: c.flip, to, t0: performance.now(), dur, ease, done: res }; });
}

/* ============ 卡片 ============ */
function typeTags(p) { return p.types.map(t => `<span class="ty" style="--c:${(TYPE[t] || TYPE.normal)[1]}">${(TYPE[t] || [t])[0]}</span>`).join(''); }
function faceHTML(id, shiny) {
  const p = P[id], sub = SUBS[p.sub], t1 = (TYPE[p.types[0]] || TYPE.normal)[1], t2 = (TYPE[p.types[1] || p.types[0]] || TYPE.normal)[1];
  return `<div class="face t-${p.tier}${shiny ? ' shiny' : ''}"><div class="fc">
    <div class="ftop"><span class="nm">${p.zh}</span><span class="no">#${pad3(p.subNo)}</span></div>
    <div class="art" style="--t1:${t1}66;--t2:${t2}"><img src="${C.img(id, shiny)}" alt="" draggable="false"><div class="holo"></div></div>
    <div class="finfo">${typeTags(p)}<span class="stars">${'★'.repeat(C.tierRank(id) + 1)}</span></div>
    <div class="fmeta"><span>卡洛斯 No.${pad3(C.no(id))}</span><span>種族值 ${p.bst}</span></div>
    <div class="fdesc"><span class="set" style="--sc:${sub.c}"><i></i>${sub.zh}</span><span class="tier">${TIER_LBL[p.tier]}</span><span>${pad3(p.subNo)}/${sub.n}</span></div>
  </div><div class="foil"></div><div class="glare"></div><div class="newtag">新登錄</div></div>`;
}
function makeCard(id, shiny, cw) {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `<div class="inner"><div class="back"><i></i><b>KALOS</b></div>${faceHTML(id, shiny)}</div>`;
  const c = { el, inner: el.firstChild, id, shiny, tier: P[id].tier, flip: 0, rx: 0, ry: 0, mx: 0.5, my: 0.5, anim: null, flipped: false, busy: false };
  sizeCard(c, cw);
  return c;
}
function sizeCard(c, cw) {
  c.cw = cw; c.el.style.width = cw + 'px'; c.el.style.height = cw * 1.4 + 'px'; c.el.style.setProperty('--cw', cw + 'px');
}
const glowLv = c => (c.shiny || c.tier === 'legend' ? 3 : c.tier === 'srare' ? 2 : c.tier === 'rare' ? 1 : 0);

/* ============ 桌面與卡包 ============ */
const table = $('table');
const L = { W: 0, H: 0, mobile: false, pw: 0, ph: 0, slots: [], held: null, cw: 0, fan: [] };
const packs = [0, 1, 2].map(i => {
  const el = document.createElement('div');
  el.className = 'pack s' + i;
  el.innerHTML = `<div class="pk-body"><div class="crimp"></div><div class="crimp b"></div><div class="pk-shine"></div><div class="pk-frame"></div>
    <svg class="pk-tower" viewBox="0 0 200 600" preserveAspectRatio="xMidYMax meet"><use href="#tower"/></svg>
    <div class="pk-logo">KALOS</div><img class="pk-star" alt="" draggable="false"><div class="pk-title">${SUBS[i].zh}</div><div class="pk-en">${SUBS[i].en}</div><div class="pk-ribbon"></div></div>
    <div class="pk-top"><div class="crimp"></div><em>KALOS · X·Y</em></div><div class="pullHint">⇡ 往上拖撕開・或點一下</div>`;
  table.appendChild(el);
  const pk = { i, el, top: el.querySelector('.pk-top'), body: el.querySelector('.pk-body'), star: el.querySelector('.pk-star'), ribbon: el.querySelector('.pk-ribbon') };
  // 撕口鋸齒：封口條的下緣和本體的上緣互相咬合
  const N = 14, topPts = ['0% 0%', '100% 0%'], bodyPts = [];
  for (let k = N; k >= 0; k--) topPts.push(`${(k / N * 100).toFixed(2)}% ${k % 2 ? 86.7 : 100}%`);
  for (let k = 0; k <= N; k++) bodyPts.push(`${(k / N * 100).toFixed(2)}% ${k % 2 ? 0 : 2.3}%`);
  for (let k = 2 * N; k >= 0; k--) bodyPts.push(`${(k / (2 * N) * 100).toFixed(2)}% ${k % 2 ? 98.5 : 100}%`);
  pk.top.style.clipPath = pk.top.style.webkitClipPath = `polygon(${topPts.join(',')})`;
  pk.body.style.clipPath = pk.body.style.webkitClipPath = `polygon(${bodyPts.join(',')})`;
  el.addEventListener('pointerdown', e => onPackDown(pk, e));
  return pk;
});

function layout() {
  const r = table.getBoundingClientRect();
  const W = L.W = r.width, H = L.H = r.height;
  L.mobile = W < 640;
  const pw = L.pw = L.mobile ? Math.min((W - 10) / 2.86, H * 0.62 / 1.5) : Math.min(240, W / 4.4, H * 0.66 / 1.5);
  const ph = L.ph = pw * 1.5;
  const gap = L.mobile ? -pw * 0.07 : pw * 0.24, x0 = (W - (3 * pw + 2 * gap)) / 2, y = (H - ph) / 2 - (L.mobile ? 8 : 6);
  L.slots = [0, 1, 2].map(i => ({ x: x0 + i * (pw + gap), y: y + (i === 1 ? -8 : 4), rot: [-4, 0, 4][i] }));
  const hs = Math.min(L.mobile ? 1.9 : 1.5, H * 0.74 / ph, W * 0.78 / pw);
  L.held = { x: (W - pw) / 2, y: (H - ph) / 2 + ph * (hs - 1) * 0.12, s: hs };
  // 卡片：桌機一排扇形，手機兩排（3＋2）
  if (L.mobile) {
    const cw = L.cw = Math.min((W - 24) / 3.08, (H - 24) / 2 / 1.4);
    const ch = cw * 1.4, gx = cw * 0.04, rowY = [(H - 2 * ch) / 2 - 2, (H - 2 * ch) / 2 + ch + 6];
    const rx = n => (W - (n * cw + (n - 1) * gx)) / 2;
    L.fan = [0, 1, 2].map(i => ({ x: rx(3) + i * (cw + gx), y: rowY[0] + (i === 1 ? -3 : 0), rot: (i - 1) * 2.5 }))
      .concat([0, 1].map(i => ({ x: rx(2) + i * (cw + gx * 3), y: rowY[1], rot: i ? 2 : -2 })));
  } else {
    const cw = L.cw = Math.min(215, (W - 40) / 5.5, (H - 40) / 1.4 / 1.06);
    const ch = cw * 1.4;
    L.fan = [0, 1, 2, 3, 4].map(i => { const k = i - 2; return { x: W / 2 - cw / 2 + k * cw * 1.06, y: (H - ch) / 2 + k * k * 5 + 4, rot: k * 3.5 }; });
  }
  placePacks(); placeCards(true);
}
function packTf(pk) {
  if (cur && cur.slot === pk.i && cur.packState) {
    const h = L.held, dy = cur.packState === 'away' ? L.ph * 0.35 : 0;
    return `translate(${h.x}px,${h.y + dy}px) scale(${h.s})`;
  }
  const s = L.slots[pk.i];
  return `translate(${s.x}px,${s.y}px) rotate(${s.rot}deg)`;
}
function placePacks() {
  packs.forEach(pk => {
    pk.el.style.width = L.pw + 'px'; pk.el.style.height = L.ph + 'px'; pk.el.style.fontSize = (L.pw / 12) + 'px';
    pk.el.style.transform = packTf(pk);
  });
}
function dressPacks() {
  const kind = nextKind(), lg = LEGEND_PACK[S.legendN % 3];
  packs.forEach(pk => {
    pk.el.classList.toggle('special', kind === 'special'); pk.el.classList.toggle('legend', kind === 'legend');
    pk.star.src = C.img(kind === 'legend' ? lg : SUBS[pk.i].cover, false);
    pk.ribbon.textContent = kind === 'legend' ? '傳說包' : kind === 'special' ? '特別包' : '';
  });
}
function cardTf(c, i) {
  const f = L.fan[i];
  if (c.pos === 'stack') { const h = L.held; return `translate(${L.W / 2 - L.cw / 2}px,${h.y + L.ph * h.s * 0.25}px) rotate(${(i - 2) * 3}deg) scale(.55)`; }
  if (c.pos === 'away') {
    const b = $('btnBinder').getBoundingClientRect(), t = table.getBoundingClientRect();
    return `translate(${b.left - t.left + b.width / 2 - L.cw / 2}px,${b.top - t.top + b.height / 2 - L.cw * 0.7}px) rotate(${(i - 2) * 20}deg) scale(.12)`;
  }
  const lift = c.lift ? -L.cw * 0.08 : 0;
  return `translate(${f.x}px,${f.y + lift}px) rotate(${c.lift ? 0 : f.rot}deg) scale(${c.lift ? 1.06 : 1})`;
}
function placeCards(resize) {
  if (!cur || !cur.cards) return;
  cur.cards.forEach((c, i) => { if (resize) sizeCard(c, L.cw); c.el.style.transform = cardTf(c, i); c.el.style.zIndex = c.lift ? 20 : 10 + i; });
}

/* ============ 開包流程 ============ */
let phase = 'table';       // table → held → dealt → done → table
let cur = null;            // 目前這包 { slot, sub, kind, cards, packState }
let autoRun = false;
let drag = null;

function drawPack(sub, kind) {
  const ids = [], used = new Set();
  for (let i = 0; i < 5; i++) {
    let id = C.pick({ pool: POOL[sub], boost: 0 });
    for (let k = 0; k < 4 && used.has(id); k++) id = C.pick({ pool: POOL[sub], boost: 0 });
    used.add(id); ids.push(id);
  }
  if (kind === 'special') {
    // 保證一張超稀有以上（偶爾直接是這套的傳說）
    const best = ids.some(id => C.tierRank(id) >= 2);
    if (!best) ids[4] = (LEGS[sub].length && Math.random() < 0.12) ? LEGS[sub][(Math.random() * LEGS[sub].length) | 0].id : C.pick({ pool: SRARE[sub], boost: 1 });
  }
  if (kind === 'legend') ids[4] = LEGEND_PACK[S.legendN % 3];
  const cards = ids.map(id => ({ id, shiny: Math.random() < SHINY_RATE }));
  // 最好的一張放最後（第 5 張慢翻）
  const score = c => C.tierRank(c.id) * 2 + (c.shiny ? 3 : 0);
  cards.sort((a, b) => score(a) - score(b));
  return cards;
}

async function pick(slot) {
  if (phase !== 'table') return;
  phase = 'held';
  const kind = nextKind();
  cur = { slot, sub: slot, kind, packState: 'held', cards: null };
  const pk = packs[slot];
  pk.el.classList.remove('enter'); pk.el.classList.add('held'); pk.el.style.zIndex = 5;
  packs.forEach(o => { if (o !== pk) o.el.classList.add('dim'); });
  pk.el.style.transform = packTf(pk);
  sfx.pick();
  setHint(kind === 'legend' ? '✦ 傳說包！往上拖撕開封口 ✦' : kind === 'special' ? '特別包！往上拖撕開封口' : '往上拖撕開封口・或點一下');
  await sleep(450);
}
function putBack() {
  if (phase !== 'held') return;
  const pk = packs[cur.slot];
  cur = null; phase = 'table';
  pk.el.classList.remove('held'); pk.el.style.zIndex = '';
  pk.top.style.transition = ''; pk.top.style.transform = '';
  packs.forEach(o => o.el.classList.remove('dim'));
  placePacks(); refreshHint(); sfx.ui();
}

function onPackDown(pk, e) {
  AU.init(); askGyro();
  if (autoRun) return;
  if (phase === 'table') { e.preventDefault(); pick(pk.i); return; }
  if (phase === 'held' && cur && cur.slot === pk.i) {
    e.preventDefault(); e.stopPropagation();
    drag = { y: e.clientY, dy: 0, id: e.pointerId, pk };
    try { pk.el.setPointerCapture(e.pointerId); } catch (er) {}
    pk.top.style.transition = 'none';
  }
}
addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = Math.max(0, drag.y - e.clientY) / L.held.s;
  if (Math.abs(dy - drag.dy) > 3) sfx.crinkle();
  drag.dy = dy;
  drag.pk.top.style.transform = `translateY(${-dy * 0.45}px) rotate(${-Math.min(14, dy * 0.18)}deg)`;
  if (dy * L.held.s > 70) { drag = null; tear(); }
});
addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null;
  if (d.dy < 10 || d.dy * L.held.s > 30) tear();
  else { d.pk.top.style.transition = ''; d.pk.top.style.transform = ''; }
});
addEventListener('pointercancel', () => { if (drag) { drag.pk.top.style.transition = ''; drag.pk.top.style.transform = ''; drag = null; } });

async function tear() {
  if (phase !== 'held') return;
  phase = 'tearing';
  const pk = packs[cur.slot];
  pk.top.style.transition = 'transform .55s cubic-bezier(.3,.7,.4,1), opacity .55s';
  pk.top.style.transform = 'translate(45%,-240%) rotate(-38deg)'; pk.top.style.opacity = '0';
  sfx.rip();
  const r = pk.el.getBoundingClientRect();
  FX.burst(r.left + r.width * 0.5, r.top + r.height * 0.14, 'bit', 26);
  setHint('');
  await sleep(320);
  // 卡從包裡滑出來
  cur.cards = drawPack(cur.sub, cur.kind).map(d => makeCard(d.id, d.shiny, L.cw));
  cur.cards.forEach((c, i) => {
    c.pos = 'stack'; c.el.style.transition = 'none'; c.el.style.transform = cardTf(c, i); c.el.style.zIndex = 10 + i; c.el.style.opacity = '0';
    c.el.addEventListener('click', () => onCardTap(c));
    table.appendChild(c.el); live.add(c);
  });
  cur.packState = 'away'; pk.el.style.transform = packTf(pk); packs.forEach(o => o.el.classList.add('gone'));
  void table.offsetWidth;
  for (let i = 0; i < 5; i++) {
    const c = cur.cards[i];
    c.el.style.transition = ''; c.el.style.opacity = '1'; c.pos = 'fan'; c.el.style.transform = cardTf(c, i);
    sfx.deal(); await sleep(autoRun ? 80 : 110);
  }
  await sleep(450);
  phase = 'dealt';
  setHint(L.mobile ? '點卡片翻開・第 5 張會自己慢慢翻' : '點卡片一張張翻開・第 5 張會自己慢慢翻');
}

function onCardTap(c) {
  AU.init(); askGyro();
  if (autoRun) return;
  if (phase === 'dealt' && !c.flipped && !c.busy) {
    const i = cur.cards.indexOf(c);
    if (i === 4) slowFlip(c).then(progress); else flipCard(c).then(progress);
  } else if (phase === 'done') collect();
}
async function flipCard(c) {
  if (c.busy || c.flipped) return;
  c.busy = true; c.lift = true; placeCards(); sfx.flip();
  await animFlip(c, 180, autoRun ? 380 : 480);
  c.flipped = true; c.lift = false; placeCards();
  await reveal(c);
  c.busy = false;
}
async function slowFlip(c) {
  if (c.busy || c.flipped) return;
  c.busy = true; c.lift = true; placeCards();
  const lv = glowLv(c), fast = autoRun ? 0.6 : 1, wait = (lv ? 1300 : 700) * fast;
  if (lv) { c.el.classList.add('glow', 'g' + lv, 'shake'); }
  sfx.glow(wait / 1000 + 1.2);
  await sleep(wait);
  c.el.classList.remove('shake');
  // 先翻一點點偷看，停一下，再整個翻過來
  await animFlip(c, 40, 450 * fast, easeIO);
  await sleep((lv ? 380 : 180) * fast);
  sfx.flip();
  await animFlip(c, 180, 1100 * fast, easeOutBack);
  c.el.classList.remove('glow', 'g1', 'g2', 'g3');
  c.flipped = true; c.lift = false; placeCards();
  await reveal(c);
  c.busy = false;
}
async function reveal(c) {
  if (c.shiny || c.tier === 'legend' || c.tier === 'srare') await spotQ;
  const r = c.el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (c.shiny) { c.sparkle = true; FX.burst(x, y, 'rb', 50); sfx.shiny(); await spotlight(c); }
  else if (c.tier === 'legend') { FX.burst(x, y, 'rb', 60); FX.confetti(90); sfx.legend(); flash(); await spotlight(c); }
  else if (c.tier === 'srare') { FX.burst(x, y, 'gold', 40); sfx.srare(); await spotlight(c); }
  else if (c.tier === 'rare') { FX.burst(x, y, 'silver', 18); sfx.rare(); }
  else sfx.common();
}
async function progress() {
  if (!cur || phase !== 'dealt') return;
  const cs = cur.cards;
  if (cs.slice(0, 4).every(c => c.flipped) && !cs[4].flipped && !cs[4].busy) {
    cs[4].busy = true; await spotQ; await sleep(autoRun ? 200 : 380); cs[4].busy = false;   // 前一張的特寫關掉後才開始慢翻
    await slowFlip(cs[4]);
  }
  if (phase === 'dealt' && cs.every(c => c.flipped) && !cur.finishing) { cur.finishing = true; await finish(); }
}
async function finish() {
  await sleep(250);
  let k = 0;
  for (const c of cur.cards) {
    const res = C.add(c.id, c.shiny);
    if (res.isNew) { c.el.querySelector('.newtag').classList.add('on'); sfx.newp(k++); await sleep(140); }
  }
  const evos = C.evolve();
  S.opened++; if (cur.kind === 'legend') S.legendN++;
  saveS(); refreshUI(true);
  if (evos.length) { await sleep(500); await showEvos(evos); }
  phase = 'done';
  setHint('點一下收進卡冊');
}
async function collect() {
  if (phase !== 'done') return;
  phase = 'collecting'; setHint('');
  sfx.collect();
  cur.cards.forEach((c, i) => { setTimeout(() => { c.pos = 'away'; c.el.style.transform = cardTf(c, i); c.el.style.opacity = '0'; }, i * 60); });
  await sleep(650);
  $('btnBinder').classList.remove('bump'); void $('btnBinder').offsetWidth; $('btnBinder').classList.add('bump');
  cur.cards.forEach(c => { live.delete(c); c.el.remove(); });
  // 補一包新的上桌
  const pk = packs[cur.slot];
  cur = null; phase = 'table';
  pk.el.classList.remove('held', 'gone'); pk.el.style.zIndex = '';
  pk.top.style.transition = 'none'; pk.top.style.transform = ''; pk.top.style.opacity = '';
  packs.forEach(o => o.el.classList.remove('dim', 'gone'));
  dressPacks(); placePacks();
  void pk.el.offsetWidth; pk.top.style.transition = '';
  pk.el.classList.add('enter'); sfx.enter();
  const k = nextKind();
  if (k !== 'normal') { packs.forEach(o => { o.el.classList.remove('wobble'); void o.el.offsetWidth; o.el.classList.add('wobble'); }); toast(k === 'legend' ? '✦ 傳說包上桌了！保證一張傳說 ✦' : '★ 特別包上桌了！保證超稀有以上'); }
  refreshHint();
  await sleep(450);
}

/* ============ 揭曉特寫、進化、提示 ============ */
let spotQ = Promise.resolve();
function spotlight(c) { spotQ = spotQ.then(() => showSpot(c)); return spotQ; }
function showSpot(c) {
  return new Promise(res => {
    const ov = $('spot'), sc = ov.querySelector('.sc'), p = P[c.id];
    const cw = Math.min(innerWidth * 0.66, 300, innerHeight * 0.58 / 1.4);
    const big = makeCard(c.id, c.shiny, cw);
    big.flip = 180; big.sparkle = c.shiny || c.tier === 'legend';
    big.el.style.transform = `translate(${-cw / 2}px,${-cw * 0.7}px)`; big.el.style.transition = 'none';
    big.el.animate([{ transform: `translate(${-cw / 2}px,${-cw * 0.7}px) scale(.3) rotate(-12deg)`, opacity: 0 }, { transform: `translate(${-cw / 2}px,${-cw * 0.7}px) scale(1)`, opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    sc.innerHTML = ''; sc.appendChild(big.el); live.add(big);
    const lab = ov.querySelector('.lab');
    lab.textContent = c.shiny ? '✦ SHINY ✦' : c.tier === 'legend' ? 'LEGENDARY' : 'SUPER RARE';
    ov.style.setProperty('--lg', c.shiny || c.tier === 'legend' ? 'var(--rainbow)' : 'var(--goldm)');
    ov.style.setProperty('--ray', c.shiny ? '#ff9ad0' : c.tier === 'legend' ? '#c9a8ff' : '#ffd25e');
    ov.querySelector('.sub').innerHTML = `<b>${p.zh}${c.shiny ? ' ✦ 閃光' : ''}</b>${SUBS[p.sub].zh}卡洛斯 #${pad3(p.subNo)}・卡洛斯圖鑑 No.${pad3(C.no(c.id))}・${C.tierName(c.id)}${autoRun ? '' : '<br><small>點一下繼續</small>'}`;
    ov.classList.add('on');
    let done = false, timer = 0;
    const close = () => {
      if (done) return; done = true; clearTimeout(timer);
      ov.classList.remove('on'); live.delete(big); sc.innerHTML = ''; ov.onclick = null; res();
    };
    setTimeout(() => { ov.onclick = close; }, 350);
    if (autoRun) timer = setTimeout(close, 1900);
  });
}
function showEvos(evos) {
  return evos.reduce((pr, ev) => pr.then(() => new Promise(res => {
    const ov = $('evo'), box = ov.querySelector('.box'), a = P[ev.from], b = P[ev.to];
    box.innerHTML = `<h3>EVOLUTION</h3><div class="pic"><div class="flash"></div><img class="from" src="${C.img(ev.from)}" alt=""><img class="to" src="${C.img(ev.to)}" alt=""></div>
      <p>${a.zh} 集滿 3 張，進化成了 <b>${b.zh}</b>！${ev.isNew ? '<span class="nw">新登錄</span>' : ''}</p>`;
    ov.classList.add('on'); sfx.evolve();
    setTimeout(() => { const r = box.querySelector('.pic').getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height / 2, 'rb', 40); }, 1300);
    let done = false;
    const close = () => { if (done) return; done = true; ov.classList.remove('on'); ov.onclick = null; res(); };
    setTimeout(() => { ov.onclick = close; }, 900);
    setTimeout(close, autoRun ? 2300 : 4200);
  })), Promise.resolve());
}
function flash() { $('flash').animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' }); }
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
function setHint(h) { $('hint').innerHTML = h; }
function refreshHint() {
  if (phase !== 'table') return;
  const k = nextKind();
  setHint(k === 'legend' ? '✦ 這次是<b>傳說包</b>，挑一包吧 ✦' : k === 'special' ? '★ 這次是<b>特別包</b>，挑一包吧' : '挑一包卡包・中央／海岸／山岳');
}

/* ============ 一鍵開包 ============ */
let autoSlot = -1;
async function autoOne() {
  if (phase === 'table') { autoSlot = (autoSlot + 1) % 3; await pick(autoSlot); }
  if (phase === 'held') { setHint('⚡ 自動開包中…'); await sleep(100); await tear(); setHint('⚡ 自動開包中…'); }
  if (phase === 'dealt') {
    const fl = [];
    for (let i = 0; i < 4; i++) { const c = cur.cards[i]; if (!c.flipped && !c.busy) { fl.push(flipCard(c)); await sleep(170); } }
    await Promise.all(fl);
    while (cur && cur.cards.some(c => c.busy)) await sleep(60);
    await progress();
    while (phase === 'dealt') await sleep(60);
  }
  if (phase === 'done') { await sleep(500); await collect(); }
}
async function startAuto() {
  AU.init(); askGyro();
  if (autoRun) { if (S.chain) { S.chain = false; saveS(); syncBtns(); } return; }
  if (!['table', 'held', 'dealt', 'done'].includes(phase)) return;
  autoRun = true; syncBtns();
  try {
    do { await autoOne(); await sleep(250); } while (S.chain && autoRun);
  } finally { autoRun = false; syncBtns(); refreshHint(); }
}
$('btnAuto').addEventListener('click', startAuto);
$('btnChain').addEventListener('click', () => { AU.init(); S.chain = !S.chain; saveS(); syncBtns(); sfx.ui(); });

/* ============ 卡冊 ============ */
const BK = { sub: 0, page: 0, spread: false, showS: new Set(), turning: false };
const PER = 9;
const pagesOf = s => Math.ceil(BOOK[s].length / PER);
function slotHTML(p) {
  if (!p) return '<div class="slot empty" style="visibility:hidden"></div>';
  const e = C.store.dex[p.id], got = e && e.got, s = e && e.gotS && BK.showS.has(p.id);
  if (!got) return `<div class="slot empty"><span class="sn">#${pad3(p.subNo)}</span><span class="q">?</span><span class="nm">？？？</span></div>`;
  return `<div class="slot got t-${p.tier}${s ? ' showS' : ''}" data-id="${p.id}"><span class="sn">#${pad3(p.subNo)}</span>${e.gotS ? '<span class="sh">✦</span>' : ''}
    <img src="${C.img(p.id, s)}" alt="" loading="lazy" draggable="false"><span class="nm">${p.zh}</span></div>`;
}
function pageHTML(s, pg) {
  const list = BOOK[s], n = pagesOf(s);
  if (pg < 0 || pg >= n) return '<span class="pnum"></span>';
  let h = '';
  for (let k = 0; k < PER; k++) h += slotHTML(list[pg * PER + k]);
  return h + `<span class="pnum">${pg + 1}</span>`;
}
function renderBook() {
  const n = pagesOf(BK.sub);
  BK.spread = $('book').clientWidth >= 720;
  $('book').classList.toggle('spread', BK.spread);
  if (BK.spread) BK.page -= BK.page % 2;
  BK.page = clamp(BK.page, 0, n - 1);
  $('pgL').innerHTML = pageHTML(BK.sub, BK.page);
  $('pgR').innerHTML = BK.spread ? pageHTML(BK.sub, BK.page + 1) : '';
  $('pgInfo').textContent = BK.spread ? `${BK.page + 1}–${Math.min(n, BK.page + 2)} / ${n}` : `${BK.page + 1} / ${n}`;
  $('pgPrev').disabled = BK.page <= 0;
  $('pgNext').disabled = BK.page + (BK.spread ? 2 : 1) >= n;
  $('tabs').innerHTML = SUBS.map((u, s) => {
    const got = BOOK[s].filter(p => C.has(p.id)).length;
    return `<button class="tab${s === BK.sub ? ' on' : ''}" data-s="${s}">${u.zh}<small>${got} / ${u.n}</small></button>`;
  }).join('');
}
function turn(dir) {
  if (BK.turning) return;
  const n = pagesOf(BK.sub), stepN = BK.spread ? 2 : 1, np = BK.page + dir * stepN;
  if (np < 0 || np >= n) return;
  BK.turning = true; sfx.page();
  const book = $('book'), src = dir > 0 ? (BK.spread ? $('pgR') : $('pgL')) : $('pgL');
  const br = book.getBoundingClientRect(), sr = src.getBoundingClientRect();
  const leaf = document.createElement('div');
  leaf.className = 'leaf';
  Object.assign(leaf.style, { left: sr.left - br.left + 'px', top: sr.top - br.top + 'px', width: sr.width + 'px', height: sr.height + 'px' });
  let front, back, from, to, origin;
  if (dir > 0) {
    front = src.innerHTML; back = BK.spread ? pageHTML(BK.sub, np) : '';
    origin = 'left center'; from = 0; to = -180;
    if (BK.spread) $('pgR').innerHTML = pageHTML(BK.sub, np + 1); else $('pgL').innerHTML = pageHTML(BK.sub, np);
  } else if (BK.spread) {
    front = src.innerHTML; back = pageHTML(BK.sub, np + 1);
    origin = 'right center'; from = 0; to = 180;
    $('pgL').innerHTML = pageHTML(BK.sub, np);
  } else {
    front = pageHTML(BK.sub, np); back = '';
    origin = 'left center'; from = -180; to = 0;
  }
  leaf.innerHTML = `<div class="page">${front}</div><div class="page bk2">${back}</div>`;
  leaf.style.transformOrigin = origin;
  book.appendChild(leaf);
  const a = leaf.animate([{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }], { duration: 620, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
  a.onfinish = () => { BK.page = np; leaf.remove(); renderBook(); BK.turning = false; };
}
function openBinder(sub) {
  AU.init(); sfx.page();
  if (sub != null) { BK.sub = sub; BK.page = 0; }
  $('binder').classList.add('on');
  renderBook();
}
$('btnBinder').addEventListener('click', () => {
  const r = C.recent()[0];
  openBinder(BK.opened ? null : (r ? P[r.id].sub : 0)); BK.opened = true;
});
$('bkClose').addEventListener('click', () => { $('binder').classList.remove('on'); sfx.ui(); });
$('binder').addEventListener('click', e => { if (e.target === $('binder')) $('binder').classList.remove('on'); });
$('tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t || BK.turning) return; BK.sub = +t.dataset.s; BK.page = 0; sfx.page(); renderBook(); });
$('pgPrev').addEventListener('click', () => turn(-1));
$('pgNext').addEventListener('click', () => turn(1));
$('book').addEventListener('click', e => { const s = e.target.closest('.slot.got'); if (s && !BK.turning) openZoom(+s.dataset.id); });
(() => {   // 卡冊左右滑動翻頁
  let sx = null, sy = 0;
  $('book').addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  $('book').addEventListener('pointerup', e => {
    if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) turn(dx < 0 ? 1 : -1);
  });
})();
addEventListener('keydown', e => {
  if (!$('binder').classList.contains('on') || $('zoom').classList.contains('on')) return;
  if (e.key === 'ArrowRight') turn(1); else if (e.key === 'ArrowLeft') turn(-1); else if (e.key === 'Escape') $('binder').classList.remove('on');
});

// 卡片特寫：點卡片切換閃光
let zoomCard = null;
function openZoom(id) {
  const ov = $('zoom'), e = C.store.dex[id];
  const cw = Math.min(innerWidth * 0.72, 320, innerHeight * 0.62 / 1.4);
  const draw = () => {
    if (zoomCard) live.delete(zoomCard);
    const s = e.gotS && BK.showS.has(id);
    zoomCard = makeCard(id, s, cw); zoomCard.flip = 180; zoomCard.sparkle = s;
    zoomCard.el.style.transform = `translate(${-cw / 2}px,${-cw * 0.7}px)`;
    ov.querySelector('.zc').innerHTML = ''; ov.querySelector('.zc').appendChild(zoomCard.el); live.add(zoomCard);
    const p = P[id];
    ov.querySelector('.zt').innerHTML = `<b>${p.zh}${s ? ' ✦' : ''}</b>${SUBS[p.sub].zh} #${pad3(p.subNo)}・抓到 ${e.n + e.s} 次${e.gotS ? '<br>點卡片切換閃光' : ''}・點外面關閉`;
  };
  draw();
  ov.classList.add('on'); sfx.flip();
  ov.onclick = ev => {
    if (zoomCard && zoomCard.el.contains(ev.target) && e.gotS) {
      if (BK.showS.has(id)) BK.showS.delete(id); else BK.showS.add(id);
      draw(); sfx.shiny();
      const r = zoomCard.el.getBoundingClientRect(); FX.burst(r.left + r.width / 2, r.top + r.height / 2, 'rb', 30);
      renderBook();
      return;
    }
    ov.classList.remove('on'); live.delete(zoomCard); zoomCard = null; ov.onclick = null;
  };
}

/* ============ 介面更新 ============ */
function rcHTML(r, anim) { const p = P[r.id]; return `<div class="rc t-${p.tier}${r.s ? ' s' : ''}${anim ? ' in' : ''}" title="${p.zh}"><div><img src="${C.img(r.id, r.s)}" alt="" loading="lazy"></div></div>`; }
function refreshUI(anim) {
  $('dexN').textContent = C.count();
  $('openedN').textContent = S.opened;
  $('sets').innerHTML = SUBS.map((u, s) => {
    const got = BOOK[s].filter(p => C.has(p.id)).length;
    return `<div class="setRow">${u.zh}<div class="bar" style="--bc:${u.bar}"><i style="width:${(got / u.n * 100).toFixed(1)}%"></i></div><span>${got}/${u.n}</span></div>`;
  }).join('');
  const rec = C.recent();
  $('recent').innerHTML = rec.slice(0, 16).map((r, i) => rcHTML(r, anim && i < 5)).join('');
  $('strip').innerHTML = '<small>最近</small>' + rec.slice(0, 14).map((r, i) => rcHTML(r, anim && i < 5)).join('');
  const k = nextKind(), sp = 10 - (S.opened % 10), lg = 30 - (S.opened % 30);
  const spTxt = k === 'special' ? '<span class="sp due">★ 這包是<b>特別包</b></span>' : `<span class="sp">特別包 再<b>${sp}</b>包</span>`;
  const lgTxt = k === 'legend' ? '<span class="lg due">✦ 這包是<b>傳說包</b></span>' : `<span class="lg">傳說包 再<b>${lg}</b>包</span>`;
  $('counter').innerHTML = k === 'legend' ? lgTxt : spTxt + lgTxt;
  const nl = P[LEGEND_PACK[S.legendN % 3]].zh;
  $('packInfo').innerHTML = `每 10 包一包<b style="color:var(--gold)">特別包</b>：保證超稀有以上<br>每 30 包一包<b style="color:#fff">傳說包</b>：下一隻是<b style="color:#fff">${nl}</b><br>閃卡機率 1/60・第 5 張最稀有`;
}
function syncBtns() {
  $('btnMusic').classList.toggle('off', !S.music); $('btnSfx').classList.toggle('off', !S.sfx);
  $('btnChain').classList.toggle('on', S.chain);
  $('btnAuto').classList.toggle('run', autoRun);
  $('btnAuto').textContent = autoRun ? (S.chain ? '⏸ 停止連開' : '⚡ 開包中…') : '⚡ 一鍵開包';
}
$('btnMusic').addEventListener('click', () => { AU.init(); S.music = !S.music; AU.setMusic(S.music); saveS(); syncBtns(); });
$('btnSfx').addEventListener('click', () => { AU.init(); S.sfx = !S.sfx; AU.setSfx(S.sfx); saveS(); syncBtns(); });
$('btnHome').addEventListener('click', () => { location.href = '../'; });
table.addEventListener('pointerdown', e => {
  AU.init(); askGyro();
  if (autoRun) return;
  if (e.target === table && phase === 'held') putBack();
  else if (e.target === table && phase === 'done') collect();
});
$('hint').addEventListener('click', () => { if (phase === 'done' && !autoRun) collect(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) AU.suspend(); else AU.resume(); });
let rzT = 0;
addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { layout(); if ($('binder').classList.contains('on') && !BK.turning) renderBook(); }, 80); });

function loop(now) { tiltStep(now); FX.step(); requestAnimationFrame(loop); }

/* ============ 測試用 ============ */
window.__kalos = {
  C, S, get phase() { return phase; },
  setOpened(n) { S.opened = n; saveS(); dressPacks(); refreshUI(); refreshHint(); return nextKind(); },
  async openN(n, chain = false) { for (let i = 0; i < n; i++) { autoRun = true; syncBtns(); await autoOne(); } autoRun = false; syncBtns(); refreshHint(); return C.count(); },
  draw: (sub, kind) => drawPack(sub, kind).map(c => P[c.id].zh + (c.shiny ? '✦' : '') + '/' + P[c.id].tier),
};

dressPacks(); layout(); refreshUI(); syncBtns(); refreshHint();
packs.forEach((pk, i) => { pk.el.style.animationDelay = i * 0.08 + 's'; pk.el.classList.add('enter'); });
requestAnimationFrame(loop);
