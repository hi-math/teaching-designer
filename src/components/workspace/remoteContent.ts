// 다른 참여자가 저장한 activity_contents 행을 화면 상태에 반영할지 판단한다.
// WorkspaceShell 의 Realtime 핸들러가 쓰는 pure function — 상태 변경은 호출한 쪽이 한다.

import { LLM_MODEL_ROW } from "@/lib/llmModels";

export type ActivityStatus = "active" | "completed" | "skipped";

export type RemoteChange =
  | { kind: "ignore" }
  | { kind: "model"; model: unknown }
  | { kind: "selection"; code: "__selected_standards" | "__selected_ideas"; items: unknown[] }
  | {
      kind: "card";
      code: string;
      /** 완료·건너뛰기 상태 (편집 중이어도 반영한다) */
      status: ActivityStatus | null;
      /** 반영할 텍스트 — 내 저장의 에코이거나 내가 편집 중이면 없음 */
      text?: string;
      /** 반영할 구조화 카드 필드 — 내 저장의 에코이거나 내가 편집 중이면 없음 */
      fields?: Record<string, unknown>;
    };

/**
 * key 순서와 무관한 JSON 문자열.
 * Postgres jsonb 는 key 순서를 바꿔 돌려주므로, 내 저장의 에코인지 비교할 때 이것을 쓴다.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** 내가 마지막으로 저장한 내용을 비교용 문자열로 기록한다 (텍스트는 그대로, 구조화 필드는 stableStringify) */
export function localWriteKey(content: { text?: string; fields?: unknown }): string | undefined {
  if (content.fields !== undefined) return stableStringify(content.fields);
  return content.text;
}

const STATUSES: ActivityStatus[] = ["active", "completed", "skipped"];

export function readRemoteContent(
  code: string,
  content: unknown,
  local: {
    /** 내가 아직 저장하지 않은 편집이 있다 */
    pending: boolean;
    /** localWriteKey 로 기록한 내 마지막 저장 */
    lastWrite: string | undefined;
  },
): RemoteChange {
  // 의견묻기는 Broadcast 로 처리한다
  if (code.includes("__opinion")) return { kind: "ignore" };
  const c = (content ?? {}) as { type?: string; text?: unknown; fields?: unknown; status?: unknown; items?: unknown; model?: unknown };

  if (code === LLM_MODEL_ROW) return { kind: "model", model: c.model };
  if (code === "__selected_standards" || code === "__selected_ideas") {
    return Array.isArray(c.items) ? { kind: "selection", code, items: c.items } : { kind: "ignore" };
  }

  const status = STATUSES.includes(c.status as ActivityStatus) ? (c.status as ActivityStatus) : null;
  const change: RemoteChange = { kind: "card", code, status };
  // 내가 편집 중이면 내용은 덮어쓰지 않는다 — 곧 내 저장이 더 최신 내용으로 올라간다
  if (local.pending) return change;

  if (c.type === "structured" && c.fields && typeof c.fields === "object") {
    if (stableStringify(c.fields) !== local.lastWrite) change.fields = c.fields as Record<string, unknown>;
  } else if (typeof c.text === "string") {
    if (c.text !== local.lastWrite) change.text = c.text;
  }
  return change;
}
