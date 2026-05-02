"use client";

import { useEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { getCategories } from "@/lib/firestore";
import { CanvasItem, Category } from "@/lib/types";
import { fetchCanvasLayoutCached } from "@/lib/canvasCache";

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const NAV_OPACITY = 0.8;           // メニュー背景の不透明度 (0〜1)
const NAV_ACTIVE_TEXT_SIZE = "text-[1.6875rem]"; // 選択中メニューの文字サイズ (text-lg の 1.5倍)
const NAV_LINE_WIDTH = "w-0.5";    // メニュー縦線の太さ

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialScale, setInitialScale] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setInitialScale(Math.min(clientWidth / CANVAS_W, clientHeight / CANVAS_H));
  }, []);

  useEffect(() => {
    getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setSelectedCategory(cats[0].id);
      else setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    fetchCanvasLayoutCached(selectedCategory, setItems, setLoading);
  }, [selectedCategory]);

  return (
    <div className="h-screen bg-white text-foreground flex flex-col overflow-hidden">
      <div className="relative flex-1 min-h-0">
        {/* カテゴリサイドバー */}
        {categories.length > 0 && (
          <nav className="absolute top-0 left-0 h-full w-72 px-4 py-4 flex flex-col gap-1 overflow-y-auto z-10 backdrop-blur-sm pt-16" style={{ backgroundColor: `rgba(255,255,255,${NAV_OPACITY})` }}>
            {(() => {
              const ITEM_H = 40;     // minHeight 2.5rem = 40px
              const GAP = 24;        // 文字間隔
              const TEXT_INSET = 0; // ボタン内でテキストが中央寄せされる分のオフセット
              const activeIdx = categories.findIndex((c) => c.id === selectedCategory);
              // 上の線：一番上の文字の下端 → activeの文字上端
              const topLineTop = ITEM_H - TEXT_INSET;
              const topLineBottom = activeIdx * (ITEM_H + GAP) + TEXT_INSET;
              // 下の線：activeの文字下端 → 一番下の文字の上端
              const bottomLineTop = activeIdx * (ITEM_H + GAP) + ITEM_H - TEXT_INSET;
              const bottomLineBottom = (categories.length - 1) * (ITEM_H + GAP) + TEXT_INSET;
              return (
                <div className="relative flex flex-col" style={{ gap: GAP }}>
                  {/* アクティブより上の縦線 */}
                  {activeIdx > 0 && topLineBottom > topLineTop && (
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 ${NAV_LINE_WIDTH} bg-gray-300 pointer-events-none`}
                      style={{ top: topLineTop, height: topLineBottom - topLineTop }}
                    />
                  )}
                  {/* アクティブより下の縦線 */}
                  {activeIdx < categories.length - 1 && bottomLineBottom > bottomLineTop && (
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 ${NAV_LINE_WIDTH} bg-gray-300 pointer-events-none`}
                      style={{ top: bottomLineTop, height: bottomLineBottom - bottomLineTop }}
                    />
                  )}
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.id)}
                      className={`relative text-center py-1 transition-all ${
                        selectedCategory === c.id
                          ? `text-foreground font-semibold ${NAV_ACTIVE_TEXT_SIZE}`
                          : "text-gray-400 hover:text-foreground text-lg"
                      }`}
                      style={{ minHeight: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <span className="relative">{c.name}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </nav>
        )}

        {/* キャンバス表示 */}
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20 text-gray-400">Loading…</div>
          ) : (
            <TransformWrapper
              key={selectedCategory + (initialScale ?? 0)}
              minScale={0.05}
              maxScale={4}
              initialScale={initialScale ?? 0.3}
              wheel={{ step: 0.05 }}
              panning={{ velocityDisabled: false }}
            >
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
                <div
                  style={{
                    position: "relative",
                    width: CANVAS_W,
                    height: CANVAS_H,
                    background: "#fff",
                  }}
                >
                  {items.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        position: "absolute",
                        left: item.x,
                        top: item.y,
                        width: item.width,
                        height: item.height,
                        zIndex: Math.max(1, item.zIndex),
                      }}
                    >
                      {item.type === "photo" && item.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.photoUrl}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          draggable={false}
                        />
                      ) : item.type === "text" ? (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            fontSize: item.fontSize ?? 40,
                            color: item.color ?? "var(--foreground)",
                            fontWeight: item.fontWeight ?? "normal",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            lineHeight: 1.4,
                            userSelect: "none",
                          }}
                        >
                          {item.content}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </TransformComponent>
            </TransformWrapper>
          )}
        </div>
      </div>
    </div>
  );
}
