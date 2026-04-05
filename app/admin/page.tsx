"use client";

import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useAuth } from "@/context/AuthContext";
import { auth, storage } from "@/lib/firebase";
import { getCategories, addCategory, addPhoto } from "@/lib/firestore";
import { Category } from "@/lib/types";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/admin/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      getCategories().then((cats) => {
        setCategories(cats);
        if (cats.length > 0) setSelectedCategoryId(cats[0].id);
      });
    }
  }, [user]);

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const id = await addCategory(newCategoryName.trim());
    const updated = [...categories, { id, name: newCategoryName.trim() }];
    setCategories(updated);
    setSelectedCategoryId(id);
    setNewCategoryName("");
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
  }

  function getImageDimensions(f: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || !selectedCategoryId) return;
    setUploading(true);
    setMessage("");
    try {
      const { width, height } = await getImageDimensions(file);
      const storageRef = ref(storage, `photos/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          reject,
          resolve
        );
      });

      const url = await getDownloadURL(storageRef);
      await addPhoto({ url, categoryId: selectedCategoryId, width, height });
      setMessage("アップロードが完了しました");
      setFile(null);
      setProgress(0);
    } catch (err) {
      console.error(err);
      setMessage("エラーが発生しました");
    } finally {
      setUploading(false);
    }
  }

  if (loading || !user) return null;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <header className="px-6 py-6 flex items-center justify-between border-b border-gray-800">
        <h1 className="text-xl font-bold">Admin</h1>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
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

      <div className="max-w-xl mx-auto px-6 py-10 flex flex-col gap-10">
        {/* カテゴリ追加 */}
        <section>
          <h2 className="text-lg font-semibold mb-4">カテゴリを追加</h2>
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="カテゴリ名"
              className="flex-1 bg-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                <li key={c.id} className="bg-gray-800 px-3 py-1 rounded-full text-sm">
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
            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">カテゴリ</label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="bg-gray-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            <div className="flex flex-col gap-1">
              <label className="text-sm text-gray-400">画像ファイル</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="text-sm file:mr-3 file:bg-gray-700 file:text-white file:rounded file:border-0 file:px-3 file:py-1"
              />
            </div>

            {uploading && (
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {message && (
              <p className={message.includes("エラー") ? "text-red-400" : "text-green-400"}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={uploading || !file || !selectedCategoryId}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2 rounded-lg font-semibold transition-colors"
            >
              {uploading ? `アップロード中… ${progress}%` : "アップロード"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
