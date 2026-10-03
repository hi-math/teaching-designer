import { IDEATION_ROW, readDraft } from "@/lib/ideation/model";
import { APPLICATION_ROWS, buildApplication, comparable, type ContentMap } from "@/lib/ideation/application";
import { authorizeIdeation, loadIdeationGraph } from "@/lib/ideation/server";

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (raw.length > 250_000) return Response.json({ error: "저장할 내용이 너무 큽니다." }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 }); }
    const auth = await authorizeIdeation(body?.lessonId);
    if (auth.error) return auth.error;
    const draft = readDraft(body.draft);
    if (!draft) return Response.json({ error: "아이디어 형식을 확인하세요." }, { status: 400 });
    const graph = await loadIdeationGraph();
    if (draft.datasetVersion !== graph.manifest.datasetVersion) return Response.json({ error: "데이터 버전이 바뀌었습니다. 새로고침 후 다시 검토하세요." }, { status: 409 });
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
        before = Object.fromEntries(APPLICATION_ROWS.map(code => [code, data?.find(r => r.activity_code === code)?.content ?? null]));
      } else {
        before = body.before;
        if (!before || APPLICATION_ROWS.some(code => !(code in before))) return Response.json({ error: "반영 미리보기를 다시 확인하세요." }, { status: 400 });
      }
      try { changes = buildApplication(draft, graph.nodes, graph.edges, before); }
      catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
      if (body.action === "preview") return Response.json({ before, changes });
      expected = Object.fromEntries(APPLICATION_ROWS.map(code => [code, comparable(before[code])]));
    } else return Response.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });

    const { error } = await auth.supabase.rpc("commit_ideation", { p_lesson_id: body.lessonId, p_changes: changes, p_expected: expected });
    if (error) {
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
