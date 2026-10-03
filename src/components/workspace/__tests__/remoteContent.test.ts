import { describe, expect, it } from "vitest";
import { LLM_MODEL_ROW } from "@/lib/llmModels";
import { localWriteKey, readRemoteContent, stableStringify } from "../remoteContent";

const idle = { pending: false, lastWrite: undefined };

describe("stableStringify", () => {
  it("key 순서가 달라도 같은 문자열", () => {
    expect(stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: "t" } })).toBe(
      stableStringify({ a: { c: "t", d: [1, { x: 1, y: 2 }] }, b: 1 }),
    );
  });
  it("값이 다르면 다른 문자열", () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
  });
});

describe("readRemoteContent", () => {
  it("다른 참여자의 구조화 카드 입력을 반영한다", () => {
    const fields = { vision: "함께 탐구하는 수업", vision_note: "" };
    expect(readRemoteContent("T-1", { type: "structured", fields, status: "active" }, idle)).toEqual({
      kind: "card",
      code: "T-1",
      status: "active",
      fields,
    });
  });

  it("내 저장의 에코는 key 순서가 바뀌어 와도 무시한다", () => {
    const mine = { vision: "a", vision_note: "b" };
    const echo = { vision_note: "b", vision: "a" };
    const r = readRemoteContent("T-1", { type: "structured", fields: echo, status: "active" }, {
      pending: false,
      lastWrite: localWriteKey({ fields: mine }),
    });
    expect(r).toEqual({ kind: "card", code: "T-1", status: "active" });
  });

  it("내가 편집 중이면 내용은 두고 상태만 반영한다", () => {
    const r = readRemoteContent("A-1", { type: "structured", fields: { x: "남의 입력" }, status: "completed" }, {
      pending: true,
      lastWrite: undefined,
    });
    expect(r).toEqual({ kind: "card", code: "A-1", status: "completed" });
  });

  it("텍스트 카드는 기존처럼 반영하고 에코는 무시한다", () => {
    expect(readRemoteContent("X-1", { type: "text", text: "새 글", status: "active" }, idle)).toMatchObject({ text: "새 글" });
    expect(readRemoteContent("X-1", { type: "text", text: "내 글" }, { pending: false, lastWrite: "내 글" })).toEqual({
      kind: "card",
      code: "X-1",
      status: null,
    });
  });

  it("선택한 성취기준·핵심 아이디어", () => {
    const items = [{ code: "[9수01-01]" }];
    expect(readRemoteContent("__selected_standards", { type: "standards", items }, idle)).toEqual({
      kind: "selection",
      code: "__selected_standards",
      items,
    });
    expect(readRemoteContent("__selected_ideas", { type: "ideas" }, idle)).toEqual({ kind: "ignore" });
  });

  it("의견묻기 행은 무시하고, 모델 설정은 따로 알린다", () => {
    expect(readRemoteContent("T-1__1__opinion", { question: "q" }, idle)).toEqual({ kind: "ignore" });
    expect(readRemoteContent(LLM_MODEL_ROW, { model: "m" }, idle)).toEqual({ kind: "model", model: "m" });
  });
});
