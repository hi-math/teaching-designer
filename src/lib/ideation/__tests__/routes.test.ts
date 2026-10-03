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
import { POST as suggest } from "@/app/api/ideation/route";
import { POST as save } from "@/app/api/ideation/save/route";

const lessonId = "00000000-0000-0000-0000-000000000000";
const request = (body: unknown) => new Request("http://localhost/api/ideation", { method: "POST", body: JSON.stringify(body) });
const science = getCoreIdeas().filter((i) => i.subject === "과학");
const sciStandard = getStandards().find((s) => s.subject === "과학")!;

function draft(): IdeationDraft {
  let d = emptyDraft({ subjects: ["과학"], grade: "중2" }, {
    topic: "폭염 대응",
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

describe("with AI 추천", () => {
  it("로그인·소유자 확인을 AI 호출보다 먼저 한다", async () => {
    mock.authorize.mockResolvedValue({ error: Response.json({ error: "로그인 필요" }, { status: 401 }) });
    expect((await suggest(request({ lessonId, direction: "element-ideas", targetId: "el_a", draft: draft() }))).status).toBe(401);
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("방향·대상이 잘못되면 AI 를 부르지 않는다", async () => {
    expect((await suggest(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await suggest(request({ lessonId, direction: "invented", targetId: "el_a", draft: draft() }))).status).toBe(400);
    expect((await suggest(request({ lessonId, direction: "element-ideas", targetId: "el_gone", draft: draft() }))).status).toBe(400);
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("하위요소 → 핵심아이디어: 후보 목록의 ID 만 받고, 지어낸 ID 는 버리며 원문은 데이터에서 채운다", async () => {
    const pick = science[1];
    mock.json.mockResolvedValue({ ok: true, value: { suggestions: [{ ideaId: pick.id, reason: "원인을 탐구하는 데 바탕" }, { ideaId: "만든__아이디어__0", reason: "x" }] } });
    const res = await suggest(request({ lessonId, direction: "element-ideas", targetId: "el_a", draft: draft() }));
    const body = await res.json();
    expect(body.suggestions).toEqual([{ catalogId: pick.id, subject: pick.subject, domain: pick.domain, content: pick.content, reason: "원인을 탐구하는 데 바탕" }]);
    const enumIds = mock.json.mock.calls[0][1].schema.properties.suggestions.items.properties.ideaId.enum as string[];
    // 이미 이 하위요소에 연결된 아이디어는 후보에서 빼고, 조건의 교과로 좁힌다
    expect(enumIds).not.toContain(science[0].id);
    expect(enumIds.every((id) => id.startsWith("과학__"))).toBe(true);
  });

  it("핵심아이디어 → 하위요소: 없는 하위요소를 고치라는 제안은 버리고 새 하위요소는 남긴다", async () => {
    const d = draft();
    mock.json.mockResolvedValue({ ok: true, value: { suggestions: [
      { kind: "revise", elementId: "el_gone", text: "고친 문장", reason: "" },
      { kind: "revise", elementId: "el_a", text: "폭염이 생기는 까닭", reason: "더 구체적" },
      { kind: "new", elementId: "", text: "취약한 사람과 공간", reason: "영향을 받는 대상" },
    ] } });
    const body = await (await suggest(request({ lessonId, direction: "idea-elements", targetId: d.ideas[0].id, draft: d }))).json();
    expect(body.suggestions).toEqual([
      { kind: "revise", elementId: "el_a", text: "폭염이 생기는 까닭", reason: "더 구체적" },
      { kind: "new", elementId: null, text: "취약한 사람과 공간", reason: "영향을 받는 대상" },
    ]);
  });

  it("핵심아이디어 → 성취기준: 데이터에 있는 코드만 돌려준다", async () => {
    const d = draft();
    mock.json.mockImplementation(async (_client: unknown, params: { schema: { properties: { suggestions: { items: { properties: { code: { enum: string[] } } } } } } }) => {
      const first = params.schema.properties.suggestions.items.properties.code.enum[0];
      return { ok: true, value: { suggestions: [{ code: first, reason: "관련" }, { code: "[9가짜01-01]", reason: "x" }] } };
    });
    const body = await (await suggest(request({ lessonId, direction: "idea-standards", targetId: d.ideas[0].id, draft: d }))).json();
    expect(body.suggestions).toHaveLength(1);
    expect(getStandards().some((s) => s.code === body.suggestions[0].code && s.content === body.suggestions[0].content)).toBe(true);
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
