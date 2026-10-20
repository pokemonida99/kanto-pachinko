'use strict';
/* 寶可夢夾娃娃機（claw/）：全國 1025 隻玩偶，免費無限夾 */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const pickOne = a => a[Math.floor(Math.random() * a.length)];

const C = Collect.create({ key: 'clawPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
const P = C.P;
const TOTAL = POKEDEX.length;
const LEGENDS = POKEDEX.filter(p => p.tier === 'legend');
const TIER_NAME = Collect.TIER_NAME;
const RATE = { common: 0.70, rare: 0.45, srare: 0.25, legend: 0.10 };
const SHINY_RATE = 1 / 100, PITY = 5, GOLD_EVERY = 8, LEGEND_EVERY = 40, PILE_N = 16, SHUFFLE_SEC = 60;
const numTxt = id => '#' + String(C.no(id)).padStart(4, '0');
const GENS = [['I', '關都', 1, 151], ['II', '城都', 152, 251], ['III', '豐緣', 252, 386], ['IV', '神奧', 387, 493], ['V', '合眾', 494, 649],
  ['VI', '卡洛斯', 650, 721], ['VII', '阿羅拉', 722, 809], ['VIII', '伽勒爾', 810, 905], ['IX', '帕底亞', 906, 1025]];

// 設定（只存開關，不是圖鑑）
const CFG_KEY = 'clawPachinko.cfg';
const cfg = Object.assign({ music: true, sfx: true, auto: true }, (() => { try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; } })());
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} };

/* ============ 音樂與音效（WebAudio 即時合成，原創街機曲） ============ */
const AU = (() => {
  let ac = null, master, bgm, sfx, noiseBuf, nextT = 0, step = 0, motor = null;
  const BGM_VOL = 0.42;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = cfg.music ? BGM_VOL : 0; bgm.connect(master);
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
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // 背景音樂：F 大調 150 BPM 的遊樂場小曲，F–Dm–B♭–C 循環，鐵琴主旋律＋蹦恰低音
  const E = 60 / 150 / 2;
  const LEAD = [
    [77, 0, 81, 84, 81, 77, 81, 0], [74, 77, 81, 0, 79, 77, 74, 0], [70, 74, 77, 82, 81, 0, 79, 77], [79, 0, 76, 72, 74, 76, 79, 0],
    [84, 0, 84, 81, 77, 81, 84, 86], [86, 0, 84, 81, 77, 0, 74, 77], [82, 81, 79, 77, 74, 77, 79, 82], [81, 0, 79, 0, 77, 0, 0, 0],
  ];
  const ROOT = [41, 38, 46, 48, 41, 38, 46, 48];
  const CHORD = { 41: [65, 69, 72], 38: [62, 65, 69], 46: [62, 65, 70], 48: [64, 67, 70] };
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, n = LEAD[bar][i], r = ROOT[bar];
    if (n) { osc(bgm, 'triangle', hz(n), t, E * 0.9, 0.05); osc(bgm, 'sine', hz(n + 12), t, E * 1.8, 0.02); osc(bgm, 'square', hz(n), t, E * 0.45, 0.01); }
    if (i % 2 === 0) osc(bgm, 'triangle', hz(i % 4 === 0 ? r : r + 7), t, E * 0.8, 0.1);
    else CHORD[r].forEach(m => osc(bgm, 'square', hz(m), t, E * 0.28, 0.008));
    if (i === 0 || i === 4) osc(bgm, 'sine', 140, t, 0.14, 0.2, 48);
    if (i === 2 || i === 6) noise(bgm, t, 0.08, 0.06, 'bandpass', 2600);
    if (i % 2 === 1) noise(bgm, t, 0.025, 0.02, 'highpass', 8000);
  }
  function duck(sec) {
    if (!ac || !cfg.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.15, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  function setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } }
  function setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); }
  function notes(list, type = 'square', vol = 0.05, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m), t, d * 0.95, vol); osc(sfx, 'triangle', hz(m - 12), t, d, vol * 0.8); } t += d; }
    return t - ac.currentTime;
  }
  // 爪子馬達：持續的嗡嗡聲，h 橫移、v 下降、u 上升
  const MOTOR_F = { h: 82, v: 64, u: 96 };
  function setMotor(kind) {
    if (!ac) return;
    if (!kind) {
      if (motor) { const m = motor; motor = null; m.g.gain.setTargetAtTime(0, ac.currentTime, 0.03); m.o.stop(ac.currentTime + 0.25); m.o2.stop(ac.currentTime + 0.25); }
      return;
    }
    if (motor && motor.kind === kind) return;
    if (!motor) {
      const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 3;
      g.gain.value = 0; g.gain.setTargetAtTime(0.06, ac.currentTime, 0.03);
      o.connect(f); o2.connect(f); f.connect(g).connect(sfx); o.start(); o2.start();
      motor = { o, o2, g, kind: null };
    }
    motor.kind = kind;
    motor.o.frequency.setTargetAtTime(MOTOR_F[kind], ac.currentTime, 0.05);
    motor.o2.frequency.setTargetAtTime(MOTOR_F[kind] * 2.02, ac.currentTime, 0.05);
  }
  const play = {
    click() { if (ac) osc(sfx, 'square', 1400, ac.currentTime, 0.03, 0.025); },
    dropStart() { if (!ac) return; osc(sfx, 'triangle', 880, ac.currentTime, 0.12, 0.05, 440); },
    clack() { if (!ac) return; noise(sfx, ac.currentTime, 0.05, 0.2, 'highpass', 2500); osc(sfx, 'square', 1700, ac.currentTime, 0.03, 0.03); osc(sfx, 'square', 1100, ac.currentTime + 0.05, 0.04, 0.03); },
    grab() { notes([[76, 0.07], [79, 0.1]], 'square', 0.03); },
    grabOk() { notes([[76, 0.06], [81, 0.06], [84, 0.12]], 'square', 0.035); },
    empty() { if (ac) osc(sfx, 'triangle', 500, ac.currentTime, 0.25, 0.05, 260); },
    release() { if (ac) osc(sfx, 'sine', 700, ac.currentTime, 0.18, 0.06, 300); },
    // 「啊～」：鋸齒波通過 a 的兩個共振峰，往下滑＋顫音
    ah() {
      if (!ac) return; duck(1.2);
      const t = ac.currentTime;
      [[540, 280, 0], [700, 350, 0.04]].forEach(([f0, f1, dt]) => {
        const o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t + dt); o.frequency.exponentialRampToValueAtTime(f1, t + dt + 0.8);
        lfo.frequency.value = 6.5; lg.gain.value = 16; lfo.connect(lg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.linearRampToValueAtTime(0.32, t + dt + 0.06); g.gain.setValueAtTime(0.3, t + dt + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.9);
        const f1n = ac.createBiquadFilter(); f1n.type = 'bandpass'; f1n.frequency.value = 850; f1n.Q.value = 4;
        const f2n = ac.createBiquadFilter(); f2n.type = 'bandpass'; f2n.frequency.value = 1250; f2n.Q.value = 5;
        o.connect(f1n).connect(g); o.connect(f2n).connect(g); g.connect(sfx);
        o.start(t + dt); lfo.start(t + dt); o.stop(t + dt + 0.95); lfo.stop(t + dt + 0.95);
      });
      noise(sfx, t + 0.05, 0.12, 0.08, 'lowpass', 500);
    },
    // 「咚」：玩偶掉進出貨口
    thud() { if (!ac) return; osc(sfx, 'sine', 120, ac.currentTime, 0.35, 0.45, 42); noise(sfx, ac.currentTime, 0.15, 0.3, 'lowpass', 380); osc(sfx, 'triangle', 220, ac.currentTime, 0.08, 0.08, 120); },
    soft() { if (ac) osc(sfx, 'sine', 180 + Math.random() * 60, ac.currentTime, 0.08, 0.05, 90); },
    prize(rank = 0) { duck(1.4); notes([[79, 0.08], [84, 0.08], [88, 0.08], [91 + rank * 2, 0.3]], 'square', 0.04); if (ac) [96, 100, 103].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + 0.3 + i * 0.06, 0.25, 0.03)); },
    newDex() { if (ac) [88, 91, 96].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + 0.45 + i * 0.07, 0.3, 0.035)); },
    lamp() { if (ac) osc(sfx, 'triangle', 1320, ac.currentTime, 0.15, 0.05); },
    pityFull() { notes([[84, 0.07], [88, 0.07], [91, 0.07], [96, 0.2]], 'square', 0.035); },
    spawn() { if (ac) osc(sfx, 'sine', 500, ac.currentTime, 0.12, 0.04, 900); },
    shuffle() { if (!ac) return; for (let i = 0; i < 10; i++) { noise(sfx, ac.currentTime + i * 0.12, 0.1, 0.08, 'bandpass', 1500 + i * 120); osc(sfx, 'sine', 400 + Math.random() * 500, ac.currentTime + i * 0.12, 0.08, 0.03, 900); } },
    evo() { notes([[72, 0.08], [76, 0.08], [79, 0.08], [84, 0.08], [88, 0.3]], 'triangle', 0.06); },
    drumroll(dur) {
      if (!ac) return; duck(dur + 3);
      const t0 = ac.currentTime;
      for (let t = 0; t < dur; t += 0.045) noise(sfx, t0 + t, 0.04, 0.03 + 0.14 * (t / dur), 'bandpass', 900 + 1600 * (t / dur));
      osc(sfx, 'sawtooth', 160, t0, dur, 0.022, 720);
    },
    flash() { if (!ac) return; noise(sfx, ac.currentTime, 0.6, 0.3, 'highpass', 2500); [72, 76, 79, 84].forEach(m => osc(sfx, 'square', hz(m), ac.currentTime, 0.5, 0.022)); },
    fanfareRare() { duck(1.8); notes([[72, 0.09], [76, 0.09], [79, 0.09], [84, 0.18], [79, 0.09], [84, 0.5]], 'square', 0.045); },
    fanfareBig() {
      duck(3.4);
      const d = notes([[67, 0.11], [72, 0.11], [76, 0.11], [79, 0.22], [76, 0.11], [79, 0.11], [84, 0.33], [0, 0.05], [83, 0.11], [84, 0.11], [86, 0.11], [88, 0.7]], 'square', 0.05);
      if (ac) [72, 76, 79, 84].forEach(m => osc(sfx, 'triangle', hz(m), ac.currentTime + d - 0.7, 1.2, 0.03));
    },
    legendIn() { duck(2); if (!ac) return; [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => osc(sfx, 'triangle', hz(m), ac.currentTime + i * 0.07, 0.4, 0.05)); },
  };
  return { init, play, setMusic, setSfx, setMotor, duck, suspend: () => ac && ac.suspend(), resume: () => ac && ac.state === 'suspended' && ac.resume() };
})();
const sfx = AU.play;

