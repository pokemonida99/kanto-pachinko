# 關都彈珠研究所（無印版・測試版）

寶可夢主題的柏青哥／彈珠台網頁小遊戲，收錄關都地區 151 隻寶可夢。

**線上玩：** https://pokemonida99.github.io/kanto-pachinko/

## 玩法
- 一局 100 顆彈珠，點棋盤就在那個位置放一顆，按住可連發
- 左右搖台能推動台上的彈珠，搖太兇會 TILT 鎖台
- 落進會移動的入口得到精靈球（偶爾是超級球、高級球、大師球）
- 閃電碰滿 20 次 +5 顆彈珠；精靈球碰滿 40 次送超級球
- 中心每 10 秒亮 3 秒，這時命中必得閃光寶可夢
- 兩側落空會幫傳說寶可夢充能，滿了必定收服
- 每 30 秒開箱一次，同種集滿 3 隻自動進化，圖鑑存在瀏覽器裡

鍵盤：`←` `→` 移動、`Space` 放珠、`Z` `X` 搖台、`P` 暫停、`B` 開箱、`D` 圖鑑

## 技術
純 HTML／Canvas／WebAudio，無需建置，直接打開 `index.html` 即可。背景音樂與音效為程式即時合成的原創曲。網址加 `?reset` 可清除存檔。

## 素材來源
寶可夢名稱與數值資料來自 [PokeAPI](https://pokeapi.co/)，圖片來自 [PokeAPI/sprites](https://github.com/PokeAPI/sprites)。
Pokémon 及相關名稱、圖像之權利屬 Nintendo / Creatures Inc. / GAME FREAK inc.，本專案為非營利的粉絲測試作品。
