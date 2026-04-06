"use client";

import { useEffect, useState, useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/context/AuthContext";
import { auth, storage } from "@/lib/firebase";
import { getCategories, addCategory, addPhoto } from "@/lib/firestore";
import { Category } from "@/lib/types";

const MAX_WIDTH = 3000;
const MAX_HEIGHT = 2000;

type FileEntry = {
  id: string;
  file: File;
  preview: string;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
};

function resizeImage(f: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(
        w > MAX_WIDTH ? MAX_WIDTH / w : 1,
        h > MAX_HEIGHT ? MAX_HEIGHT / h : 1
      );
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("canvas.toBlob failed")); return; }
          resolve({ blob, width: w, height: h });
        },
        "image/jpeg",
        0.92
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/admin/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      getCategories().then((cats) => {
        setCategories(cats);
        if (cats.length > 0) setSelectedCategoryId(cats[0].id);
      });
    }
  }, [user]);

  function addFiles(incoming: File[]) {
    const imageFiles = incoming.filter((f) => f.type.startsWith("image/"));
    const entries: FileEntry[] = imageFiles.map((f) => ({
      id: `${Date.now()}_${Math.random()}`,
      file: f,
      preview: URL.createObjectURL(f),
      status: "pending",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...entries]);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files));
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const entry = prev.find((f) => f.id === id);
      if (entry) URL.revokeObjectURL(entry.preview);
      return prev.filter((f) => f.id !== id);
    });
  }

  async function handleAddCategory(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const id = await addCategory(newCategoryName.trim());
    const updated = [...categories, { id, name: newCategoryName.trim() }];
    setCategories(updated);
    setSelectedCategoryId(id);
    setNewCategoryName("");
  }

  async function handleUpload(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const pending = files.filter((f) => f.status === "pending");
    if (!pending.length || !selectedCategoryId) return;
    setUploading(true);
    setMessage("");

    for (const entry of pending) {
      setFiles((prev) =>
        prev.map((f) => (f.id === entry.id ? { ...f, status: "uploading" } : f))
      );
      try {
        const { blob, width, height } = await resizeImage(entry.file);
        const storageRef = ref(storage, `photos/${Date.now()}_${entry.file.name}`);
        const task = uploadBytesResumable(storageRef, blob);

        await new Promise<void>((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setFiles((prev) =>
                prev.map((f) => (f.id === entry.id ? { ...f, progress: pct } : f))
              );
            },
            reject,
            resolve
          );
        });

        const url = await getDownloadURL(storageRef);
        await addPhoto({ url, categoryId: selectedCategoryId, width, height });
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: "done", progress: 100 } : f))
        );
      } catch (err) {
        console.error(err);
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: "error" } : f))
        );
      }
    }

    setUploading(false);
    setMessage("アップロードが完了しました");
  }

  const pendingCount = files.filter((f) => f.status === "pending").length;

  if (loading || !user) return null;

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <header className="px-6 py-6 flex items-center justify-between border-b border-gray-200">
        <h1 className="text-xl font-bold">Admin</h1>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Public site
          </a>
          <button
            onClick={() => signOut(auth)}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-10">
        {/* キャンバスエディタへのリンク */}
        <section>
          <a
            href="/admin/canvas"
            className="flex items-center justify-between px-5 py-4 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <div>
              <p className="font-semibold text-blue-800">キャンバスを編集</p>
              <p className="text-sm text-blue-600 mt-0.5">写真・テキストをドラッグして自由に配置</p>
            </div>
            <span className="text-blue-400 text-xl">→</span>
          </a>
        </section>
        {/* カテゴリ追加 */}
        <section>
          <h2 className="text-lg font-semibold mb-4">カテゴリを追加</h2>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="カテゴリ名"
              className="flex-1 bg-gray-100 text-gray-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              追加
            </button>
          </form>
          {categories.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <li key={c.id} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                  {c.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 写真アップロード */}
        <section>
          <h2 className="text-lg font-semibold mb-4">写真をアップロード</h2>
          <form onSubmit={handleUpload} className="flex flex-col gap-4">
            {/* カテゴリ選択 */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">カテゴリ</label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="bg-gray-100 text-gray-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categories.length === 0 && (
                  <option value="">（先にカテゴリを作成してください）</option>
                )}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* ドロップゾーン */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-10 cursor-pointer transition-colors select-none ${
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-gray-500 bg-gray-50"
              }`}
            >
              <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-gray-400">
                ドラッグ＆ドロップ、またはクリックして選択
              </p>
              <p className="text-xs text-gray-600">複数ファイル対応 · 最大 3000×2000px に自動リサイズ</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleInputChange}
                className="hidden"
              />
            </div>

            {/* プレビュー一覧 */}
            {files.length > 0 && (
              <ul className="grid grid-cols-3 gap-3">
                {files.map((entry) => (
                  <li key={entry.id} className="relative rounded-lg overflow-hidden bg-gray-800 aspect-square">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.preview}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {/* オーバーレイ: uploading / done / error */}
                    {entry.status === "uploading" && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                        <span className="text-sm font-medium">{entry.progress}%</span>
                        <div className="w-3/4 bg-gray-700 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${entry.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {entry.status === "done" && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {entry.status === "error" && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                    {/* 削除ボタン (pending のみ) */}
                    {entry.status === "pending" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(entry.id); }}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 rounded-full w-6 h-6 flex items-center justify-center transition-colors"
                      >
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {message && (
              <p className={message.includes("エラー") ? "text-red-400 text-sm" : "text-green-400 text-sm"}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={uploading || pendingCount === 0 || !selectedCategoryId}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 rounded-lg font-semibold transition-colors"
            >
              {uploading
                ? "アップロード中…"
                : pendingCount > 0
                ? `${pendingCount}枚をアップロード`
                : "アップロード"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
