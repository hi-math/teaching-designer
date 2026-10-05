"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { AutoResizeTextarea, getSubjectBadge } from "@/components/workspace/CardFields";
import { VISION_MAX_TEXT, newVisionId, type VisionEntry, type VisionMap } from "@/lib/vision";

type Tone = { bg: string; text: string };
/** 교과 배지와 같은 색들 (국어·외국어 / 수학 / 과학·정보 / 사회 / 예체능 / 그 밖) */
const PALETTE: Tone[] = ["국어", "수학", "과학", "사회", "음악", ""].map(getSubjectBadge);

/**
 * 사람마다 다른 카드 색 — 가능하면 그 사람 교과의 색, 이미 다른 사람이 쓰거나 교과가 없으면 남은 색.
 * 아이디 순서로 정해 누가 보든, 누가 카드를 더하든 색이 바뀌지 않는다.
 */
export function personTones(userIds: string[], subjectOf: (userId: string) => string | undefined): Record<string, Tone> {
  const out: Record<string, Tone> = {};
  const used = new Set<string>();
  const pending: string[] = [];
  for (const uid of [...new Set(userIds)].sort()) {
    const subject = subjectOf(uid);
    const tone = subject ? getSubjectBadge(subject) : null;
    if (tone && !used.has(tone.bg)) { out[uid] = tone; used.add(tone.bg); } else pending.push(uid);
  }
  pending.forEach((uid, i) => {
    const tone = PALETTE.find((t) => !used.has(t.bg)) ?? PALETTE[i % PALETTE.length];
    out[uid] = tone;
    used.add(tone.bg);
  });
  return out;
}

/**
 * T-1 개인별 교육비전 — 참가자마다 가로 카드로 쓴다. 카드는 사람마다 다른 교과 색 음영.
 * 카드 안은 불릿 줄들 — Enter 로 다음 불릿, 줄 맨 앞에서 Backspace 로 윗줄과 합친다 (저장은 줄바꿈으로 이은 글 하나).
 * 내 카드만 고치고 지울 수 있고, 다른 참가자의 카드는 읽기만 한다. 카드는 가로로 이어지고 넘치면 옆으로 스크롤한다.
 */
export default function VisionBoard({ visions, memberNames, memberSubjects, myUserId, locked, onChange }: {
  visions: VisionMap;
  memberNames: Record<string, string>;
  /** userId → 교과 */
  memberSubjects: Record<string, string>;
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
  const tones = personTones([...Object.keys(memberNames), ...Object.keys(visions)], (uid) => memberSubjects[uid]);
  // 줄을 나누거나 합친 뒤, 방금 더한 카드에 커서를 옮긴다 (버튼에 포커스가 남으면 스페이스가 카드를 또 더한다)
  const boardRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ id: string; line: number; caret: number } | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const el = boardRef.current?.querySelector<HTMLTextAreaElement>(`[data-line="${target.id}:${target.line}"]`);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    el.setSelectionRange(target.caret, target.caret);
  });
  const add = () => {
    const entry = { id: newVisionId(), text: "" };
    pendingFocus.current = { id: entry.id, line: 0, caret: 0 };
    onChange([...mine, entry]);
  };
  const setLines = (id: string, lines: string[]) =>
    onChange(mine.map((e) => (e.id === id ? { ...e, text: lines.join("\n").slice(0, VISION_MAX_TEXT) } : e)));
  const changeLine = (id: string, lines: string[], idx: number, value: string) => {
    // 여러 줄을 붙여 넣으면 줄마다 불릿
    const pasted = value.split("\n");
    if (pasted.length > 1) pendingFocus.current = { id, line: idx + pasted.length - 1, caret: pasted[pasted.length - 1].length };
    setLines(id, [...lines.slice(0, idx), ...pasted, ...lines.slice(idx + 1)]);
  };
  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>, id: string, lines: string[], idx: number) => {
    const el = e.currentTarget;
    // 한글 조합 중의 Enter 는 글자 확정이라 넘긴다
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const line = lines[idx];
      pendingFocus.current = { id, line: idx + 1, caret: 0 };
      setLines(id, [...lines.slice(0, idx), line.slice(0, el.selectionStart), line.slice(el.selectionEnd), ...lines.slice(idx + 1)]);
    } else if (e.key === "Backspace" && idx > 0 && el.selectionStart === 0 && el.selectionEnd === 0) {
      e.preventDefault();
      const prev = lines[idx - 1];
      pendingFocus.current = { id, line: idx - 1, caret: prev.length };
      setLines(id, [...lines.slice(0, idx - 1), prev + lines[idx], ...lines.slice(idx + 1)]);
    }
  };

  return (
    <div ref={boardRef} className="flex snap-x gap-3 overflow-x-auto pb-2" onClick={(e) => e.stopPropagation()}>
      {cards.map(({ uid, entry }) => {
        const isMine = uid === myUserId;
        const name = memberNames[uid] ?? "";
        const tone = tones[uid] ?? PALETTE[PALETTE.length - 1];
        const lines = entry.text.split("\n");
        const editable = isMine && canEdit;
        return (
          <div key={`${uid}-${entry.id}`} className="flex min-h-[132px] w-72 shrink-0 snap-start flex-col rounded-xl p-3" style={{ backgroundColor: tone.bg }}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isMine ? "bg-[#D1260F] text-white" : "bg-white"}`} style={isMine ? undefined : { color: tone.text }}>{name.slice(0, 1) || "?"}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#2d3339]">{name}</span>
              {isMine && canEdit && (
                <button type="button" aria-label="삭제" title="삭제" onClick={() => onChange(mine.filter((e) => e.id !== entry.id))}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#adb2ba] transition hover:bg-red-50 hover:text-red-500">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
            {/* 따로 색칠한 입력칸 없이 같은 카드 안에 불릿 + 밑줄 — 줄마다 불릿 하나 */}
            <div className="space-y-1.5">
              {(editable ? lines : lines.filter((l) => l.trim())).map((line, i) => (
                <div key={`${entry.id}-${i}`} className="flex items-start gap-2">
                  <span className="shrink-0 pt-1 text-[15px] font-bold leading-none" style={{ color: tone.text }}>•</span>
                  {editable ? (
                    <AutoResizeTextarea value={line} lineKey={`${entry.id}:${i}`}
                      onChange={(value) => changeLine(entry.id, lines, i, value)}
                      onKeyDown={(e) => keyDown(e, entry.id, lines, i)}
                      placeholder={lines.length === 1 ? "내용을 입력하세요…" : undefined}
                      className="min-w-0 flex-1 border-b border-black/15 bg-transparent pb-1 text-[14px] leading-relaxed text-[#2d3339] placeholder-[#8a9099] outline-none transition-colors focus:border-[#D1260F]" />
                  ) : (
                    <p className="min-w-0 flex-1 whitespace-pre-wrap border-b border-black/10 pb-1 text-[14px] leading-relaxed text-[#2d3339]">{line}</p>
                  )}
                </div>
              ))}
            </div>
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
