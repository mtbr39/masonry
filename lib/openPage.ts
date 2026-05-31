import { Category, CanvasItem } from "./types";

// カテゴリではない固定ページ。Firestore 上は `canvas/__open__` ドキュメントに
// CanvasItem[] として保存し、見た目はマソンリー（列ベースの自動配置）。
export const OPEN_PAGE_ID = "open-page";
export const OPEN_PAGE_NAME = "Say Hello";

export const OPEN_COLS = 2;
export const OPEN_COL_W = 1200;
export const OPEN_GAP = 60;
export const OPEN_MARGIN_X = 80;
export const OPEN_MARGIN_Y = 80;
export const OPEN_CANVAS_W =
  OPEN_MARGIN_X * 2 + OPEN_COLS * OPEN_COL_W + (OPEN_COLS - 1) * OPEN_GAP;

export function isOpenPage(id: string): boolean {
  return id === OPEN_PAGE_ID;
}

export function openPageEntry(order: number): Category {
  return { id: OPEN_PAGE_ID, name: OPEN_PAGE_NAME, order };
}

function colIndexOf(it: CanvasItem): number {
  return Math.round((it.x - OPEN_MARGIN_X) / (OPEN_COL_W + OPEN_GAP));
}

// 指定 id を削除し、同じ列で下にあったアイテムを上に詰める
export function removeAndCompact(items: CanvasItem[], id: string): CanvasItem[] {
  const target = items.find((it) => it.id === id);
  if (!target) return items;
  const col = colIndexOf(target);
  const shift = target.height + OPEN_GAP;
  return items
    .filter((it) => it.id !== id)
    .map((it) => (colIndexOf(it) === col && it.y > target.y ? { ...it, y: it.y - shift } : it));
}

// 新規投稿を最上部に挿入。挿入先の列の既存アイテムを下にずらして
// 上端の余白を作る。
export function insertAtTop(
  items: CanvasItem[],
  origW: number,
  origH: number,
): { position: { x: number; y: number; width: number; height: number }; updatedItems: CanvasItem[] } {
  const scale = OPEN_COL_W / origW;
  const w = OPEN_COL_W;
  const h = Math.max(60, Math.round(origH * scale));

  // 各列の現在の上端（最小 y）と下端（最大 y+height）
  const colTops: number[] = new Array(OPEN_COLS).fill(Infinity);
  const colBottoms: number[] = new Array(OPEN_COLS).fill(0);
  for (const it of items) {
    const c = colIndexOf(it);
    if (c < 0 || c >= OPEN_COLS) continue;
    if (it.y < colTops[c]) colTops[c] = it.y;
    const bottom = it.y + it.height;
    if (bottom > colBottoms[c]) colBottoms[c] = bottom;
  }

  // 最も短い列（下端が最小）を選んで 2 列に均等に積む
  let pick = 0;
  for (let i = 1; i < OPEN_COLS; i++) {
    if (colBottoms[i] < colBottoms[pick]) pick = i;
  }

  // 挿入列：新アイテムが MARGIN_Y に入るよう既存アイテムをシフト
  const pickShift = Number.isFinite(colTops[pick])
    ? OPEN_MARGIN_Y + h + OPEN_GAP - colTops[pick]
    : 0;

  // 他の列：上端を MARGIN_Y に揃える（上に詰める）
  const updatedItems = items.map((it) => {
    const c = colIndexOf(it);
    if (c < 0 || c >= OPEN_COLS) return it;
    if (c === pick) return { ...it, y: it.y + pickShift };
    if (Number.isFinite(colTops[c])) {
      return { ...it, y: it.y - (colTops[c] - OPEN_MARGIN_Y) };
    }
    return it;
  });

  return {
    position: {
      x: OPEN_MARGIN_X + pick * (OPEN_COL_W + OPEN_GAP),
      y: OPEN_MARGIN_Y,
      width: w,
      height: h,
    },
    updatedItems,
  };
}
