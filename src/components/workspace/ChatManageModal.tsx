"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { showAlert } from "@/components/ui/dialog";
import { LLM_MODELS, type LlmModelId } from "@/lib/llmModels";

/**
 * 채팅관리 모달 (소유자 전용)
 *  1. 팀 채팅 기록 다운받기
 *  2. AI 채팅 기록 다운받기 — ai_messages 는 RLS 상 본인 것만 읽을 수 있다
 *  3. LLM 모델 설정 — 이 수업의 AI 채팅·초안 미리보기에 쓰인다
 */

function stamp(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function today() {
  return new Date().toLocaleDateString("ko-KR").replace(/\.\s*/g, "-").replace(/-$/, "");
}

function saveText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ChatManageModal({
  lessonId,
  userId,
  projectTitle,
  model,
  onModelChange,
  onClose,
}: {
  lessonId: string;
  userId: string;
  projectTitle: string;
  model: LlmModelId;
  onModelChange: (model: LlmModelId) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"team" | "ai" | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = projectTitle.trim() || "수업";

  const downloadTeam = async () => {
    setBusy("team");
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("team_messages")
        .select("user_id, content, created_at")
        .eq("lesson_id", lessonId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data?.length) { await showAlert("팀 채팅 기록이 없습니다."); return; }

      const ids = [...new Set(data.map((r) => r.user_id as string))];
      const { data: profiles } = await supabase
        .from("profiles").select("id, display_name, email").in("id", ids);
      const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? p.email ?? "알 수 없음"]));

      const lines = [`[${title}] 팀 채팅 기록`, `내보낸 날짜: ${today()}`, "─".repeat(40), ""];
      for (const r of data) {
        lines.push(`[${stamp(r.created_at)}] ${names.get(r.user_id) ?? "알 수 없음"}`, r.content, "");
      }
      saveText(`팀채팅_${title}_${today()}.txt`, lines.join("\n"));
    } catch (e) {
      console.error("[chat-manage] team download", e);
      await showAlert("팀 채팅 기록을 내려받지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const downloadAi = async () => {
    setBusy("ai");
    try {
      const { data, error } = await createClient()
        .from("ai_messages")
        .select("role, content, created_at")
        .eq("lesson_id", lessonId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data?.length) { await showAlert("AI 채팅 기록이 없습니다."); return; }

      const lines = [`[${title}] AI 채팅 기록`, `내보낸 날짜: ${today()}`, "─".repeat(40), ""];
      for (const r of data) {
        lines.push(`[${stamp(r.created_at)}] ${r.role === "user" ? "나" : "Minerva AI"}`, r.content, "");
      }
      saveText(`AI채팅_${title}_${today()}.txt`, lines.join("\n"));
    } catch (e) {
      console.error("[chat-manage] ai download", e);
      await showAlert("AI 채팅 기록을 내려받지 못했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const current = LLM_MODELS.find((m) => m.id === model) ?? LLM_MODELS[0];

  const rowBtn =
    "shrink-0 rounded-lg border border-[#dde3eb] bg-white px-3 py-1.5 text-[13px] font-medium text-[#5a6066] transition hover:border-[#D1260F] hover:text-[#D1260F] disabled:opacity-50";

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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h2 className="text-[17px] font-semibold text-gray-900">채팅 관리</h2>
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

        <div className="divide-y divide-gray-100 px-6 py-2">
          {/* 1. 팀 채팅 기록 */}
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[#2d3339]">팀 채팅 기록 다운받기</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#757b82]">이 수업의 팀 채팅 전체를 텍스트 파일로 저장합니다.</p>
            </div>
            <button onClick={downloadTeam} disabled={busy !== null} className={rowBtn}>
              {busy === "team" ? "준비 중…" : "다운로드"}
            </button>
          </div>

          {/* 2. AI 채팅 기록 */}
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-[#2d3339]">AI 채팅 기록 다운받기</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#757b82]">내가 Minerva AI와 나눈 대화를 텍스트 파일로 저장합니다.</p>
            </div>
            <button onClick={downloadAi} disabled={busy !== null} className={rowBtn}>
              {busy === "ai" ? "준비 중…" : "다운로드"}
            </button>
          </div>

          {/* 3. LLM 모델 */}
          <div className="py-4">
            <p className="text-[15px] font-semibold text-[#2d3339]">LLM 모델 설정하기</p>
            <p className="mt-0.5 mb-3 text-[13px] leading-relaxed text-[#757b82]">
              이 수업의 Minerva AI 채팅과 초안 미리보기에 쓰는 모델입니다.
            </p>
            <select
              value={model}
              onChange={(e) => onModelChange(e.target.value as LlmModelId)}
              className="w-full cursor-pointer rounded-xl border border-[#dde3eb] bg-white px-4 py-2.5 text-[14px] text-[#2d3339] outline-none focus:border-[#D1260F] focus:ring-2 focus:ring-[#D1260F]/20"
            >
              {LLM_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label} — {m.feature}</option>
              ))}
            </select>
            <p className="mt-2 text-[12px] text-[#adb2ba]">
              현재: <span className="font-semibold text-[#D1260F]">{current.label}</span> · {current.feature}
            </p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
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
