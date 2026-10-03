// 아이디어 도출 작업 공간 — 주제 설계 ↔ 핵심아이디어 ↔ 성취기준 (prompt/idea.md)
//
// 세 영역의 항목은 모두 안정적인 ID 를 갖고, 관계는 두 종류로 따로 저장한다.
//   하위요소 ↔ 핵심아이디어 (elementIdeaLinks: from = 하위요소 ID, to = 핵심아이디어 ID)
//   핵심아이디어 ↔ 성취기준 (ideaStandardLinks: from = 핵심아이디어 ID, to = 성취기준 ID)
// 배열 위치나 화면 순서를 연결 ID 로 쓰지 않는다.
// 공식 데이터의 원문(핵심아이디어 content, 성취기준 code·content)은 그대로 보관하고,
// 교사의 수정본·메모는 별도 필드에 둔다.

export const IDEATION_ROW = "__ideation";

/** 항목·연결이 어떻게 들어왔는지 — 교사가 직접 / AI 추천을 채택 */
export type Via = "manual" | "ai";

export interface IdeationConditions {
  subjects: string[];
  grade: string;
}

export interface TopicElement {
  id: string;
  text: string;
  via: Via;
}

/** 공식 핵심아이디어 원문 참조 — catalogId 는 ideas.json 의 `${교과}__${영역}__${순번}` */
export interface OfficialIdea {
  catalogId: string;
  subject: string;
  domain: string;
  content: string;
}

export interface IdeaEntry {
  id: string;
  /** 공식 데이터에서 고른 항목이면 원문 참조, 교사가 직접 작성한 항목이면 null */
  official: OfficialIdea | null;
  /** 교사 수정본(공식 항목) 또는 직접 작성한 문장. 공식 원문 그대로면 null */
  revision: string | null;
  /** 직접 작성한 항목의 교과 (공식 항목은 official.subject) */
  subject: string;
  via: Via;
}

export interface StandardEntry {
  /** 성취기준 코드 그대로 — 같은 기준을 두 번 담지 않는다 */
  id: string;
  code: string;
  subject: string;
  domain: string;
  /** 공식 원문 (서버가 저장할 때 데이터 원문으로 맞춘다) */
  content: string;
  /** 교사의 재진술·메모 — 원문과 분리 */
  note: string;
  via: Via;
}

export interface IdeationLink {
  id: string;
  from: string;
  to: string;
  via: Via;
  /** AI 가 제시한 관련 이유 — 공식 관계가 아니라 해석·제안 */
  reason: string;
  /** 한쪽 항목의 문장이 바뀌어 다시 검토할 연결 */
  review: boolean;
}

export interface IdeationDraft {
  schemaVersion: 2;
  dataVersion: string;
  conditions: IdeationConditions;
  topic: string;
  elements: TopicElement[];
  ideas: IdeaEntry[];
  standards: StandardEntry[];
  elementIdeaLinks: IdeationLink[];
  ideaStandardLinks: IdeationLink[];
}

export const LIMITS = {
  topic: 200, element: 300, revision: 1000, note: 1000, reason: 600,
  elements: 30, ideas: 40, standards: 40, links: 300, subjects: 20,
} as const;

export function newId(prefix: "el" | "id" | "ln"): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

/** 수업 설계 쪽 선택을 시작점으로 — 처음 여는 수업은 A-2 주제·선택한 핵심아이디어·성취기준을 가져온다 */
export function emptyDraft(
  conditions: IdeationConditions,
  seed: { topic?: string; ideas?: OfficialIdea[]; standards?: Omit<StandardEntry, "id" | "note" | "via">[] } = {},
): IdeationDraft {
  return {
    schemaVersion: 2,
    dataVersion: "",
    conditions: { subjects: [...new Set(conditions.subjects)], grade: conditions.grade },
    topic: (seed.topic ?? "").slice(0, LIMITS.topic),
    elements: [],
    ideas: uniqueBy(seed.ideas ?? [], (i) => i.catalogId).slice(0, LIMITS.ideas).map(({ catalogId, subject, domain, content }) => (
      { id: newId("id"), official: { catalogId, subject, domain, content }, revision: null, subject, via: "manual" })),
    standards: uniqueBy(seed.standards ?? [], (s) => s.code).slice(0, LIMITS.standards)
      .map(({ code, subject, domain, content }) => ({ id: code, code, subject, domain, content, note: "", via: "manual" })),
    elementIdeaLinks: [],
    ideaStandardLinks: [],
  };
}

