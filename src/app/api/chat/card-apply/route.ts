import OpenAI from 'openai';
import { CARD_SCHEMAS, type FieldDef } from '@/components/workspace/cardSchemas';
import { requestJson } from '@/lib/llmJson';
import { DEFAULT_LLM_MODEL } from '@/lib/llmModels';
import { getCoreIdeas, standardCandidates } from '@/lib/curriculumCatalog';
import type { StandardItem } from '@/components/workspace/StandardsModal';

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

async function applyCatalogRecommendations(answer: string, relatedSubjects: string, current: Record<string, unknown>) {
  const ideas = getCoreIdeas();
  const standards = standardCandidates(answer, relatedSubjects);
  if (standards.length === 0 && ideas.length === 0) return Response.json({ applicable: false });

  const ideaById = new Map(ideas.map(item => [item.id, item]));
  const standardByCode = new Map(standards.map(item => [item.code, item]));
  const selectionSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      applicable: { type: 'boolean' },
      ideaIds: { type: 'array', items: { type: 'string', enum: ideas.map(item => item.id) } },
      standardCodes: { type: 'array', items: { type: 'string', enum: standards.length ? standards.map(item => item.code) : ['__none__'] } },
    },
    required: ['applicable', 'ideaIds', 'standardCodes'],
  };
  const prompt = [
    '다음 AI 답변에서 실제로 추천한 핵심 아이디어와 성취기준만 기존 목록의 ID로 고르세요.',
    '목록에 없는 내용을 새로 만들거나 유사하다는 이유만으로 다른 기준으로 바꾸지 마세요.',
    '답변에 명시되지 않은 항목은 고르지 마세요. 추천이 없으면 빈 배열로 답하세요.',
    '현재 카드 내용은 중복 확인용일 뿐 추천으로 간주하지 마세요.',
    `현재 카드: ${JSON.stringify(current).slice(0, 2500)}`,
    `핵심 아이디어 목록: ${JSON.stringify(ideas.map(({ id, subject, domain, content }) => ({ id, subject, domain, content })))}`,
    `성취기준 후보 목록: ${JSON.stringify(standards.map(({ code, subject, domain, content }) => ({ code, subject, domain, content })))}`,
    `AI 답변: ${answer.slice(0, 12000)}`,
  ].join('\n\n');
  const result = await requestJson(new OpenAI({ apiKey: process.env.CHATGPT_API_KEY }), {
    model: DEFAULT_LLM_MODEL, maxTokens: 3000,
    system: '기존 교육과정 목록에서만 항목을 선택합니다. 답변의 추천과 일치하지 않는 항목은 선택하지 않습니다. 모든 수학 용어는 영어로 표현합니다.',
    prompt, schema: selectionSchema,
  });
  if (!result.ok) return Response.json({ applicable: false }, { status: 502 });
  const parsed = result.value as { applicable?: boolean; ideaIds?: string[]; standardCodes?: string[] };
  if (parsed?.applicable !== true) return Response.json({ applicable: false });
  const evidence = answer.replace(/\s+/g, ' ');
  const selectedIdeas = [...new Set(Array.isArray(parsed.ideaIds) ? parsed.ideaIds : [])]
    .map(id => ideaById.get(id)).filter(item => item !== undefined)
    .filter(item => evidence.includes(item.id) || evidence.includes(item.content.replace(/\s+/g, ' ').slice(0, 24)));
  const selectedStandards: StandardItem[] = [...new Set(Array.isArray(parsed.standardCodes) ? parsed.standardCodes : [])]
    .map(code => standardByCode.get(code))
    .filter((item): item is NonNullable<typeof item> => item !== undefined && evidence.includes(item.code))
    .map(({ code, subject, domain, content, keywords, explanation, grade_group }) =>
      ({ code, subject, domain, content, keywords, explanation, grade_group }));
  if (!selectedIdeas.length && !selectedStandards.length) return Response.json({ applicable: false });
  const fields: Record<string, unknown> = {};
  if (selectedIdeas.length) fields.core_ideas = selectedIdeas.map(item => ({ subject: item.subject, core_idea: item.content }));
  if (selectedStandards.length) fields.achievement_standards = selectedStandards.map(item => ({ subject: item.subject, standard: `${item.code} ${item.content}` }));
  return Response.json({ applicable: true, fields, selections: { ideas: selectedIdeas, standards: selectedStandards } });
}

export async function POST(req: Request) {
  if (!process.env.CHATGPT_API_KEY) {
    return Response.json({ applicable: false }, { status: 503 });
  }

  const { code, label, answer, current, relatedSubjects } = (await req.json()) as {
    code?: string;
    label?: string;
    answer?: string;
    current?: Record<string, unknown>;
    relatedSubjects?: string;
  };

  const schema = code ? CARD_SCHEMAS[code] : undefined;
  if (!schema || schema.fields.length === 0 || !answer?.trim()) {
    return Response.json({ applicable: false });
  }

  if (code === 'A-3') {
    try { return await applyCatalogRecommendations(answer, relatedSubjects ?? '', current ?? {}); }
    catch (err) {
      console.error('[chat/card-apply] catalog error:', err instanceof Error ? err.message : 'unknown');
      return Response.json({ applicable: false }, { status: 500 });
    }
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