/* ============ 畫布與幾何 ============ */
const cv = $('cv'), ctx = cv.getContext('2d'), glassEl = $('glass');
const W = 480, RAIL = 34, CHUTE_R = 112, PILE_L = CHUTE_R + 4, PILE_R = W - 8, HOME_X = 57, L0 = 26;
const MIN_X = HOME_X, MAX_X = W - 42, G = 1500, CLAW_S = 1.3, TIP = 46 * CLAW_S;
let H = 640, FLOOR = 614, CHUTE_TOP = 470, scale = 1, dpr = 1, BG = null;
let plushes = [];
let speedMul = 1;

function layout(newH) {
  const old = FLOOR;
  H = newH; FLOOR = H - 26; CHUTE_TOP = FLOOR - 150;
  plushes.forEach(p => { p.y += FLOOR - old; });
}
function fit() {
  const gw = glassEl.clientWidth, gh = glassEl.clientHeight;
  if (!gw || !gh) return;
  const nh = clamp(Math.round(W * gh / gw), 470, 900);
  scale = Math.min(gw / W, gh / nh);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = Math.floor(W * scale) + 'px'; cv.style.height = Math.floor(nh * scale) + 'px';
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(nh * scale * dpr);
  if (nh !== H) layout(nh);
  BG = buildBG();
}

const TYPE_COL = { normal: '#efe3cf', fire: '#ffb48f', water: '#a3cdff', grass: '#aee8a4', electric: '#ffe57f', ice: '#bff2f2', fighting: '#f4a892', poison: '#dbb0f2',
  ground: '#ecd09a', flying: '#cbd7ff', psychic: '#ffb0cf', bug: '#d4ea96', rock: '#dccda6', ghost: '#bfb0e6', dragon: '#b6a8ff', dark: '#bcae9c', steel: '#cfd6e0', fairy: '#ffc6e3' };
