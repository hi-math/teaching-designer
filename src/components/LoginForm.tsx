"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const afterLoginPath = inviteToken ? `/invite/${inviteToken}` : "/dashboard";

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    const next = inviteToken ? `/invite/${inviteToken}` : "/dashboard";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setError("이메일 인증이 완료되지 않았습니다. 가입 시 받은 이메일의 링크를 클릭해 주세요.");
      } else if (
        error.message.toLowerCase().includes("invalid login credentials") ||
        error.message.toLowerCase().includes("invalid credentials")
      ) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    router.refresh();
    router.push(afterLoginPath);
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: "#f4f5fb" }}>

      {/* ── 메인 카드 ── */}
      <main className="flex flex-1 items-center justify-center px-6 py-8">
        <div
          className="flex w-full max-w-[960px] overflow-hidden rounded-2xl bg-white"
          style={{ boxShadow: "0 4px 48px rgba(209,38,15,0.10), 0 1px 8px rgba(0,0,0,0.06)" }}
        >

          {/* ── 왼쪽: 메인 이미지 ── */}
          <div
            className="relative hidden w-[55%] overflow-hidden lg:flex lg:flex-col"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* 상단 인디고 바 */}
            <div
              className="h-11 w-full shrink-0"
              style={{ background: "linear-gradient(to right, #D1260F, #F0603C)" }}
            />
            {/* "함께 만드는 수업, 서로 깊어지는 배움" — 원이 잘리지 않도록 잘라 채우지 않고 통째로 담는다 */}
            <div className="flex flex-1 items-center justify-center p-12">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/login-visual.png"
                alt="함께 만드는 수업, 서로 깊어지는 배움"
                className="h-auto max-h-[420px] w-full max-w-[440px] object-contain"
              />
            </div>
          </div>

          {/* ── 오른쪽: 로그인 폼 ── */}
          <div className="flex w-full flex-col justify-center px-10 py-12 lg:w-[45%]">

            {/* 타이틀 */}
            <div className="mb-8">
              <h1>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/login-right.png" alt="Minerva" className="h-14 w-auto" />
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              {/* 이메일 */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium" style={{ color: "#374151" }}>
                  이메일 주소
                </label>
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: "#9ca3af" }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="w-full rounded-lg border py-3 pl-10 pr-4 text-[14px] text-[#111827] placeholder-[#c4c9d4] outline-none transition focus:border-[#D1260F] focus:ring-2 focus:ring-[#D1260F]/15"
                    style={{ borderColor: "#e5e7eb" }}
                  />
                </div>
              </div>

              {/* 비밀번호 */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-[13px] font-medium" style={{ color: "#374151" }}>
                    비밀번호
                  </label>
                  <a href="#" className="text-[12px] font-medium transition hover:opacity-80" style={{ color: "#D1260F" }}>
                    비밀번호 찾기
                  </a>
                </div>
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
                    style={{ color: "#9ca3af" }}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-lg border py-3 pl-10 pr-11 text-[14px] text-[#111827] placeholder-[#c4c9d4] outline-none transition focus:border-[#D1260F] focus:ring-2 focus:ring-[#D1260F]/15"
                    style={{ borderColor: "#e5e7eb" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition"
                    style={{ color: "#9ca3af" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#D1260F")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
                  >
                    {showPassword ? (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 로그인 상태 유지 */}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" className="h-4 w-4 rounded accent-[#D1260F]" />
                <span className="text-[13px]" style={{ color: "#6b7280" }}>30일간 로그인 상태 유지</span>
              </label>

              {/* 에러 */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-4 py-3">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <p className="text-[13px] leading-relaxed text-red-600">{error}</p>
                </div>
              )}

              {/* 로그인 버튼 */}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-semibold text-white transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: "#D1260F" }}
              >
                {loading ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                )}
                {loading ? "로그인 중..." : "로그인"}
              </button>
            </form>

            {/* ── 구분선 ── */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1" style={{ backgroundColor: "#f0f0f5" }} />
              <span className="text-[12px]" style={{ color: "#c4c9d4" }}>또는</span>
              <div className="h-px flex-1" style={{ backgroundColor: "#f0f0f5" }} />
            </div>

            {/* ── 구글 로그인 ── */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="flex w-full items-center justify-center gap-3 rounded-lg border py-3 text-[14px] font-medium transition hover:bg-gray-50 active:scale-[0.99]"
              style={{ borderColor: "#e5e7eb", color: "#374151" }}
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google로 로그인
            </button>

            {/* ── 회원가입 안내 ── */}
            <p className="mt-7 text-center text-[13px]" style={{ color: "#9ca3af" }}>
              계정이 없으신가요?{" "}
              <a
                href={inviteToken ? `/signup?invite=${inviteToken}` : "/signup"}
                className="font-semibold transition hover:opacity-80"
                style={{ color: "#D1260F" }}
              >
                회원가입
              </a>
            </p>
          </div>
        </div>
      </main>

      {/* ── 푸터 ── */}
      <footer className="flex items-center justify-between px-8 py-4 text-[12px]" style={{ color: "#9ca3af" }}>
        <span style={{ color: "#D1260F", fontWeight: 600 }}>Minerva</span>
        <span>2026 서울특별시교육청</span>
      </footer>
    </div>
  );
}