// ─── 읽기·검증 (저장된 값은 믿지 않는다) ────────────────────────────

const isStr = (v: unknown, max = 5000): v is string => typeof v === "string" && v.length <= max;
const isId = (v: unknown): v is string => typeof v === "string" && /^[\w\-\[\]()가-힣·.]{1,64}$/.test(v);
const isVia = (v: unknown): v is Via => v === "manual" || v === "ai";

function readLinks(value: unknown, from: Set<string>, to: Set<string>): IdeationLink[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.links) return null;
  const out: IdeationLink[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const l = raw as IdeationLink;
    if (!l || !isId(l.id) || !isId(l.from) || !isId(l.to) || !isVia(l.via) || !isStr(l.reason, LIMITS.reason) || typeof l.review !== "boolean") return null;
    // 삭제된 항목에 남은 연결·중복 연결은 조용히 정리한다
    if (!from.has(l.from) || !to.has(l.to) || seen.has(`${l.from}|${l.to}`)) continue;
    seen.add(`${l.from}|${l.to}`);
    out.push({ id: l.id, from: l.from, to: l.to, via: l.via, reason: l.reason, review: l.review });
  }
  return out;
}

/** 저장된 `__ideation` → 화면에서 쓸 초안. 예전 형식(schemaVersion 1)은 변환하고, 깨진 값은 null */
export function readDraft(value: unknown): IdeationDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { schemaVersion?: unknown };
  if (v.schemaVersion === 1) return convertV1(value);
  if (v.schemaVersion !== 2) return null;
  const d = value as IdeationDraft;
  if (!d.conditions || !Array.isArray(d.conditions.subjects) || d.conditions.subjects.length > LIMITS.subjects ||
    !d.conditions.subjects.every((s) => isStr(s, 40)) || !isStr(d.conditions.grade, 60)) return null;
  if (!isStr(d.dataVersion, 100) || !isStr(d.topic, LIMITS.topic)) return null;
  if (!Array.isArray(d.elements) || d.elements.length > LIMITS.elements ||
    !d.elements.every((e) => e && isId(e.id) && isStr(e.text, LIMITS.element) && isVia(e.via))) return null;
  if (!Array.isArray(d.ideas) || d.ideas.length > LIMITS.ideas || !d.ideas.every((i) => i && isId(i.id) && isVia(i.via) &&
    isStr(i.subject, 40) && (i.revision === null || isStr(i.revision, LIMITS.revision)) &&
    (i.official === null || (i.official && isStr(i.official.catalogId, 120) && isStr(i.official.subject, 40) && isStr(i.official.domain, 80) && isStr(i.official.content, 2000))))) return null;
  if (!Array.isArray(d.standards) || d.standards.length > LIMITS.standards || !d.standards.every((s) => s && isId(s.id) && s.id === s.code &&
    isStr(s.subject, 40) && isStr(s.domain, 80) && isStr(s.content, 2000) && isStr(s.note, LIMITS.note) && isVia(s.via))) return null;
  const ids = [...d.elements.map((e) => e.id), ...d.ideas.map((i) => i.id), ...d.standards.map((s) => s.id)];
  if (new Set(ids).size !== ids.length) return null;
  const elementIdeaLinks = readLinks(d.elementIdeaLinks, new Set(d.elements.map((e) => e.id)), new Set(d.ideas.map((i) => i.id)));
  const ideaStandardLinks = readLinks(d.ideaStandardLinks, new Set(d.ideas.map((i) => i.id)), new Set(d.standards.map((s) => s.id)));
  if (!elementIdeaLinks || !ideaStandardLinks) return null;
  return {
    schemaVersion: 2, dataVersion: d.dataVersion,
    conditions: { subjects: [...new Set(d.conditions.subjects)], grade: d.conditions.grade },
    topic: d.topic,
    elements: d.elements.map((e) => ({ id: e.id, text: e.text, via: e.via })),
    ideas: d.ideas.map((i) => ({ id: i.id, official: i.official && { catalogId: i.official.catalogId, subject: i.official.subject, domain: i.official.domain, content: i.official.content }, revision: i.revision, subject: i.subject, via: i.via })),
    standards: d.standards.map((s) => ({ id: s.id, code: s.code, subject: s.subject, domain: s.domain, content: s.content, note: s.note, via: s.via })),
    elementIdeaLinks, ideaStandardLinks,
  };
}

