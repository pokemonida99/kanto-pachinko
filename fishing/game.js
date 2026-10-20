'use strict';
// 寶可夢釣魚台（跨世代．全國水系）
// 狀態：idle → charge（按住蓄力）→ cast（甩出去）→ wait（等咬餌）→ bite（1.2 秒內點）→ reel（按住 1.5 秒）→ jump（跳出水面）→ show（揭曉）→ idle

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const ease = t => 1 - Math.pow(1 - t, 3);

/* ============ 資料 ============ */
const WATER = POKEDEX.filter(p => p.types.includes('water'));
const C = Collect.create({ key: 'fishingPachinko', pokedex: WATER, imgBase: '../all/assets/' });
const P = C.P;
const TOTAL = WATER.length;
const LEGENDS = WATER.filter(p => p.tier === 'legend').map(p => p.id);
const noStr = id => '#' + String(C.no(id)).padStart(4, '0');

const CFG_KEY = 'fishingPachinko.cfg';
const S = { auto: true, music: true, sfx: true, bait: 0 };
try { Object.assign(S, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); } catch (e) {}
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(S)); } catch (e) {} };

const SHINY_RATE = 1 / 100;
const LEGEND_RATE = 1 / 60;
const DEEP = 0.72, MID = 0.4;           // 力道 ≥ 0.72 = 深海、≥ 0.4 = 近海、其餘淺灘
const zoneOf = p => (p >= DEEP ? 'deep' : p >= MID ? 'mid' : 'shallow');
const ZONE_NAME = { shallow: '淺灘', mid: '近海', deep: '深海' };

const SHOE_LINES = ['釣到一隻舊鞋子……是誰掉的？', '舊鞋子！裡面住著一隻寄居蟹嗎？……沒有，空的。', '又是鞋子。湊不成一雙。', '一隻濕答答的舊靴子。聞起來有海的味道。', '鞋子！說不定是海星星的。'];
const PIKA_LINES = [
  '皮卡～今天的海風好舒服！', '皮卡丘：我在燈塔下面等你喔！', '皮卡丘：聽說深海那邊有會發光的大傢伙……',
  '皮卡丘：鯉魚王集滿三隻會變很厲害喔！', '皮卡丘：記得休息、喝水～皮卡！', '皮卡丘：今天的夕陽是番茄果汁的顏色。',
  '皮卡丘：瓶子裡塞了一顆樹果，送你！（被海水泡軟了）', '皮卡丘：閃閃發亮的寶可夢，一百竿才會遇到一次喔。',
  '皮卡丘：遠一點的海，住著比較少見的寶可夢。', '皮卡丘：浮標沉下去的時候，點一下就好～', '皮卡丘：我把電氣存在瓶子裡了。（騙你的）',
  '皮卡丘：月亮出來的時候，海面也會變成銀色。', '皮卡丘：要不要一起看海鷗？', '皮卡丘：皮卡皮！（翻譯：釣得好！）',
];

/* ============ 日夜 ============ */
const FORCE_NIGHT = /[?&]night\b/.test(location.search) ? true : /[?&]day\b/.test(location.search) ? false : null;
const isNightNow = () => (FORCE_NIGHT != null ? FORCE_NIGHT : (h => h >= 18 || h < 6)(new Date().getHours()));
let night = isNightNow();
function applyTheme() {
  document.body.classList.toggle('night', night);
  document.querySelector('meta[name=theme-color]').content = night ? '#0b1030' : '#c76b8f';
}
function tickClock() {
  const d = new Date(), hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  $('clock').innerHTML = `${night ? '🌙 夜晚' : '🌅 黃昏'} <span class="num" style="font-size:17px">${hh}:${mm}</span>`;
  const n = isNightNow();
  if (n !== night) { night = n; applyTheme(); buildBg(); }
}

/* ============ 音效（WebAudio 即時合成） ============ */
const AU = (() => {
  let ac = null, master, bgm, sfx, noiseBuf, brownBuf, nextT = 0, step = 0, lastTick = 0;
  const BGM_VOL = 0.34;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    if (ac.state === 'suspended') ac.resume();
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = S.music ? BGM_VOL : 0; bgm.connect(master);
    sfx = ac.createGain(); sfx.gain.value = S.sfx ? 1 : 0; sfx.connect(master);
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    brownBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0), b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; last = (last + 0.02 * d[i]) / 1.02; b[i] = last * 3.5; }
    startWaves();
    nextT = ac.currentTime + 0.2;
    setInterval(schedule, 40);
  }
  function osc(dest, type, f, t, dur, vol, slideTo, attack = 0.008) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000, fTo, q = 1) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (fTo) fl.frequency.exponentialRampToValueAtTime(fTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 1); s.stop(t + dur + 0.02);
  }
  // 海浪：棕噪音＋慢速 LFO 起伏（跟著音效開關）
  function startWaves() {
    const src = ac.createBufferSource(); src.buffer = brownBuf; src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
    const g = ac.createGain(); g.gain.value = 0.11;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.09;
    const lg = ac.createGain(); lg.gain.value = 0.08; lfo.connect(lg).connect(g.gain);
    const lg2 = ac.createGain(); lg2.gain.value = 300; lfo.connect(lg2).connect(lp.frequency);
    src.connect(lp).connect(g).connect(sfx); src.start(); lfo.start();
  }
  // 背景音樂：Fmaj7 – Em7 – Dm7 – Cmaj7，慢慢的撥弦＋口哨旋律
  const E = 60 / 78 / 2;
  const ROOT = [41, 40, 38, 36];
  const CH = [[65, 69, 72, 76], [64, 67, 71, 74], [62, 65, 69, 72], [60, 64, 67, 71]];
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  const MEL = [
    [76, 0, 0, 74, 72, 0, 0, 0, 69, 0, 72, 0, 0, 0, 0, 0],
    [74, 0, 0, 72, 71, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
    [72, 0, 0, 74, 77, 0, 76, 0, 74, 0, 72, 0, 69, 0, 0, 0],
    [71, 0, 72, 0, 0, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0],
  ];
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.2) { playStep(step, nextT); nextT += E; step = (step + 1) % 128; }
  }
  function playStep(s, t) {
    const sec = (s >> 4) & 3, i = s & 15, half = s >> 6;   // 前 64 拍只有伴奏，後 64 拍加旋律
    const ch = CH[sec];
    osc(bgm, 'triangle', hz(ch[ARP[i & 7]]), t, E * 2.2, 0.035, null, 0.004);
    if (i === 0 || i === 6 || i === 8) osc(bgm, 'sine', hz(ROOT[sec]), t, E * 3.5, 0.12, null, 0.02);
    if (i % 4 === 2) noise(bgm, t, 0.09, 0.018, 'highpass', 6500);
    const m = MEL[sec][i];
    if (half && m) { osc(bgm, 'sine', hz(m + 12), t, E * 3, 0.03, null, 0.04); osc(bgm, 'triangle', hz(m), t, E * 2.5, 0.016, null, 0.03); }
  }
  function duck(sec) {
    if (!ac || !S.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.2, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.5);
  }
  function setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.15); } }
  function setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05); }
  function notes(list, type = 'square', vol = 0.045, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m), t, d * 1.2, vol); osc(sfx, 'triangle', hz(m - 12), t, d * 1.3, vol * 0.7); } t += d; }
    return t - ac.currentTime;
  }
  const ok = () => !!ac;
  const play = {
    click() { if (ok()) osc(sfx, 'sine', 900, ac.currentTime, 0.05, 0.04, 1300); },
    charge(p) { if (!ok()) return; const n = performance.now(); if (n - lastTick < 90) return; lastTick = n; osc(sfx, 'square', 400 + p * 700, ac.currentTime, 0.03, 0.012); },
    cast(p) {
      if (!ok()) return; const t = ac.currentTime;
      noise(sfx, t, 0.35 + p * 0.2, 0.22, 'bandpass', 500, 2600, 2);
      for (let i = 0; i < 10 + p * 10; i++) osc(sfx, 'square', 2200, t + 0.05 + i * 0.035, 0.012, 0.008);
    },
    plop(s = 1) {
      if (!ok()) return; const t = ac.currentTime;
      osc(sfx, 'sine', 620, t, 0.14, 0.12 * s, 160);
      noise(sfx, t, 0.18, 0.08 * s, 'lowpass', 1400);
    },
    nibble() { if (ok()) osc(sfx, 'sine', 760, ac.currentTime, 0.06, 0.03, 380); },
    bite(legend) {
      if (!ok()) return; const t = ac.currentTime;
      osc(sfx, 'square', 1046, t, 0.09, 0.05); osc(sfx, 'square', 1397, t + 0.09, 0.16, 0.05);
      noise(sfx, t, 0.25, 0.2, 'lowpass', 1800);
      if (legend) { duck(5); osc(sfx, 'sine', 55, t, 2.4, 0.4, 40, 0.3); noise(sfx, t, 2.2, 0.25, 'lowpass', 220); [72, 79, 84, 91].forEach((m, i) => osc(sfx, 'sine', hz(m), t + 0.2 + i * 0.12, 1.4, 0.03)); }
    },
    reel() { if (!ok()) return; const n = performance.now(); if (n - lastTick < 55) return; lastTick = n; osc(sfx, 'square', 1700 + Math.random() * 300, ac.currentTime, 0.012, 0.012); },
    thrash() { if (ok()) noise(sfx, ac.currentTime, 0.2, 0.08, 'bandpass', 900 + Math.random() * 600); },
    splash() {
      if (!ok()) return; const t = ac.currentTime;
      noise(sfx, t, 0.6, 0.35, 'lowpass', 2600, 500); osc(sfx, 'sine', 320, t, 0.3, 0.15, 70);
    },
    whoosh() { if (ok()) noise(sfx, ac.currentTime, 0.5, 0.12, 'bandpass', 2400, 500, 3); },
    escape() { duck(1); if (!ok()) return; osc(sfx, 'triangle', 523, ac.currentTime, 0.3, 0.05, 330); osc(sfx, 'sine', 400, ac.currentTime + 0.15, 0.25, 0.04, 200); },
    early() { if (ok()) osc(sfx, 'sine', 500, ac.currentTime, 0.08, 0.025, 420); },
    gull() {
      if (!ok()) return; const t0 = ac.currentTime, n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.26 + Math.random() * 0.05;
        const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(1350, t); o.frequency.linearRampToValueAtTime(1650, t + 0.04); o.frequency.exponentialRampToValueAtTime(950, t + 0.2);
        fl.type = 'bandpass'; fl.frequency.value = 1800; fl.Q.value = 4;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(fl).connect(g).connect(sfx); o.start(t); o.stop(t + 0.25);
      }
    },
    reveal(rank) {
      duck(1.5 + rank);
      if (rank === 0) notes([[72, 0.08], [76, 0.08], [79, 0.16]], 'square', 0.03);
      else if (rank === 1) notes([[72, 0.08], [76, 0.08], [79, 0.08], [84, 0.3]], 'square', 0.04);
      else if (rank === 2) notes([[67, 0.1], [72, 0.1], [76, 0.1], [79, 0.2], [76, 0.1], [84, 0.5]], 'square', 0.045);
      else {
        const d = notes([[67, 0.12], [72, 0.12], [76, 0.12], [79, 0.24], [76, 0.12], [79, 0.12], [84, 0.36], [0, 0.05], [83, 0.12], [84, 0.12], [86, 0.12], [88, 0.8]], 'square', 0.05);
        if (ok()) [72, 76, 79, 84].forEach(m => osc(sfx, 'triangle', hz(m), ac.currentTime + d - 0.8, 1.4, 0.03));
      }
    },
    mini() { notes([[79, 0.06], [84, 0.1]], 'triangle', 0.04); },
    sparkle() { if (!ok()) return; [84, 88, 91, 96, 100, 103].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + i * 0.05, 0.3, 0.04)); },
    shoe() {
      if (!ok()) return; duck(2); const t = ac.currentTime;
      const o = osc(sfx, 'sine', 260, t, 0.5, 0.15, 90);
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 18; lg.gain.value = 30; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + 0.5);
      notes([[58, 0.28], [57, 0.28], [56, 0.28], [55, 0.7]], 'sawtooth', 0.025, 0.5);
    },
    chest() { duck(2.5); notes([[72, 0.07], [76, 0.07], [79, 0.07], [84, 0.07], [88, 0.07], [91, 0.07], [96, 0.5]], 'square', 0.04); play.sparkle(); },
    bottle() { if (!ok()) return; duck(2); const t = ac.currentTime; [[88, 0], [91, 0.18], [96, 0.36], [93, 0.6]].forEach(([m, d]) => osc(sfx, 'sine', hz(m), t + d, 1.4, 0.05)); },
    evolve() {
      if (!ok()) return; duck(4); const t = ac.currentTime;
      osc(sfx, 'sawtooth', 200, t, 1.4, 0.02, 1600); osc(sfx, 'sine', 300, t, 1.4, 0.05, 2400);
      for (let i = 0; i < 14; i++) osc(sfx, 'sine', hz(72 + (i % 7) * 2), t + i * 0.1, 0.12, 0.025);
    },
    evolved() { notes([[72, 0.1], [76, 0.1], [79, 0.1], [84, 0.1], [79, 0.1], [84, 0.5]], 'square', 0.045); },
    legendFlash() { if (!ok()) return; const t = ac.currentTime; noise(sfx, t, 1, 0.3, 'highpass', 2500); [60, 67, 72, 76, 79].forEach(m => osc(sfx, 'triangle', hz(m), t, 1.6, 0.03)); },
  };
  return { init, play, setMusic, setSfx, suspend: () => ac && ac.suspend(), resume: () => ac && !document.hidden && ac.resume() };
})();
const sfx = AU.play;

