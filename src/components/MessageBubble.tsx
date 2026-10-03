'use client';

import { memo } from 'react';
import ChatMarkdown from './ChatMarkdown';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  message: Message;
  isFirst: boolean;
  isLast: boolean;
  isStreaming?: boolean;
  timestamp: string;
}

function MessageBubble({ message, isFirst, isLast, isStreaming, timestamp }: Props) {
  const isUser = message.role === 'user';

  /* ── 사용자 메시지: 말풍선 ── */
  if (isUser) {
    return (
      <div className={`flex justify-end ${isFirst ? 'mt-4' : 'mt-1'}`}>
        <div className="flex max-w-[78%] flex-col items-end">
          <div className="flex items-end gap-1.5">
            {isLast && <span className="mb-0.5 shrink-0 text-xs text-[#adb2ba]">{timestamp}</span>}
            <div className="rounded-xl rounded-br-sm bg-[#D1260F] px-4 py-3 text-[15px] leading-relaxed text-white">
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── AI 메시지: 말풍선 없이 ── */
  return (
    <div className={`flex items-start gap-3 ${isFirst ? 'mt-4' : 'mt-2'}`}>
      <div className="w-7 shrink-0 pt-0.5">
        {isFirst && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#D1260F] to-[#F0603C] text-[11px] font-bold text-white">
            M
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {isFirst && (
          <p className="mb-1.5 text-[14px] font-semibold text-[#35afa3]">Minerva AI</p>
        )}
        {isStreaming && !message.content ? (
          <div className="flex gap-1 py-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-[#F0603C] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        ) : (
          <ChatMarkdown text={message.content} />
        )}
        {isLast && <p className="mt-1.5 text-xs text-[#adb2ba]">{timestamp}</p>}
      </div>
    </div>
  );
}

// 스트리밍 중에는 마지막 말풍선만 매 청크 갱신된다.
// memo 가 없으면 그 사이 앞의 모든 말풍선까지 함께 다시 렌더된다.
export default memo(MessageBubble);
