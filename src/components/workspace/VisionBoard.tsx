"use client";

import { useState } from "react";
import { AutoResizeTextarea } from "@/components/workspace/CardFields";
import { VISION_MAX_TEXT, newVisionId, type VisionEntry, type VisionMap } from "@/lib/vision";

/**
 * T-1 개인별 교육비전 — 참가자마다 가로 카드로 쓴다.
 * 내 카드만 고치고 지울 수 있고, 다른 참가자의 카드는 읽기만 한다. 카드는 가로로 이어지고 넘치면 옆으로 스크롤한다.
 */
export default function VisionBoard({ visions, memberNames, myUserId, locked, onChange }: {
  visions: VisionMap;
  memberNames: Record<string, string>;
  myUserId: string;
  locked: boolean;
  /** 내 항목 전체 */
  onChange: (items: VisionEntry[]) => void;
}) {
  const mine = visions[myUserId] ?? [];
  // 내 카드 먼저, 그다음 참여자 순서대로 (목록에 없는 작성자는 뒤에)
  const others = [
    ...Object.keys(memberNames).filter((uid) => uid !== myUserId && visions[uid]?.length),
    ...Object.keys(visions).filter((uid) => uid !== myUserId && !(uid in memberNames) && visions[uid].length),
  ];
  const cards = [
    ...mine.map((entry) => ({ uid: myUserId, entry })),
    ...others.flatMap((uid) => visions[uid].map((entry) => ({ uid, entry }))),
  ];
  const canEdit = !locked && !!myUserId;
  // 방금 더한 카드는 바로 입력할 수 있게 입력칸에 포커스 (버튼에 포커스가 남으면 스페이스가 카드를 또 더한다)
  const [focusId, setFocusId] = useState<string | null>(null);
  const add = () => {
    const entry = { id: newVisionId(), text: "" };
    setFocusId(entry.id);
    onChange([...mine, entry]);
  };
  const update = (id: string, text: string) => onChange(mine.map((e) => (e.id === id ? { ...e, text: text.slice(0, VISION_MAX_TEXT) } : e)));

  return (
    <div className="flex snap-x gap-3 overflow-x-auto pb-2" onClick={(e) => e.stopPropagation()}>
      {cards.map(({ uid, entry }) => {
        const isMine = uid === myUserId;
        const name = memberNames[uid] ?? "";
        return (
          <div key={`${uid}-${entry.id}`} className={`flex min-h-[132px] w-72 shrink-0 snap-start flex-col rounded-xl border p-3 ${isMine ? "border-[#F5B8A8] bg-[#FFF8F6]" : "border-[#e2e4ea] bg-white"}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isMine ? "bg-[#D1260F] text-white" : "bg-[#eef0f4] text-[#5a6066]"}`}>{name.slice(0, 1) || "?"}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#2d3339]">{name}</span>
              {isMine && canEdit && (
                <button type="button" aria-label="삭제" title="삭제" onClick={() => onChange(mine.filter((e) => e.id !== entry.id))}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#adb2ba] transition hover:bg-red-50 hover:text-red-500">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            {isMine && canEdit ? (
              <AutoResizeTextarea value={entry.text} onChange={(text) => update(entry.id, text)} placeholder="내용을 입력하세요…" autoFocus={entry.id === focusId}
                className="w-full flex-1 rounded-lg bg-white/80 px-3 py-2 text-[14px] leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20" />
            ) : (
              <p className="whitespace-pre-wrap px-1 text-[14px] leading-relaxed text-[#2d3339]">{entry.text}</p>
            )}
          </div>
        );
      })}
      {canEdit && (
        <button type="button" onClick={add}
          className="flex min-h-[132px] w-40 shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#d4d8de] text-[13px] font-medium text-[#757b82] transition hover:border-[#F5B8A8] hover:bg-[#FFFAF8] hover:text-[#D1260F]">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          항목 추가
        </button>
      )}
    </div>
  );
}
