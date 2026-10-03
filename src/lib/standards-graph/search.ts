// 검색 index (사양 §5.2)
// 원문 필드는 건드리지 않고, 검색용 문자열만 따로 만든다.

import type { StandardNode } from "./types";

export type SearchField = "code" | "content" | "keywords" | "subject" | "domain";

export interface SearchDoc {
  id: string;
  code: string;
  /** 대괄호를 뺀 소문자 code */
  codeKey: string;
  content: string;
  keywords: string;
  subject: string;
  domain: string;
}

export interface SearchHit {
  id: string;
  /** 0 정확한 code · 1 code prefix · 2 본문·keywords · 3 교과·영역 */
  tier: 0 | 1 | 2 | 3;
  field: SearchField;
}

export interface SearchResult {
  query: string;
  terms: string[];
  total: number;
  hits: SearchHit[];
}

/** NFC → 공백 정리 → 소문자 */
export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function stripBrackets(value: string): string {
  return value.replace(/[[\]]/g, "");
}

export function buildSearchDocs(nodes: StandardNode[]): SearchDoc[] {
  return nodes.map((n) => ({
    id: n.id,
    code: n.code,
    codeKey: stripBrackets(normalizeText(n.code)),
    content: normalizeText(n.content ?? ""),
    keywords: normalizeText((n.keywords ?? []).join(" ")),
    subject: normalizeText(n.subject ?? ""),
    domain: normalizeText(n.domain ?? ""),
  }));
}

function matchTerm(doc: SearchDoc, term: string): SearchHit["tier"] | null {
  const codeTerm = stripBrackets(term);
  if (codeTerm && doc.codeKey === codeTerm) return 0;
  if (codeTerm && doc.codeKey.startsWith(codeTerm)) return 1;
  if ((codeTerm && doc.codeKey.includes(codeTerm)) || doc.content.includes(term) || doc.keywords.includes(term)) return 2;
  if (doc.subject.includes(term) || doc.domain.includes(term)) return 3;
  return null;
}

function fieldOf(doc: SearchDoc, term: string, tier: SearchHit["tier"]): SearchField {
  if (tier <= 1) return "code";
  if (tier === 2) {
    if (doc.content.includes(term)) return "content";
    if (doc.keywords.includes(term)) return "keywords";
    return "code";
  }
  return doc.subject.includes(term) ? "subject" : "domain";
}

/**
 * 여러 검색어는 AND. 정렬은 정확한 code → code prefix → 본문·keywords → 교과·영역, 같은 단계는 code 순.
 */
export function searchDocs(docs: SearchDoc[], query: string, limit: number): SearchResult {
  const normalized = normalizeText(query);
  const terms = normalized ? normalized.split(" ").filter(Boolean) : [];
  if (!terms.length) return { query, terms, total: 0, hits: [] };

  const scored: { hit: SearchHit; worst: number; sum: number; code: string }[] = [];
  for (const doc of docs) {
    let worst = 0;
    let sum = 0;
    let best: SearchHit["tier"] = 3;
    let bestTerm = terms[0];
    let ok = true;
    for (const term of terms) {
      const tier = matchTerm(doc, term);
      if (tier === null) {
        ok = false;
        break;
      }
      worst = Math.max(worst, tier);
      sum += tier;
      if (tier < best) {
        best = tier;
        bestTerm = term;
      }
    }
    if (!ok) continue;
    scored.push({
      hit: { id: doc.id, tier: worst as SearchHit["tier"], field: fieldOf(doc, bestTerm, best) },
      worst,
      sum,
      code: doc.code,
    });
  }

  scored.sort((a, b) => a.worst - b.worst || a.sum - b.sum || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { query, terms, total: scored.length, hits: scored.slice(0, limit).map((s) => s.hit) };
}
