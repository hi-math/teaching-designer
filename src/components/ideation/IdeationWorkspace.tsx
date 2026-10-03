"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import StandardsGraphClient from "@/components/standards-graph/StandardsGraphClient";
import { useExplorer } from "@/components/standards-graph/context";
import { useDetails } from "@/components/standards-graph/hooks";
import { subjectColor } from "@/lib/standards-graph/subjectPalette";
import { RELATION_LABELS } from "@/lib/standards-graph/relations";
import { DEFAULT_CRITERIA, RATINGS, STRATEGY_LABELS, emptyDraft, generationKey, readDraft, type IdeationConditions, type IdeationDraft, type TopicCandidate } from "@/lib/ideation/model";
import { type ContentMap } from "@/lib/ideation/application";
import { stableStringify } from "@/components/workspace/remoteContent";
import { CARD_SCHEMAS } from "@/components/workspace/cardSchemas";

export interface IdeationWorkspaceProps {
  lessonId: string;
  isHost: boolean;
  model: string;
  defaults: IdeationConditions;
  initialStandardIds: string[];
  saved: unknown;
  onCommitted: (changes: ContentMap, applied: boolean) => void;
  onContext: (text: string) => void;
  hasPendingCards: () => boolean;
}

const button = "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
const primary = "min-h-10 rounded-lg bg-[#D1260F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b9210d] disabled:cursor-not-allowed disabled:opacity-40";
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-500 disabled:bg-slate-50";

function previewText(code: string, content: ContentMap[string]): string {
  if (!content) return "작성한 내용 없음";
  if (content.type !== "structured") return String(content.text ?? "작성한 내용 없음");
  const values = (content.fields ?? {}) as Record<string, unknown>;
  return CARD_SCHEMAS[code].fields.flatMap(f => {
    const v = values[f.key];
    if (v === undefined || v === "" || v === null) return [];
    const text = f.type === "table" && Array.isArray(v)
      ? v.map(row => f.columns.map(c => `${c.label}: ${(row as Record<string, unknown>)[c.key] ?? ""}`).join(" / ")).join("\n")
      : Array.isArray(v) ? v.map(item => `• ${item}`).join("\n") : String(v);
    return [`${f.label ?? "내용"}\n${text}`];
  }).join("\n\n") || "작성한 내용 없음";
}

async function post(url: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다. 다시 시도하세요." }));
  if (!response.ok) throw new Error(result.error ?? "요청에 실패했습니다.");
  return result;
}

export default function IdeationWorkspace(props: IdeationWorkspaceProps) {
  return <StandardsGraphClient renderWorkspace={graph => <IdeationBoard {...props} graph={graph} />} />;
}

