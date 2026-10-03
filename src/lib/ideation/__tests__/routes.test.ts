import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDraft } from "../model";

const mock = vi.hoisted(() => ({ authorize: vi.fn(), graph: vi.fn(), json: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/ideation/server", () => ({ authorizeIdeation: mock.authorize, loadIdeationGraph: mock.graph }));
vi.mock("@/lib/llmJson", () => ({ requestJson: mock.json, describeApiError: (_: unknown, text: string) => text }));
import { POST as generate } from "@/app/api/ideation/route";
import { POST as save } from "@/app/api/ideation/save/route";

const conditions = { subjects: ["과학", "사회"], grade: "중2", sessions: 4, interest: "기후", criteria: ["교육과정 적합성"], vision: "지역 문제" };
const request = (body: unknown) => new Request("http://localhost/api/ideation", { method: "POST", body: JSON.stringify(body) });
function draft() { return { ...emptyDraft(conditions, ["a"]), datasetVersion: "v1" }; }

beforeEach(() => {
  vi.clearAllMocks();
  mock.authorize.mockResolvedValue({ supabase: { rpc: mock.rpc }, user: { id: "owner" } });
  mock.graph.mockResolvedValue({ manifest: { datasetVersion: "v1" }, nodes: [{ id: "a", subject: "과학", content: "과학 원문" }, { id: "b", subject: "사회", content: "사회 원문" }], edges: [{ id: "ab", source: "a", target: "b", dimension_weights: { content: 3, competency: 3, other: 3, learning_hierarchy: 0 }, evidence: { shared_topics: [], shared_competencies: [] } }] });
  mock.rpc.mockResolvedValue({ error: null });
});

describe("ideation route boundaries", () => {
  it("rejects unauthenticated requests before loading data or invoking AI", async () => {
    mock.authorize.mockResolvedValue({ error: Response.json({ error: "로그인 필요" }, { status: 401 }) });
    expect((await generate(request({ lessonId: "lesson", draft: draft() }))).status).toBe(401);
    expect(mock.graph).not.toHaveBeenCalled(); expect(mock.json).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and stale dataset versions", async () => {
    expect((await generate(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await generate(request({ lessonId: "lesson", draft: { ...draft(), datasetVersion: "old" } }))).status).toBe(409);
    expect(mock.json).not.toHaveBeenCalled();
  });
  it("rejects unknown standards and incomplete conditions before AI", async () => {
    expect((await generate(request({ lessonId: "lesson", draft: { ...draft(), seedIds: ["invented"] } }))).status).toBe(400);
    expect((await generate(request({ lessonId: "lesson", draft: { ...draft(), conditions: { ...conditions, criteria: [""] } } }))).status).toBe(400);
    expect(mock.json).not.toHaveBeenCalled();
  });
  it("saves with the expected previous draft and handles conflicts without retrying writes", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "P0001" } });
    const response = await save(request({ lessonId: "lesson", action: "save", draft: draft(), expectedDraft: null }));
    expect(response.status).toBe(409);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("commit_ideation", expect.objectContaining({ p_expected: { __ideation: null }, p_changes: { __ideation: { type: "structured", fields: draft() } } }));
  });
  it("explains the missing deployment migration and never reports success", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
    const response = await save(request({ lessonId: "lesson", action: "save", draft: draft() }));
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("019_ideation_commit.sql");
  });
  it("forbids apply without a reviewed snapshot", async () => {
    const response = await save(request({ lessonId: "lesson", action: "apply", draft: draft() }));
    expect(response.status).toBe(400); expect(mock.rpc).not.toHaveBeenCalled();
  });
});
