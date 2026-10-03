// All AI features use the same model. Legacy saved choices resolve to Luna.
export const LLM_MODELS = [
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', feature: 'Minerva AI 채팅·주제 생성·초안 미리보기' },
] as const;

export type LlmModelId = (typeof LLM_MODELS)[number]['id'];
export const DEFAULT_LLM_MODEL: LlmModelId = 'gpt-5.6-luna';

export function resolveLlmModel(model: unknown): LlmModelId {
  if (model === DEFAULT_LLM_MODEL) return DEFAULT_LLM_MODEL;
  return DEFAULT_LLM_MODEL;
}

/** activity_contents 에 수업별 모델 설정을 저장하는 행 코드 */
export const LLM_MODEL_ROW = '__llm_model';
