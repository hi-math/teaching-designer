import { beforeEach, describe, expect, it, vi } from "vitest";
import { addLink, emptyDraft, type IdeationDraft } from "../model";
import { getCoreIdeas } from "@/lib/curriculumCatalog";
import { getStandards } from "@/lib/standards";

const mock = vi.hoisted(() => ({ authorize: vi.fn(), json: vi.fn(), rpc: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/ideation/server", async () => {
  const { getCoreIdeas } = await import("@/lib/curriculumCatalog");
  const { getStandards } = await import("@/lib/standards");
  return {
    authorizeIdeation: mock.authorize,
    readDataVersion: async () => "v-test",
    loadCatalog: () => ({ ideas: getCoreIdeas(), standards: getStandards().map(({ code, subject, domain, content, keywords, explanation, grade_group }) => ({ code, subject, domain, content, keywords, explanation, grade_group })) }),
  };
});
vi.mock("@/lib/llmJson", () => ({ requestJson: mock.json, describeApiError: (_: unknown, text: string) => text }));
vi.mock("openai", () => ({ default: class {} }));
import { POST as recommend } from "@/app/api/ideation/route";
import { POST as save } from "@/app/api/ideation/save/route";

const lessonId = "00000000-0000-0000-0000-000000000000";
const request = (body: unknown) => new Request("http://localhost/api/ideation", { method: "POST", body: JSON.stringify(body) });
const science = getCoreIdeas().filter((i) => i.subject === "과학");
const sciStandard = getStandards().find((s) => s.subject === "과학")!;
type Schema = { properties: Record<string, { items: { properties: Record<string, { enum?: unknown[] }> } }> };
const enumOf = (call: number, list: string, key: string) => (mock.json.mock.calls[call][1] as { schema: Schema }).schema.properties[list].items.properties[key].enum as string[];

function draft(): IdeationDraft {
  let d = emptyDraft({ subjects: ["과학"], grade: "중2" }, {
    topic: "우리 동네 폭염에 어떻게 대응할까?",
    ideas: [{ catalogId: science[0].id, subject: science[0].subject, domain: science[0].domain, content: science[0].content }],
    standards: [{ code: sciStandard.code, subject: sciStandard.subject, domain: sciStandard.domain, content: sciStandard.content }],
  });
  d = { ...d, elements: [{ id: "el_a", text: "폭염의 원인", via: "manual" }] };
  return addLink(d, "elementIdea", "el_a", d.ideas[0].id);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CHATGPT_API_KEY = "test";
  mock.authorize.mockResolvedValue({ supabase: { rpc: mock.rpc, from: () => ({ select: () => ({ eq: () => ({ in: mock.select }) }) }) }, user: { id: "owner" } });
  mock.rpc.mockResolvedValue({ error: null });
});

