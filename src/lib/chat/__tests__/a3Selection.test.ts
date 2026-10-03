import { describe, expect, it } from 'vitest';
import { a3SelectionFields, mergeCatalogItems } from '@/lib/a3Selection';
import { getCoreIdeas, standardCandidates } from '@/lib/curriculumCatalog';
import { getStandards } from '@/lib/standards';

describe('A-3 manual and AI selections', () => {
  it('uses the same catalog records for selected items and displayed card rows', () => {
    const idea = getCoreIdeas()[0];
    const standard = getStandards()[0];
    expect(a3SelectionFields([idea], [standard])).toEqual({
      core_ideas: [{ subject: idea.subject, core_idea: idea.content }],
      achievement_standards: [{ subject: standard.subject, standard: `${standard.code} ${standard.content}` }],
    });
  });

  it('adds AI recommendations to manual selections without duplicates', () => {
    const [first, second] = getCoreIdeas();
    expect(mergeCatalogItems([first], [first, second], item => item.id)).toEqual([first, second]);
  });

  it('keeps an explicitly recommended catalog code even when it is late in the dataset', () => {
    const last = getStandards().at(-1)!;
    expect(standardCandidates(`추천 성취기준 ${last.code}`, '과학').some(item => item.code === last.code)).toBe(true);
  });
});
