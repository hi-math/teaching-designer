'use client';

import type { ReactNode } from 'react';
import { getSubjectBadge } from './CardFields';
import type { IdeaItem } from './IdeasModal';
import type { StandardItem } from './StandardsModal';
import { bracketCode } from '@/lib/standardCode';

/**
 * A-3 성취기준 분석 — 교육과정 목록에서 고른 핵심 아이디어·성취기준을 표로 보여 준다.
 *
 * 다른 카드의 표(CardFields TableInput)와 같은 모양: 회색 머리행, 얇은 테두리, 행 hover, 오른쪽 28px 삭제 열.
 * 교과 배지는 초안 미리보기와 같은 색(getSubjectBadge), 성취기준 코드는 초안 미리보기의 코드 칩과 같은 회색 고정폭 글꼴.
 * 내용은 목록에서 고른 원문 그대로라 직접 고치지 않는다 — 행의 ×는 선택 해제.
 */
export default function A3SelectionTables({
  ideas,
  standards,
  onRemoveIdea,
  onRemoveStandard,
}: {
  ideas: IdeaItem[];
  standards: StandardItem[];
  /** 없으면 × 를 감춘다 (팀장이 아니거나 반영된 카드) — 열 자리는 남겨 줄을 맞춘다 */
  onRemoveIdea?: (id: string) => void;
  onRemoveStandard?: (code: string) => void;
}) {
  return (
    <div className="space-y-4">
      <SelectionTable
        label="핵심 아이디어"
        count={ideas.length}
        columns={[{ label: '교과', width: 76 }, { label: '영역', width: 120 }, { label: '핵심 아이디어' }]}
        rows={ideas.map((item) => ({
          key: item.id,
          cells: [
            <SubjectBadge key="s" subject={item.subject} />,
            <span key="d" className="text-[12.5px] text-[#5a6066]">{item.domain || '—'}</span>,
            <span key="c">{item.content}</span>,
          ],
          onRemove: onRemoveIdea && (() => onRemoveIdea(item.id)),
        }))}
      />
      <SelectionTable
        label="성취기준"
        count={standards.length}
        columns={[{ label: '교과', width: 76 }, { label: '코드', width: 116 }, { label: '성취기준' }]}
        rows={standards.map((item) => ({
          key: item.code,
          cells: [
            <SubjectBadge key="s" subject={item.subject} />,
            <span key="k" className="whitespace-nowrap rounded bg-[#f1f4f9] px-1.5 py-0.5 font-mono text-[12.5px] text-[#2d3339]">
              {bracketCode(item.code)}
            </span>,
            <span key="c">{item.content}</span>,
          ],
          onRemove: onRemoveStandard && (() => onRemoveStandard(item.code)),
        }))}
      />
    </div>
  );
}

function SubjectBadge({ subject }: { subject: string }) {
  const badge = getSubjectBadge(subject);
  return (
    <span
      className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium"
      style={{ backgroundColor: badge.bg, color: badge.text }}
    >
      {subject}
    </span>
  );
}

type Column = { label: string; width?: number };
type Row = { key: string; cells: ReactNode[]; onRemove?: () => void };

function SelectionTable({ label, count, columns, rows }: { label: string; count: number; columns: Column[]; rows: Row[] }) {
  // 다른 카드 표와 같은 격자 — 칸 폭을 머리행과 행이 함께 써서 세로줄이 맞는다
  const grid = { display: 'grid', gridTemplateColumns: columns.map((c) => (c.width ? `${c.width}px` : '1fr')).join(' ') + ' 28px' };
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-semibold text-[#757b82]">
        {label} <span className="font-normal text-[#adb2ba]">{count}개</span>
      </p>
      <div className="overflow-x-auto rounded-lg border border-[#e2e4ea]">
        <div className="border-b border-[#e2e4ea] bg-[#f1f4f9]" style={grid}>
          {columns.map((c) => (
            <div key={c.label} className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#757b82]">
              {c.label}
            </div>
          ))}
          <div />
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-center text-[13px] text-[#adb2ba]">위 검색 버튼으로 교육과정 목록에서 선택하세요.</p>
        ) : (
          rows.map((row) => (
            <div key={row.key} className="border-b border-[#e2e4ea] last:border-b-0 hover:bg-[#FFFAF8]" style={grid}>
              {row.cells.map((cell, i) => (
                <div
                  key={i}
                  // 교과·영역·코드는 가운데, 본문은 왼쪽 정렬로 읽기 쉽게
                  className={`flex items-center px-3 py-2 text-[13px] leading-relaxed text-[#2d3339] ${
                    i < columns.length - 1 ? 'justify-center text-center' : 'break-keep [overflow-wrap:anywhere]'
                  }`}
                >
                  {cell}
                </div>
              ))}
              <div className="flex items-center justify-center">
                {row.onRemove && (
                  <button
                    onClick={row.onRemove}
                    title="선택 해제"
                    aria-label="선택 해제"
                    className="flex h-5 w-5 items-center justify-center rounded text-[#adb2ba] hover:bg-red-50 hover:text-red-400"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
