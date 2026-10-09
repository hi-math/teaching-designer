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
import { POST as judgeFit } from "@/app/api/ideation/fit/route";

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
    expect((await res.json()).error).toBe("수업주제를 먼저 입력하세요.");
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("누른 영역의 목록만 돌려주되, 지어낸 ID·없는 연결 대상은 걸러 내고 원문은 데이터에서 채운다", async () => {
    const d = draft();
    const pick = science[1];
    mock.json.mockResolvedValueOnce({ ok: true, value: {
      elements: [
        { text: "취약한 사람과 공간", ideaId: d.ideas[0].id, strength: 3, reason: "영향을 받는 대상", score: 3 },
        { text: "폭염의 원인", ideaId: "", strength: 2, reason: "이미 있는 하위요소", score: 3 },
      ],
      fits: [],
    } });
    let body = await (await recommend(request({ lessonId, focus: "topic", draft: d }))).json();
    expect(body.elements).toEqual([{ text: "취약한 사람과 공간", ideaId: d.ideas[0].id, strength: 3, reason: "영향을 받는 대상", score: 3 }]);
    expect(body.ideas).toEqual([]);
    expect(body.standards).toEqual([]);

    mock.json.mockResolvedValueOnce({ ok: true, value: {
      ideas: [
        { ideaId: pick.id, elementId: "el_a", standardId: "[없는코드]", strength: 3, reason: "원인 탐구의 바탕", score: 3 },
        { ideaId: "만든__아이디어__0", elementId: "", standardId: "", strength: 2, reason: "x", score: 3 },
      ],
      fits: [],
    } });
    body = await (await recommend(request({ lessonId, focus: "ideas", draft: d }))).json();
    expect(body.ideas).toEqual([{ catalogId: pick.id, subject: pick.subject, domain: pick.domain, content: pick.content, elementId: "el_a", standardId: null, strength: 3, reason: "원인 탐구의 바탕", score: 3 }]);
    expect(body.elements).toEqual([]);

    mock.json.mockImplementationOnce(async (_c: unknown, params: { schema: Schema }) => {
      const code = params.schema.properties.standards.items.properties.code.enum![0] as string;
      return { ok: true, value: { standards: [{ code, ideaId: "id_gone", strength: 9, reason: "관련", score: 3 }, { code: "[9가짜01-01]", ideaId: "", strength: 2, reason: "x", score: 3 }], fits: [] } };
    });
    body = await (await recommend(request({ lessonId, focus: "standards", draft: d }))).json();
    expect(body.standards).toHaveLength(1);
    expect(body.standards[0]).toMatchObject({ ideaId: null, strength: 2 });
    expect(getStandards().some((s) => s.code === body.standards[0].code && s.content === body.standards[0].content)).toBe(true);
  });

  it("적합성이 낮은 후보는 추천하지 않고, 추천의 적합성을 함께 돌려준다", async () => {
    const d = draft();
    const [low, mid] = science.slice(1, 3);
    mock.json.mockResolvedValueOnce({ ok: true, value: { ideas: [
      { ideaId: low.id, elementId: "", standardId: "", strength: 2, reason: "거리가 멂", score: 1 },
      { ideaId: mid.id, elementId: "el_a", standardId: "", strength: 2, reason: "보조적으로 관련", score: 2 },
    ], fits: [] } });
    const body = await (await recommend(request({ lessonId, focus: "ideas", draft: d }))).json();
    expect(body.ideas.map((i: { catalogId: string; score: number }) => [i.catalogId, i.score])).toEqual([[mid.id, 2]]);
    // 추천과 카드 적합성이 같은 기준을 쓴다
    const prompt = JSON.parse((mock.json.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt.instructions).toContain("score 가 1 인 후보는 추천하지 마세요");
    expect(prompt.instructions).toContain("인접 영역에 있는 교과도 맞는 것으로");
  });

  it("인접한 영역만 기준으로 보낸다", async () => {
    mock.json.mockResolvedValue({ ok: true, value: { elements: [], ideas: [], standards: [], fits: [] } });
    const d = draft();
    const sent = (call: number) => JSON.parse((mock.json.mock.calls[call][1] as { prompt: string }).prompt);
    await recommend(request({ lessonId, focus: "topic", draft: d }));
    await recommend(request({ lessonId, focus: "ideas", draft: d }));
    await recommend(request({ lessonId, focus: "standards", draft: d }));
    expect(Object.keys(sent(0).basis)).toEqual(["topic", "ideas"]);
    expect(Object.keys(sent(1).basis)).toEqual(["topic", "elements", "standards"]);
    expect(Object.keys(sent(2).basis)).toEqual(["ideas"]);
    // 누른 영역의 목록만 스키마에 있다
    expect(Object.keys((mock.json.mock.calls[2][1] as { schema: Schema }).schema.properties)).toEqual(["standards", "fits"]);
    // 인접 영역에서 고른 항목만 기준으로 좁힌다 (성취기준 영역에서 하위요소를 골랐으면 무시)
    await recommend(request({ lessonId, focus: "standards", targetId: "el_a", draft: d }));
    expect(sent(3).target).toBeNull();
    await recommend(request({ lessonId, focus: "standards", targetId: d.ideas[0].id, draft: d }));
    expect(sent(4).target).toContain("핵심아이디어");
  });

  it("누른 영역 카드의 적합성만 돌려주고, 없는 카드·범위 밖 점수·중복은 버린다", async () => {
    const d = draft();
    mock.json.mockResolvedValueOnce({ ok: true, value: { ideas: [], fits: [
      { id: d.ideas[0].id, score: 1, reason: "주제와 거리가 멉니다" },
      { id: d.ideas[0].id, score: 3, reason: "중복" },
      { id: "el_a", score: 3, reason: "다른 영역" },
      { id: "id_gone", score: 2, reason: "없는 카드" },
    ] } });
    const body = await (await recommend(request({ lessonId, focus: "ideas", draft: d }))).json();
    expect(body.fits).toEqual([{ id: d.ideas[0].id, score: 1, reason: "주제와 거리가 멉니다" }]);
    expect(enumOf(0, "fits", "id")).toEqual([d.ideas[0].id]);
  });

  it("수업주제가 비어 있으면 핵심아이디어·성취기준으로 수업주제 후보를 추천한다 (성취기준만 있어도)", async () => {
    const d = { ...draft(), topic: "" };
    mock.json.mockResolvedValueOnce({ ok: true, value: { topics: [
      { text: "우리 동네 폭염 지도 만들기", reason: "탐구와 지역 참여를 아우름" },
      { text: "우리 동네 폭염 지도 만들기", reason: "중복" },
      { text: "  ", reason: "빈 후보" },
    ] } });
    const body = await (await recommend(request({ lessonId, focus: "topic", draft: d }))).json();
    expect(body.topics).toEqual([{ text: "우리 동네 폭염 지도 만들기", reason: "탐구와 지역 참여를 아우름" }]);
    expect(body.elements).toEqual([]);
    const sent = mock.json.mock.calls[0][1] as { schema: Schema; prompt: string };
    expect(Object.keys(sent.schema.properties)).toEqual(["topics"]);
    expect(Object.keys(JSON.parse(sent.prompt).basis)).toEqual(["ideas", "standards"]);

    const onlyStandards = { ...d, ideas: [], elements: [], elementIdeaLinks: [], ideaStandardLinks: [] };
    mock.json.mockResolvedValueOnce({ ok: true, value: { topics: [] } });
    expect((await recommend(request({ lessonId, focus: "topic", draft: onlyStandards }))).status).toBe(200);
  });

  it("기준이 될 인접 영역이 비어 있으면 AI 를 부르지 않는다", async () => {
    const d = draft();
    const noIdeas = { ...d, ideas: [], elementIdeaLinks: [], ideaStandardLinks: [] };
    let res = await recommend(request({ lessonId, focus: "standards", draft: noIdeas }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("핵심아이디어가 1개 이상 필요합니다.");
    const noResources = { ...d, elements: [{ id: "el_a", text: "  ", via: "manual" as const }], standards: [], elementIdeaLinks: [], ideaStandardLinks: [] };
    res = await recommend(request({ lessonId, focus: "ideas", draft: noResources }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("하위요소 또는 성취기준이 1개 이상 필요합니다.");
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("이유·문장에 섞여 나온 카드 ID 는 교과·내용으로 바꾼다 (빠뜨려 쓴 ID 도)", async () => {
    const d = draft();
    const ideaId = d.ideas[0].id;
    const pick = science[1];
    mock.json.mockResolvedValueOnce({ ok: true, value: { ideas: [
      { ideaId: pick.id, elementId: "el_a", standardId: "", strength: 3, reason: `${ideaId.slice(0, -1)}와 el_a, ${pick.id}를 [9과01-01]로 잇는다`, score: 3 },
    ], fits: [{ id: ideaId, score: 2, reason: "id_0123456789ab 와 겹침" }] } });
    const body = await (await recommend(request({ lessonId, focus: "ideas", draft: d }))).json();
    expect(body.ideas[0].reason).toBe("과학 핵심아이디어와 ‘폭염의 원인’, 과학 핵심아이디어를 [9과01-01]로 잇는다");
    expect(body.fits[0].reason).toBe("핵심아이디어 와 겹침");
  });

  it("이미 담은 항목은 후보에서 빼고 조건의 교과로 좁힌다", async () => {
    mock.json.mockResolvedValue({ ok: true, value: { ideas: [], standards: [], fits: [] } });
    await recommend(request({ lessonId, focus: "ideas", draft: draft() }));
    const ideaIds = enumOf(0, "ideas", "ideaId");
    expect(ideaIds).not.toContain(science[0].id);
    expect(ideaIds.every((id) => id.startsWith("과학__"))).toBe(true);
    await recommend(request({ lessonId, focus: "standards", draft: draft() }));
    expect(enumOf(1, "standards", "code")).not.toContain(sciStandard.code);
  });
});

describe("빠진 교과 먼저", () => {
  const korean = getCoreIdeas().find((i) => i.subject === "국어")!;
  const withKorean = (): IdeationDraft => {
    const d = draft();
    return { ...d, ideas: [...d.ideas, { id: "id_ko", official: { catalogId: korean.id, subject: korean.subject, domain: korean.domain, content: korean.content }, revision: null, subject: korean.subject, via: "manual" }] };
  };

  it("핵심아이디어에는 있는데 성취기준에 없는 교과는 조건에 없어도 후보에 넣고 먼저 탐색하게 한다", async () => {
    mock.json.mockResolvedValue({ ok: true, value: { standards: [], fits: [] } });
    await recommend(request({ lessonId, focus: "standards", draft: withKorean() }));
    const prompt = JSON.parse((mock.json.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt.missingSubjects).toEqual(["국어"]);
    const codes = enumOf(0, "standards", "code");
    expect(codes.some((c) => getStandards().find((s) => s.code === c)?.subject === "국어")).toBe(true);
  });

  it("빠진 교과의 추천을 앞으로 올린다", async () => {
    mock.json.mockImplementation(async (_c: unknown, params: { schema: Schema }) => {
      const codes = params.schema.properties.standards.items.properties.code.enum as string[];
      const sci = codes.find((c) => getStandards().find((s) => s.code === c)?.subject === "과학")!;
      const ko = codes.find((c) => getStandards().find((s) => s.code === c)?.subject === "국어")!;
      return { ok: true, value: { standards: [{ code: sci, ideaId: "", strength: 2, reason: "a", score: 3 }, { code: ko, ideaId: "id_ko", strength: 2, reason: "b", score: 3 }], fits: [] } };
    });
    const body = await (await recommend(request({ lessonId, focus: "standards", draft: withKorean() }))).json();
    expect(body.standards.map((s: { subject: string }) => s.subject)).toEqual(["국어", "과학"]);
  });

  it("성취기준에는 있는데 핵심아이디어에 없는 교과도 같은 방식으로 찾는다", async () => {
    mock.json.mockResolvedValue({ ok: true, value: { ideas: [], fits: [] } });
    const koStandard = getStandards().find((s) => s.subject === "국어")!;
    const d = draft();
    const withKoStandard = { ...d, standards: [...d.standards, { id: koStandard.code, code: koStandard.code, subject: "국어", domain: koStandard.domain, content: koStandard.content, note: "", via: "manual" as const }] };
    await recommend(request({ lessonId, focus: "ideas", draft: withKoStandard }));
    const prompt = JSON.parse((mock.json.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt.missingSubjects).toEqual(["국어"]);
    expect(enumOf(0, "ideas", "ideaId").some((id) => id.startsWith("국어__"))).toBe(true);
  });
});

describe("적합성 자동 판단", () => {
  const fitRequest = (body: unknown) => new Request("http://localhost/api/ideation/fit", { method: "POST", body: JSON.stringify(body) });

  it("다시 검토할 연결도 함께 판정하고, 요청한 검토 연결만 돌려준다", async () => {
    const d = draft();
    const reviewed = { ...d, elements: [{ ...d.elements[0], text: "도시 열섬" }], elementIdeaLinks: d.elementIdeaLinks.map((l) => ({ ...l, review: true })) };
    const linkId = reviewed.elementIdeaLinks[0].id;
    mock.json.mockResolvedValueOnce({ ok: true, value: { fits: [], links: [
      { id: linkId, keep: true, strength: 3, reason: "열섬이 탐구 대상" },
      { id: "ln_other", keep: false, strength: 2, reason: "" },
    ] } });
    const res = await judgeFit(fitRequest({ lessonId, draft: reviewed, ids: [], links: [linkId] }));
    expect((await res.json()).links).toEqual([{ id: linkId, keep: true, strength: 3, reason: "열섬이 탐구 대상" }]);
    const prompt = JSON.parse((mock.json.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt.recheck).toEqual([expect.objectContaining({ id: linkId, from: "도시 열섬" })]);
  });

  it("로그인·소유자 확인을 먼저 하고, 주제가 없으면 AI 를 부르지 않는다", async () => {
    mock.authorize.mockResolvedValueOnce({ error: Response.json({ error: "로그인 필요" }, { status: 401 }) });
    expect((await judgeFit(fitRequest({ lessonId, draft: draft(), ids: ["el_a"] }))).status).toBe(401);
    const noTopic = { ...draft(), topic: "" };
    expect((await judgeFit(fitRequest({ lessonId, draft: noTopic, ids: ["el_a"] }))).status).toBe(400);
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("요청한 카드만 판단하고, 없는 카드·범위 밖 점수·중복은 버린다", async () => {
    const d = draft();
    mock.json.mockResolvedValueOnce({ ok: true, value: { fits: [
      { id: "el_a", score: 2, reason: "주제의 한 갈래" },
      { id: "el_a", score: 1, reason: "중복" },
      { id: d.ideas[0].id, score: 5, reason: "범위 밖" },
      { id: sciStandard.code, score: 3, reason: "요청하지 않은 카드" },
    ] } });
    const res = await judgeFit(fitRequest({ lessonId, draft: d, ids: ["el_a", d.ideas[0].id, "el_gone"] }));
    expect((await res.json()).fits).toEqual([{ id: "el_a", score: 2, reason: "주제의 한 갈래" }]);
    mock.json.mockResolvedValueOnce({ ok: true, value: { fits: [{ id: "el_a", score: 3, reason: `${d.ideas[0].id}의 원인 탐구로 이어짐` }] } });
    const again = await judgeFit(fitRequest({ lessonId, draft: d, ids: ["el_a"] }));
    expect((await again.json()).fits[0].reason).toBe("과학 핵심아이디어의 원인 탐구로 이어짐");
    expect(enumOf(0, "fits", "id")).toEqual(["el_a", d.ideas[0].id]);
  });

  it("판단할 카드가 없으면 AI 를 부르지 않는다", async () => {
    const res = await judgeFit(fitRequest({ lessonId, draft: draft(), ids: ["el_gone"] }));
    expect((await res.json()).fits).toEqual([]);
    expect(mock.json).not.toHaveBeenCalled();
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

  it("반영은 서버가 읽은 현재 값을 기대값으로, 바뀌는 행만 한 번에 넘긴다", async () => {
    mock.select.mockResolvedValueOnce({ data: [{ activity_code: "A-2", content: { type: "structured", fields: { final_topic: "예전 주제" } } }], error: null });
    const res = await save(request({ lessonId, action: "apply", draft: draft() }));
    expect(res.status).toBe(200);
    const { p_changes, p_expected } = mock.rpc.mock.calls[0][1];
    expect(Object.keys(p_changes).sort()).toEqual(Object.keys(p_expected).sort());
    expect(Object.keys(p_changes)).toEqual(expect.arrayContaining(["A-2", "A-3", "A-4", "__selected_ideas", "__selected_standards", "__ideation"]));
    expect(p_expected["A-2"]).not.toBeNull();
    expect(p_expected.__ideation).toBeNull();
    // 수업주제 → A-2 최종 선정 주제
    expect(p_changes["A-2"]).toMatchObject({ type: "structured", fields: { final_topic: "우리 동네 폭염에 어떻게 대응할까?" } });
  });

  it("미리보기 요청은 더 이상 받지 않는다", async () => {
    expect((await save(request({ lessonId, action: "preview", draft: draft() }))).status).toBe(400);
  });
});
