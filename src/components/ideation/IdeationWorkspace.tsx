"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import IdeasModal, { type IdeaItem } from "@/components/workspace/IdeasModal";
import StandardsModal, { type StandardItem } from "@/components/workspace/StandardsModal";
import { CARD_SCHEMAS } from "@/components/workspace/cardSchemas";
import { stableStringify } from "@/components/workspace/remoteContent";
import type { ContentMap } from "@/lib/ideation/application";
import type { SuggestDirection, IdeaSuggestion } from "@/app/api/ideation/route";
import { bracketCode } from "@/lib/standardCode";
import {
  LIMITS, addLink, confirmLink, emptyDraft, hasLink, ideaOrigin, ideaSubject, ideaText, newId, readDraft, relatedTo,
  removeItem, removeLink, setElementText, setIdeaText,
  type IdeaEntry, type IdeationConditions, type IdeationDraft, type StandardEntry,
} from "@/lib/ideation/model";
import {
  CodeChip, DIRECTION_LABEL, IconBtn, LinkChip, Pane, PencilIcon, SourceBadge, SubjectBadge, SuggestPanel, XIcon,
  aiBtn, btn, field, primaryBtn, short, type Suggestion, type SuggestState, type SuggestView,
} from "./ideationParts";

// 아이디어 도출 — 주제 설계 ↔ 핵심아이디어 ↔ 성취기준을 한 화면에서 함께 다룬다 (prompt/idea.md)
// 단계 전환 없이 세 영역이 항상 보이고, 연결은 카드의 강조와 칩으로 보여 준다.

export interface IdeationWorkspaceProps {
  lessonId: string;
  isHost: boolean;
  /** 추천에 쓰는 조건 — 수업 기본정보의 교과·학년 */
  defaults: IdeationConditions;
  /** 저장된 아이디어 도출이 없을 때 시작점 — A-2 주제와 수업 설계에서 고른 핵심아이디어·성취기준 */
  seed: { topic: string; ideas: IdeaItem[]; standards: StandardItem[] };
  saved: unknown;
  chatOpen: boolean;
  onToggleChat: () => void;
  onCommitted: (changes: ContentMap, applied: boolean) => void;
  onContext: (text: string) => void;
  hasPendingCards: () => boolean;
}

type Kind = "element" | "idea" | "standard";
type PaneKey = "ideas" | "standards";
const NEED: Record<SuggestDirection, Kind> = { "element-ideas": "element", "idea-elements": "idea", "idea-standards": "idea", "standard-ideas": "standard" };
const PICK_FIRST: Record<Kind, string> = { element: "하위요소를 먼저 선택하세요.", idea: "핵심아이디어를 먼저 선택하세요.", standard: "성취기준을 먼저 선택하세요." };

