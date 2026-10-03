import OpenAI from 'openai';
import { CARD_SCHEMAS, type FieldDef } from '@/components/workspace/cardSchemas';
import { requestJson } from '@/lib/llmJson';
import { DEFAULT_LLM_MODEL } from '@/lib/llmModels';

// Minerva AI 답변 → 활동 카드 반영 판정·추출
// 답변이 끝난 뒤 한 번 호출된다. 답변에 해당 카드에 그대로 옮겨 적을 산출물이 있으면
// 카드 입력 형식(CARD_SCHEMAS)에 맞춰 뽑아 돌려주고, 아니면 applicable=false.
// 판정도 다른 AI 기능과 동일한 모델을 사용한다.

/** 카드 필드 정의 → 구조화 출력 JSON 스키마 */
function fieldSchema(f: FieldDef): Record<string, unknown> {
  const description = f.label ?? f.placeholder ?? f.key;
  if (f.type === 'bullets') {
    return { type: 'array', description, items: { type: 'string' } };
  }
  if (f.type === 'choice') {
    return f.multiple
      ? { type: 'array', description: `${description} — 해당하는 것 모두`, items: { type: 'string', enum: f.options } }
      : { type: 'string', description: `${description} — 다음 중 하나`, enum: f.options };
  }
  if (f.type === 'table') {
    return {
      type: 'array',
      description: `${description} (표의 행 목록)`,
      items: {
        type: 'object',
        properties: Object.fromEntries(
          f.columns.map((c) => [
            c.key,
            {
              type: 'string',
              description: c.options ? `${c.label} — 다음 중 하나: ${c.options.join(', ')}` : c.label,
            },
          ]),
        ),
        required: f.columns.map((c) => c.key),
        additionalProperties: false,
      },
    };
  }
  return { type: 'string', description };
}

export async function POST(req: Request) {
  if (!process.env.CHATGPT_API_KEY) {
    return Response.json({ applicable: false }, { status: 503 });
  }

  const { code, label, answer, current } = (await req.json()) as {
    code?: string;
    label?: string;
    answer?: string;
    current?: Record<string, unknown>;
  };

  const schema = code ? CARD_SCHEMAS[code] : undefined;
  if (!schema || schema.fields.length === 0 || !answer?.trim()) {
    return Response.json({ applicable: false });
  }

  const responseSchema = {
    type: 'object',
    properties: {
      applicable: { type: 'boolean', description: '카드에 그대로 옮겨 적을 구체적 산출물이 답변에 있으면 true' },
      fields: {
        type: 'object',
        description: '답변에서 뽑은 카드 필드 값. 언급되지 않은 필드는 null.',
        properties: Object.fromEntries(schema.fields.map((f) => [f.key, { anyOf: [fieldSchema(f), { type: 'null' }] }])),
        required: schema.fields.map((f) => f.key),
        additionalProperties: false,
      },
    },
    required: ['applicable', 'fields'],
    additionalProperties: false,
  };

  const prompt = [
    `아래는 협력적 수업설계 도우미 Minerva AI 가 "${code} ${label ?? ''}" 카드에 대해 한 답변이다.`,
    '',
    '판정 기준:',
    '- 카드 필드에 그대로 옮겨 적을 수 있는 구체적 산출물(목록, 표의 행, 확정된 문장)이 있으면 applicable=true.',
    '- 인사, 사용법·진행 방법 안내, 질문만 하는 답변, 일반론적 설명은 applicable=false.',
    '- 한 문장만 받는 필드(예: 최종 주제, 통합 수업 목표)에 후보가 여럿 제시되고 팀이 아직 고르지 않았다면 그 필드는 넣지 않는다.',
    '- 답변에 없는 내용을 지어내지 않는다. 답변의 표현을 최대한 그대로 쓴다.',
    '',
    '현재 카드에 이미 들어 있는 값(참고용):',
    JSON.stringify(current ?? {}, null, 2).slice(0, 4000),
    '',
    '답변:',
    answer.slice(0, 12000),
    '',
    'JSON 형식으로만 답한다.',
  ].join('\n');

  try {
    const result = await requestJson(new OpenAI({ apiKey: process.env.CHATGPT_API_KEY }), {
      model: DEFAULT_LLM_MODEL,
      maxTokens: 4000,
      system: '답변을 카드 입력에 옮길 수 있는지 판정합니다. 입력된 답변만 근거로 값을 추출하고 모든 수학 용어는 영어로 표현합니다.',
      prompt,
      schema: responseSchema,
    });
    if (!result.ok) return Response.json({ applicable: false }, { status: 502 });
    const input = result.value as { applicable?: boolean; fields?: Record<string, unknown> } | undefined;

    // 스키마에 있는 필드만, 빈 값은 빼고 남긴다
    const fields: Record<string, unknown> = {};
    for (const f of schema.fields) {
      let v = input?.fields?.[f.key];
      // 보기 칸은 정해진 보기만 남긴다
      if (f.type === 'choice') {
        v = Array.isArray(v) ? v.filter((o) => f.options.includes(String(o))) : f.options.includes(String(v)) ? v : undefined;
      }
      if (typeof v === 'string' && v.trim()) fields[f.key] = v.trim();
      else if (Array.isArray(v) && v.length > 0) fields[f.key] = v;
    }

    const applicable = input?.applicable === true && Object.keys(fields).length > 0;
    return Response.json(applicable ? { applicable, fields } : { applicable: false });
  } catch (err) {
    console.error('[chat/card-apply] error:', err instanceof Error ? err.message : 'unknown');
    return Response.json({ applicable: false }, { status: 500 });
  }
}
