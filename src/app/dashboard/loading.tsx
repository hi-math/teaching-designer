import { AppShellLogo } from "@/components/layout/AppShellHeader";

/** 대시보드 진입 시 스켈레톤 — 로그인/워크스페이스에서 돌아올 때 빈 화면을 막는다. */
export default function DashboardLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <div className="flex h-[60px] shrink-0 items-center bg-[#2d3339] px-8">
        <AppShellLogo className="-ml-8" />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[220px] shrink-0 border-r border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-2.5">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-black/5" />
            ))}
          </div>
        </div>

        <div className="flex-1 p-8">
          <div className="mb-6 h-8 w-40 animate-pulse rounded-lg bg-black/5" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-[132px] animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
