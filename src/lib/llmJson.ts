import Anthropic from '@anthropic-ai/sdk';

// 카드에 바로 넣을 결과를 JSON 으로 받는 공통 요청.
// 도구 호출을 강제(tool_choice: tool)하면 Fable 5.1 처럼 이를 받지 않는 모델에서 400 이 나므로,
// 응답 형식 자체를 JSON schema 로 지정하는 구조화 출력(output_config.format)을 쓴다.
// 채팅관리에서 고를 수 있는 모델(Haiku 4.5 · Sonnet 5 · Fable 5.1)이 모두 지원한다.

export type JsonSchema = Record<string, unknown>;

export type JsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: 'refusal' | 'max_tokens' | 'parse' };

export async function requestJson(
  client: Anthropic,
  params: { model: string; maxTokens: number; system: string; prompt: string; schema: JsonSchema },
): Promise<JsonResult> {
  // 생각이 항상 켜진 모델은 답이 길고 느릴 수 있어 stream 으로 받아 HTTP 시간 초과를 피한다
  const message = await client.messages
    .stream({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      output_config: { format: { type: 'json_schema', schema: params.schema } },
      messages: [{ role: 'user', content: params.prompt }],
    })
    .finalMessage();

  if (message.stop_reason === 'refusal') return { ok: false, reason: 'refusal' };
  if (message.stop_reason === 'max_tokens') return { ok: false, reason: 'max_tokens' };

  // 생각(thinking) 블록은 건너뛰고 본문 텍스트만 읽는다
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'parse' };
  }
}

/** 실패 이유를 교사가 알아볼 수 있는 문장으로 바꾼다 */
export function describeJsonFailure(reason: 'refusal' | 'max_tokens' | 'parse', fallback: string): string {
  if (reason === 'refusal') return 'AI가 이 요청에 답하지 않았습니다. 입력 내용을 확인한 뒤 다시 시도하세요.';
  if (reason === 'max_tokens') return '결과가 길어 끝까지 만들지 못했습니다. 차시 수를 줄이거나 다시 시도하세요.';
  return fallback;
}

/** API 오류를 원인별 안내 문장으로 바꾼다 (상세 내용은 서버 로그에 남긴다) */
export function describeApiError(err: unknown, fallback: string): string {
  if (err instanceof Anthropic.RateLimitError) return 'AI 요청이 많아 잠시 처리하지 못했습니다. 잠시 후 다시 시도하세요.';
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return 'AI 서비스 인증에 문제가 있습니다. 관리자에게 알려 주세요.';
  }
  if (err instanceof Anthropic.APIConnectionError) return 'AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
  if (err instanceof Anthropic.APIError && (err.status === 529 || (err.status ?? 0) >= 500)) {
    return 'AI 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도하세요.';
  }
  return fallback;
}
