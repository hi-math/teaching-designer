"use client";

import { createContext, useContext, type Dispatch } from "react";
import type { GraphAction } from "@/lib/standards-graph/reducer";
import type { GraphIndex, OverviewResult } from "@/lib/standards-graph/selectors";
import type { GraphViewState } from "@/lib/standards-graph/types";
import type { DataClient } from "@/lib/standards-graph/worker-client";

export type PanelSize = "wide" | "medium" | "narrow";

export interface ExplorerContextValue {
  index: GraphIndex;
  state: GraphViewState;
  dispatch: Dispatch<GraphAction>;
  client: DataClient;
  size: PanelSize;
  /** 현재 일반 filter 결과 (전체 보기·목록 공통) */
  overview: OverviewResult;
  /** 지금 Graph 에 그려진 성취기준 */
  displayed: Set<string>;
  /** 중심 탐색 "관계 더 보기" 단위 (desktop 30, mobile 15) */
  neighborStep: number;
  pinned: Set<string>;
  unpin: (id: string | null) => void;
  /** 선택한 성취기준으로 Graph 를 이동하고 상세로 focus 를 옮긴다 */
  revealNode: (id: string, opts?: { focusDetails?: boolean }) => void;
}

export const ExplorerContext = createContext<ExplorerContextValue | null>(null);

export function useExplorer(): ExplorerContextValue {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error("ExplorerContext 밖에서 사용했습니다.");
  return ctx;
}
