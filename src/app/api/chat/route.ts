import Anthropic from '@anthropic-ai/sdk';
import { loadSystemPrompt, buildPageContextBlock, buildStableContextBlock } from '@/lib/prompts';
import { selectStandardCandidates } from '@/lib/standards';
import { resolveLlmModel } from '@/lib/llmModels';

export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false }, { status: 503 });
  }
  return Response.json({ ok: true });
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** A-3 후보 선별이 교과 정보 없이도 동작하도록, 분석 단계 카드 입력을 검색어로 쓴다. */
function fallbackStandardsQuery(pageContext: Record<string, unknown> | undefined): string {
  const inputs = (pageContext?.activityInputs ?? {}) as Record<string, string>;
  return ['A-1', 'A-2', 'A-3', 'A-4']
    .map((code) => inputs[code] ?? '')
    .concat(String(pageContext?.projectTitle ?? ''))
    .filter(Boolean)
    .join(' ')
    .slice(0, 500);
}

export async function POST(req: Request) {
  const { messages, stage = 'T', pageContext, model } = await req.json();

  const selectedCode = pageContext?.selectedActivityCode as string | undefined;
  const enrichedContext = { ...pageContext };

  if (selectedCode === 'A-3') {
    // 전량 주입(655건 · 약 4만 자) 대신 이 수업의 교과로 좁힌 후보만 싣는다.
    enrichedContext.allStandards = selectStandardCandidates(
      pageContext?.relatedSubjects as string | undefined,
      fallbackStandardsQuery(pageContext),
    );
  }

  // system 을 두 블록으로 나눠 앞쪽에만 캐시 breakpoint 를 둔다.
  //   [0] 공통 지침 + 단계 지침 + 카드 지침 + 성취기준 후보  → 턴이 바뀌어도 동일 → 캐시 적중
  //   [1] 워크스페이스 현재 상태(카드 입력·의견 등)          → 매 턴 변동
  // 캐싱은 접두사 완전 일치이므로 순서가 뒤바뀌면 효과가 사라진다.
  const stable = [loadSystemPrompt(stage), buildStableContextBlock(enrichedContext)]
    .filter(Boolean)
    .join('\n\n');
  const volatileBlock = enrichedContext ? buildPageContextBlock(enrichedContext) : '';

  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
  ];
  if (volatileBlock) system.push({ type: 'text', text: volatileBlock });

  const stream = client.messages.stream({
    model: resolveLlmModel(model),
    max_tokens: 4000,
    system,
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        console.error('[chat] stream error:', err);
        controller.enqueue(encoder.encode('\n\n(응답 중 오류가 발생했습니다.)'));
      } finally {
        controller.close();
      }
    },
    cancel() {
      // 클라이언트가 중단 버튼을 누르면 업스트림 생성도 같이 멈춘다
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
