export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 text-center shadow-sm ring-1 ring-gray-200">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">이메일을 확인해주세요</h2>
        <p className="mt-2 text-sm text-gray-500">
          입력하신 이메일로 인증 링크를 보냈습니다.<br />
          링크를 클릭하면 가입이 완료됩니다.
        </p>
        <a
          href="/"
          className="mt-6 inline-block text-sm font-medium text-red-600 hover:text-red-500"
        >
          로그인으로 돌아가기
        </a>
      </div>
    </div>
  );
}