/* ============ 畫布與版面 ============ */
const wrap = $('seaWrap'), cv = $('sea'), ctx = cv.getContext('2d');
let W = 300, H = 300, DPR = 1, horizon, dockTop, dockH, nearY, farY, rodBase, rodTip0;
const bg = document.createElement('canvas'), bgx = bg.getContext('2d');
const fg = document.createElement('canvas'), fgx = fg.getContext('2d');
let stars = [];

function layout() {
  const r = wrap.getBoundingClientRect();
  W = Math.max(200, r.width); H = Math.max(200, r.height);
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const wide = W > H * 1.1;
  horizon = Math.round(H * (wide ? 0.34 : 0.3));
  dockH = Math.round(clamp(H * 0.14, 64, 120));
  dockTop = H - dockH;
  nearY = dockTop - clamp(H * 0.06, 24, 50);
  farY = horizon + clamp(H * 0.04, 12, 30);
  rodBase = { x: W * (wide ? 0.44 : 0.5), y: H - dockH * 0.22 };
  rodTip0 = { x: rodBase.x + clamp(W * 0.12, 50, 110), y: dockTop - clamp(H * 0.2, 90, 170) };
  stars = Array.from({ length: Math.round(W * horizon / 2600) }, () => ({ x: Math.random() * W, y: Math.random() * horizon * 0.9, r: Math.random() * 1.3 + 0.3, p: Math.random() * 6 }));
  buildBg();
  if (bob.on && state !== 'cast') { bob.x = clamp(bob.x, 20, W - 20); }
}

// 帶種子的雜訊：讓遠山每次長一樣
const hill = (x, seed) => Math.sin(x * 0.011 + seed) * 0.5 + Math.sin(x * 0.023 + seed * 2.3) * 0.3 + Math.sin(x * 0.051 + seed * 5.1) * 0.2;
function sunPos() { return night ? { x: W * 0.24, y: horizon - H * 0.17, r: Math.min(W, H) * 0.045 } : { x: W * 0.72, y: horizon - Math.min(W, H) * 0.05, r: Math.min(W, H) * 0.075 }; }

