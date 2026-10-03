import { describe, expect, it } from 'vitest';
import { cardRows, mergeSearchSelection } from '../selectionRows';

describe('A-3 card and search selection integration', () => {
  const toRow = (item: { subject: string; content: string }) => ({ subject: item.subject, core_idea: item.content });
  const empty = { subject: '', core_idea: '' };

  it('keeps AI and manually edited rows when a search selection changes', () => {
    const previous = [{ subject: '과학', content: '검색한 내용' }];
    const next = [{ subject: '사회', content: '새로 검색한 내용' }];
    const current = [
      { subject: '과학', core_idea: '검색한 내용' },
      { subject: '미술', core_idea: 'AI 추천을 교사가 수정한 내용' },
      { subject: '', core_idea: '' },
    ];
    expect(mergeSearchSelection(current, previous, next, toRow, empty)).toEqual([
      { subject: '미술', core_idea: 'AI 추천을 교사가 수정한 내용' },
      { subject: '사회', core_idea: '새로 검색한 내용' },
    ]);
  });

  it('does not duplicate an already entered result and preserves empty edit space', () => {
    const item = { subject: '과학', content: '내용' };
    expect(mergeSearchSelection([toRow(item)], [], [item], toRow, empty)).toEqual([toRow(item)]);
    expect(mergeSearchSelection([], [], [], toRow, empty)).toEqual([empty, empty]);
  });

  it('normalizes saved card rows for the manual editor', () => {
    expect(cardRows([{ subject: '과학', standard: '[9과01-01] 내용' }, null], 'standard'))
      .toEqual([{ subject: '과학', standard: '[9과01-01] 내용' }]);
  });
});
