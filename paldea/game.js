'use strict';
/* 帕底亞刮刮樂：刮開九格，三個相同就得到那隻寶可夢 */
const $ = id => document.getElementById(id);
const C = Collect.create({ key: 'paldeaPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
const P = C.P;
const pad3 = Collect.pad3;
const rand = a => a[Math.floor(Math.random() * a.length)];
const DEX_TOTAL = POKEDEX.length;
const SHINY_RATE = 1 / 100;
const TERA_EVERY = 7, LEGEND_EVERY = 25;
const BRUSH = 22;          // 筆刷半徑（CSS px）
const MASK_N = 14;         // 每格的覆蓋率格點 14×14
const REVEAL_AT = 0.6;     // 刮開 60% 就算揭開

/* ============ 狀態（第幾張；不動 .dex 格式） ============ */
const ST_KEY = 'paldeaPachinko.state';
const st = { n: 0, leg: 0, music: true, sfx: true };
try { Object.assign(st, JSON.parse(localStorage.getItem(ST_KEY)) || {}); } catch (e) {}
if (/[?&]reset\b/.test(location.search)) { st.n = 0; st.leg = 0; }
const saveSt = () => { try { localStorage.setItem(ST_KEY, JSON.stringify(st)); } catch (e) {} };

/* ============ 18 屬性 ============ */
const TYPES = {
  normal:   { zh: '一般', en: 'NORMAL',   c: '#A8A77A', i: '⚪' },
  fire:     { zh: '火',   en: 'FIRE',     c: '#EE8130', i: '🔥' },
  water:    { zh: '水',   en: 'WATER',    c: '#6390F0', i: '💧' },
  electric: { zh: '電',   en: 'ELECTRIC', c: '#F7D02C', i: '⚡' },
  grass:    { zh: '草',   en: 'GRASS',    c: '#7AC74C', i: '🌿' },
  ice:      { zh: '冰',   en: 'ICE',      c: '#96D9D6', i: '❄️' },
  fighting: { zh: '格鬥', en: 'FIGHTING', c: '#C22E28', i: '👊' },
  poison:   { zh: '毒',   en: 'POISON',   c: '#A33EA1', i: '☠️' },
  ground:   { zh: '地面', en: 'GROUND',   c: '#E2BF65', i: '⛰️' },
  flying:   { zh: '飛行', en: 'FLYING',   c: '#A98FF3', i: '🕊️' },
  psychic:  { zh: '超能力', en: 'PSYCHIC', c: '#F95587', i: '🔮' },
  bug:      { zh: '蟲',   en: 'BUG',      c: '#A6B91A', i: '🐛' },
  rock:     { zh: '岩石', en: 'ROCK',     c: '#B6A136', i: '🪨' },
  ghost:    { zh: '幽靈', en: 'GHOST',    c: '#735797', i: '👻' },
  dragon:   { zh: '龍',   en: 'DRAGON',   c: '#6F35FC', i: '🐉' },
  dark:     { zh: '惡',   en: 'DARK',     c: '#705746', i: '🌙' },
  steel:    { zh: '鋼',   en: 'STEEL',    c: '#B7B7CE', i: '⚙️' },
  fairy:    { zh: '妖精', en: 'FAIRY',    c: '#D685AD', i: '✨' },
};
const TYPE_KEYS = Object.keys(TYPES);
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mix(h, to, t) { const a = hexRgb(h), b = hexRgb(to); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
for (const k of TYPE_KEYS) {
  const T = TYPES[k], [r, g, b] = hexRgb(T.c);
  T.cl = mix(T.c, '#ffffff', 0.55); T.cd = mix(T.c, '#1a0a26', 0.45);
  T.ink = (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#2a1036' : '#ffffff';
  T.pool = POKEDEX.filter(p => p.types.includes(k));
}
const setTypeVars = (el, k) => { const T = TYPES[k]; el.style.setProperty('--c', T.c); el.style.setProperty('--cl', T.cl); el.style.setProperty('--cd', T.cd); el.style.setProperty('--ink', T.ink); };
const typeChip = k => `<span class="chipT" style="--tc:${TYPES[k].c};--tk:${TYPES[k].ink}">${TYPES[k].i} ${TYPES[k].zh}</span>`;

/* ============ 音樂與音效（WebAudio 即時合成，原創曲） ============ */
const AU = (() => {
  let ac = null, master, bgm, sfx, nb, nextT = 0, step = 0, lastTick = 0, mode = 'normal', scrG, scrF;
  const BGM_VOL = 0.42;
  let E = 60 / 138 / 2;
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ac) { if (ac.state === 'suspended' && !document.hidden) ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    bgm = ac.createGain(); bgm.gain.value = st.music ? BGM_VOL : 0; bgm.connect(master);
    sfx = ac.createGain(); sfx.gain.value = st.sfx ? 1 : 0; sfx.connect(master);
    nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (Math.random() < 0.25 ? 1 : 0.35);   // 帶顆粒的雜訊＝沙沙聲
    // 刮的沙沙聲：一直循環的雜訊，音量跟著手指速度
    const src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
    scrF = ac.createBiquadFilter(); scrF.type = 'bandpass'; scrF.frequency.value = 3200; scrF.Q.value = 0.7;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    scrG = ac.createGain(); scrG.gain.value = 0;
    src.connect(scrF).connect(hp).connect(scrG).connect(sfx); src.start();
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
  function noise(dest, t, dur, vol, type = 'highpass', f = 6000, f2) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; fl.type = type; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // 背景音樂：F–G–Em–Am ／ Am–G–F–E（帶一點伊比利半島味的安達魯西亞進行）
  const BARS = [
    { r: 41, ch: [65, 69, 72], L: [77, 0, 76, 74, 72, 0, 74, 76] },
    { r: 43, ch: [67, 71, 74], L: [79, 0, 77, 76, 74, 0, 71, 74] },
    { r: 40, ch: [64, 67, 71], L: [76, 0, 74, 72, 71, 72, 74, 76] },
    { r: 45, ch: [69, 72, 76], L: [72, 0, 0, 69, 72, 76, 81, 0] },
    { r: 45, ch: [69, 72, 76], L: [81, 0, 79, 77, 76, 0, 77, 79] },
    { r: 43, ch: [67, 71, 74], L: [79, 0, 77, 76, 74, 0, 76, 77] },
    { r: 41, ch: [65, 69, 72], L: [77, 0, 76, 74, 72, 74, 76, 77] },
    { r: 40, ch: [64, 68, 71], L: [76, 0, 75, 76, 80, 0, 83, 0] },
  ];
  function schedule() {
    if (!ac || ac.state !== 'running') return;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.15) { playStep(step, nextT); nextT += E; step = (step + 1) % 64; }
  }
  function playStep(s, t) {
    const B = BARS[s >> 3], i = s & 7, n = B.L[i];
    if (n) {
      osc(bgm, 'square', hz(n), t, E * 0.85, 0.02); osc(bgm, 'triangle', hz(n), t, E * 1.3, 0.03);
      if (mode === 'tera') osc(bgm, 'sine', hz(n + 12), t, E * 1.2, 0.02);
      if (mode === 'legend') osc(bgm, 'sawtooth', hz(n - 12), t, E * 0.9, 0.008);
    }
    osc(bgm, 'triangle', hz(i % 2 ? B.r + 12 : B.r), t, E * 0.8, 0.08);
    if (i === 0) B.ch.forEach((m, k) => osc(bgm, 'triangle', hz(m), t + k * 0.012, E * 1.6, 0.022));   // 吉他刷弦
    else if (i % 2) osc(bgm, 'triangle', hz(B.ch[(i >> 1) % 3]), t, E * 0.6, 0.02);
    if (i === 0 || i === 4) osc(bgm, 'sine', 150, t, 0.16, 0.22, 45);
    if (i === 2 || i === 6) noise(bgm, t, 0.1, 0.08, 'bandpass', 1600);
    if (i % 2 && Math.random() < 0.6) noise(bgm, t, 0.025, 0.04, 'highpass', 5000);   // 響板
    noise(bgm, t, 0.025, 0.02, 'highpass', 8000);
    if (mode === 'tera') osc(bgm, 'sine', hz(B.ch[i % 3] + 24), t, E * 1.5, 0.014);   // 太晶：亮晶晶的琶音
    if (mode === 'legend' && i === 0) osc(bgm, 'sine', 80, t, 0.6, 0.3, 42);
  }
  function duck(sec) {
    if (!ac || !st.music) return;
    const t = ac.currentTime;
    bgm.gain.cancelScheduledValues(t); bgm.gain.setTargetAtTime(BGM_VOL * 0.15, t, 0.05); bgm.gain.setTargetAtTime(BGM_VOL, t + sec, 0.4);
  }
  function notes(list, type = 'square', vol = 0.05, delay = 0) {
    if (!ac) return 0;
    let t = ac.currentTime + delay;
    for (const [m, d] of list) { if (m) { osc(sfx, type, hz(m), t, d * 0.95, vol); osc(sfx, 'triangle', hz(m - 12), t, d, vol * 0.8); } t += d; }
    return t - ac.currentTime;
  }
  const play = {
    scratch(v) {
      if (!ac) return;
      const t = ac.currentTime;
      scrG.gain.cancelScheduledValues(t);
      scrG.gain.setTargetAtTime(0.06 + 0.22 * Math.min(1, v), t, 0.012);
      scrG.gain.setTargetAtTime(0, t + 0.07, 0.04);
      scrF.frequency.setTargetAtTime(2000 + Math.random() * 2800, t, 0.02);
    },
    tick() { if (!ac) return; const n = performance.now(); if (n - lastTick < 50) return; lastTick = n; osc(sfx, 'sine', 2600 + Math.random() * 900, ac.currentTime, 0.03, 0.015); },
    pop() { if (!ac) return; const t = ac.currentTime; osc(sfx, 'sine', 500, t, 0.09, 0.08, 1300); osc(sfx, 'triangle', hz(84 + Math.floor(Math.random() * 3) * 3), t + 0.04, 0.22, 0.04); },
    pair() { notes([[79, 0.07], [86, 0.14]], 'triangle', 0.05); },
    triple() { duck(1.4); notes([[72, 0.07], [76, 0.07], [79, 0.07], [84, 0.07], [88, 0.3]], 'square', 0.045); },
    sparkle() { if (!ac) return; [88, 91, 96, 100, 103, 108].forEach((m, i) => osc(sfx, 'sine', hz(m), ac.currentTime + i * 0.05, 0.3, 0.04)); },
    newOne() { notes([[84, 0.08], [91, 0.2]], 'triangle', 0.05, 0.2); },
    whoosh() { if (ac) noise(sfx, ac.currentTime, 0.4, 0.2, 'bandpass', 600, 4000); },
    deal() { if (!ac) return; noise(sfx, ac.currentTime, 0.3, 0.12, 'bandpass', 3000, 700); osc(sfx, 'triangle', 880, ac.currentTime + 0.28, 0.08, 0.04); },
    teraDeal() { if (!ac) return; duck(1.5); [84, 88, 91, 96, 100, 103, 108, 112].forEach((m, i) => { osc(sfx, 'sine', hz(m), ac.currentTime + i * 0.06, 0.4, 0.04); osc(sfx, 'triangle', hz(m - 24), ac.currentTime + i * 0.06, 0.2, 0.02); }); },
    legendDeal() {
      if (!ac) return; duck(2.5);
      const t = ac.currentTime;
      osc(sfx, 'sine', 70, t, 1.4, 0.4, 35); noise(sfx, t, 1.2, 0.25, 'lowpass', 200, 2000);
      notes([[57, 0.3], [64, 0.3], [69, 0.7]], 'sawtooth', 0.03, 0.4);
    },
    legend() {
      duck(4.5);
      if (!ac) return;
      const t = ac.currentTime;
      osc(sfx, 'sine', 60, t, 1.8, 0.45, 30); noise(sfx, t, 0.9, 0.3, 'highpass', 1500);
      const d = notes([[69, 0.14], [72, 0.14], [76, 0.14], [81, 0.42], [79, 0.14], [81, 0.14], [84, 0.42], [0, 0.06], [83, 0.14], [84, 0.14], [86, 0.14], [88, 0.9]], 'square', 0.05, 0.3);
      [76, 81, 84, 88].forEach(m => osc(sfx, 'triangle', hz(m), t + d - 0.9, 1.4, 0.03));
    },
    evolve() { if (!ac) return; duck(2); const t = ac.currentTime; osc(sfx, 'sine', 300, t, 0.9, 0.06, 1400); osc(sfx, 'triangle', 450, t, 0.9, 0.04, 2100); notes([[84, 0.1], [88, 0.1], [91, 0.1], [96, 0.4]], 'square', 0.04, 0.9); },
    click() { if (ac) osc(sfx, 'triangle', 1200, ac.currentTime, 0.05, 0.04); },
  };
  return {
    init, play,
    setMusic(on) { if (ac) { bgm.gain.cancelScheduledValues(ac.currentTime); bgm.gain.setTargetAtTime(on ? BGM_VOL : 0, ac.currentTime, 0.1); } },
    setSfx(on) { if (ac) sfx.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.02); },
    setMode(m) { mode = m; E = 60 / (m === 'tera' ? 152 : m === 'legend' ? 124 : 138) / 2; },
    suspend: () => ac && ac.suspend(), resume: () => ac && ac.resume(),
  };
})();
const sfx = AU.play;

/* ============ 刮刮卡 ============ */
const cardEl = $('card'), gridEl = $('grid'), scr = $('scr'), sctx = scr.getContext('2d');
const force = { tera: false, legend: false, type: null };
let card = null;            // 目前這張卡
let lastType = null;
let gw = 0, gh = 0, dpr = 1;

const LEG_ROT = [1007, 1008, 1024];
function nextLegendId() {
  const legends = POKEDEX.filter(p => p.tier === 'legend');
  const slot = LEG_ROT[st.leg % LEG_ROT.length];
  st.leg++;
  if (P[slot]) return slot;
  const others = legends.filter(p => !LEG_ROT.includes(p.id));
  return others.length ? rand(others).id : rand(legends).id;
}

function makeCard(n) {
  const tera = force.tera || n % TERA_EVERY === 0;
  const legend = force.legend || n % LEGEND_EVERY === 0;
  force.tera = force.legend = false;
  let type, legendId = null;
  if (legend) { legendId = nextLegendId(); type = rand(P[legendId].types); }
  else {
    const ks = TYPE_KEYS.filter(k => k !== lastType);
    type = force.type || rand(ks); force.type = null;
  }
  lastType = type;
  const filter = p => p.types.includes(type);
  const boost = tera ? 0.6 : 0;
  const groups = [legendId || C.pick({ filter, boost })];
  if (!legend && Math.random() < 0.18) {
    for (let k = 0; k < 20; k++) { const id = C.pick({ filter, boost }); if (!groups.includes(id)) { groups.push(id); break; } }
  }
  const ids = [];
  groups.forEach(id => ids.push(id, id, id));
  const cnt = {};
  const typePool = TYPES[type].pool.filter(p => p.tier !== 'legend');
  for (let guard = 0; ids.length < 9 && guard < 200; guard++) {
    const id = guard < 120 ? C.pick({ filter }) : rand(typePool).id;
    if (groups.includes(id) || (cnt[id] || 0) >= 2) continue;
    cnt[id] = (cnt[id] || 0) + 1; ids.push(id);
  }
  while (ids.length < 9) {   // 名單太小時的保險：從全部非傳說補
    const id = C.pick({});
    if (!groups.includes(id) && (cnt[id] || 0) < 2) { cnt[id] = (cnt[id] || 0) + 1; ids.push(id); }
  }
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const shiny = {};
  groups.forEach(id => { shiny[id] = tera || Math.random() < SHINY_RATE; });
  return {
    n, type, tera, legend, legendId, groups, shiny,
    cells: ids.map(id => ({ id, shiny: groups.includes(id) && shiny[id], open: false, mask: new Uint8Array(MASK_N * MASK_N), cleared: 0, x: 0, y: 0, w: 0, h: 0 })),
    awarded: {}, pending: 0, state: 'play', passes: {},
  };
}

function buildCard(cd) {
  cardEl.className = 'card' + (cd.tera ? ' tera' : '') + (cd.legend ? ' legend leg-' + (cd.legendId === 1007 || cd.legendId === 1008 ? cd.legendId : 'other') : '');
  setTypeVars(cardEl, cd.type);
  if (cd.tera) cardEl.style.setProperty('--ink', '#3a1052');
  if (cd.legend) cardEl.style.setProperty('--ink', '#fff3c9');
  const T = TYPES[cd.type];
  $('tIcon').textContent = T.i; $('wm').textContent = T.i;
  $('tName').textContent = T.zh + '屬性';
  $('tEn').textContent = T.en;
  $('cardNo').textContent = '#' + cd.n;
  $('banner').textContent = cd.legend ? '★ 傳說卡 LEGEND ★' : cd.tera ? '✦ 太晶卡 TERASTAL ✦' : '';
  $('footTxt').innerHTML = cd.legend ? '刮出三個 <b>' + P[cd.legendId].zh + '</b>！' : cd.tera ? '太晶卡：三個相同<b>必定閃光</b>！' : '三個相同就能得到！';
  $('serial').textContent = 'PALDEA-' + pad3(cd.n % 1000) + '-' + T.en.slice(0, 3);
  gridEl.querySelectorAll('.cell').forEach(e => e.remove());
  cd.cells.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'cell' + (c.shiny ? ' shiny' : '');
    el.innerHTML = `<img src="${C.img(c.id, c.shiny)}" alt="" draggable="false"><span class="nm">${P[c.id].zh}</span>`;
    gridEl.insertBefore(el, scr);
    c.el = el;
  });
  layoutCanvas(true);
  document.body.classList.toggle('teraMode', cd.tera);
  document.body.classList.toggle('legendMode', cd.legend);
  AU.setMode(cd.legend ? 'legend' : cd.tera ? 'tera' : 'normal');
  renderInfo();
}

