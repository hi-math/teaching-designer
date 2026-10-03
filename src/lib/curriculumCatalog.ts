import fs from 'fs';
import path from 'path';
import { getStandards, scoreStandard, type Standard } from '@/lib/standards';
import type { IdeaItem } from '@/components/workspace/IdeasModal';

type IdeasJson = Record<string, Record<string, { order: number; 핵심아이디어: string[] }>>;
let ideasCache: IdeaItem[] | null = null;

export function getCoreIdeas(): IdeaItem[] {
  if (ideasCache) return ideasCache;
  const source = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'standard', 'ideas.json'), 'utf8')) as IdeasJson;
  ideasCache = Object.entries(source).flatMap(([subject, domains]) =>
    Object.entries(domains).flatMap(([domain, values]) =>
      (values['핵심아이디어'] ?? []).map((content, index) => ({
        id: `${subject}__${domain}__${index}`, subject, domain, content,
      })),
    ),
  );
  return ideasCache;
}

/** Keep exact codes and the most relevant catalog entries for the A-3 extraction request. */
export function standardCandidates(answer: string, relatedSubjects = '', limit = 100): Standard[] {
  const standards = getStandards();
  const codes = new Set([...answer.matchAll(/\[+([^\[\]\n]+)\]+/g)].map(match => `[${match[1].trim()}]`));
  const subjects = relatedSubjects.split(/[,/·\s]+/).filter(Boolean);
  const terms = answer.split(/[\s,.;:!?()[\]{}]+/).filter(term => term.length >= 2).slice(0, 80);
  const exact = standards.filter(item => codes.has(item.code));
  const ranked = standards
    .filter(item => !codes.has(item.code))
    .map(item => ({ item, score: scoreStandard(item, answer, terms) +
      (subjects.some(subject => item.subject === subject || item.subject_group === subject) ? 15 : 0) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.order - b.item.order)
    .slice(0, Math.max(0, limit - exact.length))
    .map(entry => entry.item);
  return [...exact, ...ranked].slice(0, limit);
}
