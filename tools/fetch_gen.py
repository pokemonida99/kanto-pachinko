#!/usr/bin/env python3
"""抓某一世代的寶可夢資料與圖片（來源：PokeAPI），輸出跟 kanto/ 一樣格式的 data.js 與 assets/。

用法：python3 tools/fetch_gen.py johto 152 251
      python3 tools/fetch_gen.py hoenn 252 386
"""
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


def main():
    name, lo, hi = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', name)
    assets = os.path.join(root, 'assets')
    os.makedirs(assets, exist_ok=True)
    ids = list(range(lo, hi + 1))

    with ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(species_row, ids))
        print(f'{name}: 資料 {len(rows)} 隻', flush=True)
        jobs = [(pid, sh) for pid in ids for sh in (False, True)]
        list(ex.map(lambda j: fetch_art(j[0], j[1], assets), jobs))
    missing = [r['zh'] for r in rows if r['zh'] == r['en']]
    if missing:
        print('沒有中文名：', missing)
    with open(os.path.join(root, 'data.js'), 'w', encoding='utf-8') as f:
        f.write(f'// {lo}–{hi} 寶可夢資料（來源：PokeAPI）\n')
        f.write('const POKEDEX = ' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{name}: 完成，圖片 {len(os.listdir(assets))} 張', flush=True)


if __name__ == '__main__':
    main()
