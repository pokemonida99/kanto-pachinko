'use strict';
/* 神奧推幣機：投珠 → 推板把珠與玩偶推下前緣 → 玩偶掉下去就抓到那隻寶可夢 */
const $ = id => document.getElementById(id);
const C = Collect.create({ key: 'sinnohPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
const P = C.P, pad3 = Collect.pad3;
const TOTAL = POKEDEX.length;
const LEGENDS = POKEDEX.filter(p => p.tier === 'legend').map(p => p.id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const CFG_KEY = 'sinnohPachinko.cfg';
const cfg = { music: true, sfx: true, auto: true, leg: 0 };
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); } catch (e) {}
if (/[?&]reset\b/.test(location.search)) cfg.leg = 0;
const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} };

/* ============ 規則參數 ============ */
const SHINY_RATE = 0.01;
const MAX_COINS = 60;
const DOLL_MIN = 6, DOLL_MAX = 10, DOLL_EVERY = 4;
const GEM_EVERY = 40, GEM_SEC = 10;
const EN_COIN = 0.8;                       // 一顆珠掉進側溝加多少時空能量
const AUTO_EVERY = 0.42, HOLD_EVERY = 0.25;
const LEG_MAIN = [483, 484, 487];        // 帝牙盧卡、帕路奇亞、騎拉帝納輪流
const LEG_EXTRA = [480, 481, 482, 490];  // 之後每第 4 次換成湖之三神／瑪納霏
const ORBS = [
  { name: '金剛寶珠', c0: '#e8f6ff', c1: '#7fb8ff', c2: '#2f4fb0' },
  { name: '白玉寶珠', c0: '#fff2fa', c1: '#ffb3dc', c2: '#b0508a' },
  { name: '白金寶珠', c0: '#fff6dc', c1: '#ffcf6a', c2: '#a8752a' },
];

/* ============ 世界與鏡頭（2.5D 透視） ============ */
const W = 540, H = 860;
const HALFW = 170, L = 300, GUT = 24;    // 平台半寬、深度（0＝後牆、L＝前緣）、側溝寬
const GZ = 125;                          // 側溝只開在 z>GZ 的前半段，後半段是牆
const PZ0 = 30, PAMP = 90, PH = 44;       // 推板前緣 z 在 30～120 來回、推板高
const F = 1141, HC = 1046, DC = 808, HZ = -827, CX = W / 2;
const G = 1500;
const proj = (x, y, z) => { const k = F / (DC + L - z); return [CX + x * k, HZ + (HC - y) * k, k]; };
const squash = z => { const d = DC + L - z; return HC / Math.sqrt(HC * HC + d * d); };

/* ============ 音樂與音效（WebAudio 即時合成，原創曲） ============ */
const AU = (() => {
  let ac = null, master, bgm, sfx, noiseBuf, nextT = 0, step = 0;
  const BGM_VOL = 0.55, last = {};
  let E = 60 / 92 / 2;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden && !paused) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.85; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = cfg.music ? BGM_VOL : 0; bgm.connect(master);
    sfx = ac.createGain(); sfx.gain.value = cfg.sfx ? 1 : 0; sfx.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextT = ac.currentTime + 0.1;
    setInterval(schedule, 30);
  }
  function osc(dest, type, f, t, dur, vol, slideTo, att = 0.008) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000, q = 1) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // 背景音樂：Dm9–B♭–Gm–A ／ Dm–F–C–A，8 小節循環，琶音＋鐘聲旋律
  const ARP = [[62, 65, 69, 72, 76], [58, 62, 65, 69, 74], [62, 65, 67, 70, 74], [61, 64, 67, 69, 73],
               [62, 65, 69, 74, 77], [60, 65, 69, 72, 77], [60, 64, 67, 72, 76], [61, 64, 69, 73, 76]];
  const AP = [0, 2, 1, 3, 2, 4, 3, 1];
  const ROOT = [38, 46, 43, 45, 38, 41, 48, 45];
  const MEL = [
    [81, 0, 0, 79, 0, 77, 0, 0], [77, 0, 0, 74, 0, 0, 72, 0], [74, 0, 0, 77, 0, 79, 0, 0], [76, 0, 0, 0, 73, 0, 0, 0],
    [81, 0, 84, 0, 81, 0, 79, 0], [77, 0, 0, 81, 0, 0, 79, 77], [76, 0, 0, 79, 0, 76, 0, 72], [73, 0, 0, 0, 76, 0, 0, 0],
  ];
  let fast = false;
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7, ch = ARP[bar], r = ROOT[bar];
    const n = ch[AP[i]];
    osc(bgm, 'triangle', hz(n), t, E * 1.6, 0.03);
    osc(bgm, 'sine', hz(n + 12), t + E * 0.5, E * 1.2, 0.008);          // 輕輕的回音
    const m = MEL[bar][i];
    if (m) { osc(bgm, 'sine', hz(m), t, 1.3, 0.035, 0, 0.004); osc(bgm, 'sine', hz(m) * 2.76, t, 0.35, 0.006, 0, 0.002); }
    if (i === 0) { osc(bgm, 'sine', hz(r), t, E * 3.5, 0.13); ch.slice(0, 3).forEach(c => osc(bgm, 'sine', hz(c - 12), t, E * 7.5, 0.016, 0, 0.3)); }
    if (i === 4) osc(bgm, 'sine', hz(r + 7), t, E * 2.5, 0.08);
    if (i % 2 === 1) noise(bgm, t, 0.05, fast ? 0.05 : 0.025, 'highpass', 8000);
    if (fast && (i === 0 || i === 4)) osc(bgm, 'sine', 140, t, 0.14, 0.18, 50);
  }
  function duck(sec) {
    if (!ac || !cfg.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.18, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  const ok = (k, ms) => { const n = performance.now(); if (n - (last[k] || 0) < ms) return false; last[k] = n; return true; };
  function notes(list, type = 'square', vol = 0.04, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m), t, d * 1.1, vol); osc(sfx, 'sine', hz(m + 12), t, d * 1.6, vol * 0.5); } t += d; }
    return t - ac.currentTime;
  }
  const play = {
    drop() { if (!ac || !ok('drop', 60)) return; const t = ac.currentTime; osc(sfx, 'sine', 2093, t, 0.09, 0.03); osc(sfx, 'sine', 3136, t + 0.04, 0.12, 0.02); },
    land(big) {
      if (!ac || !ok('land', 45)) return; const t = ac.currentTime;
      noise(sfx, t, 0.05, big ? 0.12 : 0.05, 'bandpass', big ? 900 : 3200, 2); osc(sfx, 'triangle', big ? 300 : 1400, t, 0.06, big ? 0.06 : 0.02, big ? 140 : 900);
    },
    coin() { if (!ac || !ok('coin', 55)) return; const t = ac.currentTime, b = 2637 * (1 + Math.random() * 0.06); osc(sfx, 'sine', b, t, 0.18, 0.035); osc(sfx, 'sine', b * 1.5, t + 0.05, 0.22, 0.025); },
    gutter() { if (!ac || !ok('gut', 70)) return; const t = ac.currentTime; osc(sfx, 'sine', 420, t, 0.25, 0.05, 160); osc(sfx, 'sine', hz(88 + Math.floor(Math.random() * 4) * 2), t + 0.03, 0.4, 0.012); },
    edge() { if (ac && ok('edge', 600)) osc(sfx, 'triangle', hz(83), ac.currentTime, 0.1, 0.02); },
    catch(rank) {
      duck(1.2);
      const base = [[76, 0.07], [79, 0.07], [84, 0.16]];
      if (rank >= 1) base.push([88, 0.24]);
      if (rank >= 2) base.push([0, 0.04], [86, 0.08], [88, 0.08], [91, 0.4]);
      notes(base, 'square', 0.03);
    },
    sparkle() { if (!ac) return; [84, 88, 91, 96, 100, 103, 108].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + i * 0.045, 0.3, 0.03)); },
    evo() { if (!ac) return; duck(2); osc(sfx, 'triangle', 300, ac.currentTime, 1.0, 0.04, 1500); notes([[72, 0.1], [76, 0.1], [79, 0.1], [84, 0.1], [88, 0.5]], 'square', 0.03, 0.9); },
    gem() { if (!ac) return; duck(1.6); this.sparkle(); notes([[79, 0.08], [83, 0.08], [86, 0.08], [91, 0.5]], 'triangle', 0.05, 0.25); },
    legendAppear() {
      if (!ac) return; duck(4); const t = ac.currentTime;
      noise(sfx, t, 2.6, 0.35, 'lowpass', 220); osc(sfx, 'sawtooth', 55, t, 2.4, 0.06, 38);
      osc(sfx, 'sine', 1800, t, 2.2, 0.04, 120, 1.2); osc(sfx, 'sine', 120, t + 0.4, 2.0, 0.05, 1500, 1.4);
      [62, 65, 69, 74].forEach((m, i) => osc(sfx, 'triangle', hz(m), t + 1.6 + i * 0.12, 1.4, 0.035));
    },
    legendCatch() {
      if (!ac) return; duck(5); const t = ac.currentTime;
      osc(sfx, 'sine', 60, t, 1.2, 0.2, 30); noise(sfx, t, 1, 0.25, 'lowpass', 400);
      const d = notes([[62, 0.16], [69, 0.16], [74, 0.16], [77, 0.32], [76, 0.16], [74, 0.16], [81, 0.5], [0, 0.06], [79, 0.14], [81, 0.14], [84, 0.14], [86, 0.9]], 'square', 0.04, 0.5);
      [74, 78, 81, 86].forEach(m => osc(sfx, 'triangle', hz(m), t + d - 0.9, 1.6, 0.03));
    },
    tap() { if (ac) osc(sfx, 'sine', 900, ac.currentTime, 0.06, 0.03, 1300); },
  };
  return {
    init, play,
    setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } },
    setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); },
    setFast(on) { fast = on; E = 60 / (on ? 120 : 92) / 2; },
    suspend: () => ac && ac.suspend(), resume: () => ac && !paused && ac.resume(),
  };
})();
const sfx = AU.play;

