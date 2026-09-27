import Anthropic from '@anthropic-ai/sdk';

// A-5 수업 시뮬레이션 — 지금까지의 팀 준비·분석 결과로 차시별 흐름 초안을 만든다.
// 채팅과 달리 결과를 카드에 바로 넣어야 하므로, 도구 호출로 JSON 을 강제한다.

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-haiku-4-5-20251001';

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
}

export type SimulatedSession = {
  subject: string;
  title: string;
  standard: string;
  objective: string;
  content: string;
};

const SESSION_TOOL: Anthropic.Tool = {
  name: 'submit_sessions',
  description: '차시별 수업 시뮬레이션 결과를 제출한다. 배열 순서가 곧 차시 순서다.',
  input_schema: {
    type: 'object',
    properties: {
      sessions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            subject:   { type: 'string', description: '이 차시를 맡는 교과 (융합 차시는 "국어·사회"처럼 병기)' },
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
        },
      },
    },
    required: ['sessions'],
  },
};

const LABELS: Record<string, string> = {
  'T-1': '팀 비전',
  'T-2': '수업설계 방향',
  'A-1': '주제 선정 기준',
  'A-2': '주제 선정',
  'A-3': '성취기준 분석',
  'A-4': '통합 수업 목표',
};

function buildPrompt(body: SimulateRequest, sessions: number): string {
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
    for (const s of body.selectedStandards) lines.push(`- [${s.code ?? ''}] (${s.subject}) ${s.content}`);
  }

  lines.push(
    '',
    '## 요청',
    `위 내용을 바탕으로 이 수업을 정확히 ${sessions}개 차시로 시뮬레이션하세요.`,
    '- 차시마다 과목, 수업 타이틀(직접 지음), 학습목표, 성취기준 코드, 지도내용을 제시합니다.',
    '- 성취기준은 코드만 적습니다. 지도내용은 개조식 3~4개 항목으로 씁니다.',
    '- 선택한 성취기준이 빠짐없이 최소 한 차시에 배치되도록 합니다.',
    '- 흐름이 팀 비전과 통합 수업 목표로 수렴하도록 배열합니다.',
    '- 관련 교과가 여럿이면 교과별 차시와 융합 차시를 자연스럽게 섞습니다.',
    '- submit_sessions 도구로만 답합니다.',
  );
  return lines.join('\n');
}

/** 모델이 성취기준 본문까지 붙여 보내도 대괄호 코드만 남긴다 */
function codesOnly(text: string): string {
  const codes = text.match(/\[[^\]\n]+\]/g);
  return codes ? codes.join(', ') : text.trim();
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'AI 설정이 없습니다.' }, { status: 503 });
  }

  const body = (await req.json()) as SimulateRequest;
  const requested = Number(body.totalSessions);
  const sessions = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), 30) : 6;

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: '당신은 협력적 수업설계를 돕는 AI \'Minerva\'입니다. 중학교 교사 팀의 설계 결과를 바탕으로 실제 수업 흐름을 차시 단위로 시뮬레이션합니다. 한국어로 간결하고 구체적으로 작성합니다.',
      tools: [SESSION_TOOL],
      tool_choice: { type: 'tool', name: SESSION_TOOL.name },
      messages: [{ role: 'user', content: buildPrompt(body, sessions) }],
    });

    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    type RawSession = Partial<Omit<SimulatedSession, 'content'>> & { content?: string[] | string };
    const raw = (block?.input as { sessions?: RawSession[] } | undefined)?.sessions;
    if (!Array.isArray(raw) || raw.length === 0) {
      return Response.json({ error: '시뮬레이션 결과를 만들지 못했습니다.' }, { status: 502 });
    }

    const result: SimulatedSession[] = raw.map((s) => ({
      subject: String(s.subject ?? ''),
      title: String(s.title ?? ''),
      standard: codesOnly(String(s.standard ?? '')),
      objective: String(s.objective ?? ''),
      // 지도내용은 줄마다 항목 하나 — 배열로 오지 않아도 받아 준다
      content: (Array.isArray(s.content) ? s.content : String(s.content ?? '').split('\n'))
        .map((l) => String(l).replace(/^\s*(?:[-•·*]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)
        .join('\n'),
    }));
    return Response.json({ sessions: result });
  } catch (err) {
    console.error('[simulate] error:', err);
    return Response.json({ error: '시뮬레이션 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
