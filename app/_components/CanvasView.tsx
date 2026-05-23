"use client";

import { Ref, useEffect, useRef } from "react";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";
import { CanvasItem, Category } from "@/lib/types";

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const INITIAL_FIT_RATIO = 0.8; // バウンディングボックスに対する初期表示の拡大率

export type ContainerSize = {
  w: number;
  h: number;
  offsetLeft: number;
  offsetTop: number;
};

function computeLayoutTransform(
  items: CanvasItem[],
  containerW: number,
  containerH: number,
  offsetLeft = 0,
  offsetTop = 0,
): { x: number; y: number; scale: number } {
  const photos = items.filter((i) => i.type === "photo" && i.photoUrl);
  const targets = photos.length > 0 ? photos : items;
  const effectiveW = containerW - offsetLeft;
  const effectiveH = containerH - offsetTop;
  // モバイル（offsetTop > 0）は縦中心をコンテナ全体に合わせる。
  // PC（offsetLeft > 0）は従来通りサイドバーを除いた領域の中心に合わせる。
  const centerY = offsetTop > 0 ? containerH / 2 : offsetTop + effectiveH / 2;
  const centerX = offsetLeft + effectiveW / 2;
  if (targets.length === 0) {
    const scale = Math.min(effectiveW / CANVAS_W, effectiveH / CANVAS_H);
    return {
      x: centerX - (CANVAS_W * scale) / 2,
      y: centerY - (CANVAS_H * scale) / 2,
      scale,
    };
  }
  const minX = Math.min(...targets.map((i) => i.x));
  const minY = Math.min(...targets.map((i) => i.y));
  const maxX = Math.max(...targets.map((i) => i.x + i.width));
  const maxY = Math.max(...targets.map((i) => i.y + i.height));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.min(effectiveW / (maxX - minX), effectiveH / (maxY - minY)) * INITIAL_FIT_RATIO;
  return {
    x: centerX - cx * scale,
    y: centerY - cy * scale,
    scale,
  };
}

type Props = {
  ref?: Ref<HTMLDivElement>;
  categories: Category[];
  selectedCategory: string;
  layouts: Record<string, CanvasItem[]>;
  containerSize: ContainerSize | null;
};

export default function CanvasView({ ref, categories, selectedCategory, layouts, containerSize }: Props) {
  const transformRefs = useRef(new Map<string, ReactZoomPanPinchContentRef>());

  // layouts を ref で保持。reset effect から最新値を読むためだが deps には含めない。
  // （他カテゴリ分の layouts 追加でリセットが再発火しないようにするため）
  const layoutsRef = useRef(layouts);
  useEffect(() => { layoutsRef.current = layouts; }, [layouts]);

  // selectedCategory または containerSize（ナビ計測含む）が変わるたびにリセット。
  // レイアウトがまだ届いていない場合は rAF で待つ。
  useEffect(() => {
    if (!selectedCategory || !containerSize) return;
    let cancelled = false;
    const reset = () => {
      if (cancelled) return;
      const layout = layoutsRef.current[selectedCategory];
      const tr = transformRefs.current.get(selectedCategory);
      if (tr && layout) {
        const { x, y, scale } = computeLayoutTransform(layout, containerSize.w, containerSize.h, containerSize.offsetLeft, containerSize.offsetTop);
        tr.setTransform(x, y, scale, 0);
      } else {
        requestAnimationFrame(reset);
      }
    };
    reset();
    return () => { cancelled = true; };
  }, [selectedCategory, containerSize]);

  const selectedReady = !!selectedCategory && !!layouts[selectedCategory];

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {!selectedReady && (
        <div className="flex justify-center py-20 text-gray-400">Loading…</div>
      )}
      {containerSize != null &&
        categories.map((c) => {
          const layout = layouts[c.id];
          if (!layout) return null;
          const isSelected = c.id === selectedCategory;
          const initT = computeLayoutTransform(layout, containerSize.w, containerSize.h, containerSize.offsetLeft, containerSize.offsetTop);
          return (
            <div
              key={c.id}
              style={{
                position: "absolute",
                inset: 0,
                visibility: isSelected ? "visible" : "hidden",
                pointerEvents: isSelected ? "auto" : "none",
              }}
              aria-hidden={!isSelected}
            >
              <TransformWrapper
                ref={(r) => {
                  if (r) transformRefs.current.set(c.id, r);
                  else transformRefs.current.delete(c.id);
                }}
                minScale={0.05}
                maxScale={4}
                initialScale={initT.scale}
                initialPositionX={initT.x}
                initialPositionY={initT.y}
                wheel={{ step: 0.05 }}
                panning={{ velocityDisabled: false }}
                alignmentAnimation={{ disabled: true }}
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
                    {layout.map((item) => (
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
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
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
            </div>
          );
        })}
    </div>
  );
}