/* ============ 圖片 ============ */
const IMG = {};
function pimg(id, s) {
  const k = (s ? 's' : 'n') + id;
  let im = IMG[k];
  if (!im) { im = IMG[k] = new Image(); im.decoding = 'async'; im.src = C.img(id, s); }
  return im;
}
function mkSprite(size, paint) { const c = document.createElement('canvas'); c.width = c.height = size; paint(c.getContext('2d'), size); return c; }
function discSprite(c0, c1, c2, mark) {
  return mkSprite(128, (g, s) => {
    const r = s / 2;
    const gr = g.createRadialGradient(r * 0.7, r * 0.55, r * 0.05, r, r, r);
    gr.addColorStop(0, c0); gr.addColorStop(0.55, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.beginPath(); g.arc(r, r, r - 1, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = s * 0.035; g.beginPath(); g.arc(r, r, r * 0.8, 0, 7); g.stroke();
    if (mark) {
      g.strokeStyle = 'rgba(80,60,150,.35)'; g.lineWidth = s * 0.04; g.beginPath();
      g.moveTo(r, r * 0.45); g.lineTo(r * 1.4, r); g.lineTo(r, r * 1.55); g.lineTo(r * 0.6, r); g.closePath(); g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(r * 0.72, r * 0.6, r * 0.28, r * 0.14, -0.5, 0, 7); g.fill();
  });
}
const SPR = {
  coin: discSprite('#ffffff', '#efe6fb', '#a99fd6', true),
  common: discSprite('#ffffff', '#ece4f8', '#9a90cc'),
  rare: discSprite('#f2fbff', '#9fdcff', '#3d6fc0'),
  srare: discSprite('#fffaf0', '#ffd27a', '#b07a20'),
  legend: discSprite('#ffffff', '#c9b4ff', '#4a2a9a'),
  gem: discSprite('#ffffff', '#c7c0ec', '#3a3180'),
};
const RIM = { coin: '#8a80bf', common: '#7f76b5', rare: '#2f5aa3', srare: '#94621a', legend: '#3a1f80', gem: '#2c2566' };

/* ============ 狀態 ============ */
let objs = [];
let pz = PZ0, vp = 0, phase = 0, gt = 0;
let energy = 0, coinsBack = 0, drops = 0, gemT = 0;
let autoT = 0.6, holdT = 0, spawnT = DOLL_EVERY, holding = false, holdX = 0;
let paused = false, speed = 1, ts = 1, slowT = 0, shakeT = 0;
let legendOn = null;
let gutFlash = [0, 0], edgeFlash = 0;
const parts = [];
const stats = { coinDrops: 0, coinsOut: 0, gutter: 0, dolls: 0, catches: 0, legends: 0, gems: 0, nan: 0, stuck: 0, maxSpeed: 0, evo: 0 };

function mk(k, x, z, y, extra) {
  const o = Object.assign({ k, x, z, y, vx: 0, vz: 0, vy: 0, st: y > 0 ? 'air' : 'tab', r: 14, m: 1, t: 0, seed: Math.random() * 6.28 }, extra);
  objs.push(o); return o;
}
const coinCount = () => { let n = 0; for (const o of objs) if (o.k === 'coin' && o.st !== 'fall') n++; return n; };
const dollCount = () => { let n = 0; for (const o of objs) if (o.k === 'doll' && o.st !== 'fall') n++; return n; };

function dropCoin(wx) {
  if (coinCount() >= MAX_COINS) return false;
  drops++; stats.coinDrops++;
  const x = clamp(wx, -HALFW + 16, HALFW - 16), z = rand(48, 140);
  if (drops % GEM_EVERY === 0) {
    const orb = ORBS[(drops / GEM_EVERY - 1) % ORBS.length];
    mk('gem', clamp(x, -HALFW + 24, HALFW - 24), z, 330, { r: 22, m: 2, orb });
  } else mk('coin', x, z, 330, { r: 14, m: 1, vy: -rand(0, 80) });
  const s = $('slot'); s.classList.remove('blink'); void s.offsetWidth; s.classList.add('blink');
  sfx.drop();
  return true;
}
function spawnDoll(onTable) {
  const id = C.pick({ boost: 0 }), shiny = Math.random() < SHINY_RATE;
  pimg(id, shiny);
  const o = mk('doll', rand(-HALFW + 34, HALFW - 34), onTable ? rand(150, 270) : rand(60, 140), onTable ? 0 : 360, { r: 26, m: 2.5, id, shiny, tier: P[id].tier });
  return o;
}
function nextLegendId() {
  const i = cfg.leg++;
  saveCfg();
  if (i >= 3 && i % 4 === 3) return LEG_EXTRA[(i >> 2) % LEG_EXTRA.length];
  return LEG_MAIN[i % 3];
}
function spawnLegend() {
  const id = nextLegendId(), shiny = Math.random() < SHINY_RATE;
  pimg(id, shiny);
  legendOn = mk('leg', 0, 190, 420, { r: 50, m: 10, id, shiny, tier: 'legend', vy: -60, born: gt });
  banner(`時空能量 MAX！${P[id].zh} 出現了！`, '', 3000);
  warp(2600);
  sfx.legendAppear();
}

function fillStart() {
  let tries = 0;
  const place = (k, r, n, extra) => {
    for (let i = 0; i < n && tries < 4000; tries++) {
      const x = rand(-HALFW + r, HALFW - r), z = rand(PZ0 + PAMP + r, L - 18);
      if (objs.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2)) continue;
      const o = extra ? extra() : mk(k, x, z, 0, { r, m: 1 });
      if (extra) { o.x = clamp(x, -HALFW + o.r, HALFW - o.r); o.z = z; }
      i++;
    }
  };
  place('doll', 26, 8, () => spawnDoll(true));
  place('coin', 14, 42);
}

/* ============ 物理 ============ */
const DT = 1 / 60;
function step() {
  const dt = DT * ts;
  gt += dt;
  // 推板：週期 3 秒，寶石時間 ×2
  const pm = gemT > 0 ? 2 : 1;
  phase += dt * pm / 3;
  const old = pz;
  pz = PZ0 + PAMP * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
  vp = (pz - old) / dt;

  // 計時器
  if (gemT > 0) { gemT -= dt; if (gemT <= 0) { gemT = 0; AU.setFast(false); } }
  if (cfg.auto) { autoT -= dt; if (autoT <= 0) { autoT = AUTO_EVERY; dropCoin(Math.sin(gt * 0.55) * 120 + Math.sin(gt * 1.7) * 30 + rand(-25, 25)); } }
  if (holding) { holdT -= dt; if (holdT <= 0) { holdT = HOLD_EVERY; dropCoin(holdX); } }
  spawnT -= dt * (gemT > 0 ? 3 : 1);
  if (spawnT <= 0) {
    const n = dollCount();
    if (n < DOLL_MAX) spawnDoll(false);
    spawnT = n + 1 < DOLL_MIN ? 1 : DOLL_EVERY;
  }
  if (energy >= 100 && !legendOn) { energy = 0; spawnLegend(); }

  const fr = Math.pow(0.9, ts);
  const tab = [];
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i];
    o.t += dt;
    if (o.st === 'air') {
      o.vy -= G * (o.k === 'coin' ? 1 : o.k === 'leg' ? 0.35 : 0.6) * dt;
      o.y += o.vy * dt;
      if (o.y < PH + 4 && o.z - o.r < pz) o.z = pz + o.r;
      if (o.y <= 0) {
        o.y = 0; o.vy = 0; o.st = 'tab';
        if (o.k === 'leg') { shakeT = 0.5; sfx.land(true); burst3(o.x, 0, o.z, 30, '#d8cbff', 260); }
        else sfx.land(o.k !== 'coin');
      }
    } else if (o.st === 'tab') {
      o.x += o.vx * dt; o.z += o.vz * dt;
      o.vx *= fr; o.vz *= fr;
      tab.push(o);
    } else {
      o.vy -= G * dt; o.y += o.vy * dt; o.x += o.vx * dt; o.z += o.vz * dt;
      if (o.y < (o.gut ? -80 : -150)) { objs.splice(i, 1); if (!o.gut) collect(o); }
    }
  }
  solve(tab);
  for (const o of tab) {
    const sp = Math.hypot(o.vx, o.vz);
    if (sp > 900) { o.vx *= 900 / sp; o.vz *= 900 / sp; }
    if (sp > stats.maxSpeed) stats.maxSpeed = sp;
    if (!isFinite(o.x) || !isFinite(o.z) || !isFinite(o.vx) || !isFinite(o.vz)) { stats.nan++; o.x = rand(-100, 100); o.z = 200; o.vx = o.vz = 0; }
    if (o.z > L) startFall(o, false);
    else if (o.k === 'coin' && Math.abs(o.x) > HALFW) startFall(o, true);
    else if (o.k !== 'coin' && o.z > L - o.r * 0.55) { o.edge = true; if (o.k !== 'gem') sfx.edge(); } else o.edge = false;
  }
  if (legendOn && legendOn.st === 'tab' && gt - legendOn.born > 30) legendOn.vz += 8 * dt;   // 放太久就慢慢往前滑
  // 粒子
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.vx *= 0.98; p.vy *= 0.98;
  }
  gutFlash[0] = Math.max(0, gutFlash[0] - dt * 3); gutFlash[1] = Math.max(0, gutFlash[1] - dt * 3);
  edgeFlash = Math.max(0, edgeFlash - dt * 2);
}

