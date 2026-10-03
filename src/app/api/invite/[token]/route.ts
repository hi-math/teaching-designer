import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 초대 링크는 여러 명이 함께 쓴다. 참여한 사람이 있어도 링크는 계속 유효하다
// (expires_at 을 지정한 링크만 기한이 지나면 막는다).

type Admin = ReturnType<typeof createAdminClient>;

async function findInvite(admin: Admin, token: string) {
  const { data: invite } = await admin
    .from('lesson_invites')
    .select('id, lesson_id, email, expires_at')
    .eq('token', token)
    .single();
  if (!invite) return { error: NextResponse.json({ error: 'Invalid invite' }, { status: 404 }) };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { error: NextResponse.json({ error: 'Invite expired' }, { status: 410 }) };
  }
  return { invite };
}

// GET /api/invite/[token]  → invite info (lesson title, email restriction, 이미 참여했는지)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  const { invite, error } = await findInvite(admin, token);
  if (error) return error;

  const { data: lesson } = await admin
    .from('lessons')
    .select('id, title')
    .eq('id', invite.lesson_id)
    .single();

  // 로그인한 사용자가 이미 멤버면 참여 확인 없이 바로 들어가게 한다
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let alreadyMember = false;
  if (user) {
    const { data: member } = await admin
      .from('lesson_members')
      .select('id')
      .eq('lesson_id', invite.lesson_id)
      .eq('user_id', user.id)
      .maybeSingle();
    alreadyMember = !!member;
  }

  return NextResponse.json({
    lessonId: invite.lesson_id,
    lessonTitle: lesson?.title ?? '수업 프로젝트',
    emailRequired: invite.email ?? null,
    alreadyMember,
  });
}

// POST /api/invite/[token]  → accept invite, join as member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { invite, error } = await findInvite(admin, token);
  if (error) return error;

  // 이메일 제한 확인
  if (invite.email) {
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    const userEmail = authUser?.user?.email?.toLowerCase().trim();
    if (userEmail !== invite.email.toLowerCase().trim()) {
      return NextResponse.json({ error: 'Email mismatch' }, { status: 403 });
    }
  }

  // 멤버로 추가 — 이미 멤버(소유자 포함)면 그대로 두고, 동시에 눌러도 한 번만 들어간다
  const { error: memberErr } = await admin.from('lesson_members').upsert(
    { lesson_id: invite.lesson_id, user_id: user.id, role: 'member' },
    { onConflict: 'lesson_id,user_id', ignoreDuplicates: true }
  );
  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });

  // 마지막 사용 기록 (링크를 막는 데는 쓰지 않는다)
  await admin
    .from('lesson_invites')
    .update({ used_by: user.id, used_at: new Date().toISOString() })
    .eq('id', invite.id);

  return NextResponse.json({ lessonId: invite.lesson_id });
}
