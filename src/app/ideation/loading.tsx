import { AppShellHeader, AppShellLogo } from "@/components/layout/AppShellHeader";
import { getAppShellHeaderSurface } from "@/lib/appThemeHeader";

/** 아이디어 도출 진입 시 — 헤더를 먼저 보여 주고 본문은 로딩 표시 */
export default function IdeationLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <AppShellHeader style={getAppShellHeaderSurface()}>
        <AppShellLogo className="-ml-6" />
        <div className="h-10 w-[236px] shrink-0 rounded-lg bg-black/15" aria-hidden />
      </AppShellHeader>
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#D1260F] border-t-transparent" />
      </div>
    </div>
  );
}