function constrain(o) {
  if (o.z - o.r < pz) { o.z = pz + o.r; if (o.vz < vp) o.vz = vp; }
  if (o.k !== 'coin' || o.z < GZ) {
    const lim = HALFW - o.r;
    if (o.x > lim) { o.x = lim; if (o.vx > 0) o.vx *= -0.3; }
    else if (o.x < -lim) { o.x = -lim; if (o.vx < 0) o.vx *= -0.3; }
  }
}
function solve(A) {
  const n = A.length;
  for (const o of A) { constrain(o); o.pin = vp > 0 && o.z - o.r <= pz + 0.5; }
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < n; i++) {
      const a = A[i];
      for (let j = i + 1; j < n; j++) {
        const b = A[j], R = a.r + b.r;
        const dx = b.x - a.x; if (dx > R || dx < -R) continue;
        const dz = b.z - a.z; if (dz > R || dz < -R) continue;
        let d2 = dx * dx + dz * dz; if (d2 >= R * R) continue;
        let d = Math.sqrt(d2), nx, nz;
        if (d < 1e-4) { nx = Math.random() - 0.5; nz = 0.5; d = 0; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
        else { nx = dx / d; nz = dz / d; }
        const ia = a.pin ? 0 : 1 / a.m, ib = b.pin ? 0 : 1 / b.m, s = ia + ib;
        if (!s) continue;
        const pen = R - d;
        a.x -= nx * pen * ia / s; a.z -= nz * pen * ia / s;
        b.x += nx * pen * ib / s; b.z += nz * pen * ib / s;
        if (it === 0) {
          const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (vn < 0) { const jn = -1.15 * vn / s; a.vx -= jn * ia * nx; a.vz -= jn * ia * nz; b.vx += jn * ib * nx; b.vz += jn * ib * nz; }
        }
      }
    }
    for (const o of A) constrain(o);
  }
}
function startFall(o, gut) {
  o.st = 'fall'; o.gut = gut; o.vy = 0; o.t = 0;
  if (gut) {
    o.vx = Math.sign(o.x) * 90; o.vz *= 0.3;
    energy = Math.min(100, energy + EN_COIN); stats.gutter++;
    gutFlash[o.x > 0 ? 1 : 0] = 1;
    sfx.gutter();
  } else {
    o.vz = Math.max(o.vz, 70); o.vx *= 0.5;
    if (o.k !== 'coin') edgeFlash = 1;
    if (o.k === 'leg') { slowT = 2.6; warp(3000); }
  }
}
function collect(o) {
  if (o.k === 'coin') {
    coinsBack++; stats.coinsOut++;
    const t = $('tray'); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
    $('coinCnt').textContent = coinsBack;
    sfx.coin();
    burst(o.x, 'rgba(246,238,252,.9)', 4);
    return;
  }
  if (o.k === 'gem') {
    stats.gems++;
    gemT = GEM_SEC; AU.setFast(true);
    banner(`💎 ${o.orb.name}！寶石時間 ${GEM_SEC} 秒`, 'gem', 2600);
    sfx.gem();
    burst(o.x, o.orb.c1, 24);
    return;
  }
  catchMon(o.id, o.shiny, o.k === 'leg', o.x);
  if (o.k === 'leg') { legendOn = null; stats.legends++; }
  else stats.dolls++;
}

