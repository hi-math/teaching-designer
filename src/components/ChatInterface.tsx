'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import MessageBubble, { type Message } from './MessageBubble';
import { buildChatPayload } from '@/lib/chat/trimPayload';
import { CARD_SCHEMAS } from '@/components/workspace/cardSchemas';

interface PageContext {
  projectTitle: string;
  activePhase: string;
  activeSection: string;
  activityInputs: Record<string, string>;
  selectedActivityCode?: string;
  /** 목록만 담긴다 (이름/타입). 본문은 loadReferenceContents 로 전송 직전에 가져온다. */
  referenceFiles?: { name: string; mime: string }[];
  selectedStandards?: { code: string; subject: string; domain: string; content: string }[];
  selectedIdeas?: { id: string; subject: string; domain: string; content: string }[];
  opinions?: { activityCode: string; question: string; responses: { name: string; text: string }[] }[];
  relatedSubjects?: string;
  targetGrade?: string;
}

interface Props {
  stage: string;
  onReady?: () => void;
  pageContext?: PageContext;
  lessonId?: string;
  userId?: string;
  triggerMessage?: string; // auto-sends when changed
  /** 채팅관리에서 고른 LLM 모델 id */
  model?: string;
  /** 활동 코드 → 카드 이름 (반영 버튼 문구용) */
  cardLabels?: Record<string, string>;
  /** 카드의 현재 입력값 (반영 판정 시 참고) */
  getCardFields?: (code: string) => Record<string, unknown>;
  /** 답변에서 뽑은 값을 카드에 쓴다. 결과 안내 문구를 돌려주고, 취소되면 null */
  onApplyToCard?: (code: string, fields: Record<string, unknown>) => Promise<string | null>;
  /**
   * 참고자료 본문(PDF base64 / 텍스트)을 전송 직전에 가져오는 콜백.
   * 페이지 진입 시점에 수십 MB 를 미리 받지 않기 위해 지연 호출한다.
   */
  loadReferenceContents?: () => Promise<
    { name: string; mime: string; content?: string; pdfData?: string }[]
  >;
}

