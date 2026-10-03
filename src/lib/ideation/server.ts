import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import type { EdgesFile, NodesFile, StandardsGraphManifest } from "@/lib/standards-graph/types";

let cached: Promise<{ manifest: StandardsGraphManifest; nodes: NodesFile["nodes"]; edges: EdgesFile["edges"] }> | undefined;
export function loadIdeationGraph() {
  if (!cached) cached = (async () => {
    const root = path.join(process.cwd(), "public");
    const manifest = JSON.parse(await readFile(path.join(root, "standard/graph/manifest.json"), "utf8")) as StandardsGraphManifest;
    const [n, e] = await Promise.all([manifest.files.nodes.url, manifest.files.edges.url].map(url => readFile(path.join(root, url.replace(/^\//, "")), "utf8")));
    return { manifest, nodes: (JSON.parse(n) as NodesFile).nodes, edges: (JSON.parse(e) as EdgesFile).edges };
  })().catch(error => { cached = undefined; throw error; });
  return cached;
}

export async function authorizeIdeation(lessonId: unknown) {
  if (typeof lessonId !== "string" || !/^[0-9a-f-]{36}$/i.test(lessonId)) return { error: Response.json({ error: "수업 ID가 올바르지 않습니다." }, { status: 400 }) };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  const { data: lesson } = await supabase.from("lessons").select("id,owner_id").eq("id", lessonId).single();
  if (!lesson || lesson.owner_id !== user.id) return { error: Response.json({ error: "수업 소유자만 아이디어를 저장하고 반영할 수 있습니다." }, { status: 403 }) };
  return { supabase, user, lesson };
}
