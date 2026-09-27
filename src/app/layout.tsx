import type { Metadata } from "next";
import ReactDOM from "react-dom";
import "./globals.css";

// 폰트는 app/fonts.css 의 @font-face 로 자체 호스팅한다 (scripts/build-fonts.py 생성).
// next/font/local 로 Arita TTF 26MB 를 preload 하던 것을 대체한 것으로,
// 아래 두 파일(본문용 400 / 제목·강조용 600, 합계 ~340KB)만 선행 로드하고
// 나머지 weight 와 확장 한글은 실제로 렌더될 때 브라우저가 알아서 가져간다.
const PRELOAD_FONTS = [
  "/font/subset/pretendard-400-ko.woff2",
  "/font/subset/pretendard-600-ko.woff2",
];

export const metadata: Metadata = {
  title: "Minerva",
  description: "협력적 수업설계 AI 에이전트",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // <link rel="preload"> 를 JSX 로 직접 쓰면 React 가 head 로 끌어올리면서
  // 원본까지 남아 중복 출력된다. preload API 는 한 번만 내보낸다.
  for (const href of PRELOAD_FONTS) {
    ReactDOM.preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }

  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
