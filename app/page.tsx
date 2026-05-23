"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getCategories } from "@/lib/firestore";
import { CanvasItem, Category } from "@/lib/types";
import { fetchCanvasLayoutCached } from "@/lib/canvasCache";
import AudioPlayer from "./_components/AudioPlayer";
import CategorySidebar from "./_components/CategorySidebar";
import MobileCategoryNav from "./_components/MobileCategoryNav";
import CanvasView, { type ContainerSize } from "./_components/CanvasView";

// URL ハッシュ（#<カテゴリ名> または #<id>）から対象カテゴリを解決
function resolveCategoryFromHash(cats: Category[]): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).toLowerCase();
  const match = cats.find(
    (c) => c.id.toLowerCase() === decoded || c.name.toLowerCase() === decoded,
  );
  return match?.id ?? null;
}

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [layouts, setLayouts] = useState<Record<string, CanvasItem[]>>({});
  const [containerSize, setContainerSize] = useState<ContainerSize | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const desktopNavRef = useRef<HTMLElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  const measureContainer = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const isMd = window.innerWidth >= 768;
    const offsetLeft = isMd ? (desktopNavRef.current?.clientWidth ?? 0) : 0;
    const offsetTop = isMd ? 0 : (mobileNavRef.current?.clientHeight ?? 0);
    setContainerSize({ w: clientWidth, h: clientHeight, offsetLeft, offsetTop });
  }, []);

  // 初回計測 + ナビがマウントされる categories 変化後にも再計測
  useLayoutEffect(() => {
    measureContainer();
    window.addEventListener("resize", measureContainer);
    return () => window.removeEventListener("resize", measureContainer);
  }, [measureContainer, categories]);

  useEffect(() => {
    getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length === 0) return;
      const fromHash = resolveCategoryFromHash(cats);
      setSelectedCategory(fromHash ?? cats[0].id);
    });
  }, []);

  // 選択カテゴリ変更時に URL ハッシュを更新（履歴を増やさない replaceState）
  useEffect(() => {
    if (!selectedCategory || categories.length === 0) return;
    const cat = categories.find((c) => c.id === selectedCategory);
    if (!cat) return;
    const next = `#${encodeURIComponent(cat.name)}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
    }
  }, [selectedCategory, categories]);

  // ブラウザの戻る/進む・外部からのハッシュ変更に追従
  useEffect(() => {
    const onHashChange = () => {
      const id = resolveCategoryFromHash(categories);
      if (id && id !== selectedCategory) setSelectedCategory(id);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [categories, selectedCategory]);

  // 全カテゴリ分のレイアウトを取得して `layouts` に格納。
  // 選択中を最優先、その後にそれ以外を順次。fetchCanvasLayoutCached が
  // メモリ／localStorage ヒット時は同期的に onData を呼ぶので即座に DOM に乗る。
  useEffect(() => {
    if (categories.length === 0 || !selectedCategory) return;
    const ordered = [
      ...categories.filter((c) => c.id === selectedCategory),
      ...categories.filter((c) => c.id !== selectedCategory),
    ];
    ordered.forEach((c) => {
      fetchCanvasLayoutCached(
        c.id,
        (items) => setLayouts((prev) => ({ ...prev, [c.id]: items })),
        () => {},
      );
    });
  }, [categories, selectedCategory]);

  const currentAudioUrl = categories.find((c) => c.id === selectedCategory)?.audioUrl;

  return (
    <div className="h-screen bg-white text-foreground flex flex-col overflow-hidden">
      <div className="relative flex-1 min-h-0">
        <CategorySidebar
          ref={desktopNavRef}
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={setSelectedCategory}
        />
        <MobileCategoryNav
          ref={mobileNavRef}
          categories={categories}
          selectedCategory={selectedCategory}
          onSelect={setSelectedCategory}
        />
        <CanvasView
          ref={containerRef}
          categories={categories}
          selectedCategory={selectedCategory}
          layouts={layouts}
          containerSize={containerSize}
        />
      </div>
      <AudioPlayer audioUrl={currentAudioUrl} />
    </div>
  );
}
