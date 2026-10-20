# 寶可夢彈珠研究所

寶可夢主題的柏青哥／彈珠台網頁小遊戲。一個入口大廳，三台玩法與介面都不同的機台。

**線上玩：** https://pokemonida99.github.io/kanto-pachinko/

| 機台 | 網址 | 圖鑑 | 特色 |
|---|---|---|---|
| 無印・關都 | `kanto/` | 關都圖鑑 151 隻 | 點台面發射、三格拉霸、皮卡丘 RUSH，拉霸會送彈珠 |
| 金・銀・城都 | `johto/` | 城都圖鑑 251 隻（一代全部＋二代新 100） | 拉桿蓄力發射、大輪盤送珠與蛋、日夜輪替、金珠／銀珠 |
| 紅・藍寶石・豐緣 | `hoenn/` | 豐緣圖鑑 202 隻（舊角 67＋三代新 135） | 彈珠機風、底部兩側翻板、天氣輪替、R·S·E 天空之柱、紅／藍／綠寶石珠 |

每台的玩法細節看各資料夾裡的 README。編號用該世代的地區圖鑑編號，全國編號留給之後的 ALL 版。

## 共同規則
- 一局 100 顆彈珠；落進入口得到精靈球（偶爾超級球、高級球、大師球）
- 兩側落空會幫傳說寶可夢充能，滿了必定收服
- 每 30 秒開箱一次，同種集滿 3 隻自動進化
- 圖鑑存在瀏覽器裡，三台各自獨立；大廳會顯示各台進度
- 搖台搖太兇會 TILT 鎖台

## 結構
```
index.html      入口大廳（皮卡丘打招呼、選機台）
shared/         大廳用的皮卡丘圖
kanto/ johto/ hoenn/   各台：index.html、game.js、data.js、assets/
tools/fetch_gen.py     從 PokeAPI 抓某個地區圖鑑的資料與圖：python3 tools/fetch_gen.py johto dex original-johto
計畫.md         製作計畫與各台規格
```

## 技術
純 HTML／Canvas／WebAudio，無需建置。本機測試請用任一靜態伺服器（例如 `python3 -m http.server 8780`）開根目錄。背景音樂與音效為程式即時合成的原創曲。各台網址加 `?reset` 可清除該台存檔。

## 素材來源
寶可夢名稱與數值資料來自 [PokeAPI](https://pokeapi.co/)，圖片來自 [PokeAPI/sprites](https://github.com/PokeAPI/sprites)。
Pokémon 及相關名稱、圖像之權利屬 Nintendo / Creatures Inc. / GAME FREAK inc.，本專案為非營利的粉絲測試作品。
