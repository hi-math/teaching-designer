import type { Heading, Paragraph, Parent, PhrasingContent, Root } from 'mdast';

// 채팅 답변의 소제목(타이틀) 찾기 — 찾은 줄은 제목(heading)으로 바꿔 불릿 없이 굵게 그린다.
//
// 1) 한 줄 전체가 굵은 글씨뿐인 문단:  **잘 맞는 점**
// 2) 바로 아래에 목록이 오는 짧은 한 줄(문장부호로 끝나지 않음):  한 줄 총평\n- …
//    — 형식 지침이 바뀌기 전 답변(소제목을 굵게 하지 않거나 불릿을 붙인 것)도 같은 모양으로 보이게
//
// 문장 안의 굵은 글씨는 그대로 두고, 화면에서는 "중요한 용어" 빨간 강조로 그린다 (ChatMarkdown).

const TITLE_MAX = 30;

/** 문단이 굵은 글씨 하나뿐이면 그 안의 내용을 돌려준다 */
function onlyStrong(p: Paragraph): PhrasingContent[] | null {
  const kids = p.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  return kids.length === 1 && kids[0].type === 'strong' ? kids[0].children : null;
}

/** 목록 바로 위의 짧은 한 줄 — 콜론으로 끝나면 떼어 낸다 */
function shortLabel(p: Paragraph): PhrasingContent[] | null {
  if (p.children.length !== 1 || p.children[0].type !== 'text') return null;
  const text = p.children[0].value.trim();
  if (!text || text.length > TITLE_MAX || /[.!?。]$/.test(text)) return null;
  return [{ type: 'text', value: text.replace(/\s*:$/, '') }];
}

function walk(parent: Parent) {
  parent.children.forEach((node, i) => {
    if (node.type === 'paragraph') {
      const next = parent.children[i + 1];
      const content = onlyStrong(node) ?? (next?.type === 'list' ? shortLabel(node) : null);
      if (content) {
        const heading: Heading = { type: 'heading', depth: 4, children: content };
        parent.children[i] = heading;
      }
    } else if (node.type === 'list' || node.type === 'listItem' || node.type === 'blockquote') {
      walk(node);
    }
  });
}

export default function remarkTitles() {
  return (tree: Root) => walk(tree);
}

/**
 * 굵은 소제목 줄이 목록 바로 다음 줄에 붙어 오면 마크다운에서는 앞 항목의 이어지는 글로 붙는다.
 * 파싱 전에 그런 줄 앞에 빈 줄을 하나 넣어 따로 떨어지게 한다.
 */
export function separateTitleLines(text: string): string {
  return text.replace(/([^\n])\n([ \t]*\*\*[^*\n]+\*\*[ \t]*)(?=\n|$)/g, '$1\n\n$2');
}
