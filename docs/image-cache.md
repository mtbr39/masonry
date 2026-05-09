# 画像／レイアウトのキャッシュ機構

実装は [lib/canvasCache.ts](../lib/canvasCache.ts) に集約されている。
カテゴリごとの Canvas レイアウト（`CanvasItem[]`）と、その中の写真URLを多層キャッシュし、メニュー切替時の表示遅延を最小化する仕組み。

## 3 層構造

| 層 | 実体 | 寿命 | 目的 |
|---|---|---|---|
| メモリキャッシュ | `memoryCache: Map<categoryId, CanvasItem[]>` | タブ生存中 | 同一セッション内のカテゴリ切替を即時反映 |
| 永続キャッシュ | `localStorage` キー `canvas_layout_v1_<categoryId>` | ブラウザ削除まで | 再訪問時の初回描画を高速化 |
| 画像キャッシュ | `imageCache: Set<photoUrl>` ＋ `new Image()` プリロード | タブ生存中（ブラウザのHTTPキャッシュにも乗る） | 写真本体のダウンロード待ちを隠す |

## 取得フロー（`fetchCanvasLayoutCached`）

[lib/canvasCache.ts:53](../lib/canvasCache.ts#L53)

1. **メモリにあれば即返す** → `onData` 呼び出し、`loading=false`、ネットワーク無し。
2. **localStorage にあれば** → メモリへ昇格、画像をプリロード、`onData` を一旦コール（`loading=false`）。
3. その後 **必ず Firestore (`getCanvasLayout`) を取りに行き**、結果でメモリ／localStorage を上書き、画像をプリロード。
   - **取得結果が直前のキャッシュと同一（JSON文字列比較）なら `onData` をスキップ**して無駄な再レンダーを回避。
   - 異なる場合のみ `onData` を再コールして差分を反映。

つまり stale-while-revalidate に近い挙動：キャッシュがあれば先に表示し、裏で最新化して必要時のみ差し替える。

## バックグラウンドプリフェッチ（`prefetchCanvasLayout`）

[lib/canvasCache.ts:38](../lib/canvasCache.ts#L38)

- `fetchCanvasLayoutCached` のコールバック無し版。`onData`/`onLoadingChange` を持たないので state 更新を起こさず、純粋にキャッシュを温めるだけ。
- メモリヒットなら即終了。localStorage にあればメモリ昇格＋画像プリロード。最終的に Firestore で最新化。
- [app/page.tsx:46-54](../app/page.tsx#L46-L54) で **選択中以外のカテゴリ全件を `requestIdleCallback` 経由でプリフェッチ**。これによりメニュー切替時にはほぼ確実にメモリヒットする。

## 画像のプリロード（`preloadImages`）

[lib/canvasCache.ts:28](../lib/canvasCache.ts#L28)

- `item.type === "photo"` かつ `photoUrl` を持つ要素について、未登録なら `imageCache` Set に URL を登録し、`new Image(); img.src = url` でブラウザにダウンロードさせる。
- `<img>` を DOM に挿入する前にブラウザのHTTPキャッシュへ載せておく狙い。
- `Set` は URL 文字列のみ保持し、Image オブジェクトは保持しない（ブラウザのHTTPキャッシュ任せ）。

## 無効化（`invalidateCache`）

[lib/canvasCache.ts:59](../lib/canvasCache.ts#L59)

- メモリと localStorage の両方から該当 `categoryId` を削除。
- Admin 画面の保存後に呼ばれる（[app/admin/canvas/page.tsx:217](../app/admin/canvas/page.tsx#L217)）。画像Setはクリアしない＝同URLなら次回もプリロード済み扱い。

## レンダー側の最適化（`<img>` をリマウントさせない）

切替時の遅延はキャッシュだけでは消えず、DOM側の対策も必要。

- **`TransformWrapper` の `key` を撤廃**（[app/page.tsx:111](../app/page.tsx#L111)）。以前は `key={selectedCategory + initialScale}` でカテゴリ毎にラッパーをフルリマウントしており、`<img>` が毎回作り直され**ブラウザHTTPキャッシュにヒットしてもデコード／ペイントが再実行**されていた。
- 代わりに `transformRef` を保持し、カテゴリ変更時は [app/page.tsx:42-45](../app/page.tsx#L42-L45) で `transformRef.current.setTransform(0, 0, initialScale, 0)` を呼んでズーム位置だけ初期化（アニメ無し）。
- `<img>` には `loading="eager"` / `decoding="async"` / `fetchPriority="high"` を付与（[app/page.tsx:138-140](../app/page.tsx#L138-L140)）してデコード優先度を上げ、ファーストペイントを早める。

## 利用箇所

- 一般ページ: [app/page.tsx:39](../app/page.tsx#L39) — カテゴリ変更で `fetchCanvasLayoutCached`。バックグラウンドで `prefetchCanvasLayout` を全カテゴリに対して発火。
- 管理画面: [app/admin/canvas/page.tsx:73](../app/admin/canvas/page.tsx#L73) で読み込み、保存後 [:217](../app/admin/canvas/page.tsx#L217) で `invalidateCache`。

## 注意点

- localStorage 書き込みは try/catch で容量超過を黙殺。
- バージョニングは `canvas_layout_v1_` プレフィックス。`CanvasItem` のスキーマ変更時はキー名のバージョンを上げないと古いデータが読み込まれる。
- `imageCache` Set はメモリ上のみ。タブを閉じれば消えるので、ブラウザのHTTPキャッシュ側に頼る形。
- プリフェッチはカテゴリ数ぶんの Firestore 読み取りを発生させる。カテゴリ数が増えた場合は「現在＋前後N」など範囲を絞ることを検討。
- SWR部分の等価判定は `JSON.stringify` を使っており、配列が大きいとコストが無視できなくなる可能性がある。問題が出たら個別フィールドのシャロー比較に切り替える。