function buildBg() {
  for (const c of [bg, fg]) { c.width = cv.width; c.height = cv.height; }
  bgx.setTransform(DPR, 0, 0, DPR, 0, 0); fgx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = bgx;
  // 天空
  let gr = g.createLinearGradient(0, 0, 0, horizon);
  if (night) { gr.addColorStop(0, '#060a1d'); gr.addColorStop(0.55, '#131c45'); gr.addColorStop(1, '#2d3b72'); }
  else { gr.addColorStop(0, '#34407f'); gr.addColorStop(0.35, '#a65c8e'); gr.addColorStop(0.7, '#f39a6c'); gr.addColorStop(1, '#ffd79a'); }
  g.fillStyle = gr; g.fillRect(0, 0, W, horizon + 1);
  // 太陽／月亮
  const sp = sunPos();
  gr = g.createRadialGradient(sp.x, sp.y, sp.r * 0.5, sp.x, sp.y, sp.r * (night ? 6 : 7));
  gr.addColorStop(0, night ? 'rgba(220,230,255,.35)' : 'rgba(255,220,150,.75)'); gr.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, horizon);
  g.fillStyle = night ? '#f3f0dc' : '#fff3cf';
  g.beginPath(); g.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); g.fill();
  if (night) { g.fillStyle = 'rgba(180,175,150,.35)'; [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [0.05, 0.4, 0.12]].forEach(([dx, dy, rr]) => { g.beginPath(); g.arc(sp.x + dx * sp.r, sp.y + dy * sp.r, rr * sp.r, 0, 7); g.fill(); }); }
  // 雲
  g.save();
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 0.37 + 0.1) % 1) * W, cy = horizon * (0.18 + (i % 3) * 0.17), w = W * (0.18 + (i % 2) * 0.12);
    g.fillStyle = night ? 'rgba(70,80,140,.28)' : `rgba(255,${180 + i * 8},${170 + i * 6},.32)`;
    g.beginPath(); g.ellipse(cx, cy, w, 7 + (i % 3) * 3, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx + w * 0.3, cy - 5, w * 0.5, 6, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // 遠山兩層
  const mtn = (seed, base, amp, color) => {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, horizon + 1);
    for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, base - (hill(x, seed) * 0.5 + 0.5) * amp);
    g.lineTo(W, horizon + 1); g.closePath(); g.fill();
  };
  mtn(1.7, horizon, H * 0.09, night ? '#1d2656' : 'rgba(150,84,120,.75)');
  mtn(4.2, horizon, H * 0.05, night ? '#121a40' : '#6d4672');
  // 小燈塔（遠方右側）
  const lx = W * 0.88, ly = horizon - H * 0.035;
  g.fillStyle = night ? '#2a2f55' : '#5b3a5e'; g.fillRect(lx - W * 0.03, ly + H * 0.02, W * 0.06, H * 0.016);
  g.fillStyle = night ? '#d9dcf0' : '#f6e6dc'; g.beginPath(); g.moveTo(lx - 4, ly + H * 0.022); g.lineTo(lx - 2.5, ly - H * 0.025); g.lineTo(lx + 2.5, ly - H * 0.025); g.lineTo(lx + 4, ly + H * 0.022); g.fill();
  g.fillStyle = '#c94a4a'; g.fillRect(lx - 3.4, ly - H * 0.004, 6.8, 3);
  // 海面底色
  gr = g.createLinearGradient(0, horizon, 0, H);
  if (night) { gr.addColorStop(0, '#2a3a6c'); gr.addColorStop(0.25, '#16234f'); gr.addColorStop(1, '#060c22'); }
  else { gr.addColorStop(0, '#f2a679'); gr.addColorStop(0.12, '#b77289'); gr.addColorStop(0.5, '#4f4f86'); gr.addColorStop(1, '#22325f'); }
  g.fillStyle = gr; g.fillRect(0, horizon, W, H - horizon);
  // 近岸淺色
  gr = g.createLinearGradient(0, dockTop - H * 0.18, 0, dockTop);
  gr.addColorStop(0, 'rgba(90,200,210,0)'); gr.addColorStop(1, night ? 'rgba(60,140,170,.25)' : 'rgba(110,210,210,.3)');
  g.fillStyle = gr; g.fillRect(0, dockTop - H * 0.18, W, H * 0.18);
  g.fillStyle = night ? 'rgba(200,220,255,.35)' : 'rgba(255,240,210,.7)'; g.fillRect(0, horizon, W, 1.2);

  // 前景碼頭
  const f = fgx;
  f.clearRect(0, 0, W, H);
  const plankH = dockH / 4;
  for (let i = 0; i < 4; i++) {
    const y = dockTop + i * plankH;
    gr = f.createLinearGradient(0, y, 0, y + plankH);
    gr.addColorStop(0, night ? '#5a4030' : '#a8724a'); gr.addColorStop(1, night ? '#3e2b20' : '#83552f');
    f.fillStyle = gr; f.fillRect(0, y, W, plankH);
    f.fillStyle = night ? 'rgba(0,0,0,.35)' : 'rgba(60,30,10,.35)'; f.fillRect(0, y + plankH - 2, W, 2);
    // 木紋與釘子
    f.strokeStyle = night ? 'rgba(0,0,0,.18)' : 'rgba(70,35,15,.18)'; f.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const yy = y + 4 + ((k * 7 + i * 3) % (plankH - 6)); f.beginPath(); f.moveTo(((k * 191 + i * 97) % W), yy); f.lineTo(((k * 191 + i * 97) % W) + 60 + k * 20, yy + 0.5); f.stroke(); }
    const off = (i % 2) * 70;
    for (let x = 40 + off; x < W; x += 140) {
      f.fillStyle = night ? 'rgba(0,0,0,.4)' : 'rgba(50,25,10,.45)'; f.fillRect(x - 1, y, 2, plankH - 2);
      f.fillStyle = night ? '#8a8a9a' : '#5a4636'; f.beginPath(); f.arc(x + 6, y + plankH / 2, 1.6, 0, 7); f.arc(x - 6, y + plankH / 2, 1.6, 0, 7); f.fill();
    }
  }
  f.fillStyle = night ? '#2c1f17' : '#5d3a22'; f.fillRect(0, dockTop - 5, W, 7);
  f.fillStyle = night ? 'rgba(255,255,255,.08)' : 'rgba(255,230,190,.35)'; f.fillRect(0, dockTop - 5, W, 1.5);
  // 繫船柱
  for (const px of postXs()) {
    f.fillStyle = night ? '#3a2a20' : '#6b4429'; f.fillRect(px - 9, dockTop - 34, 18, 34);
    f.fillStyle = night ? '#4c382b' : '#8a5a38'; f.beginPath(); f.ellipse(px, dockTop - 34, 9, 3.5, 0, 0, 7); f.fill();
    f.strokeStyle = night ? '#b9a27a' : '#e8d4a8'; f.lineWidth = 2.5; f.beginPath(); f.moveTo(px - 9, dockTop - 22); f.lineTo(px + 9, dockTop - 18); f.moveTo(px - 9, dockTop - 16); f.lineTo(px + 9, dockTop - 12); f.stroke();
  }
  // 桶子與水桶（小道具）
  const bx = rodBase.x - clamp(W * 0.16, 60, 120), by = dockTop + dockH * 0.32;
  f.fillStyle = night ? '#355a6a' : '#3d8fa3'; f.beginPath(); f.moveTo(bx - 18, by); f.lineTo(bx + 18, by); f.lineTo(bx + 14, by + 30); f.lineTo(bx - 14, by + 30); f.fill();
  f.fillStyle = night ? '#1b3240' : '#2a6577'; f.beginPath(); f.ellipse(bx, by, 18, 5, 0, 0, 7); f.fill();
  f.strokeStyle = night ? '#999' : '#d6d6d6'; f.lineWidth = 1.5; f.beginPath(); f.arc(bx, by - 2, 16, Math.PI, 0); f.stroke();
}
function postXs() { return [W * 0.08, W * 0.92]; }

/* ============ 遊戲狀態 ============ */
let state = 'idle', T = 0, timeScale = 1;
let pressing = false, pressT = 0, power = 0, autoT = 1.2;
let castFrom = null, castTo = null, castU = 0, castDur = 1, castPower = 0, castBait = false;
let waitT = 0, nibbleT = 0, biteT = 0, autoHookAt = 0.5, reelP = 0, reelFrom = null, thrashT = 0;
let outcome = null, jump = null, revealOpen = false, manualHint = true;
let forceQueue = [], userActed = false;
const bob = { on: false, x: 0, y: 0, s: 1, sink: 0 };
const ripples = [], drops = [], floats = [], shadows = [], gulls = [];
let shadowT = 2, gullT = rand(6, 14), seaGlow = 0, shake = 0, rodFlick = 0;

function depthScale(y) { return lerp(0.42, 1, clamp((y - horizon) / (dockTop - horizon), 0, 1)); }
function powerToY(p) { return lerp(nearY, farY, Math.pow(p, 0.85)); }
function rodTip() {
  let tx = rodTip0.x, ty = rodTip0.y;
  if (state === 'charge') { tx -= power * 60; ty += power * 18; }
  if (rodFlick > 0) { tx += Math.sin(rodFlick * 18) * rodFlick * 30; }
  if (state === 'reel' || state === 'bite') { const dx = bob.x - tx; tx += dx * 0.08 + Math.sin(T * 40) * 1.5; ty += 26 + Math.sin(T * 23) * 3; }
  return { x: tx, y: ty };
}

function addRipple(x, y, s = 1, max = 30, color) { ripples.push({ x, y, r: 2, max: max * s, s, life: 0, color }); }
function splash(x, y, n, s = 1, color = '#e9f7ff') {
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + rand(-1.1, 1.1); const v = rand(80, 240) * s; drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rand(0.5, 0.9), r: rand(1.2, 3) * s, color }); }
}
function addFloat(x, y, text, color = '#fff', size = 22) { floats.push({ x, y, text, color, size, t: 0 }); }

