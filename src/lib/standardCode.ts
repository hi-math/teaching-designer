// 성취기준 코드 표기 도우미
// 원본 데이터(standards_middle.json)의 code 는 이미 "[9수01-02]" 처럼 대괄호를 포함한다.
// 여기에 또 대괄호를 씌우면 "[[9수01-02]]" 가 되므로, 코드를 다룰 때는 이 함수들을 거친다.

/** 대괄호가 있든 없든 "[코드]" 한 겹으로 */
export function bracketCode(code: string): string {
  return `[${code.replace(/^\[+|\]+$/g, '').trim()}]`;
}

/** 본문 속 "[[코드]]" 를 "[코드]" 로 — 예전에 두 겹으로 저장된 값 정리용 */
export function fixDoubleBrackets(text: string): string {
  return text.replace(/\[{2,}([^[\]\n]+)\]{2,}/g, '[$1]');
}

/** 본문에서 대괄호 코드만 뽑는다 (겹친 대괄호도 한 겹으로) */
export function extractCodes(text: string): string[] {
  return [...text.matchAll(/\[+([^[\]\n]+)\]+/g)].map((m) => `[${m[1].trim()}]`);
}
