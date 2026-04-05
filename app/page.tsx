"use client";

import { useEffect, useState } from "react";
import { MasonryPhotoAlbum } from "react-photo-album";
import "react-photo-album/masonry.css";
import { getPhotos, getCategories } from "@/lib/firestore";
import { Photo, Category } from "@/lib/types";

type AlbumPhoto = {
  src: string;
  width: number;
  height: number;
  key: string;
};

export default function HomePage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    getPhotos(selectedCategory).then((p) => {
      setPhotos(p);
      setLoading(false);
    });
  }, [selectedCategory]);

  const albumPhotos: AlbumPhoto[] = photos.map((p) => ({
    src: p.url,
    width: p.width,
    height: p.height,
    key: p.id,
  }));

  return (
    <main className="min-h-screen bg-white text-gray-900 flex flex-col">
      <header className="px-6 py-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Photo Portfolio</h1>
        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          Admin
        </a>
      </header>

      <div className="flex flex-1 px-6 pb-12 gap-10">
        {/* サイドバー */}
        {categories.length > 0 && (
          <nav className="w-32 shrink-0 flex flex-col gap-1 pt-1">
            <button
              onClick={() => setSelectedCategory(undefined)}
              className={`text-left text-sm py-1 transition-colors ${
                selectedCategory === undefined
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

        {/* フォトグリッド */}
        <section className="flex-1 min-w-0">
          {loading ? (
            <div className="flex justify-center py-20 text-gray-400">Loading…</div>
          ) : albumPhotos.length === 0 ? (
            <div className="flex justify-center py-20 text-gray-500">No photos yet.</div>
          ) : (
            <MasonryPhotoAlbum
              photos={albumPhotos}
              columns={(width) => (width < 600 ? 1 : width < 900 ? 2 : 3)}
              spacing={8}
              render={{
                image: ({ alt, src, style }) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src as string}
                    alt={alt ?? "photo"}
                    style={{ ...style, width: "100%", height: "auto", display: "block" }}
                  />
                ),
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}