function layoutCanvas(fresh) {
  if (!card) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  gw = gridEl.clientWidth; gh = gridEl.clientHeight;
  scr.width = Math.round(gw * dpr); scr.height = Math.round(gh * dpr);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  card.cells.forEach(c => { c.x = c.el.offsetLeft; c.y = c.el.offsetTop; c.w = c.el.offsetWidth; c.h = c.el.offsetHeight; });
  drawCoating();
  if (!fresh) {   // 改變大小時：把已刮的格點重新擦掉
    sctx.save(); sctx.globalCompositeOperation = 'destination-out';
    card.cells.forEach(c => {
      if (c.open) return;
      const s = c.w / MASK_N;
      for (let k = 0; k < c.mask.length; k++) if (c.mask[k]) sctx.fillRect(c.x + (k % MASK_N) * s - 1, c.y + Math.floor(k / MASK_N) * s - 1, s + 2, s + 2);
    });
    sctx.restore();
  }
}

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function drawCoating() {
  const g = sctx, style = card.legend ? 'gold' : card.tera ? 'holo' : 'silver';
  g.clearRect(0, 0, gw, gh);
  for (const c of card.cells) {
    if (c.open) continue;
    const { x, y, w, h } = c;
    g.save();
    rr(g, x - 0.5, y - 0.5, w + 1, h + 1, 13); g.clip();
    let gr = g.createLinearGradient(x, y, x + w, y + h);
    if (style === 'silver') [[0, '#c9ced6'], [0.3, '#f4f6f9'], [0.5, '#a9b0bb'], [0.72, '#e8ebf0'], [1, '#9aa2ad']].forEach(s => gr.addColorStop(...s));
    else if (style === 'gold') [[0, '#b8860b'], [0.3, '#ffe9a3'], [0.5, '#d4a017'], [0.72, '#fff3c4'], [1, '#a8740a']].forEach(s => gr.addColorStop(...s));
    else [[0, '#ffc2d6'], [0.2, '#fff0b3'], [0.4, '#c2ffe0'], [0.6, '#b8e4ff'], [0.8, '#dcc2ff'], [1, '#ffc2e8']].forEach(s => gr.addColorStop(...s));
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    // 光澤
    gr = g.createLinearGradient(x, y, x + w * 0.6, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    // 太晶：切面線
    if (style === 'holo') {
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1;
      const cx = x + w / 2, cy = y + h / 2;
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * w, cy + Math.sin(a) * h); g.stroke(); }
    }
    // 顆粒
    for (let k = 0; k < (w * h) / 40; k++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(60,60,80,.15)';
      g.fillRect(x + Math.random() * w, y + Math.random() * h, 1.2, 1.2);
    }
    // 浮雕圖樣
    const cx = x + w / 2, cy = y + h * 0.44, R = w * 0.2;
    for (const [off, col] of [[1.2, 'rgba(255,255,255,.75)'], [-1.2, 'rgba(40,30,60,.28)']]) {
      g.save(); g.translate(off, off); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(2, w * 0.025);
      if (style === 'silver') {
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx - R * 0.35, cy); g.moveTo(cx + R * 0.35, cy); g.lineTo(cx + R, cy); g.stroke();
        g.beginPath(); g.arc(cx, cy, R * 0.35, 0, Math.PI * 2); g.stroke();
      } else if (style === 'holo') {
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 - Math.PI / 2; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
        g.closePath(); g.stroke();
        g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.moveTo(cx - R * 0.87, cy - R * 0.5); g.lineTo(cx + R * 0.87, cy + R * 0.5); g.moveTo(cx + R * 0.87, cy - R * 0.5); g.lineTo(cx - R * 0.87, cy + R * 0.5); g.stroke();
      } else {
        g.beginPath();
        for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr2 = k % 2 ? R * 0.45 : R; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
        g.closePath(); g.stroke();
      }
      g.font = `900 ${Math.round(w * 0.1)}px Montserrat, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(style === 'gold' ? 'LEGEND' : 'SCRATCH', cx, y + h * 0.82);
      g.restore();
    }
    g.restore();
  }
}

/* ---- 刮 ---- */
function cellAt(x, y, pad) { return card.cells.findIndex(c => x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad); }
function scratchSeg(x0, y0, x1, y1) {
  if (!card || card.state !== 'play') return 0;
  const g = sctx, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  g.save(); g.globalCompositeOperation = 'destination-out';
  g.fillStyle = g.strokeStyle = '#000';
  if (len < 0.5) { g.beginPath(); g.arc(x1, y1, BRUSH, 0, Math.PI * 2); g.fill(); }
  else { g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = BRUSH * 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  // 刮痕：邊緣幾條細線＋小缺口
  const ux = len ? dx / len : 1, uy = len ? dy / len : 0, nx = -uy, ny = ux;
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const o = (Math.random() * 2 - 1) * (BRUSH + 5), e = 4 + Math.random() * 8;
    g.globalAlpha = 0.35 + Math.random() * 0.5; g.lineWidth = 0.8 + Math.random() * 1.6;
    g.beginPath(); g.moveTo(x0 + nx * o - ux * e, y0 + ny * o - uy * e); g.lineTo(x1 + nx * o + ux * e, y1 + ny * o + uy * e); g.stroke();
  }
  g.globalAlpha = 1;
  for (let k = 0; k < 2; k++) {
    const a = Math.random() * Math.PI * 2, r = BRUSH + Math.random() * 3;
    g.beginPath(); g.arc(x1 + Math.cos(a) * r, y1 + Math.sin(a) * r, 1 + Math.random() * 2.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  // 覆蓋率格點
  let gained = 0;
  const touched = new Set();
  const steps = Math.max(1, Math.ceil(len / 5));
  for (let sI = 0; sI <= steps; sI++) {
    const px = x0 + dx * sI / steps, py = y0 + dy * sI / steps;
    for (let i = 0; i < card.cells.length; i++) {
      const c = card.cells[i];
      if (c.open || px < c.x - BRUSH || px > c.x + c.w + BRUSH || py < c.y - BRUSH || py > c.y + c.h + BRUSH) continue;
      const s = c.w / MASK_N;
      const i0 = Math.max(0, Math.floor((px - BRUSH - c.x) / s)), i1 = Math.min(MASK_N - 1, Math.floor((px + BRUSH - c.x) / s));
      const j0 = Math.max(0, Math.floor((py - BRUSH - c.y) / s)), j1 = Math.min(MASK_N - 1, Math.floor((py + BRUSH - c.y) / s));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
        const k = j * MASK_N + ii;
        if (c.mask[k]) continue;
        const qx = c.x + (ii + 0.5) * s, qy = c.y + (j + 0.5) * s;
        if ((qx - px) * (qx - px) + (qy - py) * (qy - py) <= BRUSH * BRUSH) { c.mask[k] = 1; c.cleared++; gained++; touched.add(i); }
      }
    }
  }
  if (gained) {
    const r = gridEl.getBoundingClientRect();
    const col = card.legend ? ['#ffe08a', '#d4a017', '#fff6c2'] : card.tera ? ['#ffc2d6', '#c2ffe0', '#b8e4ff', '#dcc2ff', '#fff0b3'] : ['#d9dde3', '#aab1bb', '#f4f6f9'];
    const nP = Math.min(7, 1 + (gained >> 2));
    for (let k = 0; k < nP; k++) flake(r.left + x1 + (Math.random() - 0.5) * BRUSH, r.top + y1 + (Math.random() - 0.5) * BRUSH, ux, uy, rand(col));
    sfx.scratch(Math.min(1, len / 25 + gained / 40));
  }
  touched.forEach(i => { const c = card.cells[i]; if (!c.open && c.cleared / c.mask.length >= REVEAL_AT) revealCell(i); });
  return gained;
}

function revealCell(i, quiet) {
  const c = card.cells[i];
  if (!c || c.open) return;
  c.open = true;
  sctx.clearRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4);
  c.el.classList.add('open');
  const r = c.el.getBoundingClientRect();
  const col = card.legend ? ['#ffe08a', '#d4a017'] : card.tera ? ['#ffc2d6', '#c2ffe0', '#b8e4ff', '#dcc2ff'] : ['#d9dde3', '#aab1bb', '#f4f6f9'];
  for (let k = 0; k < (quiet ? 6 : 16); k++) flake(r.left + Math.random() * r.width, r.top + Math.random() * r.height, (Math.random() - 0.5) * 2, -1, rand(col), 1.6);
  if (c.shiny) for (let k = 0; k < 10; k++) spark(r.left + r.width / 2, r.top + r.height / 2, '#ffd54a');
  if (!quiet) sfx.pop();
  if (card.state === 'play') checkMatches();
}

function checkMatches() {
  const cd = card, byId = {};
  cd.cells.forEach((c, i) => { (byId[c.id] = byId[c.id] || []).push(i); });
  for (const id in byId) {
    const idx = byId[id], open = idx.filter(i => cd.cells[i].open);
    if (cd.awarded[id]) continue;
    if (idx.length === 3 && open.length === 3) award(+id, idx);
    else if (open.length === 2 && !cd.cells[open[0]].el.classList.contains('pair')) {
      open.forEach(i => cd.cells[i].el.classList.add('pair'));
      sfx.pair();
    }
  }
}

function award(id, idx) {
  const cd = card;
  cd.awarded[id] = true;
  idx.forEach(i => { const el = cd.cells[i].el; el.classList.remove('pair'); el.classList.add('win'); });
  const shiny = !!cd.shiny[id];
  const res = C.add(id, shiny);
  const evos = C.evolve();
  stats.caught++; if (shiny) stats.shiny++; stats.evos += evos.length;
  sfx.triple();
  idx.forEach(i => { const r = cd.cells[i].el.getBoundingClientRect(); for (let k = 0; k < 8; k++) spark(r.left + r.width / 2, r.top + r.height / 2, '#ffd54a'); });
  cd.pending++;
  setTimeout(() => {
    cd.pending--;
    enqueue({ kind: 'get', id, shiny, isNew: res.isNew, legend: P[id].tier === 'legend', tera: cd.tera });
    evos.forEach(e => enqueue({ kind: 'evo', id: e.to, from: e.from, isNew: e.isNew }));
    renderAll();
    tryFinish();
  }, 650);
  renderAll();
}

function allAwarded(cd) { return cd.groups.every(id => cd.awarded[id]); }
function tryFinish() {
  const cd = card;
  if (!cd || cd.state !== 'play' || !allAwarded(cd) || cd.pending || popup.showing || popup.queue.length) return;
  cd.state = 'finish';
  // 剩下沒刮的一格一格自動掀開，讓你看整張
  const rest = cd.cells.map((c, i) => i).filter(i => !cd.cells[i].open);
  rest.forEach((i, k) => setTimeout(() => { if (card === cd) { revealCell(i, true); cd.cells[i].el.classList.add('dim'); sfx.tick(); } }, 90 * k));
  setTimeout(() => { if (card === cd) flyOut(); }, 90 * rest.length + 900);
}

function flyOut() {
  card.state = 'exit';
  sfx.whoosh();
  cardEl.classList.add('out');
  setTimeout(dealNext, 480);
}

function dealNext() {
  st.n++; saveSt();
  card = makeCard(st.n);
  cardEl.classList.remove('out');
  cardEl.classList.add('pre');
  buildCard(card);
  void cardEl.offsetWidth;
  cardEl.classList.remove('pre');
  bot.path = []; bot.cell = -1; bot.pos = null;
  if (card.legend) { callout('LEGEND CARD', '傳說卡出現了！', 'legend'); flashScreen(); sfx.legendDeal(); }
  else if (card.tera) { callout('TERASTAL!', '太晶卡：這張必定閃光', 'tera'); flashScreen(); sfx.teraDeal(); burstShards(); }
  else sfx.deal();
}

/* ---- 手指／滑鼠 ---- */
let drag = null;
cardEl.addEventListener('pointerdown', e => {
  AU.init(); e.preventDefault();
  try { cardEl.setPointerCapture(e.pointerId); } catch (er) {}
  const r = scr.getBoundingClientRect();
  drag = { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, r };
  scratchSeg(drag.x, drag.y, drag.x, drag.y);
});
cardEl.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  e.preventDefault();
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) {
    const x = ev.clientX - drag.r.left, y = ev.clientY - drag.r.top;
    scratchSeg(drag.x, drag.y, x, y);
    drag.x = x; drag.y = y;
  }
});
const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
cardEl.addEventListener('pointerup', endDrag);
cardEl.addEventListener('pointercancel', endDrag);
cardEl.addEventListener('lostpointercapture', endDrag);

/* ---- 全部刮開 ---- */
function revealAll() {
  if (!card || card.state !== 'play') return;
  const cd = card;
  const rest = cd.cells.map((c, i) => i).filter(i => !cd.cells[i].open);
  rest.forEach((i, k) => setTimeout(() => { if (card === cd && cd.state === 'play') revealCell(i); }, 110 * k));
}

/* ---- 自動刮：一枚金幣自己慢慢刮 ---- */
const bot = { path: [], pos: null, cell: -1, passes: 0, vis: 0 };
let autoOn = false;
function botPlan() {
  const cd = card;
  const left = cd.cells.map((c, i) => i).filter(i => !cd.cells[i].open);
  if (!left.length) return false;
  let i = bot.cell;
  if (i < 0 || cd.cells[i].open) { i = rand(left); bot.cell = i; bot.passes = 0; }
  const c = cd.cells[i], m = BRUSH * 0.55, vertical = bot.passes % 2 === 1;
  const span = (vertical ? c.w : c.h) - 2 * m, rows = Math.max(3, Math.ceil(span / (BRUSH * 1.25)) + 1);
  const pts = [];
  for (let r = 0; r < rows; r++) {
    const off = m + span * r / (rows - 1) + (Math.random() - 0.5) * 6;
    const a = m + (Math.random() - 0.5) * 6, b = (vertical ? c.h : c.w) - m + (Math.random() - 0.5) * 6;
    const [p, q] = r % 2 ? [b, a] : [a, b];
    if (vertical) { pts.push({ x: c.x + off, y: c.y + p }, { x: c.x + off, y: c.y + q }); }
    else { pts.push({ x: c.x + p, y: c.y + off }, { x: c.x + q, y: c.y + off }); }
  }
  pts[0].lift = true;
  bot.path = pts;
  return true;
}
function botStep(dt) {
  const active = autoOn && card && card.state === 'play' && !popup.showing && !$('dex').classList.contains('show');
  bot.vis = Math.max(0, Math.min(1, bot.vis + (active ? dt * 4 : -dt * 4)));
  if (!active) return;
  if (!bot.path.length) {
    if (bot.cell >= 0 && !card.cells[bot.cell].open) {
      bot.passes++;
      if (bot.passes >= 3) { revealCell(bot.cell); bot.cell = -1; }
    }
    if (!card || card.state !== 'play' || !botPlan()) return;
  }
  if (!bot.pos) bot.pos = { x: gw / 2, y: gh + 20 };
  const cw = card.cells[0].w || 100;
  let dist = cw * 5 * dt;
  while (dist > 0 && bot.path.length) {
    const t = bot.path[0], dx = t.x - bot.pos.x, dy = t.y - bot.pos.y, d = Math.hypot(dx, dy);
    const sp = t.lift ? 2.5 : 1;
    if (d <= dist * sp) {
      if (!t.lift) scratchSeg(bot.pos.x, bot.pos.y, t.x, t.y);
      bot.pos = { x: t.x, y: t.y }; bot.path.shift(); dist -= d / sp;
    } else {
      const nx = bot.pos.x + dx / d * dist * sp, ny = bot.pos.y + dy / d * dist * sp;
      if (!t.lift) scratchSeg(bot.pos.x, bot.pos.y, nx, ny);
      bot.pos = { x: nx, y: ny }; dist = 0;
    }
    if (!card || card.state !== 'play') { bot.path = []; break; }
  }
}

/* ============ 特效（全螢幕畫布） ============ */
const fx = $('fx'), fctx = fx.getContext('2d');
let parts = [];
function fxResize() { const d = Math.min(2, window.devicePixelRatio || 1); fx.width = innerWidth * d; fx.height = innerHeight * d; fctx.setTransform(d, 0, 0, d, 0, 0); }
function flake(x, y, ux, uy, color, power = 1) {
  if (parts.length > 500) return;
  const a = Math.atan2(uy, ux) + (Math.random() - 0.5) * 1.6, v = (80 + Math.random() * 160) * power;
  parts.push({ k: 'f', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 600, life: 0, max: 0.6 + Math.random() * 0.5, s: 2 + Math.random() * 3.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, color });
}
function spark(x, y, color) {
  const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
  parts.push({ k: 's', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120, life: 0, max: 0.5 + Math.random() * 0.6, s: 3 + Math.random() * 4, rot: 0, vr: 0, color });
}
function confetti(n = 60) {
  const cols = ['#ff4b2b', '#ff8a3d', '#ffd54a', '#8a3dff', '#5ec8ff', '#7bf1a8', '#ff7eb3'];
  for (let k = 0; k < n; k++) parts.push({ k: 'c', x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160, g: 60, life: 0, max: 3 + Math.random(), s: 5 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, color: rand(cols) });
}
function burstShards(cx = innerWidth / 2, cy = innerHeight * 0.45, n = 40, gold) {
  const cols = gold ? ['#ffd54a', '#fff6c2', '#ff8a00'] : ['#ffc2d6', '#c2ffe0', '#b8e4ff', '#dcc2ff', '#fff0b3', '#ffffff'];
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 500;
    parts.push({ k: 't', x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 200, life: 0, max: 1 + Math.random() * 0.8, s: 8 + Math.random() * 12, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, color: rand(cols) });
  }
}
function drawParts(dt) {
  fctx.clearRect(0, 0, innerWidth, innerHeight);
  const keep = [];
  for (const p of parts) {
    p.life += dt; if (p.life >= p.max) continue;
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.k === 's' || p.k === 't') { p.vx *= 0.97; p.vy *= 0.97; }
    const a = 1 - p.life / p.max;
    fctx.save(); fctx.globalAlpha = Math.min(1, a * 1.5); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillStyle = p.color;
    if (p.k === 'f') { fctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); fctx.fillStyle = 'rgba(255,255,255,.5)'; fctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.2); }
    else if (p.k === 's') { const s = p.s * a; fctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? s * 0.35 : s; fctx.lineTo(Math.cos(k * Math.PI / 4) * r, Math.sin(k * Math.PI / 4) * r); } fctx.fill(); }
    else if (p.k === 't') { fctx.beginPath(); fctx.moveTo(0, -p.s); fctx.lineTo(p.s * 0.55, 0); fctx.lineTo(0, p.s * 0.8); fctx.lineTo(-p.s * 0.55, 0); fctx.closePath(); fctx.fill(); fctx.strokeStyle = 'rgba(255,255,255,.8)'; fctx.lineWidth = 1; fctx.stroke(); }
    else fctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    fctx.restore();
    keep.push(p);
  }
  parts = keep;
  // 自動刮的金幣
  if (bot.vis > 0 && bot.pos) {
    const r = gridEl.getBoundingClientRect();
    const x = r.left + bot.pos.x, y = r.top + bot.pos.y, R = 15;
    fctx.save(); fctx.globalAlpha = bot.vis; fctx.translate(x + 6, y - 8); fctx.rotate(-0.5);
    fctx.fillStyle = 'rgba(0,0,0,.25)'; fctx.beginPath(); fctx.ellipse(3, 4, R, R * 0.9, 0, 0, Math.PI * 2); fctx.fill();
    const gr = fctx.createLinearGradient(-R, -R, R, R); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#ffc93a'); gr.addColorStop(1, '#c48a00');
    fctx.fillStyle = gr; fctx.beginPath(); fctx.ellipse(0, 0, R, R * 0.9, 0, 0, Math.PI * 2); fctx.fill();
    fctx.strokeStyle = '#8a5a00'; fctx.lineWidth = 2; fctx.stroke();
    fctx.beginPath(); fctx.arc(0, 0, R * 0.45, 0, Math.PI * 2); fctx.moveTo(-R * 0.8, 0); fctx.lineTo(-R * 0.45, 0); fctx.moveTo(R * 0.45, 0); fctx.lineTo(R * 0.8, 0); fctx.stroke();
    fctx.restore();
  }
}
let lastT = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  try { botStep(dt); } catch (e) { console.warn(e); bot.path = []; }
  drawParts(dt);
  requestAnimationFrame(loop);
}

function callout(big, small, cls) {
  const el = $('callout');
  el.className = 'callout ' + (cls || '');
  el.innerHTML = `${big}<small>${small}</small>`;
  void el.offsetWidth; el.classList.add('go');
}
function flashScreen() { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }

/* ============ 揭曉 ============ */
const popup = { queue: [], showing: false, timer: 0, t0: 0 };
function enqueue(it) { popup.queue.push(it); if (!popup.showing) nextPopup(); }
function nextPopup() {
  const it = popup.queue.shift();
  if (!it) { popup.showing = false; tryFinish(); return; }
  popup.showing = true; popup.t0 = performance.now();
  const rv = $('rv'), p = P[it.id], shiny = !!it.shiny;
  rv.className = 'rv' + (shiny ? ' shiny' : '') + (it.legend ? ' legend' : '') + (it.kind === 'evo' ? ' evo' : '');
  setTypeVars($('rvCard'), p.types[0]);
  $('rvImg').src = C.img(it.id, shiny);
  $('rvTag').textContent = it.kind === 'evo' ? 'EVOLUTION!' : it.legend ? 'LEGEND GET!' : shiny ? 'SHINY GET!' : 'GET!';
  if (it.kind === 'evo') $('evoFrom').src = C.img(it.from, false);
  $('rvNo').textContent = '#' + pad3(C.no(it.id));
  $('rvName').textContent = it.kind === 'evo' ? `${P[it.from].zh} 進化成 ${p.zh}！` : p.zh;
  $('rvName').style.fontSize = it.kind === 'evo' ? '19px' : '';
  $('rvMeta').innerHTML = p.types.map(typeChip).join('') + `<span class="chipT chipTier">${C.tierName(it.id)}</span>` + (it.isNew ? '<span class="chipT chipNew">NEW</span>' : '') + (shiny ? '<span class="chipT chipS">✦ 閃光</span>' : '');
  requestAnimationFrame(() => rv.classList.add('show'));
  let dur = 2600;
  if (it.legend) { sfx.legend(); flashScreen(); burstShards(innerWidth / 2, innerHeight / 2, 70, true); confetti(90); dur = 5200; }
  else if (it.kind === 'evo') { sfx.evolve(); dur = 2800; for (let k = 0; k < 30; k++) spark(innerWidth / 2, innerHeight / 2, '#9ef0ff'); }
  else {
    if (shiny) { sfx.sparkle(); burstShards(innerWidth / 2, innerHeight / 2, 40); dur = 3400; }
    if (it.isNew) { sfx.newOne(); confetti(40); }
  }
  popup.timer = setTimeout(closePopup, dur);
}
function closePopup() {
  if (!popup.showing) return;
  clearTimeout(popup.timer);
  $('rv').classList.remove('show');
  setTimeout(nextPopup, 260);
}
$('rv').addEventListener('pointerdown', e => { e.preventDefault(); if (performance.now() - popup.t0 > 400) closePopup(); });

/* ============ 畫面：最近、資訊、屬性、圖鑑 ============ */
const stats = { caught: 0, shiny: 0, evos: 0 };
let lastRecentTop = null;
function renderRecent() {
  const list = C.recent();
  const key = list.length ? list[0].id + ':' + list.length : '';
  const html = list.length ? list.map((r, i) => `<div class="rc${r.s ? ' s' : ''}${i === 0 && key !== lastRecentTop ? ' new' : ''}" title="${P[r.id].zh}"><img src="${C.img(r.id, r.s)}" alt=""><span>#${pad3(C.no(r.id))}</span></div>`).join('') : '<div class="empty">還沒有，刮一張看看！</div>';
  lastRecentTop = key;
  $('recent').innerHTML = html; $('recentM').innerHTML = html;
  $('recentCnt').textContent = $('recentCnt2').textContent = list.length ? list.length + ' 隻' : '';
}
function typeProgress(k) { const pool = TYPES[k].pool; return [pool.filter(p => C.has(p.id)).length, pool.length]; }
function renderInfo() {
  if (!card) return;
  const T = TYPES[card.type], [got, tot] = typeProgress(card.type);
  const nt = TERA_EVERY - (card.n % TERA_EVERY), nl = LEGEND_EVERY - (card.n % LEGEND_EVERY);
  $('cardInfo').innerHTML = `
    <div class="row"><span>第幾張</span><b>#${card.n}</b></div>
    <div class="row"><span>屬性</span><span>${typeChip(card.type)}</span></div>
    <div class="row"><span>${T.zh}屬性收集</span><b>${got}/${tot}</b></div>
    <div class="bar"><i style="width:${(got / tot * 100).toFixed(1)}%"></i></div>
    <div class="row"><span>💎 下一張太晶卡</span><b>${nt === TERA_EVERY ? '就是這張！' : '還有 ' + nt + ' 張'}</b></div>
    <div class="row"><span>👑 下一張傳說卡</span><b>${nl === LEGEND_EVERY ? '就是這張！' : '還有 ' + nl + ' 張'}</b></div>`;
  $('nextInfo').innerHTML = `<span>第 <b>${card.n}</b> 張</span><span>💎 太晶卡 ${nt === TERA_EVERY ? '<b>就是這張</b>' : '還有 <b>' + nt + '</b> 張'}</span><span>👑 傳說卡 ${nl === LEGEND_EVERY ? '<b>就是這張</b>' : '還有 <b>' + nl + '</b> 張'}</span>`;
  $('typeGrid').querySelectorAll('.tg').forEach(el => el.classList.toggle('cur', el.dataset.t === card.type));
}
function renderTypes() {
  $('typeGrid').innerHTML = TYPE_KEYS.map(k => { const [g, t] = typeProgress(k); return `<div class="tg${g === t ? ' done' : ''}${card && card.type === k ? ' cur' : ''}" data-t="${k}" style="--tc:${TYPES[k].c};--tk:${TYPES[k].ink}">${TYPES[k].i} ${TYPES[k].zh}<span>${g}/${t}</span></div>`; }).join('');
}
function renderDexInfo() {
  const n = C.count(), s = C.shinyCount(), leg = POKEDEX.filter(p => p.tier === 'legend');
  $('dexPill').innerHTML = `${n}/${DEX_TOTAL}${s ? `<i>✦${s}</i>` : ''}`;
  $('dexInfo').innerHTML = `
    <div class="row"><span>已收集</span><b>${n} / ${DEX_TOTAL}</b></div>
    <div class="bar"><i style="width:${(n / DEX_TOTAL * 100).toFixed(1)}%"></i></div>
    <div class="row"><span>✦ 閃光</span><b>${s}</b></div>
    <div class="row"><span>👑 傳說</span><b>${leg.filter(p => C.has(p.id)).length} / ${leg.length}</b></div>
    <button class="bigbtn" id="btnDex2" style="margin-top:4px;height:42px">📖 打開圖鑑</button>`;
  $('btnDex2').onclick = () => openDex();
}
function renderAll() { renderRecent(); renderTypes(); renderInfo(); renderDexInfo(); if ($('dex').classList.contains('show')) renderDex(); }

