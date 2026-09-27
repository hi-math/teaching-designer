import type { CSSProperties } from "react";

/** 사이드바 등 고정 브랜드 네이비 */
export const APP_SIDEBAR_BG = "#FFFFFF";

export function getAppShellHeaderSurface(): CSSProperties {
  return {
    backgroundColor: "#D1260F",
    borderBottom: "1px solid #A81A08",
    boxShadow: "0 2px 10px 0 rgba(209,38,15,0.25)",
  };
}
