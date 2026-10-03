export const CHAT_STREAM_ERROR_MARKER = '\u001e';

export type ChatStreamError = { message: string; code?: string };

/** A stream may contain partial assistant text followed by one terminal error frame. */
export function readChatStream(value: string): { text: string; error: ChatStreamError | null } {
  const at = value.indexOf(CHAT_STREAM_ERROR_MARKER);
  if (at < 0) return { text: value, error: null };
  try {
    const parsed = JSON.parse(value.slice(at + 1)) as ChatStreamError;
    if (typeof parsed.message === 'string') return { text: value.slice(0, at), error: parsed };
  } catch { /* The error frame may span multiple network chunks. */ }
  return { text: value.slice(0, at), error: null };
}
