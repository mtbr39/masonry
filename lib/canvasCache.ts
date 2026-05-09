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

/**
 * バックグラウンドでカテゴリのレイアウトと画像を温める。
 * メモリヒットなら何もしない。localStorage ヒットならメモリ昇格＋画像プリロードのみ。
 * いずれの場合も最終的に Firestore から最新を取得してキャッシュを更新する。
 */
export function prefetchCanvasLayout(categoryId: string) {
  if (memoryCache.has(categoryId)) return;

  const stored = loadFromStorage(categoryId);
  if (stored) {
    memoryCache.set(categoryId, stored);
    preloadImages(stored);
  }

  getCanvasLayout(categoryId).then((data) => {
    memoryCache.set(categoryId, data);
    saveToStorage(categoryId, data);
    preloadImages(data);
  });
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
    const prev = memoryCache.get(categoryId);
    memoryCache.set(categoryId, data);
    saveToStorage(categoryId, data);
    preloadImages(data);
    // 取得結果がキャッシュと同一なら不要な再レンダーを避ける
    if (!prev || JSON.stringify(prev) !== JSON.stringify(data)) {
      onData(data);
    }
    onLoadingChange(false);
  });
}
