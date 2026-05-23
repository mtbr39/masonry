"use client";

import { useEffect, useRef, useState } from "react";

const PLAY_GLOW_DURATION = "1.6s";
const PLAY_GLOW_EASING = "ease-in-out";
const PLAY_GLOW_BLUR = 22;
const PLAY_GLOW_SPREAD = 6;
const PLAY_GLOW_COLOR = "rgba(0,0,0,0.2)";

// Storage パス "audio/{categoryId}_{timestamp}_{元ファイル名}" から元ファイル名を抽出
function extractTitle(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/o\/(.+)$/);
    const raw = decodeURIComponent(m?.[1] ?? "").split("/").pop() ?? "";
    const stripped = raw.replace(/^[^_]+_\d+_/, "");
    return stripped || raw;
  } catch {
    return "";
  }
}

export default function AudioPlayer({ audioUrl }: { audioUrl: string | undefined }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const title = extractTitle(audioUrl);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audioUrl) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setIsPlaying(false);
      return;
    }
    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
      if (isPlaying) audio.play().catch(() => setIsPlaying(false));
    }
  }, [audioUrl, isPlaying]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      if (audio.src !== audioUrl) audio.src = audioUrl;
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        loop
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      {audioUrl && (
        <div className="group fixed bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center">
          {/* ホバーで表示されるタイトル + 音量バー */}
          <div className="mb-3 pointer-events-none opacity-0 translate-y-1 group-hover:pointer-events-auto group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex flex-col gap-2 min-w-[200px] max-w-[280px]">
            <div className="text-xs text-foreground font-medium truncate" title={title}>
              {title || "音楽"}
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
              <div className="text-xs text-foreground font-medium truncate" title={title}>
                ♪ {title || "音楽"}
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
    </>
  );
}
