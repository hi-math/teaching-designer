import { redirect } from "next/navigation";

// 사양서의 제안 URL — 탐색기는 대시보드 사이드바의 "아이디어 구상" 메뉴에 통합되어 있으므로
// 공유 파라미터를 그대로 넘겨 대시보드로 보낸다.
export default async function StandardsGraphPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else if (value !== undefined) params.set(key, value);
  }
  params.set("view", "ideation");
  redirect(`/dashboard?${params.toString()}`);
}