/** 예전 단계형 초안(조건 → 출발 기준 → 후보 3개) — 고른 주제와 담은 성취기준만 옮긴다 */
function convertV1(value: unknown): IdeationDraft | null {
  const d = value as {
    conditions?: { subjects?: unknown; grade?: unknown };
    seedIds?: unknown; candidates?: unknown; selectedId?: unknown;
  };
  const subjects = Array.isArray(d.conditions?.subjects) ? d.conditions!.subjects.filter((s): s is string => isStr(s, 40)) : [];
  const grade = isStr(d.conditions?.grade, 60) ? d.conditions!.grade : "";
  const candidates = Array.isArray(d.candidates) ? d.candidates as { id?: unknown; title?: unknown; standardIds?: unknown; roles?: unknown }[] : [];
  const chosen = candidates.find((c) => c && c.id === d.selectedId);
  const seedIds = Array.isArray(d.seedIds) ? d.seedIds : [];
  const codes = [...new Set([...seedIds, ...(Array.isArray(chosen?.standardIds) ? chosen!.standardIds as unknown[] : [])])]
    .filter((c): c is string => isId(c) && /^\[.+\]$/.test(c)).slice(0, LIMITS.standards);
  // 예전 후보의 교과별 역할에서 기준의 교과를 알 수 있으면 함께 옮긴다 (원문은 저장할 때 서버가 채운다)
  const subjectOf = new Map<string, string>();
  for (const role of Array.isArray(chosen?.roles) ? chosen!.roles as { subject?: unknown; standardIds?: unknown }[] : []) {
    if (isStr(role?.subject, 40) && Array.isArray(role.standardIds)) for (const id of role.standardIds) if (typeof id === "string") subjectOf.set(id, role.subject);
  }
  return {
    schemaVersion: 2, dataVersion: "",
    conditions: { subjects: [...new Set(subjects)].slice(0, LIMITS.subjects), grade },
    topic: isStr(chosen?.title, LIMITS.topic) ? chosen!.title as string : "",
    elements: [], ideas: [],
    standards: codes.map((code) => ({ id: code, code, subject: subjectOf.get(code) ?? "", domain: "", content: "", note: "", via: "manual" })),
    elementIdeaLinks: [], ideaStandardLinks: [],
  };
}

// ─── 항목·연결 조작 (모두 새 초안을 돌려준다) ─────────────────────

export function ideaText(idea: IdeaEntry): string {
  return idea.revision ?? idea.official?.content ?? "";
}
export function ideaSubject(idea: IdeaEntry): string {
  return idea.official?.subject ?? idea.subject;
}
/** 공식 원문 그대로 / 교사가 수정 / 교사가 직접 작성 */
export function ideaOrigin(idea: IdeaEntry): "official" | "revised" | "custom" {
  if (!idea.official) return "custom";
  return idea.revision !== null && idea.revision !== idea.official.content ? "revised" : "official";
}

type LinkKind = "elementIdea" | "ideaStandard";
const linkKey = (kind: LinkKind) => (kind === "elementIdea" ? "elementIdeaLinks" : "ideaStandardLinks") as "elementIdeaLinks" | "ideaStandardLinks";

export function hasLink(d: IdeationDraft, kind: LinkKind, from: string, to: string): boolean {
  return d[linkKey(kind)].some((l) => l.from === from && l.to === to);
}

/** 이미 있으면 다시 검토 표시만 지운다 (같은 연결을 두 번 만들지 않는다) */
export function addLink(d: IdeationDraft, kind: LinkKind, from: string, to: string, via: Via = "manual", reason = ""): IdeationDraft {
  const key = linkKey(kind);
  if (d[key].some((l) => l.from === from && l.to === to)) {
    return { ...d, [key]: d[key].map((l) => (l.from === from && l.to === to ? { ...l, review: false } : l)) };
  }
  if (d[key].length >= LIMITS.links) return d;
  return { ...d, [key]: [...d[key], { id: newId("ln"), from, to, via, reason: reason.slice(0, LIMITS.reason), review: false }] };
}

