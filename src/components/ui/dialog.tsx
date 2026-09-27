"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

/**
 * 브라우저 기본 alert / confirm 대신 쓰는 화면 가운데 모달.
 *
 * Provider 없이 어디서든 부를 수 있도록, 호출할 때마다 body 에 임시 노드를 붙여
 * 모달을 띄우고 닫히면 걷어 낸다.
 *
 *   await showAlert("저장했습니다.");
 *   if (!(await showConfirm("덮어쓸까요?"))) return;
 */

type DialogOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
};

function DialogView({
  message,
  title,
  confirmText,
  cancelText,
  onClose,
}: {
  message: string;
  title: string;
  confirmText: string;
  /** 없으면 알림(확인 버튼만) */
  cancelText?: string;
  onClose: (ok: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(false); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(false); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title || message}
        className="w-[380px] max-w-[calc(100vw-32px)] rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        {/* title 을 빈 문자열로 주면 제목 줄 없이 본문만 보인다 */}
        {title && (
          <div className="mb-2 flex items-center gap-2">
            <svg className="h-5 w-5 shrink-0 text-[#D1260F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
          </div>
        )}
        <p className="mb-5 whitespace-pre-line text-[14px] leading-relaxed text-[#5a6066]">{message}</p>
        <div className="flex gap-2">
          {cancelText && (
            <button
              onClick={() => onClose(false)}
              className="flex-1 rounded-lg border border-gray-200 py-2 text-[13px] font-medium text-[#757b82] transition hover:bg-gray-50"
            >
              {cancelText}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={() => onClose(true)}
            className="flex-1 rounded-lg bg-[#D1260F] py-2 text-[13px] font-semibold text-white transition hover:bg-[#A81A08] focus:outline-none focus:ring-2 focus:ring-[#D1260F]/30"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function open(message: string, props: { title: string; confirmText: string; cancelText?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (ok: boolean) => {
      root.unmount();
      host.remove();
      resolve(ok);
    };
    root.render(<DialogView message={message} {...props} onClose={close} />);
  });
}

/** 확인 버튼 하나짜리 알림 */
export function showAlert(message: string, opts: Pick<DialogOptions, "title" | "confirmText"> = {}): Promise<void> {
  return open(message, { title: opts.title ?? "알림", confirmText: opts.confirmText ?? "확인" }).then(() => undefined);
}

/** 확인 / 취소 — 확인을 누르면 true */
export function showConfirm(message: string, opts: DialogOptions = {}): Promise<boolean> {
  return open(message, {
    title: opts.title ?? "확인",
    confirmText: opts.confirmText ?? "계속",
    cancelText: opts.cancelText ?? "취소",
  });
}