/* ---------- 甩竿 ---------- */
function startCharge() { state = 'charge'; pressT = 0; power = 0; }
function doCast(p) {
  castPower = clamp(p, 0.04, 1);
  castBait = S.bait > 0;
  if (castBait) { S.bait--; saveCfg(); refreshUI(); }
  const tip = rodTip0;
  castFrom = { x: tip.x, y: tip.y };
  const ty = powerToY(castPower);
  castTo = { x: clamp(W * 0.5 + rand(-0.32, 0.32) * W * (0.4 + castPower * 0.6), 30, W - 30), y: ty };
  castU = 0; castDur = 0.55 + castPower * 0.55;
  bob.on = true; bob.x = castFrom.x; bob.y = castFrom.y; bob.s = 1; bob.sink = 0;
  state = 'cast'; rodFlick = 1;
  sfx.cast(castPower);
}
function land() {
  state = 'wait';
  bob.x = castTo.x; bob.y = castTo.y; bob.s = depthScale(bob.y);
  waitT = rand(1, 5); nibbleT = rand(0.6, 1.6);
  addRipple(bob.x, bob.y, bob.s, 34); addRipple(bob.x, bob.y, bob.s, 20);
  splash(bob.x, bob.y, 8, bob.s * 0.7);
  sfx.plop(bob.s);
  const z = zoneOf(castPower);
  addFloat(bob.x, bob.y - 30 * bob.s, ZONE_NAME[z] + (castBait ? '・大師餌' : ''), z === 'deep' ? '#c9b6ff' : z === 'mid' ? '#a6e9ff' : '#fff2c4', 16);
}
function rollOutcome() {
  const deep = castPower >= DEEP;
  if (forceQueue.length) {
    const f = forceQueue.shift();
    if (f === 'legend') return { kind: 'mon', id: choice(LEGENDS), shiny: Math.random() < SHINY_RATE };
    if (f === 'shiny') return { kind: 'mon', id: C.pick({ boost: castPower * 2 }), shiny: true };
    if (typeof f === 'number') return { kind: 'mon', id: f, shiny: false };
    return { kind: f };
  }
  if (deep && Math.random() < LEGEND_RATE) return { kind: 'mon', id: choice(LEGENDS), shiny: Math.random() < SHINY_RATE };
  if (!castBait) {
    const r = Math.random();
    if (r < 0.05) return { kind: 'shoe' };
    if (r < 0.085) return { kind: 'bottle' };
    if (r < 0.11) return { kind: 'chest' };
  }
  const id = C.pick({ boost: castBait ? 2 : castPower * 2, filter: castBait ? p => p.tier !== 'common' : null });
  return { kind: 'mon', id, shiny: Math.random() < SHINY_RATE };
}
function startBite() {
  outcome = rollOutcome();
  outcome.legend = outcome.kind === 'mon' && P[outcome.id].tier === 'legend';
  if (outcome.kind === 'mon') {
    outcome.img = new Image(); outcome.img.src = C.img(outcome.id, outcome.shiny);
    outcome.sil = null;
    const oc = outcome;
    oc.img.onload = () => { oc.sil = silhouette(oc.img); };
  }
  state = 'bite'; biteT = 0; autoHookAt = rand(0.3, 0.7);
  addRipple(bob.x, bob.y, bob.s, 50); addRipple(bob.x, bob.y, bob.s, 34);
  splash(bob.x, bob.y, 10, bob.s * 0.8);
  sfx.bite(outcome.legend);
  if (outcome.legend) { shake = 0.6; }
  if (userActed && !S.auto && navigator.vibrate) try { navigator.vibrate(outcome.legend ? [60, 40, 60, 40, 120] : 40); } catch (e) {}
}
function hook() {
  state = 'reel'; reelP = 0; reelFrom = { x: bob.x, y: bob.y }; thrashT = 0;
  addFloat(bob.x, bob.y - 50 * bob.s, outcome.legend ? '超大的！！' : '上鉤了！', outcome.legend ? '#e3d4ff' : '#fff', outcome.legend ? 26 : 22);
  sfx.splash();
  splash(bob.x, bob.y, 14, bob.s);
}
function escape() {
  state = 'idle'; autoT = rand(0.8, 1.4);
  addRipple(bob.x, bob.y, bob.s, 60); addRipple(bob.x, bob.y, bob.s, 40); addRipple(bob.x, bob.y, bob.s, 22);
  addFloat(bob.x, bob.y - 30 * bob.s, '魚跑了～', '#d6ecff', 20);
  bob.on = false; outcome = null;
  sfx.escape();
}
function startJump() {
  const from = { x: bob.x, y: bob.y };
  const to = { x: rodBase.x - 20, y: dockTop + dockH * 0.35 };
  jump = { u: 0, from, to, arc: Math.min(H * 0.42, (from.y - horizon) * 0.6 + H * 0.22), flashed: false, s0: bob.s };
  bob.on = false;
  state = 'jump';
  splash(from.x, from.y, 26, from.y > 0 ? jump.s0 * 1.2 : 1);
  addRipple(from.x, from.y, jump.s0, 70); addRipple(from.x, from.y, jump.s0, 46);
  sfx.splash(); sfx.whoosh();
}
function silhouette(img) {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, 160, 160);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#0d1630'; x.fillRect(0, 0, 160, 160);
  return c;
}

/* ---------- 輸入 ---------- */
function press() {
  AU.init(); userActed = true;
  if (revealOpen) { closeReveal(); return; }
  pressing = true;
  if (state === 'idle') { startCharge(); hideHint(); }
  else if (state === 'bite') hook();
  else if (state === 'wait') { addFloat(bob.x, bob.y - 26 * bob.s, '還沒咬餌…', '#ffffffcc', 15); sfx.early(); }
}
function release() {
  if (!pressing) return;
  pressing = false;
  if (state === 'charge') {
    const quick = pressT < 0.18;
    doCast(quick ? rand(0.1, 1) : power);
  }
}
function hideHint() { if (manualHint) { manualHint = false; $('hint').classList.add('hide'); } }
wrap.addEventListener('pointerdown', e => {
  if (e.target.closest('#hud button, #reveal')) return;
  if (e.button > 0) return;
  e.preventDefault(); press();
});
$('btnCast').addEventListener('pointerdown', e => { e.preventDefault(); press(); });
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', release);
window.addEventListener('keydown', e => {
  if ($('mDex').classList.contains('show')) return;
  if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); press(); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') release(); });

/* ============ 每幀更新 ============ */
function update(dt) {
  T += dt;
  switch (state) {
    case 'idle':
      if (S.auto && !pressing && !revealOpen && !$('mDex').classList.contains('show')) {
        autoT -= dt;
        if (autoT <= 0) doCast(rand(0.06, 1));
      }
      break;
    case 'charge':
      pressT += dt; power = clamp(pressT / 1.3, 0, 1);
      sfx.charge(power);
      break;
    case 'cast': {
      castU = Math.min(1, castU + dt / castDur);
      const u = castU, e = ease(u);
      bob.x = lerp(castFrom.x, castTo.x, e);
      bob.y = lerp(castFrom.y, castTo.y, e) - Math.sin(Math.PI * u) * (60 + castPower * 140);
      bob.s = lerp(1, depthScale(castTo.y), e);
      if (castU >= 1) land();
      break;
    }
    case 'wait':
      waitT -= dt; nibbleT -= dt;
      if (nibbleT <= 0 && waitT > 0.6) {
        nibbleT = rand(0.8, 2); bob.sink = 0.35;
        addRipple(bob.x, bob.y, bob.s, 16); sfx.nibble();
      }
      if (waitT <= 0) startBite();
      break;
    case 'bite':
      biteT += dt;
      if (S.auto && biteT >= autoHookAt) hook();
      else if (biteT > 1.2) escape();
      break;
    case 'reel': {
      if (pressing || S.auto) { reelP = Math.min(1, reelP + dt / 1.5); sfx.reel(); }
      thrashT -= dt;
      if (thrashT <= 0) { thrashT = rand(0.18, 0.4); splash(bob.x, bob.y, outcome.legend ? 8 : 4, bob.s * 0.8); addRipple(bob.x, bob.y, bob.s, 26); if (Math.random() < 0.5) sfx.thrash(); }
      const ty = lerp(reelFrom.y, Math.max(reelFrom.y, nearY - 10), reelP * 0.55);
      bob.y = ty; bob.s = depthScale(bob.y);
      bob.x = reelFrom.x + Math.sin(T * 6) * 14 * bob.s * (1 - reelP * 0.5) + (rodBase.x - reelFrom.x) * reelP * 0.25;
      if (reelP >= 1) startJump();
      break;
    }
    case 'jump': {
      const near = Math.abs(jump.u - 0.45) < 0.12;
      jump.u += dt / 1.5 * (near ? 0.3 : 1);
      if (!jump.flashed && jump.u >= 0.45) {
        jump.flashed = true;
        if (outcome.legend) { flash('purple'); sfx.legendFlash(); shake = 0.5; }
        else if (outcome.shiny) { flash(); sfx.sparkle(); }
        else sfx.sparkle();
      }
      if (jump.u >= 1) {
        const p = jumpPos(1);
        splash(p.x, p.y, 10, 0.8, '#fff3cf');
        state = 'show';
        showResult(outcome);
        jump = null;
      }
      break;
    }
  }
  // 浮標下沉量
  if (state === 'bite') bob.sink = outcome && outcome.legend ? 0.5 + Math.sin(T * 50) * 0.3 : 0.65;
  else if (state === 'reel') bob.sink = 0.5 + Math.sin(T * 30) * 0.2;
  else bob.sink = Math.max(0, bob.sink - dt * 1.4);
  // 傳說時海面發光
  const wantGlow = outcome && outcome.legend && (state === 'bite' || state === 'reel' || state === 'jump') ? 1 : 0;
  seaGlow += (wantGlow - seaGlow) * Math.min(1, dt * 3);
  shake = Math.max(0, shake - dt);
  rodFlick = Math.max(0, rodFlick - dt * 2.2);
  if (state === 'reel' && outcome && outcome.legend) shake = Math.max(shake, 0.15);

  // 漣漪、水花、浮字
  for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.life += dt; r.r = 2 + (r.max) * ease(Math.min(1, r.life / 1.4)); if (r.life > 1.4) ripples.splice(i, 1); }
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.life += dt; d.vy += 520 * dt; d.x += d.vx * dt; d.y += d.vy * dt; if (d.life > d.max) drops.splice(i, 1); }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.t += dt; f.y -= 18 * dt; if (f.t > 1.6) floats.splice(i, 1); }
  // 魚影
  shadowT -= dt;
  if (shadowT <= 0) {
    shadowT = rand(2.5, 7);
    const d = rand(0.15, 0.95), y = lerp(horizon + 10, dockTop - 16, d), s = depthScale(y), dir = Math.random() < 0.5 ? 1 : -1;
    const big = Math.random() < 0.12;
    shadows.push({ x: dir > 0 ? -60 : W + 60, y, s: s * (big ? 2.4 : rand(0.8, 1.3)), dir, v: rand(18, 40) * s * (big ? 0.6 : 1), ph: Math.random() * 6, life: 0 });
  }
  for (let i = shadows.length - 1; i >= 0; i--) { const f = shadows[i]; f.life += dt; f.x += f.dir * f.v * dt; f.y += Math.sin(f.life * 0.8 + f.ph) * 3 * dt; if (f.x < -120 || f.x > W + 120) shadows.splice(i, 1); }
  // 海鷗
  gullT -= dt;
  if (gullT <= 0) {
    gullT = rand(14, 32);
    const dir = Math.random() < 0.5 ? 1 : -1, n = 1 + Math.floor(Math.random() * 3), y0 = rand(horizon * 0.2, horizon * 0.75);
    for (let k = 0; k < n; k++) gulls.push({ x: dir > 0 ? -30 - k * 40 : W + 30 + k * 40, y: y0 + k * 12 - rand(0, 10), dir, v: rand(40, 70), ph: Math.random() * 6, s: rand(0.7, 1.1) });
    if (!night || Math.random() < 0.3) setTimeout(() => sfx.gull(), 600);
  }
  for (let i = gulls.length - 1; i >= 0; i--) { const g = gulls[i]; g.x += g.dir * g.v * dt; g.ph += dt * 7; if (g.x < -80 || g.x > W + 80) gulls.splice(i, 1); }
  syncCastBtn();
}
function jumpPos(u) {
  const j = jump, e = u;
  return { x: lerp(j.from.x, j.to.x, e), y: lerp(j.from.y, j.to.y, e) - Math.sin(Math.PI * e) * j.arc };
}

