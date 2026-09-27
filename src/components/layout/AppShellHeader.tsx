"use client";

import type { CSSProperties, ReactNode } from "react";

/** 레이아웃만 (배경·하단선은 style로 테마별 지정) */
export const appShellHeaderClassName =
  "flex min-h-[3.75rem] shrink-0 items-center justify-between px-6";

type AppShellHeaderProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function AppShellHeader({ children, className = "", style }: AppShellHeaderProps) {
  return (
    <>
      <header
        style={style}
        className={`${appShellHeaderClassName} ${className}`.trim()}
      >
        {children}
      </header>
      <div
        className="h-[4px] w-full shrink-0"
        style={{ background: "linear-gradient(to right, #5044e3, #44c4b8)" }}
      />
    </>
  );
}

/**
 * 헤더 좌측 로고 — 사이드바(11%, 최소 150px)와 같은 폭 안에서 가운데 정렬한다.
 * 호출하는 쪽에서 헤더 좌측 패딩만큼 음수 마진을 줘서 화면 왼쪽 끝부터 맞춘다.
 *
 * logo.png 는 위아래·좌우 여백이 큰 이미지라, 표시 높이를 키운 뒤 40px 틀 밖을 잘라 낸다.
 * 로고가 이미지 정중앙에 있어 가운데 기준으로 잘라도 치우치지 않는다.
 */
export function AppShellLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-10 shrink-0 items-center justify-center overflow-hidden ${className}`.trim()}
      style={{ width: "max(150px, 11vw)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Minerva" className="h-[76px] w-auto max-w-none" />
    </div>
  );
}
