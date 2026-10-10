import { describe, expect, it, vi } from "vitest";
import type { Browser } from "playwright-core";
import { renderPdf } from "@/lib/pdfRender";

function fakeBrowser(pdf: () => Promise<Buffer>) {
  const close = vi.fn(async () => undefined);
  const browser = {
    newContext: async () => ({ newPage: async () => ({ setContent: async () => undefined, evaluate: async () => undefined, pdf }) }),
    close,
  } as unknown as Browser;
  return { browser, close };
}

describe("PDF 그리기", () => {
  it("그린 PDF 를 돌려주고 브라우저를 닫는다", async () => {
    const { browser, close } = fakeBrowser(async () => Buffer.from("pdf"));
    expect((await renderPdf("<p>x</p>", async () => browser)).toString()).toBe("pdf");
    expect(close).toHaveBeenCalledOnce();
  });

  it("서버(Linux)가 아니면 /tmp 를 정리하지 않고 실패를 그대로 알린다 — 실패해도 브라우저는 닫는다", async () => {
    const { browser, close } = fakeBrowser(async () => { throw new Error("Printing failed"); });
    const launch = vi.fn(async () => browser);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(renderPdf("<p>x</p>", launch)).rejects.toThrow("Printing failed");
    expect(launch).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    quiet.mockRestore();
  });

  it("요청이 이미 끊겼으면 브라우저를 띄우지 않는다", async () => {
    const launch = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(renderPdf("<p>x</p>", launch, controller.signal)).rejects.toThrow("aborted");
    expect(launch).not.toHaveBeenCalled();
  });
});
