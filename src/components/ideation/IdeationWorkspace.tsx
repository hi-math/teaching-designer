"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import IdeasModal, { type IdeaItem } from "@/components/workspace/IdeasModal";
import StandardsModal, { type StandardItem } from "@/components/workspace/StandardsModal";
import { stableStringify } from "@/components/workspace/remoteContent";
import type { ContentMap } from "@/lib/ideation/application";
import type { IdeaRec, RecommendFocus, Recommendations } from "@/app/api/ideation/route";
import { bracketCode } from "@/lib/standardCode";
import {
  IDEATION_ROW, LIMITS, addLink, applyFits, applyLinkVerdicts, linkEnds, clearFits, deletionAdvised, emptyDraft, ideaOrigin, ideaSubject, ideaText, keepItem, newId, readDraft,
  recommendBlocker, relatedTo, removeItem, setElementText,
  type Fit, type FitResult, type IdeaEntry, type LinkVerdict, type IdeationConditions, type IdeationDraft, type StandardEntry,
} from "@/lib/ideation/model";
import {
  CodeChip, FitAdvice, FitDot, IconBtn, Pane, RecError, RecQueue, SourceBadge, SparklesIcon, SpinnerIcon, SubjectBadge, XIcon,
  aiBtn, btn, field, primaryBtn, type RecItem,
} from "./ideationParts";
import IdeationLines from "./IdeationLines";

// 아이디어 도출 — 주제 설계 ↔ 핵심아이디어 ↔ 성취기준을 한 화면에서 함께 다룬다 (prompt/idea.md)
// 단계 전환 없이 세 영역이 항상 보이고, 연결은 영역 사이의 곡선(굵기 = 강도, 마우스를 올리면 설명)으로 보여 준다.
// 영역마다 with AI 하나 — 인접한 영역을 기준으로 그 영역에 포함되면 좋을 항목을 우선순위 큐로 추천하고,
// 그 영역 카드의 적합성을 판단해 오른쪽 위 점(녹색·노란색·빨간색)으로 보여 준다. 낮은 카드는 색을 바꿔 삭제를 추천한다.
// 판단이 없는 카드(새로 더했거나 문장·주제·조건이 바뀐 카드)는 잠시 뒤 자동으로 판단해 모든 카드에 점이 붙는다.
// 진행은 변경이 멈추고 잠시 뒤 자동 저장하고, 수업 설계에 반영은 비교 화면 없이 바로 반영한다.

export interface IdeationWorkspaceProps {
  lessonId: string;
  isHost: boolean;
  /** 추천에 쓰는 조건 — 수업 기본정보의 교과·학년 */
  defaults: IdeationConditions;
  /** 저장된 아이디어 도출이 없을 때 시작점 — A-2 주제와 수업 설계에서 고른 핵심아이디어·성취기준 */
  seed: { topic: string; ideas: IdeaItem[]; standards: StandardItem[] };
  saved: unknown;
  onCommitted: (changes: ContentMap, applied: boolean) => void;
  onContext: (text: string) => void;
  hasPendingCards: () => boolean;
}

type Kind = "element" | "idea" | "standard";
/** with AI 를 누른 영역 → 기준으로 삼는 인접 영역의 항목 종류 (선택한 항목이 이 종류면 그 항목을 기준으로) */
const ADJACENT: Record<RecommendFocus, Kind[]> = { topic: ["idea"], ideas: ["element", "standard"], standards: ["idea"] };
type Queues = { elements: RecItem[]; ideas: RecItem[]; standards: RecItem[] };
const FOCUS_QUEUE: Record<RecommendFocus, keyof Queues> = { topic: "elements", ideas: "ideas", standards: "standards" };
const EMPTY_QUEUES: Queues = { elements: [], ideas: [], standards: [] };

async function post(url: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const result = await response.json().catch(() => ({ error: "서버 응답을 확인하지 못했습니다. 다시 시도하세요." }));
  if (!response.ok) throw new Error(result.error ?? "요청에 실패했습니다.");
  return result;
}

