import { IDEATION_ROW, readDraft } from "@/lib/ideation/model";
import { APPLICATION_ROWS, buildApplication, canonicalize, comparable, type ContentMap } from "@/lib/ideation/application";
import { authorizeIdeation, loadCatalog, readDataVersion } from "@/lib/ideation/server";

// 아이디어 도출 진행 저장(save) · 수업 설계 반영 미리보기(preview) · 반영(apply)
// 모두 commit_ideation 한 번으로 처리해 다른 창의 변경과 충돌하면 아무것도 바꾸지 않는다.

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 400_000) return Response.json({ error: "저장할 내용이 너무 큽니다." }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 }); }
    const auth = await authorizeIdeation(body?.lessonId);
    if (auth.error) return auth.error;
    const parsed = readDraft(body.draft);
    if (!parsed) return Response.json({ error: "아이디어 형식을 확인하세요." }, { status: 400 });
    const catalog = loadCatalog();
    // 공식 원문은 클라이언트가 보낸 글이 아니라 데이터에서 다시 채운다
    const draft = canonicalize(parsed, catalog, await readDataVersion());

    let changes: ContentMap;
    let expected: Record<string, unknown>;
    if (body.action === "save") {
      changes = { [IDEATION_ROW]: { type: "structured", fields: draft } };
      expected = { [IDEATION_ROW]: body.expectedDraft ?? null };
    } else if (body.action === "preview" || body.action === "apply") {
      let before: ContentMap;
      if (body.action === "preview") {
        const { data, error } = await auth.supabase.from("activity_contents").select("activity_code,content").eq("lesson_id", body.lessonId).in("activity_code", APPLICATION_ROWS);
        if (error) throw error;
        before = Object.fromEntries(APPLICATION_ROWS.map((code) => [code, data?.find((r) => r.activity_code === code)?.content ?? null]));
      } else {
        before = body.before;
        if (!before || APPLICATION_ROWS.some((code) => !(code in before))) return Response.json({ error: "반영 미리보기를 다시 확인하세요." }, { status: 400 });
      }
      try { changes = buildApplication(draft, catalog, before); }
      catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
      if (body.action === "preview") return Response.json({ before, changes });
      expected = Object.fromEntries(Object.keys(changes).map((code) => [code, comparable(before[code])]));
    } else return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });

    const { error } = await auth.supabase.rpc("commit_ideation", { p_lesson_id: body.lessonId, p_changes: changes, p_expected: expected });
    if (error) {
      if (error.code === "P0001" && /Invalid activity/.test(error.message ?? "")) return Response.json({ error: "아이디어 반영 기능의 DB 설정이 필요합니다. 관리자에게 020_ideation_selected_ideas.sql 적용을 요청하세요." }, { status: 503 });
      if (error.code === "P0001") return Response.json({ error: "다른 창에서 내용이 바뀌었습니다. 저장된 진행을 불러오거나 반영 미리보기를 다시 열어 주세요." }, { status: 409 });
      if (error.code === "PGRST202" || error.code === "42883") return Response.json({ error: "아이디어 저장 기능의 DB 설정이 필요합니다. 관리자에게 019_ideation_commit.sql 적용을 요청하세요." }, { status: 503 });
      throw error;
    }
    return Response.json({ changes });
  } catch (e) {
    console.error("[ideation] save failed", e);
    return Response.json({ error: "저장하지 못했습니다. 입력 내용은 화면에 유지됩니다. 다시 시도하세요." }, { status: 500 });
  }
}