const darkCache = {};
function darker(hex, k = 0.78) {
  if (darkCache[hex + k]) return darkCache[hex + k];
  const n = parseInt(hex.slice(1), 16), f = c => Math.round(c * k);
  return (darkCache[hex + k] = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`);
}
const IMG = new Map();
function img(id, s) {
  const k = (s ? 's' : 'n') + id;
  let im = IMG.get(k);
  if (!im) { im = new Image(); im.src = C.img(id, s); IMG.set(k, im); }
  return im;
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

function buildBG() {
  const b = document.createElement('canvas'); b.width = cv.width; b.height = cv.height;
  const g = b.getContext('2d'); g.scale(scale * dpr, scale * dpr);
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#fbefff'); gr.addColorStop(0.55, '#ffe6f3'); gr.addColorStop(1, '#ffd3e8');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 壁紙：白點＋小星星
  for (let y = 64, row = 0; y < FLOOR; y += 34, row++) {
    for (let x = (row % 2) * 17 + 10; x < W; x += 34) {
      if ((x * 7 + y * 3) % 5 === 0) star(g, x, y, 5, 'rgba(127,230,201,.55)');
      else { g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
    }
  }
  // 頂燈
  for (let i = 0; i < 4; i++) {
    const x = 70 + i * 113;
    gr = g.createRadialGradient(x, 6, 4, x, 40, 170);
    gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - 170, 0, 340, 220);
    g.fillStyle = '#fffbe6'; rr(g, x - 26, 0, 52, 7, 3); g.fill();
  }
  // 兩側陰影
  gr = g.createLinearGradient(0, 0, W, 0);
  gr.addColorStop(0, 'rgba(110,50,110,.2)'); gr.addColorStop(0.06, 'rgba(110,50,110,0)'); gr.addColorStop(0.94, 'rgba(110,50,110,0)'); gr.addColorStop(1, 'rgba(110,50,110,.2)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 絨毛地毯
  g.fillStyle = '#ffa3d0'; g.fillRect(0, FLOOR - 4, W, H);
  for (let x = 0; x < W + 16; x += 16) { g.beginPath(); g.arc(x, FLOOR - 4, 8, Math.PI, 0); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.35)';
  for (let x = 6; x < W; x += 22) { g.beginPath(); g.arc(x, FLOOR + 8 + (x % 3) * 3, 2, 0, 7); g.fill(); }
  // 出貨口的洞
  const cx = CHUTE_R / 2 + 1;
  g.fillStyle = '#ffd6ea'; g.beginPath(); g.ellipse(cx, FLOOR + 2, 50, 16, 0, 0, 7); g.fill();
  gr = g.createRadialGradient(cx, FLOOR + 6, 4, cx, FLOOR + 2, 46);
  gr.addColorStop(0, '#12061a'); gr.addColorStop(1, '#4a2a5a');
  g.fillStyle = gr; g.beginPath(); g.ellipse(cx, FLOOR + 3, 45, 12.5, 0, 0, 7); g.fill();
  // 軌道
  gr = g.createLinearGradient(0, RAIL - 22, 0, RAIL - 10);
  gr.addColorStop(0, '#f4f7fb'); gr.addColorStop(0.5, '#b9c3d1'); gr.addColorStop(1, '#8a94a6');
  g.fillStyle = gr; rr(g, 6, RAIL - 22, W - 12, 11, 5); g.fill();
  g.fillStyle = 'rgba(60,31,79,.35)'; for (let x = 20; x < W - 10; x += 24) g.fillRect(x, RAIL - 18, 2, 4);
  return b;
}
function star(g, x, y, r, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr2 = i % 2 ? r * 0.38 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  g.closePath(); g.fill();
}

/* ============ 玩偶 ============ */
let refills = 0, misses = 0, sessionCaught = 0, gameT = 0, forceTarget = null;
function makePlush(kind = '') {
  const id = kind === 'legend' ? pickOne(LEGENDS).id : C.pick({ boost: kind === 'gold' ? 2 : 0 });
  const k = clamp(H / 640, 1, 1.18), r = (kind === 'legend' ? 58 : 43 + rand(-2, 3)) * k;
  img(id, false);
  const p = { id, kind, shiny: Math.random() < SHINY_RATE, r, cr: r * 0.8, x: rand(PILE_L + r, PILE_R - r), y: -r - rand(0, 60), vx: rand(-40, 40), vy: 0,
    state: 'pile', ph: rand(0, 6.28), rot: 0, wob: 0, hop: 0, tw: 0 };
  if (p.shiny) img(id, true);
  return p;
}
function spawnRefill() {
  refills++;
  const kind = refills % LEGEND_EVERY === 0 ? 'legend' : refills % GOLD_EVERY === 0 ? 'gold' : '';
  const p = makePlush(kind);
  plushes.push(p);
  if (kind === 'legend') legendArrives(p);
  else if (kind === 'gold') toast('✨ 金光玩偶補貨！比較容易是稀有的');
  sfx.spawn();
  refreshUI();
  return p;
}
function legendArrives(p) {
  p.x = rand(PILE_L + 120, PILE_R - 80);
  toast('🌟 傳說玩偶補貨了！金紫色的那一隻');
  party(2.5); sfx.legendIn();
}
function fillPile() {
  plushes = [];
  for (let i = 0; i < PILE_N; i++) {
    const p = makePlush(i === 7 ? 'gold' : '');
    p.x = PILE_L + p.r + ((i * 61) % (PILE_R - PILE_L - 2 * p.r));
    p.y = FLOOR - p.r - Math.floor(i / 5) * 60 - rand(0, 20);
    plushes.push(p);
  }
  for (let i = 0; i < 240; i++) physics(1 / 60, true);
}

/* 物理：玩偶是會互相推開的圓（碰撞半徑比畫的小一點，所以看起來疊在一起） */
function physics(dt, quiet) {
  for (const p of plushes) {
    if (p.state === 'held') continue;
    if (p.hop > 0) { p.hop -= dt; if (p.hop <= 0) { p.vy = -rand(480, 720); p.vx = rand(-170, 170); p.wob = 1; } }
    p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - 1.6 * dt;
    if (p.state === 'chute') {
      p.x = clamp(p.x, 10 + p.r * 0.6, CHUTE_R - 12 - p.r * 0.6);
      if (p.y - p.r > FLOOR + 6) { p.state = 'gone'; onPrize(p); }
      continue;
    }
    if (p.x < PILE_L + p.cr) { p.x = PILE_L + p.cr; p.vx = Math.abs(p.vx) * 0.3; }
    if (p.x > PILE_R - p.cr) { p.x = PILE_R - p.cr; p.vx = -Math.abs(p.vx) * 0.3; }
    const fl = FLOOR - p.cr * 0.95;
    if (p.y > fl) {
      if (p.vy > 380 && !quiet) { sfx.soft(); p.wob = Math.max(p.wob, 0.6); }
      p.y = fl; p.vy = -p.vy * 0.18; p.vx *= 0.8;
    }
  }
  const pile = plushes.filter(p => p.state === 'pile');
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < pile.length; i++) {
      const a = pile[i];
      for (let j = i + 1; j < pile.length; j++) {
        const b = pile[j];
        const dx = b.x - a.x, dy = b.y - a.y, min = a.cr + b.cr;
        if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01, nx = d2 ? dx / d : 1, ny = d2 ? dy / d : 0, push = (min - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j2 = -vn * 0.55;
          a.vx -= nx * j2; a.vy -= ny * j2; b.vx += nx * j2; b.vy += ny * j2;
          if (vn < -420 && !quiet) { sfx.soft(); a.wob = b.wob = 0.5; }
        }
      }
    }
  }
  for (const p of pile) {
    if (p.x < PILE_L + p.cr) p.x = PILE_L + p.cr;
    if (p.x > PILE_R - p.cr) p.x = PILE_R - p.cr;
    if (p.y > FLOOR - p.cr * 0.95) p.y = FLOOR - p.cr * 0.95;
    p.wob = Math.max(0, p.wob - dt * 1.4);
  }
}

/* ============ 爪子 ============ */
const SPD = { move: 340, drop: 430, lift: 360, carry: 370 };
const claw = { x: HOME_X + 120, L: L0, Lt: L0, Lg: L0, open: 0.35, state: 'idle', tx: 0, dropAfter: false, held: null, holdOff: 36,
  target: null, plan: null, slipT: 0, slipX: 0, sw: 0, swV: 0, vx: 0, st: 0, pause: 0 };
let holdDir = 0, lastUser = -99, idleT = 0;
const head = () => ({ x: claw.x + Math.sin(claw.sw) * (claw.L + 20), y: RAIL + claw.L * Math.cos(claw.sw) });
const clawFree = () => claw.state === 'idle' || claw.state === 'move';

function targetUnder(x) {
  let best = null;
  for (const p of plushes) {
    if (p.state !== 'pile' || p.y < 0 || Math.abs(p.x - x) > p.r * 0.95) continue;
    if (!best || p.y - p.r < best.y - best.r) best = p;
  }
  return best;
}
function startDrop() {
  const c = claw;
  c.dropAfter = false;
  const t = targetUnder(c.x);
  c.target = t;
  c.Lt = t ? clamp(t.y + t.r * 0.2 - TIP - RAIL, L0 + 20, FLOOR - TIP - 16 - RAIL) : FLOOR - TIP - 20 - RAIL;
  c.state = 'drop'; c.sw *= 0.3;
  sfx.dropStart();
  syncDropBtn();
}
function moveTo(x, drop) {
  if (!clawFree()) return;
  claw.tx = clamp(x, MIN_X, MAX_X); claw.dropAfter = !!drop; claw.state = 'move';
}
function doGrab() {
  const c = claw, h = head();
  let p = null, bd = 1e9;
  for (const q of plushes) {
    if (q.state !== 'pile') continue;
    const d = Math.hypot(q.x - h.x, q.y - (h.y + TIP - 8));
    if (d < q.r * 1.15 && d < bd) { bd = d; p = q; }
  }
  c.Lg = c.L; c.state = 'lift';
  if (!p) { addFloat(h.x, h.y + 50, '空夾～', '#b07a99'); sfx.empty(); return; }
  p.state = 'held'; p.wob = 0.6; c.held = p; c.holdOff = TIP - 0.2 * p.r;
  if (forceTarget === p) forceTarget = null;
  const forced = misses >= PITY, ok = forced || Math.random() < RATE[P[p.id].tier];
  if (ok) {
    c.plan = { ok: true, forced };
    if (forced) { addFloat(h.x, h.y - 12, '保底必中！', '#ff3d8b', 22); sfx.pityFull(); }
    else sfx.grabOk();
    misses = 0;
  } else {
    const slipMin = PILE_L + p.r + 16;
    let at = Math.random() < 0.55 ? 'lift' : 'carry';
    if (at === 'carry' && c.x - slipMin < 50) at = 'lift';
    c.plan = { ok: false, at, f: rand(0.3, 0.85) };
    c.slipX = slipMin + (c.x - slipMin) * rand(0.2, 0.85);
    sfx.grab();
  }
  refreshLamps();
}
function doSlip() {
  const c = claw, p = c.held;
  if (!p) return;
  c.held = null;
  p.state = 'pile'; p.vy = -80; p.vx = c.vx * 0.4 + rand(-50, 50); p.wob = 1;
  c.open = Math.min(1, c.open + 0.35);
  misses = Math.min(PITY, misses + 1);
  sfx.ah(); shakeGlass();
  addFloat(p.x, p.y - p.r - 8, pickOne(['啊～', '差一點！', '滑掉了～', '再一次！']), '#ff5fa2', 20);
  refreshLamps();
  if (misses >= PITY) { setTimeout(() => sfx.lamp(), 500); toast('💡 保底燈全亮！下一次一定夾到'); }
  else sfx.lamp();
}

function stepClaw(dt) {
  const c = claw, px = c.x;
  let motor = null;
  switch (c.state) {
    case 'idle':
      idleT += dt;
      if (holdDir) {
        const nx = clamp(c.x + holdDir * SPD.move * dt, MIN_X, MAX_X);
        if (nx !== c.x) motor = 'h';
        c.x = nx; idleT = 0;
      }
      c.open += (0.35 - c.open) * Math.min(1, dt * 8);
      break;
    case 'move': {
      const d = c.tx - c.x, s = SPD.move * dt;
      if (Math.abs(d) <= s) { c.x = c.tx; if (c.dropAfter) startDrop(); else { c.state = 'idle'; idleT = 0; } }
      else { c.x += Math.sign(d) * s; motor = 'h'; }
      break;
    }
    case 'drop':
      c.open += (1 - c.open) * Math.min(1, dt * 6);
      c.L += SPD.drop * dt; motor = 'v';
      if (c.L >= c.Lt) { c.L = c.Lt; c.state = 'grab'; c.st = 0; sfx.clack(); }
      break;
    case 'grab':
      c.st += dt;
      c.open = 1 - Math.min(1, c.st / 0.32) * 0.72;
      if (c.st >= 0.42) doGrab();
      break;
    case 'lift':
      c.L -= SPD.lift * dt; motor = 'u';
      if (c.held && c.plan && !c.plan.ok && c.plan.at === 'lift' && !c.slipT) {
        const prog = 1 - (c.L - L0) / Math.max(1, c.Lg - L0);
        if (prog >= c.plan.f) c.slipT = 0.32;
      }
      if (c.L <= L0) { c.L = L0; c.state = 'carry'; c.tx = HOME_X; c.pause = c.held ? 0.28 : 0.05; }
      break;
    case 'carry': {
      if (c.pause > 0) { c.pause -= dt; break; }
      if (c.held && c.plan && !c.plan.ok && c.plan.at === 'carry' && !c.slipT && c.x <= c.slipX) c.slipT = 0.28;
      if (c.slipT) break;   // 抖一下才掉，抖的時候先停住
      const d = c.tx - c.x, s = SPD.carry * dt;
      if (Math.abs(d) <= s) { c.x = c.tx; c.state = c.held && !c.slipT ? 'release' : 'reset'; c.st = 0; }
      else { c.x += Math.sign(d) * s; motor = 'h'; }
      break;
    }
    case 'release':
      c.st += dt; c.open = Math.min(1, c.open + dt * 4);
      if (c.held && c.st > 0.15) { const p = c.held; c.held = null; p.state = 'chute'; p.vx = 0; p.vy = 30; sfx.release(); }
      if (c.st > 0.45) { c.state = 'reset'; c.st = 0; }
      break;
    case 'reset':
      c.st += dt; c.open += (0.35 - c.open) * Math.min(1, dt * 6);
      if (c.held && !c.slipT) { c.state = 'release'; c.st = 0; break; }
      if (c.st > 0.3 && !c.held) { c.state = 'idle'; idleT = 0; c.plan = null; c.target = null; syncDropBtn(); }
      break;
  }
  if (c.slipT) { c.slipT -= dt; if (c.slipT <= 0) { c.slipT = 0; doSlip(); } }
  // 擺盪：爪子加速時吊繩會晃
  const vx = (c.x - px) / dt, ax = clamp((vx - c.vx) / dt, -4000, 4000);
  c.vx = vx;
  c.swV += (-60 * c.sw - 3.2 * c.swV - ax * 0.0011) * dt;
  c.sw = clamp(c.sw + c.swV * dt, -0.32, 0.32);
  if (c.held) {
    const h = head(), p = c.held, jig = c.slipT ? Math.sin(gameT * 70) * 4 : 0;
    p.x += (h.x + jig - p.x) * Math.min(1, dt * 16);
    p.y += (h.y + c.holdOff - p.y) * Math.min(1, dt * 16);
    p.vx = vx; p.vy = 0;
  }
  AU.setMotor(motor);
}

/* 自動夾：挑一隻露在上面的玩偶 */
function autoPick() {
  const cands = plushes.filter(p => p.state === 'pile' && p.y > 60 && Math.abs(p.vy) < 90);
  if (!cands.length) return;
  const exposed = cands.filter(p => !cands.some(q => q !== p && q.y < p.y - 10 && Math.abs(q.x - p.x) < (q.cr + p.cr) * 0.7));
  const pool = exposed.length ? exposed : cands;
  let p = forceTarget && pool.includes(forceTarget) ? forceTarget : null;
  if (!p) {
    const w = pool.map(q => (q.kind === 'legend' ? 3 : q.kind === 'gold' ? 2 : 1) * (q.shiny ? 3 : 1) * (C.has(q.id) ? 1 : 1.6));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    p = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { p = pool[i]; break; } }
  }
  moveTo(p.x + rand(-5, 5), true);
}

/* ============ 洗牌（店員整理） ============ */
let shuffleT = 0;
function doShuffle() {
  toast('🧹 店員來整理玩偶囉～');
  const b = $('broom'); b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  sfx.shuffle();
  plushes.filter(p => p.state === 'pile').forEach((p, i) => { p.hop = 0.15 + i * 0.05; p.wob = 1; });
  if (!holdDir && claw.state === 'move' && claw.dropAfter) { claw.dropAfter = false; claw.state = 'idle'; }
}

/* ============ 漂浮字與火花 ============ */
let floats = [], sparks = [];
function addFloat(x, y, text, color = '#ff5fa2', size = 17) { floats.push({ x, y, text, color, size, t: 0 }); }
function burst(x, y, colors, n = 18) {
  for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(80, 320); sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, t: 0, life: rand(0.5, 1), c: pickOne(colors) }); }
}

/* ============ 主更新 ============ */
const pauses = new Set();
const paused = () => pauses.size > 0;
function update(dt) {
  if (paused()) { AU.setMotor(null); return; }
  gameT += dt;
  const n = Math.ceil(dt / (1 / 120)), h = dt / n;
  for (let i = 0; i < n; i++) { stepClaw(h); physics(h); }
  plushes = plushes.filter(p => p.state !== 'gone');
  floats.forEach(f => { f.t += dt; f.y -= 34 * dt; }); floats = floats.filter(f => f.t < 1.3);
  sparks.forEach(s => { s.t += dt; s.vy += 600 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }); sparks = sparks.filter(s => s.t < s.life);
  shuffleT += dt;
  if (shuffleT >= SHUFFLE_SEC && !claw.held && claw.state !== 'drop' && claw.state !== 'grab') { shuffleT = 0; doShuffle(); }
  if (cfg.auto && claw.state === 'idle' && !holdDir && idleT > 0.6 && gameT - lastUser > 3.5) autoPick();
}

/* ============ 繪圖 ============ */
function drawPlush(p, t) {
  const r = p.r, data = P[p.id];
  const rot = Math.sin(t * 1.6 + p.ph) * 0.04 + p.wob * Math.sin(t * 19 + p.ph) * 0.24;
  const sq = 1 + Math.sin(t * 2.3 + p.ph) * 0.03 + p.wob * Math.sin(t * 23) * 0.06;
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(rot); ctx.scale(1 + (sq - 1) * 0.6, 1 / sq);
  // 光暈
  if (p.kind === 'legend') {
    ctx.save(); ctx.rotate(t * 0.8);
    for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.fillStyle = i % 2 ? 'rgba(155,123,255,.28)' : 'rgba(255,201,60,.28)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -r * 1.75); ctx.lineTo(10, -r * 1.75); ctx.fill(); }
    ctx.restore();
    const gr = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 1.5);
    gr.addColorStop(0, 'rgba(200,170,255,.75)'); gr.addColorStop(1, 'rgba(200,170,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, 7); ctx.fill();
  } else if (p.kind === 'gold') {
    const a = 0.45 + Math.sin(t * 3 + p.ph) * 0.2;
    const gr = ctx.createRadialGradient(0, 0, r * 0.75, 0, 0, r * 1.38);
    gr.addColorStop(0, `rgba(255,214,80,${a})`); gr.addColorStop(1, 'rgba(255,214,80,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r * 1.38, 0, 7); ctx.fill();
  }
  const col = TYPE_COL[data.types[0]] || '#f0e0ea';
  // 小腳
  ctx.fillStyle = darker(col, 0.85);
  ctx.beginPath(); ctx.ellipse(-r * 0.42, r * 0.8, r * 0.24, r * 0.15, 0, 0, 7); ctx.ellipse(r * 0.42, r * 0.8, r * 0.24, r * 0.15, 0, 0, 7); ctx.fill();
  // 身體
  const gr = ctx.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.08, 0, 0, r * 1.05);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, col); gr.addColorStop(1, darker(col, 0.86));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.92, 0, 0, 7); ctx.fill();
  ctx.lineWidth = p.kind ? 3.5 : 2.2;
  ctx.strokeStyle = p.kind === 'legend' ? '#8b6bff' : p.kind === 'gold' ? '#f2b400' : darker(col, 0.62);
  ctx.stroke();
  ctx.setLineDash([3, 4]); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.ellipse(0, 0, r - 5, r * 0.92 - 5, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  // 寶可夢圖
  const im = img(p.id, p.shiny);
  if (im.complete && im.naturalWidth) ctx.drawImage(im, -r * 0.82, -r * 0.98, r * 1.64, r * 1.64);
  // 閃光：一閃一閃
  if (p.shiny) {
    const k = Math.pow((Math.sin(t * 5 + p.ph) + 1) / 2, 3);
    ctx.fillStyle = `rgba(255,255,255,${k * 0.45})`; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.92, 0, 0, 7); ctx.fill();
    star(ctx, r * 0.62, -r * 0.62, 5 + k * 6, '#ffe066');
    star(ctx, -r * 0.7, -r * 0.2, 3 + (1 - k) * 4, '#ffffff');
  }
  if (p.kind) star(ctx, 0, -r * 0.98, p.kind === 'legend' ? 10 : 7, p.kind === 'legend' ? '#9b7bff' : '#ffc400');
  // 名牌
  const fs = p.kind === 'legend' ? 12 : 10.5;
  ctx.font = `900 ${fs}px "Noto Sans TC",sans-serif`;
  if (!p.tw) p.tw = ctx.measureText(data.zh).width;
  const ty = r * 0.6;
  ctx.fillStyle = p.shiny ? '#fff4c2' : '#ffffff';
  rr(ctx, -p.tw / 2 - 5, ty - fs * 0.7, p.tw + 10, fs * 1.45, fs * 0.7); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = p.kind === 'legend' ? '#9b7bff' : '#ff9ccb'; ctx.stroke();
  ctx.fillStyle = p.kind === 'legend' ? '#5b3fd6' : '#b8326f';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(data.zh, 0, ty + 0.5);
  ctx.restore();
}
function prong(x0, y0, x1, y1, x2, y2, hook) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2 + hook, y2 + 3);
  ctx.strokeStyle = '#5d667a'; ctx.lineWidth = 7.5; ctx.stroke();
  ctx.strokeStyle = '#d8dfe9'; ctx.lineWidth = 4; ctx.stroke();
}
function drawClaw(t) {
  const c = claw, h = head(), o = c.open;
  // 台車
  ctx.fillStyle = '#ff7fb6'; rr(ctx, c.x - 32, RAIL - 28, 64, 25, 9); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#3c1f4f'; ctx.stroke();
  ctx.fillStyle = '#7fe6c9'; ctx.fillRect(c.x - 26, RAIL - 17, 52, 5);
  ctx.fillStyle = (c.state === 'idle' || c.state === 'move') ? (Math.sin(t * 6) > 0 ? '#ffe066' : '#fff6c2') : '#ff4d6d';
  ctx.beginPath(); ctx.arc(c.x + 18, RAIL - 20, 3, 0, 7); ctx.fill();
  // 瞄準光束
  if (c.state === 'idle' || c.state === 'move') {
    ctx.setLineDash([4, 7]); ctx.lineDashOffset = -t * 30;
    ctx.strokeStyle = 'rgba(255,95,162,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(h.x, h.y + TIP + 4); ctx.lineTo(h.x, FLOOR - 4); ctx.stroke(); ctx.setLineDash([]);
    const tp = targetUnder(c.state === 'move' ? c.tx : c.x);
    if (tp) {
      const by = tp.y - tp.r - 12 + Math.sin(t * 7) * 3;
      ctx.fillStyle = '#ff5fa2'; ctx.beginPath(); ctx.moveTo(tp.x - 8, by - 8); ctx.lineTo(tp.x + 8, by - 8); ctx.lineTo(tp.x, by + 2); ctx.fill();
    }
  }
  // 吊繩
  ctx.strokeStyle = '#4b5366'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(c.x, RAIL - 6); ctx.lineTo(h.x, h.y); ctx.stroke();
  ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 1; ctx.stroke();
  ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(-c.sw * 0.6); ctx.scale(CLAW_S, CLAW_S);
  // 後爪
  prong(0, 8, 0, 30, 0, 44 - (1 - o) * 4, 0);
  ctx.restore();
  if (c.held) drawPlush(c.held, t);
  ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(-c.sw * 0.6); ctx.scale(CLAW_S, CLAW_S);
  // 左右爪
  const ex = 14 + 20 * o, tx = 6 + 22 * o;
  prong(-7, 8, -ex, 26, -tx, 46, 5 + 3 * (1 - o));
  prong(7, 8, ex, 26, tx, 46, -5 - 3 * (1 - o));
  // 爪頭
  const gr = ctx.createLinearGradient(-14, 0, 14, 0);
  gr.addColorStop(0, '#9aa3b5'); gr.addColorStop(0.45, '#f4f7fb'); gr.addColorStop(1, '#7d879b');
  ctx.fillStyle = gr; rr(ctx, -15, -2, 30, 16, 7); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#3c1f4f'; ctx.stroke();
  ctx.fillStyle = '#ff5fa2'; ctx.beginPath(); ctx.arc(0, -3, 8, Math.PI, 0); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawChuteFront() {
  // 壓克力隔板
  const x = CHUTE_R - 8, top = CHUTE_TOP;
  ctx.fillStyle = 'rgba(190,236,255,.55)'; rr(ctx, x, top, 9, FLOOR - top + 4, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.5; ctx.stroke();
  // 出貨口外框
  ctx.fillStyle = 'rgba(190,236,255,.16)'; ctx.fillRect(4, top + 24, CHUTE_R - 12, FLOOR - top - 24);
  ctx.fillStyle = '#7fe6c9'; rr(ctx, 2, top, CHUTE_R - 1, 12, 6); ctx.fill();
  ctx.strokeStyle = '#3c1f4f'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(12 + i * 18, top + 6, 2.2, 0, 7); ctx.fill(); }
  ctx.font = '800 14px "Baloo 2",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,95,162,.9)'; ctx.fillText('PRIZE', CHUTE_R / 2, top + 30);
  const by = top + 50 + Math.sin(gameT * 5) * 4;
  ctx.beginPath(); ctx.moveTo(CHUTE_R / 2 - 10, by); ctx.lineTo(CHUTE_R / 2 + 10, by); ctx.lineTo(CHUTE_R / 2, by + 10); ctx.fill();
}
function render(t) {
  if (!BG) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(BG, 0, 0);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, CHUTE_R, FLOOR + 3); ctx.clip();
  for (const p of plushes) if (p.state === 'chute') drawPlush(p, t);
  ctx.restore();
  const pile = plushes.filter(p => p.state === 'pile').sort((a, b) => b.y - a.y);
  for (const p of pile) drawPlush(p, t);
  if (tipPlush && tipPlush.state === 'pile') {
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.ellipse(tipPlush.x, tipPlush.y, tipPlush.r + 5, tipPlush.r * 0.92 + 5, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  drawChuteFront();
  drawClaw(t);
  for (const s of sparks) { ctx.globalAlpha = 1 - s.t / s.life; star(ctx, s.x, s.y, 5, s.c); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of floats) {
    ctx.globalAlpha = Math.min(1, (1.3 - f.t) * 2.5);
    ctx.font = `900 ${f.size}px "Noto Sans TC",sans-serif`;
    ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/* ============ 抓到：出貨口、卡片、聚光燈 ============ */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function onPrize(p) {
  sfx.thud();
  const ch = $('chute'); ch.classList.remove('bump'); void ch.offsetWidth; ch.classList.add('bump');
  burst(CHUTE_R / 2, FLOOR - 10, ['#ffe066', '#ff9ccb', '#7fe6c9', '#ffffff'], 16);
  const tier = P[p.id].tier;
  const res = C.add(p.id, p.shiny);
  const evos = C.evolve();
  sessionCaught++;
  spawnRefill();
  refreshUI(); renderRecent();
  const it = { id: p.id, shiny: p.shiny, tier, isNew: res.isNew, kind: p.kind };
  if (p.shiny || tier === 'srare' || tier === 'legend') await spotlight(it);
  showCard(it);
  if (!(p.shiny || tier === 'srare' || tier === 'legend')) sfx.prize(Collect.TIER_RANK[tier]);
  if (res.isNew) sfx.newDex();
  evos.forEach(e => evoQ.push(e));
  if (evos.length) setTimeout(nextEvo, 900);
}
const badges = it => [
  it.isNew ? '<span class="bd new">NEW 圖鑑登錄</span>' : '',
  it.shiny ? '<span class="bd shiny">✨ 閃光</span>' : '',
  `<span class="bd ${it.tier}">${TIER_NAME[it.tier]}</span>`,
].join('');
let cardT = 0;
function showCard(it) {
  const el = $('prize');
  el.className = '';
  el.innerHTML = `<div class="top">GET!</div><img src="${C.img(it.id, it.shiny)}" alt=""><div class="no">${numTxt(it.id)}</div>
    <div class="nm">${it.shiny ? '✨' : ''}${P[it.id].zh}</div><div class="badges">${badges(it)}</div>`;
  void el.offsetWidth;
  el.className = 'show' + (it.shiny ? ' shiny' : it.tier === 'legend' ? ' legend' : '');
  clearTimeout(cardT);
  cardT = setTimeout(hideCard, it.isNew || it.tier !== 'common' ? 2600 : 2000);
}
function hideCard() {
  const el = $('prize');
  if (!el.classList.contains('show')) return;
  clearTimeout(cardT);
  el.classList.remove('show'); el.classList.add('hide');
}
$('prize').addEventListener('click', hideCard);

const evoQ = [];
let evoBusy = false;
function nextEvo() {
  if (evoBusy || !evoQ.length) return;
  evoBusy = true;
  const e = evoQ.shift(), el = $('evo');
  el.innerHTML = `<span class="tg">進化！</span><img src="${C.img(e.from)}" alt="">×3<span class="ar">➜</span><img src="${C.img(e.to)}" alt="">${P[e.to].zh}${e.isNew ? ' <span class="bd new">NEW</span>' : ''}`;
  el.classList.add('show'); sfx.evo();
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => { evoBusy = false; nextEvo(); }, 400); }, 2600);
}

let spotDone = null;
async function spotlight(it) {
  pauses.add('spot');
  const sp = $('spot'), tier = it.tier;
  const hint = tier === 'legend' ? ['🌟 傳說玩偶！！！', '#c9b6ff', 'rgba(155,123,255,.2)']
    : it.shiny ? ['✨ 閃光玩偶！！', '#ffe066', 'rgba(255,224,102,.18)'] : ['★ 超稀有玩偶！', '#ffc93c', 'rgba(255,201,60,.14)'];
  sp.className = 'show';
  sp.style.setProperty('--hint', hint[1]); sp.style.setProperty('--ray', hint[2]);
  const col = TYPE_COL[P[it.id].types[0]] || '#ffd6ea';
  $('spPlush').style.setProperty('--pc', col); $('spPlush').style.setProperty('--pc2', darker(col, 0.8));
  $('spHint').textContent = hint[0];
  $('spImg').src = C.img(it.id, it.shiny);
  $('spNo').textContent = ''; $('spName').textContent = '？？？'; $('spBadges').innerHTML = '';
  if (tier === 'legend') { party(5); confetti(160); }
  sfx.drumroll(1.3);
  await tapOr(1300, false);
  flash(it.shiny);
  sfx.flash();
  sp.classList.add('revealed');
  $('spHint').textContent = tier === 'legend' ? '傳說寶可夢' : it.shiny ? '閃光寶可夢' : '超稀有寶可夢';
  $('spNo').textContent = numTxt(it.id);
  $('spName').textContent = P[it.id].zh;
  $('spBadges').innerHTML = badges(it);
  if (tier === 'legend' || it.shiny) { sfx.fanfareBig(); confetti(tier === 'legend' ? 220 : 120); } else sfx.fanfareRare();
  await tapOr(3000, true);
  sp.className = '';
  pauses.delete('spot');
}
function tapOr(ms, allowTap) {
  return new Promise(r => {
    const sp = $('spot');
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(t); sp.removeEventListener('click', onTap); r(); };
    const onTap = () => { if (allowTap) fin(); };
    const t = setTimeout(fin, ms / speedMul);
    sp.addEventListener('click', onTap);
  });
}
function flash(rainbow) { const f = $('flash'); f.classList.remove('go'); f.classList.toggle('rainbow', !!rainbow); void f.offsetWidth; f.classList.add('go'); }
let partyT = 0;
function party(sec) { const m = $('marquee'); m.classList.add('party'); clearTimeout(partyT); partyT = setTimeout(() => m.classList.remove('party'), sec * 1000); }
function shakeGlass() { glassEl.classList.remove('shake'); void glassEl.offsetWidth; glassEl.classList.add('shake'); }

/* 紙花 */
const fx = $('fx'), fxc = fx.getContext('2d');
let conf = [], confRun = false;
function confetti(n) {
  fx.width = innerWidth; fx.height = innerHeight;
  const cols = ['#ff5fa2', '#7fe6c9', '#ffe066', '#9b7bff', '#60a5fa', '#ffffff'];
  for (let i = 0; i < n; i++) conf.push({ x: rand(0, fx.width), y: rand(-fx.height * 0.6, -10), vx: rand(-60, 60), vy: rand(120, 300), r: rand(0, 6.28), vr: rand(-8, 8), w: rand(6, 11), h: rand(3, 6), c: pickOne(cols) });
  if (!confRun) { confRun = true; let last = performance.now(); requestAnimationFrame(function f(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    fxc.clearRect(0, 0, fx.width, fx.height);
    for (const p of conf) {
      p.vy += 160 * dt; p.vx += Math.sin(now / 300 + p.r) * 20 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
      fxc.save(); fxc.translate(p.x, p.y); fxc.rotate(p.r); fxc.fillStyle = p.c; fxc.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.3))); fxc.restore();
    }
    conf = conf.filter(p => p.y < fx.height + 20);
    if (conf.length) requestAnimationFrame(f); else { confRun = false; fxc.clearRect(0, 0, fx.width, fx.height); }
  }); }
}

/* ============ 介面 ============ */
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400); }
function setK(k, v) { document.querySelectorAll(`[data-k="${k}"]`).forEach(e => { e.textContent = v; }); }
function setBar(k, r) { document.querySelectorAll(`[data-bar="${k}"]`).forEach(e => { e.style.width = (clamp(r, 0, 1) * 100).toFixed(1) + '%'; }); }
const legendCount = () => LEGENDS.filter(p => C.has(p.id)).length;
function refreshUI() {
  const dc = C.count(), sc = C.shinyCount(), lc = legendCount();
  setK('dex', dc); setK('shiny', sc); setK('legend', lc); setK('legendTotal', `/ ${LEGENDS.length}`); setK('session', sessionCaught);
  setBar('dex', dc / TOTAL); setBar('shiny', sc / TOTAL); setBar('legend', lc / LEGENDS.length);
  const left = LEGEND_EVERY - (refills % LEGEND_EVERY);
  setK('lgLeft', left); setBar('lg', 1 - left / LEGEND_EVERY);
}
function refreshLamps() {
  const el = $('lamps');
  [...el.children].forEach((l, i) => l.classList.toggle('on', i < misses));
  el.classList.toggle('max', misses >= PITY);
}
function renderRecent() {
  const rec = C.recent();
  $('recentGrid').innerHTML = rec.slice(0, 24).map(r => `<div class="${r.s ? 's' : ''}" title="${numTxt(r.id)} ${P[r.id].zh}"><img src="${C.img(r.id, r.s)}" alt=""></div>`).join('');
  const strip = $('strip');
  strip.innerHTML = '<span class="lb">最近</span>' + rec.slice(0, 8).map(r => `<img class="${r.s ? 's' : ''}" src="${C.img(r.id, r.s)}" alt="">`).join('');
}
function syncDropBtn() { $('bDrop').classList.toggle('busy', !clawFree()); }
function syncSwitches() {
  $('swAuto').classList.toggle('on', cfg.auto); $('swMusic').classList.toggle('on', cfg.music); $('swSfx').classList.toggle('on', cfg.sfx);
  $('autoBtn').classList.toggle('on', cfg.auto);
  $('tbMusic').classList.toggle('off', !cfg.music); $('tbSfx').classList.toggle('off', !cfg.sfx);
}
function toggleAuto() { cfg.auto = !cfg.auto; saveCfg(); syncSwitches(); toast(cfg.auto ? '🤖 自動夾：開，放著看就好' : '🤖 自動夾：關，自己來！'); if (cfg.auto) lastUser = -99; }
function toggleMusic() { cfg.music = !cfg.music; saveCfg(); AU.setMusic(cfg.music); syncSwitches(); }
function toggleSfx() { cfg.sfx = !cfg.sfx; saveCfg(); AU.setSfx(cfg.sfx); syncSwitches(); }
const goLobby = () => { location.href = '../'; };

/* ============ 輸入 ============ */
function userAct() { lastUser = gameT; }
function setHold(dir) {
  userAct();
  if (dir && claw.state === 'move') { claw.state = 'idle'; claw.dropAfter = false; }
  holdDir = dir;
  $('bL').classList.toggle('on', dir < 0); $('bR').classList.toggle('on', dir > 0);
}
function pressDrop() {
  userAct();
  if (!clawFree() || paused()) return;
  holdDir = 0; startDrop();
}
function bindHold(el, dir) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); sfx.click(); try { el.setPointerCapture(e.pointerId); } catch (_) {} setHold(dir); });
  const up = () => { if (holdDir === dir) setHold(0); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => el.addEventListener(ev, up));
}
bindHold($('bL'), -1); bindHold($('bR'), 1);
$('bDrop').addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); pressDrop(); });
$('autoBtn').addEventListener('click', toggleAuto);
$('swAuto').addEventListener('click', toggleAuto);
$('swMusic').addEventListener('click', toggleMusic); $('tbMusic').addEventListener('click', toggleMusic);
$('swSfx').addEventListener('click', toggleSfx); $('tbSfx').addEventListener('click', toggleSfx);
$('tbLobby').addEventListener('click', goLobby); $('sdLobby').addEventListener('click', goLobby);
$('tbDex').addEventListener('click', openDex); $('sdDex').addEventListener('click', openDex);
document.addEventListener('pointerdown', () => AU.init(), true);
const KEYS = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
window.addEventListener('keydown', e => {
  AU.init();
  if ($('mDex').classList.contains('show')) return;
  if (KEYS[e.key] && !e.repeat) setHold(KEYS[e.key]);
  if ((e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); pressDrop(); }
});
window.addEventListener('keyup', e => { if (KEYS[e.key] && holdDir === KEYS[e.key]) setHold(0); });

// 畫布：點玩偶→爪子移過去；再點一次→下爪；拖曳→爪子跟著手指；滑鼠停在玩偶上或長按→顯示資料
let tipPlush = null, down = null, lpT = 0;
const toLocal = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
function plushAt(x, y) {
  const list = plushes.filter(p => p.state === 'pile').sort((a, b) => a.y - b.y);
  return list.find(p => Math.hypot(p.x - x, (p.y - y) * 1.08) < p.r) || null;
}
function showTip(p) {
  tipPlush = p;
  const el = $('tip');
  if (!p) { el.classList.remove('show'); return; }
  const t = P[p.id].tier, cols = { common: '#6b7280', rare: '#2563eb', srare: '#b7791f', legend: '#6d4cff' };
  el.innerHTML = `<b>${numTxt(p.id)}</b>${p.shiny ? '✨' : ''}${P[p.id].zh}<span class="t" style="background:#fff;color:${cols[t]}">${TIER_NAME[t]}</span>${C.has(p.id) ? '' : '<span class="t" style="background:#ff5fa2">未登錄</span>'}`;
  const cr = cv.getBoundingClientRect(), gr = glassEl.getBoundingClientRect();
  const sx = cr.left - gr.left + p.x / W * cr.width, sy = cr.top - gr.top + (p.y - p.r - 6) / H * cr.height;
  el.style.left = clamp(sx, 90, gr.width - 90) + 'px'; el.style.top = Math.max(40, sy) + 'px';
  el.classList.add('show');
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); AU.init(); userAct();
  const q = toLocal(e), p = plushAt(q.x, q.y);
  down = { x: q.x, y: q.y, p, drag: false, lp: false, id: e.pointerId, mouse: e.pointerType === 'mouse' };
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  clearTimeout(lpT);
  if (p && !down.mouse) lpT = setTimeout(() => { if (down && !down.drag) { down.lp = true; showTip(p); } }, 420);
});
cv.addEventListener('pointermove', e => {
  const q = toLocal(e);
  if (!down) { if (e.pointerType === 'mouse') { const p = plushAt(q.x, q.y); if (p !== tipPlush) showTip(p); else if (p) showTip(p); } return; }
  if (!down.drag && Math.abs(q.x - down.x) > 10) { down.drag = true; clearTimeout(lpT); if (!down.mouse) showTip(null); }
  if (down.drag && clawFree()) { userAct(); claw.state = 'move'; claw.dropAfter = false; claw.tx = clamp(q.x, MIN_X, MAX_X); }
});
function endPointer(e) {
  if (!down) return;
  clearTimeout(lpT);
  const d = down; down = null;
  if (d.lp) { setTimeout(() => showTip(null), 900); return; }
  if (d.drag || e.type === 'pointercancel') return;
  userAct();
  if (!clawFree()) return;
  const x = d.p ? d.p.x : d.x;
  if (Math.abs(claw.x - x) < 10 && claw.state === 'idle') pressDrop();
  else moveTo(x, false);
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !down) showTip(null); });
cv.addEventListener('contextmenu', e => e.preventDefault());

/* ============ 圖鑑（依世代分頁籤） ============ */
let dexGen = 0, dexPage = 0;
const shinyView = new Set();
function openDex() {
  pauses.add('dex'); hideCard(); showTip(null); setHold(0);
  $('mDex').classList.add('show');
  $('dxSum').innerHTML = `<span>已登錄 <em>${C.count()}</em>/${TOTAL}</span><span>閃光 <em>${C.shinyCount()}</em></span><span>傳說 <em>${legendCount()}</em>/${LEGENDS.length}</span>`;
  renderTabs();
  requestAnimationFrame(renderDex);
}
function closeDex() { $('mDex').classList.remove('show'); pauses.delete('dex'); }
function renderTabs() {
  $('dxTabs').innerHTML = GENS.map(([r, n, a, b], i) => {
    let got = 0; for (let id = a; id <= b; id++) if (C.has(id)) got++;
    return `<button data-g="${i}" class="${i === dexGen ? 'on' : ''}">${r} ${n}<small>${got}/${b - a + 1}</small></button>`;
  }).join('');
}
function renderDex() {
  const gridEl = $('dxGrid'), box = gridEl.parentElement;
  const w = box.clientWidth - 20, h = box.clientHeight - 8;
  const cols = Math.max(3, Math.floor((w + 6) / 86)), rows = Math.max(2, Math.floor((h + 6) / 102));
  const per = cols * rows;
  const [, , a, b] = GENS[dexGen];
  const list = POKEDEX.filter(p => p.id >= a && p.id <= b);
  const pages = Math.max(1, Math.ceil(list.length / per));
  dexPage = clamp(dexPage, 0, pages - 1);
  gridEl.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`;
  gridEl.style.gridTemplateRows = `repeat(${rows},minmax(0,1fr))`;
  gridEl.innerHTML = list.slice(dexPage * per, dexPage * per + per).map(p => {
    const e = C.store.dex[p.id] || {}, sh = shinyView.has(p.id) && e.gotS;
    return `<div class="dcell ${e.got ? '' : 'miss'} ${sh ? 'sh' : ''} ${e.gotS ? 'has-s' : ''} ${p.tier === 'legend' ? 'lg' : ''}" data-id="${p.id}"><span class="n">${numTxt(p.id)}</span>
      ${e.got ? `<span class="c">×${(e.n || 0) + (e.s || 0)}</span>` : ''}${e.gotS ? '<span class="st">✨</span>' : ''}
      <img src="${C.img(p.id, sh)}" alt="" loading="lazy"><div class="nm">${e.got ? p.zh : '？？？'}</div></div>`;
  }).join('');
  $('dxPage').textContent = `${dexPage + 1}/${pages}`;
  $('dxPrev').disabled = dexPage === 0; $('dxNext').disabled = dexPage >= pages - 1;
}
$('dxTabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-g]'); if (!b) return;
  dexGen = +b.dataset.g; dexPage = 0;
  $('dxTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderDex();
});
$('dxGrid').addEventListener('click', e => {
  const c = e.target.closest('.dcell'); if (!c) return;
  const id = +c.dataset.id, en = C.store.dex[id];
  if (!(en && en.gotS)) return;
  shinyView.has(id) ? shinyView.delete(id) : shinyView.add(id);
  renderDex();
});
$('dxPrev').addEventListener('click', () => { dexPage--; renderDex(); });
$('dxNext').addEventListener('click', () => { dexPage++; renderDex(); });
$('dxClose').addEventListener('click', closeDex);
$('mDex').addEventListener('click', e => { if (e.target.id === 'mDex') closeDex(); });
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

