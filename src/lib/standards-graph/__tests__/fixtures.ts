// 테스트용 실제 배포 데이터 로더 — 파일은 읽기만 한다
import { readFileSync } from "node:fs";
import path from "node:path";
import { createDataEngine } from "../data-engine";
import { buildGraphIndex, type GraphIndex } from "../selectors";
import type { EdgesFile, NodesFile, StandardsGraphManifest } from "../types";

const root = path.resolve(__dirname, "../../../..");
const publicDir = path.join(root, "public");

export function readManifest(): StandardsGraphManifest {
  return JSON.parse(readFileSync(path.join(publicDir, "standard/graph/manifest.json"), "utf8"));
}

function readPublic(url: string): Buffer {
  return readFileSync(path.join(publicDir, url));
}

export function readFiles(): { nodes: NodesFile; edges: EdgesFile } {
  const m = readManifest();
  return {
    nodes: JSON.parse(readPublic(m.files.nodes.url).toString("utf8")),
    edges: JSON.parse(readPublic(m.files.edges.url).toString("utf8")),
  };
}

/** fetch 를 public 폴더 읽기로 바꿔 engine 을 그대로 실행한다 */
export async function loadRealIndex(): Promise<{ index: GraphIndex; engine: ReturnType<typeof createDataEngine> }> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string) => {
    const buf = readPublic(String(input));
    return new Response(new Uint8Array(buf));
  }) as typeof fetch;
  try {
    const engine = createDataEngine();
    const summary = await engine.load("/standard/graph/manifest.json");
    return { index: buildGraphIndex(summary), engine };
  } finally {
    globalThis.fetch = realFetch;
  }
}
