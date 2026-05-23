import { Category, CanvasItem } from "./types";

// カテゴリではない固定ページ。Firestore 上は `canvas/__open__` ドキュメントに
// CanvasItem[] として保存し、見た目はマソンリー（列ベースの自動配置）。
export const OPEN_PAGE_ID = "open-page";
export const OPEN_PAGE_NAME = "みんな";

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

// マソンリー次配置: 一番低い列の下に積む
export function computeNextPosition(
  items: CanvasItem[],
  origW: number,
  origH: number,
): { x: number; y: number; width: number; height: number } {
  const scale = OPEN_COL_W / origW;
  const w = OPEN_COL_W;
  const h = Math.max(60, Math.round(origH * scale));

  const colBottoms: number[] = new Array(OPEN_COLS).fill(OPEN_MARGIN_Y);
  for (const it of items) {
    const colIdx = Math.round((it.x - OPEN_MARGIN_X) / (OPEN_COL_W + OPEN_GAP));
    if (colIdx >= 0 && colIdx < OPEN_COLS) {
      const bottom = it.y + it.height + OPEN_GAP;
      if (bottom > colBottoms[colIdx]) colBottoms[colIdx] = bottom;
    }
  }
  let shortest = 0;
  for (let i = 1; i < OPEN_COLS; i++) {
    if (colBottoms[i] < colBottoms[shortest]) shortest = i;
  }
  return {
    x: OPEN_MARGIN_X + shortest * (OPEN_COL_W + OPEN_GAP),
    y: colBottoms[shortest],
    width: w,
    height: h,
  };
}
