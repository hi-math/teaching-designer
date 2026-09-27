import { AppShellLogo } from "@/components/layout/AppShellHeader";

/**
 * 워크스페이스 진입 즉시 표시되는 스켈레톤.
 *
 * 이 파일이 없으면 대시보드에서 카드를 클릭한 뒤 서버 왕복(인증 + RSC 페이로드)이
 * 끝날 때까지 화면이 대시보드에 멈춰 있어 "클릭했는데 반응이 없다"로 느껴진다.
 * Next.js 는 loading.tsx 가 있으면 전환을 즉시 커밋하고 이 화면을 먼저 보여준다.
 */
export default function WorkspaceLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="flex h-[60px] shrink-0 items-center gap-6 bg-[#2d3339] px-8">
        <AppShellLogo className="-ml-8" />
        <div className="h-6 w-56 animate-pulse rounded-md bg-white/15" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 사이드바 */}
        <div className="w-[11%] min-w-[150px] shrink-0 bg-[#f1f4f9] p-4">
          <div className="flex flex-col gap-2.5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-black/5" />
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#f8f9fd] px-14 pt-8">
          <div className="mb-8 flex items-baseline gap-4">
            <div className="h-12 w-16 animate-pulse rounded-lg bg-[#D1260F]/10" />
            <div className="h-8 w-48 animate-pulse rounded-lg bg-black/5" />
          </div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="mb-6 rounded-2xl bg-white p-6">
              <div className="mb-3 h-4 w-20 animate-pulse rounded bg-black/5" />
              <div className="mb-4 h-6 w-2/5 animate-pulse rounded bg-black/5" />
              <div className="h-[100px] animate-pulse rounded-xl bg-[#f1f4f9]" />
            </div>
          ))}
        </div>

        {/* 우측 패널 */}
        <div className="w-[30%] min-w-[360px] shrink-0 border-l border-[#adb2ba]/20 bg-white p-4">
          <div className="mb-4 h-9 animate-pulse rounded-lg bg-black/5" />
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className={`h-10 animate-pulse rounded-2xl bg-black/5 ${i % 2 === 0 ? "w-3/4" : "ml-auto w-1/2"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
