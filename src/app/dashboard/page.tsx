import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardShell from "@/components/dashboard/DashboardShell";

export default async function Dashboard() {
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

  return <DashboardShell profile={profile} />;
}
