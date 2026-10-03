"use client";

// 공유·내보내기 버튼 (사양 §11)

import { useEffect, useRef, useState } from "react";

export function ShareButton({ onShare }: { onShare: () => Promise<boolean> }) {
  const [done, setDone] = useState<null | boolean>(null);
  return (
    <button
      type="button"
      onClick={async () => {
        setDone(await onShare());
        setTimeout(() => setDone(null), 2000);
      }}
      className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <span aria-live="polite">{done === true ? "링크 복사됨" : done === false ? "복사 실패" : "공유"}</span>
    </button>
  );
}

export default function ExportMenu({
  onJson,
  onPng,
  pngAvailable,
  limited,
}: {
  onJson: (scope: "visible" | "matching") => Promise<void>;
  onPng: (full: boolean) => Promise<void>;
  pngAvailable: boolean;
  /** 표시 한도 때문에 화면과 조건 전체가 다른가 (중심 탐색) */
  limited: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const item = "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-40";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
        </svg>
        {busy ? "내보내는 중…" : "내보내기"}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-80 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">JSON · 원문과 근거 포함</p>
          <button type="button" role="menuitem" disabled={busy} onClick={() => run(() => onJson("visible"))} className={item}>
            <span className="text-[13px] font-medium text-gray-800">현재 화면에 표시된 항목</span>
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => run(() => onJson("matching"))} className={item}>
            <span className="text-[13px] font-medium text-gray-800">현재 조건에 맞는 전체 항목</span>
            {limited && <span className="text-[11px] text-gray-500">중심 탐색의 표시 한도를 적용하기 전 결과</span>}
          </button>
          <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">PNG · 제목·범례·조건 포함</p>
          <button type="button" role="menuitem" disabled={busy || !pngAvailable} onClick={() => run(() => onPng(false))} className={item}>
            <span className="text-[13px] font-medium text-gray-800">현재 viewport</span>
          </button>
          <button type="button" role="menuitem" disabled={busy || !pngAvailable} onClick={() => run(() => onPng(true))} className={item}>
            <span className="text-[13px] font-medium text-gray-800">화면 맞춤 (표시 중인 전체 Graph)</span>
          </button>
          <p className="px-3 pb-1.5 pt-1 text-[11px] leading-[1.5] text-gray-500">
            {pngAvailable ? "PNG에는 현재 표시 범위만 포함됩니다." : "PNG는 Graph 화면에서 내보낼 수 있습니다."}
          </p>
          {error && <p className="px-3 pb-1.5 text-[12px] text-red-600">내보내지 못했습니다: {error}</p>}
        </div>
      )}
    </div>
  );
}
