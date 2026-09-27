"use client";

import { memo, useState } from "react";
import CardFieldRenderer from "@/components/workspace/CardFields";
import { CARD_SCHEMAS } from "@/components/workspace/cardSchemas";
import SimulationBoard from "@/components/workspace/SimulationBoard";

/**
 * 활동 카드 한 장.
 *
 * WorkspaceShell 본문에 인라인으로 있던 것을 분리했다. 인라인일 때는 카드를 하나
 * 클릭하기만 해도(selectedActivityCode/rightTab 변경) 화면의 모든 카드와 의견묻기
 * 블록이 통째로 다시 렌더됐다. memo 로 감싼 별도 컴포넌트가 되면서 실제로 값이
 * 바뀐 카드만 다시 그린다.
 *
 * 그래서 props 는 전부 "이 카드 몫"으로만 좁혀서 받는다. 예를 들어 opinions 전체가
 * 아니라 이 카드에 달린 의견만 받는다 — 다른 카드의 의견이 바뀌었을 때 이 카드가
 * 다시 렌더되지 않도록.
 */

export type ActivityStatus = "active" | "completed" | "skipped";

export type Activity = { code: string; label: string; description: string; badge?: string };

export type OpinionEntry = {
  opinionKey: string;
  question: string;
  hidden: boolean;
  /** userId → 응답 */
  responses: Record<string, string>;
};

interface Props {
  act: Activity;
  status: ActivityStatus;
  isSelected: boolean;

  isHost: boolean;
  canComplete: boolean;
  canSkip: boolean;

  textValue: string;
  structuredValue: Record<string, unknown>;

  /** 이 카드에 달린 의견묻기만 */
  opinions: OpinionEntry[];
  myUserId: string;
  /** userId → 표시 이름 */
  memberNames: Record<string, string>;

  onSelect: (code: string) => void;
  onStatusChange: (code: string, next: ActivityStatus) => void;
  onAskOpinion: (code: string) => void;
  onAiGuide: (act: Activity) => void;
  onOpenModal: (name: string) => void;
  onTextChange: (code: string, text: string) => void;
  onStructuredChange: (code: string, fields: Record<string, unknown>) => void;

  onToggleOpinionHidden: (opinionKey: string) => void;
  onDeleteOpinion: (opinionKey: string) => void;
  onSubmitOpinion: (opinionKey: string, text: string) => void;

  /** A-5 수업 시뮬레이션 생성 */
  onSimulate?: () => Promise<void>;
}

/**
 * 의견묻기 스레드 한 개.
 *
 * 초안 텍스트와 "수정 중" 여부를 여기서 들고 있는다. 예전에는 이 둘이
 * WorkspaceShell 의 state(myOpinionDrafts / editingOpinions)였는데, 그 탓에
 * 의견을 한 글자 칠 때마다 워크스페이스 전체가 다시 렌더됐다.
 */