/* ============ 繪圖 ============ */
function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rand(-1, 1) * shake * 8, rand(-1, 1) * shake * 6);
  ctx.drawImage(bg, 0, 0, W, H);
  drawStars();
  drawGulls();
  drawSea();
  drawShadows();
  if (state === 'charge') drawZones();
  drawRipples();
  if (seaGlow > 0.01) drawGlow();
  drawLine();
  if (bob.on) drawBobber();
  drawDrops();
  ctx.drawImage(fg, 0, 0, W, H);
  drawLanterns();
  drawRod();
  if (state === 'jump' && jump) drawJump();
  drawBait();
  drawFloats();
  if (state === 'bite') drawBang();
  if (state === 'charge') drawPowerBar();
  if (state === 'reel') drawReelBar();
  ctx.restore();
}
function drawStars() {
  if (!night) return;
  for (const s of stars) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(T * 0.8 + s.p)); ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r); }
  ctx.globalAlpha = 1;
}
function drawSea() {
  const sp = sunPos(), span = dockTop - horizon;
  // 太陽／月亮倒影
  ctx.fillStyle = night ? 'rgba(235,240,255,.55)' : 'rgba(255,236,180,.7)';
  for (let y = horizon + 3; y < dockTop; y += 4 + (y - horizon) / span * 6) {
    const d = (y - horizon) / span;
    const w = (8 + d * 70) * (0.35 + 0.65 * Math.abs(Math.sin(T * 1.3 + y * 0.21)));
    const ox = Math.sin(T * 0.9 + y * 0.05) * (3 + d * 14);
    ctx.globalAlpha = 0.85 - d * 0.55;
    ctx.fillRect(sp.x - w / 2 + ox, y, w, 1 + d * 2.2);
  }
  ctx.globalAlpha = 1;
  // 波紋線
  const N = 26;
  for (let i = 1; i <= N; i++) {
    const d = Math.pow(i / N, 1.7), y = horizon + span * d;
    const len = 6 + d * 46, th = 0.8 + d * 1.8, speed = 6 + d * 22;
    const cnt = 7 + Math.round(i * 0.25);
    for (let j = 0; j < cnt; j++) {
      const base = ((j * 197 + i * 61) % 997) / 997 * (W + len * 2);
      const x = ((base + T * speed * (i % 2 ? 1 : -0.6)) % (W + len * 2) + (W + len * 2)) % (W + len * 2) - len;
      const yy = y + Math.sin(T * 1.6 + j * 1.7 + i) * (1 + d * 3);
      ctx.fillStyle = night ? `rgba(160,190,255,${0.08 + d * 0.12})` : `rgba(255,225,200,${0.1 + d * 0.16})`;
      ctx.fillRect(x, yy, len, th);
      ctx.fillStyle = `rgba(10,15,45,${0.08 + d * 0.1})`;
      ctx.fillRect(x + len * 0.2, yy + th + 1, len * 0.7, th);
    }
  }
}
function drawShadows() {
  for (const f of shadows) {
    const a = Math.min(1, f.life / 1.5) * 0.22;
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.dir * f.s, f.s * 0.55);
    ctx.fillStyle = `rgba(8,12,38,${a})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 8, 0, 0, Math.PI * 2); ctx.fill();
    const tw = Math.sin(f.life * 8 + f.ph) * 5;
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-32, -8 + tw); ctx.lineTo(-32, 8 + tw); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawGulls() {
  ctx.strokeStyle = night ? 'rgba(220,225,255,.7)' : 'rgba(60,40,70,.75)'; ctx.lineCap = 'round';
  for (const g of gulls) {
    const f = Math.sin(g.ph) * 5 * g.s, w = 10 * g.s;
    ctx.lineWidth = 1.8 * g.s;
    ctx.beginPath(); ctx.moveTo(g.x - w, g.y - f); ctx.quadraticCurveTo(g.x - w * 0.4, g.y - 4 * g.s - f * 0.3, g.x, g.y); ctx.quadraticCurveTo(g.x + w * 0.4, g.y - 4 * g.s - f * 0.3, g.x + w, g.y - f); ctx.stroke();
  }
}
function drawZones() {
  const bands = [[0, MID, 'rgba(255,240,190,.10)', '淺灘'], [MID, DEEP, 'rgba(140,220,255,.10)', '近海'], [DEEP, 1, 'rgba(170,140,255,.14)', '深海']];
  ctx.font = "700 13px 'Noto Sans TC',sans-serif"; ctx.textAlign = 'left';
  for (const [a, b, c, name] of bands) {
    const y1 = powerToY(a), y2 = powerToY(b);
    ctx.fillStyle = c; ctx.fillRect(0, y2, W, y1 - y2);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText(name, 10, (y1 + y2) / 2 + 4);
  }
  const y = powerToY(power), s = depthScale(y);
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(W * 0.5, y, 34 * s, 11 * s, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
}
function drawRipples() {
  for (const r of ripples) {
    const a = 1 - r.life / 1.4;
    ctx.strokeStyle = r.color || `rgba(240,250,255,${a * 0.7})`; ctx.lineWidth = 1.5 * r.s;
    ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
  }
}
function drawGlow() {
  const x = bob.on ? bob.x : jump ? jump.from.x : W / 2, y = bob.on ? bob.y : jump ? jump.from.y : H / 2;
  const pulse = 0.75 + 0.25 * Math.sin(T * 6);
  const r = Math.max(W, H) * 0.55;
  const g = ctx.createRadialGradient(x, y, 4, x, y, r);
  g.addColorStop(0, `rgba(160,255,250,${0.9 * seaGlow * pulse})`); g.addColorStop(0.2, `rgba(150,120,255,${0.55 * seaGlow})`); g.addColorStop(0.7, `rgba(90,60,220,${0.18 * seaGlow})`); g.addColorStop(1, 'rgba(80,40,200,0)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g; ctx.fillRect(0, horizon, W, H - horizon);
  // 光柱
  const cg = ctx.createLinearGradient(0, horizon, 0, y);
  cg.addColorStop(0, 'rgba(150,255,255,0)'); cg.addColorStop(1, `rgba(170,255,255,${0.35 * seaGlow * pulse})`);
  ctx.fillStyle = cg; ctx.fillRect(x - 26 * (bob.s || 1), horizon, 52 * (bob.s || 1), y - horizon);
  ctx.restore();
  // 發光的波紋
  ctx.strokeStyle = `rgba(200,255,255,${0.8 * seaGlow})`; ctx.lineWidth = 2.5;
  for (let k = 0; k < 3; k++) { const rr = ((T * 60 + k * 50) % 150) * (bob.s || 1); ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.32, 0, 0, Math.PI * 2); ctx.stroke(); }
}
function drawLine() {
  if (!bob.on) return;
  const tip = rodTip();
  ctx.strokeStyle = night ? 'rgba(230,235,255,.6)' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
  if (state === 'reel' || state === 'bite') ctx.lineTo(bob.x, bob.y - 6 * bob.s);
  else { const mx = (tip.x + bob.x) / 2, my = Math.max(tip.y, bob.y) + (state === 'cast' ? 10 : 40); ctx.quadraticCurveTo(mx, my, bob.x, bob.y - 6 * bob.s); }
  ctx.stroke();
}
function drawBobber() {
  const s = bob.s * 1.5;
  let x = bob.x, y = bob.y;
  if (state === 'wait') y += Math.sin(T * 2.4) * 2 * s;
  if (state === 'bite' && outcome && outcome.legend) { x += rand(-6, 6) * s; y += rand(-3, 3) * s; }
  else if (state === 'bite') x += Math.sin(T * 60) * 1.5;
  const sinkPx = bob.sink * 9 * s;
  y += sinkPx;
  const bait = castBait && state !== 'cast';
  const top = bait ? '#9b6bff' : '#ff4b4b';
  ctx.save();
  const wl = y - sinkPx + 1 * s;   // 水面線：以下的部分藏在水裡
  if (state !== 'cast') { ctx.beginPath(); ctx.rect(x - 30 * s, wl - 60 * s, 60 * s, 60 * s); ctx.clip(); }
  // 桿子
  ctx.fillStyle = '#333'; ctx.fillRect(x - 0.8 * s, y - 16 * s, 1.6 * s, 7 * s);
  // 球
  ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.arc(x, y - 4 * s, 6 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = top; ctx.beginPath(); ctx.arc(x, y - 4 * s, 6 * s, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x - 2 * s, y - 7 * s, 1.6 * s, 0, 7); ctx.fill();
  ctx.restore();
  if (state !== 'cast') {
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, bob.y + 2 * s, 9 * s, 2.6 * s, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (bait) {
    ctx.fillStyle = `rgba(190,160,255,${0.35 + 0.25 * Math.sin(T * 5)})`;
    ctx.beginPath(); ctx.arc(x, y - 4 * s, 11 * s, 0, Math.PI * 2); ctx.fill();
  }
  if (state === 'reel' && outcome && outcome.shiny) {
    for (let k = 0; k < 3; k++) { const a = T * 4 + k * 2.1; ctx.fillStyle = '#fff6b0'; ctx.fillRect(x + Math.cos(a) * 16 * s, y - 8 * s + Math.sin(a) * 8 * s, 2.5, 2.5); }
  }
}
function drawDrops() {
  for (const d of drops) { ctx.globalAlpha = 1 - d.life / d.max; ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
}
function drawLanterns() {
  const posts = postXs();
  for (let k = 0; k < posts.length; k++) {
    const x = posts[k], y = dockTop - 34;
    ctx.fillStyle = night ? '#2a1e16' : '#5d3a22'; ctx.fillRect(x - 2, y - 40, 4, 40);
    ctx.fillRect(x - 2, y - 40, 14 * (k ? -1 : 1), 3);
    const lx = x + 12 * (k ? -1 : 1), ly = y - 28;
    ctx.strokeStyle = night ? '#2a1e16' : '#5d3a22'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, y - 38); ctx.lineTo(lx, ly - 7); ctx.stroke();
    const flick = 0.85 + 0.15 * Math.sin(T * 9 + k * 3) * Math.sin(T * 3.1 + k);
    if (night) {
      const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 70);
      g.addColorStop(0, `rgba(255,200,110,${0.55 * flick})`); g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - 70, ly - 70, 140, 140);
      // 水面倒影
      ctx.fillStyle = `rgba(255,190,100,${0.35 * flick})`;
      for (let yy = dockTop - 60; yy < dockTop - 4; yy += 6) { const w = 4 + Math.abs(Math.sin(T * 2 + yy)) * 10; ctx.fillRect(lx - w / 2 + Math.sin(T * 1.5 + yy * 0.2) * 3, yy, w, 1.5); }
    }
    ctx.fillStyle = night ? `rgba(255,${200 + 30 * flick | 0},120,1)` : '#e8c890';
    ctx.fillRect(lx - 6, ly - 8, 12, 15);
    ctx.fillStyle = night ? '#3a2a20' : '#6b4429'; ctx.fillRect(lx - 7, ly - 10, 14, 3); ctx.fillRect(lx - 7, ly + 6, 14, 3);
  }
}
function drawRod() {
  const tip = rodTip(), b = rodBase;
  const cx = lerp(b.x, tip.x, 0.55) - 10, cy = lerp(b.y, tip.y, 0.5) + (state === 'reel' ? 22 : 8);
  ctx.lineCap = 'round';
  ctx.strokeStyle = night ? '#1c120c' : '#3b2416'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(cx, cy, tip.x, tip.y); ctx.stroke();
  ctx.strokeStyle = night ? '#6a4a35' : '#c58b55'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(cx, cy, tip.x, tip.y); ctx.stroke();
  // 握把與捲線器
  ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(b.x, b.y + 4); ctx.lineTo(lerp(b.x, tip.x, 0.1), lerp(b.y, tip.y, 0.1)); ctx.stroke();
  const rx = lerp(b.x, tip.x, 0.14) + 9, ry = lerp(b.y, tip.y, 0.14) + 3;
  ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.arc(rx, ry, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7b8494'; ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.fill();
  const a = state === 'reel' ? T * 18 : state === 'cast' ? -T * 30 : 0.6;
  ctx.strokeStyle = '#7b8494'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(a) * 9, ry + Math.sin(a) * 9); ctx.stroke();
  ctx.lineCap = 'butt';
}
function drawBait() {
  if (S.bait <= 0 || state === 'cast' || bob.on) return;
  const tip = rodTip(), y = tip.y + 26 + Math.sin(T * 3) * 3;
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x, y - 6); ctx.stroke();
  const g = ctx.createRadialGradient(tip.x, y, 1, tip.x, y, 16); g.addColorStop(0, 'rgba(210,180,255,.9)'); g.addColorStop(1, 'rgba(150,100,255,0)');
  ctx.fillStyle = g; ctx.fillRect(tip.x - 16, y - 16, 32, 32);
  ctx.fillStyle = '#9b6bff'; ctx.beginPath(); ctx.arc(tip.x, y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = "900 7px sans-serif"; ctx.textAlign = 'center'; ctx.fillText('M', tip.x, y + 2.5);
}
function drawBang() {
  const s = Math.max(0.7, bob.s), pop = Math.min(1, biteT / 0.12);
  const y = bob.y - 42 * s - (1 - pop) * 10;
  ctx.save(); ctx.translate(bob.x, y); ctx.scale(pop * s, pop * s);
  const leg = outcome && outcome.legend;
  ctx.fillStyle = leg ? '#b48cff' : '#ff4f6d';
  ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = "700 34px 'Caveat',cursive"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(leg ? '!!!' : '!', 0, 2);
  ctx.restore();
  // 剩餘時間環
  if (!S.auto) {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(bob.x, y, 25 * s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - biteT / 1.2)); ctx.stroke();
  }
  ctx.textBaseline = 'alphabetic';
}
function pill(x, y, w, h, fill, label, frac, fillColor) {
  const r = h / 2;
  ctx.fillStyle = fill; roundRect(x, y, w, h, r); ctx.fill();
  if (frac > 0) { ctx.save(); roundRect(x, y, w, h, r); ctx.clip(); ctx.fillStyle = fillColor; ctx.fillRect(x, y, w * frac, h); ctx.restore(); }
  ctx.fillStyle = '#fff'; ctx.font = "700 14px 'Noto Sans TC',sans-serif"; ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2 + 5);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawPowerBar() {
  const h = clamp(H * 0.3, 120, 220), w = 18, x = Math.max(16, rodBase.x - clamp(W * 0.22, 80, 170)), y = dockTop - h - 18;
  ctx.fillStyle = 'rgba(20,18,40,.45)'; roundRect(x - 6, y - 6, w + 12, h + 12, 14); ctx.fill();
  const g = ctx.createLinearGradient(0, y + h, 0, y);
  g.addColorStop(0, '#ffe7a8'); g.addColorStop(MID, '#7fe0f0'); g.addColorStop(DEEP, '#5b7dff'); g.addColorStop(1, '#a36bff');
  ctx.save(); roundRect(x, y, w, h, 9); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = g; ctx.fillRect(x, y + h * (1 - power), w, h * power);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (const t of [MID, DEEP]) ctx.fillRect(x - 3, y + h * (1 - t) - 1, w + 6, 2);
  ctx.font = "700 12px 'Noto Sans TC',sans-serif"; ctx.textAlign = 'left';
  [[0, MID, '淺灘'], [MID, DEEP, '近海'], [DEEP, 1, '深海']].forEach(([a, b, n]) => { ctx.fillText(n, x + w + 10, y + h * (1 - (a + b) / 2) + 4); });
  ctx.font = "700 26px 'Caveat',cursive"; ctx.fillText(Math.round(power * 100) + '%', x - 2, y - 12);
}
function drawReelBar() {
  const w = Math.min(260, W * 0.62), h = 26, x = (W - w) / 2, y = dockTop - h - 14;
  pill(x, y, w, h, 'rgba(20,18,40,.5)', reelP < 1 ? (S.auto && !pressing ? '自動收線中…' : pressing ? '收線中…' : '按住收線！') : '！', reelP, outcome && outcome.legend ? '#9b6bff' : '#2fb5c4');
}
function drawJump() {
  const u = jump.u, p = jumpPos(u), o = outcome;
  const size = lerp(46 * jump.s0, 150, Math.min(1, u * 1.4)) * (o.legend ? 1.25 : 1);
  const rot = Math.sin(u * Math.PI * 2) * 0.25;
  // 水滴尾巴
  if (u < 0.5 && Math.random() < 0.6) drops.push({ x: p.x + rand(-10, 10), y: p.y + size * 0.3, vx: rand(-30, 30), vy: rand(0, 60), life: 0, max: 0.6, r: rand(1.5, 3), color: '#e9f7ff' });
  if (jump.flashed && u < 0.62) {
    const a = 1 - (u - 0.45) / 0.17;
    ctx.fillStyle = o.legend ? `rgba(200,170,255,${a * 0.5})` : `rgba(255,250,220,${a * 0.5})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, size * (1.1 + (1 - a)), 0, Math.PI * 2); ctx.fill();
  }
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(rot);
  if (o.kind === 'mon') {
    const showReal = jump.flashed;
    const im = showReal ? (o.img.complete && o.img.naturalWidth ? o.img : null) : o.sil;
    if (im) ctx.drawImage(im, -size / 2, -size / 2, size, size);
    else { ctx.fillStyle = '#0d1630'; ctx.beginPath(); ctx.ellipse(0, 0, size * 0.35, size * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    if (showReal && o.shiny) for (let k = 0; k < 6; k++) { const a = T * 3 + k; ctx.fillStyle = '#fff7b5'; ctx.fillRect(Math.cos(a) * size * 0.55, Math.sin(a * 1.3) * size * 0.5, 3, 3); }
  } else {
    const emo = { shoe: '🥾', chest: '🧰', bottle: '🍾' }[o.kind];
    if (o.kind === 'chest') drawChest(size * 0.7);
    else if (o.kind === 'bottle') drawBottle(size * 0.7);
    else { ctx.font = `${size * 0.6}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(emo, 0, 0); ctx.textBaseline = 'alphabetic'; }
  }
  ctx.restore();
}
function drawChest(s) {
  ctx.fillStyle = '#8a4f2a'; ctx.fillRect(-s / 2, -s * 0.15, s, s * 0.5);
  ctx.fillStyle = '#a8653a'; ctx.beginPath(); ctx.moveTo(-s / 2, -s * 0.15); ctx.quadraticCurveTo(0, -s * 0.6, s / 2, -s * 0.15); ctx.fill();
  ctx.fillStyle = '#ffcf4a'; ctx.fillRect(-s / 2, -s * 0.17, s, s * 0.06); ctx.fillRect(-s * 0.08, -s * 0.2, s * 0.16, s * 0.24);
  ctx.fillRect(-s * 0.32, -s * 0.15, s * 0.06, s * 0.5); ctx.fillRect(s * 0.26, -s * 0.15, s * 0.06, s * 0.5);
}
function drawBottle(s) {
  ctx.rotate(-0.6);
  ctx.fillStyle = 'rgba(150,230,200,.85)'; roundRect(-s * 0.18, -s * 0.2, s * 0.36, s * 0.6, s * 0.1); ctx.fill();
  ctx.fillRect(-s * 0.07, -s * 0.42, s * 0.14, s * 0.24);
  ctx.fillStyle = '#b07a48'; ctx.fillRect(-s * 0.08, -s * 0.5, s * 0.16, s * 0.1);
  ctx.fillStyle = '#fff6dc'; ctx.save(); ctx.rotate(0.2); ctx.fillRect(-s * 0.1, -s * 0.1, s * 0.2, s * 0.36); ctx.restore();
}
function drawFloats() {
  ctx.textAlign = 'center';
  for (const f of floats) {
    const a = f.t < 1.1 ? 1 : 1 - (f.t - 1.1) / 0.5;
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = `900 ${f.size}px 'Noto Sans TC',sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,18,40,.55)'; ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/* ============ 揭曉 ============ */
const timeScaled = ms => ms / timeScale;
const sleep = ms => new Promise(r => setTimeout(r, timeScaled(ms)));
let closeFn = null;
function closeReveal() { if (closeFn) closeFn(); }
function waitClose(ms) {
  return new Promise(r => {
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(t); closeFn = null; r(); };
    const t = setTimeout(fin, timeScaled(ms));
    closeFn = fin;
  });
}
$('reveal').addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); closeReveal(); });
function flash(kind) { const f = $('flash'); f.className = ''; void f.offsetWidth; f.className = 'go' + (kind ? ' ' + kind : ''); }

