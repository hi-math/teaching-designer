"use client";

import { useState } from "react";
import { AppShellHeader, AppShellLogo } from "@/components/layout/AppShellHeader";
import { AppModeSwitch } from "@/components/layout/AppModeSwitch";
import { getAppShellHeaderSurface } from "@/lib/appThemeHeader";
import Sidebar from "./Sidebar";
import ProjectGrid from "./ProjectGrid";
import type { UserProfile } from "./ProfilePanel";

export type View = "recent" | "all" | "mine" | "shared" | "ongoing" | "ended" | "trash";

export default function DashboardShell({ profile }: { profile: UserProfile }) {
  const [view, setView] = useState<View>("all");
  const [newItemType, setNewItemType] = useState<"folder" | "lesson" | null>(null);

  const handleNewItem = (type: "folder" | "lesson") => {
    setView("all");
    setNewItemType(type);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <AppShellHeader style={getAppShellHeaderSurface()}>
        <AppShellLogo className="-ml-6" />
        <AppModeSwitch current="design" />
      </AppShellHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          profile={profile}
          view={view}
          onViewChange={setView}
          onNewItem={handleNewItem}
        />
        <ProjectGrid
          view={view}
          userId={profile.id || "me"}
          newItemType={newItemType}
          onNewItemDone={() => setNewItemType(null)}
        />
      </div>

      {/* ── 푸터 ── */}
      <footer className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-white px-8 py-3 text-[12px]" style={{ color: "#9ca3af" }}>
        <span className="font-semibold" style={{ color: "#D1260F" }}>Minerva</span>
        <span>2026 서울특별시교육청</span>
      </footer>
    </div>
  );
}
