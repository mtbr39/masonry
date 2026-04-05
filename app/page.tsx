"use client";

import { useEffect, useRef, useState } from "react";
import { MasonryPhotoAlbum } from "react-photo-album";
import "react-photo-album/masonry.css";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
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
  const sectionRef = useRef<HTMLElement>(null);
  const [sectionWidth, setSectionWidth] = useState(0);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSectionWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
    <div className="h-screen bg-white text-gray-900 flex flex-col overflow-hidden">
      {/* 固定ヘッダー */}
      <header className="shrink-0 px-6 py-8 flex items-center justify-between border-b border-gray-100 bg-white z-10">
        <h1 className="text-3xl font-bold tracking-tight">Photo Portfolio</h1>
        <a href="/admin" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          Admin
        </a>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 固定サイドバー */}
        {categories.length > 0 && (
          <nav className="shrink-0 w-32 px-6 py-4 flex flex-col gap-1 overflow-y-auto border-r border-gray-100 bg-white z-10">
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

        {/* ズーム・パン可能なフォトグリッド */}
        <section ref={sectionRef} className="flex-1 min-w-0 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-20 text-gray-400">Loading…</div>
          ) : albumPhotos.length === 0 ? (
            <div className="flex justify-center py-20 text-gray-500">No photos yet.</div>
          ) : (
            sectionWidth > 0 && (
              <TransformWrapper
                minScale={0.3}
                maxScale={4}
                initialScale={1}
                wheel={{ step: 0.1 }}
                panning={{ velocityDisabled: false }}
              >
                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                >
                  <div style={{ width: sectionWidth, padding: "24px", boxSizing: "border-box" }}>
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
                  </div>
                </TransformComponent>
              </TransformWrapper>
            )
          )}
        </section>
      </div>
    </div>
  );
}