function previewText(code: string, content: ContentMap[string]): string {
  if (!content) return "작성한 내용 없음";
  if (content.type !== "structured") return String(content.text ?? "작성한 내용 없음");
  const values = (content.fields ?? {}) as Record<string, unknown>;
  return (CARD_SCHEMAS[code]?.fields ?? []).flatMap((f) => {
    const v = values[f.key];
    if (v === undefined || v === "" || v === null) return [];
    const text = f.type === "table" && Array.isArray(v)
      ? v.map((row) => f.columns.map((c) => `${c.label}: ${(row as Record<string, unknown>)[c.key] ?? ""}`).join(" / ")).join("\n")
      : Array.isArray(v) ? v.map((item) => `• ${item}`).join("\n") : String(v);
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
  const { isHost, lessonId, onContext } = props;
  const saved = useMemo(() => readDraft(props.saved), [props.saved]);
  const [initial] = useState(() => emptyDraft(props.defaults, {
    topic: props.seed.topic,
    ideas: props.seed.ideas.map((i) => ({ catalogId: i.id, subject: i.subject, domain: i.domain, content: i.content })),
    standards: props.seed.standards.map((s) => ({ code: bracketCode(s.code), subject: s.subject, domain: s.domain, content: s.content })),
  }));
  // 화면의 초안은 저장된 진행·다른 창의 변경과 따로 둔다
  const [local, setLocal] = useState<IdeationDraft | null>(null);
  const draft = local ?? saved ?? initial;
  const [base, setBase] = useState<string | null>(null);
  const dirty = local !== null && stableStringify(local) !== stableStringify(saved);
  const conflict = dirty && base !== null && base !== stableStringify(saved);

  const [selection, setSelection] = useState<{ kind: Kind; id: string } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: "idea" | "note"; id: string; text: string; subject: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "preview" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ before: ContentMap; changes: ContentMap } | null>(null);
  const [modal, setModal] = useState<"ideas" | "standards" | null>(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [suggest, setSuggest] = useState<Record<PaneKey, SuggestState | null>>({ ideas: null, standards: null });
  const [hint, setHint] = useState<Record<PaneKey, string>>({ ideas: "", standards: "" });
  const [subjects, setSubjects] = useState<string[]>([]);
  const [enrich, setEnrich] = useState<Record<string, { subject: string; domain: string; content: string }>>({});
  const controllers = useRef<Record<PaneKey, AbortController | null>>({ ideas: null, standards: null });
  const enrichTried = useRef(new Set<string>());
  const conditionsRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const readonly = !isHost || !!busy;
  const elementById = new Map(draft.elements.map((e) => [e.id, e]));
  const ideaById = new Map(draft.ideas.map((i) => [i.id, i]));
  const stdById = new Map(draft.standards.map((s) => [s.id, s]));
  const exists = (kind: Kind, id: string) => (kind === "element" ? elementById : kind === "idea" ? ideaById : stdById).has(id);
  const sel = selection && exists(selection.kind, selection.id) ? selection : null;
  const rel = sel ? relatedTo(draft, sel.kind, sel.id) : { strong: new Set<string>(), soft: new Set<string>() };

  const elementLabel = (id: string) => short(elementById.get(id)?.text ?? "") || "—";
  const ideaLabel = (id: string) => { const i = ideaById.get(id); return i ? short(ideaText(i)) || "—" : "—"; };
  const standardText = (s: StandardEntry) => s.content || enrich[s.code]?.content || "";
  const labelOf = (kind: Kind, id: string) => (kind === "element" ? elementLabel(id) : kind === "idea" ? ideaLabel(id) : stdById.get(id)?.code ?? "—");

  // ── 변경 ──────────────────────────────────────────────────────
  const change = (next: IdeationDraft) => {
    if (!isHost || busy) return;
    if (!local) setBase(stableStringify(saved));
    setLocal(next); setMessage(""); setError(""); setPreview(null);
  };
  const open = (kind: Kind, id: string) => {
    setSelection({ kind, id });
    requestAnimationFrame(() => document.getElementById(`ideation-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const remove = (kind: Kind, id: string) => {
    change(removeItem(draft, kind, id));
    if (sel?.id === id) setSelection(null);
    if (editing?.id === id) setEditing(null);
  };
  const addElement = () => {
    if (draft.elements.length >= LIMITS.elements) return;
    const el = { id: newId("el"), text: "", via: "manual" as const };
    change({ ...draft, elements: [...draft.elements, el] });
    setSelection({ kind: "element", id: el.id }); setFocusId(el.id);
  };
  const addCustomIdea = () => {
    if (draft.ideas.length >= LIMITS.ideas) return;
    const subject = draft.conditions.subjects[0] ?? "";
    const idea: IdeaEntry = { id: newId("id"), official: null, revision: "", subject, via: "manual" };
    change({ ...draft, ideas: [...draft.ideas, idea] });
    setSelection({ kind: "idea", id: idea.id });
    setEditing({ kind: "idea", id: idea.id, text: "", subject });
  };
  const saveEditing = () => {
    if (!editing) return;
    if (editing.kind === "note") {
      change({ ...draft, standards: draft.standards.map((s) => (s.id === editing.id ? { ...s, note: editing.text.trim().slice(0, LIMITS.note) } : s)) });
    } else {
      const idea = ideaById.get(editing.id);
      if (!idea) { setEditing(null); return; }
      // 직접 작성한 항목을 비운 채 저장하면 지운다
      if (!idea.official && !editing.text.trim()) { remove("idea", idea.id); return; }
      let next = setIdeaText(draft, idea.id, editing.text.trim());
      if (!idea.official && editing.subject !== idea.subject) next = { ...next, ideas: next.ideas.map((i) => (i.id === idea.id ? { ...i, subject: editing.subject } : i)) };
      change(next);
    }
    setEditing(null);
  };
  const cancelEditing = () => {
    const idea = editing?.kind === "idea" ? ideaById.get(editing.id) : undefined;
    if (idea && !idea.official && !ideaText(idea).trim()) remove("idea", idea.id);
    setEditing(null);
  };

  // 검색 모달 — 모달에서 고른 결과로 공식 항목을 더하고, 선택을 해제한 항목은 연결과 함께 지운다
  const applyIdeaPicks = (items: IdeaItem[]) => {
    const keep = new Set(items.map((i) => i.id));
    let next = draft;
    for (const idea of draft.ideas) if (idea.official && !keep.has(idea.official.catalogId)) next = removeItem(next, "idea", idea.id);
    const have = new Set(next.ideas.flatMap((i) => (i.official ? [i.official.catalogId] : [])));
    const added: IdeaEntry[] = items.filter((i) => !have.has(i.id)).map((i) => ({
      id: newId("id"), official: { catalogId: i.id, subject: i.subject, domain: i.domain, content: i.content }, revision: null, subject: i.subject, via: "manual",
    }));
    change({ ...next, ideas: [...next.ideas, ...added].slice(0, LIMITS.ideas) });
  };
  const applyStandardPicks = (items: StandardItem[]) => {
    const keep = new Set(items.map((s) => bracketCode(s.code)));
    let next = draft;
    for (const s of draft.standards) if (!keep.has(s.code)) next = removeItem(next, "standard", s.id);
    const have = new Set(next.standards.map((s) => s.code));
    const added: StandardEntry[] = items.filter((s) => !have.has(bracketCode(s.code))).map((s) => {
      const code = bracketCode(s.code);
      return { id: code, code, subject: s.subject, domain: s.domain, content: s.content, note: "", via: "manual" };
    });
    change({ ...next, standards: [...next.standards, ...added].slice(0, LIMITS.standards) });
  };

  // ── with AI ───────────────────────────────────────────────────
  const runSuggest = async (pane: PaneKey, direction: SuggestDirection, target?: { id: string; label: string }) => {
    const need = NEED[direction];
    const t = target ?? (sel && sel.kind === need ? { id: sel.id, label: labelOf(need, sel.id) } : null);
    if (!t) { setHint((h) => ({ ...h, [pane]: PICK_FIRST[need] })); return; }
    setHint((h) => ({ ...h, [pane]: "" }));
    controllers.current[pane]?.abort();
    const controller = new AbortController();
    controllers.current[pane] = controller;
    setSuggest((s) => ({ ...s, [pane]: { direction, targetId: t.id, targetLabel: t.label, status: "loading", items: [] } }));
    try {
      const result = await post("/api/ideation", { lessonId, direction, targetId: t.id, draft }, controller.signal);
      const type = direction === "idea-elements" ? "element" : direction === "idea-standards" ? "standard" : "idea";
      const items = (result.suggestions as Record<string, unknown>[]).map((s, i) => ({ key: `${Date.now()}-${i}`, s: { type, ...s } as Suggestion, ignored: false }));
      setSuggest((st) => (st[pane]?.targetId === t.id && st[pane]?.direction === direction ? { ...st, [pane]: { ...st[pane]!, status: "done", items } } : st));
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setSuggest((st) => (st[pane] ? { ...st, [pane]: { ...st[pane]!, status: "error", error: e instanceof Error ? e.message : "추천 중 오류가 발생했습니다. 다시 시도하세요." } } : st));
    }
  };
  const closeSuggest = (pane: PaneKey) => { controllers.current[pane]?.abort(); setSuggest((s) => ({ ...s, [pane]: null })); };
  useEffect(() => () => { controllers.current.ideas?.abort(); controllers.current.standards?.abort(); }, []);

  const suggestView = (st: SuggestState) => (s: Suggestion): SuggestView => {
    const t = st.targetId;
    if (s.type === "idea") {
      const targetOk = st.direction === "element-ideas" ? elementById.has(t) : stdById.has(t);
      if (!targetOk) return { action: null, adopted: false };
      const existing = draft.ideas.find((i) => i.official?.catalogId === s.catalogId);
      const linked = !!existing && (st.direction === "element-ideas" ? hasLink(draft, "elementIdea", t, existing.id) : hasLink(draft, "ideaStandard", existing.id, t));
      return { action: existing ? "연결" : "추가", adopted: linked };
    }
    if (!ideaById.has(t)) return { action: null, adopted: false };
    if (s.type === "standard") {
      const existing = stdById.get(s.code);
      return { action: existing ? "연결" : "추가", adopted: !!existing && hasLink(draft, "ideaStandard", t, existing.id) };
    }
    if (s.kind === "revise") {
      const el = s.elementId ? elementById.get(s.elementId) : undefined;
      if (!el) return { action: null, adopted: false };
      const done = el.text === s.text && hasLink(draft, "elementIdea", el.id, t);
      return { action: "문장에 반영", adopted: done, before: done ? undefined : el.text };
    }
    return { action: "추가", adopted: draft.elements.some((e) => e.text === s.text && hasLink(draft, "elementIdea", e.id, t)) };
  };

  const adopt = (pane: PaneKey, key: string) => {
    const st = suggest[pane];
    const s = st?.items.find((i) => i.key === key)?.s;
    if (!st || !s) return;
    const t = st.targetId;
    let next = draft;
    const ensureIdea = (x: IdeaSuggestion): string | null => {
      const found = next.ideas.find((i) => i.official?.catalogId === x.catalogId);
      if (found) return found.id;
      if (next.ideas.length >= LIMITS.ideas) return null;
      const idea: IdeaEntry = { id: newId("id"), official: { catalogId: x.catalogId, subject: x.subject, domain: x.domain, content: x.content }, revision: null, subject: x.subject, via: "ai" };
      next = { ...next, ideas: [...next.ideas, idea] };
      return idea.id;
    };
    if (s.type === "idea") {
      const ideaId = ensureIdea(s);
      if (!ideaId) return;
      next = st.direction === "element-ideas" ? addLink(next, "elementIdea", t, ideaId, "ai", s.reason) : addLink(next, "ideaStandard", ideaId, t, "ai", s.reason);
    } else if (s.type === "standard") {
      let std = next.standards.find((x) => x.id === s.code);
      if (!std) {
        if (next.standards.length >= LIMITS.standards) return;
        std = { id: s.code, code: s.code, subject: s.subject, domain: s.domain, content: s.content, note: "", via: "ai" };
        next = { ...next, standards: [...next.standards, std] };
      }
      next = addLink(next, "ideaStandard", t, std.id, "ai", s.reason);
    } else if (s.kind === "revise" && s.elementId) {
      next = addLink(setElementText(next, s.elementId, s.text), "elementIdea", s.elementId, t, "ai", s.reason);
    } else {
      if (next.elements.length >= LIMITS.elements) return;
      const el = { id: newId("el"), text: s.text, via: "ai" as const };
      next = addLink({ ...next, elements: [...next.elements, el] }, "elementIdea", el.id, t, "ai", s.reason);
    }
    change(next);
  };
  const ignore = (pane: PaneKey, key: string) =>
    setSuggest((st) => (st[pane] ? { ...st, [pane]: { ...st[pane]!, items: st[pane]!.items.map((i) => (i.key === key ? { ...i, ignored: true } : i)) } } : st));

  // ── 저장·반영 ─────────────────────────────────────────────────
  const save = async (next = draft) => {
    if (conflict) throw new Error("다른 창에서 진행 내용이 바뀌었습니다. 저장된 진행을 먼저 불러오세요.");
    const result = await post("/api/ideation/save", { lessonId, action: "save", draft: next, expectedDraft: props.saved ?? null });
    props.onCommitted(result.changes, false);
    setLocal(null); setBase(null); setMessage("진행 내용을 저장했습니다.");
  };
  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "처리 중 오류가 발생했습니다."); }
    finally { setBusy(null); }
  };
  const openPreview = () => run("preview", async () => {
    if (props.hasPendingCards()) throw new Error("수업 설계 카드가 저장 중입니다. 잠시 후 다시 시도하세요.");
    const current = draft;
    await save(current);
    setPreview(await post("/api/ideation/save", { lessonId, action: "preview", draft: current }));
  });
  const apply = () => run("apply", async () => {
    if (props.hasPendingCards()) throw new Error("수업 설계 카드가 저장 중입니다. 저장 후 미리보기를 다시 열어 주세요.");
    const result = await post("/api/ideation/save", { lessonId, action: "apply", draft, before: preview!.before });
    setPreview(null); setLocal(null); setBase(null);
    props.onCommitted(result.changes, true);
  });

  // ── 보조 효과 ─────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    fetch("/standard/ideas.json").then((r) => r.json()).then((data) => { if (alive) setSubjects(Object.keys(data)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // 예전 형식에서 옮겨 온 성취기준은 코드만 있다 — 원문을 불러와 보여 준다 (저장할 때는 서버가 채운다)
  useEffect(() => {
    const missing = draft.standards.filter((s) => !s.content && !enrichTried.current.has(s.code)).map((s) => s.code);
    if (!missing.length) return;
    missing.forEach((c) => enrichTried.current.add(c));
    let alive = true;
    Promise.all(missing.map((code) => fetch(`/api/standards?q=${encodeURIComponent(code)}&limit=5`)
      .then((r) => r.json()).then((list: { code: string; subject: string; domain: string; content: string }[]) => list.find((x) => x.code === code) ?? null).catch(() => null)))
      .then((found) => { if (alive) setEnrich((prev) => ({ ...prev, ...Object.fromEntries(found.flatMap((f) => (f ? [[f.code, { subject: f.subject, domain: f.domain, content: f.content }]] : []))) })); });
    return () => { alive = false; };
  }, [draft.standards]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!conditionsOpen) return;
    const close = (e: MouseEvent) => { if (!conditionsRef.current?.contains(e.target as Node)) setConditionsOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [conditionsOpen]);
  useEffect(() => {
    if (!preview) return;
    previewRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { e.preventDefault(); setPreview(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, busy]);

  // Minerva AI 채팅이 아이디어 도출 맥락을 알 수 있게 — 아직 수업 설계에 반영하지 않은 탐색 내용
  const contextText = useMemo(() => {
    const ideaName = (id: string) => { const i = draft.ideas.find((x) => x.id === id); return i ? ideaText(i) : ""; };
    return [
      "현재 작업: 아이디어 도출. 아직 수업 설계에 반영하지 않은 탐색 내용입니다.",
      `조건: 교과 ${draft.conditions.subjects.join(", ") || "미정"} · 학년 ${draft.conditions.grade || "미정"}`,
      `주제: ${draft.topic || "(미작성)"}`,
      `하위요소: ${draft.elements.map((e) => e.text).filter(Boolean).join(" / ") || "(없음)"}`,
      `핵심아이디어: ${draft.ideas.map((i) => `${ideaSubject(i)} ${ideaText(i)}`).join(" / ") || "(없음)"}`,
      `성취기준: ${draft.standards.map((s) => s.code).join(", ") || "(없음)"}`,
      ...draft.elementIdeaLinks.map((l) => `연결: ${draft.elements.find((e) => e.id === l.from)?.text ?? ""} ↔ ${ideaName(l.to)}`),
      ...draft.ideaStandardLinks.map((l) => `연결: ${ideaName(l.from)} ↔ ${draft.standards.find((s) => s.id === l.to)?.code ?? ""}`),
    ].join("\n");
  }, [draft]);
  useEffect(() => { onContext(contextText); }, [contextText, onContext]);

  // ── 화면 ──────────────────────────────────────────────────────
  const tone = (id: string) => (sel?.id === id ? "border-transparent bg-white ring-2 ring-[#D1260F]"
    : rel.strong.has(id) ? "border-[#F5B8A8] bg-[#FFF8F6]"
      : rel.soft.has(id) ? "border-[#FBE3DC] bg-[#FFFCFB]" : "border-[#e2e4ea] bg-white");

  const linkSelect = (options: { id: string; label: string }[], onPick: (id: string) => void) => isHost && options.length > 0 && (
    <select value="" disabled={readonly} onClick={(e) => e.stopPropagation()} onChange={(e) => { if (e.target.value) onPick(e.target.value); }}
      className="h-6 max-w-[10rem] cursor-pointer rounded-full border border-dashed border-[#dde3eb] bg-white px-2 text-[11.5px] text-[#757b82] outline-none hover:border-[#D1260F] disabled:opacity-50">
      <option value="">+ 연결</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
  const reviewLabel = (show: boolean) => show && <p className="w-full text-[11px] font-semibold text-amber-700">다시 검토할 연결</p>;

  const paneHint = (pane: PaneKey) => hint[pane] && <p className="text-[12.5px] text-[#A81A08]">{hint[pane]}</p>;
  const panePanel = (pane: PaneKey) => suggest[pane] && (
    <SuggestPanel
      state={suggest[pane]!}
      view={suggestView(suggest[pane]!)}
      readonly={readonly}
      onAdopt={(key) => adopt(pane, key)}
      onIgnore={(key) => ignore(pane, key)}
      onCancel={() => closeSuggest(pane)}
      onRetry={() => runSuggest(pane, suggest[pane]!.direction, { id: suggest[pane]!.targetId, label: suggest[pane]!.targetLabel })}
      onClose={() => closeSuggest(pane)}
    />
  );
  const aiButton = (pane: PaneKey, direction: SuggestDirection) => (
    <button type="button" className={aiBtn} disabled={readonly || suggest[pane]?.status === "loading"} onClick={() => runSuggest(pane, direction)}>
      with AI · {DIRECTION_LABEL[direction]}
    </button>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#f8f9fd] text-[#2d3339]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e2e4ea] bg-white px-5 py-2.5">
        <h1 className="text-[17px] font-bold">아이디어 도출</h1>
        <span className="text-[12px] text-[#757b82]">{dirty ? "저장하지 않은 변경" : saved ? "저장된 진행" : "새 탐색"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="relative" ref={conditionsRef}>
            <button type="button" className={btn} aria-expanded={conditionsOpen} onClick={() => setConditionsOpen((v) => !v)}>조건</button>
            {conditionsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-[#e2e4ea] bg-white p-3 shadow-lg">
                <p className="mb-1.5 text-[12px] font-semibold text-[#757b82]">교과</p>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((s) => {
                    const on = draft.conditions.subjects.includes(s);
                    return (
                      <button key={s} type="button" aria-pressed={on} disabled={readonly}
                        onClick={() => change({ ...draft, conditions: { ...draft.conditions, subjects: on ? draft.conditions.subjects.filter((x) => x !== s) : [...draft.conditions.subjects, s] } })}
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition disabled:opacity-60 ${on ? "border-[#D1260F] bg-[#FFF1ED] font-semibold text-[#D1260F]" : "border-[#e2e4ea] text-[#5a6066] hover:border-[#F5B8A8]"}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-[12px] font-semibold text-[#757b82]">학년</span>
                  <input className={field} maxLength={60} disabled={readonly} value={draft.conditions.grade}
                    onChange={(e) => change({ ...draft, conditions: { ...draft.conditions, grade: e.target.value } })} />
                </label>
              </div>
            )}
          </div>
          <button type="button" className={btn} onClick={props.onToggleChat}>{props.chatOpen ? "채팅 접기" : "AI·팀 채팅 열기"}</button>
          {isHost && (
            <>
              <button type="button" className={btn} disabled={readonly || conflict} onClick={() => run("save", () => save())}>진행 저장</button>
              <button type="button" className={primaryBtn} disabled={readonly || conflict} onClick={openPreview}>{busy === "preview" ? "변경 내용 확인 중…" : "수업 설계에 반영"}</button>
            </>
          )}
        </div>
      </header>

      {(error || message || conflict) && (
        <div aria-live="polite" className="shrink-0 space-y-1 border-b border-[#e2e4ea] bg-white px-5 py-2 text-[13px]">
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {message && <p className="text-emerald-700">{message}</p>}
          {conflict && (
            <p className="text-amber-800">
              다른 창에서 진행이 변경되었습니다.{" "}
              <button type="button" className="font-semibold underline" disabled={!!busy} onClick={() => { setLocal(null); setBase(null); setPreview(null); }}>내 변경을 버리고 저장된 진행 불러오기</button>
              {" · "}
              <button type="button" className="font-semibold underline" disabled={!!busy} onClick={() => setBase(stableStringify(saved))}>내 변경 유지</button>
            </p>
          )}
        </div>
      )}

      {/* 좁은 화면: 행이 내용만큼(auto-rows-max) 늘어나 페이지가 스크롤 / 넓은 화면: 한 행이 높이를 채우고 영역마다 스크롤 */}
      <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        {/* ── 주제 설계 ── */}
        <Pane title="주제 설계">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#757b82]">주제 제목</span>
            <input className={field} maxLength={LIMITS.topic} disabled={readonly} value={draft.topic} onChange={(e) => change({ ...draft, topic: e.target.value })} />
          </label>
          <p className="pt-1 text-[12px] font-semibold text-[#757b82]">하위요소</p>
          {draft.elements.map((el) => {
            const links = draft.elementIdeaLinks.filter((l) => l.from === el.id);
            const linked = new Set(links.map((l) => l.to));
            return (
              <div key={el.id} id={`ideation-${el.id}`} onClick={() => setSelection({ kind: "element", id: el.id })} className={`cursor-pointer rounded-xl border p-2 transition ${tone(el.id)}`}>
                <div className="flex items-center gap-1">
                  <input value={el.text} disabled={readonly} maxLength={LIMITS.element} autoFocus={focusId === el.id}
                    onFocus={() => setSelection({ kind: "element", id: el.id })}
                    onChange={(e) => change(setElementText(draft, el.id, e.target.value))}
                    className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-[14px] outline-none focus:bg-[#f1f4f9] disabled:opacity-100" />
                  {el.via === "ai" && <SourceBadge kind="ai" />}
                  {isHost && <IconBtn label="삭제" danger disabled={readonly} onClick={() => remove("element", el.id)}><XIcon /></IconBtn>}
                </div>
                {(links.length > 0 || isHost) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 px-1">
                    {reviewLabel(links.some((l) => l.review))}
                    {links.map((l) => (
                      <LinkChip key={l.id} label={ideaLabel(l.to)} title={l.reason || undefined} review={l.review}
                        onOpen={() => open("idea", l.to)}
                        onRemove={readonly ? undefined : () => change(removeLink(draft, "elementIdea", l.id))}
                        onConfirm={readonly ? undefined : () => change(confirmLink(draft, "elementIdea", l.id))} />
                    ))}
                    {linkSelect(draft.ideas.filter((i) => !linked.has(i.id)).map((i) => ({ id: i.id, label: ideaLabel(i.id) })), (ideaId) => change(addLink(draft, "elementIdea", el.id, ideaId)))}
                  </div>
                )}
              </div>
            );
          })}
          {isHost && <button type="button" className={btn} disabled={readonly || draft.elements.length >= LIMITS.elements} onClick={addElement}>+ 하위요소 추가</button>}
        </Pane>

        {/* ── 핵심아이디어 ── */}
        <Pane title="핵심아이디어" tools={isHost && (
          <>
            <button type="button" className={btn} disabled={readonly} onClick={() => setModal("ideas")}>핵심아이디어 검색</button>
            <button type="button" className={btn} disabled={readonly || draft.ideas.length >= LIMITS.ideas} onClick={addCustomIdea}>+ 직접 작성</button>
            {aiButton("ideas", "element-ideas")}
            {aiButton("ideas", "idea-elements")}
          </>
        )}>
          {paneHint("ideas")}
          {panePanel("ideas")}
          {draft.ideas.map((idea) => {
            const origin = ideaOrigin(idea);
            const elLinks = draft.elementIdeaLinks.filter((l) => l.to === idea.id);
            const stdLinks = draft.ideaStandardLinks.filter((l) => l.from === idea.id);
            const isEditing = editing?.kind === "idea" && editing.id === idea.id;
            return (
              <div key={idea.id} id={`ideation-${idea.id}`} onClick={() => setSelection({ kind: "idea", id: idea.id })} className={`cursor-pointer rounded-xl border p-2.5 transition ${tone(idea.id)}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SubjectBadge subject={ideaSubject(idea)} />
                  {idea.official && <span className="text-[11.5px] text-[#757b82]">{idea.official.domain}</span>}
                  <SourceBadge kind={origin === "official" ? "official" : "teacher"} />
                  {idea.via === "ai" && <SourceBadge kind="ai" />}
                  {isHost && !isEditing && (
                    <div className="ml-auto flex">
                      <IconBtn label="수정" disabled={readonly} onClick={() => setEditing({ kind: "idea", id: idea.id, text: ideaText(idea), subject: idea.subject })}><PencilIcon /></IconBtn>
                      <IconBtn label="삭제" danger disabled={readonly} onClick={() => remove("idea", idea.id)}><XIcon /></IconBtn>
                    </div>
                  )}
                </div>
                {isEditing ? (
                  <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    {!idea.official && (
                      <select className={field} value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })}>
                        <option value="">—</option>
                        {[...new Set([...draft.conditions.subjects, ...subjects])].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    <textarea autoFocus rows={3} maxLength={LIMITS.revision} className={field} value={editing.text}
                      onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancelEditing(); } }} />
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className={btn} onClick={saveEditing}>저장</button>
                      <button type="button" className={btn} onClick={cancelEditing}>취소</button>
                      {origin === "revised" && <button type="button" className={btn} onClick={() => { change(setIdeaText(draft, idea.id, idea.official!.content)); setEditing(null); }}>원문 복원</button>}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[13.5px] leading-relaxed">{ideaText(idea) || "—"}</p>
                )}
                {origin === "revised" && !isEditing && (
                  <details className="mt-1" onClick={(e) => e.stopPropagation()}>
                    <summary className="cursor-pointer text-[11.5px] text-[#757b82]">공식 원문</summary>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#757b82]">{idea.official!.content}</p>
                  </details>
                )}
                {(elLinks.length > 0 || stdLinks.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {reviewLabel([...elLinks, ...stdLinks].some((l) => l.review))}
                    {elLinks.map((l) => (
                      <LinkChip key={l.id} label={elementLabel(l.from)} title={l.reason || undefined} review={l.review}
                        onOpen={() => open("element", l.from)}
                        onRemove={readonly ? undefined : () => change(removeLink(draft, "elementIdea", l.id))}
                        onConfirm={readonly ? undefined : () => change(confirmLink(draft, "elementIdea", l.id))} />
                    ))}
                    {stdLinks.map((l) => (
                      <LinkChip key={l.id} label={<span className="font-mono">{stdById.get(l.to)?.code}</span>} title={l.reason || undefined} review={l.review}
                        onOpen={() => open("standard", l.to)}
                        onRemove={readonly ? undefined : () => change(removeLink(draft, "ideaStandard", l.id))}
                        onConfirm={readonly ? undefined : () => change(confirmLink(draft, "ideaStandard", l.id))} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Pane>

        {/* ── 성취기준 ── */}
        <Pane title="성취기준" tools={isHost && (
          <>
            <button type="button" className={btn} disabled={readonly} onClick={() => setModal("standards")}>성취기준 검색</button>
            {aiButton("standards", "idea-standards")}
            {aiButton("standards", "standard-ideas")}
          </>
        )}>
          {paneHint("standards")}
          {panePanel("standards")}
          {draft.standards.map((s) => {
            const links = draft.ideaStandardLinks.filter((l) => l.to === s.id);
            const linked = new Set(links.map((l) => l.from));
            const isEditing = editing?.kind === "note" && editing.id === s.id;
            const subject = s.subject || enrich[s.code]?.subject || "";
            return (
              <div key={s.id} id={`ideation-${s.id}`} onClick={() => setSelection({ kind: "standard", id: s.id })} className={`cursor-pointer rounded-xl border p-2.5 transition ${tone(s.id)}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SubjectBadge subject={subject} />
                  <CodeChip code={s.code} />
                  {s.via === "ai" && <SourceBadge kind="ai" />}
                  {isHost && !isEditing && (
                    <div className="ml-auto flex">
                      <IconBtn label="메모" disabled={readonly} onClick={() => setEditing({ kind: "note", id: s.id, text: s.note, subject: "" })}><PencilIcon /></IconBtn>
                      <IconBtn label="삭제" danger disabled={readonly} onClick={() => remove("standard", s.id)}><XIcon /></IconBtn>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed">{standardText(s)}</p>
                {isEditing ? (
                  <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <textarea autoFocus rows={2} maxLength={LIMITS.note} className={field} value={editing.text}
                      onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setEditing(null); } }} />
                    <div className="flex gap-1.5">
                      <button type="button" className={btn} onClick={saveEditing}>저장</button>
                      <button type="button" className={btn} onClick={() => setEditing(null)}>취소</button>
                    </div>
                  </div>
                ) : s.note && (
                  <p className="mt-1.5 rounded-lg bg-[#f8f9fd] px-2 py-1 text-[12.5px] leading-relaxed text-[#5a6066]">
                    <span className="mr-1 text-[11px] font-semibold text-[#757b82]">메모</span>{s.note}
                  </p>
                )}
                {(links.length > 0 || isHost) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {reviewLabel(links.some((l) => l.review))}
                    {links.map((l) => (
                      <LinkChip key={l.id} label={ideaLabel(l.from)} title={l.reason || undefined} review={l.review}
                        onOpen={() => open("idea", l.from)}
                        onRemove={readonly ? undefined : () => change(removeLink(draft, "ideaStandard", l.id))}
                        onConfirm={readonly ? undefined : () => change(confirmLink(draft, "ideaStandard", l.id))} />
                    ))}
                    {linkSelect(draft.ideas.filter((i) => !linked.has(i.id)).map((i) => ({ id: i.id, label: ideaLabel(i.id) })), (ideaId) => change(addLink(draft, "ideaStandard", ideaId, s.id)))}
                  </div>
                )}
              </div>
            );
          })}
        </Pane>
      </div>

      {modal === "ideas" && (
        <IdeasModal
          onClose={() => setModal(null)}
          selectedIdeas={draft.ideas.flatMap((i) => (i.official ? [{ id: i.official.catalogId, subject: i.official.subject, domain: i.official.domain, content: i.official.content }] : []))}
          onSelectionChange={applyIdeaPicks}
        />
      )}
      {modal === "standards" && (
        <StandardsModal
          onClose={() => setModal(null)}
          selectedStandards={draft.standards.map((s) => ({ code: s.code, subject: s.subject || enrich[s.code]?.subject || "", domain: s.domain || enrich[s.code]?.domain || "", content: standardText(s), keywords: [], explanation: "", grade_group: "" }))}
          onSelectionChange={applyStandardPicks}
        />
      )}

      {preview && (
        <div ref={previewRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ideation-preview-title" className="absolute inset-0 z-50 flex flex-col bg-[#f8f9fd] p-5">
          <h2 id="ideation-preview-title" className="text-lg font-bold">수업 설계에 반영할 내용</h2>
          <div className="my-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
            {(["A-2", "A-3", "A-4"] as const).filter((code) => code in preview.changes).map((code) => (
              <section key={code} className="rounded-xl border border-[#e2e4ea] bg-white p-4">
                <h3 className="font-bold">{code} · {({ "A-2": "주제 선정", "A-3": "성취기준 분석", "A-4": "교과 간 연계" })[code]}</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {(["before", "changes"] as const).map((side) => (
                    <div key={side}>
                      <h4 className="text-xs font-semibold text-[#757b82]">{side === "before" ? "현재 내용" : "반영 후"}</h4>
                      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-6">{previewText(code, preview[side][code])}</pre>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className={btn} disabled={!!busy} onClick={() => setPreview(null)}>돌아가기</button>
            <button type="button" className={primaryBtn} disabled={!!busy} onClick={apply}>{busy === "apply" ? "반영 중…" : "확인하고 수업 설계 시작"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