/** 연결만 지운다 — 양쪽 항목은 남는다 */
export function removeLink(d: IdeationDraft, kind: LinkKind, linkId: string): IdeationDraft {
  const key = linkKey(kind);
  return { ...d, [key]: d[key].filter((l) => l.id !== linkId) };
}

export function confirmLink(d: IdeationDraft, kind: LinkKind, linkId: string): IdeationDraft {
  const key = linkKey(kind);
  return { ...d, [key]: d[key].map((l) => (l.id === linkId ? { ...l, review: false } : l)) };
}

/** 항목을 지우면 그 항목에 달린 연결도 함께 정리한다 */
export function removeItem(d: IdeationDraft, kind: "element" | "idea" | "standard", id: string): IdeationDraft {
  if (kind === "element") {
    return { ...d, elements: d.elements.filter((e) => e.id !== id), elementIdeaLinks: d.elementIdeaLinks.filter((l) => l.from !== id) };
  }
  if (kind === "idea") {
    return {
      ...d, ideas: d.ideas.filter((i) => i.id !== id),
      elementIdeaLinks: d.elementIdeaLinks.filter((l) => l.to !== id),
      ideaStandardLinks: d.ideaStandardLinks.filter((l) => l.from !== id),
    };
  }
  return { ...d, standards: d.standards.filter((s) => s.id !== id), ideaStandardLinks: d.ideaStandardLinks.filter((l) => l.to !== id) };
}

/** 문장이 바뀐 항목의 연결은 지우지 않고 "다시 검토할 연결"로 표시한다 */
export function markReview(d: IdeationDraft, kind: "element" | "idea", id: string): IdeationDraft {
  if (kind === "element") {
    return { ...d, elementIdeaLinks: d.elementIdeaLinks.map((l) => (l.from === id ? { ...l, review: true } : l)) };
  }
  return {
    ...d,
    elementIdeaLinks: d.elementIdeaLinks.map((l) => (l.to === id ? { ...l, review: true } : l)),
    ideaStandardLinks: d.ideaStandardLinks.map((l) => (l.from === id ? { ...l, review: true } : l)),
  };
}

export function setElementText(d: IdeationDraft, id: string, text: string): IdeationDraft {
  const before = d.elements.find((e) => e.id === id);
  const value = text.slice(0, LIMITS.element);
  if (!before || before.text === value) return d;
  const next = { ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, text: value } : e)) };
  return before.text.trim() ? markReview(next, "element", id) : next;
}

/** 공식 항목은 수정본으로, 직접 작성한 항목은 문장 자체로 저장. 공식 원문과 같아지면 수정본을 지운다 */
export function setIdeaText(d: IdeationDraft, id: string, text: string): IdeationDraft {
  const before = d.ideas.find((i) => i.id === id);
  if (!before) return d;
  const value = text.slice(0, LIMITS.revision);
  const revision = before.official && value === before.official.content ? null : value;
  if (revision === before.revision) return d;
  const next = { ...d, ideas: d.ideas.map((i) => (i.id === id ? { ...i, revision } : i)) };
  return ideaText(before).trim() ? markReview(next, "idea", id) : next;
}

/** 선택한 항목과 직접 연결된 항목(strong), 한 단계 건너 연결된 항목(soft) */
export function relatedTo(d: IdeationDraft, kind: "element" | "idea" | "standard", id: string): { strong: Set<string>; soft: Set<string> } {
  const strong = new Set<string>();
  const soft = new Set<string>();
  if (kind === "element") {
    d.elementIdeaLinks.filter((l) => l.from === id).forEach((l) => strong.add(l.to));
    d.ideaStandardLinks.filter((l) => strong.has(l.from)).forEach((l) => soft.add(l.to));
  } else if (kind === "idea") {
    d.elementIdeaLinks.filter((l) => l.to === id).forEach((l) => strong.add(l.from));
    d.ideaStandardLinks.filter((l) => l.from === id).forEach((l) => strong.add(l.to));
  } else {
    d.ideaStandardLinks.filter((l) => l.to === id).forEach((l) => strong.add(l.from));
    d.elementIdeaLinks.filter((l) => strong.has(l.to)).forEach((l) => soft.add(l.from));
  }
  return { strong, soft };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(key(item)) ? false : (seen.add(key(item)), true)));
}
