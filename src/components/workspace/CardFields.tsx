'use client';

import { useRef, useEffect, useState } from 'react';
import type { CardSchema, FieldDef, BulletsFieldDef, TableFieldDef, TableColumn } from './cardSchemas';

// ─── Auto-resize textarea ─────────────────────────────────────────────

export function AutoResizeTextarea({
  value, onChange, disabled, placeholder, className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      className={className}
      style={{ resize: 'none', overflow: 'hidden' }}
    />
  );
}

// ─── Bullets field ────────────────────────────────────────────────────

function BulletsInput({
  field, value, onChange, locked,
}: {
  field: BulletsFieldDef;
  value: unknown;
  onChange: (v: string[]) => void;
  locked: boolean;
}) {
  const items: string[] = Array.isArray(value)
    ? (value as string[])
    : Array(field.minRows ?? 3).fill('');

  const update = (idx: number, text: string) => {
    const next = [...items];
    next[idx] = text;
    onChange(next);
  };
  const addRow = () => onChange([...items, '']);
  const removeRow = (idx: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-1.5" onClick={e => e.stopPropagation()}>
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="shrink-0 text-[15px] font-bold text-[#D1260F]">•</span>
          <input
            type="text"
            value={item}
            onChange={e => update(idx, e.target.value)}
            disabled={locked}
            placeholder={`항목 ${idx + 1}`}
            className="flex-1 rounded-lg bg-[#f1f4f9] px-3 py-2 text-[14px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20 disabled:opacity-50"
          />
          {!locked && items.length > 1 && (
            <button
              onClick={() => removeRow(idx)}
              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-[#adb2ba] hover:bg-red-50 hover:text-red-400"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <button
          onClick={addRow}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#D1260F] hover:bg-[#FDE4DD] transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          항목 추가
        </button>
      )}
    </div>
  );
}

// ─── Badge color per option value ─────────────────────────────────────

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  // 평가 유형
  '진단':   { bg: '#dbeafe', text: '#1d4ed8' },
  '형성':   { bg: '#dcfce7', text: '#15803d' },
  '수행':   { bg: '#ffedd5', text: '#c2410c' },
  '총괄':   { bg: '#ede9fe', text: '#6d28d9' },
  // 채택 여부
  '채택':             { bg: '#d1fae5', text: '#065f46' },
  '보조 자료로 활용': { bg: '#e0f2fe', text: '#0369a1' },
  '보류':             { bg: '#fef3c7', text: '#92400e' },
  '미채택':           { bg: '#fee2e2', text: '#b91c1c' },
};

// 교과 배지 색 (StandardsModal/IdeasModal과 동일)
const LANGUAGE = new Set(['국어','영어','한문','생활 독일어','생활 러시아어','생활 베트남어','생활 스페인어','생활 아랍어','생활 일본어','생활 중국어','생활 프랑스어']);
const MATH     = new Set(['수학']);
const SCIENCE  = new Set(['과학','정보','기술·가정']);
const SOCIAL   = new Set(['사회','역사','도덕']);
const ARTS     = new Set(['체육','음악','미술']);

export function getSubjectBadge(subject: string): { bg: string; text: string } {
  if (LANGUAGE.has(subject)) return { bg: '#dbeafe', text: '#1d4ed8' };
  if (MATH.has(subject))     return { bg: '#ede9fe', text: '#6d28d9' };
  if (SCIENCE.has(subject))  return { bg: '#d1fae5', text: '#065f46' };
  if (SOCIAL.has(subject))   return { bg: '#ffedd5', text: '#92400e' };
  if (ARTS.has(subject))     return { bg: '#fce7f3', text: '#9d174d' };
  return { bg: '#e0f2fe', text: '#0369a1' };
}

function getBadgeStyle(value: string, isSubject: boolean): { bg: string; text: string } {
  if (isSubject) return getSubjectBadge(value);
  return BADGE_COLORS[value] ?? { bg: '#f1f4f9', text: '#5a6066' };
}

// ─── Table cell ────────────────────────────────────────────────────────

