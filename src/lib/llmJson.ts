import OpenAI from 'openai';

export type JsonSchema = Record<string, unknown>;
export type JsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'refusal' | 'max_tokens' | 'parse' };

export async function requestJson(
  client: OpenAI,
  params: { model: string; maxTokens: number; system: string; prompt: string; schema: JsonSchema },
): Promise<JsonResult> {
  const stream = await client.responses.create({
    model: params.model,
    instructions: params.system,
    input: params.prompt,
    stream: true,
    reasoning: { effort: 'low' },
    max_output_tokens: params.maxTokens,
    text: { format: { type: 'json_schema', name: 'structured_result', strict: true, schema: params.schema } },
  });

  let output = '';
  let refusal = false;
  let incomplete = false;
  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') output += event.delta;
    if (event.type === 'response.refusal.delta') refusal = true;
    if (event.type === 'response.incomplete') incomplete = true;
    if (event.type === 'response.failed') throw Object.assign(new Error(event.response.error?.message ?? 'AI response failed'), { code: event.response.error?.code });
  }
  if (refusal) return { ok: false, reason: 'refusal' };
  if (incomplete) return { ok: false, reason: 'max_tokens' };
  try { return { ok: true, value: JSON.parse(output) }; }
  catch { return { ok: false, reason: 'parse' }; }
}

export function describeJsonFailure(reason: 'refusal' | 'max_tokens' | 'parse', fallback: string): string {
  if (reason === 'refusal') return 'AI가 이 요청에 답하지 않았습니다. 입력 내용을 확인한 뒤 다시 시도하세요.';
  if (reason === 'max_tokens') return '결과가 길어 끝까지 만들지 못했습니다. 차시 수를 줄이거나 다시 시도하세요.';
  return fallback;
}

export function describeApiError(err: unknown, fallback: string): string {
  if (err instanceof OpenAI.RateLimitError) {
    const code = 'code' in err ? err.code : undefined;
    if (code === 'credit_balance_exhausted' || code === 'insufficient_quota') return 'OpenAI API 크레딧이 소진되었습니다. API Billing에서 잔액을 확인해 주세요.';
    return 'AI 요청이 많아 잠시 처리하지 못했습니다. 잠시 후 다시 시도하세요.';
  }
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) return 'AI 서비스 인증에 문제가 있습니다. 관리자에게 알려 주세요.';
  if (err instanceof OpenAI.APIConnectionError) return 'AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
  if (err instanceof OpenAI.APIError && (err.status ?? 0) >= 500) return 'AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도하세요.';
  return fallback;
}