describe("with AI 추천 (우선순위 큐)", () => {
  it("로그인·소유자 확인을 AI 호출보다 먼저 한다", async () => {
    mock.authorize.mockResolvedValue({ error: Response.json({ error: "로그인 필요" }, { status: 401 }) });
    expect((await recommend(request({ lessonId, focus: "topic", draft: draft() }))).status).toBe(401);
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("영역이 잘못됐거나 초안이 비어 있으면 AI 를 부르지 않는다", async () => {
    expect((await recommend(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await recommend(request({ lessonId, focus: "invented", draft: draft() }))).status).toBe(400);
    const empty = emptyDraft({ subjects: [], grade: "" });
    const res = await recommend(request({ lessonId, focus: "topic", draft: empty }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("주제 제목을 먼저 입력하세요.");
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("세 목록을 순서 그대로 돌려주되, 지어낸 ID·없는 연결 대상은 걸러 내고 원문은 데이터에서 채운다", async () => {
    const d = draft();
    const pick = science[1];
    mock.json.mockImplementation(async (_c: unknown, params: { schema: Schema }) => {
      const code = params.schema.properties.standards.items.properties.code.enum![0] as string;
      return { ok: true, value: {
        elements: [
          { text: "취약한 사람과 공간", ideaId: d.ideas[0].id, strength: 3, reason: "영향을 받는 대상" },
          { text: "폭염의 원인", ideaId: "", strength: 2, reason: "이미 있는 하위요소" },
        ],
        ideas: [
          { ideaId: pick.id, elementId: "el_a", standardId: "[없는코드]", strength: 3, reason: "원인 탐구의 바탕" },
          { ideaId: "만든__아이디어__0", elementId: "", standardId: "", strength: 2, reason: "x" },
        ],
        standards: [{ code, ideaId: "id_gone", strength: 9, reason: "관련" }, { code: "[9가짜01-01]", ideaId: "", strength: 2, reason: "x" }],
      } };
    });
    const res = await recommend(request({ lessonId, focus: "topic", targetId: "el_a", draft: d }));
    const body = await res.json();
    expect(body.elements).toEqual([{ text: "취약한 사람과 공간", ideaId: d.ideas[0].id, strength: 3, reason: "영향을 받는 대상" }]);
    expect(body.ideas).toEqual([{ catalogId: pick.id, subject: pick.subject, domain: pick.domain, content: pick.content, elementId: "el_a", standardId: null, strength: 3, reason: "원인 탐구의 바탕" }]);
    expect(body.standards).toHaveLength(1);
    expect(body.standards[0]).toMatchObject({ ideaId: null, strength: 2 });
    expect(getStandards().some((s) => s.code === body.standards[0].code && s.content === body.standards[0].content)).toBe(true);
  });

  it("이미 담은 항목은 후보에서 빼고 조건의 교과로 좁힌다", async () => {
    mock.json.mockResolvedValue({ ok: true, value: { elements: [], ideas: [], standards: [] } });
    await recommend(request({ lessonId, focus: "ideas", targetId: draft().ideas[0].id, draft: draft() }));
    const ideaIds = enumOf(0, "ideas", "ideaId");
    expect(ideaIds).not.toContain(science[0].id);
    expect(ideaIds.every((id) => id.startsWith("과학__"))).toBe(true);
    expect(enumOf(0, "standards", "code")).not.toContain(sciStandard.code);
  });
});

describe("진행 저장·반영", () => {
  it("저장할 때 공식 원문을 데이터와 맞추고 데이터 버전을 남긴다", async () => {
    const d = draft();
    const tampered = { ...d, standards: d.standards.map((s) => ({ ...s, content: "바꿔 친 원문" })) };
    const res = await save(request({ lessonId, action: "save", draft: tampered, expectedDraft: null }));
    expect(res.status).toBe(200);
    const fields = (await res.json()).changes.__ideation.fields as IdeationDraft;
    expect(fields.standards[0].content).toBe(sciStandard.content);
    expect(fields.dataVersion).toBe("v-test");
    expect(mock.rpc).toHaveBeenCalledWith("commit_ideation", expect.objectContaining({ p_expected: { __ideation: null } }));
  });

  it("다른 창의 변경과 충돌하면 409, 020 마이그레이션이 없으면 안내와 함께 503", async () => {
    mock.rpc.mockResolvedValueOnce({ error: { code: "P0001", message: "Ideation conflict" } });
    expect((await save(request({ lessonId, action: "save", draft: draft(), expectedDraft: null }))).status).toBe(409);
    mock.rpc.mockResolvedValueOnce({ error: { code: "P0001", message: "Invalid activity" } });
    const res = await save(request({ lessonId, action: "save", draft: draft(), expectedDraft: null }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("020_ideation_selected_ideas.sql");
  });

  it("반영은 바뀌는 행만 기대값과 함께 한 번에 넘긴다", async () => {
    const before = { "A-2": null, "A-3": null, "A-4": null, __selected_standards: null, __selected_ideas: null, __ideation: null };
    const res = await save(request({ lessonId, action: "apply", draft: draft(), before }));
    expect(res.status).toBe(200);
    const { p_changes, p_expected } = mock.rpc.mock.calls[0][1];
    expect(Object.keys(p_changes).sort()).toEqual(Object.keys(p_expected).sort());
    expect(Object.keys(p_changes)).toEqual(expect.arrayContaining(["A-2", "A-3", "A-4", "__selected_ideas", "__selected_standards", "__ideation"]));
  });
});
