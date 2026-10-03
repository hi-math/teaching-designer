// 채팅관리에서 고르는 LLM 모델 목록 — 클라이언트(선택 UI)와 서버(API 라우트)가 함께 쓴다.
// 서버는 요청에 담긴 model 을 그대로 믿지 않고 이 목록에 있는지 확인한 뒤 쓴다.

export const LLM_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', feature: '가장 빠르고 저렴 · 간단한 안내·짧은 답변에 적합' },
  { id: 'claude-sonnet-5',           label: 'Sonnet 5',  feature: '속도와 품질의 균형 · 표·설계안 작성에 적합' },
  { id: 'claude-fable-5-1',          label: 'Fable 5.1', feature: '가장 정교한 추론 · 복잡한 설계 검토용, 느리고 비용이 높음' },
  { id: 'gpt-5.6-luna',              label: 'GPT-5.6 Luna', feature: 'OpenAI · 빠른 대화와 간단한 초안' },
  { id: 'gpt-5.6-terra',             label: 'GPT-5.6 Terra', feature: 'OpenAI · 속도와 품질의 균형' },
  { id: 'gpt-5.6-sol',               label: 'GPT-5.6 Sol', feature: 'OpenAI · 복잡한 수업 설계 검토' },
] as const;

export type LlmModelId = (typeof LLM_MODELS)[number]['id'];

export const DEFAULT_LLM_MODEL = 'claude-haiku-4-5-20251001' as const satisfies LlmModelId;

/** 목록에 없는 값이면 기본 모델로 */
export function resolveLlmModel(model: unknown): LlmModelId {
  return LLM_MODELS.some((m) => m.id === model) ? (model as LlmModelId) : DEFAULT_LLM_MODEL;
}

export function isOpenAiModel(model: LlmModelId): model is Extract<LlmModelId, `gpt-${string}`> {
  return model.startsWith('gpt-');
}

/** Claude 전용 기능에 GPT 선택값이 전달되어도 유효한 Claude 모델을 사용한다. */
export function resolveAnthropicModel(model: unknown): Extract<LlmModelId, `claude-${string}`> {
  const selected = resolveLlmModel(model);
  return isOpenAiModel(selected) ? DEFAULT_LLM_MODEL : selected as Extract<LlmModelId, `claude-${string}`>;
}

/** activity_contents 에 수업별 모델 설정을 저장하는 행 코드 */
export const LLM_MODEL_ROW = '__llm_model';
