"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getPhotos, getCanvasLayout, saveCanvasLayout, getCategories } from "@/lib/firestore";
import { Photo, CanvasItem, Category } from "@/lib/types";

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const INITIAL_ZOOM = 0.28;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

type DragState = {
  id: string;
  mode: "move" | "resize";
  startMouseX: number;
  startMouseY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
};

export default function CanvasEditorPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/admin/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    getPhotos().then(setPhotos);
    getCategories().then((cats) => {
      setCategories(cats);
      if (cats.length > 0) setSelectedCategory((prev) => prev || cats[0].id);
    });
  }, [user]);

  useEffect(() => {
    if (!user || !selectedCategory) return;
    setSelectedId(null);
    setEditingTextId(null);
    getCanvasLayout(selectedCategory).then((data) =>
      setItems(data.map((item) => ({ ...item, zIndex: Math.max(1, item.zIndex) })))
    );
  }, [user, selectedCategory]);

  // ── mouse move / up on window ──────────────────────────────────────────────
  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current;
    if (!drag || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const dxCanvas = (e.clientX - drag.startMouseX) / zoom;
    const dyCanvas = (e.clientY - drag.startMouseY) / zoom;

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== drag.id) return item;
        if (drag.mode === "move") {
          return {
            ...item,
            x: Math.max(0, Math.min(CANVAS_W - item.width, drag.origX + dxCanvas)),
            y: Math.max(0, Math.min(CANVAS_H - item.height, drag.origY + dyCanvas)),
          };
        } else {
          // resize
          return {
            ...item,
            width: Math.max(40, drag.origW + dxCanvas),
            height: Math.max(20, drag.origH + dyCanvas),
          };
        }
      })
    );
    void rect;
  }, [zoom]);

  const handleWindowMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [handleWindowMouseMove, handleWindowMouseUp]);

  // ── keyboard delete ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (editingTextId) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        setItems((prev) => prev.filter((i) => i.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, editingTextId]);

  // ── add photo from sidebar ─────────────────────────────────────────────────
  function addPhoto(photo: Photo) {
    const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 0);
    const aspect = photo.width / photo.height;
    const w = 400;
    const h = Math.round(w / aspect);
    const newItem: CanvasItem = {
      id: uid(),
      type: "photo",
      x: Math.round((CANVAS_W - w) / 2),
      y: Math.round((CANVAS_H - h) / 2),
      width: w,
      height: h,
      zIndex: maxZ + 1,
      photoUrl: photo.url,
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
  }

  // ── add text ───────────────────────────────────────────────────────────────
  function addText() {
    const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 0);
    const newItem: CanvasItem = {
      id: uid(),
      type: "text",
      x: 200,
      y: 200,
      width: 600,
      height: 120,
      zIndex: maxZ + 1,
      content: "テキストを入力",
      fontSize: 60,
      color: "#111111",
      fontWeight: "normal",
    };
    setItems((prev) => [...prev, newItem]);
    setSelectedId(newItem.id);
    setEditingTextId(newItem.id);
  }

  // ── save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedCategory) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await saveCanvasLayout(items, selectedCategory);
      setSaveMsg("保存しました");
    } catch {
      setSaveMsg("保存に失敗しました");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  // ── item drag start ────────────────────────────────────────────────────────
  function onItemMouseDown(e: ReactMouseEvent, item: CanvasItem) {
    if (editingTextId === item.id) return;
    e.stopPropagation();
    setSelectedId(item.id);
    dragRef.current = {
      id: item.id,
      mode: "move",
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
    };
  }

  // ── resize handle drag start ───────────────────────────────────────────────
  function onResizeMouseDown(e: ReactMouseEvent, item: CanvasItem) {
    e.stopPropagation();
    dragRef.current = {
      id: item.id,
      mode: "resize",
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
    };
  }

  // ── update selected item prop ──────────────────────────────────────────────
  function updateSelected(patch: Partial<CanvasItem>) {
    if (!selectedId) return;
    setItems((prev) => prev.map((i) => (i.id === selectedId ? { ...i, ...patch } : i)));
  }

  const selected = items.find((i) => i.id === selectedId) ?? null;

  if (loading || !user) return null;

  return (
    <div className="h-screen bg-gray-100 flex flex-col overflow-hidden select-none">
      {/* ── toolbar ── */}
      <header className="shrink-0 px-4 py-2 bg-white border-b border-gray-200 flex items-center gap-3">
        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-900 transition-colors mr-2">
          ← Admin
        </a>
        <span className="text-sm font-semibold text-gray-700">Canvas Editor</span>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="ml-3 bg-gray-100 text-gray-800 text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {categories.length === 0 && <option value="">（カテゴリ未作成）</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex-1" />
        {/* zoom controls */}
        <button
          onClick={() => setZoom((z) => Math.max(0.1, +(z - 0.05).toFixed(2)))}
          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-mono text-lg leading-none"
        >
          −
        </button>
        <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((z) => Math.min(2, +(z + 0.05).toFixed(2)))}
          className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center font-mono text-lg leading-none"
        >
          +
        </button>
        <button
          onClick={addText}
          className="ml-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded text-gray-700 transition-colors"
        >
          + テキスト
        </button>
        {saveMsg && (
          <span className={`text-xs ${saveMsg.includes("失敗") ? "text-red-500" : "text-green-600"}`}>
            {saveMsg}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-semibold transition-colors"
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ── left sidebar: photos ── */}
        <aside className="shrink-0 w-36 bg-white border-r border-gray-200 overflow-y-auto flex flex-col gap-1 p-2">
          <p className="text-xs text-gray-400 px-1 mb-1">写真を追加</p>
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => addPhoto(photo)}
              className="rounded overflow-hidden hover:ring-2 hover:ring-blue-400 transition-all"
              title="クリックでキャンバスに追加"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt=""
                className="w-full aspect-square object-cover"
                draggable={false}
              />
            </button>
          ))}
        </aside>

        {/* ── canvas area ── */}
        <div
          className="flex-1 min-w-0 overflow-auto bg-gray-200 cursor-default"
          onClick={() => { setSelectedId(null); setEditingTextId(null); }}
        >
          {/* spacer so canvas is centered with some padding */}
          <div style={{ padding: 40 }}>
            <div
              ref={canvasRef}
              style={{
                position: "relative",
                width: CANVAS_W * zoom,
                height: CANVAS_H * zoom,
                background: "#ffffff",
                boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* inner canvas at natural size, scaled */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: CANVAS_W,
                  height: CANVAS_H,
                  transformOrigin: "top left",
                  transform: `scale(${zoom})`,
                }}
              >
                {items
                  .slice()
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((item) => {
                    const isSelected = selectedId === item.id;
                    const isEditingText = editingTextId === item.id;
                    return (
                      <div
                        key={item.id}
                        style={{
                          position: "absolute",
                          left: item.x,
                          top: item.y,
                          width: item.width,
                          height: item.height,
                          zIndex: Math.max(1, item.zIndex),
                          outline: isSelected ? "2px solid #3b82f6" : "none",
                          outlineOffset: 2,
                          cursor: isEditingText ? "text" : "move",
                          boxSizing: "border-box",
                        }}
                        onMouseDown={(e) => onItemMouseDown(e, item)}
                        onDoubleClick={() => {
                          if (item.type === "text") setEditingTextId(item.id);
                        }}
                      >
                        {item.type === "photo" && item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.photoUrl}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
                            draggable={false}
                          />
                        ) : item.type === "text" ? (
                          isEditingText ? (
                            <textarea
                              autoFocus
                              value={item.content ?? ""}
                              onChange={(e) => updateSelected({ content: e.target.value })}
                              onMouseDown={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") setEditingTextId(null);
                                e.stopPropagation();
                              }}
                              style={{
                                width: "100%",
                                height: "100%",
                                fontSize: item.fontSize ?? 40,
                                color: item.color ?? "#111111",
                                fontWeight: item.fontWeight ?? "normal",
                                background: "transparent",
                                border: "none",
                                outline: "none",
                                resize: "none",
                                lineHeight: 1.4,
                                padding: 0,
                                cursor: "text",
                              }}
                            />
                          ) : (
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
                                pointerEvents: "none",
                                overflow: "hidden",
                              }}
                            >
                              {item.content}
                            </div>
                          )
                        ) : null}

                        {/* resize handle (bottom-right) */}
                        {isSelected && !isEditingText && (
                          <div
                            style={{
                              position: "absolute",
                              bottom: -6,
                              right: -6,
                              width: 14,
                              height: 14,
                              background: "#3b82f6",
                              borderRadius: 2,
                              cursor: "nwse-resize",
                              zIndex: 9999,
                            }}
                            onMouseDown={(e) => onResizeMouseDown(e, item)}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        {/* ── right panel: selected item properties ── */}
        {selected && (
          <aside className="shrink-0 w-52 bg-white border-l border-gray-200 p-4 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {selected.type === "photo" ? "写真" : "テキスト"}
              </span>
              <button
                onClick={() => {
                  setItems((prev) => prev.filter((i) => i.id !== selectedId));
                  setSelectedId(null);
                  setEditingTextId(null);
                }}
                className="text-xs text-red-400 hover:text-red-600"
              >
                削除
              </button>
            </div>

            {/* position / size */}
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key} className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">{key}</span>
                  <input
                    type="number"
                    value={Math.round(selected[key] as number)}
                    onChange={(e) => updateSelected({ [key]: Number(e.target.value) })}
                    className="w-full bg-gray-100 text-gray-900 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>

            {/* z-index */}
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">重なり順 (z)</span>
              <input
                type="number"
                value={selected.zIndex}
                min={1}
                onChange={(e) => updateSelected({ zIndex: Math.max(1, Number(e.target.value)) })}
                className="w-full bg-gray-100 text-gray-900 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>

            {/* text-only props */}
            {selected.type === "text" && (
              <>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">フォントサイズ</span>
                  <input
                    type="number"
                    value={selected.fontSize ?? 40}
                    onChange={(e) => updateSelected({ fontSize: Number(e.target.value) })}
                    className="w-full bg-gray-100 text-gray-900 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">色</span>
                  <input
                    type="color"
                    value={selected.color ?? "#111111"}
                    onChange={(e) => updateSelected({ color: e.target.value })}
                    className="w-full h-8 rounded cursor-pointer"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">太さ</span>
                  <select
                    value={selected.fontWeight ?? "normal"}
                    onChange={(e) => updateSelected({ fontWeight: e.target.value })}
                    className="w-full bg-gray-100 text-gray-900 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold</option>
                    <option value="100">100</option>
                    <option value="300">300</option>
                    <option value="500">500</option>
                    <option value="700">700</option>
                    <option value="900">900</option>
                  </select>
                </label>
                <button
                  onClick={() => setEditingTextId(selected.id)}
                  className="text-xs py-1.5 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  テキストを編集
                </button>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
