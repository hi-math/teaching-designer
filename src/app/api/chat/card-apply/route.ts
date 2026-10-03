import Anthropic from '@anthropic-ai/sdk';
import { CARD_SCHEMAS, type FieldDef } from '@/components/workspace/cardSchemas';

// Minerva AI 답변 → 활동 카드 반영 판정·추출
// 답변이 끝난 뒤 한 번 호출된다. 답변에 해당 카드에 그대로 옮겨 적을 산출물이 있으면
// 카드 입력 형식(CARD_SCHEMAS)에 맞춰 뽑아 돌려주고, 아니면 applicable=false.
// 판정은 가볍고 자주 불리므로 모델 설정과 무관하게 Haiku 를 쓴다.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-haiku-4-5-20251001';

/** 카드 필드 정의 → 도구 입력 JSON 스키마 */
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
      },
    };
  }
  return { type: 'string', description };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
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

  const tool: Anthropic.Tool = {
    name: 'submit_card',
    description: '답변을 카드에 반영할 수 있는지 판정하고, 가능하면 카드 필드 값을 제출한다.',
    input_schema: {
      type: 'object',
      properties: {
        applicable: { type: 'boolean', description: '카드에 그대로 옮겨 적을 구체적 산출물이 답변에 있으면 true' },
        fields: {
          type: 'object',
          description: '답변에서 뽑은 카드 필드 값. 답변이 다루는 필드만 넣는다.',
          properties: Object.fromEntries(schema.fields.map((f) => [f.key, fieldSchema(f)])),
        },
      },
      required: ['applicable'],
    },
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
    'submit_card 도구로만 답한다.',
  ].join('\n');

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: prompt }],
    });

    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const input = block?.input as { applicable?: boolean; fields?: Record<string, unknown> } | undefined;

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
    console.error('[chat/card-apply] error:', err);
    return Response.json({ applicable: false }, { status: 500 });
  }
}