const OpinionThread = memo(function OpinionThread({
  op,
  isHost,
  myUserId,
  getName,
  onToggleHidden,
  onDelete,
  onSubmit,
}: {
  op: OpinionEntry;
  isHost: boolean;
  myUserId: string;
  getName: (uid: string) => string;
  onToggleHidden: (opinionKey: string) => void;
  onDelete: (opinionKey: string) => void;
  onSubmit: (opinionKey: string, text: string) => void;
}) {
  const myResponse = op.responses[myUserId];
  const hasSubmitted = !!myResponse;
  const allResponses = Object.entries(op.responses);

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  const submit = () => {
    const text = draft.trim();
    if (!text || !myUserId) return;
    onSubmit(op.opinionKey, text);
    setDraft("");
    setEditing(false);
  };

  return (
    <div
      className="mt-4 rounded-xl border border-[#e0e2f0] bg-[#f8f9ff] p-4"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 헤더 */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#5044e3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[14px] font-semibold text-[#5044e3]">{op.question}</p>
        </div>
        {isHost && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => onToggleHidden(op.opinionKey)}
              title={op.hidden ? "보이기" : "숨기기"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#adb2ba] transition hover:bg-[#e8eaf4] hover:text-[#5044e3]"
            >
              {op.hidden
                ? <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                : <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              }
            </button>
            <button
              onClick={() => onDelete(op.opinionKey)}
              title="삭제"
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#adb2ba] transition hover:bg-red-50 hover:text-red-400"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
      </div>

      {!op.hidden && (
        <div className="space-y-3">
          {/* 내 답변 입력 (미제출이거나 수정 중) */}
          {(!hasSubmitted || editing) ? (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                autoFocus={editing}
                placeholder="의견을 입력하세요…"
                className="flex-1 rounded-lg border border-[#dde3eb] bg-white px-3 py-2 text-[14px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:border-[#5044e3]"
              />
              <button
                disabled={!draft.trim() || !myUserId}
                onClick={submit}
                className="shrink-0 rounded-lg bg-[#5044e3] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#4035c8] disabled:opacity-40"
              >
                전송
              </button>
            </div>
          ) : null}

          {/* 내 제출 답변 표시 + 수정 버튼 */}
          {hasSubmitted && !editing && (
            <div className="flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-200 text-xs font-semibold text-indigo-700">
                {getName(myUserId).charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-indigo-600">나의 답변</p>
                <p className="text-[14px] leading-snug text-[#2d3339]">{myResponse}</p>
              </div>
              <button
                onClick={() => { setDraft(myResponse ?? ""); setEditing(true); }}
                className="shrink-0 rounded-md border border-[#dde3eb] bg-white px-2 py-1 text-[12px] font-medium text-[#5a6066] transition hover:bg-gray-50"
              >
                수정
              </button>
            </div>
          )}

          {/* 다른 사람 답변 목록 */}
          {allResponses.filter(([uid, r]) => uid !== myUserId && r.trim()).length > 0 && (
            <div className="space-y-2">
              {allResponses.filter(([uid, r]) => uid !== myUserId && r.trim()).map(([uid, resp]) => (
                <div key={uid} className="flex items-start gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                    {getName(uid).charAt(0)}
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#5a6066]">{getName(uid)}</p>
                    <p className="text-[14px] leading-snug text-[#2d3339]">{resp}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function ActivityCard({
  act,
  status: st,
  isSelected,
  isHost,
  canComplete,
  canSkip,
  textValue,
  structuredValue,
  opinions,
  myUserId,
  memberNames,
  onSelect,
  onStatusChange,
  onAskOpinion,
  onAiGuide,
  onOpenModal,
  onTextChange,
  onStructuredChange,
  onToggleOpinionHidden,
  onDeleteOpinion,
  onSubmitOpinion,
  onSimulate,
}: Props) {
  const locked = st === "completed" || st === "skipped";
  const getName = (uid: string) => memberNames[uid] ?? uid;

  return (
    <div
      onClick={() => onSelect(act.code)}
      className={`relative mb-6 rounded-2xl p-6 border transition-all cursor-pointer overflow-hidden ${
        st === "completed" ? "bg-[#eff8ff] border-[#bae0ff]"
        : st === "skipped"  ? "bg-[#f5f6f8] border-[#e2e4ea]"
        : "bg-white border-transparent"
      }`}
    >
      {/* 활성화 인디케이터 — 왼쪽 세로 바 */}
      {isSelected && (
        <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-[#5044e3]" />
      )}

      {/* 헤더: 코드 + 토글 버튼 */}
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-[13px] font-bold tracking-widest uppercase ${locked ? "text-[#adb2ba]" : "text-[#5044e3]"}`}>
          {act.code}
        </p>
        <div className="flex flex-row gap-1.5">
          {canComplete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(act.code);
                onStatusChange(act.code, st === "completed" ? "active" : "completed");
              }}
              className={`rounded-md px-3 py-1 text-[12px] font-medium transition ${
                st === "completed"
                  ? "bg-teal-200 text-teal-800"
                  : "bg-teal-50 text-teal-700 hover:bg-teal-100"
              }`}
            >
              완료
            </button>
          )}
          {canSkip && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(act.code);
                onStatusChange(act.code, st === "skipped" ? "active" : "skipped");
              }}
              className={`rounded-md px-3 py-1 text-[12px] font-medium transition ${
                st === "skipped"
                  ? "bg-[#e2e4ea] text-[#5a6066]"
                  : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
              }`}
            >
              건너뛰기
            </button>
          )}
          {isHost && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(act.code); onAskOpinion(act.code); }}
              className="rounded-md px-3 py-1 text-[12px] font-medium transition bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            >
              의견묻기
            </button>
          )}
        </div>
      </div>

      {/* 제목 + 설명 */}
      <div className="mb-4 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className={`text-xl font-semibold ${locked ? "text-[#adb2ba]" : "text-[#2d3339]"}`}>
              {act.label}
            </h3>
            {act.badge && (
              <span className="mt-1 inline-block rounded-full bg-[#f1f4f9] px-2.5 py-1 text-xs text-[#757b82]">
                {act.badge}
              </span>
            )}
          </div>
          {/* AI 안내 버튼 */}
          <button
            onClick={(e) => { e.stopPropagation(); onAiGuide(act); }}
            title="AI 안내"
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <p className="text-[15px] leading-relaxed text-[#5a6066]">{act.description}</p>
      </div>

      {/* A-3 검색 버튼 */}
      {act.code === "A-3" && !locked && (
        <div className="mb-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenModal("핵심아이디어검색"); }}
            className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-[13px] font-medium text-teal-700 hover:bg-teal-100 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            핵심아이디어 검색
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenModal("성취기준검색"); }}
            className="flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-[13px] font-medium text-teal-700 hover:bg-teal-100 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            성취기준 검색
          </button>
        </div>
      )}

      {/* 입력 영역 */}
      {act.code === "A-5" ? (
        <SimulationBoard
          value={structuredValue}
          onChange={(fields) => onStructuredChange(act.code, fields)}
          locked={locked}
          onSimulate={onSimulate}
        />
      ) : CARD_SCHEMAS[act.code] ? (
        <CardFieldRenderer
          schema={CARD_SCHEMAS[act.code]}
          value={structuredValue}
          onChange={(fields) => onStructuredChange(act.code, fields)}
          locked={locked}
        />
      ) : (
        <textarea
          value={textValue}
          onChange={(e) => onTextChange(act.code, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={locked}
          placeholder="내용을 입력하세요…"
          className="w-full min-h-[100px] resize-y rounded-xl border-none bg-[#f1f4f9] px-4 py-3 text-[16px] leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none transition focus:ring-2 focus:ring-[#5044e3]/20 disabled:opacity-60 disabled:resize-none"
        />
      )}

      {/* 의견묻기 섹션 — opinionKey별로 스택 */}
      {opinions.map((op) => (
        <OpinionThread
          key={op.opinionKey}
          op={op}
          isHost={isHost}
          myUserId={myUserId}
          getName={getName}
          onToggleHidden={onToggleOpinionHidden}
          onDelete={onDeleteOpinion}
          onSubmit={onSubmitOpinion}
        />
      ))}
    </div>
  );
}

export default memo(ActivityCard);