const dexSt = { page: 0, type: 'all', showS: {} };
const PER_PAGE = 40;
const DEX_SORTED = POKEDEX.slice().sort((a, b) => C.no(a.id) - C.no(b.id));
function openDex(type) {
  AU.init(); sfx.click();
  if (type) { dexSt.type = type; dexSt.page = 0; }
  $('dex').classList.add('show'); renderDex();
}
function renderDex() {
  const list = dexSt.type === 'all' ? DEX_SORTED : DEX_SORTED.filter(p => p.types.includes(dexSt.type));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  dexSt.page = Math.min(dexSt.page, pages - 1);
  const slice = list.slice(dexSt.page * PER_PAGE, (dexSt.page + 1) * PER_PAGE);
  const got = list.filter(p => C.has(p.id)).length;
  $('dexStat').textContent = `${got} / ${list.length}　✦ ${list.filter(p => C.store.dex[p.id] && C.store.dex[p.id].gotS).length}`;
  $('dexTypes').innerHTML = `<button data-t="all" class="${dexSt.type === 'all' ? 'on' : ''}">全部</button>` + TYPE_KEYS.map(k => `<button data-t="${k}" class="${dexSt.type === k ? 'on' : ''}" style="--tc:${TYPES[k].c};--tk:${TYPES[k].ink}">${TYPES[k].i} ${TYPES[k].zh}</button>`).join('');
  $('dexGrid').innerHTML = slice.map(p => {
    const e = C.store.dex[p.id], has = C.has(p.id), hasS = !!(e && e.gotS), showS = hasS && dexSt.showS[p.id] !== false;
    const cnt = e ? e.n + e.s : 0;
    return `<div class="de${has ? ' got' : ''}${p.tier === 'legend' ? ' legend' : ''}${hasS ? ' hasS' : ''}${showS ? ' showS' : ''}" data-id="${p.id}">
      <span class="no">#${pad3(C.no(p.id))}</span>${cnt > 1 ? `<span class="ct">×${cnt}</span>` : ''}
      <img src="${C.img(p.id, showS)}" alt="" loading="lazy" class="${has ? '' : 'sil'}"><span class="nm">${has ? p.zh : '？？？'}</span></div>`;
  }).join('');
  $('pgInfo').textContent = `${dexSt.page + 1} / ${pages}`;
  $('pgPrev').disabled = dexSt.page <= 0; $('pgNext').disabled = dexSt.page >= pages - 1;
}
$('dexTypes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; dexSt.type = b.dataset.t; dexSt.page = 0; sfx.click(); renderDex(); });
$('dexGrid').addEventListener('click', e => {
  const d = e.target.closest('.de.hasS'); if (!d) return;
  const id = +d.dataset.id, cur = d.classList.contains('showS');
  dexSt.showS[id] = !cur; sfx.sparkle(); renderDex();
});
$('pgPrev').onclick = () => { dexSt.page--; sfx.click(); renderDex(); $('dexGrid').scrollTop = 0; };
$('pgNext').onclick = () => { dexSt.page++; sfx.click(); renderDex(); $('dexGrid').scrollTop = 0; };
$('dexClose').onclick = () => { sfx.click(); $('dex').classList.remove('show'); };
$('dex').addEventListener('click', e => { if (e.target === $('dex')) $('dex').classList.remove('show'); });
$('typeGrid').addEventListener('click', e => { const t = e.target.closest('.tg'); if (t) openDex(t.dataset.t); });

/* ============ 按鈕 ============ */
$('btnHome').onclick = () => { location.href = '../'; };
$('btnDex').onclick = () => openDex();
$('btnAll').onclick = () => { AU.init(); sfx.click(); revealAll(); };
$('autoChk').addEventListener('change', e => { AU.init(); autoOn = e.target.checked; sfx.click(); if (!autoOn) { bot.path = []; } });
function syncSound() { $('btnMusic').classList.toggle('off', !st.music); $('btnSfx').classList.toggle('off', !st.sfx); $('btnSfx').textContent = st.sfx ? '🔊' : '🔇'; }
$('btnMusic').onclick = () => { AU.init(); st.music = !st.music; AU.setMusic(st.music); saveSt(); syncSound(); };
$('btnSfx').onclick = () => { AU.init(); st.sfx = !st.sfx; AU.setSfx(st.sfx); saveSt(); syncSound(); };
document.addEventListener('pointerdown', () => AU.init(), { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) AU.suspend(); else AU.resume(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('dex').classList.contains('show')) $('dex').classList.remove('show'); else closePopup(); }
  if ((e.key === ' ' || e.key === 'Enter') && popup.showing) { e.preventDefault(); closePopup(); }
});
let rzT = 0;
window.addEventListener('resize', () => { fxResize(); clearTimeout(rzT); rzT = setTimeout(() => layoutCanvas(false), 120); });

