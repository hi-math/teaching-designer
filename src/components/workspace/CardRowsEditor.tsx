"use client";

export default function CardRowsEditor({ label, contentKey, rows, onChange, readOnly }: {
  label: string;
  contentKey: string;
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
  readOnly: boolean;
}) {
  const visible = rows.length ? rows : [{ subject: '', [contentKey]: '' }];
  const change = (index: number, key: string, value: string) =>
    onChange(visible.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return (
    <div className="border-b border-[#E4EBF5] bg-[#FFF8F6] px-6 py-4">
      <p className="text-[14px] font-semibold text-[#2C3A52]">A-3 카드 입력 · {label}</p>
      <p className="mb-3 mt-1 text-[12px] text-[#6B7A99]">AI 추천과 직접 입력한 내용을 여기서 수정할 수 있습니다. 확인을 누르면 카드에 반영됩니다.</p>
      <div className="max-h-44 space-y-2 overflow-y-auto">
        {visible.map((row, index) => (
          <div key={index} className="flex items-start gap-2">
            <input aria-label={`${index + 1}행 교과`} value={row.subject ?? ''} disabled={readOnly}
              onChange={e => change(index, 'subject', e.target.value)} placeholder="교과"
              className="w-24 rounded-lg border border-[#D8E2F0] bg-white px-2 py-2 text-[13px] outline-none focus:border-[#D1260F] disabled:opacity-60" />
            <textarea aria-label={`${index + 1}행 ${label}`} value={row[contentKey] ?? ''} disabled={readOnly}
              onChange={e => change(index, contentKey, e.target.value)} placeholder={`${label}을 입력하세요`}
              rows={2} className="min-w-0 flex-1 resize-y rounded-lg border border-[#D8E2F0] bg-white px-2 py-2 text-[13px] outline-none focus:border-[#D1260F] disabled:opacity-60" />
            {!readOnly && <button type="button" aria-label={`${index + 1}행 삭제`} onClick={() => onChange(visible.filter((_, i) => i !== index))}
              className="rounded-lg px-2 py-2 text-[13px] text-[#9AAAC0] hover:bg-red-50 hover:text-[#D1260F]">삭제</button>}
          </div>
        ))}
      </div>
      {!readOnly && <button type="button" onClick={() => onChange([...visible, { subject: '', [contentKey]: '' }])}
        className="mt-2 text-[13px] font-medium text-[#D1260F]">+ 직접 입력</button>}
    </div>
  );
}
