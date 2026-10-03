"use client";

// 범례 — 색만으로 구분하지 않도록 관계 유형은 선 모양, 교과는 교과명과 함께 보여 준다 (사양 §6, §12.2)

import { RELATION_LABELS, WEIGHT_STYLES } from "@/lib/standards-graph/relations";
import { SUBJECT_FAMILIES, SUBJECT_ORDER, SUBJECT_PALETTE } from "@/lib/standards-graph/subjectPalette";
import { RELATION_TYPES, WEIGHTS } from "@/lib/standards-graph/types";
import { LineSample } from "./ui";

export default function GraphLegend({ hierarchy }: { hierarchy: boolean }) {
  return (
    <div className="grid gap-4 text-[12px] text-gray-600 sm:grid-cols-3">
      <div>
        <p className="mb-1.5 font-semibold text-gray-700">관계 유형</p>
        <ul className="space-y-1">
          {(hierarchy ? (["learning_hierarchy"] as const) : RELATION_TYPES).map((t) => (
            <li key={t} className="flex items-center gap-2">
              <LineSample type={t} width={28} />
              {RELATION_LABELS[t]}
              {t === "learning_hierarchy" && <span className="text-gray-400">{hierarchy ? "foundation → application" : "화살표는 학습 흐름에서만"}</span>}
            </li>
          ))}
        </ul>
        {!hierarchy && <p className="mt-1.5 text-gray-400">여러 유형이 겹치면 점수가 가장 높은 유형의 선으로 그립니다.</p>}
      </div>
      <div>
        <p className="mb-1.5 font-semibold text-gray-700">관계 점수 (선 두께)</p>
        <ul className="space-y-1">
          {WEIGHTS.map((w) => (
            <li key={w} className="flex items-center gap-2">
              <svg width="28" height="8" aria-hidden>
                <line x1="1" y1="4" x2="27" y2="4" stroke="#475569" strokeWidth={WEIGHT_STYLES[w].width + 0.6} strokeOpacity={Math.max(0.35, WEIGHT_STYLES[w].opacity)} />
              </svg>
              <span className="tabular-nums">{w}</span> {WEIGHT_STYLES[w].label}
            </li>
          ))}
        </ul>
        <ul className="mt-2 space-y-1">
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full border border-gray-400 bg-gray-400/45" />
            현재 조건에 맞는 관계 없음
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-3.5 rounded-full border-[3px] border-gray-900 bg-gray-300" />
            선택
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-3.5 rounded-full border-[4px] border-double border-gray-900 bg-gray-300" />
            비교 대상 ①②
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-gray-300 outline outline-2 outline-offset-1 outline-amber-500" />
            위치 고정
          </li>
        </ul>
      </div>
      <div>
        <p className="mb-1.5 font-semibold text-gray-700">교과 색</p>
        <ul className="space-y-1">
          {SUBJECT_FAMILIES.map((f) => {
            const members = SUBJECT_ORDER.filter((s) => SUBJECT_PALETTE[s].family === f.family);
            return (
              <li key={f.family} className="flex items-center gap-2">
                <span className="flex shrink-0 -space-x-1">
                  {members.slice(0, 4).map((s) => (
                    <span key={s} className="inline-block h-3 w-3 rounded-full ring-1 ring-white" style={{ backgroundColor: SUBJECT_PALETTE[s].fill }} />
                  ))}
                </span>
                {f.label}
                {members.length > 1 && <span className="text-gray-400">({members.length}개 교과)</span>}
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 text-gray-400">색은 교과군을 나타내는 보조 표시입니다. 교과명은 tooltip·목록·상세에 함께 표시합니다.</p>
      </div>
    </div>
  );
}
