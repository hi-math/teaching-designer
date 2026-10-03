"use client";

import Link from "next/link";

/** 헤더의 작업 전환 버튼 — 수업 설계(대시보드)와 아이디어 도출(성취기준 연결 탐색기)을 오간다 */
export type AppMode = "design" | "ideation";

const MODES: { mode: AppMode; label: string; href: string }[] = [
  { mode: "design", label: "수업 설계", href: "/dashboard" },
  { mode: "ideation", label: "아이디어 도출", href: "/ideation" },
];

export function AppModeSwitch({ current }: { current: AppMode }) {
  return (
    <nav aria-label="작업 전환" className="flex shrink-0 items-center gap-1 rounded-lg bg-black/15 p-1">
      {MODES.map((m) =>
        m.mode === current ? (
          <span
            key={m.mode}
            aria-current="page"
            className="rounded-md bg-white px-4 py-2 text-[14px] font-semibold text-[#D1260F] shadow-sm"
          >
            {m.label}
          </span>
        ) : (
          <Link
            key={m.mode}
            href={m.href}
            className="rounded-md px-4 py-2 text-[14px] font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white"
          >
            {m.label}
          </Link>
        ),
      )}
    </nav>
  );
}
