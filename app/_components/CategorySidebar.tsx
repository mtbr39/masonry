"use client";

import { Ref, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Category } from "@/lib/types";

const NAV_OPACITY = 0.8;
const NAV_ACTIVE_TEXT_SIZE = "text-[1.6875rem]";
const NAV_LINE_WIDTH = "w-0.5";
const NAV_LINE_TEXT_GAP = -2;

type Props = {
  ref?: Ref<HTMLElement>;
  categories: Category[];
  selectedCategory: string;
  onSelect: (id: string) => void;
};

export default function CategorySidebar({ ref, categories, selectedCategory, onSelect }: Props) {
  const navListRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef(new Map<string, HTMLSpanElement>());
  const [lineRange, setLineRange] = useState<{
    top: number;
    bottom: number;
    activeTop: number;
    activeBottom: number;
  } | null>(null);

  const computeLineRange = useCallback(() => {
    if (categories.length < 2 || !selectedCategory) {
      setLineRange(null);
      return;
    }
    const list = navListRef.current;
    if (!list) return;
    const firstEl = textRefs.current.get(categories[0].id);
    const lastEl = textRefs.current.get(categories[categories.length - 1].id);
    const activeEl = textRefs.current.get(selectedCategory);
    if (!firstEl || !lastEl || !activeEl) return;
    const base = list.getBoundingClientRect().top;
    setLineRange({
      top: firstEl.getBoundingClientRect().bottom - base,
      bottom: lastEl.getBoundingClientRect().top - base,
      activeTop: activeEl.getBoundingClientRect().top - base,
      activeBottom: activeEl.getBoundingClientRect().bottom - base,
    });
  }, [categories, selectedCategory]);

  const registerTextRef = useCallback((id: string) => (el: HTMLSpanElement | null) => {
    if (el) textRefs.current.set(id, el);
    else textRefs.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    computeLineRange();
    const raf = requestAnimationFrame(computeLineRange);
    const ro = new ResizeObserver(computeLineRange);
    if (navListRef.current) ro.observe(navListRef.current);
    textRefs.current.forEach((el) => ro.observe(el));
    window.addEventListener("resize", computeLineRange);
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(computeLineRange).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", computeLineRange);
    };
  }, [computeLineRange]);

  if (categories.length === 0) return null;

  return (
    <nav
      ref={ref}
      className="hidden md:flex absolute top-0 left-0 h-full w-72 px-4 py-4 flex-col gap-1 overflow-y-auto z-10 backdrop-blur-sm pt-16"
      style={{ backgroundColor: `rgba(255,255,255,${NAV_OPACITY})` }}
    >
      <div ref={navListRef} className="relative flex flex-col" style={{ gap: 24 }}>
        {lineRange && lineRange.activeTop - NAV_LINE_TEXT_GAP > lineRange.top + NAV_LINE_TEXT_GAP && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 ${NAV_LINE_WIDTH} bg-gray-300 pointer-events-none`}
            style={{
              top: lineRange.top + NAV_LINE_TEXT_GAP,
              height: lineRange.activeTop - lineRange.top - NAV_LINE_TEXT_GAP * 2,
            }}
          />
        )}
        {lineRange && lineRange.bottom - NAV_LINE_TEXT_GAP > lineRange.activeBottom + NAV_LINE_TEXT_GAP && (
          <div
            className={`absolute left-1/2 -translate-x-1/2 ${NAV_LINE_WIDTH} bg-gray-300 pointer-events-none`}
            style={{
              top: lineRange.activeBottom + NAV_LINE_TEXT_GAP,
              height: lineRange.bottom - lineRange.activeBottom - NAV_LINE_TEXT_GAP * 2,
            }}
          />
        )}
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`relative text-center py-1 transition-all ${
              selectedCategory === c.id
                ? `text-foreground font-light ${NAV_ACTIVE_TEXT_SIZE}`
                : "text-gray-400 hover:text-foreground text-lg"
            }`}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <span ref={registerTextRef(c.id)} className="relative">
              {c.name}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
