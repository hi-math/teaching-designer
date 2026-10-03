import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('@/lib/llmJson', () => ({ requestJson: mocks.json }));
vi.mock('openai', () => ({ default: class {} }));

import { POST } from '@/app/api/chat/card-apply/route';
import { getCoreIdeas } from '@/lib/curriculumCatalog';
import { getStandards } from '@/lib/standards';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHATGPT_API_KEY = 'test-key';
});

const request = (answer: string) => new Request('http://localhost/api/chat/card-apply', {
  method: 'POST', body: JSON.stringify({ code: 'A-3', answer, relatedSubjects: '과학' }),
});

describe('A-3 catalog-only AI apply', () => {
  it('resolves recommended IDs to exact catalog records and editable selection metadata', async () => {
    const idea = getCoreIdeas().find(item => item.subject === '과학')!;
    const standard = getStandards()[0];
    mocks.json.mockResolvedValue({ ok: true, value: {
      applicable: true, ideaIds: [idea.id], standardCodes: [standard.code],
    } });
    const response = await POST(request(`추천: ${idea.content} ${standard.code} ${standard.content}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.selections.ideas).toEqual([idea]);
    expect(body.selections.standards[0]).toMatchObject({ code: standard.code, content: standard.content });
    expect(body.fields).toEqual({
      core_ideas: [{ subject: idea.subject, core_idea: idea.content }],
      achievement_standards: [{ subject: standard.subject, standard: `${standard.code} ${standard.content}` }],
    });
    expect(mocks.json).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      model: 'gpt-5.6-luna', schema: expect.objectContaining({ additionalProperties: false }),
    }));
  });

  it('rejects made-up IDs even if the model returns them', async () => {
    mocks.json.mockResolvedValue({ ok: true, value: {
      applicable: true, ideaIds: ['invented'], standardCodes: ['[made-up]'],
    } });
    const response = await POST(request('과학 성취기준과 핵심 아이디어를 추천합니다.'));
    expect(await response.json()).toEqual({ applicable: false });
  });

  it('does not apply valid catalog IDs that were absent from the answer', async () => {
    const idea = getCoreIdeas()[0];
    const standard = getStandards()[0];
    mocks.json.mockResolvedValue({ ok: true, value: {
      applicable: true, ideaIds: [idea.id], standardCodes: [standard.code],
    } });
    const response = await POST(request('일반적인 설명만 제공합니다.'));
    expect(await response.json()).toEqual({ applicable: false });
  });
});
