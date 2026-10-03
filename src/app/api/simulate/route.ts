import Anthropic from '@anthropic-ai/sdk';
import { describeApiError, describeJsonFailure, requestJson, type JsonSchema } from '@/lib/llmJson';
import { resolveLlmModel } from '@/lib/llmModels';
import { bracketCode, extractCodes } from '@/lib/standardCode';

// A-5 초안 미리보기 — 지금까지의 팀 준비·분석 결과로 차시별 흐름 초안을 만든다.
// 채팅과 달리 결과를 카드에 바로 넣어야 하므로, 구조화 출력으로 JSON 을 받는다.

// 생각이 항상 켜진 모델(Fable 5.1)로 차시가 많으면 1분을 넘길 수 있다
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Item = { code?: string; subject: string; domain?: string; content: string };

interface SimulateRequest {
  title?: string;
  totalSessions?: number | null;
  relatedSubjects?: string;
  targetGrade?: string;
  /** 활동 코드 → 직렬화된 카드 내용 (T-1, T-2, A-1 ~ A-4) */
  cards?: Record<string, string>;
  selectedIdeas?: Item[];
  selectedStandards?: Item[];
  /** 채팅관리에서 고른 모델 */
  model?: string;
  /** 초안 만들기 창에서 받은 교사 팀의 추가 요청 — 기본 지침보다 우선한다 */
  request?: string;
}

const REQUEST_MAX = 1000;

export type SimulatedSession = {
  subject: string;
  title: string;
  standard: string;
  objective: string;
  content: string;
};

