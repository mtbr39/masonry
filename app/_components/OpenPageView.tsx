"use client";

import { useEffect, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import { doc, onSnapshot } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { signInAnonymously } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";
import { saveCanvasLayout } from "@/lib/firestore";
import { CanvasItem } from "@/lib/types";
import {
  OPEN_PAGE_ID,
  OPEN_CANVAS_W,
  OPEN_COL_W,
  insertAtTop,
  removeAndCompact,
} from "@/lib/openPage";
import { useAuth } from "@/context/AuthContext";
import type { ContainerSize } from "./CanvasView";

const MAX_UPLOAD_W = 1200;
const MAX_UPLOAD_H = 1200;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function ensureAnonAuth() {
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

function resizeImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(
        w > MAX_UPLOAD_W ? MAX_UPLOAD_W / w : 1,
        h > MAX_UPLOAD_H ? MAX_UPLOAD_H / h : 1,
      );
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("toBlob failed"));
          resolve({ blob, width: w, height: h });
        },
        "image/jpeg",
        0.9,
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

type Props = {
  containerSize: ContainerSize | null;
};

export default function OpenPageView({ containerSize }: Props) {
  const { user } = useAuth();
  const isAdmin = !!user && !user.isAnonymous;
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [textNickname, setTextNickname] = useState("");
  const [imgOpen, setImgOpen] = useState(false);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string>("");
  const [imgNickname, setImgNickname] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const itemsRef = useRef<CanvasItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Firestore リアルタイム購読
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "canvas", OPEN_PAGE_ID), (snap) => {
      const data = snap.data();
      const list = (data?.items ?? []) as CanvasItem[];
      setItems(list);
    });
    return unsub;
  }, []);

  const contentBottom = items.reduce((m, i) => Math.max(m, i.y + i.height), 0);
  const canvasH = Math.max(contentBottom + 80, containerSize?.h ?? 800);

  // 初期表示: 横幅フィット・上端揃え。PC（サイドバー有）は 80% で表示。
  useEffect(() => {
    if (!containerSize || !transformRef.current) return;
    const isPc = containerSize.offsetLeft > 0;
    const effectiveW = containerSize.w - containerSize.offsetLeft;
    const ratio = isPc ? 0.8 : 1;
    const scale = (effectiveW / OPEN_CANVAS_W) * ratio;
    const contentW = OPEN_CANVAS_W * scale;
    const x = containerSize.offsetLeft + (effectiveW - contentW) / 2;
    transformRef.current.setTransform(x, containerSize.offsetTop, scale, 0);
  }, [containerSize]);

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImgFile(file);
    setImgPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setImgNickname("");
    setImgOpen(true);
  }

  function closeImageModal() {
    setImgOpen(false);
    setImgFile(null);
    setImgNickname("");
    setImgPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
  }

  async function handleSubmitImage() {
    if (!imgFile) return;
    setBusy(true);
    try {
      await ensureAnonAuth();
      const { blob, width, height } = await resizeImage(imgFile);
      const path = `open/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
      await uploadBytes(storageRef(storage, path), blob);
      const url = await getDownloadURL(storageRef(storage, path));
      const { position, updatedItems } = insertAtTop(itemsRef.current, width, height);
      const nickname = imgNickname.trim();
      const newItem: CanvasItem = {
        id: uid(),
        type: "photo",
        ...position,
        zIndex: 1,
        photoUrl: url,
        ...(nickname ? { nickname } : {}),
      };
      await saveCanvasLayout([...updatedItems, newItem], OPEN_PAGE_ID);
      closeImageModal();
    } catch (err) {
      console.error(err);
      alert("アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!isAdmin) return;
    if (!confirm("この投稿を削除しますか？")) return;
    setBusy(true);
    try {
      const target = itemsRef.current.find((it) => it.id === id);
      const next = removeAndCompact(itemsRef.current, id);
      await saveCanvasLayout(next, OPEN_PAGE_ID);
      if (target?.type === "photo" && target.photoUrl) {
        try {
          await deleteObject(storageRef(storage, target.photoUrl));
        } catch (err) {
          console.warn("storage delete failed", err);
        }
      }
    } catch (err) {
      console.error(err);
      alert("削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitText() {
    const text = textValue.trim();
    if (!text) {
      setTextOpen(false);
      return;
    }
    setBusy(true);
    try {
      await ensureAnonAuth();
      const fontSize = 120;
      const minH = Math.round((OPEN_COL_W * 3) / 4);
      const charsPerLine = 9;
      const lines = text
        .split("\n")
        .reduce((sum, ln) => sum + Math.max(1, Math.ceil(ln.length / charsPerLine)), 0);
      const contentH = Math.round(lines * fontSize * 1.4 + 120);
      const boxH = Math.max(minH, contentH);
      const { position, updatedItems } = insertAtTop(itemsRef.current, OPEN_COL_W, boxH);
      const nickname = textNickname.trim();
      const newItem: CanvasItem = {
        id: uid(),
        type: "text",
        ...position,
        zIndex: 1,
        content: text,
        fontSize,
        color: "#161616",
        fontWeight: "normal",
        ...(nickname ? { nickname } : {}),
      };
      await saveCanvasLayout([...updatedItems, newItem], OPEN_PAGE_ID);
      setTextValue("");
      setTextNickname("");
      setTextOpen(false);
    } catch (err) {
      console.error(err);
      alert("送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const initT = containerSize
    ? (() => {
        const isPc = containerSize.offsetLeft > 0;
        const effectiveW = containerSize.w - containerSize.offsetLeft;
        const ratio = isPc ? 0.8 : 1;
        const scale = (effectiveW / OPEN_CANVAS_W) * ratio;
        const contentW = OPEN_CANVAS_W * scale;
        return {
          scale,
          x: containerSize.offsetLeft + (effectiveW - contentW) / 2,
          y: containerSize.offsetTop,
        };
      })()
    : null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {initT && (
      <TransformWrapper
        ref={(r) => {
          transformRef.current = r;
        }}
        minScale={0.05}
        maxScale={4}
        initialScale={initT.scale}
        initialPositionX={initT.x}
        initialPositionY={initT.y}
        wheel={{ step: 0.05 }}
        panning={{ velocityDisabled: false }}
        alignmentAnimation={{ disabled: true }}
        limitToBounds={false}
        centerZoomedOut={false}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
          <div
            style={{
              position: "relative",
              width: OPEN_CANVAS_W,
              height: canvasH,
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
                }}
              >
                {item.type === "photo" && item.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photoUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
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
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      border: "6px solid #d1d5db",
                      boxSizing: "border-box",
                    }}
                  >
                    {item.content}
                  </div>
                ) : null}
                {item.nickname && (
                  <div
                    style={{
                      position: "absolute",
                      maxWidth: "90%",
                      fontSize: 72,
                      lineHeight: 1.2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      userSelect: "none",
                      pointerEvents: "none",
                      ...(item.type === "photo"
                        ? {
                            top: 0,
                            left: 0,
                            background: "rgba(0,0,0,0.55)",
                            color: "#fff",
                            padding: "10px 20px",
                          }
                        : {
                            top: 28,
                            left: 36,
                            color: "#161616",
                          }),
                    }}
                  >
                    {item.nickname}
                  </div>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    disabled={busy}
                    style={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      width: 64,
                      height: 64,
                      borderRadius: "9999px",
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      fontSize: 32,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      border: "none",
                    }}
                    aria-label="削除"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </TransformComponent>
      </TransformWrapper>
      )}

      {/* upload bar */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-3 p-4 pointer-events-none z-10">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImagePick}
          className="hidden"
        />
        <button
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="pointer-events-auto px-5 py-2.5 rounded-full bg-gray-200 text-foreground text-sm shadow-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
        >
          画像を追加
        </button>
        <button
          disabled={busy}
          onClick={() => setTextOpen(true)}
          className="pointer-events-auto px-5 py-2.5 rounded-full bg-gray-200 text-foreground text-sm shadow-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
        >
          テキストを追加
        </button>
      </div>

      {textOpen && (
        <div
          className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 p-6"
          onClick={() => setTextOpen(false)}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-md flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-foreground">テキストを追加</h3>
            <textarea
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value.slice(0, 100))}
              maxLength={100}
              rows={5}
              className="w-full border border-gray-300 rounded-lg p-3 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ここに書く（最大100文字）"
            />
            <p className="text-xs text-gray-500 text-right">{textValue.length} / 100</p>
            <input
              type="text"
              value={textNickname}
              onChange={(e) => setTextNickname(e.target.value.slice(0, 20))}
              maxLength={20}
              className="w-full border border-gray-300 rounded-lg p-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ニックネーム（任意）"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTextOpen(false);
                  setTextNickname("");
                }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-foreground"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmitText}
                disabled={busy || !textValue.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-foreground text-white disabled:opacity-50"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}

      {imgOpen && (
        <div
          className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 p-6"
          onClick={closeImageModal}
        >
          <div
            className="bg-white rounded-2xl p-5 w-full max-w-md flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-foreground">画像を追加</h3>
            {imgPreview && (
              <div className="relative w-full overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgPreview}
                  alt=""
                  className="block w-full max-h-64 object-contain"
                />
                {imgNickname.trim() && (
                  <div className="absolute top-0 left-0 max-w-[90%] truncate bg-black/55 text-white text-base px-3 py-1.5">
                    {imgNickname.trim()}
                  </div>
                )}
              </div>
            )}
            <input
              type="text"
              autoFocus
              value={imgNickname}
              onChange={(e) => setImgNickname(e.target.value.slice(0, 20))}
              maxLength={20}
              className="w-full border border-gray-300 rounded-lg p-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ニックネーム（任意）"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={closeImageModal}
                className="px-4 py-2 text-sm text-gray-500 hover:text-foreground"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmitImage}
                disabled={busy || !imgFile}
                className="px-4 py-2 text-sm rounded-lg bg-foreground text-white disabled:opacity-50"
              >
                {busy ? "送信中…" : "貼る"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
