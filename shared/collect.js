// 共用圖鑑存檔工具：每台機台都用這個記「抓到了誰」，大廳才能合併成一本全國圖鑑。
// 用法（在 data.js 之後載入）：
//   const C = Collect.create({ key: 'sinnohPachinko', pokedex: POKEDEX, imgBase: '../all/assets/' });
//   C.add(id, shiny) → { isNew, entry }      抓到一隻（id 是全國編號）
//   C.evolve()       → [{ from, to, isNew }] 同種 3 隻自動進化（可連鎖），回傳進化清單
//   C.has(id) / C.count() / C.shinyCount() / C.entry(id)
//   C.img(id, shiny) → 圖片路徑；Collect.pad3(n)
//   C.pick({ pool, boost }) → 依捕獲率抽一隻（boost 越大越容易出稀有）
//   C.save() 會存到 localStorage；資料格式固定是 { dex: { [id]: { n, s, got, gotS } }, recent: [{ id, s }] }
(function () {
  'use strict';
  const TIER_RANK = { common: 0, rare: 1, srare: 2, legend: 3 };
  const TIER_NAME = { common: '普通', rare: '稀有', srare: '超稀有', legend: '傳說' };
  const pad3 = n => String(n).padStart(3, '0');

  function prepare(pokedex) {
    const P = {};
    pokedex.forEach(p => { P[p.id] = p; });
    pokedex.forEach(p => { if (p.evoFrom != null && !P[p.evoFrom]) p.evoFrom = null; });   // 前置型不在這台名單裡就當起始型
    const stageOf = id => (P[id].evoFrom ? 1 + stageOf(P[id].evoFrom) : 0);
    const CHILDREN = {};
    pokedex.forEach(p => {
      p.stage = stageOf(p.id);
      p.tier = (p.legendary || p.mythical) ? 'legend'
        : (p.capture <= 25 || p.bst >= 500) ? 'srare'
        : (p.capture <= 75 || (p.stage >= 1 && p.bst >= 450)) ? 'rare' : 'common';
      if (p.evoFrom) (CHILDREN[p.evoFrom] = CHILDREN[p.evoFrom] || []).push(p.id);
    });
    return { P, CHILDREN };
  }

  function create({ key, pokedex, imgBase = 'assets/' }) {
    const DEX_KEY = key + '.dex';
    const { P, CHILDREN } = prepare(pokedex);
    let store = { dex: {}, recent: [] };
    try { const s = JSON.parse(localStorage.getItem(DEX_KEY)); if (s && s.dex) store = { dex: s.dex, recent: s.recent || [] }; } catch (e) {}
    if (/[?&]reset\b/.test(location.search)) { store = { dex: {}, recent: [] }; try { localStorage.removeItem(DEX_KEY); } catch (e) {} }

    const entry = id => (store.dex[id] = store.dex[id] || { n: 0, s: 0, got: false, gotS: false });
    const has = id => !!(store.dex[id] && store.dex[id].got);
    const listed = () => pokedex.filter(p => has(p.id));
    const save = () => { try { localStorage.setItem(DEX_KEY, JSON.stringify(store)); } catch (e) {} };

    function add(id, shiny = false) {
      const e = entry(id), isNew = !e.got;
      e.got = true;
      if (shiny) { e.s++; e.gotS = true; } else e.n++;
      store.recent.unshift({ id, s: !!shiny }); store.recent = store.recent.slice(0, 24);
      save();
      return { isNew, entry: e, p: P[id] };
    }
    function evolve() {
      const evos = [];
      for (let changed = true; changed;) {
        changed = false;
        for (const p of pokedex) {
          const e = store.dex[p.id];
          if (e && e.n >= 3 && CHILDREN[p.id]) {
            const kids = CHILDREN[p.id], to = kids[Math.floor(Math.random() * kids.length)];
            e.n -= 3;
            const t = entry(to), isNew = !t.got;
            t.got = true; t.n++;
            evos.push({ from: p.id, to, isNew });
            store.recent.unshift({ id: to, s: false });
            changed = true;
          }
        }
      }
      if (evos.length) { store.recent = store.recent.slice(0, 24); save(); }
      return evos;
    }
    // 依捕獲率加權抽一隻；boost 0 = 一般（像精靈球）、1 = 像高級球、2 = 幾乎平均
    const weights = {};
    function pick({ pool = pokedex.filter(p => p.tier !== 'legend'), boost = 0, filter } = {}) {
      let list = filter ? pool.filter(filter) : pool;
      if (!list.length) list = pool;
      const k = Math.max(0, 1 - boost * 0.4), stageMult = [1, 0.3 + boost * 0.3, 0.1 + boost * 0.3];
      const cum = []; let sum = 0;
      for (const p of list) { sum += Math.pow(p.capture, k) * (stageMult[Math.min(2, p.stage)] || 1); cum.push(sum); }
      const r = Math.random() * sum;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
      return list[lo].id;
    }
    return {
      P, CHILDREN, pokedex, store, DEX_KEY,
      entry, has, add, evolve, save, pick,
      count: () => listed().length,
      shinyCount: () => pokedex.filter(p => store.dex[p.id] && store.dex[p.id].gotS).length,
      recent: () => store.recent,
      img: (id, shiny) => `${imgBase}${shiny ? 's' : 'n'}${id}.webp`,
      tierName: id => TIER_NAME[P[id].tier],
      tierRank: id => TIER_RANK[P[id].tier],
      no: id => (P[id].no != null ? P[id].no : id),
    };
  }

  // 大廳用：把所有機台的圖鑑合併成一本（以全國編號為準）
  function union() {
    const dex = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/Pachinko\.dex$/.test(k)) continue;
      try {
        const s = JSON.parse(localStorage.getItem(k));
        if (!s || !s.dex) continue;
        for (const id in s.dex) {
          const e = s.dex[id], t = dex[id] = dex[id] || { got: false, gotS: false };
          if (e.got) t.got = true;
          if (e.gotS) t.gotS = true;
        }
      } catch (e) {}
    }
    return dex;
  }

  window.Collect = { create, prepare, union, pad3, TIER_NAME, TIER_RANK };
})();