/* ============ 抓到 → 揭曉排隊 ============ */
const queue = [];
let showing = null, showTimer = 0;
function catchMon(id, shiny, isLeg, x) {
  stats.catches++;
  const r = C.add(id, shiny);
  const evos = C.evolve();
  stats.evo += evos.length;
  const items = [{ t: 'catch', id, shiny, isNew: r.isNew, legend: isLeg }];
  for (const e of evos) items.push({ t: 'evo', from: e.from, to: e.to, isNew: e.isNew });
  if (isLeg) { queue.unshift(...items); if (showing) dismiss(); }    // 傳說插隊
  else queue.push(...items);
  burst(x, shiny ? 'rainbow' : isLeg ? '#d8cbff' : P[id].tier === 'srare' ? '#ffd27a' : P[id].tier === 'rare' ? '#9fdcff' : '#f6eefc', isLeg ? 60 : 22);
  refreshUI(); renderRecent();
  if (dexOpen) renderDex();
  if (!showing) nextCard();
}
function badges(id, shiny, isNew) {
  const t = P[id].tier, b = [];
  if (isNew) b.push('<span class="badge new">NEW</span>');
  b.push(`<span class="badge ${t}">${C.tierName(id)}</span>`);
  if (shiny) b.push('<span class="badge shiny">✨ 閃光</span>');
  return b.join('');
}
function nextCard() {
  clearTimeout(showTimer);
  const box = $('reveal');
  const it = queue.shift();
  if (!it) { showing = null; return; }
  const el = document.createElement('div');
  let ms = 2000;
  if (it.t === 'catch') {
    const p = P[it.id], tier = p.tier;
    el.className = `rv ${tier}${it.shiny ? ' shiny' : ''}`;
    el.innerHTML = `<div class="hd">${it.legend ? 'LEGEND GET' : 'GET!'}</div><span class="q">${queue.length ? '+' + queue.length : ''}</span>
      <div class="img"><img src="${C.img(it.id, it.shiny)}" alt=""></div>
      <div class="no">#${pad3(C.no(it.id))}</div><div class="nm">${it.shiny ? '✨' : ''}${p.zh}</div>
      <div class="bd">${badges(it.id, it.shiny, it.isNew)}</div>`;
    if (it.legend) { ms = 4500; sfx.legendCatch(); }
    else sfx.catch(C.tierRank(it.id));
    if (it.shiny) { sfx.sparkle(); ms = Math.max(ms, 3000); }
  } else {
    el.className = 'rv rare';
    el.innerHTML = `<div class="hd">EVOLUTION</div><span class="q">${queue.length ? '+' + queue.length : ''}</span>
      <div class="evo"><img src="${C.img(it.from)}" alt=""><span class="ar">×3 ➜</span><img src="${C.img(it.to)}" alt=""></div>
      <div class="no">#${pad3(C.no(it.to))}</div><div class="nm">${P[it.to].zh}</div>
      <div class="bd">${badges(it.to, false, it.isNew)}</div>`;
    ms = 2600; sfx.evo();
  }
  if (queue.length > 5 && !(it.t === 'catch' && it.legend)) ms = 1100;
  box.innerHTML = ''; box.appendChild(el);
  showing = el;
  el.addEventListener('pointerdown', e => { e.stopPropagation(); AU.init(); dismiss(); });
  showTimer = setTimeout(dismiss, ms);
}
function dismiss() {
  const el = showing;
  if (!el || el.classList.contains('out')) return;
  clearTimeout(showTimer);
  el.classList.add('out');
  setTimeout(() => { el.remove(); nextCard(); }, 260);
}

/* ============ 演出小工具 ============ */
let bannerT = 0;
function banner(text, cls, ms) {
  const b = $('banner');
  b.textContent = text; b.className = 'banner show ' + (cls || '');
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.className = 'banner ' + (cls || ''); }, ms);
}
let warpT = 0, warpUntil = 0;
function warp(ms) {
  warpUntil = performance.now() + ms;
  $('cab').classList.add('warping');
  clearTimeout(warpT); warpT = setTimeout(() => $('cab').classList.remove('warping'), ms);
}
function burst(wx, col, n) {      // 出口槽爆出粒子
  const [sx] = proj(wx, -120, L + 20);
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), sp = rand(120, 420);
    parts.push({ x: sx, y: 815, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 500, life: rand(0.5, 1.1), max: 1.1, c: col === 'rainbow' ? `hsl(${rand(0, 360)},90%,75%)` : col, s: rand(2, 5) });
  }
}
function burst3(x, y, z, n, col, sp0) {
  const [sx, sy] = proj(x, y, z);
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), sp = rand(sp0 * 0.4, sp0);
    parts.push({ x: sx, y: sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, life: rand(0.4, 0.9), max: 0.9, c: col, s: rand(2, 4) });
  }
}

