"use client";

import { Ref, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Category } from "@/lib/types";

const NAV_OPACITY = 0.8;
const NAV_ACTIVE_TEXT_SIZE = "text-[1.6875rem]";

type Props = {
  ref?: Ref<HTMLElement>;
  categories: Category[];
  selectedCategory: string;
  onSelect: (id: string) => void;
};

export default function MobileCategoryNav({ ref, categories, selectedCategory, onSelect }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const [translateX, setTranslateX] = useState(0);
  // dragDelta を「カテゴリ何個分」へ正規化するための基準距離（コンテナ幅/1.5）
  const [refStep, setRefStep] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const swipeLockedRef = useRef<"h" | "v" | null>(null);

  const selectedIndex = Math.max(0, categories.findIndex((c) => c.id === selectedCategory));

  const registerItemRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  // active 実測中央 → コンテナ中央へ寄せる translateX を算出
  const computeTranslate = useCallback(() => {
    const row = rowRef.current;
    const active = itemRefs.current.get(selectedCategory);
    if (!row || !active) return;
    const containerWidth = row.parentElement?.clientWidth ?? window.innerWidth;
    const activeCenter = active.offsetLeft + active.offsetWidth / 2;
    setTranslateX(containerWidth / 2 - activeCenter);
    setRefStep(containerWidth / 1.5);
  }, [selectedCategory]);

  useLayoutEffect(() => {
    computeTranslate();
    const raf = requestAnimationFrame(computeTranslate);
    window.addEventListener("resize", computeTranslate);
    const ro = new ResizeObserver(computeTranslate);
    if (rowRef.current) ro.observe(rowRef.current);
    itemRefs.current.forEach((el) => ro.observe(el));
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(computeTranslate).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", computeTranslate);
    };
  }, [computeTranslate, categories]);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    swipeLockedRef.current = null;
    setIsDragging(true);
    setDragDelta(0);
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    if (swipeLockedRef.current == null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        swipeLockedRef.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
    }
    if (swipeLockedRef.current === "h") {
      if (e.cancelable) e.preventDefault();
      setDragDelta(dx);
    }
  };
  const finishSwipe = () => {
    if (!isDragging) return;
    const idx = categories.findIndex((c) => c.id === selectedCategory);
    if (swipeLockedRef.current === "h" && idx >= 0 && Math.abs(dragDelta) >= 20) {
      const active = itemRefs.current.get(selectedCategory);
      if (active) {
        const target = active.offsetLeft + active.offsetWidth / 2 - dragDelta;
        let bestIdx = idx;
        let bestDist = Infinity;
        categories.forEach((c, i) => {
          const el = itemRefs.current.get(c.id);
          if (!el) return;
          const center = el.offsetLeft + el.offsetWidth / 2;
          const d = Math.abs(center - target);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        });
        if (bestIdx !== idx) onSelect(categories[bestIdx].id);
      }
    }
    setIsDragging(false);
    setDragDelta(0);
    swipeLockedRef.current = null;
  };

  if (categories.length === 0) return null;

  return (
    <nav
      ref={ref}
      className="md:hidden absolute top-0 left-0 right-0 z-10 backdrop-blur-sm py-4 overflow-hidden"
      style={{ backgroundColor: `rgba(255,255,255,${NAV_OPACITY})`, touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={finishSwipe}
      onTouchCancel={finishSwipe}
    >
      <div
        ref={rowRef}
        className={`flex items-center whitespace-nowrap will-change-transform ${
          isDragging ? "" : "transition-transform duration-300 ease-out"
        }`}
        style={{
          transform: `translateX(${translateX + dragDelta}px)`,
          gap: 48,
        }}
      >
        {categories.map((c, i) => {
          const isActive = c.id === selectedCategory;
          // 画面中央からの距離（slot 単位）。スクロール量に応じて遠い項目も連続的にフェードイン。
          const dragSlots = refStep > 0 ? dragDelta / refStep : 0;
          const dist = (i - selectedIndex) + dragSlots;
          const opacity = Math.max(0, Math.min(1, 2 - Math.abs(dist)));
          return (
            <button
              key={c.id}
              ref={registerItemRef(c.id)}
              onClick={() => onSelect(c.id)}
              className={`shrink-0 px-2 py-1 text-center transition-colors ${
                isActive ? `text-foreground font-light ${NAV_ACTIVE_TEXT_SIZE}` : "text-gray-400 text-base"
              } ${isDragging ? "" : "transition-opacity duration-300 ease-out"}`}
              style={{ opacity }}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
