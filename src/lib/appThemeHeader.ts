import type { CSSProperties } from "react";

/** 사이드바 등 고정 브랜드 네이비 */
export const APP_SIDEBAR_BG = "#FFFFFF";

export function getAppShellHeaderSurface(): CSSProperties {
  return {
    // 하단 테두리는 두지 않는다 — 바로 아래 그라데이션 띠와 사이에 진한 선(검게 보임)이 생긴다
    backgroundColor: "#D1260F",
    boxShadow: "0 2px 10px 0 rgba(209,38,15,0.25)",
  };
}