/* ============ 測試用（console） ============ */
window.PD = {
  C, st, stats,
  get card() { return card; },
  tera() { force.tera = true; },              // 下一張變太晶卡
  legend() { force.legend = true; },          // 下一張變傳說卡
  type(k) { force.type = k; },
  revealAll,
  make: n => makeCard(n),
  auto(on = true) { autoOn = on; $('autoChk').checked = on; },
  skip() { if (card && card.state === 'play') { card.state = 'exit'; dealNext(); } },   // 直接換下一張（測試用）
  check() {   // 驗證目前這張卡：至少一組三連、其他不超過兩個
    const cnt = {}; card.cells.forEach(c => { cnt[c.id] = (cnt[c.id] || 0) + 1; });
    const triples = Object.keys(cnt).filter(k => cnt[k] === 3).map(Number);
    return { ok: triples.length >= 1 && Object.values(cnt).every(v => v <= 3) && triples.every(id => card.groups.includes(id)), triples, groups: card.groups, type: card.type, typesOk: card.cells.every(c => P[c.id].types.includes(card.type)) };
  },
};

/* ============ 開始 ============ */
fxResize();
syncSound();
renderAll();
st.n++; saveSt();
card = makeCard(st.n);
buildCard(card);
renderAll();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (card && card.state === 'play') layoutCanvas(false); });
requestAnimationFrame(loop);