const SESSIONS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    sessions: {
      type: 'array',
      description: '차시별 수업 시뮬레이션 결과. 배열 순서가 곧 차시 순서다.',
      items: {
        type: 'object',
        properties: {
          subject:   { type: 'string', description: '이 차시를 맡는 교과 하나. 차시가 교과 수보다 부족할 때만 "국어·사회"처럼 두 교과를 병기' },
          title:     { type: 'string', description: '이 차시의 수업 타이틀을 직접 지어 넣는다. 차시 내용을 압축한 20자 내외의 짧은 제목' },
          objective: { type: 'string', description: '학습목표 한 문장 ("~할 수 있다" 형식)' },
          standard:  { type: 'string', description: '이 차시에서 다루는 성취기준의 코드만. 내용 없이 "[9수01-02]" 형식, 여러 개면 ", "로 구분' },
          content: {
            type: 'array',
            description: '지도내용: 개조식 3~4개 항목. 각 항목은 한 줄, "~하기"·"~ 탐구" 같은 명사형 종결',
            items: { type: 'string' },
          },
        },
        required: ['subject', 'title', 'objective', 'standard', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['sessions'],
  additionalProperties: false,
};

const LABELS: Record<string, string> = {
  'T-1': '팀 비전',
  'T-2': '수업설계 방향',
  'A-1': '주제 선정 기준',
  'A-2': '주제 선정',
  'A-3': '성취기준 분석',
  'A-4': '통합 수업 목표',
};

function buildPrompt(body: SimulateRequest, sessions: number, request: string): string {
  const lines: string[] = [];
  lines.push('## 수업 기본정보');
  lines.push(`- 수업 제목: ${body.title || '(미입력)'}`);
  lines.push(`- 총 차시: ${sessions}차시${body.totalSessions ? '' : ' (미입력 — 임의로 정함)'}`);
  lines.push(`- 관련 교과: ${body.relatedSubjects || '(미입력)'}`);
  if (body.targetGrade) lines.push(`- 대상 학년: ${body.targetGrade}`);

  for (const [code, label] of Object.entries(LABELS)) {
    const text = body.cards?.[code]?.trim();
    if (!text) continue;
    lines.push('', `## ${code} ${label}`, text);
  }

  if (body.selectedIdeas?.length) {
    lines.push('', '## 핵심 아이디어');
    for (const i of body.selectedIdeas) lines.push(`- (${i.subject}) ${i.content}`);
  }
  if (body.selectedStandards?.length) {
    lines.push('', '## 선택한 성취기준');
    for (const s of body.selectedStandards) lines.push(`- ${s.code ? bracketCode(s.code) : ''} (${s.subject}) ${s.content}`);
  }

  lines.push(
    '',
    '## 기본 지침',
    `위 내용을 바탕으로 이 수업을 정확히 ${sessions}개 차시로 시뮬레이션하세요.`,
    '- 차시마다 과목, 수업 타이틀(직접 지음), 학습목표, 성취기준 코드, 지도내용을 제시합니다.',
    '- 성취기준은 코드만 적습니다. 지도내용은 개조식 3~4개 항목으로 씁니다.',
    '- 선택한 성취기준이 빠짐없이 최소 한 차시에 배치되도록 합니다.',
    '- 흐름이 팀 비전과 통합 수업 목표로 수렴하도록 배열합니다.',
    '- 한 차시에는 가급적 한 교과만 배정합니다. 차시 수가 관련 교과 수보다 적어 모든 교과를 담기 어려울 때만 한 차시에 두 교과를 함께 넣습니다.',
    '- 관련 교과가 여럿이면 교과별 차시가 고르게 돌아가도록 배열하고, 교과 간 연결은 앞뒤 차시의 흐름으로 드러냅니다.',
  );

  // 추가 요청은 맨 끝에 따로 두고, 위 기본 지침과 어긋나면 요청을 따르게 한다
  if (request) {
    lines.push(
      '',
      '## 교사 팀의 추가 요청 (최우선 반영)',
      '<request>',
      request,
      '</request>',
      '- 이 요청을 가장 먼저 반영합니다. 위 기본 지침과 어긋나면 추가 요청을 따릅니다 (차시 수, 교과 배분, 활동 방식 포함).',
      '- 요청이 다루지 않는 부분만 기본 지침과 설계 내용을 따릅니다.',
      '- 요청을 반영한 흔적이 해당 차시의 타이틀·학습목표·지도내용에 구체적으로 드러나게 씁니다.',
    );
  }
  return lines.join('\n');
}

/** 모델이 성취기준 본문까지 붙여 보내도 대괄호 코드만 남긴다 */
function codesOnly(text: string): string {
  const codes = extractCodes(text);
  return codes.length ? codes.join(', ') : text.trim();
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI 설정이 없습니다.' }, { status: 503 });
  }

  const body = (await req.json()) as SimulateRequest;
  const requested = Number(body.totalSessions);
  const sessions = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 30) : 6;
  const request = typeof body.request === 'string' ? body.request.trim().slice(0, REQUEST_MAX) : '';

  try {
    const result = await requestJson(client, {
      model: resolveLlmModel(body.model),
      maxTokens: 16000,
      system:
        '당신은 협력적 수업설계를 돕는 AI \'Minerva\'입니다. 중학교 교사 팀의 설계 결과를 바탕으로 실제 수업 흐름을 차시 단위로 시뮬레이션합니다. 한국어로 간결하고 구체적으로 작성합니다.' +
        (request ? ' 교사 팀이 추가 요청을 주면 그 요청을 기본 지침보다 우선해 반영합니다.' : ''),
      prompt: buildPrompt(body, sessions, request),
      schema: SESSIONS_SCHEMA,
    });
    if (!result.ok) {
      console.error('[simulate] no result:', result.reason);
      return Response.json({ error: describeJsonFailure(result.reason, '차시 초안을 만들지 못했습니다.') }, { status: 502 });
    }

    type RawSession = Partial<Omit<SimulatedSession, 'content'>> & { content?: string[] | string };
    const raw = (result.value as { sessions?: RawSession[] } | null)?.sessions;
    if (!Array.isArray(raw) || raw.length === 0) {
      return Response.json({ error: '차시 초안을 만들지 못했습니다.' }, { status: 502 });
    }

    const sessionsOut: SimulatedSession[] = raw.map((s) => ({
      subject: String(s?.subject ?? ''),
      title: String(s?.title ?? ''),
      standard: codesOnly(String(s?.standard ?? '')),
      objective: String(s?.objective ?? ''),
      // 지도내용은 줄마다 항목 하나 — 배열로 오지 않아도 받아 준다
      content: (Array.isArray(s?.content) ? s.content : String(s?.content ?? '').split('\n'))
        .map((l) => String(l).replace(/^\s*(?:[-•·*]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)
        .join('\n'),
    }));
    return Response.json({ sessions: sessionsOut });
  } catch (err) {
    console.error('[simulate] error:', err);
    return Response.json({ error: describeApiError(err, '초안 미리보기 중 오류가 발생했습니다.') }, { status: 500 });
  }
}