/* ============ 畫面 ============ */
const cv = $('cv'), ctx = cv.getContext('2d');
let scale = 1, dpr = 1, BG = null;
function layout() {
  const wrap = $('cabWrap'), cab = $('cab');
  const mq = cab.querySelector('.marquee'), tray = $('tray');
  const chromeV = mq.offsetHeight + tray.offsetHeight + 6 + 6 + 18, chromeH = 20;
  const aw = wrap.clientWidth - chromeH, ah = wrap.clientHeight - chromeV;
  let gw = Math.min(aw, ah * W / H), gh = gw * H / W;
  gw = Math.max(200, Math.floor(gw)); gh = Math.floor(gw * H / W);
  const g = $('glass');
  g.style.width = gw + 'px'; g.style.height = gh + 'px';
  cv.style.width = gw + 'px'; cv.style.height = gh + 'px';
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(gw * dpr); cv.height = Math.round(gh * dpr);
  scale = cv.width / W;
  BG = buildStatic();
}
function poly(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
const P2 = (x, y, z) => proj(x, y, z).slice(0, 2);
function buildStatic() {
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0);
  // 底色＋機台內壁
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#120d3a'); gr.addColorStop(0.5, '#1a1450'); gr.addColorStop(1, '#0a0722');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 後牆（時空背景）
  const [, backY] = P2(0, 0, 0);
  gr = g.createLinearGradient(0, 0, 0, backY);
  gr.addColorStop(0, '#0b0830'); gr.addColorStop(0.6, '#241a66'); gr.addColorStop(1, '#3a2d86');
  g.fillStyle = gr; g.fillRect(0, 0, W, backY + 2);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.15, 0.7)})`;
    const s = rand(0.6, 1.8); g.fillRect(rand(0, W), rand(0, backY), s, s);
  }
  // 鑽石切面線條
  g.strokeStyle = 'rgba(214,204,255,.07)'; g.lineWidth = 1;
  for (let x = -W; x < W * 2; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + backY * 0.7, backY); g.stroke(); g.beginPath(); g.moveTo(x, 0); g.lineTo(x - backY * 0.7, backY); g.stroke(); }
  // 側溝（外側斜壁＋深溝）
  for (const sgn of [-1, 1]) {
    const a = HALFW * sgn, b = (HALFW + GUT) * sgn;
    poly(g, [P2(a, 0, 0), P2(b, 0, 0), P2(b, 0, GZ), P2(a, 0, GZ)]);
    g.fillStyle = '#2a2168'; g.fill();
    poly(g, [P2(a, 0, GZ), P2(b, 0, GZ), P2(b, 0, L + 30), P2(a, 0, L + 30)]);
    gr = g.createLinearGradient(...P2(a, 0, GZ), ...P2(b, 0, GZ));
    gr.addColorStop(0, '#05030f'); gr.addColorStop(1, '#1a1346');
    g.fillStyle = gr; g.fill();
    poly(g, [P2(b, 0, 0), P2(b * 1.6, 80, 0), P2(b * 1.6, 80, L + 60), P2(b, 0, L + 30)]);
    g.fillStyle = '#2a2168'; g.fill();
    g.strokeStyle = 'rgba(214,204,255,.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(...P2(b, 0, 0)); g.lineTo(...P2(b, 0, L + 30)); g.stroke();
    // 後半段的擋牆
    poly(g, [P2(a, 0, 0), P2(a, 26, 0), P2(a, 26, GZ), P2(a, 0, GZ)]);
    g.fillStyle = 'rgba(216,203,255,.28)'; g.fill();
    g.strokeStyle = 'rgba(246,238,252,.6)'; g.beginPath(); g.moveTo(...P2(a, 26, 0)); g.lineTo(...P2(a, 26, GZ)); g.lineTo(...P2(a, 0, GZ)); g.stroke();
  }
  // 平台
  poly(g, [P2(-HALFW, 0, 0), P2(HALFW, 0, 0), P2(HALFW, 0, L), P2(-HALFW, 0, L)]);
  gr = g.createLinearGradient(0, backY, 0, P2(0, 0, L)[1]);
  gr.addColorStop(0, '#3b3189'); gr.addColorStop(1, '#6a5fbf');
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(246,238,252,.08)'; g.lineWidth = 1;
  for (let i = -HALFW * 2; i <= HALFW * 2; i += 34) {
    g.beginPath(); g.moveTo(...P2(i, 0, 0)); g.lineTo(...P2(i + L, 0, L)); g.stroke();
    g.beginPath(); g.moveTo(...P2(i, 0, 0)); g.lineTo(...P2(i - L, 0, L)); g.stroke();
  }
  // 中央的神奧鑽石紋
  g.strokeStyle = 'rgba(246,238,252,.12)'; g.lineWidth = 2;
  poly(g, [P2(0, 0, 140), P2(70, 0, 205), P2(0, 0, 270), P2(-70, 0, 205)]); g.stroke();
  g.restore();
  // 前緣與前面板
  poly(g, [P2(-HALFW, 0, L), P2(HALFW, 0, L), P2(HALFW, -36, L), P2(-HALFW, -36, L)]);
  gr = g.createLinearGradient(0, P2(0, 0, L)[1], 0, P2(0, -36, L)[1]);
  gr.addColorStop(0, '#e9dfff'); gr.addColorStop(0.25, '#8f84cf'); gr.addColorStop(1, '#2a2168');
  g.fillStyle = gr; g.fill();
  // 出口槽
  const [lx, ly] = P2(-HALFW, -36, L), [rx2] = P2(HALFW, -36, L);
  gr = g.createLinearGradient(0, ly, 0, H);
  gr.addColorStop(0, '#05030f'); gr.addColorStop(1, '#1d1752');
  g.fillStyle = gr; g.fillRect(lx, ly, rx2 - lx, H - ly);
  gr = g.createRadialGradient(W / 2, H + 10, 10, W / 2, H + 10, 230);
  gr.addColorStop(0, 'rgba(159,220,255,.25)'); gr.addColorStop(1, 'rgba(159,220,255,0)');
  g.fillStyle = gr; g.fillRect(0, ly, W, H - ly);
  g.font = '700 13px Rajdhani, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(214,204,255,.45)';
  g.fillText('◆  PRIZE  ◆', W / 2, H - 14);
  return c;
}

function drawPortal(t) {
  const cx = W / 2, cy = 96, en = energy / 100;
  ctx.save();
  const glow = legendOn ? 1 : en;
  let gr = ctx.createRadialGradient(cx, cy, 4, cx, cy, 120);
  gr.addColorStop(0, `rgba(216,203,255,${0.25 + glow * 0.45})`); gr.addColorStop(0.5, `rgba(120,90,220,${0.12 + glow * 0.25})`); gr.addColorStop(1, 'rgba(60,40,140,0)');
  ctx.fillStyle = gr; ctx.fillRect(cx - 130, cy - 120, 260, 240);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const rr = 26 + i * 15, a = t * (0.4 + i * 0.15) * (i % 2 ? -1 : 1);
    ctx.strokeStyle = `rgba(${i % 2 ? '159,220,255' : '255,182,220'},${0.18 + glow * 0.25})`;
    ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.42, 0, a, a + 4.2); ctx.stroke();
  }
  // 能量環
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.ellipse(cx, cy, 100, 46, 0, 0, 6.283); ctx.stroke();
  if (en > 0.001) {
    gr = ctx.createLinearGradient(cx - 100, 0, cx + 100, 0);
    gr.addColorStop(0, '#9fdcff'); gr.addColorStop(0.5, '#d8cbff'); gr.addColorStop(1, '#ffb6dc');
    ctx.strokeStyle = gr; ctx.shadowColor = '#b69cff'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(cx, cy, 100, 46, 0, -Math.PI / 2, -Math.PI / 2 + en * 6.283); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = 'center';
  ctx.font = '700 11px "Noto Sans TC", sans-serif'; ctx.fillStyle = 'rgba(214,204,255,.7)';
  ctx.fillText(legendOn ? '傳說玩偶登場中' : '時空能量', cx, cy - 4);
  ctx.font = '700 24px Rajdhani, sans-serif'; ctx.fillStyle = '#f6eefc';
  ctx.fillText(legendOn ? '★' : Math.floor(energy) + '%', cx, cy + 20);
  if (gemT > 0) {
    ctx.font = '700 15px "Noto Sans TC", sans-serif'; ctx.fillStyle = '#ffd27a';
    ctx.fillText(`💎 寶石時間 ${gemT.toFixed(1)}s`, cx, 172);
  }
  ctx.restore();
}
function drawGutters() {
  for (let s = 0; s < 2; s++) {
    const sgn = s ? 1 : -1, a = HALFW * sgn, b = (HALFW + GUT) * sgn;
    const al = 0.12 + energy / 100 * 0.35 + gutFlash[s] * 0.5;
    poly(ctx, [P2(a, 0, GZ), P2(b, 0, GZ), P2(b, 0, L + 30), P2(a, 0, L + 30)]);
    ctx.fillStyle = `rgba(182,156,255,${al})`; ctx.fill();
  }
  ctx.save();
  ctx.beginPath();
  for (const sgn of [-1, 1]) { const a = HALFW * sgn, b = (HALFW + GUT + 30) * sgn; const q = [P2(a, 0, GZ), P2(b, 0, GZ), P2(b, 0, L + 30), P2(a, 0, L + 30)]; q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
  ctx.clip();
  for (const o of objs) if (o.st === 'fall' && o.gut) drawObj(o);
  ctx.restore();
}
function drawPusher(t) {
  const fl = P2(-HALFW, 0, pz), fr = P2(HALFW, 0, pz), tl = P2(-HALFW, PH, pz), tr = P2(HALFW, PH, pz);
  const bl = P2(-HALFW, PH, 0), br = P2(HALFW, PH, 0);
  // 地上的影子
  poly(ctx, [fl, fr, P2(HALFW, 0, pz + 22), P2(-HALFW, 0, pz + 22)]);
  ctx.fillStyle = 'rgba(10,6,30,.35)'; ctx.fill();
  // 頂面
  poly(ctx, [bl, br, tr, tl]);
  let gr = ctx.createLinearGradient(0, bl[1], 0, tl[1]);
  gr.addColorStop(0, '#7f74c4'); gr.addColorStop(1, '#cfc4f3');
  ctx.fillStyle = gr; ctx.fill();
  // 前面板
  poly(ctx, [tl, tr, fr, fl]);
  gr = ctx.createLinearGradient(0, tl[1], 0, fl[1]);
  gr.addColorStop(0, '#f6eefc'); gr.addColorStop(0.2, '#b3a7e6'); gr.addColorStop(1, '#4a3f98');
  ctx.fillStyle = gr; ctx.fill();
  // 中間的發光帶
  const m1 = P2(-HALFW, PH * 0.55, pz), m2 = P2(HALFW, PH * 0.55, pz);
  gr = ctx.createLinearGradient(m1[0], 0, m2[0], 0);
  const sh = (t * (gemT > 0 ? 0.9 : 0.35)) % 1;
  gr.addColorStop(0, 'rgba(159,220,255,.25)'); gr.addColorStop(clamp(sh - 0.1, 0, 1), 'rgba(159,220,255,.25)');
  gr.addColorStop(sh, gemT > 0 ? 'rgba(255,210,122,1)' : 'rgba(255,255,255,.95)');
  gr.addColorStop(clamp(sh + 0.1, 0, 1), 'rgba(255,182,220,.25)'); gr.addColorStop(1, 'rgba(255,182,220,.25)');
  ctx.strokeStyle = gr; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(...m1); ctx.lineTo(...m2); ctx.stroke();
  ctx.fillStyle = 'rgba(42,33,104,.7)';
  for (let i = -2; i <= 2; i++) {
    const [x, y, k] = proj(i * 62, PH * 0.25, pz);
    ctx.beginPath(); ctx.moveTo(x, y - 5 * k); ctx.lineTo(x + 5 * k, y); ctx.lineTo(x, y + 5 * k); ctx.lineTo(x - 5 * k, y); ctx.fill();
  }
}
function drawShadow(o) {
  const [sx, sy, k] = proj(o.x, 0, o.z), sq = squash(o.z);
  const h = Math.max(0, o.y), f = 1 / (1 + h / 120);
  ctx.fillStyle = `rgba(10,6,30,${0.35 * f})`;
  ctx.beginPath(); ctx.ellipse(sx, sy + 2 * k, o.r * k * (0.6 + 0.45 * f), o.r * k * sq * (0.6 + 0.45 * f), 0, 0, 6.283); ctx.fill();
}
function drawObj(o) {
  let [sx, sy, k] = proj(o.x, o.y, o.z);
  const sq = squash(o.z), rx = o.r * k, ry = rx * sq;
  let alpha = 1;
  if (o.st === 'fall') alpha = clamp(1 + o.y / (o.gut ? 80 : 150), 0, 1);
  if (o.edge) sx += Math.sin(gt * 40 + o.seed) * 1.6;
  ctx.globalAlpha = alpha;
  const kind = o.k === 'coin' ? 'coin' : o.k === 'gem' ? 'gem' : o.k === 'leg' ? 'legend' : o.tier;
  const th = (o.k === 'coin' ? 5 : o.k === 'leg' ? 12 : 8) * k;
  // 側面＋頂面
  ctx.fillStyle = RIM[kind];
  ctx.beginPath(); ctx.ellipse(sx, sy + th, rx, ry, 0, 0, Math.PI); ctx.lineTo(sx - rx, sy); ctx.ellipse(sx, sy, rx, ry, 0, Math.PI, 0, true); ctx.closePath(); ctx.fill();
  ctx.drawImage(SPR[kind], sx - rx, sy - ry, rx * 2, ry * 2);
  if (o.k === 'coin') { ctx.globalAlpha = 1; return; }
  if (o.shiny || o.k === 'leg') {
    ctx.lineWidth = 2.5 * k;
    ctx.strokeStyle = o.shiny ? `hsl(${(gt * 160 + o.seed * 50) % 360},95%,75%)` : 'rgba(216,203,255,.9)';
    ctx.beginPath(); ctx.ellipse(sx, sy, rx * 0.98, ry * 0.98, 0, 0, 6.283); ctx.stroke();
  }
  if (o.k === 'gem') {
    const R = o.r * 0.85 * k, cy = sy - R * 0.95 + Math.sin(gt * 3 + o.seed) * 2 * k;
    const gr = ctx.createRadialGradient(sx - R * 0.35, cy - R * 0.4, R * 0.1, sx, cy, R);
    gr.addColorStop(0, o.orb.c0); gr.addColorStop(0.5, o.orb.c1); gr.addColorStop(1, o.orb.c2);
    ctx.shadowColor = o.orb.c1; ctx.shadowBlur = 14;
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, cy, R, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx - R * 0.7, cy - R * 0.1); ctx.lineTo(sx, cy - R * 0.7); ctx.lineTo(sx + R * 0.7, cy - R * 0.1); ctx.lineTo(sx, cy + R * 0.75); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1; return;
  }
  // 寶可夢玩偶（立在代幣上）
  const im = pimg(o.id, o.shiny);
  const s = o.r * (o.k === 'leg' ? 2.9 : 2.5) * k;
  const bob = o.st === 'tab' ? Math.sin(gt * 2.2 + o.seed) * 1.2 * k : 0;
  if (o.k === 'leg') {
    const gr = ctx.createRadialGradient(sx, sy - s * 0.4, 4, sx, sy - s * 0.4, s * 0.8);
    gr.addColorStop(0, 'rgba(216,203,255,.55)'); gr.addColorStop(1, 'rgba(216,203,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(sx - s, sy - s * 1.3, s * 2, s * 1.6);
  }
  if (im.complete && im.naturalWidth) ctx.drawImage(im, sx - s / 2, sy + ry * 0.35 - s + bob, s, s);
  if (o.shiny && Math.random() < 0.08) parts.push({ x: sx + rand(-s / 2, s / 2), y: sy - rand(0, s * 0.8), vx: 0, vy: -20, life: 0.6, max: 0.6, c: `hsl(${rand(0, 360)},90%,80%)`, s: 2.5 });
  ctx.globalAlpha = 1;
}
function draw(now) {
  const t = now;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (shakeT > 0) ctx.translate(rand(-4, 4) * shakeT, rand(-4, 4) * shakeT);
  ctx.drawImage(BG, 0, 0, W, H);
  drawPortal(t);
  drawGutters();
  drawPusher(t);
  const list = objs.filter(o => o.st !== 'fall').sort((a, b) => a.z - b.z || a.y - b.y);
  for (const o of list) drawShadow(o);
  for (const o of list) drawObj(o);
  // 前緣發光
  const l1 = P2(-HALFW, 0, L), l2 = P2(HALFW, 0, L);
  ctx.strokeStyle = `rgba(246,238,252,${0.5 + edgeFlash * 0.5})`; ctx.lineWidth = 2 + edgeFlash * 3;
  ctx.shadowColor = '#d8cbff'; ctx.shadowBlur = 8 + edgeFlash * 16;
  ctx.beginPath(); ctx.moveTo(...l1); ctx.lineTo(...l2); ctx.stroke(); ctx.shadowBlur = 0;
  for (const o of objs) if (o.st === 'fall' && !o.gut) drawObj(o);
  for (const p of parts) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  ctx.globalAlpha = 1;
  const wl = (warpUntil - performance.now()) / 1000;
  if (wl > 0) drawWarp(t, Math.min(1, wl / 0.6));
  if (holding) {
    const [hx] = proj(holdX, 0, 100);
    ctx.strokeStyle = 'rgba(159,220,255,.35)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, P2(holdX, 0, 100)[1]); ctx.stroke(); ctx.setLineDash([]);
  }
}

// 時空扭曲：畫面錯位殘影＋從時空之門擴散的波紋
function drawWarp(t, k) {
  const off = (5 + 4 * Math.sin(t * 9)) * k * dpr;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.22 * k; ctx.drawImage(cv, off, Math.sin(t * 7) * off * 0.5);
  ctx.globalAlpha = 0.18 * k; ctx.drawImage(cv, -off, -Math.sin(t * 6) * off * 0.5);
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const f = (t * 0.7 + i / 6) % 1, rr = 30 + f * 520;
    ctx.strokeStyle = `rgba(${i % 2 ? '159,220,255' : '216,180,255'},${(1 - f) * 0.55 * k})`;
    ctx.beginPath(); ctx.ellipse(W / 2, 96, rr, rr * 0.55, Math.sin(t + i) * 0.2, 0, 6.283); ctx.stroke();
  }
  const gr = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.45, H * 0.75);
  gr.addColorStop(0, 'rgba(120,80,220,0)'); gr.addColorStop(1, `rgba(90,40,200,${0.55 * k})`);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ============ 主迴圈 ============ */
let lastT = performance.now(), acc = 0, uiT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const el = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (!paused) {
    if (slowT > 0) { slowT -= el; ts = slowT > 0 ? 0.25 : 1; }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - el);
    acc += el * speed;
    const cap = 6 * speed;
    let n = 0;
    while (acc >= DT && n < cap) { step(); acc -= DT; n++; }
    if (n >= cap) acc = 0;
  }
  draw(now / 1000);
  uiT -= el;
  if (uiT <= 0) { uiT = 0.25; liveUI(); }
}

/* ============ UI ============ */
function refreshUI() {
  const n = C.count(), s = C.shinyCount(), lg = LEGENDS.filter(id => C.has(id)).length;
  $('pDex').textContent = `${n} / ${TOTAL}`; $('bDex').style.width = n / TOTAL * 100 + '%';
  $('pShiny').textContent = s; $('bShiny').style.width = s / TOTAL * 100 + '%';
  $('pLeg').textContent = `${lg} / ${LEGENDS.length}`; $('bLeg').style.width = lg / LEGENDS.length * 100 + '%';
  $('mCnt').innerHTML = `${n}<i>/${TOTAL}</i>`;
}
function liveUI() {
  $('pEn').textContent = Math.floor(energy) + '%'; $('bEn').style.width = energy + '%';
  $('pCoin').textContent = coinsBack;
  $('gemSt').textContent = gemT > 0 ? `💎 寶石時間 ${gemT.toFixed(1)} 秒：推板 ×2、玩偶補充 ×3` : '';
  $('legSt').textContent = legendOn ? `傳說玩偶「${P[legendOn.id].zh}」在平台上！` : `平台上：珠 ${coinCount()} 顆・玩偶 ${dollCount()} 隻`;
}
function renderRecent() {
  const r = C.recent().slice(0, 12);
  const html = r.length ? r.map(e => `<div class="${e.s ? 's' : ''}"><img src="${C.img(e.id, e.s)}" alt=""><span>#${pad3(C.no(e.id))}</span></div>`).join('') : '<span class="empty">還沒有抓到寶可夢</span>';
  $('recent').innerHTML = html;
}

