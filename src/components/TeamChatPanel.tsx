'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { showAlert } from '@/components/ui/dialog';

const EMOJIS = ['👍', '❤️', '😄', '😮', '😢'];

// ─── 타입 ──────────────────────────────────────────────────────────

interface Reaction {
  count: number;
  reactedByMe: boolean;
}

interface ReplyRef {
  id: string;
  userId: string;
  senderName: string;
  content: string;
}

interface ChatMessage {
  id: string;
  userId: string;
  senderName: string;
  avatarUrl: string | null;
  content: string;
  timestamp: string;
  reactions: Record<string, Reaction>;
  replyTo?: ReplyRef;
}

// ─── 유틸 ──────────────────────────────────────────────────────────

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h >= 12 ? '오후' : '오전'} ${h > 12 ? h - 12 : h === 0 ? 12 : h}:${m}`;
}

function initials(name: string) {
  return name.charAt(0);
}

const AVATAR_COLORS = [
  'bg-[#3D5A7A]', 'bg-[#4A7A5A]', 'bg-[#7A5A3D]',
  'bg-[#5A3D7A]', 'bg-[#7A3D5A]', 'bg-[#3D7A6A]',
];
function avatarColor(userId: string) {
  let n = 0;
  for (let i = 0; i < userId.length; i++) n += userId.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────

interface Props {
  lessonId: string;
  currentUserId: string;
}

type Profile = { name: string; avatarUrl: string | null };

function toProfile(row?: { display_name?: string | null; email?: string | null; avatar_url?: string | null }): Profile {
  return {
    name: row?.display_name ?? row?.email ?? '알 수 없음',
    avatarUrl: row?.avatar_url ?? null,
  };
}

export default function TeamChatPanel({ lessonId, currentUserId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  // 사용자가 의도적으로 중지했는지 여부 (무음 자동 종료와 구분)
  const wantRecordingRef = useRef(false);

  // ── 프로필 캐시 ──────────────────────────────────────────────
  const profileCache = useRef<Record<string, Profile>>({});
  // 같은 사용자에 대한 동시 요청을 합치기 위한 in-flight 맵.
  // 캐시는 await 이 끝나야 채워지므로, 이게 없으면 Promise.all 로 200건을 동시에
  // 변환할 때 전부 캐시 미스가 나 profiles 에 200번을 한꺼번에 질의하게 된다.
  const profileInflight = useRef<Record<string, Promise<Profile>>>({});

  /** 여러 사용자를 한 번의 질의로 미리 채운다 (N+1 방지). */
  const preloadProfiles = useCallback(async (userIds: string[]) => {
    const missing = [...new Set(userIds)].filter((id) => id && !profileCache.current[id]);
    if (missing.length === 0) return;
    const { data } = await createClient()
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .in('id', missing);
    for (const row of data ?? []) {
      profileCache.current[row.id as string] = toProfile(row);
    }
    // 조회되지 않은 id 도 채워 둬야 이후 단건 조회로 새지 않는다
    for (const id of missing) {
      if (!profileCache.current[id]) profileCache.current[id] = toProfile();
    }
  }, []);

  const getProfile = useCallback(async (userId: string): Promise<Profile> => {
    const cached = profileCache.current[userId];
    if (cached) return cached;

    const pending = profileInflight.current[userId];
    if (pending) return pending;

    const request = (async () => {
      const { data } = await createClient()
        .from('profiles')
        .select('display_name, email, avatar_url')
        .eq('id', userId)
        .single();
      const profile = toProfile(data ?? undefined);
      profileCache.current[userId] = profile;
      delete profileInflight.current[userId];
      return profile;
    })();

    profileInflight.current[userId] = request;
    return request;
  }, []);

  // ── DB 메시지 → ChatMessage 변환 ──────────────────────────────
  const toMessage = useCallback(async (
    row: { id: string; user_id: string; content: string; created_at: string; reply_to: string | null },
    allRows: typeof row[]
  ): Promise<ChatMessage> => {
    const profile = await getProfile(row.user_id);
    let replyRef: ReplyRef | undefined;
    if (row.reply_to) {
      const parent = allRows.find((r) => r.id === row.reply_to);
      if (parent) {
        const parentProfile = await getProfile(parent.user_id);
        replyRef = {
          id: parent.id,
          userId: parent.user_id,
          senderName: parentProfile.name,
          content: parent.content,
        };
      }
    }
    return {
      id: row.id,
      userId: row.user_id,
      senderName: profile.name,
      avatarUrl: profile.avatarUrl,
      content: row.content,
      timestamp: formatTimestamp(row.created_at),
      reactions: {},
      replyTo: replyRef,
    };
  }, [getProfile]);

  // ── 초기 로드 ────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('team_messages')
        .select('id, user_id, content, created_at, reply_to')
        .eq('lesson_id', lessonId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200);
      if (!data) return;

      // 메시지 작성자 + 답글 원본 작성자를 한 번의 질의로 모두 채운 뒤 변환한다
      await preloadProfiles(data.map((r) => r.user_id));
      const converted = await Promise.all(data.map((row) => toMessage(row, data)));

      const ids = converted.map((m) => m.id);
      if (ids.length > 0) {
        const { data: rdata } = await supabase
          .from('team_message_reactions')
          .select('message_id, user_id, emoji')
          .in('message_id', ids);
        if (rdata) {
          const rmap: Record<string, Record<string, Reaction>> = {};
          for (const r of rdata) {
            if (!rmap[r.message_id]) rmap[r.message_id] = {};
            const ex = rmap[r.message_id][r.emoji];
            rmap[r.message_id][r.emoji] = {
              count: (ex?.count ?? 0) + 1,
              reactedByMe: (ex?.reactedByMe ?? false) || r.user_id === currentUserId,
            };
          }
          setMessages(converted.map((m) => ({ ...m, reactions: rmap[m.id] ?? {} })));
          return;
        }
      }
      setMessages(converted);
    };
    load();
  }, [lessonId, toMessage, currentUserId, preloadProfiles]);

  // ── Realtime 구독 ────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`team_messages:${lessonId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_messages' },
        async (payload) => {
          const row = payload.new as { id: string; lesson_id: string; user_id: string; content: string; created_at: string; reply_to: string | null };
          if (row.lesson_id !== lessonId) return;
          if (row.user_id === currentUserId) return;
          const msg = await toMessage(row, [row]);
          setMessages((prev) => [...prev, msg]);
        }
      )
      .subscribe((status, err) => {
        console.log('[Chat Realtime]', status, err ?? '');
      });
    return () => { supabase.removeChannel(channel); };
  }, [lessonId, currentUserId, toMessage]);

  // ── 리액션 Realtime ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`team_reactions:${lessonId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_message_reactions' },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string; emoji: string };
          if (row.user_id === currentUserId) return;
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== row.message_id) return msg;
              const ex = msg.reactions[row.emoji];
              return { ...msg, reactions: { ...msg.reactions, [row.emoji]: { count: (ex?.count ?? 0) + 1, reactedByMe: ex?.reactedByMe ?? false } } };
            })
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'team_message_reactions' },
        (payload) => {
          const row = payload.old as { message_id?: string; user_id?: string; emoji?: string };
          if (!row.message_id || !row.emoji) return;
          if (row.user_id === currentUserId) return;
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== row.message_id) return msg;
              const ex = msg.reactions[row.emoji!];
              if (!ex) return msg;
              const updated = { ...msg.reactions };
              if (ex.count <= 1) delete updated[row.emoji!];
              else updated[row.emoji!] = { count: ex.count - 1, reactedByMe: ex.reactedByMe };
              return { ...msg, reactions: updated };
            })
          );
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [lessonId, currentUserId]);

  // ── 자동 스크롤 ──────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── textarea 자동 높이 ───────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // ── 이모지 피커 외부 클릭 닫기 ──────────────────────────────
  useEffect(() => {
    if (!reactionPickerFor) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setReactionPickerFor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [reactionPickerFor]);

  // ── 음성 입력 토글 ───────────────────────────────────────────
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      wantRecordingRef.current = false;
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      showAlert('이 브라우저는 음성 인식을 지원하지 않습니다.\n크롬(Chrome) 브라우저를 사용해 주세요.');
      return;
    }
    if (!window.isSecureContext) {
      showAlert('음성 인식은 보안 연결(HTTPS)에서만 사용할 수 있습니다.\nhttps 주소 또는 localhost로 접속해 주세요.');
      return;
    }
    finalTranscriptRef.current = input;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'ko-KR';
    recognition.interimResults = true;
    recognition.continuous = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInput(finalTranscriptRef.current + interim);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error === 'aborted') return;
      console.error('STT 오류:', e.error);

      // no-speech는 무음일 때 흔히 발생 — onend에서 자동 재시작하므로 무시
      if (e.error === 'no-speech') return;

      const messages: Record<string, string> = {
        'not-allowed': '마이크 권한이 차단되어 있습니다.\n주소창 왼쪽 자물쇠 아이콘 → 마이크를 "허용"으로 바꾼 뒤 새로고침해 주세요.',
        'service-not-allowed': '브라우저가 음성 인식 서비스를 차단했습니다.\n크롬 설정에서 마이크 권한을 확인해 주세요.',
        'audio-capture': '마이크를 찾을 수 없습니다.\n마이크가 연결되어 있는지 확인해 주세요.',
        'network': '음성 인식 서버에 연결하지 못했습니다.\n네트워크 상태를 확인해 주세요.',
      };
      wantRecordingRef.current = false;
      setIsRecording(false);
      showAlert(messages[e.error] ?? `음성 인식에 실패했습니다. (${e.error})`);
    };

    // 무음으로 자동 종료되면 사용자가 중지하기 전까지 다시 시작
    recognition.onend = () => {
      if (!wantRecordingRef.current) { setIsRecording(false); return; }
      try {
        recognition.start();
      } catch {
        wantRecordingRef.current = false;
        setIsRecording(false);
      }
    };

    recognitionRef.current = recognition;
    wantRecordingRef.current = true;
    recognition.start();
    setIsRecording(true);
  }, [isRecording, input]);

  // ── 답장 대상 메시지로 스크롤 ────────────────────────────────
  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(msgId);
    setTimeout(() => setHighlightedId(null), 1500);
  }, []);

  // ── 메시지 전송 ──────────────────────────────────────────────
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (isRecording) { wantRecordingRef.current = false; recognitionRef.current?.stop(); setIsRecording(false); }
    setSending(true);

    const now = new Date().toISOString();
    const profile = await getProfile(currentUserId);

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      userId: currentUserId,
      senderName: profile.name,
      avatarUrl: profile.avatarUrl,
      content: text,
      timestamp: formatTimestamp(now),
      reactions: {},
      replyTo: replyTo
        ? { id: replyTo.id, userId: replyTo.userId, senderName: replyTo.senderName, content: replyTo.content }
        : undefined,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    finalTranscriptRef.current = '';
    setReplyTo(null);

    const { data, error } = await createClient()
      .from('team_messages')
      .insert({
        lesson_id: lessonId,
        user_id: currentUserId,
        content: text,
        reply_to: replyTo?.id ?? null,
      })
      .select('id')
      .single();

    setSending(false);

    if (!error && data) {
      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, id: data.id } : m)
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── 반응 토글 (한 사용자 = 한 메시지에 하나의 이모지) ────────
  const toggleReaction = async (messageId: string, emoji: string) => {
    const msg = messages.find((m) => m.id === messageId);
    const alreadyReacted = !!msg?.reactions[emoji]?.reactedByMe;
    // 이미 다른 이모지로 반응했다면 그것을 먼저 제거
    const prevEmoji = Object.entries(msg?.reactions ?? {}).find(([, r]) => r.reactedByMe)?.[0];

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const updated = { ...m.reactions };
        // 기존 이모지 제거
        if (prevEmoji && prevEmoji !== emoji) {
          const ex = updated[prevEmoji];
          if ((ex?.count ?? 0) <= 1) delete updated[prevEmoji];
          else updated[prevEmoji] = { count: ex!.count - 1, reactedByMe: false };
        }
        // 현재 이모지 토글
        const existing = updated[emoji];
        if (alreadyReacted) {
          if ((existing?.count ?? 0) <= 1) delete updated[emoji];
          else updated[emoji] = { count: existing!.count - 1, reactedByMe: false };
        } else {
          updated[emoji] = { count: (existing?.count ?? 0) + 1, reactedByMe: true };
        }
        return { ...m, reactions: updated };
      })
    );
    setReactionPickerFor(null);

    const supabase = createClient();
    // 기존 다른 이모지 DB에서 제거
    if (prevEmoji && prevEmoji !== emoji) {
      await supabase.from('team_message_reactions').delete()
        .eq('message_id', messageId).eq('user_id', currentUserId).eq('emoji', prevEmoji);
    }
    if (alreadyReacted) {
      await supabase.from('team_message_reactions').delete()
        .eq('message_id', messageId).eq('user_id', currentUserId).eq('emoji', emoji);
    } else {
      await supabase.from('team_message_reactions')
        .insert({ message_id: messageId, user_id: currentUserId, emoji });
    }
  };

  const togglePicker = (msgId: string) => {
    setReactionPickerFor((prev) => prev === msgId ? null : msgId);
  };

  // ── 렌더 ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-white">

      {/* 메시지 목록 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4"
        onClick={() => setReplyTo(null)}
      >
        {messages.map((msg, i) => {
          const isMe = msg.userId === currentUserId;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const isFirst = !prev || prev.userId !== msg.userId;
          const isLast  = !next || next.userId !== msg.userId;
          const hasReactions = Object.keys(msg.reactions).length > 0;
          const isHovered  = hoveredId === msg.id;
          const isHighlighted = highlightedId === msg.id;
          const color = avatarColor(msg.userId);

          /* ── 내 메시지 (오른쪽): [답장][감정][버블] ── */
          if (isMe) {
            return (
              <div
                id={`msg-${msg.id}`}
                key={msg.id}
                className={`${isFirst ? 'mt-3' : 'mt-0.5'} rounded-xl transition-colors duration-300 ${isHighlighted ? 'bg-indigo-50' : ''}`}
                onMouseEnter={() => setHoveredId(msg.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <div className="flex justify-end items-end gap-1 pr-1">
                  {/* 시간 / 액션 버튼 영역 */}
                  <div className="flex items-center gap-1 self-end mb-1">
                    {isHovered ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setReplyTo(msg); textareaRef.current?.focus(); }}
                          title="답장"
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-white border border-[#E2E8F4] shadow-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 5v7H4M8 8l-4 4 4 4" />
                          </svg>
                        </button>
                        {/* 감정 버튼 — 버블 바로 왼쪽 위에 피커 */}
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePicker(msg.id); }}
                            title="반응 추가"
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-white border border-[#E2E8F4] text-[14px] shadow-sm hover:bg-gray-50"
                          >🙂</button>
                          {reactionPickerFor === msg.id && (
                            <div
                              ref={pickerRef}
                              className="absolute bottom-full right-0 mb-1.5 flex gap-1.5 rounded-2xl bg-white border border-[#E2E8F4] shadow-lg px-3 py-2 z-50"
                            >
                              {EMOJIS.map((e) => (
                                <button
                                  key={e}
                                  onMouseDown={(ev) => { ev.preventDefault(); toggleReaction(msg.id, e); }}
                                  className="text-xl hover:scale-125 transition-transform leading-none"
                                >{e}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : isLast ? (
                      <span className="text-xs text-[#9AAAC0]">{msg.timestamp}</span>
                    ) : null}
                  </div>
                  <div className="max-w-[70%]">
                    {msg.replyTo && (
                      <button
                        onClick={(e) => { e.stopPropagation(); scrollToMessage(msg.replyTo!.id); }}
                        className="mb-1 w-full text-left rounded-xl rounded-tr-sm bg-[#ede9fb] border-l-[3px] border-[#5044e3] px-3 py-1.5 hover:bg-[#e4dff8] transition-colors cursor-pointer"
                      >
                        <p className="text-[12px] font-semibold text-[#5044e3]">{msg.replyTo.senderName}의 메시지</p>
                        <p className="text-[13px] text-[#7c72d6] truncate">{msg.replyTo.content}</p>
                      </button>
                    )}
                    <div className="rounded-2xl rounded-tr-sm bg-[#5044e3] px-4 py-2.5 text-[16px] leading-relaxed text-white">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {hasReactions && (
                      <div className="mt-1 flex flex-wrap justify-end gap-1">
                        {Object.entries(msg.reactions).map(([emoji, data]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[13px] border transition-colors ${
                              data.reactedByMe ? 'bg-[#D4E4F4] border-[#6E8EAA] text-[#2E5068]' : 'bg-white border-[#E2E8F4] text-gray-500 hover:bg-gray-50'
                            }`}
                          >{emoji} <span>{data.count}</span></button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          /* ── 팀원 메시지 (왼쪽): [버블][감정][답장] ── */
          return (
            <div
              id={`msg-${msg.id}`}
              key={msg.id}
              className={`${isFirst ? 'mt-3' : 'mt-0.5'} rounded-xl transition-colors duration-300 ${isHighlighted ? 'bg-indigo-50' : ''}`}
              onMouseEnter={() => setHoveredId(msg.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="flex items-start gap-2 pl-1">
                <div className="w-9 shrink-0">
                  {isFirst ? (
                    msg.avatarUrl ? (
                      <img src={msg.avatarUrl} alt={msg.senderName} className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${color} text-[14px] font-bold text-white`}>
                        {initials(msg.senderName)}
                      </div>
                    )
                  ) : (
                    <div className="w-9 h-9" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {isFirst && (
                    <p className="mb-1.5 text-[14px] font-semibold text-[#3A4560]">{msg.senderName}</p>
                  )}
                  <div className="flex items-end gap-1">
                    <div className="max-w-[70%]">
                      {msg.replyTo && (
                        <button
                          onClick={(e) => { e.stopPropagation(); scrollToMessage(msg.replyTo!.id); }}
                          className="mb-1 w-full text-left rounded-xl rounded-tl-sm border-l-[3px] border-[#a0aec0] bg-[#f0f4f9] px-3 py-1.5 hover:bg-[#e6edf5] transition-colors cursor-pointer"
                        >
                          <p className="text-[12px] font-semibold text-[#5a6a88]">{msg.replyTo.senderName}의 메시지</p>
                          <p className="text-[13px] text-[#7a8aa8] truncate">{msg.replyTo.content}</p>
                        </button>
                      )}
                      <div className="rounded-2xl rounded-tl-sm bg-[#e9eaec] px-4 py-2.5 text-[16px] leading-relaxed text-[#2d3339]">
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {hasReactions && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(msg.reactions).map(([emoji, data]) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[13px] border transition-colors ${
                                data.reactedByMe ? 'bg-[#D4E4F4] border-[#6E8EAA] text-[#2E5068]' : 'bg-white border-[#E2E8F4] text-gray-500 hover:bg-gray-50'
                              }`}
                            >{emoji} <span>{data.count}</span></button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* 시간 / 액션 버튼 영역 */}
                    <div className="flex items-center gap-1 self-end mb-1">
                      {isHovered ? (
                        <>
                          {/* 감정 버튼 — 버블 바로 오른쪽 위에 피커 */}
                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); togglePicker(msg.id); }}
                              title="반응 추가"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-white border border-[#E2E8F4] text-[14px] shadow-sm hover:bg-gray-50"
                            >🙂</button>
                            {reactionPickerFor === msg.id && (
                              <div
                                ref={pickerRef}
                                className="absolute bottom-full left-0 mb-1.5 flex gap-1.5 rounded-2xl bg-white border border-[#E2E8F4] shadow-lg px-3 py-2 z-50"
                              >
                                {EMOJIS.map((e) => (
                                  <button
                                    key={e}
                                    onMouseDown={(ev) => { ev.preventDefault(); toggleReaction(msg.id, e); }}
                                    className="text-xl hover:scale-125 transition-transform leading-none"
                                  >{e}</button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setReplyTo(msg); textareaRef.current?.focus(); }}
                            title="답장"
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-white border border-[#E2E8F4] shadow-sm text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 5v7H4M8 8l-4 4 4 4" />
                            </svg>
                          </button>
                        </>
                      ) : isLast ? (
                        <span className="text-xs text-[#B0BEDA]">{msg.timestamp}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 답장 미리보기 */}
      {replyTo && (
        <div className="shrink-0 bg-white px-4 pt-2 pb-0 flex items-center gap-2">
          <div className="flex-1 min-w-0 rounded-xl bg-[#f0f2ff] border-l-[3px] border-[#5044e3] px-3 py-1.5">
            <p className="text-[13px] font-semibold text-[#5044e3]">{replyTo.senderName}에게 답장</p>
            <p className="text-[13px] text-[#7c72d6] truncate">{replyTo.content}</p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="shrink-0 rounded-full p-1 text-[#9AAAC0] hover:text-[#3A4560]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* 입력창 */}
      <div className="bg-white px-4 pt-2 pb-5" style={{ borderTop: "1px solid rgba(173,178,186,0.2)" }}>
        <div className="flex items-center gap-2">
          {/* 마이크 버튼 */}
          <button
            onClick={toggleRecording}
            title={isRecording ? '녹음 중지' : '음성 입력 (한국어)'}
            className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-full transition-all ${
              isRecording
                ? 'bg-red-100 text-red-500 shadow-md shadow-red-100 animate-pulse'
                : 'bg-[#f1f4f9] text-[#5a6066] hover:bg-[#e5e9f0] hover:text-[#5044e3]'
            }`}
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1a4 4 0 00-4 4v7a4 4 0 008 0V5a4 4 0 00-4-4z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 008 8.94V23h2v-2.06A9 9 0 0021 12v-2h-2z" />
            </svg>
          </button>
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); finalTranscriptRef.current = e.target.value; }}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? '🎙️ 음성 인식 중...' : '메시지를 입력하세요...'}
              rows={1}
              className="w-full resize-none rounded-full bg-[#f1f4f9] pl-5 pr-12 py-3 text-[15px] text-[#2d3339] placeholder-[#adb2ba] outline-none border-none min-h-[48px] focus:ring-2 focus:ring-[#5044e3]/20"
            />
            {input.trim() && (
              <button
                onClick={sendMessage}
                disabled={sending}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#5044e3] to-[#4335d6] text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {isRecording && (
          <p className="mt-1.5 text-center text-[12px] text-red-400 animate-pulse">
            🎙️ 음성 인식 중 — 한국어로 말씀하세요. 버튼을 다시 누르면 중지됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
