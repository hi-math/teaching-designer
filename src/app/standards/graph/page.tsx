import { redirect } from "next/navigation";

// 사양서의 제안 URL — 탐색기는 "아이디어 도출" 페이지(/ideation)이므로 공유 파라미터를 그대로 넘긴다.
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
  const query = params.toString();
  redirect(query ? `/ideation?${query}` : "/ideation");
}
