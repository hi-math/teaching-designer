'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'confirm' | 'joining' | 'error'>('loading');
  const [info, setInfo] = useState<{ lessonTitle: string; emailRequired: string | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    params.then(({ token: t }) => {
      setToken(t);
      load(t);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (t: string) => {
    // 로그인 확인
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // 로그인 후 돌아오도록 redirect
      router.replace(`/?invite=${t}`);
      return;
    }
    // 초대 정보 조회
    const res = await fetch(`/api/invite/${t}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const msg: Record<number, string> = {
        404: '유효하지 않은 초대 링크입니다.',
        410: '만료된 초대 링크입니다.',
      };
      setErrorMsg(msg[res.status] ?? d.error ?? '초대 링크 확인 중 오류가 발생했습니다.');
      setStatus('error');
      return;
    }
    const data = await res.json();
    // 이미 참여한 프로젝트면 확인 화면 없이 바로 이동
    if (data.alreadyMember) {
      router.replace(`/workspace/${data.lessonId}`);
      return;
    }
    setInfo({ lessonTitle: data.lessonTitle, emailRequired: data.emailRequired });
    setStatus('confirm');
  };

  const accept = async () => {
    setStatus('joining');
    const res = await fetch(`/api/invite/${token}`, { method: 'POST' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const msg: Record<number, string> = {
        403: '이 초대 링크는 다른 이메일 계정용입니다.',
        410: '만료된 초대 링크입니다.',
      };
      setErrorMsg(msg[res.status] ?? d.error ?? '참여 중 오류가 발생했습니다.');
      setStatus('error');
      return;
    }
    const { lessonId } = await res.json();
    router.replace(`/workspace/${lessonId}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6fa] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {/* 로고 */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#D1260F] to-[#F0603C] text-white font-bold text-lg">
            M
          </div>
          <span className="text-[18px] font-bold text-[#2d3339]">Minerva</span>
        </div>

        {status === 'loading' && (
          <div className="flex items-center gap-3 text-[#757b82]">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            초대 정보를 불러오는 중…
          </div>
        )}

        {status === 'confirm' && info && (
          <>
            <h1 className="mb-2 text-[22px] font-bold text-[#2d3339]">프로젝트에 초대되었습니다</h1>
            <p className="mb-6 text-[15px] text-[#757b82]">
              <span className="font-semibold text-[#D1260F]">"{info.lessonTitle}"</span> 프로젝트에 참여자로 참여합니다.
            </p>
            {info.emailRequired && (
              <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
                이 초대는 <strong>{info.emailRequired}</strong> 계정 전용입니다.
              </p>
            )}
            <button
              onClick={accept}
              className="w-full rounded-xl bg-[#D1260F] py-3 text-[15px] font-semibold text-white transition hover:bg-[#A81A08]"
            >
              참여하기
            </button>
          </>
        )}

        {status === 'joining' && (
          <div className="flex items-center gap-3 text-[#757b82]">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            프로젝트에 참여하는 중…
          </div>
        )}

        {status === 'error' && (
          <>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mb-2 text-[20px] font-bold text-[#2d3339]">참여할 수 없습니다</h1>
            <p className="mb-6 text-[15px] text-[#757b82]">{errorMsg}</p>
            <button
              onClick={() => router.push('/')}
              className="w-full rounded-xl border border-[#e2e5ea] py-3 text-[15px] font-medium text-[#757b82] transition hover:bg-[#f5f6fa]"
            >
              대시보드로 이동
            </button>
          </>
        )}
      </div>
    </div>
  );
}
