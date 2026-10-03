import Anthropic from '@anthropic-ai/sdk';
import { describeApiError, describeJsonFailure, requestJson, type JsonSchema } from '@/lib/llmJson';
import { resolveAnthropicModel } from '@/lib/llmModels';

// 수업 시뮬레이션 → 설계 반영: 차시마다 쓸 학습 지원 도구(Ds-4)를 제안한다.
// 학습 활동(Ds-3)은 시뮬레이션 내용을 그대로 옮기면 되지만, 지원 도구는
// 시뮬레이션에 없는 정보라 여기서 새로 만든다.

// 생각이 항상 켜진 모델(Fable 5.1)로 차시가 많으면 1분을 넘길 수 있다
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Session = { subject: string; title: string; objective: string; standard: string; content: string };

export type SessionTools = { tool: string; purpose: string }[];

const TOOLS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    sessions: {
      type: 'array',
      description: '차시별 학습 지원 도구. 배열 순서와 길이는 입력 차시와 같아야 한다.',
      items: {
        type: 'object',
        properties: {
          tools: {
            type: 'array',
            description: '이 차시에 쓸 도구·자원 1~2개',
            items: {
              type: 'object',
              properties: {
                tool:    { type: 'string', description: '도구 / 자원 이름 (예: 패들렛, 활동지, 모둠 토의 보드)' },
                purpose: { type: 'string', description: '활용 목적 한 문장' },
              },
              required: ['tool', 'purpose'],
              additionalProperties: false,
            },
          },
        },
        required: ['tools'],
        additionalProperties: false,
      },
    },
  },
  required: ['sessions'],
  additionalProperties: false,
};

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI 설정이 없습니다.' }, { status: 503 });
  }

  const { sessions, model } = (await req.json()) as { sessions?: Session[]; model?: string };
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return Response.json({ error: '반영할 차시가 없습니다.' }, { status: 400 });
  }

  const lines = sessions.map((s, i) =>
    [
      `### ${i + 1}차시 ${s.subject} : ${s.title}`,
      `- 학습목표: ${s.objective}`,
      `- 지도내용:\n${s.content.split('\n').filter(Boolean).map((l) => `  - ${l}`).join('\n')}`,
    ].join('\n'),
  );

  try {
    const result = await requestJson(client, {
      model: resolveAnthropicModel(model),
      maxTokens: 8000,
      system: '당신은 협력적 수업설계를 돕는 AI \'Minerva\'입니다. 중학교 수업의 차시별 활동에 맞는 학습 지원 도구를 제안합니다. 학교에서 실제로 쓰기 쉬운 도구를 고르고, 한국어로 간결하게 씁니다.',
      prompt: `아래 ${sessions.length}개 차시 각각에 맞는 학습 지원 도구를 1~2개씩 제안하세요. 결과의 차시 순서와 개수는 아래와 같아야 합니다.\n\n${lines.join('\n\n')}`,
      schema: TOOLS_SCHEMA,
    });
    if (!result.ok) {
      console.error('[simulate/tools] no result:', result.reason);
      return Response.json({ error: describeJsonFailure(result.reason, '지원 도구를 만들지 못했습니다.') }, { status: 502 });
    }

    const raw = (result.value as { sessions?: { tools?: Partial<SessionTools[number]>[] }[] } | null)?.sessions;
    if (!Array.isArray(raw)) {
      return Response.json({ error: '지원 도구를 만들지 못했습니다.' }, { status: 502 });
    }

    // 모델이 차시 수를 어긋나게 돌려줘도 입력 차시 수에 맞춘다
    const tools: SessionTools[] = sessions.map((_, i) =>
      (raw[i]?.tools ?? [])
        .map((t) => ({ tool: String(t?.tool ?? '').trim(), purpose: String(t?.purpose ?? '').trim() }))
        .filter((t) => t.tool),
    );
    return Response.json({ tools });
  } catch (err) {
    console.error('[simulate/tools] error:', err);
    return Response.json({ error: describeApiError(err, '지원 도구 제안 중 오류가 발생했습니다.') }, { status: 500 });
  }
}
