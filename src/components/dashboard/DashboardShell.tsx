"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AppShellHeader, AppShellLogo } from "@/components/layout/AppShellHeader";
import { getAppShellHeaderSurface } from "@/lib/appThemeHeader";
import Sidebar from "./Sidebar";
import ProjectGrid from "./ProjectGrid";
import type { UserProfile } from "./ProfilePanel";

export type ProjectView = "recent" | "all" | "mine" | "shared" | "ongoing" | "ended" | "trash";
export type View = ProjectView | "ideation";

// 아이디어 구상(성취기준 연결 탐색기)은 메뉴를 열 때만 코드를 받는다
const StandardsGraphClient = dynamic(() => import("@/components/standards-graph/StandardsGraphClient"), {
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#D1260F] border-t-transparent" />
    </div>
  ),
});

export default function DashboardShell({
  profile,
  initialView = "all",
}: {
  profile: UserProfile;
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const [newItemType, setNewItemType] = useState<"folder" | "lesson" | null>(null);

  const changeView = (next: View) => {
    setView(next);
    // 탐색기 상태는 URL 에 남기므로, 다른 메뉴로 가면 그 파라미터를 지운다
    const url = next === "ideation" ? `${window.location.pathname}?view=ideation` : window.location.pathname;
    if (next !== view) window.history.replaceState(window.history.state, "", url);
  };

  const handleNewItem = (type: "folder" | "lesson") => {
    changeView("all");
    setNewItemType(type);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <AppShellHeader style={getAppShellHeaderSurface()}>
        <AppShellLogo className="-ml-6" />
        <div className="w-8 shrink-0" aria-hidden />
      </AppShellHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          profile={profile}
          view={view}
          onViewChange={changeView}
          onNewItem={handleNewItem}
        />
        {view === "ideation" ? (
          <StandardsGraphClient />
        ) : (
          <ProjectGrid
            view={view}
            userId={profile.id || "me"}
            newItemType={newItemType}
            onNewItemDone={() => setNewItemType(null)}
          />
        )}
      </div>

      {/* ── 푸터 ── */}
      <footer className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-white px-8 py-3 text-[12px]" style={{ color: "#9ca3af" }}>
        <span className="font-semibold" style={{ color: "#D1260F" }}>Minerva</span>
        <span>2026 서울특별시교육청</span>
      </footer>
    </div>
  );
}
