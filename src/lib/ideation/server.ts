import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { getCoreIdeas } from "@/lib/curriculumCatalog";
import { getStandards } from "@/lib/standards";
import type { StandardsGraphManifest } from "@/lib/standards-graph/types";
import type { IdeationCatalog } from "./application";

/** 공식 핵심아이디어·성취기준 (서버에서만 — 파일을 읽는다) */
export function loadCatalog(): IdeationCatalog {
  return {
    ideas: getCoreIdeas(),
    standards: getStandards().map(({ code, subject, domain, content, keywords, explanation, grade_group }) =>
      ({ code, subject, domain, content, keywords, explanation, grade_group })),
  };
}

let version: Promise<string> | undefined;
/** 저장하는 초안에 남기는 데이터 버전 — 성취기준 데이터 manifest 의 datasetVersion */
export function readDataVersion(): Promise<string> {
  if (!version) version = readFile(path.join(process.cwd(), "public/standard/graph/manifest.json"), "utf8")
    .then((text) => (JSON.parse(text) as StandardsGraphManifest).datasetVersion)
    .catch((error) => { version = undefined; throw error; });
  return version;
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
