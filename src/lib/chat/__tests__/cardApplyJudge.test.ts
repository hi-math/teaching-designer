import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('@/lib/llmJson', () => ({ requestJson: mocks.json }));
vi.mock('openai', () => ({ default: class {} }));

import { POST } from '@/app/api/chat/card-apply/route';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHATGPT_API_KEY = 'test-key';
});

const post = (body: Record<string, unknown>) => POST(new Request('http://localhost/api/chat/card-apply', {
  method: 'POST', body: JSON.stringify({ code: 'A-1', label: '주제 선정 기준', ...body }),
}));
const promptSent = () => (mocks.json.mock.calls[0][1] as { prompt: string }).prompt;

describe('카드 반영 판정 맥락', () => {
  it('일반 답변은 교사의 질문을 함께 보고, 안내·예시는 반영하지 않도록 지시한다', async () => {
    mocks.json.mockResolvedValue({ ok: true, value: { applicable: false, fields: { criteria: null } } });
    const res = await post({ answer: '- 기준은 이렇게 쓰면 됩니다\n- 예: 학생 삶과 연결되는가', question: 'A-1 카드 작성법을 알려 주세요' });
    expect(await res.json()).toEqual({ applicable: false });
    const prompt = promptSent();
    expect(prompt).toContain('교사의 요청: A-1 카드 작성법을 알려 주세요');
    expect(prompt).toContain('만들거나 고쳐 달라고 요청했고');
    expect(prompt).toContain('안내 속의 예시("예:", "예시")는 산출물로 보지 않는다');
  });

  it('체크박스로 고른 항목은 교사가 고른 결과로 보고 반영한다', async () => {
    mocks.json.mockResolvedValue({ ok: true, value: { applicable: true, fields: { criteria: ['학생 삶과 연결되는가'] } } });
    const res = await post({ answer: '- 학생 삶과 연결되는가', picked: true });
    expect(await res.json()).toEqual({ applicable: true, fields: { criteria: ['학생 삶과 연결되는가'] } });
    const prompt = promptSent();
    expect(prompt).toContain('체크박스로 직접 고른 항목');
    expect(prompt).toContain('교사가 고른 항목:');
    expect(prompt).not.toContain('교사의 요청:');
  });
});