/* ============ 跑馬燈燈泡 ============ */
function buildBulbs() {
  const m = $('marquee');
  m.querySelectorAll('.bulb').forEach(b => b.remove());
  const w = m.clientWidth - 8, h = m.clientHeight - 8, per = 2 * (w + h), n = Math.max(16, Math.round(per / 26));
  for (let i = 0; i < n; i++) {
    let d = (i + 0.5) / n * per, x, y;
    if (d < w) { x = d; y = 0; } else if ((d -= w) < h) { x = w; y = d; } else if ((d -= h) < w) { x = w - d; y = h; } else { d -= w; x = 0; y = h - d; }
    const b = document.createElement('i'); b.className = 'bulb';
    b.style.left = (x - 2) + 'px'; b.style.top = (y - 2) + 'px'; b.style.animationDelay = `${(i % 3) * 0.4}s`;
    m.appendChild(b);
  }
}

/* ============ 開始 ============ */
let lastNow = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000); lastNow = now;
  update(dt * speedMul);
  render(gameT);
  requestAnimationFrame(loop);
}
function onResize() { fit(); buildBulbs(); }
window.addEventListener('resize', onResize);
if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(glassEl);
document.addEventListener('visibilitychange', () => { if (document.hidden) { AU.suspend(); setHold(0); } else AU.resume(); });

fit();
fillPile();
if (document.fonts) document.fonts.ready.then(() => plushes.forEach(p => { p.tw = 0; }));
buildBulbs();
syncSwitches(); refreshUI(); refreshLamps(); renderRecent(); syncDropBtn();
setInterval(syncDropBtn, 200);
toast(cfg.auto ? '🤖 自動夾開著～按 ◀ ▶ 或點玩偶就換你來' : '按住 ◀ ▶ 移動、按「下爪」，或直接點玩偶');
requestAnimationFrame(loop);

// 測試用：__claw.legend(true) 立刻補一隻傳說玩偶（true＝下一次自動夾必定夾它且保底）
window.__claw = {
  legend(force) {
    const p = makePlush('legend'); plushes.push(p); legendArrives(p);
    if (force) { forceTarget = p; misses = PITY; refreshLamps(); }
    return P[p.id].zh;
  },
  speed(n) { speedMul = n; },
  state: () => ({ state: claw.state, misses, refills, caught: sessionCaught, dex: C.count(), plushes: plushes.length, pile: plushes.filter(p => p.state === 'pile').length }),
};
