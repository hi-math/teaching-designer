This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 성취기준 기반 아이디어 도출

워크스페이스 헤더의 **아이디어 도출**에서 수업 조건 → 성취기준 담기 → 주제 후보 3개 생성·비교 → 반영 미리보기 순서로 진행합니다. 교과별 역할, 공동 산출물, 성취기준 원문과 추론된 연결 근거를 확인할 수 있습니다. 후보 생성 시 진행을 저장하며, 그 외 편집은 **진행 저장**으로 저장합니다. 실패하면 입력과 기존 후보가 화면에 유지됩니다.

수업 소유자가 저장·생성·반영을 수행하며 다른 참여자는 저장된 진행과 후보를 확인합니다. 최종 반영은 A-2의 주제·선정 사유를 갱신하고 A-3 및 선택 기준에 성취기준을 추가하며 A-4에 연계 설명을 추가합니다. 기존 핵심 아이디어, 통합 목표, 완료 상태를 유지합니다. 탐색 후보는 `activity_contents`의 `__ideation` 구조화 항목으로 저장되어 Realtime 및 snapshot에 포함됩니다.

A-3의 핵심 아이디어와 성취기준은 제공된 교육과정 목록에서만 선택합니다. 교사가 헤더 또는 카드의 검색 창에서 고른 항목과 Minerva AI가 추천해 반영한 항목은 같은 선택 목록과 카드에 표시됩니다. 이전 버전에서 직접 작성한 문장은 목록 항목과 일치하지 않으면 카드에 안내만 표시되며, 검색으로 다시 선택해야 합니다.

### 배포 준비

1. Supabase에 `supabase/migrations/019_ideation_commit.sql`을 적용합니다. 소유자 권한·RLS를 유지하는 `commit_ideation` 함수가 여러 카드의 반영을 하나의 transaction으로 처리하고, 미리보기 이후 내용 변경 시 전체 반영을 취소합니다. 먼저 preview/staging DB에 적용해 확인하세요.
2. 배포 환경에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CHATGPT_API_KEY`가 설정되어 있는지 확인합니다. AI 기능은 GPT-5.6 Luna를 사용하며 키는 서버에서만 사용합니다. 아이디어 도출 기능은 service role key를 사용하지 않습니다.
3. `npm test`와 `npm run build`를 실행한 뒤 GitHub 배포 대상 branch에 반영합니다. Vercel Git 연동이 있다면 해당 branch의 배포 설정을 사용합니다.
4. 실제 수업 소유자 계정으로 후보 생성 → 저장 → 새로고침 → 미리보기 → 반영을 확인합니다. 다른 창에서 내용을 수정한 뒤 오래된 미리보기를 반영하면 충돌 안내가 나와야 합니다.

API는 `POST /api/ideation`(근거 기반 생성), `POST /api/ideation/save`(`save`, `preview`, `apply`)입니다. 성취기준 파일은 manifest의 배포 버전을 사용하며 `next.config.ts`에서 두 API의 파일 추적에 포함합니다. 현재 자료 범위는 중학교 1~3학년입니다. 실제 진도와 자료 확보는 교사가 확인하며, Graph 관계는 공식 필수 선수관계를 뜻하지 않습니다.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