// 圖鑑
const PAGE = 30;
let dexPage = 0, dexOpen = false;
const shinyView = new Set();
function renderDex() {
  $('dCnt').innerHTML = `${C.count()}<i>/${TOTAL}</i> ・✨${C.shinyCount()}`;
  const rec = C.recent();
  $('dRecent').innerHTML = rec.length ? rec.map(e => `<div class="${e.s ? 's' : ''}" title="${P[e.id].zh}"><img src="${C.img(e.id, e.s)}" alt=""></div>`).join('') : '<span class="empty">最近抓到的會出現在這裡</span>';
  const list = POKEDEX.slice().sort((a, b) => C.no(a.id) - C.no(b.id)).slice(dexPage * PAGE, dexPage * PAGE + PAGE);
  $('dGrid').innerHTML = list.map(p => {
    const e = C.store.dex[p.id], got = !!(e && e.got), hs = !!(e && e.gotS), sv = hs && shinyView.has(p.id);
    const prog = got && C.CHILDREN[p.id] && e.n ? `<span class="x">${e.n}/3</span>` : '';
    return `<div class="dc ${got ? '' : 'no'} ${hs ? 'hs' : ''} ${sv ? 'sv' : ''} ${p.tier === 'legend' ? 'legend' : ''}" data-id="${p.id}">
      <div class="n">#${pad3(C.no(p.id))}</div>${prog}<img src="${C.img(p.id, sv)}" alt="" loading="lazy"><div class="z">${got ? p.zh : '？？？'}</div></div>`;
  }).join('');
  const pages = Math.ceil(TOTAL / PAGE);
  let ph = '';
  for (let i = 0; i < pages; i++) ph += `<button class="pg ${i === dexPage ? 'on' : ''}" data-p="${i}">${i + 1}</button>`;
  $('dPager').innerHTML = ph + `<span class="note">第 ${dexPage * PAGE + 1}–${Math.min(TOTAL, dexPage * PAGE + PAGE)} 號・點有 ✨ 的格子看閃光</span>`;
}
$('dGrid').addEventListener('click', e => {
  const c = e.target.closest('.dc.hs'); if (!c) return;
  const id = +c.dataset.id;
  if (shinyView.has(id)) shinyView.delete(id); else shinyView.add(id);
  sfx.tap(); renderDex();
});
$('dPager').addEventListener('click', e => { const b = e.target.closest('.pg'); if (!b) return; dexPage = +b.dataset.p; sfx.tap(); renderDex(); });
function openDex() { dexOpen = true; renderDex(); $('mDex').classList.add('show'); }
function closeDex() { dexOpen = false; $('mDex').classList.remove('show'); }
$('btnDex').addEventListener('click', () => { AU.init(); openDex(); });
$('dClose').addEventListener('click', closeDex);
$('mDex').addEventListener('click', e => { if (e.target === $('mDex')) closeDex(); });