export default function IdeationWorkspace(props: IdeationWorkspaceProps) {
  const { isHost, lessonId, onContext } = props;
  const saved = useMemo(() => readDraft(props.saved), [props.saved]);
  // 응답을 기다리는 사이 자동 저장으로 저장값이 바뀔 수 있다 — 비동기 응답은 렌더 당시가 아닌 지금의 저장값 위에 얹는다
  // (렌더 당시 값을 쓰면 그 사이 더한 카드가 사라진다)
  const savedRef = useRef(saved);
  useEffect(() => { savedRef.current = saved; }, [saved]);
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
  const [busy, setBusy] = useState<"apply" | null>(null);
  const [error, setError] = useState("");
  /** 자동 저장이 끝난 직후 상단 저장 상태 옆에 잠깐 보이는 안내 */
  const [savedNotice, setSavedNotice] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  /** 자동 저장에 실패한 초안 — 같은 초안으로는 다시 시도하지 않고, 바뀌면 다시 저장한다 */
  const autoSaveFailed = useRef<IdeationDraft | null>(null);
  const [modal, setModal] = useState<"ideas" | "standards" | null>(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  // with AI — 진행 상태는 누른 영역에, 추천은 종류별 큐로 각 영역에
  const [recRun, setRecRun] = useState<{ focus: RecommendFocus; targetId: string | null; status: "loading" | "error"; error?: string; blocked?: boolean } | null>(null);
  const [queues, setQueues] = useState<Queues>(EMPTY_QUEUES);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [enrich, setEnrich] = useState<Record<string, { subject: string; domain: string; content: string }>>({});
  const [judging, setJudging] = useState<Set<string>>(() => new Set());
  /** 자동 판단을 이미 요청한 카드 → 그때의 주제·조건·문장 (같은 상태로 다시 요청하지 않는다) */
  const fitAttempts = useRef(new Map<string, string>());
  const recController = useRef<AbortController | null>(null);
  // 연결선이 격자 요소를 붙은 뒤에 받도록 상태로 (ref 객체는 붙어도 다시 그리지 않는다)
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const enrichTried = useRef(new Set<string>());
  const conditionsRef = useRef<HTMLDivElement>(null);

  const readonly = !isHost || !!busy;
  const elementById = new Map(draft.elements.map((e) => [e.id, e]));
  const ideaById = new Map(draft.ideas.map((i) => [i.id, i]));
  const stdById = new Map(draft.standards.map((s) => [s.id, s]));
  const exists = (kind: Kind, id: string) => (kind === "element" ? elementById : kind === "idea" ? ideaById : stdById).has(id);
  const sel = selection && exists(selection.kind, selection.id) ? selection : null;
  const rel = sel ? relatedTo(draft, sel.kind, sel.id) : { strong: new Set<string>(), soft: new Set<string>() };

  const standardText = (s: StandardEntry) => s.content || enrich[s.code]?.content || "";

  // ── 변경 ──────────────────────────────────────────────────────
  const change = (next: IdeationDraft) => {
    if (!isHost || busy) return;
    if (!local) setBase(stableStringify(saved));
    setLocal(next); setSavedNotice(false); setError("");
    // 기준 영역이 비어 막혔던 안내는 내용이 바뀌면 지운다
    setRecRun((r) => (r?.blocked ? null : r));
  };
  const remove = (kind: Kind, id: string) => {
    change(removeItem(draft, kind, id));
    if (sel?.id === id) setSelection(null);
  };
  const addElement = () => {
    if (draft.elements.length >= LIMITS.elements) return;
    const el = { id: newId("el"), text: "", via: "manual" as const };
    change({ ...draft, elements: [...draft.elements, el] });
    setSelection({ kind: "element", id: el.id }); setFocusId(el.id);
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
  const runRecommend = async (focus: RecommendFocus, targetId?: string | null) => {
    // 기준이 될 인접 영역이 비어 있으면 누르는 단계에서 막는다
    const blocked = recommendBlocker(draft, focus);
    if (blocked) { setRecRun({ focus, targetId: null, status: "error", error: blocked, blocked: true }); return; }
    const target = targetId !== undefined ? targetId : sel && ADJACENT[focus].includes(sel.kind) ? sel.id : null;
    const basis = draft;
    recController.current?.abort();
    const controller = new AbortController();
    recController.current = controller;
    setRecRun({ focus, targetId: target, status: "loading" });
    try {
      const rec = await post("/api/ideation", { lessonId, focus, targetId: target, draft: basis }, controller.signal) as Recommendations;
      const stamp = Date.now();
      const items: RecItem[] = focus === "topic"
        ? [...(rec.topics ?? []).map((r, i): RecItem => ({ kind: "topic", key: `t${stamp}-${i}`, rec: r })), ...rec.elements.map((r, i): RecItem => ({ kind: "element", key: `e${stamp}-${i}`, rec: r }))]
        : focus === "ideas" ? rec.ideas.map((r, i) => ({ kind: "idea", key: `i${stamp}-${i}`, rec: r }))
          : rec.standards.map((r, i) => ({ kind: "standard", key: `s${stamp}-${i}`, rec: r }));
      setQueues((q) => ({ ...q, [FOCUS_QUEUE[focus]]: items }));
      applyFitResult(rec.fits ?? [], basis);
      setRecRun(null);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setRecRun({ focus, targetId: target, status: "error", error: e instanceof Error ? e.message : "추천 중 오류가 발생했습니다. 다시 시도하세요." });
    }
  };
  useEffect(() => () => recController.current?.abort(), []);
  // ── 적합성 자동 판단 ── 입력이 멈추고 잠시 뒤, 판단이 없는 카드와 다시 검토할 연결(한쪽 문장이 바뀐 연결)만
  const fitSignature = (text: string) => JSON.stringify([draft.topic, draft.conditions, text]);
  const unjudged: [string, string][] = !isHost || !draft.topic.trim() ? [] : [
    ...draft.elements.filter((e) => e.text.trim() && !e.fit).map((e): [string, string] => [e.id, fitSignature(e.text)]),
    ...draft.ideas.filter((i) => !i.fit).map((i): [string, string] => [i.id, fitSignature(ideaText(i))]),
    ...draft.standards.filter((s) => !s.fit).map((s): [string, string] => [s.id, fitSignature(s.code)]),
  ];
  const unsettled: [string, string][] = !isHost || !draft.topic.trim() ? [] : [
    ...draft.elementIdeaLinks.filter((l) => l.review).map((l): [string, string] => [l.id, fitSignature(linkEnds(draft, "elementIdea", l).join("|"))]),
    ...draft.ideaStandardLinks.filter((l) => l.review).map((l): [string, string] => [l.id, fitSignature(linkEnds(draft, "ideaStandard", l).join("|"))]),
  ];
  const unjudgedKey = [...unjudged, ...unsettled].map(([id, sig]) => `${id}${sig}`).join("|");
  const judgeFits = useEffectEvent(async (signal: AbortSignal) => {
    const todo = unjudged.filter(([id, sig]) => fitAttempts.current.get(id) !== sig);
    const linkTodo = unsettled.filter(([id, sig]) => fitAttempts.current.get(id) !== sig);
    if (!todo.length && !linkTodo.length) return;
    [...todo, ...linkTodo].forEach(([id, sig]) => fitAttempts.current.set(id, sig));
    const ids = todo.map(([id]) => id);
    const links = linkTodo.map(([id]) => id);
    const basis = draft;
    setJudging(new Set(ids));
    try {
      const result = await post("/api/ideation/fit", { lessonId, draft: basis, ids, links }, signal) as { fits: FitResult[]; links?: LinkVerdict[] };
      applyFitResult(result.fits ?? [], basis, result.links ?? []);
    } catch {
      // 입력이 이어져 취소된 판단은 다음에 다시 요청한다. 실패는 조용히 넘기고 문장이 바뀌거나 with AI 를 누르면 다시 판단한다
      if (signal.aborted) [...todo, ...linkTodo].forEach(([id, sig]) => { if (fitAttempts.current.get(id) === sig) fitAttempts.current.delete(id); });
    } finally {
      setJudging((cur) => new Set([...cur].filter((id) => !ids.includes(id))));
    }
  });
  useEffect(() => {
    if (!unjudgedKey || busy) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void judgeFits(controller.signal); }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [unjudgedKey, busy]);

  /** 기다리는 동안 바뀐 내용은 지키고, 요청 뒤 문장이 바뀐 카드의 판단·연결 판정은 버린다 */
  const applyFitResult = (fits: FitResult[], basis: IdeationDraft, links: LinkVerdict[] = []) => {
    if (!isHost || (!fits.length && !links.length)) return;
    setBase((b) => b ?? stableStringify(savedRef.current));
    setLocal((prev) => applyLinkVerdicts(applyFits(prev ?? savedRef.current ?? initial, fits, basis), links, basis));
  };

  const queueKey = (item: RecItem): keyof Queues => (item.kind === "element" || item.kind === "topic" ? "elements" : item.kind === "idea" ? "ideas" : "standards");
  const dropRec = (item: RecItem) => setQueues((q) => ({ ...q, [queueKey(item)]: q[queueKey(item)].filter((i) => i.key !== item.key) }));

  /** 추천 항목을 더하고, 추천이 가리킨 기존 항목과 강도·이유를 담아 잇는다 (가리킨 항목이 지워졌으면 잇지 않는다).
   *  새 카드의 적합성은 추천할 때 같은 기준으로 판단한 값을 그대로 쓴다 */
  const addRec = (item: RecItem) => {
    // 수업주제 후보는 하나만 고른다 — 수업주제 칸에 넣고 나머지 후보는 거둔다
    if (item.kind === "topic") {
      change(clearFits({ ...draft, topic: item.rec.text.slice(0, LIMITS.topic) }));
      setQueues((q) => ({ ...q, elements: [] }));
      return;
    }
    let next = draft;
    const fit: Fit = { score: item.rec.score, reason: item.rec.reason, kept: false };
    const ensureIdea = (x: IdeaRec): string | null => {
      const found = next.ideas.find((i) => i.official?.catalogId === x.catalogId);
      if (found) return found.id;
      if (next.ideas.length >= LIMITS.ideas) return null;
      const idea: IdeaEntry = { id: newId("id"), official: { catalogId: x.catalogId, subject: x.subject, domain: x.domain, content: x.content }, revision: null, subject: x.subject, via: "ai", fit };
      next = { ...next, ideas: [...next.ideas, idea] };
      return idea.id;
    };
    if (item.kind === "element") {
      if (next.elements.length >= LIMITS.elements) return;
      const el = { id: newId("el"), text: item.rec.text, via: "ai" as const, fit };
      next = { ...next, elements: [...next.elements, el] };
      if (item.rec.ideaId && ideaById.has(item.rec.ideaId)) next = addLink(next, "elementIdea", el.id, item.rec.ideaId, "ai", item.rec.reason, item.rec.strength);
    } else if (item.kind === "idea") {
      const ideaId = ensureIdea(item.rec);
      if (!ideaId) return;
      if (item.rec.elementId && elementById.has(item.rec.elementId)) next = addLink(next, "elementIdea", item.rec.elementId, ideaId, "ai", item.rec.reason, item.rec.strength);
      if (item.rec.standardId && stdById.has(item.rec.standardId)) next = addLink(next, "ideaStandard", ideaId, item.rec.standardId, "ai", item.rec.reason, item.rec.strength);
    } else {
      let std = next.standards.find((x) => x.id === item.rec.code);
      if (!std) {
        if (next.standards.length >= LIMITS.standards) return;
        std = { id: item.rec.code, code: item.rec.code, subject: item.rec.subject, domain: item.rec.domain, content: item.rec.content, note: "", via: "ai", fit };
        next = { ...next, standards: [...next.standards, std] };
      }
      if (item.rec.ideaId && ideaById.has(item.rec.ideaId)) next = addLink(next, "ideaStandard", item.rec.ideaId, std.id, "ai", item.rec.reason, item.rec.strength);
    }
    change(next);
    dropRec(item);
  };
  /** 추가하면 기존 항목과 이어지는 추천인지 — 큐에서 강도 막대를 보여 준다 */
  const recLinked = (item: RecItem): boolean => item.kind === "topic" ? false
    : item.kind === "idea"
      ? !!((item.rec.elementId && elementById.has(item.rec.elementId)) || (item.rec.standardId && stdById.has(item.rec.standardId)))
      : !!(item.rec.ideaId && ideaById.has(item.rec.ideaId));

  // ── 저장·반영 ─────────────────────────────────────────────────
  /** 저장 — 저장하는 동안 더 바뀐 내용은 화면에 남겨 다음 자동 저장에 맡긴다 */
  const persist = async (next: IdeationDraft) => {
    if (conflict) throw new Error("다른 창에서 진행 내용이 바뀌었습니다. 저장된 진행을 먼저 불러오세요.");
    const result = await post("/api/ideation/save", { lessonId, action: "save", draft: next, expectedDraft: props.saved ?? null });
    props.onCommitted(result.changes, false);
    const stored = readDraft((result.changes[IDEATION_ROW] as { fields?: unknown } | null)?.fields);
    setLocal((prev) => (prev === next ? null : prev));
    setBase(stored ? stableStringify(stored) : null);
  };
  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "처리 중 오류가 발생했습니다."); }
    finally { setBusy(null); }
  };
  // 바로 반영 — 저장하지 않은 변경은 먼저 저장해 다른 창의 변경과 겹치는지 확인한다
  const apply = () => run("apply", async () => {
    if (props.hasPendingCards()) throw new Error("수업 설계 카드가 저장 중입니다. 잠시 후 다시 시도하세요.");
    const current = draft;
    if (dirty) await persist(current);
    const result = await post("/api/ideation/save", { lessonId, action: "apply", draft: current });
    setLocal((prev) => (prev === current ? null : prev)); setBase(null);
    props.onCommitted(result.changes, true);
  });

  // 자동 저장 — 변경이 멈추고 잠시 뒤. 끝나면 상단 저장 상태 옆에 안내가 잠깐 보인다. 충돌·다른 작업 중에는 하지 않는다
  const autoSave = useEffectEvent(async () => {
    if (!isHost || !local || !dirty || conflict || busy || local === autoSaveFailed.current) return;
    const next = local;
    setAutoSaving(true);
    try {
      await persist(next);
      autoSaveFailed.current = null;
      setError("");
      setSavedNotice(true);
    } catch (e) {
      autoSaveFailed.current = next;
      setError(e instanceof Error ? e.message : "처리 중 오류가 발생했습니다.");
    } finally {
      setAutoSaving(false);
    }
  });
  useEffect(() => {
    if (!dirty || conflict || busy || autoSaving) return;
    const timer = setTimeout(() => { void autoSave(); }, 1500);
    return () => clearTimeout(timer);
  }, [local, dirty, conflict, busy, autoSaving]);
  useEffect(() => {
    if (!savedNotice) return;
    const timer = setTimeout(() => setSavedNotice(false), 3000);
    return () => clearTimeout(timer);
  }, [savedNotice]);

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
  // 선택한 카드는 테두리에 더해 카드 영역을 물들이고 바깥으로 은은한 빛, 직접 연결된 카드는 진한 테두리·배경과 얇은 빛,
  // 한 단계 건너 연결된 카드는 옅게
  const tone = (item: { id: string; fit?: Fit }) => {
    const advised = deletionAdvised(item);
    if (sel?.id === item.id) return `border-transparent ring-2 ring-[#D1260F] shadow-[0_0_0_6px_rgba(209,38,15,0.10),0_6px_18px_rgba(209,38,15,0.14)] ${advised ? "bg-[#f1f2f5]" : "bg-[#FFF1EC]"}`;
    if (advised) return "border-dashed border-[#c3c8d0] bg-[#f1f2f5]";
    return rel.strong.has(item.id) ? "border-[#EC9580] bg-[#FFF3EF] shadow-[0_0_0_3px_rgba(209,38,15,0.07)]"
      : rel.soft.has(item.id) ? "border-[#F6C3B5] bg-[#FFF8F5]" : "border-[#e2e4ea] bg-white";
  };
  /** 적합성이 낮은 카드의 삭제 추천 — 근거, 남기기(✓), 삭제 */
  const advice = (kind: Kind, item: { id: string; fit?: Fit }) => deletionAdvised(item) && item.fit && (
    <FitAdvice fit={item.fit}
      onKeep={readonly ? undefined : () => change(keepItem(draft, kind, item.id))}
      onDelete={readonly ? undefined : () => remove(kind, item.id)} />
  );


  /** with AI 를 누른 영역의 진행 상태 + 그 영역 종류의 추천 큐 */
  const recBlock = (focus: RecommendFocus, queue: keyof Queues) => (
    <>
      {recRun?.focus === focus && recRun.status === "error" && (
        <RecError error={recRun.error} onRetry={recRun.blocked ? undefined : () => runRecommend(recRun.focus, recRun.targetId)} />
      )}
      <RecQueue items={queues[queue]} linked={recLinked} readonly={readonly}
        onAdd={addRec} onIgnore={dropRec} onClose={() => setQueues((q) => ({ ...q, [queue]: [] }))} />
    </>
  );
  const aiButton = (focus: RecommendFocus) => (
    <button type="button" className={aiBtn} disabled={!!busy || recRun?.status === "loading"} onClick={() => runRecommend(focus)}>
      {recRun?.status === "loading" && recRun.focus === focus ? <SpinnerIcon /> : <SparklesIcon />}with AI
    </button>
  );
  // 선택한 항목과 그 연결 경로 — 연결선 강조
  const activeIds = sel ? new Set([sel.id, ...rel.strong, ...rel.soft]) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[#f8f9fd] text-[#2d3339]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e2e4ea] bg-white px-5 py-2.5">
        <h1 className="text-[17px] font-bold">아이디어 도출</h1>
        <span className="text-[12px] text-[#757b82]">{dirty ? "저장하지 않은 변경" : saved ? "저장된 진행" : "새 탐색"}</span>
        <span aria-live="polite" className="text-[12px] text-emerald-700">{savedNotice && !dirty && "진행 내용을 저장했습니다."}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="relative" ref={conditionsRef}>
            <button type="button" className={btn} aria-expanded={conditionsOpen} onClick={() => setConditionsOpen((v) => !v)}>수업 기본정보</button>
            {conditionsOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-xl border border-[#e2e4ea] bg-white p-3 shadow-lg">
                <p className="mb-1.5 text-[12px] font-semibold text-[#757b82]">교과</p>
                <div className="flex flex-wrap gap-1.5">
                  {subjects.map((s) => {
                    const on = draft.conditions.subjects.includes(s);
                    return (
                      <button key={s} type="button" aria-pressed={on} disabled={readonly}
                        onClick={() => change(clearFits({ ...draft, conditions: { ...draft.conditions, subjects: on ? draft.conditions.subjects.filter((x) => x !== s) : [...draft.conditions.subjects, s] } }))}
                        className={`rounded-full border px-2.5 py-1 text-[12px] transition disabled:opacity-60 ${on ? "border-[#D1260F] bg-[#FFF1ED] font-semibold text-[#D1260F]" : "border-[#e2e4ea] text-[#5a6066] hover:border-[#F5B8A8]"}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-[12px] font-semibold text-[#757b82]">학년</span>
                  <input className={field} maxLength={60} disabled={readonly} value={draft.conditions.grade}
                    onChange={(e) => change(clearFits({ ...draft, conditions: { ...draft.conditions, grade: e.target.value } }))} />
                </label>
              </div>
            )}
          </div>
          {isHost && <button type="button" className={primaryBtn} disabled={readonly || conflict || autoSaving} onClick={apply}>{busy === "apply" ? "반영 중…" : "수업 설계에 반영"}</button>}
        </div>
      </header>

      {(error || conflict) && (
        <div aria-live="polite" className="shrink-0 space-y-1 border-b border-[#e2e4ea] bg-white px-5 py-2 text-[13px]">
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {conflict && (
            <p className="text-amber-800">
              다른 창에서 진행이 변경되었습니다.{" "}
              <button type="button" className="font-semibold underline" disabled={!!busy} onClick={() => { setLocal(null); setBase(null); }}>내 변경을 버리고 저장된 진행 불러오기</button>
              {" · "}
              <button type="button" className="font-semibold underline" disabled={!!busy} onClick={() => setBase(stableStringify(saved))}>내 변경 유지</button>
            </p>
          )}
        </div>
      )}

      {/* 좁은 화면: 행이 내용만큼(auto-rows-max) 늘어나 페이지가 스크롤 / 넓은 화면: 한 행이 높이를 채우고 영역마다 스크롤 */}
      <div ref={setGridEl} className="relative grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:gap-10 lg:overflow-hidden">
        <IdeationLines container={gridEl} draft={draft} active={activeIds} />
        {/* ── 주제 설계 ── */}
        <Pane title="주제 설계"
          actions={isHost && <button type="button" className={btn} disabled={readonly || draft.elements.length >= LIMITS.elements} onClick={addElement}>+ 하위요소 추가</button>}
          tools={aiButton("topic")}>
          {recBlock("topic", "elements")}
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-[#757b82]">수업주제</span>
            <input className={field} maxLength={LIMITS.topic} disabled={readonly} value={draft.topic} onChange={(e) => change(clearFits({ ...draft, topic: e.target.value }))} />
          </label>
          <p className="pt-1 text-[12px] font-semibold text-[#757b82]">하위요소</p>
          {draft.elements.map((el) => {
            return (
              <div key={el.id} id={`ideation-${el.id}`} onClick={() => setSelection({ kind: "element", id: el.id })} className={`relative cursor-pointer rounded-xl border p-2 transition ${tone(el)}`}>
                <FitDot fit={el.fit} pending={judging.has(el.id)} />
                <div className="flex items-center gap-1">
                  <input value={el.text} disabled={readonly} maxLength={LIMITS.element} autoFocus={focusId === el.id}
                    onFocus={() => setSelection({ kind: "element", id: el.id })}
                    onChange={(e) => change(setElementText(draft, el.id, e.target.value))}
                    className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-[14px] outline-none focus:bg-white/80 disabled:opacity-100" />
                  {el.via === "ai" && <SourceBadge kind="ai" />}
                  {isHost && <IconBtn label="삭제" danger disabled={readonly} onClick={() => remove("element", el.id)}><XIcon /></IconBtn>}
                </div>
                {advice("element", el)}
              </div>
            );
          })}
        </Pane>

        {/* ── 핵심아이디어 ── */}
        <Pane title="핵심아이디어"
          actions={isHost && <button type="button" className={btn} disabled={readonly} onClick={() => setModal("ideas")}>핵심아이디어 추가</button>}
          tools={aiButton("ideas")}>
          {recBlock("ideas", "ideas")}
          {draft.ideas.map((idea) => {
            const origin = ideaOrigin(idea);
            return (
              <div key={idea.id} id={`ideation-${idea.id}`} onClick={() => setSelection({ kind: "idea", id: idea.id })} className={`relative cursor-pointer rounded-xl border p-2.5 transition ${tone(idea)}`}>
                <FitDot fit={idea.fit} pending={judging.has(idea.id)} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <SubjectBadge subject={ideaSubject(idea)} />
                  {idea.official && <span className="text-[11.5px] text-[#757b82]">{idea.official.domain}</span>}
                  {origin !== "official" && <SourceBadge kind="teacher" />}
                  {idea.via === "ai" && <SourceBadge kind="ai" />}
                  {isHost && (
                    <div className="ml-auto flex">
                      <IconBtn label="삭제" danger disabled={readonly} onClick={() => remove("idea", idea.id)}><XIcon /></IconBtn>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed">{ideaText(idea) || "—"}</p>
                {origin === "revised" && (
                  <details className="mt-1" onClick={(e) => e.stopPropagation()}>
                    <summary className="cursor-pointer text-[11.5px] text-[#757b82]">공식 원문</summary>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#757b82]">{idea.official!.content}</p>
                  </details>
                )}
                {advice("idea", idea)}
              </div>
            );
          })}
        </Pane>

        {/* ── 성취기준 ── */}
        <Pane title="성취기준"
          actions={isHost && <button type="button" className={btn} disabled={readonly} onClick={() => setModal("standards")}>성취기준 추가</button>}
          tools={aiButton("standards")}>
          {recBlock("standards", "standards")}
          {draft.standards.map((s) => {
            const subject = s.subject || enrich[s.code]?.subject || "";
            return (
              <div key={s.id} id={`ideation-${s.id}`} onClick={() => setSelection({ kind: "standard", id: s.id })} className={`relative cursor-pointer rounded-xl border p-2.5 transition ${tone(s)}`}>
                <FitDot fit={s.fit} pending={judging.has(s.id)} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <SubjectBadge subject={subject} />
                  <CodeChip code={s.code} />
                  {s.via === "ai" && <SourceBadge kind="ai" />}
                  {isHost && (
                    <div className="ml-auto flex">
                      <IconBtn label="삭제" danger disabled={readonly} onClick={() => remove("standard", s.id)}><XIcon /></IconBtn>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed">{standardText(s)}</p>
                {advice("standard", s)}
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
    </div>
  );
}
