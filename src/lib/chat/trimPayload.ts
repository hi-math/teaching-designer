// /api/chat 페이로드 슬리머
// 우선순위: activityInputs(활동 카드) > messages > references

export const PAYLOAD_LIMITS = {
  // messages: 공격적으로 자름
  MAX_MESSAGES: 10,

  // references: 공격적으로 자름 (text content 기준, pdfData는 별도)
  MAX_REFERENCE_TOTAL: 3000,
  MAX_REFERENCE_PER_FILE: 1500,

  // activityInputs: 최우선, 넉넉히
  MAX_ACTIVITY_INPUTS: 20,
  MAX_ACTIVITY_CONTENT_PER_CARD: 4000,

  // 최종 가드
  HARD_PAYLOAD_BYTES: 3_500_000, // 3.5MB (Vercel 4.5MB 대비 여유)
} as const;

type AnyMessage = { role: string; content: unknown };

interface ReferenceFile {
  name: string;
  mime: string;
  content?: string;
  pdfData?: string;
}

interface PageContext {
  projectTitle?: string;
  activePhase?: string;
  activeSection?: string;
  activityInputs?: Record<string, string>;
  selectedActivityCode?: string;
  referenceFiles?: ReferenceFile[];
  selectedStandards?: { code: string; subject: string; domain: string; content: string }[];
  selectedIdeas?: { id: string; subject: string; domain: string; content: string }[];
  opinions?: { activityCode: string; question: string; responses: { name: string; text: string }[] }[];
  relatedSubjects?: string;
  targetGrade?: string;
}

// ────────────────────────────────────────────────
// messages: 최근 N개만 전달하고, 첫 메시지는 user로 맞춘다.
// ────────────────────────────────────────────────
export function trimMessages<T extends AnyMessage>(messages: T[]): T[] {
  if (messages.length <= PAYLOAD_LIMITS.MAX_MESSAGES) return messages;
  const tail = messages.slice(-PAYLOAD_LIMITS.MAX_MESSAGES);
  const firstUserIdx = tail.findIndex((m) => m.role === 'user');
  return firstUserIdx === -1 ? tail : tail.slice(firstUserIdx);
}

// ────────────────────────────────────────────────
// activityInputs: Record<string, string>
// 선택 카드 최우선, 각 카드 내용 길이 상한 적용, 카드 수 제한
// ────────────────────────────────────────────────
export function trimActivityInputs(
  inputs: Record<string, string>,
  selectedCode?: string,
): Record<string, string> {
  const allEntries = Object.entries(inputs);

  // 선택 카드를 앞으로, 나머지는 뒤로
  const sorted = [
    ...allEntries.filter(([k]) => k === selectedCode),
    ...allEntries.filter(([k]) => k !== selectedCode),
  ];

  const limited = sorted.slice(0, PAYLOAD_LIMITS.MAX_ACTIVITY_INPUTS);

  const result: Record<string, string> = {};
  for (const [code, text] of limited) {
    if (text.length > PAYLOAD_LIMITS.MAX_ACTIVITY_CONTENT_PER_CARD) {
      result[code] =
        text.slice(0, PAYLOAD_LIMITS.MAX_ACTIVITY_CONTENT_PER_CARD) +
        `\n\n...[${text.length - PAYLOAD_LIMITS.MAX_ACTIVITY_CONTENT_PER_CARD}자 생략됨]`;
    } else {
      result[code] = text;
    }
  }
  return result;
}

// ────────────────────────────────────────────────
// references: 파일별 text content 상한 + 전체 합산 상한
// pdfData는 이미 messages에 document 블록으로 첨부되므로 pageContext에서 제거
// ────────────────────────────────────────────────
export function trimReferences(references: ReferenceFile[]): ReferenceFile[] {
  const out: ReferenceFile[] = [];
  let used = 0;

  for (const ref of references) {
    // pdfData는 pageContext에서 제거 (messages에 이미 포함됨)
    const { pdfData: _stripped, ...refWithoutPdf } = ref;
    void _stripped;

    if (!ref.content || used >= PAYLOAD_LIMITS.MAX_REFERENCE_TOTAL) {
      out.push(refWithoutPdf);
      continue;
    }

    const perFileCap = Math.min(
      PAYLOAD_LIMITS.MAX_REFERENCE_PER_FILE,
      PAYLOAD_LIMITS.MAX_REFERENCE_TOTAL - used,
    );

    if (ref.content.length > perFileCap) {
      out.push({
        ...refWithoutPdf,
        content:
          ref.content.slice(0, perFileCap) +
          `\n\n...[${ref.content.length - perFileCap}자 생략됨]`,
      });
    } else {
      out.push(refWithoutPdf);
    }
    used += Math.min(ref.content.length, perFileCap);
  }
  return out;
}

// ────────────────────────────────────────────────
// 최상위: 모든 자르기 + 사이즈 로깅 + 하드 가드
// ────────────────────────────────────────────────
export function buildChatPayload(input: {
  messages: AnyMessage[];
  stage?: string;
  pageContext?: PageContext;
}) {
  const trimmedMessages = trimMessages(input.messages);

  const ctx = input.pageContext;
  const trimmedPageContext: PageContext | undefined = ctx
    ? {
        ...ctx,
        activityInputs: trimActivityInputs(
          ctx.activityInputs ?? {},
          ctx.selectedActivityCode,
        ),
        referenceFiles: ctx.referenceFiles
          ? trimReferences(ctx.referenceFiles)
          : undefined,
      }
    : undefined;

  const payload = {
    messages: trimmedMessages,
    stage: input.stage,
    pageContext: trimmedPageContext,
  };

  // 진단 로그 — 413 재발 시 즉시 원인 식별 가능
  const bodyStr = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(bodyStr).length;
  console.log('[chat payload]', {
    totalKB: (bytes / 1024).toFixed(1),
    messages: trimmedMessages.length,
    activityInputs: Object.keys(trimmedPageContext?.activityInputs ?? {}).length,
    references: trimmedPageContext?.referenceFiles?.length ?? 0,
    messagesBytes: JSON.stringify(trimmedMessages).length,
    activityBytes: JSON.stringify(trimmedPageContext?.activityInputs ?? {}).length,
    referencesBytes: JSON.stringify(trimmedPageContext?.referenceFiles ?? []).length,
  });

  // 하드 가드: 여전히 넘치면 messages를 더 공격적으로 자름
  if (bytes > PAYLOAD_LIMITS.HARD_PAYLOAD_BYTES) {
    console.warn(
      `[chat payload] Over hard limit (${bytes} bytes). Emergency trimming messages.`,
    );
    const emergencyMessages = trimmedMessages.slice(
      -Math.max(2, Math.floor(PAYLOAD_LIMITS.MAX_MESSAGES / 2)),
    );
    return { ...payload, messages: emergencyMessages };
  }

  return payload;
}