function TableCell({
  col, value, onChange, locked, dynamicOptions,
}: {
  col: TableColumn;
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
  dynamicOptions?: string[];
}) {
  const base =
    `w-full bg-transparent px-3 py-2 text-[13px] text-[#2d3339] outline-none focus:bg-[#FFF8F6] disabled:opacity-50 ${
      col.align === 'center' ? 'text-center' : ''
    }`;

  if (col.type === 'select' || col.type === 'subject-select') {
    const opts = col.type === 'subject-select' ? (dynamicOptions ?? []) : (col.options ?? []);
    const hasValue = value !== '' && value !== undefined;
    const isSubject = col.type === 'subject-select';
    const badge = hasValue ? getBadgeStyle(value, isSubject) : null;
    // 교과는 배지만 가운데 두고 펼치기 화살표는 뺀다 — 칸을 눌러도 목록이 열린다
    const overlayCls = `pointer-events-none absolute inset-0 flex items-center ${
      col.align === 'center' ? 'justify-center px-1' : 'px-3'
    }`;
    return (
      <div className="relative w-full">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={locked}
          className={`${base} cursor-pointer appearance-none ${isSubject ? '' : 'pr-6'}`}
          style={{ color: hasValue ? 'transparent' : undefined }}
        >
          {/* select 글자를 투명하게(배지만 보이게) 하면 펼친 목록의 option 도 투명해진다
              (Windows Chrome 등) — option 색은 따로 지정한다 */}
          <option value="" style={{ color: '#adb2ba' }}>—</option>
          {opts.map(o => <option key={o} value={o} style={{ color: '#2d3339' }}>{o}</option>)}
        </select>
        {badge && (
          <div className={overlayCls}>
            <span
              className="rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap"
              style={{ backgroundColor: badge.bg, color: badge.text }}
            >
              {value}
            </span>
          </div>
        )}
        {!hasValue && (
          <div className={overlayCls}>
            <span className="text-[13px] text-[#adb2ba]">—</span>
          </div>
        )}
        {!isSubject && (
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#adb2ba]">
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}
      </div>
    );
  }
  if (col.type === 'date') {
    return (
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={locked}
        className={base}
      />
    );
  }
  if (col.type === 'textarea') {
    return (
      <AutoResizeTextarea
        value={value}
        onChange={onChange}
        disabled={locked}
        className={base}
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={locked}
      className={base}
    />
  );
}

// ─── Table field ───────────────────────────────────────────────────────

/** 표가 최소한 유지하는 행 수 — 이 이하로는 삭제 버튼이 행 대신 내용만 비운다 */
const KEEP_ROWS = 3;

// ───────────────────────────────────────────────────────

function TableInput({
  field, value, onChange, locked,
}: {
  field: TableFieldDef;
  value: unknown;
  onChange: (v: Record<string, string>[]) => void;
  locked: boolean;
}) {
  const emptyRow = () =>
    Object.fromEntries(field.columns.map(c => [c.key, ''])) as Record<string, string>;

  const rows: Record<string, string>[] = Array.isArray(value) && value.length > 0
    ? (value as Record<string, string>[])
    : Array(field.minRows ?? 3).fill(null).map(emptyRow);

  const updateCell = (rowIdx: number, key: string, val: string) => {
    const next = rows.map((row, i) =>
      i === rowIdx ? { ...row, [key]: val } : row
    );
    onChange(next);
  };
  const addRow = () => onChange([...rows, emptyRow()]);
  // 행이 KEEP_ROWS 개보다 많으면 행 자체를 지우고, 그 이하로는 행은 두고 내용만 비운다.
  // (예전에는 마지막 한 행이 남으면 삭제 버튼이 사라져 그 내용을 지울 방법이 없었다)
  const canRemoveRow = rows.length > KEEP_ROWS;
  const deleteRow = (idx: number) => {
    onChange(canRemoveRow
      ? rows.filter((_, i) => i !== idx)
      : rows.map((row, i) => (i === idx ? emptyRow() : row)));
  };

  // Fetch dynamic subjects for subject-select columns
  const [dynamicSubjects, setDynamicSubjects] = useState<string[]>([]);
  useEffect(() => {
    const subjectCol = field.columns.find(c => c.type === 'subject-select');
    if (!subjectCol) return;
    if (subjectCol.subjectSource === 'ideas') {
      fetch('/standard/ideas.json')
        .then(r => r.json())
        .then(data => setDynamicSubjects(Object.keys(data)));
    } else if (subjectCol.subjectSource === 'standards') {
      fetch('/api/standards?type=meta')
        .then(r => r.json())
        .then(data => setDynamicSubjects(data.subjects ?? []));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CSS grid: columns share same template → borders align perfectly
  const gridTemplate =
    field.columns.map(c => (c.width ? `${c.width}px` : `${c.flex ?? 1}fr`)).join(' ') + ' 28px';

  return (
    <div onClick={e => e.stopPropagation()}>
      <div className="overflow-x-auto rounded-lg border border-[#e2e4ea]">
        {/* Header */}
        <div
          className="bg-[#f1f4f9] border-b border-[#e2e4ea]"
          style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
        >
          {field.columns.map((col) => (
            <div
              key={col.key}
              className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#757b82] text-center"
            >
              {col.label}
            </div>
          ))}
          <div /> {/* 삭제 버튼 열 자리 */}
        </div>

        {/* Rows */}
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="border-b last:border-b-0 border-[#e2e4ea] hover:bg-[#FFFAF8]"
            style={{ display: 'grid', gridTemplateColumns: gridTemplate }}
          >
            {field.columns.map((col) => (
              <div key={col.key} className="py-0.5 px-0.5">
                <TableCell
                  col={col}
                  value={row[col.key] ?? ''}
                  onChange={v => updateCell(rowIdx, col.key, v)}
                  locked={locked}
                  dynamicOptions={col.type === 'subject-select' ? dynamicSubjects : undefined}
                />
              </div>
            ))}
            <div className="flex items-center justify-center">
              {!locked && (canRemoveRow || Object.values(row).some(v => String(v ?? '').trim())) && (
                <button
                  onClick={() => deleteRow(rowIdx)}
                  title={canRemoveRow ? '행 삭제' : '내용 지우기'}
                  className="flex h-5 w-5 items-center justify-center rounded text-[#adb2ba] hover:bg-red-50 hover:text-red-400"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!locked && !field.noAddRow && (
        <button
          onClick={addRow}
          className="mt-1.5 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#D1260F] hover:bg-[#FDE4DD] transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          행 추가
        </button>
      )}
    </div>
  );
}

// ─── Single field renderer ─────────────────────────────────────────────

function FieldRenderer({
  field, value, onChange, locked,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  locked: boolean;
}) {
  const labelEl = field.label && (
    <p className="mb-1.5 text-[12px] font-semibold text-[#757b82]">{field.label}</p>
  );

  if (field.type === 'bullets') {
    return (
      <div>
        {labelEl}
        <BulletsInput
          field={field}
          value={value}
          onChange={onChange}
          locked={locked}
        />
      </div>
    );
  }

  if (field.type === 'table') {
    return (
      <div>
        {labelEl}
        <TableInput
          field={field}
          value={value}
          onChange={onChange as (v: Record<string, string>[]) => void}
          locked={locked}
        />
      </div>
    );
  }

  if (field.type === 'richtext') {
    return (
      <div onClick={e => e.stopPropagation()}>
        {labelEl}
        <div className="rounded-xl border border-[#F5B8A8] bg-[#FFF1ED] overflow-hidden">
          <AutoResizeTextarea
            value={typeof value === 'string' ? value : ''}
            onChange={onChange as (v: string) => void}
            disabled={locked}
            placeholder="핵심 결과물을 입력하세요…"
            className="w-full bg-transparent px-4 py-3 text-[15px] font-semibold text-[#2d3339] placeholder-[#F5B8A8] outline-none disabled:opacity-50"
          />
        </div>
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div onClick={e => e.stopPropagation()}>
        {labelEl}
        <AutoResizeTextarea
          value={typeof value === 'string' ? value : ''}
          onChange={onChange as (v: string) => void}
          disabled={locked}
          placeholder={field.placeholder ?? '내용을 입력하세요…'}
          className="w-full min-h-[72px] rounded-xl bg-[#f1f4f9] px-4 py-3 text-[14px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20 disabled:opacity-50"
        />
      </div>
    );
  }

  // text
  return (
    <div onClick={e => e.stopPropagation()}>
      {labelEl}
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={e => (onChange as (v: string) => void)(e.target.value)}
        disabled={locked}
        placeholder={field.placeholder ?? '내용을 입력하세요…'}
        className="w-full rounded-xl bg-[#f1f4f9] px-4 py-3 text-[14px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20 disabled:opacity-50"
      />
    </div>
  );
}

// ─── Main: CardFieldRenderer ──────────────────────────────────────────

export default function CardFieldRenderer({
  schema, value, onChange, locked,
}: {
  schema: CardSchema;
  value: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
  locked: boolean;
}) {
  const handleFieldChange = (key: string, val: unknown) => {
    onChange({ ...value, [key]: val });
  };

  return (
    <div className="space-y-4" onClick={e => e.stopPropagation()}>
      {schema.fields.map(field => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={value[field.key]}
          onChange={v => handleFieldChange(field.key, v)}
          locked={locked}
        />
      ))}
    </div>
  );
}
