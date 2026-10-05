"use client";

import { memo, useState } from "react";
import CardFieldRenderer from "@/components/workspace/CardFields";
import { CARD_SCHEMAS, cardHasContent } from "@/components/workspace/cardSchemas";
import SimulationBoard from "@/components/workspace/SimulationBoard";
import A3SelectionTables from "@/components/workspace/A3SelectionTables";
import VisionBoard from "@/components/workspace/VisionBoard";
import type { VisionEntry, VisionMap } from "@/lib/vision";
import type { IdeaItem } from '@/components/workspace/IdeasModal';
import type { StandardItem } from '@/components/workspace/StandardsModal';

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
  selectedIdeas?: IdeaItem[];
  selectedStandards?: StandardItem[];

  /** 이 카드에 달린 의견묻기만 */
  opinions: OpinionEntry[];
  myUserId: string;
  /** userId → 표시 이름 */
  memberNames: Record<string, string>;

  onSelect: (code: string) => void;
  onStatusChange: (code: string, next: ActivityStatus) => void;
  onAskOpinion: (code: string) => void;
  onAiGuide: (act: Activity) => void;
  /** with AI — 카드의 현재 내용을 수업설계 전체 흐름에 비추어 본 피드백을 Minerva AI 에 요청 */
  onAiFeedback: (act: Activity) => void;
  onOpenModal: (name: string) => void;
  onTextChange: (code: string, text: string) => void;
  onStructuredChange: (code: string, fields: Record<string, unknown>) => void;

  /** 이 카드에 되돌릴 이전 상태가 있는지 */
  canUndo: boolean;
  /** 이 카드의 직전 작업 상태로 되돌린다 */
  onUndo: (code: string) => void;
  /** 카드 내용을 모두 지운다 (확인 창은 호출한 쪽에서 띄운다) */
  onClear: (code: string) => void;
  /** 카드 안의 버튼·입력칸을 누르면 그 카드를 활성화 */
  onActivate: (code: string) => void;
  /** A-3 선택 항목 바꾸기 (표의 × = 선택 해제). 팀장만 — 없으면 × 를 감춘다 */
  onA3SelectionsChange?: (ideas: IdeaItem[], standards: StandardItem[]) => void;

  onToggleOpinionHidden: (opinionKey: string) => void;
  onDeleteOpinion: (opinionKey: string) => void;
  onSubmitOpinion: (opinionKey: string, text: string) => void;

  /** A-5 초안 미리보기 생성 — request 는 교사 팀의 추가 요청. 알릴 내용(총 차시 변경 등)이 있으면 문장을 돌려준다 */
  onSimulate?: (request: string) => Promise<string | null>;
  /** 초안 미리보기 → Ds-3·Ds-4 반영 */
  onApplyToDesign?: () => Promise<string | null>;

  /** T-1 개인별 교육비전 (userId → 항목) — T-1 카드에만 */
  visions?: VisionMap;
  /** userId → 교과 — 개인별 교육비전 카드 색 */
  memberSubjects?: Record<string, string>;
  /** 내 개인별 교육비전 바꾸기 */
  onVisionsChange?: (items: VisionEntry[]) => void;
  /** 비전 키워드 생성 — 실패하면 안내 문장 */
  onGenerateKeywords?: () => Promise<string | null>;
}

