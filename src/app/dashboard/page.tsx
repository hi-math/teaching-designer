import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShell, { type View } from "@/components/dashboard/DashboardShell";

const VIEWS: View[] = ["recent", "all", "mine", "shared", "ongoing", "ended", "trash", "ideation"];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const meta = user?.user_metadata ?? {};
  const profile = {
    id: user?.id ?? "",
    email: user?.email ?? "",
    display_name:
      (meta.display_name as string | null) ??
      (meta.full_name as string | null) ??
      (meta.name as string | null) ??
      null,
    school: (meta.school as string | null) ?? null,
    subject: (meta.subject as string | null) ?? null,
    avatar_url:
      (meta.avatar_url as string | null) ??
      (meta.picture as string | null) ??
      null,
  };

  const { view } = await searchParams;
  const initialView = VIEWS.find((v) => v === view);

  return <DashboardShell profile={profile} initialView={initialView} />;
}
