import { getCanvasLayout } from "@/lib/firestore";
import { CanvasItem } from "@/lib/types";

const memoryCache = new Map<string, CanvasItem[]>();
const imageCache = new Set<string>();

function lsKey(categoryId: string) {
  return `canvas_layout_v1_${categoryId}`;
}

function saveToStorage(categoryId: string, items: CanvasItem[]) {
  try {
    localStorage.setItem(lsKey(categoryId), JSON.stringify(items));
  } catch {
    // localStorage容量超過等は無視
  }
}

function loadFromStorage(categoryId: string): CanvasItem[] | null {
  try {
    const raw = localStorage.getItem(lsKey(categoryId));
    return raw ? (JSON.parse(raw) as CanvasItem[]) : null;
  } catch {
    return null;
  }
}

export function preloadImages(items: CanvasItem[]) {
  for (const item of items) {
    if (item.type === "photo" && item.photoUrl && !imageCache.has(item.photoUrl)) {
      imageCache.add(item.photoUrl);
      const img = new Image();
      img.src = item.photoUrl;
    }
  }
}

/** キャッシュを無効化（Admin保存後などに呼ぶ） */
export function invalidateCache(categoryId: string) {
  memoryCache.delete(categoryId);
  try {
    localStorage.removeItem(lsKey(categoryId));
  } catch {
    // ignore
  }
}

/**
 * キャッシュ優先でレイアウトを取得する。
 * onData: キャッシュヒット時・fetch完了時の両方で呼ばれる。
 * onLoadingChange: ローディング状態の変化を通知する。
 */
export function fetchCanvasLayoutCached(
  categoryId: string,
  onData: (items: CanvasItem[]) => void,
  onLoadingChange: (loading: boolean) => void,
) {
  if (memoryCache.has(categoryId)) {
    onData(memoryCache.get(categoryId)!);
    onLoadingChange(false);
    return;
  }

  const stored = loadFromStorage(categoryId);
  if (stored) {
    memoryCache.set(categoryId, stored);
    preloadImages(stored);
    onData(stored);
    onLoadingChange(false);
  } else {
    onLoadingChange(true);
  }

  getCanvasLayout(categoryId).then((data) => {
    memoryCache.set(categoryId, data);
    saveToStorage(categoryId, data);
    preloadImages(data);
    onData(data);
    onLoadingChange(false);
  });
}
