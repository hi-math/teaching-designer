import { beforeEach, describe, expect, it, vi } from "vitest";
import { readVisionRow, visionCode } from "../vision";

const mock = vi.hoisted(() => ({ user: null as null | { id: string }, rows: [] as { activity_code: string; content: unknown }[], json: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mock.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ like: async () => ({ data: mock.rows, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/llmJson", () => ({ requestJson: mock.json, describeApiError: (_: unknown, text: string) => text }));
vi.mock("openai", () => ({ default: class {} }));
import { POST } from "@/app/api/vision-keywords/route";

const lessonId = "00000000-0000-0000-0000-000000000000";
const request = (body: unknown) => new Request("http://localhost/api/vision-keywords", { method: "POST", body: JSON.stringify(body) });

describe("개인별 교육비전 행", () => {
  it("작성자와 항목을 읽고, 깨진 항목은 버린다", () => {
    expect(readVisionRow(visionCode("u1"), { items: [{ id: "a", text: "삶과 연결" }, { id: 3, text: "x" }, null] }))
      .toEqual({ userId: "u1", items: [{ id: "a", text: "삶과 연결" }] });
    expect(readVisionRow("T-1", { items: [] })).toBeNull();
    expect(readVisionRow("T-1__vision_", { items: [] })).toBeNull();
  });
});

describe("비전 키워드 생성", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CHATGPT_API_KEY = "test";
    mock.user = { id: "me" };
    mock.rows = [
      { activity_code: visionCode("kim"), content: { items: [{ id: "k", text: "삶과 연결된 배움" }] } },
      { activity_code: visionCode("me"), content: { items: [{ id: "m", text: "예전에 저장된 내 비전" }] } },
    ];
  });

  it("로그인을 먼저 확인한다", async () => {
    mock.user = null;
    expect((await POST(request({ lessonId }))).status).toBe(401);
    expect(mock.json).not.toHaveBeenCalled();
  });

  it("다른 참가자 비전은 DB 에서, 내 비전은 아직 저장 전일 수 있어 요청에 실린 값으로", async () => {
    mock.json.mockResolvedValueOnce({ ok: true, value: { keywords: [" 삶과 연결 ", "삶과 연결", "", "스스로 묻는 학생"] } });
    const res = await POST(request({ lessonId, mine: [{ id: "m", text: "방금 쓴 내 비전" }] }));
    expect((await res.json()).keywords).toEqual(["삶과 연결", "스스로 묻는 학생"]);
    const prompt = JSON.parse((mock.json.mock.calls[0][1] as { prompt: string }).prompt);
    expect(prompt.visions).toEqual(["삶과 연결된 배움", "방금 쓴 내 비전"]);
  });

  it("비전이 하나도 없으면 AI 를 부르지 않는다", async () => {
    mock.rows = [];
    const res = await POST(request({ lessonId, mine: [{ id: "m", text: "  " }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("개인별 교육비전을 먼저 입력하세요.");
    expect(mock.json).not.toHaveBeenCalled();
  });
});
