import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Browser } from "playwright-core";

// 서버(Vercel)에서 Chromium 으로 PDF 를 그릴 때의 보호 장치.
// 한 인스턴스가 여러 요청을 이어서·동시에 받으므로(fluid compute) /tmp 상태가 요청 사이에 남는다.
//  1) 처음 /tmp 에 Chromium 을 풀 때는 한 요청만 풀고 나머지는 끝나기를 기다린다
//     — 동시에 풀면 실행 중인 파일을 덮어써 ETXTBSY 가 나거나 깨진 파일이 남는다
//  2) 그리기에 실패하면 /tmp 의 Chromium 파일과 오래된 프로필을 지우고 새로 풀어 한 번 더 그린다
//     — 시간 초과로 끊긴 요청 뒤에 인스턴스 상태가 망가지면 같은 인스턴스에서 "Printing failed" 가 계속 난다
// launchBrowser(route.ts, 변경 금지)는 그대로 부르고 바깥에서만 감싼다.

const TMP = os.tmpdir();
// @sparticuz/chromium-min 이 /tmp 에 푸는 것 전부 — swiftshader 묶음은 libGLESv2.so 가 있으면 다 풀린 것으로 보므로 함께 지운다
const CHROMIUM_FILES = new Set([
  "chromium", "chromium-pack", "fonts", "fonts-cache", "al2023",
  "libEGL.so", "libGLESv2.so", "libvk_swiftshader.so", "libvulkan.so.1", "vk_swiftshader_icd.json",
]);
const PROFILE_PREFIX = "playwright_chromiumdev_profile-";
/** 다른 요청이 쓰고 있을 수 있는 프로필은 지우지 않는다 */
const STALE_PROFILE_MS = 2 * 60_000;
/** 첫 시도가 이보다 오래 걸렸으면 다시 풀고 그릴 시간이 모자라 재시도하지 않는다 (maxDuration 60초) */
const RETRY_BUDGET_MS = 25_000;

/** /tmp 를 정리해도 되는 곳 — 서버(Linux)만. 개발 PC 의 임시 폴더는 건드리지 않는다 */
const canReset = () => process.platform === "linux" && process.env.NODE_ENV !== "development";

let firstLaunch: Promise<void> | null = null;

async function launchOnce(launch: () => Promise<Browser>): Promise<Browser> {
  if (firstLaunch) {
    await firstLaunch;
    return launch();
  }
  const launching = launch();
  firstLaunch = launching.then(() => undefined, () => { firstLaunch = null; });
  return launching;
}

/** 실패 원인을 다음에 가리기 위한 인스턴스 상태 — 남은 /tmp 공간·메모리·프로필 수 */
export function instanceDiagnostics(): Record<string, number> {
  const out: Record<string, number> = { freeMemMB: Math.round(os.freemem() / 1e6), rssMB: Math.round(process.memoryUsage().rss / 1e6) };
  try {
    const s = fs.statfsSync(TMP);
    out.tmpFreeMB = Math.round((s.bavail * s.bsize) / 1e6);
  } catch { /* 확인 못 하면 뺀다 */ }
  try {
    const names = fs.readdirSync(TMP);
    out.tmpEntries = names.length;
    out.profiles = names.filter((n) => n.startsWith(PROFILE_PREFIX)).length;
  } catch { /* 확인 못 하면 뺀다 */ }
  return out;
}

/** 풀어 둔 Chromium 과 오래된 프로필을 지운다 — 다음 실행 때 @sparticuz/chromium-min 이 새로 받아 푼다 */
export function resetChromiumTmp(now = Date.now()): void {
  for (const name of fs.readdirSync(TMP)) {
    const full = path.join(TMP, name);
    try {
      if (CHROMIUM_FILES.has(name) || (name.startsWith(PROFILE_PREFIX) && now - fs.statSync(full).mtimeMs > STALE_PROFILE_MS)) {
        fs.rmSync(full, { recursive: true, force: true });
      }
    } catch { /* 지우지 못한 것은 두고 계속 */ }
  }
  firstLaunch = null;
}

const PDF_OPTIONS = {
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: "0", bottom: "0", left: "0", right: "0" }, // CSS @page가 마진 관리
} as const;

export async function renderPdf(html: string, launch: () => Promise<Browser>, signal?: AbortSignal): Promise<Buffer> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    // 시간 초과로 끊긴 요청이 뒤늦게 브라우저를 띄우지 않게 한다
    if (signal?.aborted) throw new Error("request aborted before rendering");
    let browser: Browser | null = null;
    try {
      browser = await launchOnce(launch);
      const page = await (await browser.newContext()).newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      // 폰트 로드 대기 (최대 5초)
      await Promise.race([
        page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<void> } }).fonts?.ready),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
      return await page.pdf(PDF_OPTIONS);
    } catch (err) {
      const retry = attempt === 1 && canReset() && Date.now() - started < RETRY_BUDGET_MS;
      console.error(`[pdf] render failed (attempt ${attempt}${retry ? ", resetting /tmp and retrying" : ""})`, instanceDiagnostics(), err);
      if (!retry) throw err;
    } finally {
      await browser?.close().catch(() => undefined);
    }
    resetChromiumTmp();
  }
}