function setCard({ cls = '', img = '', emo = '', no = '', name = '', tags = '', line = '' }) {
  const card = $('rvCard');
  card.className = 'rv-card ' + cls;
  const im = $('rvImg');
  im.classList.remove('glow');
  im.style.display = img ? '' : 'none';
  if (img) im.src = img;
  $('rvEmo').textContent = emo; $('rvEmo').style.display = emo ? '' : 'none';
  $('rvNo').textContent = no; $('rvName').textContent = name;
  $('rvTags').innerHTML = tags; $('rvLine').textContent = line;
}
async function openCard(opts, ms) {
  setCard(opts);
  revealOpen = true;
  $('reveal').classList.add('show');
  await waitClose(ms);
  $('reveal').classList.remove('show');
  revealOpen = false;
  await sleep(280);
}
const tierTag = id => `<span class="tag ${P[id].tier}">${C.tierName(id)}</span>`;
function monTags(o, isNew) {
  return (isNew ? '<span class="tag new">NEW</span>' : '') + tierTag(o.id) + (o.shiny ? '<span class="tag shiny">✨ 閃光</span>' : '') + `<span class="tag zone">${ZONE_NAME[o.zone]}</span>`;
}
function miniCard(o) {
  const el = document.createElement('div');
  el.className = 'mini';
  el.innerHTML = `<img src="${C.img(o.id, o.shiny)}" alt=""><span class="num">${noStr(o.id)}</span>${P[o.id].zh}`;
  const box = $('minis');
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, timeScaled(2600));
}
async function showResult(o) {
  o.zone = zoneOf(castPower);
  const dwell = (auto, manual) => (S.auto ? auto : manual);
  if (o.kind === 'mon') {
    const r = C.add(o.id, o.shiny);
    refreshUI();
    const tier = P[o.id].tier, rank = C.tierRank(o.id);
    const big = r.isNew || o.shiny || tier !== 'common';
    if (big) {
      sfx.reveal(o.shiny ? Math.max(2, rank) : rank);
      if (o.shiny) sfx.sparkle();
      const line = o.legend ? '海面的光慢慢退去了……' : o.shiny ? '顏色不一樣！閃閃發亮！' : r.isNew ? '第一次釣到！登錄進圖鑑了。' : '';
      await openCard({ cls: tier + (o.shiny ? ' shiny' : ''), img: C.img(o.id, o.shiny), no: noStr(o.id), name: P[o.id].zh, tags: monTags(o, r.isNew), line },
        dwell(o.legend ? 4200 : o.shiny ? 3600 : 2400 + rank * 500, 6000));
    } else {
      sfx.mini(); miniCard(o);
    }
    for (const ev of C.evolve()) await evoCard(ev);
  } else if (o.kind === 'shoe') {
    sfx.shoe();
    await openCard({ cls: 'junk', emo: '🥾', name: '舊鞋子', tags: '<span class="tag">雜物</span>', line: choice(SHOE_LINES) }, dwell(2400, 5000));
  } else if (o.kind === 'chest') {
    sfx.chest(); S.bait++; saveCfg(); refreshUI();
    await openCard({ cls: 'junk srare', emo: '🎁', name: '寶箱！', tags: '<span class="tag legend">大師餌 ×1</span>', line: '裡面有一顆大師餌！下一竿保證釣到稀有以上的寶可夢。' }, dwell(3000, 6000));
  } else if (o.kind === 'bottle') {
    sfx.bottle();
    await openCard({ cls: 'junk', img: '../shared/pikachu.webp', name: '瓶中信', tags: '<span class="tag rare">皮卡丘寄來的</span>', line: choice(PIKA_LINES) }, dwell(3200, 6000));
  }
  outcome = null;
  state = 'idle'; autoT = rand(0.5, 1.1);
  refreshUI();
}
async function evoCard(ev) {
  const from = P[ev.from], to = P[ev.to];
  sfx.evolve();
  setCard({ cls: 'evo', img: C.img(ev.from, false), no: noStr(ev.from), name: from.zh, tags: '<span class="tag">集滿 3 隻</span>', line: `咦？${from.zh}的樣子……` });
  revealOpen = true; $('reveal').classList.add('show');
  const im = $('rvImg');
  for (let i = 0; i < 6; i++) { im.classList.toggle('glow', i % 2 === 0); await sleep(220 - i * 20); }
  im.classList.add('glow');
  await sleep(300);
  flash(); sfx.evolved();
  im.src = C.img(ev.to, false);
  await sleep(120);
  im.classList.remove('glow');
  $('rvNo').textContent = noStr(ev.to); $('rvName').textContent = to.zh;
  $('rvTags').innerHTML = (ev.isNew ? '<span class="tag new">NEW</span>' : '') + tierTag(ev.to) + '<span class="tag">進化</span>';
  $('rvLine').textContent = `恭喜！${from.zh}進化成了${to.zh}！`;
  refreshUI();
  await waitClose(S.auto ? 2800 : 6000);
  $('reveal').classList.remove('show'); revealOpen = false;
  await sleep(280);
}

