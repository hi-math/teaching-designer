// URL 상태 공유·복원 (사양 §11.1)
// URLSearchParams 가 한글·대괄호를 encoding 한다. 위치·pin·panel 상태는 URL 에 넣지 않는다.

import { initialViewState } from "./reducer";
import type { GraphIndex } from "./selectors";
import {
  RELATION_TYPES,
  type GraphMode,
  type GraphViewState,
  type RelationType,
  type SubjectRelation,
  type Weight,
} from "./types";

/** 탐색기가 쓰는 query key — 그 밖의 key 는 건드리지 않는다 */
export const URL_KEYS = ["mode", "focus", "subject", "domain", "types", "w", "rel", "hop", "cmp", "hw", "hx", "dv"] as const;

const MODES: GraphMode[] = ["overview", "focus", "hierarchy", "table"];
const RELATIONS: SubjectRelation[] = ["all", "same", "cross"];
const DOMAIN_SEP = "::";

function parseWeight(value: string | null): Weight | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Weight) : undefined;
}

/** 기본값과 다른 항목만 기록한다 */
export function writeViewState(params: URLSearchParams, state: GraphViewState, datasetVersion: string): void {
  for (const key of URL_KEYS) params.delete(key);
  const d = initialViewState();
  if (state.mode !== "overview") params.set("mode", state.mode);
  if (state.focusNodeId) params.set("focus", state.focusNodeId);
  for (const s of state.filters.subjects) params.append("subject", s);
  for (const [s, dm] of state.filters.domains) params.append("domain", `${s}${DOMAIN_SEP}${dm}`);
  const types = state.filters.relationTypes;
  if (types.length !== RELATION_TYPES.length) params.set("types", types.length ? types.join(",") : "none");
  if (state.filters.minimumWeight !== d.filters.minimumWeight) params.set("w", String(state.filters.minimumWeight));
  if (state.filters.subjectRelation !== "all") params.set("rel", state.filters.subjectRelation);
  if (state.hops !== 1) params.set("hop", String(state.hops));
  for (const id of state.comparisonNodeIds) params.append("cmp", id);
  if (state.hierarchyMinimumWeight !== d.hierarchyMinimumWeight) params.set("hw", String(state.hierarchyMinimumWeight));
  if (state.hierarchyIncludeCrossSubject) params.set("hx", "1");
  params.set("dv", datasetVersion);
}

export function hasViewState(params: URLSearchParams): boolean {
  return URL_KEYS.some((k) => k !== "dv" && params.has(k));
}

export interface RestoreResult {
  state: GraphViewState;
  /** 찾을 수 없어 버린 항목 */
  missing: string[];
  /** URL 의 datasetVersion 이 현재 버전과 다르다 */
  versionChanged: string | null;
}

/** URL 을 읽어 데이터와 대조한 상태를 만든다. 잘못된 값은 기본값으로 되돌리고 알려 준다. */
export function readViewState(
  params: URLSearchParams,
  index: GraphIndex,
  datasetVersion: string,
  compact: boolean,
): RestoreResult {
  const state = initialViewState(compact);
  const missing: string[] = [];
  const knownCode = (raw: string): string | null => {
    const code = raw.normalize("NFC").trim();
    const withBrackets = code.startsWith("[") ? code : `[${code}]`;
    if (index.nodeById.has(withBrackets)) return withBrackets;
    missing.push(raw);
    return null;
  };

  const mode = params.get("mode");
  if (mode && MODES.includes(mode as GraphMode)) state.mode = mode as GraphMode;
  else if (mode) missing.push(`mode=${mode}`);

  const focus = params.get("focus");
  if (focus) {
    const id = knownCode(focus);
    state.focusNodeId = id;
    state.selectedNodeId = id;
  }
  if (state.mode === "focus" && !state.focusNodeId) state.mode = "overview";

  const subjects = new Set(index.subjects.map((s) => s.subject));
  for (const s of params.getAll("subject")) {
    if (subjects.has(s)) {
      if (!state.filters.subjects.includes(s)) state.filters.subjects.push(s);
    } else missing.push(s);
  }
  for (const raw of params.getAll("domain")) {
    const [s, dm] = raw.split(DOMAIN_SEP);
    const info = index.subjects.find((x) => x.subject === s);
    if (info && dm && info.domains.some((x) => x.domain === dm) && state.filters.subjects.includes(s)) {
      state.filters.domains.push([s, dm]);
    } else missing.push(raw);
  }

  const types = params.get("types");
  if (types !== null) {
    const list = types === "none" ? [] : types.split(",");
    const valid = list.filter((t): t is RelationType => (RELATION_TYPES as string[]).includes(t));
    if (valid.length !== list.length) missing.push(`types=${types}`);
    state.filters.relationTypes = RELATION_TYPES.filter((t) => valid.includes(t));
  }

  const w = params.get("w");
  if (w !== null) {
    const weight = parseWeight(w);
    if (weight) state.filters.minimumWeight = weight;
    else missing.push(`w=${w}`);
  }
  const rel = params.get("rel");
  if (rel !== null) {
    if (RELATIONS.includes(rel as SubjectRelation)) state.filters.subjectRelation = rel as SubjectRelation;
    else missing.push(`rel=${rel}`);
  }
  if (params.get("hop") === "2") state.hops = 2;

  for (const raw of params.getAll("cmp")) {
    const id = knownCode(raw);
    if (id && !state.comparisonNodeIds.includes(id)) state.comparisonNodeIds.push(id);
  }
  state.comparisonNodeIds = state.comparisonNodeIds.slice(-2);

  const hw = parseWeight(params.get("hw"));
  if (hw) state.hierarchyMinimumWeight = hw;
  if (params.get("hx") === "1") state.hierarchyIncludeCrossSubject = true;

  const dv = params.get("dv");
  return { state, missing, versionChanged: dv && dv !== datasetVersion ? dv : null };
}