function nowTimestamp() {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h >= 12 ? '오후' : '오전'} ${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m}`;
}

/** AI 답변 아래 "카드에 반영하기" — 답변이 끝난 뒤 판정해 반영할 내용이 있을 때만 생긴다 */
type CardApply = {
  code: string;
  fields: Record<string, unknown>;
  state: 'ready' | 'applying' | 'applied';
  note?: string;
};

export default function ChatInterface({ stage, onReady, pageContext, lessonId, userId, triggerMessage, model, loadReferenceContents, cardLabels, getCardFields, onApplyToCard }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  // 메시지 인덱스 → 반영 정보 (새로고침하면 사라진다 — 판정 결과는 저장하지 않음)
  const [cardApply, setCardApply] = useState<Record<number, CardApply>>({});
  const [timestamps, setTimestamps] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // auth UID를 ref로 캐시 — 소유자/참여자 모두 동일하게 auth.uid() 사용
  const authUidRef = useRef<string | null>(null);
  // triggerMessage auto-send
  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});
  const lastTriggerRef = useRef<string>('');

  // 마운트 시: auth UID 캐시 + API 연결 확인
  useEffect(() => {
    createClient().auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (data.user) authUidRef.current = data.user.id;
    });
    fetch('/api/chat')
      .then((r) => r.ok && onReady?.())
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // textarea 높이 자동 조절
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const isInitialLoad = useRef(true);

  // 통합 메시지 캐시 (lessonId 단위, 단계 무관)
  const msgCacheRef = useRef<{ messages: Message[]; timestamps: string[] } | null>(null);

  // userId를 ref로 유지 — 의존성에서 제외해 불필요한 재로드 방지
  const userIdRef = useRef(userId);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  // 히스토리 로드 세션 카운터 — sendMessage 호출 시 증가해 stale 로드를 취소
  const loadGenRef = useRef(0);

  // lessonId 변경 시 전체 히스토리 한 번만 로드 (stage 무관)
  useEffect(() => {
    if (!lessonId) {
      setMessages([]);
      setTimestamps([]);
      msgCacheRef.current = null;
      return;
    }
    isInitialLoad.current = true;

    // 캐시 히트 → 즉시 복원
    if (msgCacheRef.current) {
      setMessages(msgCacheRef.current.messages);
      setTimestamps(msgCacheRef.current.timestamps);
      return;
    }

    loadGenRef.current += 1;
    const myGen = loadGenRef.current;

    setMessages([]);
    setTimestamps([]);
    setCardApply({}); // 반영 버튼은 메시지 인덱스 기준이라 히스토리를 새로 부르면 비운다
    setIsLoadingHistory(true);
    const load = async () => {
      try {
        const uid = userIdRef.current || authUidRef.current || (await createClient().auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => {
          if (data.user) { authUidRef.current = data.user.id; userIdRef.current = data.user.id; }
          return data.user?.id ?? null;
        }));
        if (!uid || loadGenRef.current !== myGen) return;
        const { data } = await createClient()
          .from('ai_messages')
          .select('role, content, created_at')
          .eq('lesson_id', lessonId)
          .eq('user_id', uid)
          .order('created_at', { ascending: true });
        if (!data || loadGenRef.current !== myGen) return;
        type MsgRow = { role: string; content: string; created_at: string };
        const msgs = (data as MsgRow[]).map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
        const tss = (data as MsgRow[]).map((r) => {
          const d = new Date(r.created_at);
          const h = d.getHours();
          const m = String(d.getMinutes()).padStart(2, '0');
          return `${h >= 12 ? '오후' : '오전'} ${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m}`;
        });
        msgCacheRef.current = { messages: msgs, timestamps: tss };
        setMessages(msgs);
        setTimestamps(tss);
      } finally {
        if (loadGenRef.current === myGen) setIsLoadingHistory(false);
      }
    };
    load();
  // userId는 ref로 처리하므로 의존성에서 제외
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  useEffect(() => {
    // messages가 빈 상태(DB 로드 전)에서 초기 플래그를 소비하지 않도록 스킵
    if (messages.length === 0) return;
    if (isInitialLoad.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      isInitialLoad.current = false;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // AI 탭은 처음에 숨겨진(display:none) 상태라 히스토리를 불러올 때 맨 아래로 스크롤해도
  // 적용되지 않는다. 탭이 보이게 되는 순간(높이 0 → 양수) 최신 메시지로 내린다.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let wasHidden = el.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      const hidden = el.clientHeight === 0;
      if (wasHidden && !hidden) el.scrollTop = el.scrollHeight;
      wasHidden = hidden;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    // 히스토리 로드 중에 메시지를 보내면 stale 로드가 메시지를 덮어쓰지 않도록 세션 무효화
    loadGenRef.current += 1;
    setIsLoadingHistory(false);

    const userMsg: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    const newTimestamps = [...timestamps, nowTimestamp()];
    setMessages(newMessages);
    setTimestamps(newTimestamps);
    setInput('');

    const assistantPlaceholder: Message = { role: 'assistant', content: '' };
    setMessages([...newMessages, assistantPlaceholder]);
    setTimestamps([...newTimestamps, nowTimestamp()]);
    setIsStreaming(true);

    abortRef.current = new AbortController();

    // 사용자 메시지 DB 저장 (authUidRef 우선, 없으면 prop userId)
    const saveUid = authUidRef.current || userId;
    if (lessonId && saveUid) {
      createClient().from('ai_messages').insert({
        lesson_id: lessonId,
        user_id: saveUid,
        role: 'user',
        content: text.trim(),
        context_activity_code: stage,
      }).then(({ error }) => {
        if (error) console.error('[ai_messages] user insert error:', error.message);
      });
    }

    try {
      // 참고자료 본문은 지금(전송 직전) 가져온다 — 파일별 캐시는 호출부가 관리한다.
      const refContents = loadReferenceContents ? await loadReferenceContents() : [];
      // PDF 파일이 있으면 마지막 유저 메시지에 document 블록 삽입
      const pdfs = refContents.filter((f) => f.pdfData);
      const apiMessages = newMessages.map((m, idx) => {
        if (idx === newMessages.length - 1 && m.role === 'user' && pdfs.length > 0) {
          return {
            role: m.role,
            content: [
              ...pdfs.map((f) => ({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: f.pdfData },
              })),
              { type: 'text', text: m.content },
            ],
          };
        }
        return m;
      });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildChatPayload({
            messages: apiMessages,
            stage,
            pageContext: pageContext
              ? { ...pageContext, referenceFiles: refContents }
              : pageContext,
          }),
          model,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      // 네트워크 청크마다 setState 하면 초당 수십 번 리렌더가 발생한다.
      // 프레임당 한 번으로 묶어 화면 갱신 속도(60fps)에 맞춘다.
      let frame = 0;
      const paint = () => {
        frame = 0;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        if (!frame) frame = requestAnimationFrame(paint);
      }

      if (frame) cancelAnimationFrame(frame);
      paint(); // 마지막 청크 반영

      // 스트리밍 완료 후 캐시 업데이트
      setMessages((prev) => {
        msgCacheRef.current = { messages: prev, timestamps: [...newTimestamps, nowTimestamp()] };
        return prev;
      });

      // 이 답변을 선택된 카드에 반영할 수 있는지 판정 — 가능할 때만 버튼이 생긴다
      const cardCode = pageContext?.selectedActivityCode;
      const assistantIdx = newMessages.length;
      if (onApplyToCard && cardCode && (CARD_SCHEMAS[cardCode]?.fields.length ?? 0) > 0 && accumulated.trim().length >= 60) {
        fetch('/api/chat/card-apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: cardCode,
            label: cardLabels?.[cardCode],
            answer: accumulated,
            current: getCardFields?.(cardCode),
          }),
        })
          .then((r) => r.json())
          .then((data: { applicable?: boolean; fields?: Record<string, unknown> }) => {
            if (data.applicable && data.fields) {
              setCardApply((prev) => ({ ...prev, [assistantIdx]: { code: cardCode, fields: data.fields!, state: 'ready' } }));
            }
          })
          .catch((e) => console.error('[card-apply] 판정 실패:', e));
      }

      // AI 응답 DB 저장 (스트리밍 완료 후)
      if (lessonId && saveUid && accumulated) {
        createClient().from('ai_messages').insert({
          lesson_id: lessonId,
          user_id: saveUid,
          role: 'assistant',
          content: accumulated,
          context_activity_code: stage,
        }).then(({ error }) => {
          if (error) console.error('[ai_messages] assistant insert error:', error.message);
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '응답 중 오류가 발생했습니다. 다시 시도해 주세요.',
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // keep ref up-to-date so triggerMessage effect always calls latest sendMessage
  sendMessageRef.current = sendMessage;

  // auto-send when triggerMessage changes — wait until history loading is done
  useEffect(() => {
    if (!triggerMessage || triggerMessage === lastTriggerRef.current || isLoadingHistory) return;
    lastTriggerRef.current = triggerMessage;
    const t = setTimeout(() => sendMessageRef.current(triggerMessage), 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerMessage, isLoadingHistory]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {isLoadingHistory ? (
          <div className="flex flex-col gap-3 pt-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`flex gap-2 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                <div className="h-7 w-7 shrink-0 rounded-full bg-gray-100 animate-pulse" />
                <div className={`h-10 rounded-2xl bg-gray-100 animate-pulse ${i % 2 === 0 ? 'w-3/4' : 'w-1/2'}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#5044e3] to-[#44c4b8] text-xs font-bold text-white">
              M
            </div>
            <p className="text-sm font-semibold text-[#2d3339]">Minerva AI</p>
            <p className="text-sm text-[#757b82]">무엇이든 질문해 보세요.</p>
          </div>
        ) : null}
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const isFirst = !prev || prev.role !== msg.role;
          const isLast = !next || next.role !== msg.role;
          const apply = cardApply[i];
          return (
            <div key={i}>
              <MessageBubble
                message={msg}
                isFirst={isFirst}
                isLast={isLast}
                timestamp={timestamps[i] ?? ''}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
              />
              {apply && (
                <div className="mb-3 ml-9 mt-1 flex flex-wrap items-center gap-2">
                  <button
                    disabled={apply.state !== 'ready'}
                    onClick={async () => {
                      if (!onApplyToCard) return;
                      setCardApply((prev) => ({ ...prev, [i]: { ...apply, state: 'applying', note: undefined } }));
                      try {
                        const note = await onApplyToCard(apply.code, apply.fields);
                        setCardApply((prev) => ({ ...prev, [i]: { ...apply, state: note ? 'applied' : 'ready', note: note ?? undefined } }));
                      } catch (e) {
                        setCardApply((prev) => ({
                          ...prev,
                          [i]: { ...apply, state: 'ready', note: e instanceof Error ? e.message : '반영하지 못했습니다.' },
                        }));
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                      apply.state === 'applied'
                        ? 'border-teal-200 bg-teal-50 text-teal-700'
                        : 'border-[#5044e3] bg-white text-[#5044e3] hover:bg-[#f4f2ff] disabled:opacity-60'
                    }`}
                  >
                    {apply.state === 'applied' ? (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6M5 5h14v14H5z" />
                      </svg>
                    )}
                    {apply.state === 'applied'
                      ? '반영됨'
                      : apply.state === 'applying'
                        ? '반영 중…'
                        : `${apply.code}${cardLabels?.[apply.code] ? ` ${cardLabels[apply.code]}` : ''} 카드에 반영하기`}
                  </button>
                  {apply.note && <span className="text-[12px] text-[#757b82]">{apply.note}</span>}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="bg-white px-4 pt-2 pb-5" style={{ borderTop: "1px solid rgba(173,178,186,0.2)" }}>
        <div className="relative flex items-center">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            disabled={isStreaming}
            className="w-full resize-none rounded-2xl bg-[#f1f4f9] pl-5 pr-12 py-3 text-[15px] text-[#2d3339] placeholder-[#adb2ba] outline-none border-none disabled:opacity-50 min-h-[48px] focus:ring-2 focus:ring-[#5044e3]/20"
          />
          {isStreaming && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-red-400 text-white transition hover:bg-red-500"
              title="중단"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            </button>
          )}
          {!isStreaming && input.trim() && (
            <button
              onClick={() => sendMessage(input)}
              className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#5044e3] to-[#44c4b8] text-white transition hover:opacity-90"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
