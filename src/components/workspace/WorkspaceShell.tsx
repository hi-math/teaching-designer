"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ProfilePanel, { type UserProfile } from "@/components/dashboard/ProfilePanel";
import { AppShellHeader, AppShellLogo } from "@/components/layout/AppShellHeader";
import { getAppShellHeaderSurface } from "@/lib/appThemeHeader";
import ChatInterface, { type ChatTrigger } from "@/components/ChatInterface";
import TeamChatPanel from "@/components/TeamChatPanel";
import ReferenceModal from "@/components/workspace/ReferenceModal";
import StandardsModal, { type StandardItem } from "@/components/workspace/StandardsModal";
import IdeasModal, { type IdeaItem } from "@/components/workspace/IdeasModal";
import ShareModal from "@/components/workspace/ShareModal";
import ActivityCard, { type OpinionEntry } from "@/components/workspace/ActivityCard";
import { CARD_SCHEMAS, serializeStructuredForAI } from "@/components/workspace/cardSchemas";
import { showAlert, showConfirm } from "@/components/ui/dialog";
import ChatManageModal from "@/components/workspace/ChatManageModal";
import { bracketCode, fixDoubleBrackets } from "@/lib/standardCode";
import { DEFAULT_LLM_MODEL, LLM_MODEL_ROW, resolveLlmModel, type LlmModelId } from "@/lib/llmModels";
import { newSessionId, standardCodesOnly, contentBullets, type SimSession } from "@/components/workspace/SimulationBoard";
import WorkModeSwitch, { type WorkMode } from "@/components/workspace/WorkModeSwitch";
import { localWriteKey, readRemoteContent, stableStringify } from "@/components/workspace/remoteContent";
import { CardUndoHistory, type CardValue, type UndoMode } from "@/components/workspace/cardUndo";
import { URL_KEYS as EXPLORER_URL_KEYS } from "@/lib/standards-graph/url-state";
import { IDEATION_ROW } from "@/lib/ideation/model";
import type { ContentMap } from "@/lib/ideation/application";
import { a3SelectionFields, mergeCatalogItems } from '@/lib/a3Selection';

// 아이디어 도출(성취기준 연결 탐색기)은 처음 열 때 코드를 받는다
const IdeationWorkspace = dynamic(() => import("@/components/ideation/IdeationWorkspace"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#D1260F] border-t-transparent" />
    </div>
  ),
});

// ─── 워크스페이스 UI 토큰 (세이지 테마 고정) ─────────────────────

const SIDEBAR_BG = "#f1f4f9";

// ActivityCard 로 내려가는 빈 값 — 매 렌더 새 리터럴을 만들면 memo 가 항상 깨진다
const EMPTY_FIELDS: Record<string, unknown> = {};
const EMPTY_OPINIONS: OpinionEntry[] = [];

// ─── 상수 ─────────────────────────────────────────────────────────

const PHASES = [
  { code: "T",  label: "팀 준비",   english: "PHASE 01 — Team Prep",     description: "협력적 수업설계를 위한 팀 비전을 설정하고, 역할과 일정을 합의합니다." },
  { code: "A",  label: "분석",      english: "PHASE 02 — Analysis",       description: "수업 주제를 선정하고 핵심 아이디어와 성취 기준을 분석합니다." },
  { code: "Ds", label: "설계",      english: "PHASE 03 — Design",         description: "평가 계획, 문제 상황, 학습 활동, 지원 도구와 스캐폴딩을 설계합니다." },
  { code: "DI", label: "개발/실행", english: "PHASE 04 — Development",    description: "수업 자료를 개발하고 실제 수업을 실행하며 기록합니다." },
  { code: "E",  label: "평가/성찰", english: "PHASE 05 — Evaluation",     description: "수업과 설계 과정을 성찰하고 다음 설계를 위한 개선안을 도출합니다." },
];

type Activity = { code: string; label: string; description: string; badge?: string };
type PhaseSection = { code: string; label: string; tabLabel: string; activities: Activity[] };

const PHASE_SECTIONS: Record<string, PhaseSection[]> = {
  T: [
    {
      code: "T-a", label: "비전 설정", tabLabel: "팀 비전 및 설계 방향 설정",
      activities: [
        { code: "T-1", label: "비전 설정", description: "팀원들이 협력적 수업설계를 통해 실현하고자 하는 궁극적인 교육목적에 대해 자유롭게 논의하고 공통의 비전을 설정한다." },
        { code: "T-2", label: "수업설계 방향 수립", description: "팀원들이 협력적 수업설계의 목적을 달성하기 위해 지향해야 할 수업설계의 방향을 설정한다." },
      ],
    },
    {
      code: "T-b", label: "역할 분담", tabLabel: "팀 운영 구조 수립",
      activities: [
        { code: "T-3", label: "역할 분담", description: "협력적 수업설계에 필요한 역할을 나열하고, 팀원들의 특성과 희망을 고려하여 역할을 배분한다." },
        { code: "T-4", label: "팀 규칙", description: "팀의 협력적 수업설계를 위한 팀 규칙에 대해 논의하고, 팀원들의 상황을 고려하여 결정한다." },
        { code: "T-5", label: "팀 일정", description: "팀의 협력적 수업설계를 위한 팀 일정에 대해 논의하고, 팀원들의 상황을 고려하여 결정한다." },
      ],
    },
  ],
  A: [
    {
      code: "A-a", label: "주제 선정", tabLabel: "수업 주제 선정",
      activities: [
        { code: "A-1", label: "주제 선정 기준", description: "팀원들은 주제 선정 기준에 대해 논의하고 조정한다." },
        { code: "A-2", label: "주제 선정", description: "팀원들은 함께 설계할 주제들을 나열하고 선정한다." },
      ],
    },
    {
      code: "A-b", label: "핵심 아이디어 분석", tabLabel: "학습 내용 분석 및 목표 진술",
      activities: [
        { code: "A-3", label: "성취 기준 분석", description: "팀원들은 선정된 주제와 관련된 교과별 성취기준을 분석하고, 핵심적으로 반영할 요소를 통합하며 재구조화한다." },
        { code: "A-4", label: "통합된 수업 목표", description: "팀원들은 재구조화한 성취기준을 결합하여 통합된 수업목표로 진술하고, 필요에 따라 평가의 준거가 될 성취수준으로 구체화한다." },
        { code: "A-5", label: "초안 미리보기", description: "팀 비전, 수업 기본정보, 핵심 아이디어, 성취기준, 분석 단계의 결과를 바탕으로 차시별 수업 초안을 미리 그려 봅니다." },
      ],
    },
  ],
  Ds: [
    {
      code: "Ds-a", label: "평가 및 문제 설계", tabLabel: "평가·문제·학습활동 설계",
      activities: [
        { code: "Ds-1", label: "평가 계획", description: "수업목표에 적합한 평가 아이디어에 대해 논의하고, 최종 결과와 활동 과정 상의 평가 내용 및 방법을 조정한다." },
        { code: "Ds-2", label: "문제 상황", description: "팀원들은 문제 상황에 대한 아이디어를 나열하고, 팀원들의 논의를 통해 조정한다." },
        { code: "Ds-3", label: "학습 활동 설계", description: "팀원들은 학습자들이 수행해야 할 학습활동을 나열하고, 팀원들의 논의를 통해 조정한다." },
      ],
    },
    {
      code: "Ds-b", label: "지원 도구·스캐폴딩 설계", tabLabel: "학습 지원 환경 설계",
      activities: [
        { code: "Ds-4", label: "지원 도구 설계", description: "학습활동을 지원하는 도구들을 각각의 활동과 연결하고, 공동의 논의를 통해 조정한다." },
        { code: "Ds-5", label: "스캐폴딩 설계", description: "각 활동에서 학생들에게 필요한 스캐폴딩을 나열하고, 팀원들의 논의를 통해 조정한다." },
      ],
    },
  ],
  DI: [
    {
      code: "DI-a", label: "개발 및 프로토타이핑", tabLabel: "수업 자료 개발",
      activities: [
        { code: "DI-1", label: "개발 자료 목록", description: "팀의 학습활동 설계안 및 개별 교사의 설계안에 근거하여 교과별 개발할 자료 목록을 나열하고, 팀원들의 논의를 통해 조정한다." },
      ],
    },
    {
      code: "DI-b", label: "수업 기록", tabLabel: "수업 실행 및 기록",
      activities: [
        { code: "DI-2", label: "수업 기록", description: "팀원들은 수업을 실행하고, 수업의 주요 상황이나 에피소드를 기록한다." },
      ],
    },
  ],
  E: [
    {
      code: "E-a", label: "수업 성찰", tabLabel: "수업 성찰 및 개선",
      activities: [
        { code: "E-1", label: "수업 성찰", description: "수업 실행에서 수집한 학습(평가) 자료에 근거하여 성찰·평가한 내용을 공유하고, 설계한 수업을 공동으로 개선한다." },
      ],
    },
    {
      code: "E-b", label: "수업설계 과정 성찰", tabLabel: "협력적 설계 과정 평가",
      activities: [
        { code: "E-2", label: "수업설계 과정 성찰", description: "각 단계별 협력적 수업설계 목표에 근거하여 활동 결과를 성찰하고 평가한다." },
      ],
    },
  ],
};


// ─── 버전 타입 ────────────────────────────────────────────────────

/** 반영(완료)·건너뛴 카드는 잠겨 지우기·되돌리기도 막는다 — 초안 미리보기(A-5)는 잠기지 않는다 */
const isLockedCard = (code: string, status?: string) =>
  code !== "A-5" && (status === "completed" || status === "skipped");

type Snapshot = {
  id: string;
  version_num: number;
  trigger: "auto" | "session_end" | "manual";
  created_at: string;
};

// ─── 버전 관리 모달 ───────────────────────────────────────────────