// 按鈕
function syncBtns() {
  $('btnAuto').classList.toggle('on', cfg.auto);
  $('btnMusic').classList.toggle('off', !cfg.music);
  $('btnSfx').classList.toggle('off', !cfg.sfx);
  $('btnSfx').textContent = cfg.sfx ? '🔊' : '🔇';
  $('btnPause').textContent = paused ? '▶' : '⏸';
}
$('btnHome').addEventListener('click', () => { location.href = '../'; });
$('btnAuto').addEventListener('click', () => { AU.init(); cfg.auto = !cfg.auto; saveCfg(); syncBtns(); banner(cfg.auto ? '自動投珠：開' : '自動投珠：關（點畫面投珠）', '', 1400); });
$('btnMusic').addEventListener('click', () => { AU.init(); cfg.music = !cfg.music; AU.setMusic(cfg.music); saveCfg(); syncBtns(); });
$('btnSfx').addEventListener('click', () => { AU.init(); cfg.sfx = !cfg.sfx; AU.setSfx(cfg.sfx); saveCfg(); syncBtns(); });
function setPaused(p) {
  paused = p; holding = false;
  $('pauseOv').classList.toggle('show', p);
  if (p) AU.suspend(); else { AU.init(); AU.resume(); }
  syncBtns();
}
$('btnPause').addEventListener('click', () => setPaused(!paused));
$('btnResume').addEventListener('click', () => setPaused(false));

