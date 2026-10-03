"use client";

// 하단 상태 표시줄 — 표시량/전체량 · 표시 제한 안내 · 범례 (사양 §5.1)

import { useState } from "react";
import GraphLegend from "./GraphLegend";

export default function GraphStatus({ summary, notes, hierarchy }: { summary: string; notes: string[]; hierarchy: boolean }) {
  const [legendOpen, setLegendOpen] = useState(false);
  return (
    <div className="relative shrink-0 border-t border-gray-200 bg-white">
      {legendOpen && (
        <div id="graph-legend" className="border-b border-gray-100 px-4 py-3">
          <GraphLegend hierarchy={hierarchy} />
        </div>
      )}
      <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        <p aria-live="polite" className="text-[12px] font-medium tabular-nums text-gray-700">
          {summary}
        </p>
        {notes.map((n) => (
          <p key={n} className="text-[12px] text-amber-700">
            {n}
          </p>
        ))}
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          aria-controls="graph-legend"
          className="ml-auto min-h-8 rounded-md px-2 text-[12px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >
          범례 {legendOpen ? "닫기" : "보기"}
        </button>
      </div>
    </div>
  );
}