function VersionModal({
  snapshots,
  lessonId,
  onRestore,
  onClose,
}: {
  snapshots: Snapshot[];
  lessonId: string;
  onRestore: (contents: Record<string, { type: string; text?: string; status?: string; rows?: unknown[]; items?: unknown[]; question?: string; active?: boolean; response?: string; fields?: Record<string, unknown> }>) => Promise<void>;
  onClose: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, { type: string; text?: string; status?: string; rows?: unknown[]; items?: unknown[]; question?: string; active?: boolean; response?: string; fields?: Record<string, unknown> }> | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmSnap, setConfirmSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleExpand = async (snap: Snapshot) => {
    if (expandedId === snap.id) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(snap.id);
    setDetail(null);
    const { data } = await createClient()
      .from("lesson_snapshots")
      .select("contents")
      .eq("id", snap.id)
      .single();
    if (data) setDetail(data.contents as Record<string, { type: string; text?: string; status?: string; rows?: unknown[]; items?: unknown[] }>);
  };

  const handleRestore = async (snap: Snapshot) => {
    setRestoring(true);
    const { data } = await createClient()
      .from("lesson_snapshots")
      .select("contents")
      .eq("id", snap.id)
      .single();
    if (data) await onRestore(data.contents as Record<string, { type: string; text?: string; status?: string; rows?: unknown[]; items?: unknown[] }>);
    setRestoring(false);
  };

  function formatTs(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex w-[560px] max-h-[78vh] flex-col rounded-2xl border border-gray-200 bg-white shadow-xl">

        {/* 복원 확인 다이얼로그 */}
        {confirmSnap && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/20">
            <div className="w-[340px] rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
              <div className="mb-1 flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-[15px] font-semibold text-gray-900">버전 복원</h3>
              </div>
              <p className="mb-1 text-[13px] text-[#5a6066]">
                <span className="font-semibold text-[#D1260F]">v{confirmSnap.version_num}</span> 으로 복원합니다.
              </p>
              <p className="mb-5 text-[13px] text-amber-600">입력 내용이 삭제될 수 있습니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmSnap(null)}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-[13px] font-medium text-[#757b82] transition hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  disabled={restoring}
                  onClick={async () => {
                    await handleRestore(confirmSnap);
                    setConfirmSnap(null);
                  }}
                  className="flex-1 rounded-lg bg-[#D1260F] py-2 text-[13px] font-semibold text-white transition hover:bg-[#A81A08] disabled:opacity-40"
                >
                  {restoring ? "복원 중…" : "복원"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-[#D1260F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-[17px] font-semibold text-gray-900">버전 관리</h2>
            <span className="rounded-full bg-[#f1f4f9] px-2 py-0.5 text-[12px] font-medium text-[#757b82]">{snapshots.length}개</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 버전 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-[#adb2ba]">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[14px]">저장된 버전이 없습니다</p>
              <p className="text-[12px]">내용 입력 후 1분이 지나면 자동으로 버전이 생성됩니다</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {snapshots.map((snap, idx) => (
                <div key={snap.id} className="rounded-xl border border-[#eef0f6] bg-[#FFFAF8] overflow-hidden">
                  {/* 버전 행 */}
                  <div
                    className="flex cursor-pointer items-center justify-between px-4 py-3 transition hover:bg-[#FFF3EF]"
                    onClick={() => handleExpand(snap)}
                  >
                    <div className="flex items-center gap-3">
                      {/* 깃 커밋 dot */}
                      <div className="relative flex flex-col items-center">
                        <div className="h-3 w-3 rounded-full border-2 border-[#D1260F] bg-white" />
                        {idx < snapshots.length - 1 && (
                          <div className="absolute top-3 h-full w-px bg-[#dde3eb]" style={{ top: "12px", height: "calc(100% + 6px)" }} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] font-bold text-[#D1260F]">v{snap.version_num}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              snap.trigger === "session_end"
                                ? "bg-amber-50 text-amber-600"
                                : "bg-red-50 text-red-500"
                            }`}
                          >
                            {snap.trigger === "session_end" ? "세션 종료" : "자동 저장"}
                          </span>
                        </div>
                        <p className="text-[12px] text-[#adb2ba]">{formatTs(snap.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmSnap(snap); }}
                        className="rounded-lg border border-[#dde3eb] bg-white px-3 py-1 text-[12px] font-medium text-[#5a6066] transition hover:border-[#D1260F] hover:text-[#D1260F]"
                      >
                        복원
                      </button>
                      <svg
                        className={`h-4 w-4 text-[#adb2ba] transition-transform ${expandedId === snap.id ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* 상세 내용 */}
                  {expandedId === snap.id && (
                    <div className="border-t border-[#eef0f6] bg-white px-4 py-3">
                      {!detail ? (
                        <p className="text-[13px] text-[#adb2ba]">불러오는 중…</p>
                      ) : Object.keys(detail).length === 0 ? (
                        <p className="text-[13px] text-[#adb2ba]">저장된 내용 없음</p>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto">
                          {Object.entries(detail)
                            .filter(([, c]) => c.text?.trim())
                            .map(([code, c]) => (
                              <div key={code}>
                                <span className="font-mono text-[11px] font-bold text-[#D1260F]">{code}</span>
                                <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-[#5a6066]">{c.text}</p>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 수업 기본정보 모달 ──────────────────────────────────────────

const GRADE_BUTTONS = ["중학교 1학년", "중학교 2학년", "중학교 3학년"];

const SUBJECT_BUTTONS = [
  "국어", "수학", "영어", "과학", "사회", "역사", "도덕",
  "기술·가정", "정보", "체육", "음악", "미술", "한문",
  "생활 일본어", "생활 중국어", "생활 프랑스어", "생활 독일어",
  "생활 스페인어", "생활 러시아어", "생활 아랍어", "생활 베트남어",
];

function toArr(v: string): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
function toStr(arr: string[]): string {
  return arr.join(",");
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LessonInfoModal({
  lessonId,
  title,
  targetGrade,
  relatedSubjects,
  numClasses,
  numStudents,
  totalSessions,
  onTitleChange,
  onTargetGradeChange,
  onRelatedSubjectsChange,
  onNumClassesChange,
  onNumStudentsChange,
  onTotalSessionsChange,
  onClose,
  readOnly = false,
}: {
  lessonId: string;
  title: string;
  targetGrade: string;
  relatedSubjects: string;
  numClasses: number | null;
  numStudents: number | null;
  totalSessions: number | null;
  onTitleChange: (v: string) => void;
  onTargetGradeChange: (v: string) => void;
  onRelatedSubjectsChange: (v: string) => void;
  onNumClassesChange: (v: number | null) => void;
  onNumStudentsChange: (v: number | null) => void;
  onTotalSessionsChange: (v: number | null) => void;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const [localTitle, setLocalTitle] = useState(title);
  const [selectedGrades, setSelectedGrades] = useState<string[]>(() => toArr(targetGrade));
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(() => toArr(relatedSubjects));
  const [localTotalSessions, setLocalTotalSessions] = useState<string>(totalSessions != null ? String(totalSessions) : "");
  const [createdDate, setCreatedDate] = useState<string>(todayStr());
  const [saving, setSaving] = useState(false);

  // DB에서 created_date 로드
  useEffect(() => {
    createClient().from("lessons").select("created_date").eq("id", lessonId).single().then(({ data }) => {
      if (data?.created_date) setCreatedDate(data.created_date);
    });
  }, [lessonId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleConfirm = async () => {
    setSaving(true);
    const g = toStr(selectedGrades);
    const s = toStr(selectedSubjects);
    const ts = localTotalSessions !== "" ? parseInt(localTotalSessions, 10) : null;
    await createClient().from("lessons").update({
      title: localTitle || "새 수업설계",
      target_grade: g || null,
      related_subjects: s || null,
      num_classes: null,
      num_students: null,
      total_sessions: ts,
      created_date: createdDate || null,
    }).eq("id", lessonId);
    onTitleChange(localTitle);
    onTargetGradeChange(g);
    onRelatedSubjectsChange(s);
    onNumClassesChange(null);
    onNumStudentsChange(null);
    onTotalSessionsChange(ts);
    setSaving(false);
    onClose();
  };

  const toggleGrade = (g: string) =>
    setSelectedGrades((prev) =>
      prev.includes(g) ? prev.filter((v) => v !== g) : [...prev, g]
    );

  const toggleSubject = (s: string) =>
    setSelectedSubjects((prev) =>
      prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s]
    );

  const fieldCls = `w-full rounded-xl bg-[#f1f4f9] px-4 py-3 text-[15px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20 ${readOnly ? "cursor-default" : ""}`;
  const labelCls = "mb-1.5 block text-[13px] font-semibold text-[#5a6066]";
  const rowCls = "flex items-center gap-4";
  const leftCls = "w-[120px] shrink-0 text-[14px] font-semibold text-[#5a6066]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[660px] max-h-[90vh] flex flex-col rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-8 py-5">
          <h2 className="text-[20px] font-bold text-gray-900">수업 기본정보</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 폼 */}
        <div className="flex-1 overflow-y-auto space-y-6 px-8 py-7">

          {/* 수업 제목 */}
          <div className={rowCls}>
            <span className={leftCls}>수업 제목</span>
            <input
              value={localTitle}
              onChange={(e) => !readOnly && setLocalTitle(e.target.value)}
              readOnly={readOnly}
              placeholder="수업 제목을 입력하세요"
              className={fieldCls}
            />
          </div>

          {/* 대상 학년 */}
          <div className={rowCls}>
            <span className={leftCls}>대상 학년</span>
            <div className="flex flex-wrap gap-2">
              {GRADE_BUTTONS.map((g) => (
                <button
                  key={g}
                  onClick={() => !readOnly && toggleGrade(g)}
                  disabled={readOnly}
                  className={`rounded-full px-5 py-2 text-[13px] font-medium transition ${
                    selectedGrades.includes(g)
                      ? "bg-[#D1260F] text-white"
                      : "bg-[#f1f4f9] text-[#757b82] hover:bg-[#FBE3DC] hover:text-[#D1260F]"
                  } ${readOnly ? "cursor-default" : ""}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 교과 */}
          <div className={rowCls}>
            <span className={`${leftCls} self-start pt-1`}>교과</span>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_BUTTONS.map((s) => (
                <button
                  key={s}
                  onClick={() => !readOnly && toggleSubject(s)}
                  disabled={readOnly}
                  className={`rounded-full px-4 py-1.5 text-[13px] font-medium transition ${
                    selectedSubjects.includes(s)
                      ? "bg-[#D1260F] text-white"
                      : "bg-[#f1f4f9] text-[#757b82] hover:bg-[#FBE3DC] hover:text-[#D1260F]"
                  } ${readOnly ? "cursor-default" : ""}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* 총 차시 */}
          <div className={rowCls}>
            <span className={leftCls}>총 차시</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={localTotalSessions}
                onChange={(e) => !readOnly && setLocalTotalSessions(e.target.value)}
                readOnly={readOnly}
                placeholder="—"
                className={`w-32 rounded-xl bg-[#f1f4f9] px-4 py-3 text-[15px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20 ${readOnly ? "cursor-default" : ""}`}
              />
              <span className="text-[14px] text-[#757b82]">차시</span>
            </div>
          </div>

          {/* 작성일 */}
          <div className={rowCls}>
            <span className={leftCls}>작성일</span>
            <div className="relative">
              <input
                type="date"
                value={createdDate}
                onChange={(e) => !readOnly && setCreatedDate(e.target.value)}
                readOnly={readOnly}
                className={`rounded-xl bg-[#f1f4f9] px-4 py-3 text-[15px] text-[#2d3339] outline-none focus:ring-2 focus:ring-[#D1260F]/20 ${readOnly ? "cursor-default" : ""}`}
              />
            </div>
          </div>

        </div>

        {/* 푸터 */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-gray-100 px-8 py-5">
          {readOnly ? (
            <button onClick={onClose} className="rounded-xl bg-[#D1260F] px-6 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#A81A08]">
              닫기
            </button>
          ) : (
            <>
              <button onClick={onClose} className="rounded-xl border border-gray-200 px-6 py-2.5 text-[14px] font-medium text-[#757b82] transition hover:bg-gray-50">
                취소
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="rounded-xl bg-[#D1260F] px-6 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#A81A08] disabled:opacity-50"
              >
                {saving ? "저장 중…" : "완료"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 워크스페이스 모달 ────────────────────────────────────────────

function WorkModal({ title, onClose }: { title: string; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[520px] rounded-2xl border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-[18px] font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex h-40 items-center justify-center p-6">
          <p className="text-[16px] text-gray-400">준비 중</p>
        </div>
      </div>
    </div>
  );
}

// ─── 권한관리 모달 ────────────────────────────────────────────────

type Permissions = { phaseNav: boolean; complete: boolean; skip: boolean; opinion: boolean; titleEdit: boolean };

function PermissionsModal({
  permissions,
  onChange,
  onClose,
}: {
  permissions: Permissions;
  onChange: (p: Permissions) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const toggle = (key: keyof Permissions) => onChange({ ...permissions, [key]: !permissions[key] });

  const items: { key: keyof Permissions; label: string; desc: string }[] = [
    { key: "phaseNav",  label: "단계 이동",  desc: "참여자가 단계를 이동할 수 있습니다." },
    { key: "complete",  label: "완료",       desc: "참여자가 완료 버튼을 누를 수 있습니다." },
    { key: "skip",      label: "건너뛰기",   desc: "참여자가 건너뛰기 버튼을 누를 수 있습니다." },
    { key: "opinion",   label: "의견묻기",   desc: "참여자가 의견묻기 버튼을 누를 수 있습니다." },
    { key: "titleEdit", label: "제목 수정",  desc: "참여자가 프로젝트 제목을 수정할 수 있습니다." },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[520px] rounded-2xl border border-gray-200 bg-white shadow-xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-[#D1260F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <h2 className="text-[17px] font-semibold text-gray-900">권한 관리</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 권한 목록 */}
        <div className="divide-y divide-gray-100 px-6 py-2">
          {items.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#2d3339]">{label}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#757b82]">{desc}</p>
              </div>
              {/* 토글 스위치 */}
              <button
                type="button"
                onClick={() => toggle(key)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${permissions[key] ? "bg-[#D1260F]" : "bg-gray-200"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${permissions[key] ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#D1260F] px-5 py-2 text-[14px] font-semibold text-white transition hover:bg-[#A81A08]"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

function WorkNavButton({
  active,
  onClick,
  icon,
  label,
  collapsed = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  collapsed?: boolean;
  children?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        title={collapsed ? label : undefined}
        onClick={onClick}
        className={`flex w-full items-center rounded-full py-2.5 text-[16px] font-medium transition-colors outline-none focus:outline-none ${
          collapsed ? "justify-center px-2" : "gap-3 px-3"
        } ${
          active
            ? "bg-[#D1260F]/10 font-semibold text-[#D1260F]"
            : "text-[#757b82] hover:bg-[#D1260F]/5 hover:text-[#D1260F]"
        }`}
      >
        {icon}
        {!collapsed && label}
      </button>
      {children}
    </li>
  );
}

export default function WorkspaceShell({
  lessonId,
  initialWorkMode = "design",
}: {
  lessonId: string;
  initialWorkMode?: WorkMode;
}) {
  const [activePhase, setActivePhase] = useState("T");
  const [activeSection, setActiveSection] = useState("T-a");
  const [projectTitle, setProjectTitle] = useState("");
  const [targetGrade, setTargetGrade] = useState("");
  const [relatedSubjects, setRelatedSubjects] = useState("");
  const [numClasses, setNumClasses] = useState<number | null>(null);
  const [numStudents, setNumStudents] = useState<number | null>(null);
  const [totalSessions, setTotalSessions] = useState<number | null>(null);
  const [titleSaveStatus, setTitleSaveStatus] = useState<"idle" | "saved">("idle");
  const [titleFocused, setTitleFocused] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // 헤더의 수업 설계 / 아이디어 도출 전환 — 사이드바·채팅은 두 화면이 함께 쓴다
  const [workMode, setWorkMode] = useState<WorkMode>(initialWorkMode);
  // 아이디어 도출은 한 번 연 뒤에는 숨기기만 해서 탐색 상태와 받아 둔 데이터를 유지한다
  const [ideationOpened, setIdeationOpened] = useState(initialWorkMode === "ideation");
  const [ideationChatOpen, setIdeationChatOpen] = useState(false);
  const [ideationContext, setIdeationContext] = useState("");
  const changeWorkMode = (next: WorkMode) => {
    setWorkMode(next);
    if (next === "ideation") setIdeationOpened(true);
    const url = new URL(window.location.href);
    if (next === "ideation") url.searchParams.set("tab", "ideation");
    else {
      // 수업 설계로 돌아오면 탐색기 상태 파라미터를 지운다 (탐색기의 "링크 복사"가 다시 기록한다)
      url.searchParams.delete("tab");
      for (const key of EXPLORER_URL_KEYS) url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", url);
  };
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"team" | "ai">("team");
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatTrigger, setChatTrigger] = useState<ChatTrigger | undefined>(undefined);
  const notifHeaderRef = useRef<HTMLDivElement>(null);
  const [structuredInputs, setStructuredInputs] = useState<Record<string, Record<string, unknown>>>({});
  const [aiReady, setAiReady] = useState(false);
  const [activityInputs, setActivityInputs] = useState<Record<string, string>>({});
  const [activityStatus, setActivityStatus] = useState<Record<string, "active" | "completed" | "skipped">>({});
  const [selectedActivityCode, setSelectedActivityCode] = useState<string | null>(null);
  const activityStatusRef = useRef<Record<string, "active" | "completed" | "skipped">>({});

  // ── 의견묻기 ─────────────────────────────────────────────────
  type Member = { id: string; name: string; email: string; avatarUrl: string | null };
  // opinions: opinionKey(actCode__timestamp) → { question, hidden, actCode }
  // opinionResponses: opinionKey → { userId → response }
  const [lessonMembers, setLessonMembers] = useState<Member[]>([]);
  const [opinionModal, setOpinionModal] = useState<string | null>(null); // activityCode
  const [opinionDraft, setOpinionDraft] = useState("");
  const [opinions, setOpinions] = useState<Record<string, { question: string; hidden: boolean; actCode: string }>>({});
  const [opinionResponses, setOpinionResponses] = useState<Record<string, Record<string, string>>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opinionChannelRef = useRef<any>(null);
  // ── 버전 관리 ────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // ── 참고자료 ─────────────────────────────────────────────────
  // 목록용(가벼움)과 전송용(본문 포함)을 분리한다
  type RefFile = { name: string; mime: string; size: number };
  type RefFileContent = { name: string; mime: string; content?: string; pdfData?: string };
  const [referenceFiles, setReferenceFiles] = useState<RefFile[]>([]);
  const referenceFilesRef = useRef<RefFile[]>([]);
  useEffect(() => { referenceFilesRef.current = referenceFiles; }, [referenceFiles]);

  // ── 성취기준 ─────────────────────────────────────────────────
  const [selectedStandards, setSelectedStandards] = useState<StandardItem[]>([]);

  // ── 핵심아이디어 ──────────────────────────────────────────────
  const [selectedIdeas, setSelectedIdeas] = useState<IdeaItem[]>([]);

  // ── LLM 모델 (채팅관리에서 소유자가 수업별로 고른다) ──────────
  const [llmModel, setLlmModel] = useState<LlmModelId>(DEFAULT_LLM_MODEL);

  const [isHost, setIsHost] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permissions>({
    phaseNav: false, complete: false, skip: false, opinion: false, titleEdit: false,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workspaceChannelRef = useRef<any>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [ownerOffline, setOwnerOffline] = useState(false);
  const router = useRouter();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // 자동저장 디바운스 타이머
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlightSaves = useRef(new Map<string, number>());
  // 내가 마지막으로 DB 에 쓴 텍스트 — Realtime 에코를 걸러내는 데 쓴다
  const lastLocalWriteRef = useRef<Record<string, string>>({});
  // 아이디어 도출은 자동 저장이 잦아 내 이전 저장의 에코가 다음 저장보다 늦게 올 수 있다 — 최근 내 저장값을 몇 개 기억해 걸러낸다
  const recentIdeationWritesRef = useRef<string[]>([]);
  // 의견 숨기기 핸들러가 현재 질문/상태를 의존성 없이 읽기 위한 ref
  const opinionsRef = useRef<Record<string, { question: string; hidden: boolean; actCode: string }>>({});
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 미저장 콘텐츠 추적 (세션 종료 시 flush용)
  const pendingContent = useRef<Record<string, object>>({});
  const projectTitleRef = useRef("");
  // 버전 생성용 refs (클로저 의존성 없이 최신값 참조)
  const hasNewSavesRef = useRef(false);
  const nextVersionRef = useRef(1);
  const lastSnapshotTimeRef = useRef(0);
  const activityInputsRef = useRef<Record<string, string>>({});
  const selectedStandardsRef = useRef<StandardItem[]>([]);
  const selectedIdeasRef = useRef<IdeaItem[]>([]);
  const structuredInputsRef = useRef<Record<string, Record<string, unknown>>>({});
  const userProfileRef = useRef<UserProfile | null>(null);

  // ── 유저 프로필 로드 ─────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const meta = data.user.user_metadata ?? {};
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, school, subject, avatar_url")
        .eq("id", data.user.id)
        .single();
      setUserProfile({
        id: data.user.id,
        email: data.user.email ?? "",
        display_name: profile?.display_name ?? meta.display_name ?? meta.full_name ?? meta.name ?? null,
        school: profile?.school ?? meta.school ?? null,
        subject: profile?.subject ?? meta.subject ?? null,
        avatar_url: profile?.avatar_url ?? meta.avatar_url ?? null,
      });
    });
  }, []);

  // ── 레슨 데이터 & 입력 내용 로드 ─────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const [lessonRes, contentsRes] = await Promise.all([
        supabase.from("lessons").select("*").eq("id", lessonId).single(),
        supabase.from("activity_contents").select("*").eq("lesson_id", lessonId),
      ]);

      if (lessonRes.data) {
        setProjectTitle(lessonRes.data.title);
        setActivePhase(lessonRes.data.current_phase ?? "T");
        setTargetGrade(lessonRes.data.target_grade ?? "");
        setRelatedSubjects(lessonRes.data.related_subjects ?? "");
        setNumClasses(lessonRes.data.num_classes ?? null);
        setNumStudents(lessonRes.data.num_students ?? null);
        setTotalSessions(lessonRes.data.total_sessions ?? null);
        if (lessonRes.data.permissions) setPermissions(lessonRes.data.permissions as Permissions);
      }

      if (contentsRes.data) {
        const inputs: Record<string, string> = {};
        const statusMap: Record<string, "active" | "completed" | "skipped"> = {};
        const loadedOpinions: Record<string, { question: string; hidden: boolean; actCode: string }> = {};
        const loadedOpinionResponses: Record<string, Record<string, string>> = {};
        const loadedStructured: Record<string, Record<string, unknown>> = {};
        for (const row of contentsRes.data) {
          const code = row.activity_code as string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = row.content as any;
          if (code.endsWith("__opinion")) {
            if (c?.active !== false && c?.question) {
              const opinionKey = code.slice(0, -"__opinion".length);
              const m = opinionKey.match(/^(.+)__(\d+)$/);
              const actCodeFromKey = m ? m[1] : opinionKey;
              loadedOpinions[opinionKey] = { question: c.question, hidden: c.hidden === true, actCode: actCodeFromKey };
            }
            continue;
          }
          const resIdx = code.indexOf("__opinion_res_");
          if (resIdx !== -1) {
            const opinionKey = code.slice(0, resIdx);
            const uid = code.slice(resIdx + "__opinion_res_".length);
            if (!loadedOpinionResponses[opinionKey]) loadedOpinionResponses[opinionKey] = {};
            loadedOpinionResponses[opinionKey][uid] = c?.response ?? "";
            continue;
          }
          if (c.status === "completed" || c.status === "skipped") {
            statusMap[code] = c.status;
          }
          if (code === "__selected_standards" && Array.isArray(c.items)) {
            setSelectedStandards(c.items);
            selectedStandardsRef.current = c.items;
            continue;
          }
          if (code === "__selected_ideas" && Array.isArray(c.items)) {
            setSelectedIdeas(c.items);
            selectedIdeasRef.current = c.items;
            continue;
          }
          if (code === LLM_MODEL_ROW) {
            setLlmModel(resolveLlmModel(c.model));
            continue;
          }
          if (c.type === "structured" && c.fields) {
            loadedStructured[code] = c.fields as Record<string, unknown>;
            // 예전 A-3 성취기준 행은 코드가 "[[9수01-02]]" 두 겹으로 저장돼 있다 — 불러올 때 한 겹으로
            const stds = loadedStructured[code].achievement_standards;
            if (code === "A-3" && Array.isArray(stds)) {
              loadedStructured[code] = {
                ...loadedStructured[code],
                achievement_standards: (stds as Record<string, string>[]).map((r) => ({ ...r, standard: fixDoubleBrackets(r.standard ?? "") })),
              };
            }
          } else if (c.type === "text" && c.text !== undefined) {
            inputs[code] = c.text;
          }
        }
        setActivityInputs(inputs);
        setActivityStatus(statusMap);
        activityStatusRef.current = statusMap;
        if (Object.keys(loadedOpinions).length > 0) setOpinions(loadedOpinions);
        if (Object.keys(loadedOpinionResponses).length > 0) setOpinionResponses(loadedOpinionResponses);
        if (Object.keys(loadedStructured).length > 0) {
          setStructuredInputs(loadedStructured);
          structuredInputsRef.current = loadedStructured;
        }
      }

      // 최근 접근 시간 갱신
      supabase.from("lessons")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("id", lessonId);

      // 레슨 멤버 로드 + 현재 유저 역할 확인
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      const membersRes = await supabase
        .from("lesson_members")
        .select("user_id, role")
        .eq("lesson_id", lessonId);
      if (membersRes.data && membersRes.data.length > 0) {
        const myRow = membersRes.data.find((m: { user_id: string; role: string }) => m.user_id === currentUserId);
        setIsHost(myRow?.role === "owner");
        const ids = membersRes.data.map((m: { user_id: string }) => m.user_id);
        const profilesRes = await supabase
          .from("profiles")
          .select("id, display_name, email, avatar_url")
          .in("id", ids);
        if (profilesRes.data) {
          setLessonMembers(
            profilesRes.data.map((p: { id: string; display_name: string | null; email: string | null; avatar_url: string | null }) => ({
              id: p.id,
              name: p.display_name ?? p.email ?? "알 수 없음",
              email: p.email ?? "",
              avatarUrl: p.avatar_url ?? null,
            }))
          );
        }
      }
    };
    load();

    // ── Realtime + Presence 설정 (async IIFE로 감싸서 await 사용 가능하게)
    const supabaseRt = createClient();
    // cleanup용 ref — IIFE 내에서 할당 후 cleanup에서 참조
    let rtChannel: ReturnType<typeof supabaseRt.channel> | null = null;
    let presenceChannel: ReturnType<typeof supabaseRt.channel> | null = null;
    let opinionChannel: ReturnType<typeof supabaseRt.channel> | null = null;
    let workspaceChannel: ReturnType<typeof supabaseRt.channel> | null = null;

    (async () => {
      // 세션이 준비될 때까지 대기 (첫 렌더 시 auth 미초기화 방지)
      await supabaseRt.auth.getSession();

      // ── 의견묻기 Broadcast 채널 (publication 설정 불필요) ──────
      opinionChannel = supabaseRt
        .channel(`opinions:${lessonId}`)
        .on("broadcast", { event: "question" }, ({ payload }) => {
          const { opinionKey, actCode, question } = payload as { opinionKey: string; actCode: string; question: string };
          setOpinions((prev) => ({ ...prev, [opinionKey]: { question, hidden: false, actCode } }));
        })
        .on("broadcast", { event: "delete_question" }, ({ payload }) => {
          const { opinionKey } = payload as { opinionKey: string };
          setOpinions((prev) => { const n = { ...prev }; delete n[opinionKey]; return n; });
          setOpinionResponses((prev) => { const n = { ...prev }; delete n[opinionKey]; return n; });
        })
        .on("broadcast", { event: "toggle_hidden" }, ({ payload }) => {
          const { opinionKey, hidden } = payload as { opinionKey: string; hidden: boolean };
          setOpinions((prev) => (
            prev[opinionKey] ? { ...prev, [opinionKey]: { ...prev[opinionKey], hidden } } : prev
          ));
        })
        .on("broadcast", { event: "response" }, ({ payload }) => {
          const { opinionKey, userId, response } = payload as { opinionKey: string; userId: string; response: string };
          setOpinionResponses((prev) => ({
            ...prev,
            [opinionKey]: { ...(prev[opinionKey] ?? {}), [userId]: response },
          }));
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") opinionChannelRef.current = opinionChannel;
        });

      // Workspace Broadcast: permissions + phase_change + title_change
      workspaceChannel = supabaseRt
        .channel(`workspace:${lessonId}`)
        .on("broadcast", { event: "permissions" }, ({ payload }) => {
          setPermissions(payload as Permissions);
        })
        .on("broadcast", { event: "phase_change" }, ({ payload }) => {
          setActivePhase((payload as { phase: string }).phase);
        })
        .on("broadcast", { event: "title_change" }, ({ payload }) => {
          setProjectTitle((payload as { title: string }).title);
        })
        .subscribe();
      workspaceChannelRef.current = workspaceChannel;

      // Realtime: 다른 참여자의 activity_contents 변경(카드 입력·완료 상태·선택 항목) 실시간 반영
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleContentChange = (payload: any) => {
        const row = payload.new as { lesson_id: string; activity_code: string; content: Record<string, unknown> };
        if (row.lesson_id !== lessonId) return;
        const { activity_code } = row;
        if (activity_code === IDEATION_ROW && recentIdeationWritesRef.current.includes(stableStringify((row.content as { fields?: unknown } | null)?.fields))) return;

        // 내가 저장한 내용이 되돌아온 경우와 내가 아직 편집 중인 카드는 내용을 덮어쓰지 않는다.
        // 그대로 반영하면 저장 후에도 계속 타이핑 중일 때 1초 전 내용이 입력칸을 덮어써 방금 친 글자가 날아간다.
        const change = readRemoteContent(activity_code, row.content, {
          pending: pendingContent.current[activity_code] !== undefined,
          lastWrite: lastLocalWriteRef.current[activity_code],
        });

        switch (change.kind) {
          case "ignore":
            return;
          case "model":
            // 소유자가 채팅관리에서 모델을 바꾸면 참여자에게도 반영
            setLlmModel(resolveLlmModel(change.model as string | undefined));
            return;
          case "selection": {
            const items = change.items;
            if (change.code === "__selected_standards") {
              selectedStandardsRef.current = items as StandardItem[];
              setSelectedStandards((prev) => (stableStringify(prev) === stableStringify(items) ? prev : (items as StandardItem[])));
            } else {
              selectedIdeasRef.current = items as IdeaItem[];
              setSelectedIdeas((prev) => (stableStringify(prev) === stableStringify(items) ? prev : (items as IdeaItem[])));
            }
            return;
          }
          case "card": {
            const { code, status, text, fields } = change;
            if (status && activityStatusRef.current[code] !== status) {
              activityStatusRef.current = { ...activityStatusRef.current, [code]: status };
              setActivityStatus((prev) => ({ ...prev, [code]: status }));
            }
            if (text !== undefined) {
              setActivityInputs((prev) => (prev[code] === text ? prev : { ...prev, [code]: text }));
            }
            if (fields !== undefined) {
              setStructuredInputs((prev) => (
                stableStringify(prev[code]) === stableStringify(fields) ? prev : { ...prev, [code]: fields }
              ));
            }
            return;
          }
        }
      };

      rtChannel = supabaseRt
        .channel(`activity-contents:${lessonId}`)
        .on(
          "postgres_changes",
          // filter 가 없으면 DB 안 모든 수업의 변경 이벤트를 전부 받아 클라이언트에서 버리게 된다
          { event: "INSERT", schema: "public", table: "activity_contents", filter: `lesson_id=eq.${lessonId}` },
          handleContentChange
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "activity_contents", filter: `lesson_id=eq.${lessonId}` },
          handleContentChange
        )
        .on(
          "postgres_changes",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { event: "UPDATE", schema: "public", table: "lessons", filter: `id=eq.${lessonId}` } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload: any) => {
            const row = payload.new as {
              id: string;
              title?: string;
              current_phase?: string;
              permissions?: Permissions;
              target_grade?: string | null;
              related_subjects?: string | null;
              num_classes?: number | null;
              num_students?: number | null;
              total_sessions?: number | null;
            };
            if (row.id !== lessonId) return;
            // 다른 참여자가 변경한 경우만 반영 (소유자 본인은 로컬 업데이트 이미 반영됨)
            if (row.title !== undefined) setProjectTitle((prev) => prev === row.title ? prev : row.title!);
            // 수업 기본정보 (학년·교과·차시 등)
            if (row.target_grade !== undefined) setTargetGrade(row.target_grade ?? "");
            if (row.related_subjects !== undefined) setRelatedSubjects(row.related_subjects ?? "");
            if (row.num_classes !== undefined) setNumClasses(row.num_classes);
            if (row.num_students !== undefined) setNumStudents(row.num_students);
            if (row.total_sessions !== undefined) setTotalSessions(row.total_sessions);
            if (row.current_phase !== undefined) setActivePhase((prev) => prev === row.current_phase ? prev : row.current_phase!);
            if (row.permissions !== undefined) setPermissions((prev) => JSON.stringify(prev) === JSON.stringify(row.permissions) ? prev : row.permissions!);
          }
        )
        .subscribe();

      // Presence: 소유자 오프라인 감지
      const [lessonData, { data: { user: me } }] = await Promise.all([
        supabaseRt.from("lessons").select("owner_id").eq("id", lessonId).single(),
        supabaseRt.auth.getUser(),
      ]);
      const ownerId = lessonData.data?.owner_id;
      const amOwner = me?.id === ownerId;
      setIsHost(amOwner);

      presenceChannel = supabaseRt.channel(`presence:${lessonId}`, {
        config: { presence: { key: me?.id ?? "anon" } },
      });
      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel!.presenceState() as Record<string, { userId: string }[]>;
          const ids: string[] = [];
          Object.values(state).forEach((arr) => arr.forEach((u) => ids.push(u.userId)));
          setOnlineUserIds(ids);
          if (!amOwner) setOwnerOffline(!ids.includes(ownerId ?? ""));
        })
        .on("presence", { event: "join" }, ({ newPresences }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const joinedIds = (newPresences as any[]).map((p) => p.userId as string).filter(Boolean);
          setOnlineUserIds((prev) => {
            const next = [...prev];
            joinedIds.forEach((id) => { if (!next.includes(id)) next.push(id); });
            return next;
          });
          // lessonMembers에 없는 userId → 프로필 즉시 fetch
          setLessonMembers((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const missing = joinedIds.filter((id) => !existingIds.has(id) && id !== me?.id);
            if (missing.length === 0) return prev;
            supabaseRt.from("profiles")
              .select("id, display_name, email, avatar_url")
              .in("id", missing)
              .then(({ data }) => {
                if (!data) return;
                setLessonMembers((cur) => {
                  const curIds = new Set(cur.map((m) => m.id));
                  const toAdd = data
                    .filter((p: { id: string }) => !curIds.has(p.id))
                    .map((p: { id: string; display_name: string | null; email: string | null; avatar_url: string | null }) => ({
                      id: p.id,
                      name: p.display_name ?? p.email ?? "알 수 없음",
                      email: p.email ?? "",
                      avatarUrl: p.avatar_url ?? null,
                    }));
                  return toAdd.length > 0 ? [...cur, ...toAdd] : cur;
                });
              });
            return prev; // 비동기 fetch 완료 후 위에서 다시 setState
          });
        })
        .on("presence", { event: "leave" }, ({ leftPresences }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const leftIds = (leftPresences as any[]).map((p) => p.userId as string).filter(Boolean);
          setOnlineUserIds((prev) => prev.filter((id) => !leftIds.includes(id)));
          if (!amOwner && leftIds.includes(ownerId ?? "")) setOwnerOffline(true);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && me) {
            await presenceChannel!.track({ userId: me.id, role: amOwner ? "owner" : "member" });
          }
        });
    })();

    return () => {
      if (rtChannel) supabaseRt.removeChannel(rtChannel);
      if (presenceChannel) supabaseRt.removeChannel(presenceChannel);
      if (opinionChannel) supabaseRt.removeChannel(opinionChannel);
      if (workspaceChannel) supabaseRt.removeChannel(workspaceChannel);
    };
  }, [lessonId]);

  // ── lesson_members Realtime: 새 멤버 합류 시 아바타 즉시 반영 ──
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`lesson_members:${lessonId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lesson_members", filter: `lesson_id=eq.${lessonId}` },
        async (payload) => {
          const newUserId = (payload.new as { user_id: string }).user_id;
          const { data } = await supabase
            .from("profiles")
            .select("id, display_name, email, avatar_url")
            .eq("id", newUserId)
            .single();
          if (data) {
            setLessonMembers((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, { id: data.id, name: data.display_name ?? data.email ?? "알 수 없음", email: data.email ?? "", avatarUrl: data.avatar_url ?? null }];
            });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [lessonId]);

  // ── 버전 로드 ────────────────────────────────────────────────
  const loadSnapshots = useCallback(async () => {
    const { data, error } = await createClient()
      .from("lesson_snapshots")
      .select("id, version_num, trigger, created_at")
      .eq("lesson_id", lessonId)
      .order("version_num", { ascending: false })
      .limit(30);
    if (error) { console.error("[snapshots] load error:", error.message, "| code:", error.code, "| details:", error.details); return; }
    if (data) {
      setSnapshots(data as Snapshot[]);
      if (data.length > 0) {
        const latest = data[0] as Snapshot;
        nextVersionRef.current = latest.version_num + 1;
        lastSnapshotTimeRef.current = new Date(latest.created_at).getTime();
      }
    }
  }, [lessonId]);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  // ── 참고자료 목록 로드 ──────────────────────────────────────
  // 여기서는 목록(이름/타입/크기)만 가져온다.
  // 예전에는 진입 즉시 PDF 본문까지 전부 내려받아 base64 로 바꿨는데,
  // 파일 하나가 최대 10MB(+base64 33%)라 워크스페이스 진입이 그만큼 통째로 밀렸다.
  // 실제 본문은 AI 에게 보내기 직전에만 loadReferenceContents() 로 가져온다.
  const loadReferenceFiles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from("lesson-files")
      .list(lessonId, { sortBy: { column: "created_at", order: "desc" } });
    if (!data) return;

    const items = data
      .filter((f) => f.name !== ".emptyFolderPlaceholder")
      .map((f) => ({
        name: f.name,
        mime: (f as { metadata?: { mimetype?: string } }).metadata?.mimetype ?? "",
        size: (f as { metadata?: { size?: number } }).metadata?.size ?? 0,
      }));

    setReferenceFiles(items);
    // 목록이 바뀌었으니 본문 캐시는 버린다
    refContentCache.current = {};
  }, [lessonId]);

  useEffect(() => { loadReferenceFiles(); }, [loadReferenceFiles]);

  // ── 참고자료 본문 지연 로드 (AI 전송 직전에만 호출) ──────────
  // 파일별로 한 번만 받아 캐시하고, 여러 파일은 병렬로 처리한다.
  const refContentCache = useRef<Record<string, RefFileContent>>({});
  const loadReferenceContents = useCallback(async (): Promise<RefFileContent[]> => {
    const files = referenceFilesRef.current;
    if (files.length === 0) return [];
    const supabase = createClient();

    return Promise.all(
      files.map(async (f) => {
        const cached = refContentCache.current[f.name];
        if (cached) return cached;

        const lower = f.name.toLowerCase();
        const isPdf = f.mime === "application/pdf" || lower.endsWith(".pdf");
        const isText =
          !isPdf &&
          (f.mime.startsWith("text/") ||
            ["txt", "md", "csv", "json"].some((ext) => lower.endsWith("." + ext)));

        let result: RefFileContent = { name: f.name, mime: f.mime };
        try {
          if (isPdf && f.size < 10 * 1024 * 1024) {
            const { data: blob } = await supabase.storage
              .from("lesson-files")
              .download(`${lessonId}/${f.name}`);
            if (blob) {
              const pdfData = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
              result = { name: f.name, mime: "application/pdf", pdfData };
            }
          } else if (isText && f.size < 60_000) {
            const { data: blob } = await supabase.storage
              .from("lesson-files")
              .download(`${lessonId}/${f.name}`);
            result = { name: f.name, mime: f.mime, content: blob ? await blob.text() : undefined };
          }
        } catch (err) {
          console.error("[reference] load error:", f.name, err);
        }

        refContentCache.current[f.name] = result;
        return result;
      })
    );
  }, [lessonId]);

  // ── 미응답 의견묻기가 있는 단계 집합 ────────────────────────
  const phasesWithPendingOpinions = useMemo(() => {
    const myId = userProfile?.id ?? "";
    const pending = new Set<string>();
    for (const [opinionKey, opinion] of Object.entries(opinions)) {
      if (opinion.hidden) continue;
      if (opinionResponses[opinionKey]?.[myId]) continue;
      for (const [phaseCode, sections] of Object.entries(PHASE_SECTIONS)) {
        for (const sec of sections) {
          if (sec.activities.some((a) => a.code === opinion.actCode)) {
            pending.add(phaseCode);
          }
        }
      }
    }
    return pending;
  }, [opinions, opinionResponses, userProfile]);

  // ── 미응답 의견묻기 목록 (알림 패널용) ──────────────────────
  const pendingOpinionsList = useMemo(() => {
    const myId = userProfile?.id ?? "";
    const list: { opinionKey: string; actCode: string; question: string; phaseCode: string }[] = [];
    for (const [opinionKey, opinion] of Object.entries(opinions)) {
      if (opinion.hidden) continue;
      if (opinionResponses[opinionKey]?.[myId]) continue;
      let phaseCode = "";
      outer: for (const [pc, sections] of Object.entries(PHASE_SECTIONS)) {
        for (const sec of sections) {
          if (sec.activities.some((a) => a.code === opinion.actCode)) {
            phaseCode = pc; break outer;
          }
        }
      }
      list.push({ opinionKey, actCode: opinion.actCode, question: opinion.question, phaseCode });
    }
    return list;
  }, [opinions, opinionResponses, userProfile]);

  // ── 스냅샷 생성 (최대 10개 유지) ────────────────────────────
  const createSnapshot = useCallback(async (trigger: "auto" | "session_end") => {
    lastSnapshotTimeRef.current = Date.now();
    hasNewSavesRef.current = false;
    const versionNum = nextVersionRef.current++;

    const contents: Record<string, object> = {};
    for (const [code, text] of Object.entries(activityInputsRef.current)) {
      const status = activityStatusRef.current[code] ?? "active";
      contents[code] = { type: "text", text, status };
    }
    for (const [code, fields] of Object.entries(structuredInputsRef.current)) {
      if (Object.keys(fields).length > 0) {
        const status = activityStatusRef.current[code] ?? "active";
        contents[code] = { type: "structured", fields, status };
      }
    }
    if (selectedStandardsRef.current.length > 0) {
      contents["__selected_standards"] = { type: "standards", items: selectedStandardsRef.current };
    }
    if (selectedIdeasRef.current.length > 0) {
      contents["__selected_ideas"] = { type: "ideas", items: selectedIdeasRef.current };
    }
    // 의견묻기(질문/응답)는 실시간 협업 데이터이므로 버전 스냅샷 대상에서 제외한다.
    // 스냅샷에 담으면 삭제 후 예전 버전을 복원할 때 삭제한 의견이 되살아난다.

    const supabase = createClient();
    await supabase.from("lesson_snapshots").insert({
      lesson_id: lessonId,
      version_num: versionNum,
      contents,
      trigger,
      saved_by: userProfileRef.current?.id ?? null,
    });

    // 10개 초과 시 오래된 것부터 삭제
    const { data: all } = await supabase
      .from("lesson_snapshots")
      .select("id")
      .eq("lesson_id", lessonId)
      .order("created_at", { ascending: true });

    if (all && all.length > 10) {
      const toDelete = all.slice(0, all.length - 10).map((r: { id: string }) => r.id);
      // .select() 로 실제 삭제된 행을 확인한다. DELETE RLS 정책이 없으면
      // 에러 없이 0 행에 적용되어 정리가 조용히 실패한다.
      const { data: pruned, error: pruneError } = await supabase
        .from("lesson_snapshots").delete().in("id", toDelete).select("id");
      if (pruneError) {
        console.error("[snapshots] 정리 실패:", pruneError.message);
      } else if (!pruned || pruned.length === 0) {
        console.error(
          "[snapshots] 오래된 버전이 정리되지 않았습니다. lesson_snapshots 의 DELETE RLS 정책을 " +
          "확인하세요 (supabase/migrations/018_missing_delete_policies.sql)."
        );
      }
    }

    loadSnapshots();
  }, [lessonId, loadSnapshots]);

  // ── 자동저장 헬퍼 ────────────────────────────────────────────
  const scheduleSave = useCallback((activityCode: string, draft: object) => {
    clearTimeout(saveTimers.current[activityCode]);
    saveTimers.current[activityCode] = setTimeout(() => {
      setTitleSaveStatus("saved");
      hasNewSavesRef.current = true;
      delete pendingContent.current[activityCode];

      // 완료·건너뛰기 상태는 입력하는 동안 바뀌었을 수 있으므로(나 또는 다른 참여자) 저장 시점의 값을 쓴다
      const content = { ...draft, status: activityStatusRef.current[activityCode] ?? (draft as { status?: string }).status };
      const writeKey = localWriteKey(content as { text?: string; fields?: unknown });
      if (writeKey !== undefined) lastLocalWriteRef.current[activityCode] = writeKey;

      const supabase = createClient();
      inFlightSaves.current.set(activityCode, (inFlightSaves.current.get(activityCode) ?? 0) + 1);
      supabase.from("activity_contents").upsert(
        { lesson_id: lessonId, activity_code: activityCode, content },
        { onConflict: "lesson_id,activity_code" }
      ).then(({ error }) => {
        const remaining = (inFlightSaves.current.get(activityCode) ?? 1) - 1;
        if (remaining > 0) inFlightSaves.current.set(activityCode, remaining);
        else inFlightSaves.current.delete(activityCode);
        if (error) {
          console.error("[save] error", error);
          pendingContent.current[activityCode] ??= content;
          setTitleSaveStatus("idle");
          return;
        }
        // 마지막 버전 생성으로부터 1분 이상 지났으면 자동 버전 생성
        if (Date.now() - lastSnapshotTimeRef.current > 60_000) {
          createSnapshot("auto");
        }
      });
    }, 1000);
  }, [lessonId, createSnapshot]);


  // ── 카드별 되돌리기 기록 (규칙은 cardUndo.ts) ─────────────────
  const [undoHistory] = useState(() => new CardUndoHistory());
  // 버튼 활성화를 다시 그리기 위한 카드별 단계 수
  const [undoDepth, setUndoDepth] = useState<Record<string, number>>({});

  /** 바뀌기 직전의 카드 값을 기록 — 로컬 변경 경로에서만 부른다 */
  const rememberForUndo = useCallback((code: string, mode: UndoMode) => {
    const current: CardValue = CARD_SCHEMAS[code]
      ? code === 'A-3'
        ? { fields: structuredInputsRef.current[code] ?? {}, selectedIdeas: selectedIdeasRef.current, selectedStandards: selectedStandardsRef.current }
        : { fields: structuredInputsRef.current[code] ?? {} }
      : { text: activityInputsRef.current[code] ?? "" };
    const depth = undoHistory.remember(code, current, mode);
    if (depth !== null) setUndoDepth((prev) => ({ ...prev, [code]: depth }));
  }, [undoHistory]);

  // ── activity 텍스트 변경 ─────────────────────────────────────
  const writeText = useCallback((code: string, text: string) => {
    setActivityInputs((prev) => ({ ...prev, [code]: text }));
    setTitleSaveStatus("idle");
    const status = activityStatusRef.current[code] ?? "active";
    const content = { type: "text", text, status };
    pendingContent.current[code] = content;
    scheduleSave(code, content);
  }, [scheduleSave]);

  const handleActivityChange = useCallback((code: string, text: string) => {
    rememberForUndo(code, "group");
    writeText(code, text);
  }, [rememberForUndo, writeText]);

  // ── 구조화 카드 변경 ─────────────────────────────────────────
  const writeStructured = useCallback((code: string, fields: Record<string, unknown>) => {
    setStructuredInputs(prev => ({ ...prev, [code]: fields }));
    structuredInputsRef.current = { ...structuredInputsRef.current, [code]: fields };
    if (code === "A-3") {
      const ideas = Array.isArray(fields.core_ideas) ? fields.core_ideas as { subject?: string; core_idea?: string }[] : [];
      const keptIdeas = selectedIdeasRef.current.filter(item => ideas.some(row => row?.subject === item.subject && row.core_idea === item.content));
      if (keptIdeas.length !== selectedIdeasRef.current.length) {
        selectedIdeasRef.current = keptIdeas;
        setSelectedIdeas(keptIdeas);
        createClient().from('activity_contents').upsert(
          { lesson_id: lessonId, activity_code: '__selected_ideas', content: { type: 'ideas', items: keptIdeas }, updated_by: userProfile?.id ?? null },
          { onConflict: 'lesson_id,activity_code' },
        ).then(({ error }) => { if (error) console.error('[ideas save]', error); });
      }
      const standards = Array.isArray(fields.achievement_standards) ? fields.achievement_standards as { subject?: string; standard?: string }[] : [];
      const keptStandards = selectedStandardsRef.current.filter(item => standards.some(row => row?.subject === item.subject && row.standard === `${bracketCode(item.code)} ${item.content}`));
      if (keptStandards.length !== selectedStandardsRef.current.length) {
        selectedStandardsRef.current = keptStandards;
        setSelectedStandards(keptStandards);
        createClient().from('activity_contents').upsert(
          { lesson_id: lessonId, activity_code: '__selected_standards', content: { type: 'standards', items: keptStandards }, updated_by: userProfile?.id ?? null },
          { onConflict: 'lesson_id,activity_code' },
        ).then(({ error }) => { if (error) console.error('[standards save]', error); });
      }
    }
    setTitleSaveStatus("idle");
    const status = activityStatusRef.current[code] ?? "active";
    const content = { type: "structured", fields, status };
    pendingContent.current[code] = content;
    scheduleSave(code, content);
  }, [scheduleSave, lessonId, userProfile?.id]);

  /** mode: 카드에서 직접 입력하면 group(이어 쓰기는 한 단계), AI 반영·검색 결과처럼 한 번에 바뀌면 step */
  const handleStructuredChange = useCallback((code: string, fields: Record<string, unknown>, mode: UndoMode = "group") => {
    rememberForUndo(code, mode);
    writeStructured(code, fields);
  }, [rememberForUndo, writeStructured]);

  const updateA3Selections = useCallback((ideas: IdeaItem[], standards: StandardItem[]) => {
    selectedIdeasRef.current = ideas;
    selectedStandardsRef.current = standards;
    setSelectedIdeas(ideas);
    setSelectedStandards(standards);
    const current = structuredInputsRef.current['A-3'] ?? {};
    handleStructuredChange('A-3', { ...current, ...a3SelectionFields(ideas, standards) }, 'step');
    const client = createClient();
    client.from('activity_contents').upsert(
      { lesson_id: lessonId, activity_code: '__selected_ideas', content: { type: 'ideas', items: ideas }, updated_by: userProfile?.id ?? null },
      { onConflict: 'lesson_id,activity_code' },
    ).then(({ error }) => { if (error) console.error('[ideas save]', error); });
    client.from('activity_contents').upsert(
      { lesson_id: lessonId, activity_code: '__selected_standards', content: { type: 'standards', items: standards }, updated_by: userProfile?.id ?? null },
      { onConflict: 'lesson_id,activity_code' },
    ).then(({ error }) => { if (error) console.error('[standards save]', error); });
  }, [handleStructuredChange, lessonId, userProfile?.id]);

  const hasPendingIdeationCards = useCallback(() =>
    ["A-2", "A-3", "A-4"].some(code => pendingContent.current[code] !== undefined || inFlightSaves.current.has(code)), []);

  const handleIdeationCommitted = (changes: ContentMap, applied: boolean) => {
    const next = { ...structuredInputsRef.current };
    for (const [code, content] of Object.entries(changes)) {
      if (!content) continue;
      if (content.type === "structured" && content.fields) {
        if (code !== IDEATION_ROW) rememberForUndo(code, "step");
        const fields = content.fields as Record<string, unknown>;
        next[code] = fields;
        lastLocalWriteRef.current[code] = stableStringify(fields);
        if (code === IDEATION_ROW) recentIdeationWritesRef.current = [...recentIdeationWritesRef.current, stableStringify(fields)].slice(-8);
      } else if (code === "__selected_standards" && Array.isArray(content.items)) {
        selectedStandardsRef.current = content.items as StandardItem[];
        setSelectedStandards(content.items as StandardItem[]);
      } else if (code === "__selected_ideas" && Array.isArray(content.items)) {
        selectedIdeasRef.current = content.items as IdeaItem[];
        setSelectedIdeas(content.items as IdeaItem[]);
      }
    }
    structuredInputsRef.current = next;
    setStructuredInputs(next);
    hasNewSavesRef.current = true;
    setTitleSaveStatus("saved");
    if (applied) {
      changeWorkMode("design");
      setActivePhase("A");
      setActiveSection("A-a");
      setSelectedActivityCode("A-2");
      void createSnapshot("auto");
    }
  };

  // ── A-5 초안 미리보기 생성 — request: 교사 팀의 추가 요청 (프롬프트에서 최우선 반영) ──
  const handleSimulate = useCallback(async (request: string) => {
    const structured = structuredInputsRef.current;
    const texts = activityInputsRef.current;
    const cards: Record<string, string> = {};
    for (const code of ["T-1", "T-2", "A-1", "A-2", "A-3", "A-4"]) {
      const text = code === 'A-3'
        ? serializeStructuredForAI(a3SelectionFields(selectedIdeasRef.current, selectedStandardsRef.current))
        : structured[code] ? serializeStructuredForAI(structured[code]) : texts[code];
      if (text?.trim()) cards[code] = text;
    }

    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: projectTitleRef.current,
        totalSessions,
        relatedSubjects,
        targetGrade,
        cards,
        selectedIdeas: selectedIdeasRef.current,
        selectedStandards: selectedStandardsRef.current,
        request,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.sessions)) {
      // 함수 시간 초과(504)는 JSON 없이 끊기므로 이유를 따로 안내한다
      throw new Error(
        data.error ??
          (res.status === 504
            ? "응답 시간이 초과되었습니다. 차시 수를 줄이거나 채팅관리에서 더 빠른 모델로 바꿔 다시 시도하세요."
            : "초안 미리보기 중 오류가 발생했습니다."),
      );
    }

    const sessions = (data.sessions as { subject: string; title: string; standard: string; objective: string; content: string }[])
      .map((s) => ({ id: newSessionId(), ...s }));
    // 요청도 함께 남겨 팀원이 어떤 요청으로 만든 초안인지 보고, 다음에 다시 만들 때 이어 쓴다
    handleStructuredChange("A-5", { ...(structuredInputsRef.current["A-5"] ?? {}), sessions, draft_request: request }, "step");

    // 추가 요청으로 차시 수가 바뀌면 수업 기본정보의 총 차시도 맞춘다 (팀원에게는 lessons 실시간 변경으로 전달)
    if (typeof data.totalSessions !== "number" || data.totalSessions === totalSessions) return null;
    const next: number = data.totalSessions;
    const { data: updated, error } = await createClient()
      .from("lessons").update({ total_sessions: next }).eq("id", lessonId).select("id");
    if (error || !updated?.length) {
      if (error) console.error("[simulate] total_sessions save error:", error.message);
      return `추가 요청에 따라 ${next}차시로 만들었지만 총 차시를 바꾸지 못했습니다. 수업 기본정보에서 직접 바꿔 주세요.`;
    }
    setTotalSessions(next);
    return `추가 요청에 따라 수업 기본정보의 총 차시를 ${totalSessions != null ? `${totalSessions}차시에서 ` : ""}${next}차시로 바꿨습니다.`;
  }, [lessonId, totalSessions, relatedSubjects, targetGrade, handleStructuredChange]);

  // ── 수업 시뮬레이션 → 설계(Ds-3 학습 활동 · Ds-4 지원 도구) 반영 ──
  // 표는 차시 수만큼 행을 새로 만들어 채운다 — 기존 행 수보다 차시가 많으면 그만큼 늘어난다.
  const handleApplyToDesign = useCallback(async (): Promise<string | null> => {
    const sessions = (structuredInputsRef.current["A-5"]?.sessions ?? []) as SimSession[];
    if (sessions.length === 0) throw new Error("반영할 차시가 없습니다.");

    const hasRows = (rows: unknown) =>
      Array.isArray(rows) &&
      rows.some((r) => Object.values(r as Record<string, unknown>).some((v) => String(v ?? "").trim()));
    const ds3 = structuredInputsRef.current["Ds-3"] ?? {};
    const ds4 = structuredInputsRef.current["Ds-4"] ?? {};
    if ((hasRows(ds3.activities) || hasRows(ds4.support_tools)) &&
        !(await showConfirm("Ds-3 학습 활동과 Ds-4 지원 도구의 기존 내용을 초안 미리보기 결과로 바꿉니다.\n계속할까요?", { title: "", confirmText: "바꾸기" }))) {
      return null;
    }

    const bullets = (s: SimSession) => contentBullets(s.content).filter((l) => l.trim());

    // Ds-3: 시뮬레이션 내용을 그대로 옮긴다
    const activities = sessions.map((s, i) => ({
      period: `${i + 1}차시`,
      activity: [
        [s.subject, s.title].filter(Boolean).join(" : "),
        ...bullets(s).map((l) => `• ${l}`),
      ].filter(Boolean).join("\n"),
      linked_standards: standardCodesOnly(s.standard),
    }));
    handleStructuredChange("Ds-3", { ...ds3, activities }, "step");

    // Ds-4: 차시별 지원 도구는 AI 가 제안한다. 실패해도 차시 틀은 채워 둔다.
    let tools: { tool: string; purpose: string }[][] = [];
    let toolsFailed = false;
    try {
      const res = await fetch("/api/simulate/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessions: sessions.map(({ subject, title, objective, standard, content }) => ({ subject, title, objective, standard, content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.tools)) throw new Error();
      tools = data.tools;
    } catch {
      toolsFailed = true;
    }

    const support_tools = sessions.flatMap((s, i) => {
      const stage = s.title || s.subject || `${i + 1}차시 활동`;
      const list = tools[i]?.length ? tools[i] : [{ tool: "", purpose: "" }];
      return list.map((t) => ({ stage, tool: t.tool, purpose: t.purpose, related_period: `${i + 1}차시` }));
    });
    handleStructuredChange("Ds-4", { ...ds4, support_tools }, "step");

    return toolsFailed
      ? `Ds-3에 ${sessions.length}개 차시를 반영했습니다. 지원 도구 제안에 실패해 Ds-4는 차시 틀만 채웠습니다.`
      : `Ds-3 학습 활동과 Ds-4 지원 도구에 ${sessions.length}개 차시를 반영했습니다.`;
  }, [handleStructuredChange]);

  // ── Minerva AI 답변 → 카드 반영 ─────────────────────────────
  const cardLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const sections of Object.values(PHASE_SECTIONS)) {
      for (const sec of sections) for (const a of sec.activities) labels[a.code] = a.label;
    }
    return labels;
  }, []);

  const getCardFields = useCallback((code: string) => code === 'A-3'
    ? a3SelectionFields(selectedIdeasRef.current, selectedStandardsRef.current)
    : structuredInputsRef.current[code] ?? {}, []);

  const handleApplyToCard = useCallback(async (code: string, fields: Record<string, unknown>, selections?: { ideas: IdeaItem[]; standards: StandardItem[] }): Promise<string | null> => {
    const st = activityStatusRef.current[code];
    if (st === "completed" || st === "skipped") {
      throw new Error("완료했거나 건너뛴 카드라 반영할 수 없습니다.");
    }
    if (code === 'A-3') {
      if (!selections || (!selections.ideas.length && !selections.standards.length)) {
        throw new Error('기존 목록에서 확인된 추천 항목이 없습니다. 검색 창에서 직접 선택해 주세요.');
      }
      const ideas = mergeCatalogItems(selectedIdeasRef.current, selections.ideas, item => item.id);
      const standards = mergeCatalogItems(selectedStandardsRef.current, selections.standards, item => bracketCode(item.code));
      updateA3Selections(ideas, standards);
      setSelectedActivityCode(code);
      return `기존 목록의 핵심 아이디어 ${selections.ideas.length}개와 성취기준 ${selections.standards.length}개를 선택했습니다.`;
    }
    const existing = structuredInputsRef.current[code] ?? {};
    const filled = (v: unknown) =>
      Array.isArray(v)
        ? v.some((x) => (typeof x === "string" ? x.trim() : Object.values(x as Record<string, unknown>).some((c) => String(c ?? "").trim())))
        : typeof v === "string" && v.trim() !== "";
    // 이미 내용이 있는 칸을 덮어쓰게 되면 먼저 묻는다
    const overwritten = Object.keys(fields)
      .filter((k) => filled(existing[k]))
      .map((k) => CARD_SCHEMAS[code]?.fields.find((f) => f.key === k)?.label ?? k);
    if (overwritten.length > 0 && !(await showConfirm(
      `${code} 카드의 기존 내용(${overwritten.join(", ")})을 AI 답변 내용으로 바꿉니다.\n계속할까요?`,
      { title: "", confirmText: "바꾸기" },
    ))) {
      return null;
    }
    handleStructuredChange(code, { ...existing, ...fields }, "step");
    setSelectedActivityCode(code);
    return `${code} 카드에 반영했습니다.`;
  }, [handleStructuredChange, updateA3Selections]);

  // ── 카드 지우기 · 되돌리기 ───────────────────────────────────
  const handleClearCard = useCallback(async (code: string) => {
    if (isLockedCard(code, activityStatusRef.current[code])) return;
    if (!(await showConfirm(
      `${code} ${cardLabels[code] ?? ""} 카드의 내용을 모두 지울까요?
지운 뒤에도 되돌리기로 복구할 수 있습니다.`,
      { title: "카드 지우기", confirmText: "지우기" },
    ))) return;
    setSelectedActivityCode(code);
    rememberForUndo(code, "step");
    if (CARD_SCHEMAS[code]) writeStructured(code, {});
    else writeText(code, "");
  }, [cardLabels, rememberForUndo, writeStructured, writeText]);

  const handleUndoCard = useCallback((code: string) => {
    if (isLockedCard(code, activityStatusRef.current[code])) return;
    const popped = undoHistory.pop(code);
    if (!popped) return;
    setUndoDepth((d) => ({ ...d, [code]: popped.depth }));
    setSelectedActivityCode(code);
    if ("fields" in popped.value) {
      if (code === 'A-3') {
        const ideas = (popped.value.selectedIdeas ?? []) as IdeaItem[];
        const standards = (popped.value.selectedStandards ?? []) as StandardItem[];
        selectedIdeasRef.current = ideas;
        selectedStandardsRef.current = standards;
        setSelectedIdeas(ideas);
        setSelectedStandards(standards);
        const client = createClient();
        client.from('activity_contents').upsert(
          { lesson_id: lessonId, activity_code: '__selected_ideas', content: { type: 'ideas', items: ideas }, updated_by: userProfile?.id ?? null },
          { onConflict: 'lesson_id,activity_code' },
        ).then(({ error }) => { if (error) console.error('[ideas save]', error); });
        client.from('activity_contents').upsert(
          { lesson_id: lessonId, activity_code: '__selected_standards', content: { type: 'standards', items: standards }, updated_by: userProfile?.id ?? null },
          { onConflict: 'lesson_id,activity_code' },
        ).then(({ error }) => { if (error) console.error('[standards save]', error); });
      }
      writeStructured(code, code === 'A-3'
        ? { ...popped.value.fields, ...a3SelectionFields(selectedIdeasRef.current, selectedStandardsRef.current) }
        : popped.value.fields);
    } else writeText(code, popped.value.text);
  }, [undoHistory, writeStructured, writeText, lessonId, userProfile?.id]);

  // 카드 안의 버튼·입력칸을 누르면 그 카드를 활성화 (오른쪽 탭은 그대로 둔다)
  const handleActivateCard = useCallback((code: string) => setSelectedActivityCode(code), []);

  // ── 완료 / 건너뛰기 ──────────────────────────────────────────
  const handleActivityStatusChange = useCallback(async (code: string, newStatus: "active" | "completed" | "skipped") => {
    activityStatusRef.current = { ...activityStatusRef.current, [code]: newStatus };
    setActivityStatus((prev) => ({ ...prev, [code]: newStatus }));
    setTitleSaveStatus("saved");
    const isStructured = !!CARD_SCHEMAS[code];
    const content = isStructured
      ? { type: "structured", fields: structuredInputsRef.current[code] ?? {}, status: newStatus }
      // activityInputs 를 직접 참조하면 타이핑할 때마다 이 콜백이 새로 만들어진다 → ref 사용
      : { type: "text", text: activityInputsRef.current[code] ?? "", status: newStatus };
    createClient().from("activity_contents").upsert(
      { lesson_id: lessonId, activity_code: code, content },
      { onConflict: "lesson_id,activity_code" }
    );
  }, [lessonId]);



  // ── ActivityCard 용 파생 값 ─────────────────────────────────
  // 카드마다 자기 몫만 받도록 미리 갈라 둔다. 카드가 opinions 전체를 받으면
  // 다른 카드의 의견이 바뀔 때마다 모든 카드가 다시 렌더된다.
  const opinionsByActivity = useMemo(() => {
    const grouped: Record<string, OpinionEntry[]> = {};
    for (const [opinionKey, o] of Object.entries(opinions)) {
      (grouped[o.actCode] ??= []).push({
        opinionKey,
        question: o.question,
        hidden: o.hidden,
        responses: opinionResponses[opinionKey] ?? {},
      });
    }
    return grouped;
  }, [opinions, opinionResponses]);

  const memberNames = useMemo(() => {
    const names: Record<string, string> = {};
    for (const m of lessonMembers) names[m.id] = m.name;
    if (userProfile) {
      names[userProfile.id] = userProfile.display_name ?? userProfile.email ?? "나";
    }
    return names;
  }, [lessonMembers, userProfile]);

  const handleSelectActivity = useCallback((code: string) => {
    setSelectedActivityCode(code);
    setRightTab("ai");
  }, []);

  const handleAiGuide = useCallback((act: { code: string; label: string }) => {
    setSelectedActivityCode(act.code);
    setRightTab("ai");
    setChatTrigger({
      text: `${act.code} "${act.label}" 카드 작성법을 안내해 주세요. 어떤 내용을 어떻게 입력하면 좋은지 구체적으로 알려주세요.`,
      nonce: Date.now(),
      // 작성법 안내는 정책상 카드에 반영하지 않는다
      intent: "guide",
    });
  }, []);

  // with AI — 카드의 현재 내용을 수업설계 전체 흐름에 비추어 피드백. 서버는 intent 를 보고 모든 카드 내용을 길게 싣는다.
  const handleAiFeedback = useCallback((act: { code: string; label: string }) => {
    setSelectedActivityCode(act.code);
    setRightTab("ai");
    setChatTrigger({
      text: `[with AI] ${act.code} "${act.label}" 카드의 현재 내용을 수업설계 전체 흐름에 비추어 피드백해 주세요.`,
      nonce: Date.now(),
      intent: "feedback",
    });
  }, []);

  // 숨기기는 로컬 state 만 바꾸면 새로고침 시 풀리고 다른 참여자에게도 전달되지 않는다.
  // 질문 행 content 에 저장하고 broadcast 로 전파한다.
  const handleToggleOpinionHidden = useCallback((opinionKey: string) => {
    const current = opinionsRef.current[opinionKey];
    if (!current) return;
    const hidden = !current.hidden;

    setOpinions((prev) => ({ ...prev, [opinionKey]: { ...prev[opinionKey], hidden } }));

    createClient().from("activity_contents").upsert(
      {
        lesson_id: lessonId,
        activity_code: `${opinionKey}__opinion`,
        content: { type: "opinion", question: current.question, active: true, hidden },
      },
      { onConflict: "lesson_id,activity_code" }
    ).then(({ error }) => {
      if (error) { console.error("[opinion] 숨기기 저장 실패:", error.message); return; }
      opinionChannelRef.current?.send({
        type: "broadcast", event: "toggle_hidden", payload: { opinionKey, hidden },
      });
    });
  }, [lessonId]);

  const handleDeleteOpinion = useCallback(async (opinionKey: string) => {
    const supabase = createClient();
    const questionCode = `${opinionKey}__opinion`;
    const responsePrefix = `${questionCode}_res_`;

    // 지울 대상은 질문 행 1개 + 응답 행 N개다.
    // LIKE 로 한 번에 지우지 않는 이유: LIKE 에서 _ 는 "임의의 한 글자" 와일드카드인데
    // opinionKey 가 `코드__타임스탬프` 형태라 언더스코어를 여러 개 포함한다.
    // 그래서 넓게 조회한 뒤 자바스크립트에서 정확히 걸러 코드로 지운다.
    const { data: candidates, error: selectError } = await supabase
      .from("activity_contents")
      .select("activity_code")
      .eq("lesson_id", lessonId)
      .like("activity_code", `${questionCode}%`);

    if (selectError) { console.error("[opinion] 삭제 대상 조회 실패:", selectError.message); return; }

    const codes = (candidates ?? [])
      .map((r) => r.activity_code as string)
      .filter((code) => code === questionCode || code.startsWith(responsePrefix));

    if (codes.length === 0) {
      console.error("[opinion] 삭제 대상을 찾지 못했습니다:", opinionKey);
      return;
    }

    // .select() 를 붙여 실제로 지워진 행을 돌려받는다.
    // activity_contents 에 DELETE RLS 정책이 없으면 DELETE 는 에러 없이 0 행에
    // 적용된다. 에러만 보고 성공으로 단정하면 화면에서만 사라지고 DB 에는 남아
    // 다음 접속 때 되살아난다.
    const { data: deleted, error } = await supabase
      .from("activity_contents")
      .delete()
      .eq("lesson_id", lessonId)
      .in("activity_code", codes)
      .select("activity_code");

    if (error) { console.error("[opinion] 삭제 실패:", error.message); return; }
    if (!deleted || deleted.length === 0) {
      console.error(
        "[opinion] 삭제된 행이 없습니다. activity_contents 의 DELETE RLS 정책을 확인하세요 " +
        "(supabase/migrations/018_missing_delete_policies.sql)."
      );
      return;
    }

    opinionChannelRef.current?.send({ type: "broadcast", event: "delete_question", payload: { opinionKey } });
    setOpinions((prev) => { const n = { ...prev }; delete n[opinionKey]; return n; });
    setOpinionResponses((prev) => { const n = { ...prev }; delete n[opinionKey]; return n; });
  }, [lessonId]);

  const handleSubmitOpinion = useCallback((opinionKey: string, text: string) => {
    const myId = userProfileRef.current?.id ?? "";
    const resp = text.trim();
    if (!resp || !myId) return;

    createClient().from("activity_contents").upsert(
      { lesson_id: lessonId, activity_code: `${opinionKey}__opinion_res_${myId}`, content: { type: "opinion_response", response: resp } },
      { onConflict: "lesson_id,activity_code" }
    ).then(({ error }) => {
      if (error) console.error("[opinion response] DB save error:", error.message);
      else opinionChannelRef.current?.send({ type: "broadcast", event: "response", payload: { opinionKey, userId: myId, response: resp } });
    });

    setOpinionResponses((prev) => ({ ...prev, [opinionKey]: { ...(prev[opinionKey] ?? {}), [myId]: resp } }));
  }, [lessonId]);

  // ── 단계 변경 (DB 저장 + Broadcast) ────────────────────────────
  const handlePhaseChange = useCallback(async (phase: string) => {
    setActivePhase(phase);
    await createClient().from("lessons").update({ current_phase: phase }).eq("id", lessonId);
    workspaceChannelRef.current?.send({ type: "broadcast", event: "phase_change", payload: { phase } });
  }, [lessonId]);

  // ── 권한 변경 (소유자만) ─────────────────────────────────────
  const handlePermissionsChange = useCallback(async (newPerms: Permissions) => {
    setPermissions(newPerms);
    await createClient().from("lessons").update({ permissions: newPerms }).eq("id", lessonId);
    workspaceChannelRef.current?.send({ type: "broadcast", event: "permissions", payload: newPerms });
  }, [lessonId]);

  const handleLeave = () => {
    setMenuOpen(false);
    router.refresh();
    router.push("/dashboard");
  };

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifHeaderRef.current && !notifHeaderRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  const handleLogout = async () => {
    setMenuOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleOpenEdit = () => {
    setMenuOpen(false);
    setProfileModalOpen(true);
  };

  // ── 프로젝트 온보딩 (첫 방문 + AI 준비 완료 후 안내) ─────────
  useEffect(() => {
    if (!lessonId || !aiReady) return;
    const key = `minerva_onboarded_${lessonId}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    setRightTab('ai');
    const t = setTimeout(() => {
      setChatTrigger({
        text: `안녕하세요! 수업 설계 프로젝트를 시작하신 것을 환영합니다. Minerva의 간단한 사용법과 첫 번째 단계(팀 준비)에서 무엇을 해야 하는지 안내해 주세요.`,
        nonce: Date.now(),
        intent: "guide",
      });
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, aiReady]);


  // projectTitle을 ref에 동기화 (beforeunload 클로저용)
  useEffect(() => { projectTitleRef.current = projectTitle; }, [projectTitle]);
  // 버전 생성 클로저용 ref 동기화
  useEffect(() => { activityInputsRef.current = activityInputs; }, [activityInputs]);
  useEffect(() => { structuredInputsRef.current = structuredInputs; }, [structuredInputs]);
  useEffect(() => { userProfileRef.current = userProfile; }, [userProfile]);
  useEffect(() => { opinionsRef.current = opinions; }, [opinions]);

  // 세션 종료 시 미저장 내용 flush + 버전 생성 (keepalive fetch로 보장)
  useEffect(() => {
    const flush = () => {
      const supabase = createClient();
      // 타이틀 저장
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
        const t = projectTitleRef.current;
        if (t.trim()) supabase.from("lessons").update({ title: t }).eq("id", lessonId);
      }
      // 콘텐츠 저장
      Object.entries(pendingContent.current).forEach(([code, content]) => {
        clearTimeout(saveTimers.current[code]);
        supabase.from("activity_contents").upsert(
          { lesson_id: lessonId, activity_code: code, content },
          { onConflict: "lesson_id,activity_code" }
        );
      });
      // 세션 종료 스냅샷 — keepalive fetch로 페이지 종료 후에도 전송 보장
      const versionNum = nextVersionRef.current++;
      const contents: Record<string, object> = {};
      for (const [code, text] of Object.entries(activityInputsRef.current)) {
        const status = activityStatusRef.current[code] ?? "active";
        contents[code] = { type: "text", text, status };
      }
      for (const [code, fields] of Object.entries(structuredInputsRef.current)) {
        if (Object.keys(fields).length > 0) {
          const status = activityStatusRef.current[code] ?? "active";
          contents[code] = { type: "structured", fields, status };
        }
      }
      fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId, version_num: versionNum, contents, trigger: "session_end" }),
        keepalive: true,
      });
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [lessonId]);

  // 단계 변경 시 첫 번째 섹션으로 초기화
  useEffect(() => {
    const first = PHASE_SECTIONS[activePhase]?.[0]?.code;
    if (first) setActiveSection(first);
  }, [activePhase]);



  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 소유자 오프라인 알림 */}
      {ownerOffline && !isHost && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="w-[400px] rounded-2xl bg-white p-8 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
              <svg className="h-7 w-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="mb-2 text-[18px] font-bold text-gray-900">소유자가 오프라인 상태입니다</h2>
            <p className="mb-6 text-[14px] text-gray-500">
              소유자가 세션을 종료했습니다. 일부 기능이 제한될 수 있습니다.
            </p>
            <button
              onClick={() => setOwnerOffline(false)}
              className="w-full rounded-xl bg-[#D1260F] py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#A81A08]"
            >
              계속 이용하기
            </button>
          </div>
        </div>
      )}

      {/* 공유 모달 */}
      {shareModalOpen && (
        <ShareModal
          lessonId={lessonId}
          members={[
            ...(userProfile ? [{ id: userProfile.id, name: userProfile.display_name ?? userProfile.email ?? "나", email: userProfile.email ?? "", avatarUrl: userProfile.avatar_url ?? null }] : []),
            ...lessonMembers.filter((m) => m.id !== userProfile?.id),
          ]}
          isHost={isHost}
          onlineUserIds={onlineUserIds}
          onMemberRemoved={(userId) => setLessonMembers((prev) => prev.filter((m) => m.id !== userId))}
          onClose={() => setShareModalOpen(false)}
        />
      )}

      {/* 워크스페이스 모달 */}
      {activeModal === "수업 기본정보" ? (
        <LessonInfoModal
          lessonId={lessonId}
          title={projectTitle}
          targetGrade={targetGrade}
          relatedSubjects={relatedSubjects}
          numClasses={numClasses}
          numStudents={numStudents}
          totalSessions={totalSessions}
          onTitleChange={setProjectTitle}
          onTargetGradeChange={setTargetGrade}
          onRelatedSubjectsChange={setRelatedSubjects}
          onNumClassesChange={setNumClasses}
          onNumStudentsChange={setNumStudents}
          onTotalSessionsChange={setTotalSessions}
          onClose={() => setActiveModal(null)}
          readOnly={!isHost}
        />
      ) : activeModal === "버전 관리" ? (
        <VersionModal
          snapshots={snapshots}
          lessonId={lessonId}
          onClose={() => setActiveModal(null)}
          onRestore={async (contents) => {
            const supabase = createClient();
            // Older snapshots predate ideation. Persist an empty structured row so
            // the current draft cannot reappear on reload or in another window.
            const restoredContents = { ...contents, [IDEATION_ROW]: contents[IDEATION_ROW] ?? { type: "structured", fields: {} } };
            await Promise.all(
              Object.entries(restoredContents)
                // 의견묻기 행은 복원 대상에서 제외 — 삭제한 의견이 되살아나지 않도록
                .filter(([code]) => !code.includes("__opinion"))
                .map(([code, content]) =>
                  supabase.from("activity_contents").upsert(
                    { lesson_id: lessonId, activity_code: code, content },
                    { onConflict: "lesson_id,activity_code" }
                  )
                )
            );
            const inputs: Record<string, string> = {};
            const statusMap: Record<string, "active" | "completed" | "skipped"> = {};
            const restoredStructured: Record<string, Record<string, unknown>> = {};
            for (const [code, c] of Object.entries(restoredContents)) {
              if (code === "__selected_standards" && Array.isArray(c.items)) {
                const items = c.items as StandardItem[];
                setSelectedStandards(items);
                selectedStandardsRef.current = items;
                continue;
              }
              if (code === "__selected_ideas" && Array.isArray(c.items)) {
                const items = c.items as IdeaItem[];
                setSelectedIdeas(items);
                selectedIdeasRef.current = items;
                continue;
              }
              // 의견묻기 행은 복원하지 않음 — 실시간 협업 데이터라 현재 상태를 유지한다
              if (code.includes("__opinion")) continue;
              if (c.type === "structured" && c.fields) {
                restoredStructured[code] = c.fields;
                continue;
              }
              if (c.text !== undefined) inputs[code] = c.text;
              if (c.status === "completed" || c.status === "skipped") statusMap[code] = c.status;
            }
            setActivityInputs(inputs);
            setActivityStatus(statusMap);
            activityStatusRef.current = statusMap;
            if (Object.keys(restoredStructured).length > 0) { setStructuredInputs(restoredStructured); structuredInputsRef.current = restoredStructured; }
            setActiveModal(null);
          }}
        />
      ) : activeModal === "성취기준" ? (
        <StandardsModal
          onClose={() => setActiveModal(null)}
          selectedStandards={selectedStandards}
          onSelectionChange={(items) => updateA3Selections(selectedIdeasRef.current, items)}
          readOnly={!isHost}
        />
      ) : activeModal === "핵심아이디어" ? (
        <IdeasModal
          onClose={() => setActiveModal(null)}
          selectedIdeas={selectedIdeas}
          onSelectionChange={(items) => updateA3Selections(items, selectedStandardsRef.current)}
          readOnly={!isHost}
        />
      ) : activeModal === "참고자료" ? (
        <ReferenceModal
          lessonId={lessonId}
          onClose={() => setActiveModal(null)}
          onFilesChange={() => { loadReferenceFiles(); createSnapshot("auto"); }}
        />
      ) : activeModal === "권한관리" ? (
        <PermissionsModal
          permissions={permissions}
          onChange={handlePermissionsChange}
          onClose={() => setActiveModal(null)}
        />
      ) : activeModal === "핵심아이디어검색" ? (
        <IdeasModal
          onClose={() => setActiveModal(null)}
          selectedIdeas={selectedIdeas}
          onSelectionChange={(items) => updateA3Selections(items, selectedStandardsRef.current)}
          readOnly={!isHost}
        />
      ) : activeModal === "성취기준검색" ? (
        <StandardsModal
          onClose={() => setActiveModal(null)}
          selectedStandards={selectedStandards}
          onSelectionChange={(items) => updateA3Selections(selectedIdeasRef.current, items)}
          readOnly={!isHost}
        />
      ) : activeModal === "채팅관리" ? (
        <ChatManageModal
          lessonId={lessonId}
          userId={userProfile?.id ?? ""}
          projectTitle={projectTitle}
          model={llmModel}
          onModelChange={(model) => {
            setLlmModel(model);
            createClient().from("activity_contents").upsert(
              { lesson_id: lessonId, activity_code: LLM_MODEL_ROW, content: { type: "settings", model }, updated_by: userProfile?.id ?? null },
              { onConflict: "lesson_id,activity_code" }
            ).then(({ error }) => { if (error) console.error("[llm model save]", error); });
          }}
          onClose={() => setActiveModal(null)}
        />
      ) : activeModal ? (
        <WorkModal title={activeModal} onClose={() => setActiveModal(null)} />
      ) : null}

      {/* 의견묻기 모달 */}
      {opinionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setOpinionModal(null); setOpinionDraft(""); } }}
        >
          <div className="w-[480px] rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="text-[17px] font-semibold text-gray-900">의견 묻기</h2>
              <button
                onClick={() => { setOpinionModal(null); setOpinionDraft(""); }}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <label className="mb-2 block text-[13px] font-medium text-[#757b82]">질문을 입력하세요</label>
              <textarea
                value={opinionDraft}
                onChange={(e) => setOpinionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (opinionDraft.trim() && opinionModal) {
                      const actCode = opinionModal;
                      const opinionKey = `${actCode}__${Date.now()}`;
                      const q = opinionDraft.trim();
                      createClient().from("activity_contents").upsert(
                        { lesson_id: lessonId, activity_code: `${opinionKey}__opinion`, content: { type: "opinion", question: q, active: true } },
                        { onConflict: "lesson_id,activity_code" }
                      ).then(({ error }) => {
                        if (error) console.error("[opinion] DB save error:", error.message);
                        else opinionChannelRef.current?.send({ type: "broadcast", event: "question", payload: { opinionKey, actCode, question: q } });
                      });
                      setOpinions((prev) => ({ ...prev, [opinionKey]: { question: q, hidden: false, actCode } }));
                      setOpinionModal(null);
                      setOpinionDraft("");
                    }
                  }
                }}
                placeholder="팀원들에게 묻고 싶은 내용을 입력하세요…"
                autoFocus
                className="w-full min-h-[90px] resize-none rounded-xl bg-[#f1f4f9] px-4 py-3 text-[15px] text-[#2d3339] placeholder-[#adb2ba] outline-none focus:ring-2 focus:ring-[#D1260F]/20"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => { setOpinionModal(null); setOpinionDraft(""); }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-[14px] font-medium text-[#757b82] transition hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  disabled={!opinionDraft.trim()}
                  onClick={() => {
                    if (opinionDraft.trim() && opinionModal) {
                      const actCode = opinionModal;
                      const opinionKey = `${actCode}__${Date.now()}`;
                      const q = opinionDraft.trim();
                      createClient().from("activity_contents").upsert(
                        { lesson_id: lessonId, activity_code: `${opinionKey}__opinion`, content: { type: "opinion", question: q, active: true } },
                        { onConflict: "lesson_id,activity_code" }
                      ).then(({ error }) => {
                        if (error) console.error("[opinion] DB save error:", error.message);
                        else opinionChannelRef.current?.send({ type: "broadcast", event: "question", payload: { opinionKey, actCode, question: q } });
                      });
                      setOpinions((prev) => ({ ...prev, [opinionKey]: { question: q, hidden: false, actCode } }));
                      setOpinionModal(null);
                      setOpinionDraft("");
                    }
                  }}
                  className="rounded-lg bg-[#D1260F] px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-[#A81A08] disabled:opacity-40"
                >
                  질문 등록
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 프로필 수정 모달 */}
      {profileModalOpen && userProfile && (
        <ProfilePanel
          profile={userProfile}
          onClose={() => setProfileModalOpen(false)}
          onSave={(updated) => {
            setUserProfile(updated);
            setProfileModalOpen(false);
          }}
        />
      )}

      {/* ── 전체 너비 헤더 ── */}
      <AppShellHeader style={getAppShellHeaderSurface()}>
        {/* 좌: 로고 자리 + 사이드바 너비만큼 띄운 후 프로젝트 제목 */}
        <div className="flex min-w-0 flex-1 items-center">
          {/* 브랜드 — 고정 너비, 사이드바 상태와 무관 */}
          <AppShellLogo className="-ml-6" />
          {/* 저장 표식 + 타이틀 */}
          <div className="flex items-center gap-3">
            <div
              className={`relative inline-grid rounded-lg px-2.5 py-1 transition-all duration-150 ${
                titleFocused && (isHost || permissions.titleEdit)
                  ? "border-[2px] border-white/80 bg-white/15 shadow-[0_0_0_3px_rgba(255,255,255,0.12)]"
                  : "border-[2px] border-transparent"
              }`}
            >
              <span
                aria-hidden="true"
                className="invisible col-start-1 row-start-1 whitespace-pre text-[22px] font-extrabold tracking-tight"
              >
                {projectTitle || "제목 없음"}
              </span>
              <input
                ref={titleInputRef}
                value={projectTitle}
                onFocus={() => (isHost || permissions.titleEdit) && setTitleFocused(true)}
                onBlur={() => setTitleFocused(false)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (!isHost && !permissions.titleEdit) return;
                  if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
                  const val = projectTitle;
                  if (val.trim() && lessonId) {
                    createClient().from("lessons").update({ title: val }).eq("id", lessonId)
                      .then(({ error }) => { if (error) console.error('[title] DB save error:', error.message); });
                    workspaceChannelRef.current?.send({ type: "broadcast", event: "title_change", payload: { title: val } });
                  }
                  setTitleSaveStatus("saved");
                  setTimeout(() => setTitleSaveStatus("idle"), 1000);
                  titleInputRef.current?.blur();
                }}
                onChange={(e) => {
                  if (!isHost && !permissions.titleEdit) return;
                  const val = e.target.value;
                  setProjectTitle(val);
                  setTitleSaveStatus("idle");
                  if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
                  titleTimerRef.current = setTimeout(() => {
                    if (val.trim() && lessonId) {
                      createClient().from("lessons").update({ title: val }).eq("id", lessonId)
                        .then(({ error }) => { if (error) console.error('[title] DB save error:', error.message); });
                      workspaceChannelRef.current?.send({ type: "broadcast", event: "title_change", payload: { title: val } });
                    }
                    setTitleSaveStatus("saved");
                    setTimeout(() => setTitleSaveStatus("idle"), 1000);
                  }, 800);
                }}
                readOnly={!isHost && !permissions.titleEdit}
                placeholder="제목 없음"
                className={`col-start-1 row-start-1 w-full bg-transparent text-[22px] font-extrabold text-white outline-none tracking-tight placeholder-white/40 ${!isHost && !permissions.titleEdit ? "cursor-default" : ""}`}
              />
            </div>
            {/* 저장 상태 메시지 */}
            <span
              className="text-[12px] text-white/70 whitespace-nowrap transition-opacity duration-500"
              style={{ opacity: titleSaveStatus === "saved" ? 1 : 0 }}
            >
              변경사항이 저장되었습니다
            </span>
          </div>
        </div>
        {/* 우: 작업 전환 + 알림 + 멤버 아바타 + 액션 버튼 */}
        <div className="flex shrink-0 items-center gap-3">
          <WorkModeSwitch mode={workMode} onChange={changeWorkMode} />

          {/* 알림 아코디언 */}
          {pendingOpinionsList.length > 0 && (
            <div className="relative" ref={notifHeaderRef}>
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 transition hover:bg-white/15"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-400 text-[11px] font-bold text-white">
                  {pendingOpinionsList.length}
                </span>
                <span className="text-[14px] font-semibold text-white whitespace-nowrap">
                  {pendingOpinionsList.length}개의 알림이 있습니다
                </span>
                <svg
                  className={`h-3.5 w-3.5 text-white transition-transform ${notifOpen ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-[#eef0f6] bg-white shadow-xl">
                  <div className="px-3 py-2 border-b border-[#eef0f6]">
                    <p className="text-[12px] font-semibold uppercase tracking-wider text-[#adb2ba]">미응답 의견묻기</p>
                  </div>
                  <div className="max-h-64 overflow-y-auto px-2 py-1.5">
                    {pendingOpinionsList.map(({ opinionKey, actCode, question, phaseCode }) => (
                      <button
                        key={opinionKey}
                        onClick={() => {
                          if (workMode !== "design") changeWorkMode("design");
                          setActivePhase(phaseCode);
                          setSelectedActivityCode(actCode);
                          setNotifOpen(false);
                        }}
                        className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-[#FFF8F6]"
                      >
                        <span className="mt-0.5 shrink-0 rounded-md bg-[#FDE4DD] px-1.5 py-0.5 text-[11px] font-bold text-[#D1260F]">
                          {actCode}
                        </span>
                        <span className="text-[13px] leading-snug text-[#2d3339] line-clamp-2">{question}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 전체 멤버 아바타 (본인 포함) */}
          {(() => {
            const me: Member | null = userProfile
              ? { id: userProfile.id, name: userProfile.display_name ?? userProfile.email ?? "나", email: userProfile.email ?? "", avatarUrl: userProfile.avatar_url ?? null }
              : null;
            const onlineSet = new Set(onlineUserIds);
            // 온라인 유저만 표시 (Presence 미등록 상태면 본인만)
            const others = lessonMembers.filter((m) => m.id !== userProfile?.id && onlineSet.has(m.id));
            const all = me ? [me, ...others] : others;
            const colors = ["bg-[#3D5A7A]","bg-[#4A7A5A]","bg-[#7A5A3D]","bg-[#5A3D7A]","bg-[#7A3D5A]"];
            return all.length > 0 ? (
              <div className="flex items-center -space-x-2 mr-1">
                {all.slice(0, 6).map((m, idx) => {
                  let n = 0; for (let i = 0; i < m.id.length; i++) n += m.id.charCodeAt(i);
                  const color = colors[n % colors.length];
                  const isMe = idx === 0 && !!me;
                  return (
                    <div key={m.id} className="group relative">
                      {m.avatarUrl ? (
                        <img
                          src={m.avatarUrl}
                          alt={m.name}
                          className={`h-8 w-8 rounded-full object-cover ${isMe ? "border-2 border-white" : "border-2 border-white/40"}`}
                        />
                      ) : (
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${color} text-[13px] font-bold text-white ${isMe ? "border-2 border-white" : "border-2 border-white/40"}`}>
                          {m.name.charAt(0)}
                        </div>
                      )}
                      <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900/90 px-2 py-1 text-[12px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {isMe ? `${m.name} (나)` : m.name}
                      </div>
                    </div>
                  );
                })}
                {all.length > 6 && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/40 bg-white/20 text-[12px] font-semibold text-white">
                    +{all.length - 6}
                  </div>
                )}
              </div>
            ) : null;
          })()}

          <button
            onClick={() => setShareModalOpen(true)}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/25 bg-white/15 px-4 text-[16px] font-medium text-white transition hover:bg-white/25"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            공유
          </button>

          <button
            onClick={async () => {
              if (pdfLoading) return;
              setPdfLoading(true);
              try {
                const res = await fetch(`/api/pdf?lessonId=${lessonId}`);
                if (!res.ok) throw new Error(await res.text());
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${projectTitle || "report"}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                console.error("[pdf]", e);
                showAlert("PDF 생성 중 오류가 발생했습니다.");
              } finally {
                setPdfLoading(false);
              }
            }}
            disabled={pdfLoading}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/25 bg-white/15 px-4 text-[16px] font-medium text-white transition hover:bg-white/25 disabled:opacity-60"
          >
            {pdfLoading ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {pdfLoading ? "생성 중…" : "출력"}
          </button>
        </div>
      </AppShellHeader>

      {/* ── 사이드바 + 콘텐츠 + 푸터 ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f8f9fd]">
      <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* ── 좌측 사이드바 ── */}
      <aside
        style={{ backgroundColor: SIDEBAR_BG }}
        className={`flex h-full min-h-0 shrink-0 flex-col transition-all duration-300 ${
          sidebarCollapsed ? "w-14" : "w-[11%] min-w-[150px]"
        }`}
      >
        {/* 접기/펼치기 토글 */}
        <div className={`flex shrink-0 px-2 pt-2 pb-1 ${sidebarCollapsed ? "justify-center pt-4" : "justify-end"}`}>
          <button
            type="button"
            title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={sidebarCollapsed ? "M13 5l7 7-7 7M5 5l7 7-7 7" : "M11 19l-7-7 7-7m8 14l-7-7 7-7"} />
            </svg>
          </button>
        </div>

        <nav className={`flex flex-1 flex-col overflow-y-auto px-2 py-2 ${sidebarCollapsed ? "hidden" : ""}`}>

          {/* 수업설계 그룹 */}
          {!sidebarCollapsed && <p className="mb-1.5 px-3 text-[12px] font-semibold uppercase tracking-wider text-[#adb2ba]">수업설계</p>}
          {sidebarCollapsed && <div className="mb-1 mt-1 h-px bg-[#adb2ba]/30" />}
          <ul className="space-y-0.5">
            {/* 수업 기본정보 — 직접 모달 */}
            <WorkNavButton
              icon={<svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
              label="수업 기본정보"
              active={activeModal === "수업 기본정보"}
              collapsed={sidebarCollapsed}
              onClick={() => setActiveModal("수업 기본정보")}
            />
            {/* 버전 관리 — 소유자만 */}
            {isHost && (
              <WorkNavButton
                icon={<svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                label="버전 관리"
                active={activeModal === "버전 관리"}
                collapsed={sidebarCollapsed}
                onClick={() => { loadSnapshots(); setActiveModal("버전 관리"); }}
              />
            )}
            {/* 참고자료 — 바로 모달 */}
            <WorkNavButton
              icon={<svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
              label="참고자료"
              active={activeModal === "참고자료"}
              collapsed={sidebarCollapsed}
              onClick={() => setActiveModal("참고자료")}
            />
          </ul>

          {/* 설정 그룹 */}
          {!sidebarCollapsed && <p className="mb-1.5 mt-5 px-3 text-[12px] font-semibold uppercase tracking-wider text-[#adb2ba]">설정</p>}
          {sidebarCollapsed && <div className="mb-1 mt-4 h-px bg-[#adb2ba]/30" />}
          <ul className="space-y-0.5">
            {/* 권한관리 — 소유자만 */}
            {isHost && (
              <WorkNavButton
                icon={<svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
                label="권한관리"
                active={activeModal === "권한관리"}
                collapsed={sidebarCollapsed}
                onClick={() => setActiveModal("권한관리")}
              />
            )}
            {/* 채팅관리 — 소유자만 */}
            {isHost && (
              <WorkNavButton
                icon={<svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
                label="채팅관리"
                active={activeModal === "채팅관리"}
                collapsed={sidebarCollapsed}
                onClick={() => setActiveModal("채팅관리")}
              />
            )}
          </ul>
        </nav>

        <div className={`shrink-0 px-2 pb-1 ${sidebarCollapsed ? "hidden" : ""}`}>
          <button
            type="button"
            title={sidebarCollapsed ? (isHost ? "세션 종료하기" : "나가기") : undefined}
            onClick={handleLeave}
            className={`flex w-full items-center rounded-full py-2.5 text-[16px] font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600 ${
              sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"
            }`}
          >
            <svg className="h-4 w-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {!sidebarCollapsed && (isHost ? "세션 종료하기" : "나가기")}
          </button>
        </div>

        <div className={`relative p-3 ${sidebarCollapsed ? "hidden" : ""}`} ref={menuRef}>
          {menuOpen && userProfile && (
            <div className="absolute bottom-full left-3 right-3 mb-1 rounded-xl bg-white shadow-[0px_8px_24px_rgba(45,51,57,0.12)]">
              <div className="px-3 py-2.5">
                <p className="truncate text-[14px] text-[#757b82]">{userProfile.email}</p>
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-[15px] text-[#5a6066] transition-colors hover:bg-[#D1260F]/5 hover:text-[#D1260F]"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  프로필 설정
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-full px-3 py-2 text-[15px] text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  로그아웃
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            title={sidebarCollapsed ? (userProfile?.display_name ?? userProfile?.email ?? "프로필") : undefined}
            onClick={() => userProfile && setMenuOpen((v) => !v)}
            className={`group flex w-full items-center rounded-full px-2 py-2 transition-colors hover:bg-[#D1260F]/5 ${
              sidebarCollapsed ? "justify-center" : "gap-3"
            }`}
          >
            {userProfile?.avatar_url ? (
              <img
                src={userProfile.avatar_url}
                alt="프로필"
                className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600">
                {(userProfile?.display_name ?? userProfile?.email ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-[14px] font-semibold text-[#2d3339]">
                  {userProfile?.display_name ?? userProfile?.email ?? "—"}
                </p>
                <p className="truncate text-[13px] text-[#757b82]">
                  {userProfile?.school ??
                    userProfile?.subject ??
                    (isHost ? "Host" : "Editor")}
                </p>
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* ── 워크스페이스 + 채팅 ── */}
      <div className="flex flex-1 overflow-hidden">

          {/* ── 워크스페이스 ───────────────────────────────────────── */}
          <main className={`${workMode === "design" ? "flex" : "hidden"} flex-1 flex-col overflow-hidden bg-[#f8f9fd]`}>
            {/* 단계 스테퍼 + 섹션 탭 통합 영역 */}
            <div className="shrink-0 pt-3" style={{ backgroundColor: "#f8f9fd" }}>

              {/* 상위 탭 — pill 진행형 */}
              {(() => {
                const activeIdx = PHASES.findIndex((p) => p.code === activePhase);
                return (
                  <div className="flex items-center gap-2 px-8 py-4">
                    {PHASES.map((phase, idx) => {
                      const status =
                        idx < activeIdx ? 'done' : idx === activeIdx ? 'active' : 'default';
                      return (
                        <div key={phase.code} className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (!isHost && !permissions.phaseNav) return;
                              handlePhaseChange(phase.code);
                            }}
                            className={`relative flex w-40 items-center gap-2.5 rounded-full pl-2 pr-4 py-2 transition-all ${!isHost && !permissions.phaseNav ? "cursor-default" : ""}`}
                            style={{
                              backgroundColor: status === 'active' ? '#D1260F' : '#f1f4f9',
                            }}
                            onMouseEnter={(e) => { if (status !== 'active' && (isHost || permissions.phaseNav)) e.currentTarget.style.backgroundColor = '#e8eaf0'; }}
                            onMouseLeave={(e) => { if (status !== 'active') e.currentTarget.style.backgroundColor = '#f1f4f9'; }}
                          >
                            <span className="relative shrink-0">
                              <span
                                className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] font-bold leading-none"
                                style={{
                                  backgroundColor: status === 'active' ? 'rgba(255,255,255,0.25)' : status === 'done' ? '#adb2ba' : '#dde3eb',
                                  color: status === 'active' ? '#fff' : status === 'done' ? '#fff' : '#adb2ba',
                                }}
                              >
                                {idx + 1}
                              </span>
                              {phasesWithPendingOpinions.has(phase.code) && (
                                <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full ring-[1.5px] ring-white" style={{ backgroundColor: "#F0603C" }} />
                              )}
                            </span>
                            <span
                              className="text-[18px] font-semibold leading-tight"
                              style={{
                                color: status === 'active' ? '#fff' : status === 'done' ? '#757b82' : '#adb2ba',
                              }}
                            >
                              {phase.label}
                            </span>
                          </button>
                          {idx < PHASES.length - 1 && (
                            <div className="h-px w-4 shrink-0 bg-[#dde3eb]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}


            </div>{/* 단계 스테퍼 통합 영역 끝 */}

            {/* 콘텐츠 */}
            {(() => {
              const activePhaseData = PHASES.find((p) => p.code === activePhase);
              const allActivities = (PHASE_SECTIONS[activePhase] ?? []).flatMap((s) => s.activities);
              return (
                <div className="flex-1 overflow-y-auto bg-[#f8f9fd] px-14 pt-8 pb-10">
                  <div className="mb-8">
                    <div className="flex items-baseline gap-4">
                      <span className="text-6xl font-black text-[#D1260F]/20 leading-none">{activePhaseData?.code}</span>
                      <h2 className="text-3xl font-bold text-[#2d3339]">{activePhaseData?.label}</h2>
                    </div>
                    <p className="mt-2 text-[16px] leading-relaxed text-[#5a6066]">{activePhaseData?.description}</p>
                  </div>
                  {allActivities.map((act) => (
                    <ActivityCard
                      key={act.code}
                      act={act}
                      status={activityStatus[act.code] ?? "active"}
                      isSelected={selectedActivityCode === act.code}
                      isHost={isHost}
                      canComplete={isHost || permissions.complete}
                      canSkip={isHost || permissions.skip}
                      textValue={activityInputs[act.code] ?? ""}
                      structuredValue={structuredInputs[act.code] ?? EMPTY_FIELDS}
                      selectedIdeas={act.code === 'A-3' ? selectedIdeas : undefined}
                      selectedStandards={act.code === 'A-3' ? selectedStandards : undefined}
                      onA3SelectionsChange={act.code === 'A-3' && isHost ? updateA3Selections : undefined}
                      opinions={opinionsByActivity[act.code] ?? EMPTY_OPINIONS}
                      myUserId={userProfile?.id ?? ""}
                      memberNames={memberNames}
                      onSelect={handleSelectActivity}
                      onStatusChange={handleActivityStatusChange}
                      onAskOpinion={setOpinionModal}
                      onAiGuide={handleAiGuide}
                      onAiFeedback={handleAiFeedback}
                      onOpenModal={setActiveModal}
                      onTextChange={handleActivityChange}
                      onStructuredChange={handleStructuredChange}
                      canUndo={(undoDepth[act.code] ?? 0) > 0}
                      onUndo={handleUndoCard}
                      onClear={handleClearCard}
                      onActivate={handleActivateCard}
                      onToggleOpinionHidden={handleToggleOpinionHidden}
                      onDeleteOpinion={handleDeleteOpinion}
                      onSubmitOpinion={handleSubmitOpinion}
                      onSimulate={act.code === "A-5" ? handleSimulate : undefined}
                      onApplyToDesign={act.code === "A-5" ? handleApplyToDesign : undefined}
                    />
                  ))}
                </div>
              );
            })()}
          </main>

          {/* ── 아이디어 도출: 성취기준 연결 탐색기 ─────────────────────── */}
          {ideationOpened && (
            <div className={`${workMode === "ideation" ? "flex" : "hidden"} relative min-w-0 flex-1 flex-col overflow-hidden`}>
              <IdeationWorkspace
                lessonId={lessonId} isHost={isHost}
                saved={structuredInputs[IDEATION_ROW]}
                defaults={{ subjects: toArr(relatedSubjects), grade: targetGrade }}
                seed={{ topic: String(structuredInputs["A-2"]?.final_topic ?? ""), ideas: selectedIdeas, standards: selectedStandards }}
                onCommitted={handleIdeationCommitted} onContext={setIdeationContext} hasPendingCards={hasPendingIdeationCards}
              />
            </div>
          )}

          {/* 아이디어 도출에서 채팅을 접으면 왼쪽 사이드바처럼 좁은 막대로 — 누르면 다시 펼친다 */}
          {workMode === "ideation" && !ideationChatOpen && (
            <div className="flex w-14 shrink-0 flex-col items-center border-l border-[#adb2ba]/20 bg-white pt-3">
              <button
                type="button"
                title="채팅 펼치기"
                onClick={() => setIdeationChatOpen(true)}
                className="flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[12px] font-semibold text-[#5a6066] transition hover:bg-gray-100 hover:text-[#2d3339]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                채팅
              </button>
            </div>
          )}

          {/* ── 우측 패널 ────────────────────────────────────────────── */}
          <div className={`${workMode === "ideation" && !ideationChatOpen ? "hidden" : "flex"} w-[30%] min-w-[360px] shrink-0 flex-col bg-white shadow-[-4px_0px_24px_rgba(45,51,57,0.06)]`}>

            {/* 탭 헤더 */}
            <div className="shrink-0 flex bg-white border-b border-[#adb2ba]/20">
              {workMode === "ideation" && (
                <button
                  type="button"
                  title="채팅 접기"
                  onClick={() => setIdeationChatOpen(false)}
                  className="flex w-11 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-50 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setRightTab("team")}
                className={`flex-1 py-3.5 text-[15px] font-semibold transition-colors ${
                  rightTab === "team"
                    ? "border-b-2 border-[#D1260F] text-[#2d3339]"
                    : "text-[#757b82] hover:text-[#2d3339]"
                }`}
              >
                팀 채팅
              </button>
              <button
                onClick={() => setRightTab("ai")}
                className={`flex-1 py-3.5 text-[15px] font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                  rightTab === "ai"
                    ? "border-b-2 border-[#D1260F] text-[#2d3339]"
                    : "text-[#757b82] hover:text-[#2d3339]"
                }`}
              >
                Minerva AI
                {aiReady && (
                  <span className="h-2 w-2 rounded-full bg-[#F0603C] shrink-0" />
                )}
              </button>
            </div>

            {/* Minerva AI 탭 */}
            <div className={`flex-1 flex-col overflow-hidden bg-white ${rightTab === "ai" ? "flex" : "hidden"}`}>
              <ChatInterface
                stage={activePhase}
                onReady={() => setAiReady(true)}
                triggerMessage={chatTrigger}
                model={llmModel}
                cardLabels={cardLabels}
                getCardFields={getCardFields}
                onApplyToCard={handleApplyToCard}
                pageContext={(() => {
                  // 의견묻기 데이터를 멤버 이름으로 매핑
                  const allMembers = [
                    ...(userProfile ? [{ id: userProfile.id, name: userProfile.display_name ?? userProfile.email ?? "나" }] : []),
                    ...lessonMembers.filter((m) => m.id !== userProfile?.id),
                  ];
                  const opinionsForContext = Object.entries(opinions).reduce<
                    { activityCode: string; question: string; responses: { name: string; text: string }[] }[]
                  >((acc, [opKey, data]) => {
                    const named = Object.entries(opinionResponses[opKey] ?? {})
                      .filter(([, text]) => text.trim())
                      .map(([memberId, text]) => {
                        const member = allMembers.find((m) => m.id === memberId);
                        return { name: member?.name ?? memberId, text };
                      });
                    if (named.length > 0) {
                      acc.push({ activityCode: data.actCode, question: data.question, responses: named });
                    }
                    return acc;
                  }, []);
                  // 구조화 카드 데이터를 텍스트로 직렬화하여 activityInputs에 병합
                  const mergedInputs: Record<string, string> = {
                    ...activityInputs,
                    ...Object.fromEntries(
                      Object.entries(structuredInputs).filter(([code]) => code !== IDEATION_ROW).map(([code, fields]) => [
                        code, serializeStructuredForAI(fields),
                      ])
                    ),
                  };
                  mergedInputs['A-3'] = serializeStructuredForAI(a3SelectionFields(selectedIdeas, selectedStandards));
                  return {
                    projectTitle,
                    activePhase,
                    activeSection,
                    // A-3 성취기준 후보를 이 수업의 교과로 좁히는 데 쓰인다
                    relatedSubjects: relatedSubjects || undefined,
                    targetGrade: targetGrade || undefined,
                    totalSessions: totalSessions ?? undefined,
                    activityInputs: mergedInputs,
                    selectedActivityCode: workMode === "ideation" ? undefined : selectedActivityCode ?? undefined,
                    ideationContext: workMode === "ideation" ? ideationContext : undefined,
                    referenceFiles: referenceFiles.length > 0 ? referenceFiles : undefined,
                    selectedStandards: selectedStandards.length > 0 ? selectedStandards : undefined,
                    selectedIdeas: selectedIdeas.length > 0 ? selectedIdeas : undefined,
                    opinions: opinionsForContext.length > 0 ? opinionsForContext : undefined,
                  };
                })()}
                lessonId={lessonId}
                userId={userProfile?.id ?? ""}
                loadReferenceContents={loadReferenceContents}
              />
            </div>

            {/* 팀 채팅 패널 */}
            <div className={`flex-1 flex-col overflow-hidden ${rightTab === "team" ? "flex" : "hidden"}`}>
              {userProfile && <TeamChatPanel lessonId={lessonId} currentUserId={userProfile.id} />}
            </div>

          </div>

        </div>
      </div>

      {/* ── 푸터 ── */}
      <footer className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-white px-8 py-3 text-[12px]" style={{ color: "#9ca3af" }}>
        <span className="font-semibold" style={{ color: "#D1260F" }}>Minerva</span>
        <span>2026 서울특별시교육청</span>
      </footer>

    </div>
    </div>
  );
}
