'use client';

import Markdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkGfm from 'remark-gfm';
import remarkTitles, { separateTitleLines } from '@/lib/chat/remarkTitles';

/**
 * Minerva AI 답변의 마크다운을 채팅 패널 폭에 맞춰 그린다.
 *
 * - 소제목(타이틀)은 불릿 없이 굵게 — 크기는 키우지 않는다 (패널이 좁다). 찾는 규칙은 remarkTitles
 * - 문장 안의 굵은 글씨는 "중요한 용어" — 빨간색으로 강조
 * - 표는 가로로 넘겨 볼 수 있게 감싸고, 칸이 한 글자씩 세로로 서지 않게 최소 폭을 둔다
 * - HTML 은 그리지 않는다 (react-markdown 기본값 — rehype-raw 를 붙이지 말 것)
 * - 한 줄 바꿈은 그대로 줄바꿈 (remark-breaks)
 * - **"평가 질문"**이 처럼 한글 조사가 붙은 굵은 글씨도 ** 가 남지 않게 (remark-cjk-friendly)
 * - 응답이 흐르는 중 닫히지 않은 ** 같은 기호는 닫힐 때까지 글자로 보였다가 자연스럽게 바뀐다
 */

const heading = 'mt-3 mb-1 first:mt-0 text-[15px] font-bold text-[#2d3339] [&_strong]:text-inherit';

const components: Components = {
  h1: ({ children }) => <p className={heading}>{children}</p>,
  h2: ({ children }) => <p className={heading}>{children}</p>,
  h3: ({ children }) => <p className={heading}>{children}</p>,
  h4: ({ children }) => <p className={heading}>{children}</p>,
  h5: ({ children }) => <p className={heading}>{children}</p>,
  h6: ({ children }) => <p className={heading}>{children}</p>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[#D1260F]">{children}</strong>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0 marker:text-[#F0603C]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0 marker:font-semibold marker:text-[#757b82]">{children}</ol>,
  // 소제목으로 시작하는 항목(예전 형식의 "- 잘 맞는 점" + 하위 불릿)은 불릿을 떼고 목록 왼쪽 끝에 맞춘다
  li: ({ node, children }) => {
    const first = node?.children.find((c) => c.type === 'element');
    const titled = first?.type === 'element' && /^h[1-6]$/.test(first.tagName);
    return (
      <li className={`[&>ol]:mt-1 [&>ul]:mt-1 [&>p]:mb-1 ${titled ? '-ml-5 list-none' : 'pl-0.5'}`}>{children}</li>
    );
  },
  hr: () => <div className="my-3 h-px bg-[#eef0f4]" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-[#F5B8A8] pl-3 text-[#5a6066]">{children}</blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#D1260F] underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-[#f1f4f9] px-1 py-0.5 text-[13px]">{children}</code>,
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-[#f1f4f9] p-3 text-[13px] [&_code]:bg-transparent [&_code]:p-0">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto rounded-lg border border-[#eef0f4]">
      <table className="w-full border-collapse text-[13.5px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="min-w-[6rem] whitespace-nowrap bg-[#f8f9fd] px-2.5 py-1.5 text-left font-semibold text-[#5a6066]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="min-w-[6rem] border-t border-[#eef0f4] px-2.5 py-1.5 align-top">{children}</td>
  ),
};

// 한 줄 바꿈도 줄바꿈으로 — 예전처럼 AI 가 줄마다 나눠 쓴 문장이 한 문단으로 합쳐지지 않게
const plugins = [remarkGfm, remarkCjkFriendly, remarkBreaks, remarkTitles];

export default function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="break-keep text-[15px] leading-relaxed text-[#2d3339] [overflow-wrap:anywhere]">
      <Markdown remarkPlugins={plugins} components={components}>
        {separateTitleLines(text)}
      </Markdown>
    </div>
  );
}