/* ============ 介面 ============ */
function setK(k, v) { document.querySelectorAll(`[data-k="${k}"]`).forEach(e => { e.textContent = v; }); }
function refreshUI() {
  const n = C.count();
  setK('count', n); setK('total', TOTAL); setK('shiny', C.shinyCount());
  setK('legend', LEGENDS.filter(id => C.has(id)).length); setK('legendTotal', LEGENDS.length);
  setK('bait', S.bait);
  $('baitChip').classList.toggle('show', S.bait > 0);
  document.querySelectorAll('[data-bar="dex"]').forEach(e => { e.style.width = (n / TOTAL * 100).toFixed(1) + '%'; });
  $('btnAuto').classList.toggle('on', S.auto);
  document.querySelectorAll('[data-sw]').forEach(b => b.classList.toggle('off', !S[b.dataset.sw]));
  const rec = C.recent();
  $('recent').innerHTML = rec.length ? rec.map(r => `<div class="rec ${r.s ? 's' : ''} ${P[r.id] && P[r.id].tier === 'legend' ? 'legend' : ''}" title="${noStr(r.id)} ${P[r.id] ? P[r.id].zh : ''}"><img src="${C.img(r.id, r.s)}" alt="" loading="lazy"></div>`).join('')
    : '<div class="empty">還沒有釣到寶可夢，點一下甩竿吧！</div>';
}
let lastBtn = '';
function syncCastBtn() {
  let lbl, sub, cls = '', p = 0;
  switch (state) {
    case 'idle': lbl = '🎣 甩竿'; sub = S.auto ? '自動釣魚中．也可以自己按' : '按住越久甩越遠'; break;
    case 'charge': lbl = '放開甩出去！'; sub = `${Math.round(power * 100)}% · ${ZONE_NAME[zoneOf(power)]}`; p = power; break;
    case 'cast': case 'wait': lbl = '等待中…'; sub = '浮標沉下去就點！'; cls = 'wait'; break;
    case 'bite': lbl = '上鉤了！點！'; sub = '快點一下'; cls = 'bite'; break;
    case 'reel': lbl = '按住收線'; sub = `${Math.round(reelP * 100)}%`; p = reelP; break;
    case 'jump': lbl = '釣起來了！'; sub = '是什麼呢……'; cls = 'wait'; break;
    default: lbl = '🎣 甩竿'; sub = '點一下繼續'; cls = 'wait';
  }
  const key = lbl + sub + cls + Math.round(p * 50);
  if (key === lastBtn) return;
  lastBtn = key;
  $('castLbl').textContent = lbl; $('castSub').textContent = sub;
  const b = $('btnCast'); b.className = cls; b.style.setProperty('--p', (p * 100).toFixed(0) + '%');
}
$('btnAuto').addEventListener('click', () => {
  AU.init(); S.auto = !S.auto; saveCfg(); refreshUI(); sfx.click();
  if (S.auto && state === 'idle') autoT = 0.6;
  $('hint').textContent = S.auto ? '自動釣魚中．點一下也能自己甩' : '點一下甩竿．按住越久甩越遠';
  $('hint').classList.remove('hide'); manualHint = true;
});
document.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', e => {
  e.stopPropagation(); AU.init();
  const k = b.dataset.sw; S[k] = !S[k]; saveCfg();
  if (k === 'music') AU.setMusic(S.music); else AU.setSfx(S.sfx);
  refreshUI(); sfx.click();
}));
const goHome = () => { location.href = '../'; };
$('btnHome').addEventListener('click', goHome);
$('hudHome').addEventListener('click', goHome);

