import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('openai', () => ({ default: class {} }));

import { requestJson } from '@/lib/llmJson';

describe('Luna structured output', () => {
  it('streams strict JSON schema output into a parsed result', async () => {
    mocks.create.mockResolvedValue((async function* () {
      yield { type: 'response.output_text.delta', delta: '{"ok":' };
      yield { type: 'response.output_text.delta', delta: 'true}' };
    })());
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    const result = await requestJson({ responses: { create: mocks.create } } as never, {
      model: 'gpt-5.6-luna', maxTokens: 500, system: '지침', prompt: '입력', schema,
    });
    expect(result).toEqual({ ok: true, value: { ok: true } });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.6-luna', stream: true,
      text: { format: { type: 'json_schema', name: 'structured_result', strict: true, schema } },
    }));
  });
});
