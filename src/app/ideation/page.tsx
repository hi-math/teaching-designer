import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppModeSwitch } from "@/components/layout/AppModeSwitch";
import { AppShellHeader, AppShellLogo } from "@/components/layout/AppShellHeader";
import StandardsGraphClient from "@/components/standards-graph/StandardsGraphClient";
import { getAppShellHeaderSurface } from "@/lib/appThemeHeader";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "아이디어 도출 · Minerva",
};

/** 아이디어 도출 — 성취기준 연결 탐색기. 헤더의 전환 버튼으로 수업 설계(대시보드)와 오간다. */
export default async function IdeationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <AppShellHeader style={getAppShellHeaderSurface()}>
        <AppShellLogo className="-ml-6" />
        <AppModeSwitch current="ideation" />
      </AppShellHeader>

      <StandardsGraphClient />

      {/* ── 푸터 ── */}
      <footer className="flex shrink-0 items-center justify-between border-t border-gray-100 bg-white px-8 py-3 text-[12px]" style={{ color: "#9ca3af" }}>
        <span className="font-semibold" style={{ color: "#D1260F" }}>Minerva</span>
        <span>2026 서울특별시교육청</span>
      </footer>
    </div>
  );
}
