# 画像／レイアウトのキャッシュ機構

カテゴリ切替を「一瞬」にするため、**全カテゴリのキャンバスを常時 DOM に持ち、非選択は CSS で隠すだけ**という方針を取っている。
キャッシュ層は補助で、レイアウト本体（`CanvasItem[]`）と画像を多層キャッシュして起動時の取得を高速化する。

実装は以下の 2 ファイルに集約：
- [lib/canvasCache.ts](../lib/canvasCache.ts) — レイアウト／画像のキャッシュ層
- [app/page.tsx](../app/page.tsx) — 全カテゴリ常時マウント方式の描画層

## 描画モデル：全カテゴリ常時マウント

[app/page.tsx](../app/page.tsx)

- `layouts: Record<categoryId, CanvasItem[]>` に**全カテゴリ分のレイアウトを格納**。
- レンダーは `categories.map` で全カテゴリぶんの `<TransformWrapper>` ＋ `<img>` を出力し、非選択カテゴリの親 `<div>` を `visibility: hidden` ＋ `pointer-events: none` で隠す（[app/page.tsx:124-132](../app/page.tsx#L124-L132)）。
- カテゴリ切替時は state を変えるだけ。`<img>` はマウントされたままなので**ブラウザが既にデコード済み**＝1 フレームで切り替わる。これが「2回目以降一瞬」の本体。
- 各 `TransformWrapper` の ref は `transformRefs: Map<categoryId, ref>` に保持（[app/page.tsx:21](../app/page.tsx#L21), [:135-138](../app/page.tsx#L135-L138)）。`selectedCategory` 変更時に該当 ref の `setTransform(0, 0, initialScale, 0)` を呼んでズーム位置を初期化する（[app/page.tsx:56-69](../app/page.tsx#L56-L69)）。ref がまだ存在しない場合は `requestAnimationFrame` でマウントを待つ。
- 取得順は **選択中 → その他**。`fetchCanvasLayoutCached` がメモリ／localStorage ヒット時に同期的に `onData` を呼ぶので、再訪問時は選択中カテゴリが即 DOM に乗る（[app/page.tsx:39-52](../app/page.tsx#L39-L52)）。
- 表示ガード：選択中カテゴリの layout がまだ無いときだけ "Loading…" を表示（[app/page.tsx:115-117](../app/page.tsx#L115-L117)）。それ以外のカテゴリの取得完了は描画には影響しない（バックグラウンドで `layouts` に追加されるだけ）。

トレードオフ：メモリ消費は「全カテゴリの画像合計」になる。現状のポートフォリオ規模なら問題ないが、カテゴリ数／画像数が大きく増えたら「現在＋直前 N」の LRU に絞ることを検討。

## キャッシュ 3 層構造（[lib/canvasCache.ts](../lib/canvasCache.ts)）

| 層 | 実体 | 寿命 | 目的 |
|---|---|---|---|
| メモリキャッシュ | `memoryCache: Map<categoryId, CanvasItem[]>` | タブ生存中 | 同一セッション内のカテゴリ切替を即時反映 |
| 永続キャッシュ | `localStorage` キー `canvas_layout_v1_<categoryId>` | ブラウザ削除まで | 再訪問時の初回描画を高速化 |
| 画像キャッシュ | `imageCache: Set<photoUrl>` ＋ `new Image()` プリロード | タブ生存中（ブラウザのHTTPキャッシュにも乗る） | DOM `<img>` マウント前に HTTP キャッシュへ載せる |

## 取得フロー（`fetchCanvasLayoutCached`）

[lib/canvasCache.ts:74](../lib/canvasCache.ts#L74)

1. **メモリにあれば即返す** → `onData` 呼び出し、`loading=false`、ネットワーク無し。
2. **localStorage にあれば** → メモリへ昇格、画像をプリロード、`onData` を一旦コール（`loading=false`）。
3. その後 **必ず Firestore (`getCanvasLayout`) を取りに行き**、結果でメモリ／localStorage を上書き、画像をプリロード。
   - **取得結果が直前のキャッシュと同一（JSON文字列比較）なら `onData` をスキップ**して無駄な再レンダーを回避。
   - 異なる場合のみ `onData` を再コールして差分を反映。

stale-while-revalidate 相当：キャッシュがあれば先に表示し、裏で最新化して必要時のみ差し替える。

## 画像のプリロード（`preloadImages`）

[lib/canvasCache.ts:28](../lib/canvasCache.ts#L28)

- `item.type === "photo"` かつ `photoUrl` を持つ要素について、未登録なら `imageCache` Set に URL を登録し、`new Image(); img.src = url` でブラウザにダウンロードさせる。
- DOM `<img>` がマウントされる前にブラウザの HTTP キャッシュへ載せておく狙い。
- なお、現在は **DOM 側で `<img>` が常時マウントされている**ので、レイアウト到着 → DOM `<img>` マウントの段差は実質 1 フレーム。`new Image()` プリロードは「初回ロード時にレイアウトと画像のダウンロードを並走させる」目的が主。
- `Set` は URL 文字列のみ保持し、`Image` オブジェクトは保持しない（ブラウザの HTTP キャッシュ任せ）。

## 無効化（`invalidateCache`）

[lib/canvasCache.ts:60](../lib/canvasCache.ts#L60)

- メモリと localStorage の両方から該当 `categoryId` を削除。
- Admin 画面の保存後に呼ばれる（[app/admin/canvas/page.tsx:217](../app/admin/canvas/page.tsx#L217)）。画像 Set はクリアしない＝同 URL なら次回もプリロード済み扱い。

## バックグラウンドプリフェッチ（`prefetchCanvasLayout`）

[lib/canvasCache.ts:43](../lib/canvasCache.ts#L43)

- `fetchCanvasLayoutCached` のコールバック無し版。state 更新を起こさず純粋にキャッシュを温める。
- **現状のトップページからは呼んでいない**。`fetchCanvasLayoutCached` を全カテゴリに対して並列発火することで同等の効果（＋ DOM への即反映）を得ているため。
- Admin 等から「state を動かさずにキャッシュだけ温めたい」ケース向けに残してある。

## 利用箇所

- 一般ページ: [app/page.tsx:39-52](../app/page.tsx#L39-L52) — 全カテゴリに対し `fetchCanvasLayoutCached` を選択中優先で発火。
- 管理画面: [app/admin/canvas/page.tsx:73](../app/admin/canvas/page.tsx#L73) で読み込み、保存後 [:217](../app/admin/canvas/page.tsx#L217) で `invalidateCache`。

## 注意点

- メモリ消費：全カテゴリの画像をデコード済みで保持する形になる。カテゴリ数／画像数が増えたら「現在＋直前 N」の LRU 化を検討。
- `<img>` を常時マウントしている分、初期レンダーのコストは上がる（選択中以外は `visibility: hidden` で塗られないが、レイアウト計算は走る）。`display: none` にすれば塗り／レイアウトを完全にスキップできるが、復帰時に再レイアウトが入るためトレードオフ。今は瞬時切替を優先して `visibility: hidden` を採用。
- localStorage 書き込みは try/catch で容量超過を黙殺。
- バージョニングは `canvas_layout_v1_` プレフィックス。`CanvasItem` のスキーマ変更時はキー名のバージョンを上げないと古いデータが読み込まれる。
- `imageCache` Set はメモリ上のみ。タブを閉じれば消えるので、ブラウザの HTTP キャッシュ側に頼る形。
- 全カテゴリぶんの Firestore 読み取りが起動時に発生する。カテゴリ数が大きく増えた場合は「現在＋前後 N」など範囲を絞ることを検討。
- SWR 部分の等価判定は `JSON.stringify` を使っており、配列が大きいとコストが無視できなくなる可能性がある。問題が出たら個別フィールドのシャロー比較に切り替える。
