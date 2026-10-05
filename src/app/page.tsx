import { Suspense } from "react";
import localFont from "next/font/local";
import LoginForm from "@/components/LoginForm";

// Plus Jakarta Sans(라틴, 가변 400–700)를 저장소에 둔다 — next/font/google 은 빌드 때마다 구글에서 받아 오는데,
// Vercel 빌드에서 그 다운로드가 자주 실패해(Turbopack: "next/font/google queries have exactly one entry") 배포가 막혔다.
// 글꼴은 SIL Open Font License.
const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  weight: "400 700",
  display: "swap",
});

export default function Home() {
  return (
    <div className={jakarta.className}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
