// 화면 상태 reducer (사양 §11.1)
// 일반 화면 filter 와 학습 흐름 설정을 따로 두어 mode 를 오가도 각자 복원된다.

import {
  RELATION_TYPES,
  type GraphFilterState,
  type GraphMode,
  type GraphViewState,
  type LayoutMode,
  type RelationType,
  type SubjectRelation,
  type Weight,
} from "./types";

export const NEIGHBOR_STEP = { desktop: 30, compact: 15 } as const;
export const DEFAULT_HIERARCHY_DEPTH = 2;

export function defaultFilters(): GraphFilterState {
  return {
    subjects: [],
    domains: [],
    relationTypes: [...RELATION_TYPES],
    minimumWeight: 4,
    subjectRelation: "all",
  };
}

export function initialViewState(compact = false): GraphViewState {
  return {
    mode: "overview",
    filters: defaultFilters(),
    hierarchyMinimumWeight: 3,
    hierarchyIncludeCrossSubject: false,
    hierarchyDepth: DEFAULT_HIERARCHY_DEPTH,
    focusNodeId: null,
    selectedEdgeId: null,
    selectedNodeId: null,
    comparisonNodeIds: [],
    hops: 1,
    layoutMode: "subject",
    showNeighborEdges: false,
    neighborLimit: compact ? NEIGHBOR_STEP.compact : NEIGHBOR_STEP.desktop,
  };
}

export type GraphAction =
  | { type: "HYDRATE"; state: GraphViewState }
  | { type: "SET_MODE"; mode: GraphMode }
  | { type: "TOGGLE_SUBJECT"; subject: string }
  | { type: "SET_SUBJECTS"; subjects: string[] }
  | { type: "TOGGLE_DOMAIN"; subject: string; domain: string }
  | { type: "TOGGLE_TYPE"; relationType: RelationType }
  | { type: "SET_TYPES"; relationTypes: RelationType[] }
  | { type: "SET_MIN_WEIGHT"; weight: Weight }
  | { type: "SET_SUBJECT_RELATION"; relation: SubjectRelation }
  | { type: "RESET_FILTERS" }
  | { type: "SET_HIERARCHY_MIN_WEIGHT"; weight: Weight }
  | { type: "TOGGLE_HIERARCHY_CROSS" }
  | { type: "SET_HIERARCHY_DEPTH"; depth: number }
  | { type: "SELECT_NODE"; id: string | null }
  | { type: "SELECT_EDGE"; id: string | null }
  | { type: "FOCUS_NODE"; id: string; step: number }
  | { type: "SHOW_HIERARCHY"; id: string | null }
  | { type: "CLEAR_FOCUS" }
  | { type: "TOGGLE_COMPARE"; id: string }
  | { type: "CLEAR_COMPARE" }
  | { type: "SET_HOPS"; hops: 1 | 2 }
  | { type: "TOGGLE_NEIGHBOR_EDGES" }
  | { type: "MORE_NEIGHBORS"; step: number }
  | { type: "RESET_NEIGHBORS"; step: number }
  | { type: "SET_LAYOUT_MODE"; layoutMode: LayoutMode };

function withFilters(state: GraphViewState, patch: Partial<GraphFilterState>): GraphViewState {
  return { ...state, filters: { ...state.filters, ...patch } };
}

export function graphReducer(state: GraphViewState, action: GraphAction): GraphViewState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "TOGGLE_SUBJECT": {
      const on = state.filters.subjects.includes(action.subject);
      return withFilters(state, {
        subjects: on
          ? state.filters.subjects.filter((s) => s !== action.subject)
          : [...state.filters.subjects, action.subject],
        // 교과를 끄면 그 교과의 영역 선택도 지운다
        domains: on ? state.filters.domains.filter(([s]) => s !== action.subject) : state.filters.domains,
      });
    }

    case "SET_SUBJECTS": {
      const keep = new Set(action.subjects);
      return withFilters(state, {
        subjects: action.subjects,
        domains: state.filters.domains.filter(([s]) => keep.has(s)),
      });
    }

    case "TOGGLE_DOMAIN": {
      const has = state.filters.domains.some(([s, d]) => s === action.subject && d === action.domain);
      return withFilters(state, {
        domains: has
          ? state.filters.domains.filter(([s, d]) => !(s === action.subject && d === action.domain))
          : [...state.filters.domains, [action.subject, action.domain]],
      });
    }

    case "TOGGLE_TYPE": {
      const on = state.filters.relationTypes.includes(action.relationType);
      const next = on
        ? state.filters.relationTypes.filter((t) => t !== action.relationType)
        : RELATION_TYPES.filter((t) => t === action.relationType || state.filters.relationTypes.includes(t));
      return withFilters(state, { relationTypes: next });
    }

    case "SET_TYPES":
      return withFilters(state, { relationTypes: RELATION_TYPES.filter((t) => action.relationTypes.includes(t)) });

    case "SET_MIN_WEIGHT":
      return withFilters(state, { minimumWeight: action.weight });

    case "SET_SUBJECT_RELATION":
      return withFilters(state, { subjectRelation: action.relation });

    case "RESET_FILTERS":
      return { ...state, filters: defaultFilters() };

    case "SET_HIERARCHY_MIN_WEIGHT":
      return { ...state, hierarchyMinimumWeight: action.weight };

    case "TOGGLE_HIERARCHY_CROSS":
      return { ...state, hierarchyIncludeCrossSubject: !state.hierarchyIncludeCrossSubject };

    case "SET_HIERARCHY_DEPTH":
      return { ...state, hierarchyDepth: action.depth };

    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.id, selectedEdgeId: null };

    case "SELECT_EDGE":
      return { ...state, selectedEdgeId: action.id };

    case "FOCUS_NODE":
      return {
        ...state,
        mode: "focus",
        focusNodeId: action.id,
        selectedNodeId: action.id,
        selectedEdgeId: null,
        neighborLimit: action.step,
      };

    case "SHOW_HIERARCHY":
      return {
        ...state,
        mode: "hierarchy",
        focusNodeId: action.id,
        selectedNodeId: action.id ?? state.selectedNodeId,
        selectedEdgeId: null,
        hierarchyDepth: DEFAULT_HIERARCHY_DEPTH,
      };

    case "CLEAR_FOCUS":
      return {
        ...state,
        focusNodeId: null,
        mode: state.mode === "focus" ? "overview" : state.mode,
      };

    case "TOGGLE_COMPARE": {
      const ids = state.comparisonNodeIds;
      if (ids.includes(action.id)) return { ...state, comparisonNodeIds: ids.filter((id) => id !== action.id) };
      // 최대 2개 — 세 번째를 고르면 가장 먼저 고른 것을 뺀다
      return { ...state, comparisonNodeIds: [...ids, action.id].slice(-2) };
    }

    case "CLEAR_COMPARE":
      return { ...state, comparisonNodeIds: [] };

    case "SET_HOPS":
      return { ...state, hops: action.hops };

    case "TOGGLE_NEIGHBOR_EDGES":
      return { ...state, showNeighborEdges: !state.showNeighborEdges };

    case "MORE_NEIGHBORS":
      return { ...state, neighborLimit: state.neighborLimit + action.step };

    case "RESET_NEIGHBORS":
      return { ...state, neighborLimit: action.step };

    case "SET_LAYOUT_MODE":
      return { ...state, layoutMode: action.layoutMode };
  }
}
