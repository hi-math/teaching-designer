// Minerva AI 채팅은 채팅관리에서 고른 모델(Luna·Terra·Sol)을 쓴다.
// 초안 미리보기와 각종 판정(카드 반영 판정·주제 생성·지원 도구 등)은 선택과 무관하게 항상 Luna — TASK_LLM_MODEL.
export const LLM_MODELS = [
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', feature: '기본 모델 · 초안 미리보기와 각종 판정에도 사용' },
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', feature: 'Minerva AI 채팅에만 적용' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', feature: 'Minerva AI 채팅에만 적용' },
] as const;

export type LlmModelId = (typeof LLM_MODELS)[number]['id'];
export const DEFAULT_LLM_MODEL: LlmModelId = 'gpt-5.6-luna';

/** 초안 미리보기·각종 판정 — 채팅관리의 모델 선택과 무관하게 이 모델을 쓴다 */
export const TASK_LLM_MODEL: LlmModelId = 'gpt-5.6-luna';

/** 저장된 채팅 모델 값 → 목록에 있는 모델. 예전 값(Claude 등)이나 알 수 없는 값은 Luna */
export function resolveLlmModel(model: unknown): LlmModelId {
  return LLM_MODELS.find((m) => m.id === model)?.id ?? DEFAULT_LLM_MODEL;
}

/** activity_contents 에 수업별 모델 설정을 저장하는 행 코드 */
export const LLM_MODEL_ROW = '__llm_model';
