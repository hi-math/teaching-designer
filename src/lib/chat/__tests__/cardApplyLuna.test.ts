import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('@/lib/llmJson', () => ({ requestJson: mocks.json }));
vi.mock('openai', () => ({ default: class {} }));

import { POST } from '@/app/api/chat/card-apply/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHATGPT_API_KEY = 'test-key';
});

describe('AI card apply', () => {
  it('extracts editable A-3 rows with Luna structured output', async () => {
    mocks.json.mockResolvedValue({ ok: true, value: {
      applicable: true,
      fields: {
        core_ideas: [{ subject: '과학', core_idea: '수정 가능한 핵심 아이디어' }],
        achievement_standards: [{ subject: '과학', standard: '[9과01-01] 내용' }],
      },
    } });
    const response = await POST(new Request('http://localhost/api/chat/card-apply', {
      method: 'POST', body: JSON.stringify({ code: 'A-3', answer: '과학 핵심 아이디어와 성취기준을 제안합니다.' }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ applicable: true, fields: {
      core_ideas: [{ subject: '과학', core_idea: '수정 가능한 핵심 아이디어' }],
      achievement_standards: [{ subject: '과학', standard: '[9과01-01] 내용' }],
    } });
    expect(mocks.json).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      model: 'gpt-5.6-luna', schema: expect.objectContaining({ additionalProperties: false }),
    }));
  });
});
