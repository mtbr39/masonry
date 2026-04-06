"use client";

import { useEffect, useState } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { getCanvasLayout, getCategories } from "@/lib/firestore";
import { CanvasItem, Category } from "@/lib/types";

const CANVAS_W = 3000;
const CANVAS_H = 2000;

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("default");
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    getCanvasLayout(selectedCategory).then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, [selectedCategory]);

  return (
    <div className="h-screen bg-white text-gray-900 flex flex-col overflow-hidden">
      <header className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-gray-100 bg-white z-10">
        <h1 className="text-2xl font-bold tracking-tight">Photo Portfolio</h1>
        <a href="/admin" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">
          Admin
        </a>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* カテゴリサイドバー */}
        {categories.length > 0 && (
          <nav className="shrink-0 w-32 px-6 py-4 flex flex-col gap-1 overflow-y-auto border-r border-gray-100 bg-white z-10">
            <button
              onClick={() => setSelectedCategory("default")}
              className={`text-left text-sm py-1 transition-colors ${
                selectedCategory === "default"
                  ? "text-gray-900 font-semibold"
                  : "text-gray-400 hover:text-gray-900"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`text-left text-sm py-1 transition-colors ${
                  selectedCategory === c.id
                    ? "text-gray-900 font-semibold"
                    : "text-gray-400 hover:text-gray-900"
                }`}
              >
                {c.name}
              </button>
            ))}
          </nav>
        )}

        {/* キャンバス表示 */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20 text-gray-400">Loading…</div>
          ) : (
            <TransformWrapper
              key={selectedCategory}
              minScale={0.1}
              maxScale={4}
              initialScale={0.3}
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
                            color: item.color ?? "#111111",
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
