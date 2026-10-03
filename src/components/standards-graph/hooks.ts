"use client";

import { useEffect, useState } from "react";

interface DetailsState<T> {
  key: string | null;
  data: T | null;
  error: string | null;
}

/** key 로 상세 원문을 요청한다. key 가 바뀌면 이전 응답은 버린다. */
export function useDetails<T>(key: string | null, load: (key: string) => Promise<T>): DetailsState<T> {
  const [state, setState] = useState<DetailsState<T>>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!key) return;
    let alive = true;
    load(key).then(
      (data) => alive && setState({ key, data, error: null }),
      (err: unknown) => alive && setState({ key, data: null, error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      alive = false;
    };
  }, [key, load]);
  return state.key === key ? state : { key, data: null, error: null };
}

const warned = new Set<string>();

/** catalog 에 없는 ID 는 식별자 자체를 보여 주고 콘솔에 한 번만 진단을 남긴다 */
export function catalogLabel(catalog: Record<string, string>, id: string, kind: string): string {
  const label = catalog[id];
  if (label) return label;
  const key = `${kind}:${id}`;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[standards-graph] ${kind} catalog 에 없는 ID: ${id}`);
  }
  return id;
}
