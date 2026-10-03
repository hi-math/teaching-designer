"use client";

// 코드·본문 검색 (사양 §5.2)
// 입력만으로는 Graph 를 다시 배치하지 않는다. 결과를 고를 때만 화면이 바뀐다.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SearchField, SearchResult } from "@/lib/standards-graph/search";
import { useExplorer } from "./context";
import { fmt } from "./text";
import { SubjectTag } from "./ui";

const PAGE = 20;
const FIELD_LABEL: Record<SearchField, string> = {
  code: "코드",
  content: "본문",
  keywords: "키워드",
  subject: "교과",
  domain: "영역",
};

export default function SearchBox() {
  const { client, index, overview, displayed, state, dispatch, revealNode, neighborStep } = useExplorer();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const q = query.trim();
  const inFilter = useMemo(() => new Set(overview.nodeIds), [overview]);
  const shown = q && result && result.query === q ? result : null;

  useEffect(() => {
    if (!q) return;
    const timer = setTimeout(() => {
      client
        .search(q, limit)
        .then((r) => {
          if (!r) return; // 더 새로운 검색이 시작됨
          setResult(r);
          setFailed(false);
        })
        .catch(() => setFailed(true));
    }, 150);
    return () => clearTimeout(timer);
  }, [q, limit, client]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (id: string) => {
    setOpen(false);
    if (displayed.has(id)) {
      dispatch({ type: "SELECT_NODE", id });
      revealNode(id, { focusDetails: true });
    } else if (state.mode === "hierarchy") {
      dispatch({ type: "SHOW_HIERARCHY", id });
      revealNode(id, { focusDetails: true });
    } else {
      dispatch({ type: "FOCUS_NODE", id, step: neighborStep });
      revealNode(id, { focusDetails: true });
    }
  };

  const hits = shown?.hits ?? [];
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(0, hits.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[active]) choose(hits[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const activeId = open && hits[active] ? `${listId}-${active}` : undefined;

  return (
    <div ref={boxRef} className="relative w-full max-w-[520px]">
      <div className="flex h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 focus-within:border-red-300 focus-within:ring-2 focus-within:ring-red-100">
        <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open && !!q}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label="성취기준 코드·본문 검색"
          placeholder="코드·본문 검색 (예: 9수01-01, 광합성)"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="text-gray-400 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && q && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          {!shown ? (
            <p className="px-4 py-3 text-[13px] text-gray-400">{failed ? "검색하지 못했습니다. 다시 입력해 보세요." : "검색 중…"}</p>
          ) : shown.total === 0 ? (
            <div className="px-4 py-3">
              <p className="text-[13px] text-gray-700">‘{q}’에 맞는 성취기준이 없습니다.</p>
              <p className="mt-0.5 text-[12px] text-gray-400">검색 범위: 전체 {fmt(index.nodes.length)}개 · 여러 검색어는 모두 포함된 기준만 찾습니다.</p>
              <button type="button" onClick={() => setQuery("")} className="mt-2 text-[12px] font-medium text-red-600 hover:underline">
                검색어 지우기
              </button>
            </div>
          ) : (
            <>
              <p className="border-b border-gray-100 px-4 py-2 text-[12px] text-gray-400" aria-live="polite">
                {fmt(shown.total)}개 중 {fmt(hits.length)}개 · 전체 {fmt(index.nodes.length)}개에서 검색
              </p>
              <ul id={listId} role="listbox" aria-label="검색 결과" className="max-h-[420px] overflow-y-auto py-1">
                {hits.map((h, i) => {
                  const n = index.nodeById.get(h.id)!;
                  const outside = !inFilter.has(h.id);
                  return (
                    <li
                      key={h.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(h.id)}
                      className={`cursor-pointer px-4 py-2.5 ${i === active ? "bg-red-50" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-gray-900">{n.code}</span>
                        <SubjectTag subject={n.subject} domain={n.domain} />
                        <span className="ml-auto shrink-0 text-[11px] text-gray-400">{FIELD_LABEL[h.field]} 일치</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5] text-gray-600">{n.preview}</p>
                      {outside && (
                        <p className="mt-1 text-[11px] font-medium text-amber-700">현재 filter 밖 · 선택하면 이 기준 중심으로 봅니다</p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {shown.total > hits.length && (
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE)}
                  className="w-full border-t border-gray-100 px-4 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  결과 더 보기 ({fmt(shown.total - hits.length)}개 남음)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
