import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: { id: "u1" } as null | { id: string },
  lesson: { id: "lesson", owner_id: "owner" } as null | { id: string; owner_id: string },
  member: null as null | { id: string },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mock.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => table === "lessons"
          ? { single: async () => ({ data: mock.lesson }) }
          : { eq: () => ({ maybeSingle: async () => ({ data: mock.member }) }) },
      }),
    }),
  }),
}));
import { authorizeIdeation } from "../server";

const lessonId = "00000000-0000-0000-0000-000000000000";

beforeEach(() => {
  mock.user = { id: "u1" };
  mock.lesson = { id: lessonId, owner_id: "owner" };
  mock.member = null;
});

describe("아이디어 도출 권한", () => {
  it("소유자는 저장·반영과 with AI 모두", async () => {
    mock.user = { id: "owner" };
    expect((await authorizeIdeation(lessonId)).error).toBeUndefined();
    expect((await authorizeIdeation(lessonId, "member")).error).toBeUndefined();
  });

  it("참여자는 with AI 만 — 저장·반영은 소유자만", async () => {
    mock.member = { id: "m1" };
    expect((await authorizeIdeation(lessonId, "member")).error).toBeUndefined();
    expect((await authorizeIdeation(lessonId)).error?.status).toBe(403);
  });

  it("참여자가 아니거나 로그인하지 않았으면 막는다", async () => {
    expect((await authorizeIdeation(lessonId, "member")).error?.status).toBe(403);
    mock.user = null;
    expect((await authorizeIdeation(lessonId, "member")).error?.status).toBe(401);
  });
});
