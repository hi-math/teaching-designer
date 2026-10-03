import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { loadSystemPrompt, buildPageContextBlock, buildStableContextBlock } from '@/lib/prompts';
import { selectStandardCandidates } from '@/lib/standards';
import { isOpenAiModel, resolveLlmModel } from '@/lib/llmModels';
import { CHAT_STREAM_ERROR_MARKER, type ChatStreamError } from '@/lib/chat/streamProtocol';

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const direct = 'code' in error ? error.code : undefined;
  if (typeof direct === 'string') return direct;
  const nested = 'error' in error ? error.error : undefined;
  return nested && typeof nested === 'object' && 'code' in nested && typeof nested.code === 'string'
    ? nested.code : undefined;
}

function chatError(error: unknown, openai: boolean): ChatStreamError {
  const code = errorCode(error);
  if (openai && code === 'credit_balance_exhausted') return {
    code, message: 'OpenAI API 크레딧이 소진되었습니다. API Billing에서 잔액을 충전하거나 채팅 관리에서 Claude 모델을 선택해 주세요.',
  };
  if (openai && (code === 'insufficient_quota' || code?.endsWith('_spend_limit_exceeded'))) return {
    code, message: 'OpenAI API 사용 한도에 도달했습니다. API Billing의 잔액과 사용 한도를 확인하거나 Claude 모델을 선택해 주세요.',
  };
  return { code, message: '응답 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
}

function logChatError(error: unknown, openai: boolean) {
  // SDK 오류 객체에는 응답 헤더와 계정 정보가 들어갈 수 있어 전체 객체를 기록하지 않는다.
  console.error('[chat] stream error', { provider: openai ? 'openai' : 'anthropic', code: errorCode(error) ?? 'unknown' });
}

export async function GET(req: Request) {
  const model = resolveLlmModel(new URL(req.url).searchParams.get('model'));
  if (!(isOpenAiModel(model) ? process.env.CHATGPT_API_KEY : process.env.ANTHROPIC_API_KEY)) {
    return Response.json({ ok: false }, { status: 503 });
  }
  return Response.json({ ok: true });
}

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string | ({ type: 'text'; text: string } | {
    type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string };
  })[];
};

/** UI의 Claude PDF 블록을 OpenAI Responses의 input_file로 옮긴다. */
function toOpenAiInput(messages: ChatMessage[]): OpenAI.Responses.ResponseInput {
  return messages.map((message) => {
    if (typeof message.content === 'string') return { role: message.role, content: message.content };
    return {
      role: 'user' as const,
      content: message.content.map((part, index) => part.type === 'text'
        ? { type: 'input_text' as const, text: part.text }
        : { type: 'input_file' as const, filename: `reference-${index + 1}.pdf`, file_data: `data:application/pdf;base64,${part.source.data}`, detail: 'low' as const }),
    };
  });
}

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
  const { messages, stage = 'T', pageContext, model, intent, cardLabels } = await req.json();
  const selectedModel = resolveLlmModel(model);
  if (isOpenAiModel(selectedModel) ? !process.env.CHATGPT_API_KEY : !process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: '선택한 모델의 API 키가 설정되지 않았습니다.' }, { status: 503 });
  }

  const selectedCode = pageContext?.selectedActivityCode as string | undefined;
  const enrichedContext = { ...pageContext };

  // with AI 피드백 — 선행 카드 요약 대신 모든 카드 내용을 흐름 순서대로 길게 싣는다 (buildPageContextBlock)
  if (intent === 'feedback') {
    enrichedContext.intent = 'feedback';
    if (cardLabels && typeof cardLabels === 'object') enrichedContext.cardLabels = cardLabels;
  }

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

  const abortController = new AbortController();
  req.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  let stream: AsyncIterable<unknown>;
  if (isOpenAiModel(selectedModel)) {
    const client = new OpenAI({ apiKey: process.env.CHATGPT_API_KEY });
    try {
      stream = await client.responses.create({
        model: selectedModel,
        instructions: [stable, volatileBlock].filter(Boolean).join('\n\n'),
        input: toOpenAiInput(messages as ChatMessage[]),
        stream: true,
        reasoning: { effort: 'low' },
        max_output_tokens: 6000,
      }, { signal: abortController.signal });
    } catch (error) {
      logChatError(error, true);
      return Response.json({ error: chatError(error, true) }, { status: 502 });
    }
  } else {
    const system: Anthropic.TextBlockParam[] = [
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
    ];
    if (volatileBlock) system.push({ type: 'text', text: volatileBlock });
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    stream = client.messages.stream({
      model: selectedModel,
      max_tokens: 4000,
      system,
      messages,
    }, { signal: abortController.signal });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (typeof chunk !== 'object' || chunk === null || !('type' in chunk)) continue;
          if (chunk.type === 'response.output_text.delta' && 'delta' in chunk && typeof chunk.delta === 'string') {
            controller.enqueue(encoder.encode(chunk.delta));
          } else if (chunk.type === 'content_block_delta' && 'delta' in chunk &&
            typeof chunk.delta === 'object' && chunk.delta !== null && 'type' in chunk.delta &&
            chunk.delta.type === 'text_delta' && 'text' in chunk.delta && typeof chunk.delta.text === 'string') {
            controller.enqueue(encoder.encode(chunk.delta.text));
          } else if (chunk.type === 'error' || chunk.type === 'response.failed') {
            throw chunk;
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          logChatError(err, isOpenAiModel(selectedModel));
          controller.enqueue(encoder.encode(CHAT_STREAM_ERROR_MARKER + JSON.stringify(chatError(err, isOpenAiModel(selectedModel)))));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // 클라이언트가 중단 버튼을 누르면 업스트림 생성도 같이 멈춘다
      abortController.abort();
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
