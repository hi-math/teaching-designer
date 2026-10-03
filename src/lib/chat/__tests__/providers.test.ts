import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '@/app/api/chat/route';
import { resolveAnthropicModel, resolveLlmModel } from '@/lib/llmModels';

const mocks = vi.hoisted(() => ({ openai: vi.fn(), anthropic: vi.fn() }));
vi.mock('openai', () => ({ default: class { responses = { create: mocks.openai }; } }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { stream: mocks.anthropic }; } }));
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
  process.env.ANTHROPIC_API_KEY = 'test-key';
  mocks.openai.mockResolvedValue((async function* () {
    yield { type: 'response.output_text.delta', delta: 'OpenAI ' };
    yield { type: 'response.output_text.delta', delta: '응답' };
  })());
  mocks.anthropic.mockImplementation(() => (async function* () {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Claude 응답' } };
  })());
});

describe('chat providers', () => {
  it('routes GPT models through Responses and preserves PDF input and streamed text', async () => {
    const response = await POST(request('gpt-5.6-terra', [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'cGRm' } },
      { type: 'text', text: '이 자료를 읽어 주세요' },
    ] }]));
    expect(await response.text()).toBe('OpenAI 응답');
    expect(mocks.anthropic).not.toHaveBeenCalled();
    expect(mocks.openai).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-terra', stream: true,
      input: [{ role: 'user', content: [
        { type: 'input_file', filename: 'reference-1.pdf', file_data: 'data:application/pdf;base64,cGRm', detail: 'low' },
        { type: 'input_text', text: '이 자료를 읽어 주세요' },
      ] }],
    }), expect.anything());
  });

  it('keeps Claude and unknown models on the Anthropic route', async () => {
    const response = await POST(request('unlisted-model', [{ role: 'user', content: '안녕하세요' }]));
    expect(await response.text()).toBe('Claude 응답');
    expect(mocks.anthropic).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5-20251001' }), expect.anything());
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(resolveLlmModel('gpt-5.6-sol')).toBe('gpt-5.6-sol');
    expect(resolveAnthropicModel('gpt-5.6-sol')).toBe('claude-haiku-4-5-20251001');
  });

  it('checks the key for the selected provider', async () => {
    delete process.env.CHATGPT_API_KEY;
    expect((await GET(new Request('http://localhost/api/chat?model=gpt-5.6-sol'))).status).toBe(503);
    expect((await GET(new Request('http://localhost/api/chat?model=claude-sonnet-5'))).status).toBe(200);
    expect((await POST(request('gpt-5.6-sol', [{ role: 'user', content: '안녕하세요' }]))).status).toBe(503);
  });
});