/* ============ 圖鑑 ============ */
let dexPage = 0, dexFilter = 'all';
const shinyView = new Set();
function openDex() { AU.init(); dexPage = 0; $('mDex').classList.add('show'); refreshUI(); requestAnimationFrame(renderDex); }
function closeDex() { $('mDex').classList.remove('show'); }
function renderDex() {
  const gridEl = $('dxGrid'), box = gridEl.parentElement;
  const w = box.clientWidth - 16, h = box.clientHeight - 16;
  const cols = Math.max(3, Math.floor((w + 6) / 86)), rows = Math.max(2, Math.floor((h + 6) / 104));
  const per = cols * rows;
  const list = WATER.filter(p => {
    const e = C.store.dex[p.id];
    if (dexFilter === 'got') return e && e.got;
    if (dexFilter === 'miss') return !(e && e.got);
    if (dexFilter === 'shiny') return e && e.gotS;
    if (dexFilter === 'legend') return p.tier === 'legend';
    return true;
  });
  const pages = Math.max(1, Math.ceil(list.length / per));
  dexPage = clamp(dexPage, 0, pages - 1);
  gridEl.style.gridTemplateColumns = `repeat(${cols},1fr)`;
  gridEl.style.gridTemplateRows = `repeat(${rows},1fr)`;
  gridEl.innerHTML = list.slice(dexPage * per, dexPage * per + per).map(p => {
    const e = C.store.dex[p.id] || {}, sh = shinyView.has(p.id) && e.gotS;
    return `<div class="dcell ${p.tier} ${e.got ? '' : 'miss'} ${sh ? 'sh' : ''} ${e.gotS ? 'canS' : ''}" data-id="${p.id}"><span class="n num">${noStr(p.id)}</span>
      ${e.got ? `<span class="c">×${(e.n || 0) + (e.s || 0)}</span>` : ''}${e.gotS ? '<span class="st">✨</span>' : ''}
      <img src="${C.img(p.id, sh)}" alt="" loading="lazy"><div class="nm">${e.got ? p.zh : '？？？'}</div></div>`;
  }).join('') || '<div class="empty" style="grid-column:1/-1;text-align:center;padding-top:40px">還沒有符合的寶可夢</div>';
  $('dxPage').textContent = `${dexPage + 1}/${pages}`;
}
$('btnDex').addEventListener('click', openDex);
$('dxClose').addEventListener('click', closeDex);
$('mDex').addEventListener('click', e => { if (e.target === $('mDex')) closeDex(); });
$('dxGrid').addEventListener('click', e => {
  const c = e.target.closest('.dcell'); if (!c) return;
  const id = +c.dataset.id, en = C.store.dex[id];
  if (!(en && en.gotS)) return;
  shinyView.has(id) ? shinyView.delete(id) : shinyView.add(id);
  sfx.click(); renderDex();
});
$('dxTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]'); if (!b) return;
  dexFilter = b.dataset.f; dexPage = 0;
  $('dxTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderDex();
});
$('dxPrev').addEventListener('click', () => { dexPage--; renderDex(); });
$('dxNext').addEventListener('click', () => { dexPage++; renderDex(); });
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

/* ============ 測試用 ============ */
// __fish.force('legend' | 'chest' | 'shoe' | 'bottle' | 'shiny' | 全國編號, ...) → 接下來幾次上鉤的結果
window.__fish = {
  force: (...k) => { forceQueue.push(...k); return forceQueue.slice(); },
  speed: n => { timeScale = n; return n; },
  state: () => ({ state, auto: S.auto, bait: S.bait, count: C.count(), shiny: C.shinyCount(), recent: C.recent().slice(0, 5).map(r => P[r.id].zh), queue: forceQueue.slice() }),
  night: v => { night = v; applyTheme(); buildBg(); tickClock(); },
};

/* ============ 主迴圈 ============ */
let lastNow = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000) * timeScale;
  lastNow = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
// 有些內嵌預覽視窗在背景時會停掉 requestAnimationFrame（但頁面仍算可見）：用計時器補跑邏輯，避免卡住
setInterval(() => {
  const now = performance.now();
  if (document.hidden || now - lastNow < 250) return;
  const dt = Math.min(0.1, (now - lastNow) / 1000) * timeScale;
  lastNow = now;
  update(dt);
}, 100);
new ResizeObserver(() => { layout(); if ($('mDex').classList.contains('show')) renderDex(); }).observe(wrap);
document.addEventListener('visibilitychange', () => { if (document.hidden) { pressing = false; AU.suspend(); } else { AU.resume(); lastNow = performance.now(); } });
applyTheme();
layout();
tickClock(); setInterval(tickClock, 20000);
refreshUI();
if (S.auto) $('hint').textContent = '自動釣魚中．點一下也能自己甩';
setTimeout(() => $('hint').classList.add('hide'), 7000);
requestAnimationFrame(frame);
