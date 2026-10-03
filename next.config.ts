import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium-min"],
  outputFileTracingIncludes: {
    "/api/ideation": ["./public/standard/graph/**/*.json"],
    "/api/ideation/save": ["./public/standard/graph/**/*.json"],
  },
  async headers() {
    return [
      // 성취기준 탐색기 데이터: manifest 는 매번 재확인, hash 버전 폴더의 자산은 장기 cache
      {
        source: "/standard/graph/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
      {
        source: "/standard/graph/:version([0-9a-f]{16})/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
