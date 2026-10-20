#!/usr/bin/env python3
"""抓某一世代的寶可夢資料與圖片（來源：PokeAPI），輸出跟 kanto/ 一樣格式的 data.js 與 assets/。

用法：python3 tools/fetch_gen.py johto 152 251            （全國編號範圍）
      python3 tools/fetch_gen.py johto dex original-johto  （地區圖鑑：含舊角，編號 no 是地區編號）
      python3 tools/fetch_gen.py hoenn dex hoenn
      python3 tools/fetch_gen.py kanto dex kanto
地區圖鑑模式下每筆多一個 no（地區編號），id 仍是全國編號（圖檔與 evoFrom 都用 id）。
圖片先從其他世代資料夾複製（同一隻圖一樣），沒有才下載。
"""
import glob
import shutil
import io
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

API = 'https://pokeapi.co/api/v2'
ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork'
SIZE = 160


def get(url, binary=False, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'kanto-pachinko-fetch/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:  # noqa
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def species_row(pid):
    pk = get(f'{API}/pokemon/{pid}')
    sp = get(f'{API}/pokemon-species/{pid}')
    zh = next((n['name'] for n in sp['names'] if n['language']['name'] == 'zh-hant'), None)
    en = next((n['name'] for n in sp['names'] if n['language']['name'] == 'en'), pk['name'])
    evo = sp['evolves_from_species']
    evo_id = int(evo['url'].rstrip('/').split('/')[-1]) if evo else None
    return {
        'id': pid,
        'zh': zh or en,
        'en': en,
        'types': [t['type']['name'] for t in sorted(pk['types'], key=lambda t: t['slot'])],
        'capture': sp['capture_rate'],
        'legendary': sp['is_legendary'],
        'mythical': sp['is_mythical'],
        'evoFrom': evo_id,
        'bst': sum(s['base_stat'] for s in pk['stats']),
    }


def fetch_art(pid, shiny, out_dir):
    out = os.path.join(out_dir, f"{'s' if shiny else 'n'}{pid}.webp")
    if os.path.exists(out):
        return
    url = f"{ART}/{'shiny/' if shiny else ''}{pid}.png"
    png = get(url, binary=True)
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2))
    canvas.save(out, 'WEBP', quality=82, method=6)


def copy_existing(pid, shiny, assets, base):
    """同一隻圖在別的世代資料夾已經有的話直接複製。"""
    fn = f"{'s' if shiny else 'n'}{pid}.webp"
    out = os.path.join(assets, fn)
    if os.path.exists(out):
        return True
    for src in glob.glob(os.path.join(base, '*', 'assets', fn)):
        shutil.copyfile(src, out)
        return True
    return False


def main():
    name = sys.argv[1]
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    root = os.path.join(base, name)
    assets = os.path.join(root, 'assets')
    os.makedirs(assets, exist_ok=True)
    if sys.argv[2] == 'dex':
        dex = get(f'{API}/pokedex/{sys.argv[3]}')
        entries = [(e['entry_number'], int(e['pokemon_species']['url'].rstrip('/').split('/')[-1])) for e in dex['pokemon_entries']]
        header = f"{sys.argv[3]} 地區圖鑑 {len(entries)} 隻（no＝地區編號，id＝全國編號）"
    else:
        lo, hi = int(sys.argv[2]), int(sys.argv[3])
        entries = [(None, pid) for pid in range(lo, hi + 1)]
        header = f'{lo}–{hi}'
    ids = [pid for _, pid in entries]

    with ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(species_row, ids))
        for (no, _), r in zip(entries, rows):
            if no is not None:
                r['no'] = no
        print(f'{name}: 資料 {len(rows)} 隻', flush=True)
        jobs = [(pid, sh) for pid in ids for sh in (False, True) if not copy_existing(pid, sh, assets, base)]
        print(f'{name}: 要下載 {len(jobs)} 張', flush=True)
        list(ex.map(lambda j: fetch_art(j[0], j[1], assets), jobs))
    missing = [r['zh'] for r in rows if r['zh'] == r['en']]
    if missing:
        print('沒有中文名：', missing)
    with open(os.path.join(root, 'data.js'), 'w', encoding='utf-8') as f:
        f.write(f'// {header} 寶可夢資料（來源：PokeAPI）\n')
        f.write('const POKEDEX = ' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{name}: 完成，圖片 {len(os.listdir(assets))} 張', flush=True)


if __name__ == '__main__':
    main()
