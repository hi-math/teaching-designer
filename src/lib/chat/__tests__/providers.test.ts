import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/chat/route';
import { resolveLlmModel } from '@/lib/llmModels';
import { CHAT_STREAM_ERROR_MARKER, readChatStream } from '@/lib/chat/streamProtocol';

const mocks = vi.hoisted(() => ({ openai: vi.fn() }));
vi.mock('openai', () => ({ default: class { responses = { create: mocks.openai }; } }));
vi.mock('@/lib/prompts', () => ({
  loadSystemPrompt: () => '기본 지침',
  buildStableContextBlock: () => '고정 맥락',
  buildPageContextBlock: () => '현재 카드',
}));
vi.mock('@/lib/standards', () => ({ selectStandardCandidates: () => [] }));

const request = (model: string, messages: unknown[]) => new Request('http://localhost/api/chat', {
  method: 'POST', body: JSON.stringify({ model, messages, pageContext: { selectedActivityCode: 'T-1' } }),
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHATGPT_API_KEY = 'test-key';
  mocks.openai.mockResolvedValue((async function* () {
    yield { type: 'response.output_text.delta', delta: 'Luna ' };
    yield { type: 'response.output_text.delta', delta: '응답' };
  })());
});

describe('chat model', () => {
  it('uses Luna for legacy model choices and preserves PDF input and streamed text', async () => {
    const response = await POST(request('gpt-5.6-terra', [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'cGRm' } },
      { type: 'text', text: '이 자료를 읽어 주세요' },
    ] }]));
    expect(await response.text()).toBe('Luna 응답');
    expect(mocks.openai).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-luna', stream: true,
      input: [{ role: 'user', content: [
        { type: 'input_file', filename: 'reference-1.pdf', file_data: 'data:application/pdf;base64,cGRm', detail: 'low' },
        { type: 'input_text', text: '이 자료를 읽어 주세요' },
      ] }],
    }), expect.anything());
    expect(resolveLlmModel('claude-sonnet-5')).toBe('gpt-5.6-luna');
    expect(resolveLlmModel('gpt-5.6-sol')).toBe('gpt-5.6-luna');
  });

  it('requires the OpenAI key for all requests', async () => {
    delete process.env.CHATGPT_API_KEY;
    expect((await GET()).status).toBe(503);
    expect((await POST(request('claude-sonnet-5', [{ role: 'user', content: '안녕하세요' }]))).status).toBe(503);
  });

  it('sends an actionable error frame when credits run out during streaming', async () => {
    const error = Object.assign(new Error('You have no credits remaining'), {
      code: 'credit_balance_exhausted', headers: { secret: 'do-not-log' },
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.openai.mockResolvedValue((async function* () { throw error; })());
    const raw = await (await POST(request('gpt-5.6-luna', [{ role: 'user', content: '안녕하세요' }]))).text();
    expect(raw.startsWith(CHAT_STREAM_ERROR_MARKER)).toBe(true);
    expect(readChatStream(raw).error).toEqual(expect.objectContaining({ code: 'credit_balance_exhausted' }));
    expect(raw).not.toContain('do-not-log');
    expect(log).toHaveBeenCalledWith('[chat] stream error', { provider: 'openai', code: 'credit_balance_exhausted' });
    log.mockRestore();
  });

  it('returns billing guidance when OpenAI rejects before streaming', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.openai.mockRejectedValue(Object.assign(new Error('No credits'), { code: 'credit_balance_exhausted' }));
    const response = await POST(request('gpt-5.6-luna', [{ role: 'user', content: '안녕하세요' }]));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toEqual(expect.objectContaining({ code: 'credit_balance_exhausted' }));
    log.mockRestore();
  });

  it('keeps a partial terminal error frame out of visible chat text', () => {
    expect(readChatStream(`안녕하세요${CHAT_STREAM_ERROR_MARKER}{"message":`)).toEqual({ text: '안녕하세요', error: null });
  });
});