/** T-1 비전 키워드 이름 오른쪽의 작은 키워드 생성 버튼 — 생성 중에는 버튼 안 스피너, 실패하면 왼쪽에 안내 */
function KeywordGenerateButton({ disabled, onGenerate }: { disabled: boolean; onGenerate: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-2">
      {error && <span role="alert" className="truncate text-[11.5px] text-red-600">{error}</span>}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true); setError(null);
          try { setError(await onGenerate()); } finally { setBusy(false); }
        }}
        className="flex shrink-0 items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11.5px] font-medium text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-orange-300 border-t-orange-600" />
        ) : (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
          </svg>
        )}
        키워드 생성
      </button>
    </div>
  );
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
      className="mt-4 rounded-xl border border-[#F6D5CC] bg-[#FFF8F6] p-4"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 헤더 */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#D1260F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-[14px] font-semibold text-[#D1260F]">{op.question}</p>
        </div>
        {isHost && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => onToggleHidden(op.opinionKey)}
              title={op.hidden ? "보이기" : "숨기기"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#adb2ba] transition hover:bg-[#FBE3DC] hover:text-[#D1260F]"
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
                className="flex-1 rounded-lg border border-[#dde3eb] bg-white px-3 py-2 text-[14px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:border-[#D1260F]"
              />
              <button
                disabled={!draft.trim() || !myUserId}
                onClick={submit}
                className="shrink-0 rounded-lg bg-[#D1260F] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[#A81A08] disabled:opacity-40"
              >
                전송
              </button>
            </div>
          ) : null}

          {/* 내 제출 답변 표시 + 수정 버튼 */}
          {hasSubmitted && !editing && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-200 text-xs font-semibold text-red-700">
                {getName(myUserId).charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-red-600">나의 답변</p>
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
  selectedIdeas = [],
  selectedStandards = [],
  opinions,
  myUserId,
  memberNames,
  onSelect,
  onStatusChange,
  onAskOpinion,
  onAiGuide,
  onAiFeedback,
  onOpenModal,
  onTextChange,
  onStructuredChange,
  canUndo,
  onUndo,
  onClear,
  onActivate,
  onA3SelectionsChange,
  onToggleOpinionHidden,
  onDeleteOpinion,
  onSubmitOpinion,
  onSimulate,
  onApplyToDesign,
  visions,
  memberSubjects,
  onVisionsChange,
  onGenerateKeywords,
}: Props) {
  // 초안 미리보기 카드는 코드·with AI·반영하기·건너뛰기·의견묻기 없이 보여 준다
  const isSim = act.code === "A-5";
  const locked = !isSim && (st === "completed" || st === "skipped");
  const getName = (uid: string) => memberNames[uid] ?? uid;
  // 비어 있는 카드는 피드백할 내용이 없다
  const hasVisions = !!visions && Object.values(visions).some((items) => items.some((e) => e.text.trim()));
  const filled = act.code === 'A-3'
    ? selectedIdeas.length + selectedStandards.length > 0
    : CARD_SCHEMAS[act.code]
      // 칸이 정해진 카드는 지금 카드에 있는 칸만 본다 (지운 칸·분류만 채운 표 행은 내용이 아니다). 초안 미리보기처럼 칸이 없는 카드는 값 전체를
      ? (CARD_SCHEMAS[act.code].fields.length ? cardHasContent(act.code, structuredValue) : hasContent(structuredValue)) || hasVisions
      : textValue.trim() !== "";
  const oldIdeaRows = Array.isArray(structuredValue.core_ideas) ? structuredValue.core_ideas as { subject?: string; core_idea?: string }[] : [];
  const oldStandardRows = Array.isArray(structuredValue.achievement_standards) ? structuredValue.achievement_standards as { subject?: string; standard?: string }[] : [];
  const unlinkedA3Rows = act.code === 'A-3'
    ? oldIdeaRows.filter(row => row?.core_idea?.trim() && !selectedIdeas.some(item => item.subject === row.subject && item.content === row.core_idea)).length
      + oldStandardRows.filter(row => row?.standard?.trim() && !selectedStandards.some(item => row.standard === `${item.code} ${item.content}`)).length
    : 0;

  return (
    <div
      onClick={() => onSelect(act.code)}
      // 안쪽 버튼·입력칸은 클릭을 막아(stopPropagation) 위 onClick 이 닿지 않는다.
      // 캡처 단계에서 먼저 받아, 카드 안 어디를 누르거나 Tab 으로 들어와도 이 카드가 활성화되게 한다.
      onPointerDownCapture={() => { if (!isSelected) onActivate(act.code); }}
      onFocusCapture={() => { if (!isSelected) onActivate(act.code); }}
      className={`relative mb-6 rounded-2xl p-6 border transition-all cursor-pointer overflow-hidden ${
        locked && st === "completed" ? "bg-[#FFF8F3] border-[#F8D2BF]"
        : locked && st === "skipped"  ? "bg-[#f5f6f8] border-[#e2e4ea]"
        : "bg-white border-transparent"
      }`}
    >
      {/* 활성화 인디케이터 — 왼쪽 세로 바 */}
      {isSelected && (
        <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl bg-[#D1260F]`} />
      )}

      {/* 헤더: 코드 + 토글 버튼 */}
      {!isSim && (
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-[13px] font-bold tracking-widest uppercase ${locked ? "text-[#adb2ba]" : "text-[#D1260F]"}`}>
          {act.code}
        </p>
        <div className="flex flex-row gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onAiFeedback(act); }}
            disabled={!filled}
            title={filled ? "카드의 현재 내용을 수업설계 전체 흐름에 비추어 피드백합니다" : "카드에 내용을 입력하면 피드백을 받을 수 있습니다"}
            className="flex items-center gap-1 rounded-md bg-gradient-to-br from-[#D1260F] to-[#F0603C] px-3 py-1 text-[12px] font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
            with AI
          </button>
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
                  : "bg-red-50 text-red-600 hover:bg-red-100"
              }`}
            >
              건너뛰기
            </button>
          )}
          {isHost && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(act.code); onAskOpinion(act.code); }}
              className="rounded-md px-3 py-1 text-[12px] font-medium transition bg-red-50 text-red-600 hover:bg-red-100"
            >
              의견묻기
            </button>
          )}
        </div>
      </div>
      )}

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
          <div className="flex shrink-0 items-center gap-1.5">
            {/* 되돌리기 — 이 카드의 직전 작업 상태로 */}
            <button
              onClick={(e) => { e.stopPropagation(); onUndo(act.code); }}
              disabled={!canUndo || locked}
              title="되돌리기"
              aria-label="되돌리기"
              className={`${toolBtn} hover:bg-[#e6eaf0] hover:text-[#2d3339]`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" />
              </svg>
            </button>
            {/* 지우기 — 확인 창을 거쳐 카드 내용을 모두 비운다 */}
            <button
              onClick={(e) => { e.stopPropagation(); onClear(act.code); }}
              disabled={!filled || locked}
              title="지우기"
              aria-label="지우기"
              className={`${toolBtn} hover:bg-red-50 hover:text-[#D1260F]`}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21l-4.3-4.3a2.4 2.4 0 010-3.4l9.6-9.6a2.4 2.4 0 013.4 0l5.6 5.6a2.4 2.4 0 010 3.4L13 21M22 21H7M5 11l9 9" />
              </svg>
            </button>
            {/* AI 안내 버튼 */}
            <button
              onClick={(e) => { e.stopPropagation(); onAiGuide(act); }}
              title="AI 안내"
              className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-[15px] leading-relaxed text-[#5a6066]">{act.description}</p>
      </div>

      {/* A-3 검색 버튼 — 반영 뒤에도 자리를 지켜 카드 높이가 바뀌지 않게 비활성으로 둔다 */}
      {act.code === "A-3" && (
        <div className="mb-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenModal("핵심아이디어검색"); }}
            disabled={locked}
            className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-[13px] font-medium text-orange-700 hover:bg-orange-100 transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:bg-orange-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            핵심아이디어 검색
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenModal("성취기준검색"); }}
            disabled={locked}
            className="flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-[13px] font-medium text-orange-700 hover:bg-orange-100 transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:bg-orange-50"
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
          onApplyToDesign={onApplyToDesign}
        />
      ) : act.code === 'A-3' ? (
        <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
          {unlinkedA3Rows > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            이전 직접 입력 {unlinkedA3Rows}건은 목록의 선택 항목과 일치하지 않아 반영되지 않습니다. 검색에서 해당 항목을 다시 선택해 주세요.
          </p>}
          <A3SelectionTables
            ideas={selectedIdeas}
            standards={selectedStandards}
            onRemoveIdea={onA3SelectionsChange && !locked
              ? (id) => onA3SelectionsChange(selectedIdeas.filter((item) => item.id !== id), selectedStandards)
              : undefined}
            onRemoveStandard={onA3SelectionsChange && !locked
              ? (code) => onA3SelectionsChange(selectedIdeas, selectedStandards.filter((item) => item.code !== code))
              : undefined}
          />
        </div>
      ) : CARD_SCHEMAS[act.code] ? (
        <div className="space-y-4">
          {/* T-1 개인별 교육비전 — 참가자마다 따로 저장해 카드 필드(비전 키워드·팀 공동 비전) 위에 둔다 */}
          {act.code === "T-1" && visions && onVisionsChange && (
            <div onClick={(e) => e.stopPropagation()}>
              <p className="mb-1.5 text-[12px] font-semibold text-[#757b82]">개인별 교육비전</p>
              <VisionBoard visions={visions} memberNames={memberNames} memberSubjects={memberSubjects ?? {}} myUserId={myUserId} locked={locked} onChange={onVisionsChange} />
            </div>
          )}
          <CardFieldRenderer
            schema={CARD_SCHEMAS[act.code]}
            value={structuredValue}
            onChange={(fields) => onStructuredChange(act.code, fields)}
            locked={locked}
            fieldActions={act.code === "T-1" && onGenerateKeywords
              ? { vision_keywords: <KeywordGenerateButton disabled={locked || !hasVisions} onGenerate={onGenerateKeywords} /> }
              : undefined}
          />
        </div>
      ) : (
        <textarea
          value={textValue}
          onChange={(e) => onTextChange(act.code, e.target.value)}
          onClick={(e) => e.stopPropagation()}
          disabled={locked}
          placeholder="내용을 입력하세요…"
          className="w-full min-h-[100px] resize-y rounded-xl border-none bg-[#f1f4f9] px-4 py-3 text-[16px] leading-relaxed text-[#2d3339] placeholder-[#adb2ba] outline-none transition focus:ring-2 focus:ring-[#D1260F]/20 disabled:opacity-60 disabled:resize-none"
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

      {/* 반영하기 — 예전 완료 버튼. 누르면 완료, 다시 누르면 취소 */}
      {!isSim && canComplete && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(act.code);
              onStatusChange(act.code, st === "completed" ? "active" : "completed");
            }}
            title={st === "completed" ? "다시 누르면 반영을 취소합니다" : "카드 내용을 반영하고 완료로 표시합니다"}
            className={`flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13.5px] font-bold shadow-sm transition ${
              st === "completed"
                ? "border-orange-500 bg-orange-500 text-white hover:border-orange-600 hover:bg-orange-600"
                : "border-orange-400 bg-orange-50 text-orange-700 hover:border-orange-500 hover:bg-orange-100"
            }`}
          >
            {st === "completed" ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            반영하기
          </button>
        </div>
      )}
    </div>
  );
}

// 제목 오른쪽 작은 원형 버튼(되돌리기·지우기) 공통 모양 — 쓸 수 없을 때는 흐리게 자리만 지킨다
const toolBtn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f1f4f9] text-[#757b82] transition-colors " +
  "disabled:cursor-default disabled:opacity-35 disabled:hover:bg-[#f1f4f9] disabled:hover:text-[#757b82]";

/** 카드 값에 실제로 적힌 내용이 있는지 — 표의 행 id 같은 내부 키는 빼고 본다 */
function hasContent(v: unknown): boolean {
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.some(hasContent);
  if (v && typeof v === "object") return Object.entries(v).some(([k, x]) => k !== "id" && hasContent(x));
  return false;
}

export default memo(ActivityCard);
