"use client";

// 탐색기 공통 작은 UI 조각

import type { ReactNode } from "react";
import { RELATION_COLORS, RELATION_LABELS, RELATION_LINE_STYLES } from "@/lib/standards-graph/relations";
import { subjectColor } from "@/lib/standards-graph/subjectPalette";
import type { RelationType } from "@/lib/standards-graph/types";

export function SubjectDot({ subject, size = 10 }: { subject: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: subjectColor(subject) }}
    />
  );
}

/** 교과명은 색과 함께 항상 글자로 보여 준다 */
export function SubjectTag({ subject, domain }: { subject: string; domain?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-gray-600">
      <SubjectDot subject={subject} size={8} />
      <span className="truncate">
        {subject}
        {domain ? <span className="text-gray-400"> · {domain}</span> : null}
      </span>
    </span>
  );
}

export function TypeBadge({ type, weight, muted }: { type: RelationType; weight?: number; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
        muted ? "border-gray-200 text-gray-400" : "border-gray-300 text-gray-700"
      }`}
    >
      <LineSample type={type} width={14} />
      {RELATION_LABELS[type]}
      {weight !== undefined ? <span className="tabular-nums text-gray-500">{weight || "—"}</span> : null}
    </span>
  );
}

export function LineSample({ type, width = 22 }: { type: RelationType; width?: number }) {
  const style = RELATION_LINE_STYLES[type];
  return (
    <svg width={width} height="8" aria-hidden className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2={width - 1}
        y2="4"
        stroke={RELATION_COLORS[type]}
        strokeWidth="2"
        strokeDasharray={style === "dashed" ? "5 3" : style === "dotted" ? "1.5 2.5" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WeightPill({ weight, label }: { weight: number; label?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full bg-gray-900 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
      title={label}
    >
      {weight}
    </span>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-semibold text-gray-500">{children}</h3>
      {aside}
    </div>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-[#D1260F] border-t-transparent ${className}`} />;
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 w-11 items-center justify-center rounded-lg border transition disabled:opacity-40 ${
        active ? "border-red-200 bg-red-50 text-red-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

/** 원문은 줄바꿈을 보존해 그대로 보여 준다 (HTML 로 해석하지 않는다) */
export function OriginalText({ text, className = "" }: { text: string; className?: string }) {
  return <p className={`whitespace-pre-wrap break-keep text-[14px] leading-[1.6] text-gray-800 ${className}`}>{text}</p>;
}