// 投珠：點一下投一顆、按住連續投
function worldX(e) {
  const r = cv.getBoundingClientRect();
  const sx = (e.clientX - r.left) / r.width * W;
  return (sx - CX) / proj(0, 0, 100)[2];
}
cv.addEventListener('pointerdown', e => {
  e.preventDefault(); AU.init();
  if (paused) return;
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  holding = true; holdX = worldX(e); holdT = HOLD_EVERY;
  dropCoin(holdX);
});
cv.addEventListener('pointermove', e => { if (holding) holdX = worldX(e); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => cv.addEventListener(ev, () => { holding = false; }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDex();
  if (e.key === 'p' || e.key === 'P') setPaused(!paused);
  if (e.key === ' ') { e.preventDefault(); AU.init(); dropCoin(rand(-120, 120)); }
});
['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => AU.init(), { passive: true }));   // iOS 要在使用者手勢裡開聲音
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { holding = false; AU.suspend(); } else { lastT = performance.now(); AU.resume(); }
});
window.addEventListener('resize', layout);

// 測試用
window.__sp = {
  get stats() { return Object.assign({}, stats, { energy, coins: coinCount(), dolls: dollCount(), objs: objs.length, dex: C.count(), queue: queue.length, pz, legend: legendOn && legendOn.id }); },
  set speed(v) { speed = v; }, get speed() { return speed; },
  energy(v) { energy = v; },
  card(it) { queue.push(it); if (!showing) nextCard(); },   // 只看揭曉卡，不存檔
  run(sec) {   // 不畫圖直接跑 sec 秒（每秒檢查一次）
    const bad = [];
    for (let i = 0; i < sec * 60; i++) { step(); if (i % 60 === 0) bad.push(...this.check()); }
    return bad;
  },
  check() {   // 檢查有沒有東西卡在推板裡、跑出平台、NaN
    const bad = [];
    for (const o of objs) {
      if (![o.x, o.z, o.y, o.vx, o.vz].every(isFinite)) bad.push(['nan', o]);
      if (o.st === 'tab' && o.z - o.r < pz - 1) bad.push(['inPusher', o.k, o.z, pz]);
      if (o.st === 'tab' && Math.abs(o.x) > HALFW + o.r) bad.push(['outside', o.k, o.x]);
      if (o.st === 'tab' && o.z > L + 1) bad.push(['pastEdge', o.k, o.z]);
    }
    return bad;
  },
  objs: () => objs,
};

layout();
fillStart();
for (let i = 0; i < 30; i++) solve(objs.filter(o => o.st === 'tab'));
refreshUI(); renderRecent(); syncBtns(); liveUI();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { BG = buildStatic(); });
requestAnimationFrame(frame);
