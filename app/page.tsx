"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";
import { getCategories } from "@/lib/firestore";
import { CanvasItem, Category } from "@/lib/types";
import { fetchCanvasLayoutCached } from "@/lib/canvasCache";

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const NAV_OPACITY = 0.8;           // メニュー背景の不透明度 (0〜1)
const NAV_ACTIVE_TEXT_SIZE = "text-[1.6875rem]"; // 選択中メニューの文字サイズ (text-lg の 1.5倍)
const NAV_LINE_WIDTH = "w-0.5";    // メニュー縦線の太さ
const NAV_LINE_TEXT_GAP = -2;       // 線とテキストの間の余白(px)。0 でテキスト端ぴったりまで

// 再生中ボタンの脈打つグロー
const PLAY_GLOW_DURATION = "1.6s";              // 1周期の長さ
const PLAY_GLOW_EASING = "ease-in-out";       // イージング
const PLAY_GLOW_BLUR = 22;                    // ぼかし半径 (px)
const PLAY_GLOW_SPREAD = 6;                   // 広がり (px)
const PLAY_GLOW_COLOR = "rgba(0,0,0,0.2)";   // 色／不透明度

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [layouts, setLayouts] = useState<Record<string, CanvasItem[]>>({});
  const [initialScale, setInitialScale] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRefs = useRef(new Map<string, ReactZoomPanPinchContentRef>());
  const navListRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef(new Map<string, HTMLSpanElement>());
  const [lineRange, setLineRange] = useState<{ top: number; bottom: number; activeTop: number; activeBottom: number } | null>(null);

  // モバイル上部メニュー：active を中央に。項目幅はテキストに合わせ、gap を固定。
  // translateX は active の実測中央位置から算出。
  const mobileRowRef = useRef<HTMLDivElement>(null);
  const mobileItemRefs = useRef(new Map<string, HTMLButtonElement>());
  const [mobileTranslateX, setMobileTranslateX] = useState(0);
  // dragDelta を「カテゴリ何個分」へ正規化するための基準距離（コンテナ幅/3）
  const [mobileRefStep, setMobileRefStep] = useState(0);
  // スワイプ中のドラッグ量（px）。リリースでカテゴリ切替後に 0 へ。
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const swipeLockedRef = useRef<"h" | "v" | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    setInitialScale(Math.min(clientWidth / CANVAS_W, clientHeight / CANVAS_H));
  }, []);

  useEffect(() => {
    getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setSelectedCategory(cats[0].id);
    });
  }, []);

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

  // カテゴリ切替時にズーム／パン位置を初期に戻す。
  // 各カテゴリの TransformWrapper は常時マウントなので ref 経由で setTransform。
  useEffect(() => {
    if (!selectedCategory || initialScale == null) return;
    let cancelled = false;
    const reset = () => {
      if (cancelled) return;
      const ref = transformRefs.current.get(selectedCategory);
      if (ref) ref.setTransform(0, 0, initialScale, 0);
      else requestAnimationFrame(reset);
    };
    reset();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory, initialScale]);

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

  // テキスト span の登録。ref callback は安定化させて毎レンダーで剥がれないようにする。
  const registerTextRef = useCallback((id: string) => (el: HTMLSpanElement | null) => {
    if (el) textRefs.current.set(id, el);
    else textRefs.current.delete(id);
  }, []);

  const registerMobileItemRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) mobileItemRefs.current.set(id, el);
    else mobileItemRefs.current.delete(id);
  }, []);

  // モバイルメニュー：active 実測中央 → コンテナ中央へ寄せる translateX を算出
  const computeMobileTranslate = useCallback(() => {
    const row = mobileRowRef.current;
    const active = mobileItemRefs.current.get(selectedCategory);
    if (!row || !active) return;
    const containerWidth = row.parentElement?.clientWidth ?? window.innerWidth;
    const activeCenter = active.offsetLeft + active.offsetWidth / 2;
    setMobileTranslateX(containerWidth / 2 - activeCenter);
    setMobileRefStep(containerWidth / 1.5);
  }, [selectedCategory]);

  useLayoutEffect(() => {
    computeMobileTranslate();
    const raf = requestAnimationFrame(computeMobileTranslate);
    window.addEventListener("resize", computeMobileTranslate);
    const ro = new ResizeObserver(computeMobileTranslate);
    if (mobileRowRef.current) ro.observe(mobileRowRef.current);
    mobileItemRefs.current.forEach((el) => ro.observe(el));
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(computeMobileTranslate).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", computeMobileTranslate);
    };
  }, [computeMobileTranslate, categories]);

  // スワイプ：横方向と判定したらカテゴリを切り替え（リリース時にスナップ）
  const onMobileTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    swipeLockedRef.current = null;
    setIsDragging(true);
    setDragDelta(0);
  };
  const onMobileTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
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
  const finishMobileSwipe = () => {
    if (!isDragging) return;
    const idx = categories.findIndex((c) => c.id === selectedCategory);
    if (swipeLockedRef.current === "h" && idx >= 0 && Math.abs(dragDelta) >= 20) {
      // ドラッグ後にコンテナ中央へ来るべき位置 = active 中央 - dragDelta（row 内座標）。
      // 全項目から実測中央が最も近いものを選ぶ。
      const active = mobileItemRefs.current.get(selectedCategory);
      if (active) {
        const target = active.offsetLeft + active.offsetWidth / 2 - dragDelta;
        let bestIdx = idx;
        let bestDist = Infinity;
        categories.forEach((c, i) => {
          const el = mobileItemRefs.current.get(c.id);
          if (!el) return;
          const center = el.offsetLeft + el.offsetWidth / 2;
          const d = Math.abs(center - target);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        });
        if (bestIdx !== idx) setSelectedCategory(categories[bestIdx].id);
      }
    }
    setIsDragging(false);
    setDragDelta(0);
    swipeLockedRef.current = null;
  };

  // 縦線の位置をテキスト実寸から算出。フォント／レイアウト確定後に再計測。
  useLayoutEffect(() => {
    computeLineRange();
    // 1フレーム後にも測り直す（フォント／active切替時のサイズ変化を確実に拾う）
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const currentAudioUrl = categories.find((c) => c.id === selectedCategory)?.audioUrl;

  // Storage パス "audio/{categoryId}_{timestamp}_{元ファイル名}" から元ファイル名を抽出
  const currentAudioTitle = (() => {
    if (!currentAudioUrl) return "";
    try {
      const u = new URL(currentAudioUrl);
      const m = u.pathname.match(/\/o\/(.+)$/);
      const raw = decodeURIComponent(m?.[1] ?? "").split("/").pop() ?? "";
      const stripped = raw.replace(/^[^_]+_\d+_/, "");
      return stripped || raw;
    } catch {
      return "";
    }
  })();

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentAudioUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setIsPlaying(false);
      return;
    }
    if (audio.src !== currentAudioUrl) {
      audio.src = currentAudioUrl;
      if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    }
  }, [currentAudioUrl, isPlaying]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !currentAudioUrl) return;
    if (audio.paused) {
      if (audio.src !== currentAudioUrl) audio.src = currentAudioUrl;
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const selectedReady = !!selectedCategory && !!layouts[selectedCategory];
  const mobileSelectedIndex = Math.max(0, categories.findIndex((c) => c.id === selectedCategory));

  return (
    <div className="h-screen bg-white text-foreground flex flex-col overflow-hidden">
      <div className="relative flex-1 min-h-0">
        {/* カテゴリサイドバー */}
        {categories.length > 0 && (
          <nav className="hidden md:flex absolute top-0 left-0 h-full w-72 px-4 py-4 flex-col gap-1 overflow-y-auto z-10 backdrop-blur-sm pt-16" style={{ backgroundColor: `rgba(255,255,255,${NAV_OPACITY})` }}>
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
                  onClick={() => setSelectedCategory(c.id)}
                  className={`relative text-center py-1 transition-all ${
                    selectedCategory === c.id
                      ? `text-foreground font-light ${NAV_ACTIVE_TEXT_SIZE}`
                      : "text-gray-400 hover:text-foreground text-lg"
                  }`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <span
                    ref={registerTextRef(c.id)}
                    className="relative"
                  >
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        )}

        {/* モバイル：上部中央寄せ横メニュー（active が中央、左右スワイプで切替） */}
        {categories.length > 0 && (
          <nav
            className="md:hidden absolute top-0 left-0 right-0 z-10 backdrop-blur-sm py-4 overflow-hidden"
            style={{ backgroundColor: `rgba(255,255,255,${NAV_OPACITY})`, touchAction: "pan-y" }}
            onTouchStart={onMobileTouchStart}
            onTouchMove={onMobileTouchMove}
            onTouchEnd={finishMobileSwipe}
            onTouchCancel={finishMobileSwipe}
          >
            <div
              ref={mobileRowRef}
              className={`flex items-center whitespace-nowrap will-change-transform ${isDragging ? "" : "transition-transform duration-300 ease-out"}`}
              style={{
                transform: `translateX(${mobileTranslateX + dragDelta}px)`,
                gap: 48,
              }}
            >
              {categories.map((c, i) => {
                const isActive = c.id === selectedCategory;
                // 画面中央からの距離（slot 単位）。スクロール量に応じて遠い項目も連続的にフェードイン。
                const dragSlots = mobileRefStep > 0 ? dragDelta / mobileRefStep : 0;
                const dist = (i - mobileSelectedIndex) + dragSlots;
                const opacity = Math.max(0, Math.min(1, 2 - Math.abs(dist)));
                return (
                  <button
                    key={c.id}
                    ref={registerMobileItemRef(c.id)}
                    onClick={() => setSelectedCategory(c.id)}
                    className={`shrink-0 px-2 py-1 text-center transition-colors ${
                      isActive
                        ? `text-foreground font-light ${NAV_ACTIVE_TEXT_SIZE}`
                        : "text-gray-400 text-base"
                    } ${isDragging ? "" : "transition-opacity duration-300 ease-out"}`}
                    style={{ opacity }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        {/* キャンバス表示：全カテゴリを常時マウントし、非選択は visibility:hidden で隠すだけ */}
        <div ref={containerRef} className="absolute inset-0 overflow-hidden">
          {!selectedReady && (
            <div className="flex justify-center py-20 text-gray-400">Loading…</div>
          )}
          {initialScale != null &&
            categories.map((c) => {
              const layout = layouts[c.id];
              if (!layout) return null;
              const isSelected = c.id === selectedCategory;
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
                    initialScale={initialScale}
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
      </div>

      {/* 下部の丸い再生ボタン */}
      <audio
        ref={audioRef}
        loop
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      {currentAudioUrl && (
      <div className="group fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
        {/* ホバーで表示されるタイトル + 音量バー */}
        <div className="mb-3 pointer-events-none opacity-0 translate-y-1 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex flex-col gap-2 min-w-[200px] max-w-[280px]">
          <div className="text-xs text-foreground font-medium truncate" title={currentAudioTitle}>
            {currentAudioTitle || "音楽"}
          </div>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-500 shrink-0" fill="currentColor" aria-hidden="true">
              <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1Zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12Z" />
            </svg>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              aria-label="音量"
              className="flex-1 accent-foreground h-1"
            />
          </div>
        </div>
        {/* モバイル：再生中はタイトルと音量を常時表示 */}
        {isPlaying && (
          <div className="md:hidden mb-2 px-3 py-2 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow flex flex-col gap-1.5 min-w-[200px] max-w-[70vw]">
            <div className="text-xs text-foreground font-medium truncate" title={currentAudioTitle}>
              ♪ {currentAudioTitle || "音楽"}
            </div>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-500 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1Zm13.5 2a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12Z" />
              </svg>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                aria-label="音量"
                className="flex-1 accent-foreground h-1"
              />
            </div>
          </div>
        )}
        <div className="relative">
          {isPlaying && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                animation: `pulse ${PLAY_GLOW_DURATION} ${PLAY_GLOW_EASING} infinite`,
                boxShadow: `0 0 ${PLAY_GLOW_BLUR}px ${PLAY_GLOW_SPREAD}px ${PLAY_GLOW_COLOR}`,
              }}
            />
          )}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "一時停止" : "再生"}
          className="relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all bg-white hover:bg-gray-100 text-foreground border border-gray-200"
        >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5Z" />
          </svg>
        )}
      </button>
        </div>
      </div>
      )}
    </div>
  );
}