function IdeationBoard({ graph, ...props }: IdeationWorkspaceProps & { graph: ReactNode }) {
  const { index, state, dispatch, client, neighborStep } = useExplorer();
  const saved = readDraft(props.saved);
  const availableSubjects = index.subjects.map(s => s.subject);
  const defaults = { ...props.defaults, subjects: props.defaults.subjects.filter(s => availableSubjects.includes(s)) };
  const initial = emptyDraft(defaults, props.initialStandardIds.filter(id => index.nodeById.has(id)).slice(0, 6));
  // A local draft stays separate from committed lesson selections and remote edits.
  const [local, setLocal] = useState<IdeationDraft | null>(null);
  const draft = local ?? saved ?? initial;
  const [base, setBase] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "save" | "preview" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ before: ContentMap; changes: ContentMap } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const dirty = local !== null && stableStringify(local) !== stableStringify(saved);
  const conflict = dirty && base !== null && base !== stableStringify(saved);
  const selected = draft.candidates.find(c => c.id === (!props.isHost && inspectedId ? inspectedId : draft.selectedId)) ?? null;
  const stale = !!draft.candidates.length && draft.generatedFor !== generationKey(draft.conditions, draft.seedIds, index.summary.datasetVersion);
  const readonly = !props.isHost || !!busy;
  const missingSeeds = draft.seedIds.filter(id => !index.nodeById.has(id));

  const change = (patch: Partial<IdeationDraft>) => {
    if (!props.isHost || busy) return;
    if (!local) setBase(stableStringify(saved));
    setLocal({ ...draft, ...patch, datasetVersion: index.summary.datasetVersion });
    setMessage(""); setError(""); setPreview(null);
  };
  const conditions = (patch: Partial<IdeationConditions>) => change({ conditions: { ...draft.conditions, ...patch } });
  const collect = (id: string) => {
    if (draft.seedIds.includes(id)) return;
    if (draft.seedIds.length >= 6) { setError("출발 성취기준은 최대 6개입니다. 기존 기준을 빼고 추가하세요."); return; }
    const n = index.nodeById.get(id);
    if (!n) return;
    change({ seedIds: [...draft.seedIds, id], conditions: { ...draft.conditions, subjects: [...new Set([...draft.conditions.subjects, n.subject])] } });
  };
  const focus = (id: string) => {
    dispatch({ type: "RESET_FILTERS" });
    dispatch({ type: "SET_MIN_WEIGHT", weight: 2 });
    dispatch({ type: "SET_SUBJECT_RELATION", relation: "cross" });
    if (draft.conditions.subjects.length > 1) dispatch({ type: "SET_SUBJECTS", subjects: draft.conditions.subjects });
    dispatch({ type: "FOCUS_NODE", id, step: neighborStep });
    setStep(1);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!preview) return;
    previewRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) { e.preventDefault(); setPreview(null); }
      if (e.key === "Tab") {
        const controls = previewRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]');
        if (!controls?.length) { e.preventDefault(); return; }
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === previewRef.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, busy]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (!search.trim()) { setHits([]); setSearching(false); return; }
      setSearching(true); setSearchError("");
      client.search(search, 60).then(result => {
        if (alive && result) setHits(result.hits.map(h => h.id));
      }).catch(() => { if (alive) setSearchError("검색하지 못했습니다. 검색어를 바꾸거나 다시 시도하세요."); })
        .finally(() => { if (alive) setSearching(false); });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [search, client]);
  const contextText = useMemo(() => [
    "현재 작업: 아이디어 도출. 아직 수업에 채택하지 않은 탐색 결과입니다.",
    `참여 교과: ${draft.conditions.subjects.join(", ")}; 관심 문제: ${draft.conditions.interest}`,
    `출발 기준: ${draft.seedIds.join(", ")}`,
    selected ? `검토 중인 후보: ${selected.title}\n핵심 질문: ${selected.question}\n공동 산출물: ${selected.product}\n연계 설명: ${selected.integration}\n성취기준: ${selected.standardIds.join(", ")}\n근거 ID: ${selected.edgeIds.join(", ")}` : "아직 후보를 선택하지 않았습니다.",
    stale ? "조건이 바뀌어 후보를 다시 생성해야 합니다." : "",
  ].join("\n"), [draft.conditions, draft.seedIds, selected, stale]);
  const { onContext } = props;
  useEffect(() => { onContext(contextText); }, [contextText, onContext]);

  const save = async (next = { ...draft, datasetVersion: index.summary.datasetVersion }) => {
    if (conflict) throw new Error("다른 창에서 진행 내용이 바뀌었습니다. 저장된 진행을 먼저 불러오세요.");
    const result = await post("/api/ideation/save", { lessonId: props.lessonId, action: "save", draft: next, expectedDraft: props.saved ?? null });
    props.onCommitted(result.changes, false);
    setLocal(null); setBase(null); setMessage("진행 내용을 저장했습니다.");
  };
  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind); setError(""); setMessage("");
    try { await action(); } catch (e) {
      if (e instanceof Error && e.name === "AbortError") setMessage("주제 생성을 취소했습니다. 기존 후보는 유지됩니다.");
      else setError(e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.");
    } finally { setBusy(null); }
  };
  const generate = () => run("generate", async () => {
    const next = { ...draft, datasetVersion: index.summary.datasetVersion };
    controller.current = new AbortController();
    const result = await post("/api/ideation", { lessonId: props.lessonId, model: props.model, draft: next }, controller.current.signal);
    const generated: IdeationDraft = { ...next, candidates: result.candidates, generatedFor: result.generatedFor, selectedId: null, rationale: "" };
    setLocal(generated); if (!local) setBase(stableStringify(saved));
    setStep(2);
    await save(generated);
  });
  const openPreview = () => run("preview", async () => {
    if (props.hasPendingCards()) throw new Error("수업 설계 카드가 저장 중입니다. 잠시 후 다시 시도하세요.");
    if (conflict) throw new Error("다른 창에서 진행 내용이 바뀌었습니다. 저장된 진행을 먼저 불러오세요.");
    await save({ ...draft, datasetVersion: index.summary.datasetVersion });
    setPreview(await post("/api/ideation/save", { lessonId: props.lessonId, action: "preview", draft }));
  });
  const apply = () => run("apply", async () => {
    if (props.hasPendingCards()) throw new Error("수업 설계 카드가 저장 중입니다. 저장 후 미리보기를 다시 열어 주세요.");
    const result = await post("/api/ideation/save", { lessonId: props.lessonId, action: "apply", draft, before: preview!.before });
    setPreview(null); setLocal(null); setBase(null);
    props.onCommitted(result.changes, true);
  });

  const basket = <div className="flex flex-wrap items-center gap-2">
    <span className="text-xs font-semibold text-slate-500">출발 기준 {draft.seedIds.length}/6</span>
    {draft.seedIds.map(id => <span key={id} className="flex items-center gap-1 rounded-full border border-slate-200 bg-white pl-3 pr-1 text-xs">
      <button className="py-2 text-slate-700 hover:underline" onClick={() => focus(id)} disabled={!index.nodeById.has(id)}>{id} · {index.nodeById.get(id)?.subject ?? "데이터에 없음"}</button>
      <button className="h-8 w-8 rounded-full hover:bg-slate-100 disabled:opacity-40" aria-label={`${id} 담기 취소`} disabled={readonly} onClick={() => change({ seedIds: draft.seedIds.filter(x => x !== id) })}>×</button>
    </span>)}
  </div>;

  return <div className="flex min-h-0 flex-1 flex-col bg-[#f6f7f9] text-slate-800">
    <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold tracking-widest text-[#D1260F]">IDEATION</p><h1 className="mt-1 text-xl font-bold">성취기준에서 수업 주제로</h1></div>
        <div className="flex items-center gap-2"><span className="text-xs text-slate-500">{dirty ? "저장하지 않은 변경" : saved ? "저장된 진행" : "새 탐색"}</span><button className={button} disabled={readonly || conflict} onClick={() => run("save", () => save())}>진행 저장</button></div>
      </div>
      <nav aria-label="아이디어 도출 단계" className="mt-4 flex flex-wrap gap-2">
        {["수업 조건", "성취기준 탐색", "주제 후보 비교"].map((label, i) => <button key={label} aria-current={step === i ? "step" : undefined} className={`rounded-full px-4 py-2 text-sm ${step === i ? "bg-slate-800 font-semibold text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`} onClick={() => setStep(i)}>{i + 1}. {label}</button>)}
      </nav>
      {!props.isHost && <p className="mt-2 text-xs text-slate-500">저장된 진행을 함께 볼 수 있습니다. 기준 담기·주제 생성·설계 반영은 수업 소유자가 진행합니다.</p>}
    </header>
    {(error || message || conflict || stale) && <div aria-live="polite" className="shrink-0 space-y-1 border-b border-slate-200 bg-white px-5 py-2 text-sm">
      {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p className="text-emerald-700">{message}</p>}
      {stale && <p className="text-amber-800">수업 조건이나 성취기준이 바뀌었습니다. 설계에 반영하려면 후보를 다시 만들어 주세요.</p>}
      {conflict && <p className="text-amber-800">다른 창에서 진행이 변경되었습니다. <button className="font-semibold underline" disabled={!!busy} onClick={() => { setLocal(null); setBase(null); setPreview(null); }}>내 변경을 버리고 저장된 진행 불러오기</button></p>}
    </div>}

    {step === 0 && <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">어떤 수업을 함께 만들까요?</h2><p className="mt-1 text-sm text-slate-500">수업 기본정보를 가져왔습니다. 여기서 조정한 조건은 아이디어 탐색에 사용합니다.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm">대상 학년<input className={field} maxLength={60} disabled={readonly} value={draft.conditions.grade} onChange={e => conditions({ grade: e.target.value })} placeholder="예: 중학교 2학년" /></label>
            <label className="space-y-1 text-sm">총 차시<input className={field} type="number" min={1} max={60} disabled={readonly} value={draft.conditions.sessions ?? ""} onChange={e => conditions({ sessions: e.target.value ? Math.max(1, Math.min(60, Number(e.target.value))) : null })} placeholder="미정" /></label></div>
          <fieldset className="mt-4" disabled={readonly}><legend className="mb-2 text-sm font-medium">참여 교과 · 2개 이상 선택</legend><div className="flex flex-wrap gap-2">{availableSubjects.map(subject => <label key={subject} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${draft.conditions.subjects.includes(subject) ? "border-slate-700 bg-slate-50" : "border-slate-200"}`}><input type="checkbox" className="mr-2 accent-slate-800" checked={draft.conditions.subjects.includes(subject)} onChange={e => conditions({ subjects: e.target.checked ? [...draft.conditions.subjects, subject] : draft.conditions.subjects.filter(s => s !== subject) })} />{subject}</label>)}</div></fieldset>
          <label className="mt-4 block space-y-1 text-sm">학생 관심사·학교나 지역의 문제<textarea className={field} rows={2} maxLength={1000} disabled={readonly} value={draft.conditions.interest} onChange={e => conditions({ interest: e.target.value })} placeholder="예: 우리 지역의 기후변화 대응을 살펴보고 싶어요." /></label>
          <p className="mt-2 text-xs text-slate-500">중학교 1~3학년 성취기준을 사용합니다. 실제 진도와 이수 여부는 교사가 확인합니다.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">팀이 중요하게 생각하는 것</h2>
          <label className="mt-3 block space-y-1 text-sm">팀 비전<textarea className={field} rows={2} disabled={readonly} maxLength={2000} value={draft.conditions.vision} onChange={e => conditions({ vision: e.target.value })} placeholder="팀 준비에서 작성한 공동 비전" /></label>
          <label className="mt-3 block space-y-1 text-sm">주제 선정 기준 · 한 줄에 하나, 최대 10개<textarea className={field} rows={4} disabled={readonly} maxLength={1500} value={draft.conditions.criteria.join("\n")} onChange={e => conditions({ criteria: e.target.value.split("\n").slice(0, 10) })} onBlur={() => conditions({ criteria: [...new Set(draft.conditions.criteria.map(x => x.trim()).filter(Boolean))] })} /></label>
          {!draft.conditions.criteria.filter(Boolean).length && <button className={`${button} mt-2`} disabled={readonly} onClick={() => conditions({ criteria: DEFAULT_CRITERIA })}>기본 선정 기준 사용</button>}
        </section>
        <div className="flex justify-end"><button className={primary} onClick={() => { setSearch(draft.conditions.interest.split(/\s+/).find(x => x.length > 1) ?? ""); setStep(1); }}>성취기준 찾기 →</button></div>
      </div>
    </div>}

    <div className={`${step === 1 ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}>
      <section className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-2"><label className="min-w-48 flex-1"><span className="sr-only">출발 성취기준 검색</span><input className={field} value={search} onChange={e => setSearch(e.target.value)} placeholder="관심어 또는 성취기준 코드 검색" /></label>
          {state.selectedNodeId && <button className={button} disabled={readonly || draft.seedIds.includes(state.selectedNodeId)} onClick={() => collect(state.selectedNodeId!)}>{state.selectedNodeId} {draft.seedIds.includes(state.selectedNodeId) ? "담음" : "담기"}</button>}
        </div>
        {search.trim() && <div className="max-h-44 space-y-1 overflow-y-auto" aria-live="polite">
          {searching ? <p className="text-sm text-slate-500">검색 중…</p> : searchError ? <p className="text-sm text-red-700">{searchError}</p> : hits.filter(id => !draft.conditions.subjects.length || draft.conditions.subjects.includes(index.nodeById.get(id)!.subject)).length === 0 ? <p className="text-sm text-slate-500">참여 교과에서 결과를 찾지 못했습니다. 짧은 관심어로 검색하거나 참여 교과를 넓혀 보세요.</p> : hits.filter(id => !draft.conditions.subjects.length || draft.conditions.subjects.includes(index.nodeById.get(id)!.subject)).slice(0, 20).map(id => { const n = index.nodeById.get(id)!; return <div key={id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><button className="min-w-0 flex-1 text-left text-xs hover:underline" onClick={() => focus(id)}><strong>{id} · {n.subject}</strong><span className="ml-2">{n.preview}</span></button><button className={button} disabled={readonly || draft.seedIds.includes(id)} onClick={() => collect(id)}>{draft.seedIds.includes(id) ? "담음" : "담기"}</button></div>; })}
        </div>}
        {basket}
        {!draft.seedIds.length && <p className="text-xs text-slate-500">이번 수업에서 반드시 다룰 기준을 1~6개 담으세요. 연결되는 다른 교과 기준을 후보에 함께 제안합니다.</p>}
        {!!missingSeeds.length && <p className="text-xs text-red-700">현재 데이터에 없는 기준을 목록에서 제거하세요: {missingSeeds.join(", ")}</p>}
      </section>
      <div className="flex min-h-0 flex-1">{graph}</div>
    </div>

    {step === 2 && <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {!draft.candidates.length ? <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-lg font-bold">연결을 수업 주제로 발전시켜 보세요</h2><p className="mt-3 text-sm leading-6 text-slate-500">출발 기준과 연결 근거를 바탕으로 공통 내용, 공통 수행 역량, 교과 간 상호보완 관점의 후보를 만듭니다.</p><button className={`${button} mt-5`} onClick={() => setStep(1)}>성취기준 탐색으로</button></div> : <div className="space-y-5">
        <div className="grid gap-3 @min-[900px]:grid-cols-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
          {draft.candidates.map(c => <button key={c.id} className={`rounded-2xl border bg-white p-5 text-left transition ${selected?.id === c.id ? "border-[#D1260F] ring-1 ring-[#D1260F]" : "border-slate-200 hover:border-slate-400"}`} aria-pressed={selected?.id === c.id} disabled={!!busy} onClick={() => props.isHost ? change({ selectedId: c.id }) : setInspectedId(c.id)}>
            <span className="text-xs font-semibold text-[#D1260F]">{STRATEGY_LABELS[c.bundleId]}</span><h2 className="mt-2 text-lg font-bold">{c.title}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{c.question}</p><p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><strong className="block text-xs text-slate-500">공동 산출물</strong>{c.product}</p><p className="mt-3 text-xs text-slate-500">{c.roles.map(r => r.subject).join(" · ")} / 기준 {c.standardIds.length}개</p>
          </button>)}
        </div>
        <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold">선정 기준으로 비교</h2><p className="mb-3 text-xs text-slate-500">AI의 검토 제안입니다. 후보를 선택한 뒤 판단과 이유를 수정할 수 있습니다.</p><table className="w-full min-w-[560px] text-left text-sm"><thead><tr><th className="p-2">선정 기준</th>{draft.candidates.map(c => <th key={c.id} className="p-2">{c.title}</th>)}</tr></thead><tbody>{draft.conditions.criteria.map((criterion, i) => <tr key={`${i}-${criterion}`} className="border-t border-slate-100"><th className="p-2 align-top font-medium">{criterion}</th>{draft.candidates.map(c => { const e = c.evaluations.find(x => x.criterion === criterion); return <td key={c.id} className="p-2 align-top"><span className={`text-xs font-semibold ${e?.rating === "충분함" ? "text-emerald-700" : "text-amber-700"}`}>{e?.rating ?? "조건 변경"}</span><p className="mt-1 text-xs leading-5 text-slate-500">{e?.reason}</p></td>; })}</tr>)}</tbody></table></section>
        {selected && <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold">{selected.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{selected.integration}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{selected.roles.map((r, i) => <div key={i} className="rounded-xl bg-slate-50 p-3 text-sm"><strong style={{ color: subjectColor(r.subject) }}>{r.subject}</strong><p className="mt-1 leading-6">{r.role}</p><p className="mt-2 text-xs text-slate-500">{r.standardIds.join(", ")}</p></div>)}</div>
          <h3 className="mt-5 text-sm font-semibold">활동 흐름</h3><ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-600">{selected.activities.map((a, i) => <li key={i}>{a}</li>)}</ol>
          <h3 className="mt-5 text-sm font-semibold">운영 전에 확인할 것</h3><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-800">{[...selected.requirements, ...selected.warnings].map((x, i) => <li key={i}>{x}</li>)}</ul>
          <EvidenceGraph candidate={selected} seeds={draft.seedIds} />
          <details className="mt-5 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold">팀의 판단으로 평가 수정</summary><div className="mt-3 space-y-3">{selected.evaluations.map((e, i) => <div key={i} className="space-y-2"><label className="flex items-center justify-between gap-2 text-sm">{e.criterion}<select className={`${field} max-w-36`} disabled={readonly} value={e.rating} onChange={event => change({ candidates: draft.candidates.map(c => c.id === selected.id ? { ...c, evaluations: c.evaluations.map((v, j) => i === j ? { ...v, rating: event.target.value as typeof v.rating } : v) } : c) })}>{RATINGS.map(r => <option key={r}>{r}</option>)}</select></label><textarea aria-label={`${e.criterion} 판단 이유`} className={field} rows={2} disabled={readonly} maxLength={1000} value={e.reason} onChange={event => change({ candidates: draft.candidates.map(c => c.id === selected.id ? { ...c, evaluations: c.evaluations.map((v, j) => i === j ? { ...v, reason: event.target.value } : v) } : c) })} /></div>)}</div></details>
          <label className="mt-5 block space-y-2 text-sm font-semibold">최종 선정 사유<textarea className={field} rows={3} maxLength={2000} disabled={readonly} value={draft.rationale} onChange={e => change({ rationale: e.target.value })} placeholder="이 후보를 고른 이유와 보완해야 할 조건을 적어 주세요." /></label>
        </section>}
      </div>}
    </div>}

    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-3">
      <p className="text-xs text-slate-500">{busy === "generate" ? "연결 근거로 후보를 만드는 중입니다. 잠시 기다려 주세요." : `${draft.conditions.subjects.length}개 교과 · 출발 기준 ${draft.seedIds.length}개 · ${draft.conditions.sessions ? `${draft.conditions.sessions}차시` : "차시 미정"}`}</p>
      <div className="flex flex-wrap gap-2">{busy === "generate" && <button className={button} onClick={() => controller.current?.abort()}>생성 취소</button>}<button className={selected && step === 2 ? button : primary} disabled={readonly || conflict || !draft.seedIds.length || !!missingSeeds.length || draft.conditions.subjects.length < 2 || !draft.conditions.criteria.filter(Boolean).length} onClick={generate}>{busy === "generate" ? "생성 중…" : draft.candidates.length ? "후보 다시 만들기" : "주제 후보 3개 만들기"}</button>
        {step === 2 && <button className={primary} disabled={readonly || conflict || stale || !selected || !draft.rationale.trim()} onClick={openPreview}>{busy === "preview" ? "변경 내용 확인 중…" : "수업 설계에 반영"}</button>}</div>
    </footer>

    {preview && <div className="absolute inset-0 z-50 flex flex-col bg-slate-50 p-5" role="dialog" aria-modal="true" aria-labelledby="ideation-preview-title" ref={previewRef} tabIndex={-1}>
      <h2 id="ideation-preview-title" className="text-lg font-bold">수업 설계에 반영할 내용</h2><p className="mt-2 text-sm text-slate-600">A-2의 최종 주제와 선정 사유를 바꾸고, A-3에는 기준을 추가합니다. A-4의 통합 목표와 교육과정 핵심 아이디어는 유지합니다.</p>
      <div className="my-4 min-h-0 flex-1 space-y-4 overflow-y-auto">{["A-2", "A-3", "A-4"].map(code => <section key={code} className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">{code} · {({ "A-2": "주제 선정", "A-3": "성취기준 분석", "A-4": "교과 간 연계" })[code]}</h3><div className="mt-3 grid gap-4 sm:grid-cols-2">{(["before", "changes"] as const).map(side => <div key={side}><h4 className="text-xs font-semibold text-slate-500">{side === "before" ? "현재 내용" : "반영 후"}</h4><pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-6">{previewText(code, preview[side][code])}</pre></div>)}</div></section>)}</div>
      {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><button className={button} disabled={!!busy} onClick={() => setPreview(null)}>돌아가기</button><button className={primary} disabled={!!busy} onClick={apply}>{busy === "apply" ? "반영 중…" : "확인하고 수업 설계 시작"}</button></div>
    </div>}
  </div>;
}

function EvidenceGraph({ candidate, seeds }: { candidate: TopicCandidate; seeds: string[] }) {
  const { index, client } = useExplorer();
  const [picked, setPicked] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const nodeId = picked && candidate.standardIds.includes(picked) ? picked : null;
  const selectedEdge = edgeId && candidate.edgeIds.includes(edgeId) ? edgeId : null;
  const node = useDetails(nodeId, client.nodeDetails);
  const detail = useDetails(selectedEdge, client.edgeDetails);
  const nodes = candidate.standardIds.map(id => index.nodeById.get(id)).filter(n => !!n);
  const edges = candidate.edgeIds.map(id => index.edgeById.get(id)).filter(e => !!e);
  const positions = new Map(nodes.map((n, i) => [n.id, { x: 270 + 185 * Math.cos(2 * Math.PI * i / nodes.length), y: 155 + 105 * Math.sin(2 * Math.PI * i / nodes.length) }]));
  return <section className="mt-5 rounded-xl border border-slate-200 p-4">
    <h3 className="text-sm font-semibold">이 후보의 성취기준과 연결 근거</h3><p className="mt-1 text-xs text-slate-500">테두리가 진한 기준은 직접 담은 기준입니다. 관계는 추론된 연결이며 공식 필수 선수관계가 아닙니다.</p>
    <svg viewBox="0 0 540 310" role="img" aria-label={`${candidate.title}의 성취기준 연결`} className="mx-auto max-h-72 w-full">
      {edges.map(e => { const a = positions.get(e.source), b = positions.get(e.target); if (!a || !b) return null; return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={selectedEdge === e.id ? "#D1260F" : "#cbd5e1"} strokeWidth={selectedEdge === e.id ? 3 : 1.5} />; })}
      {nodes.map(n => { const p = positions.get(n.id)!; return <g key={n.id} onClick={() => { setPicked(n.id); setEdgeId(null); }} style={{ cursor: "pointer" }}><circle cx={p.x} cy={p.y} r={14} fill={subjectColor(n.subject)} stroke={seeds.includes(n.id) ? "#0f172a" : "white"} strokeWidth={seeds.includes(n.id) ? 3 : 1} /><text x={p.x} y={p.y + 30} textAnchor="middle" fontSize="12" fill="#334155">{n.code}</text><text x={p.x} y={p.y + 45} textAnchor="middle" fontSize="10" fill="#64748b">{n.subject}</text></g>; })}
    </svg>
    <div className="flex flex-wrap gap-2">{nodes.map(n => <button className={`${button} text-xs`} key={n.id} aria-pressed={nodeId === n.id} onClick={() => { setPicked(n.id); setEdgeId(null); }}>{n.code} {seeds.includes(n.id) ? "· 출발" : "· 추천"}</button>)}</div>
    <div className="mt-3 flex flex-wrap gap-2">{edges.map(e => <button key={e.id} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 hover:bg-slate-200" aria-pressed={selectedEdge === e.id} onClick={() => { setEdgeId(e.id); setPicked(null); }}>{e.source} ↔ {e.target}</button>)}</div>
    {!edges.length && <p className="mt-2 text-xs text-amber-800">이 관점에서 기록된 연결이 없습니다. 제안된 교과 역할을 검토해 주세요.</p>}
    {nodeId && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6"><strong>{nodeId}</strong><p>{node.data?.content ?? node.error ?? "원문 불러오는 중…"}</p>{node.data?.application_notes && <details className="mt-2"><summary className="cursor-pointer text-xs">적용 사항</summary><p className="mt-1 text-xs">{node.data.application_notes}</p></details>}</div>}
    {selectedEdge && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6">{detail.data ? <><p>{detail.data.edge.reason}</p><p className="mt-2 text-xs text-slate-500">{Object.entries(detail.data.edge.dimension_weights).filter(([, value]) => value > 0).map(([key, value]) => `${RELATION_LABELS[key as keyof typeof RELATION_LABELS]} ${value}`).join(" · ")}</p><p className="mt-2 text-xs">{detail.data.source.content}</p><p className="mt-1 text-xs">{detail.data.target.content}</p></> : detail.error ?? "근거 불러오는 중…"}</div>}
  </section>;
}
