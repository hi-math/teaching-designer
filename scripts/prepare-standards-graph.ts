// 성취기준 연결 탐색기 배포 데이터 준비 (사양 §8.1, §9.4, §10.1)
//
//   node scripts/prepare-standards-graph.ts [--nodes <path>] [--edges <path>]
//
// 1. 입력 node·edge 파일을 validation 한다 (실패하면 아무것도 쓰지 않는다).
// 2. 두 파일을 바이트 그대로 public/standard/graph/<datasetVersion>/ 로 복사한다.
// 3. 교과별·관계 중심 두 가지 overview layout 을 계산해 overview-layout.json 으로 저장한다.
// 4. manifest.json 을 쓴다.
// 입력 파일과 원본(standards_middle.json)은 읽기만 하며, 끝에서 SHA256 이 그대로인지 다시 확인한다.
// 입력 경로는 scripts/standards-graph.config.json 에서 관리한다 — 브라우저 URL 에는 들어가지 않는다.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAYOUT_ALGORITHM_VERSION,
  LAYOUT_MIN_WEIGHT,
  LAYOUT_SEED,
  runForceLayout,
} from "../src/lib/standards-graph/layout-force.ts";
import { SUBJECT_ORDER } from "../src/lib/standards-graph/subjectPalette.ts";
import type {
  EdgesFile,
  LayoutMode,
  NodesFile,
  OverviewLayoutFile,
  StandardsGraphManifest,
} from "../src/lib/standards-graph/types.ts";
import { validateDataset } from "../src/lib/standards-graph/validate.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(path.join(root, "scripts/standards-graph.config.json"), "utf8")) as {
  input: { nodes: string; edges: string; original: string };
  outputDir: string;
  publicBasePath: string;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const resolve = (p: string) => (path.isAbsolute(p) ? p : path.join(root, p));
const nodesPath = resolve(arg("nodes") ?? config.input.nodes);
const edgesPath = resolve(arg("edges") ?? config.input.edges);
const originalPath = resolve(config.input.original);
const outputDir = resolve(config.outputDir);

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
const hashFile = (p: string) => sha256(readFileSync(p));

const before = {
  nodes: hashFile(nodesPath),
  edges: hashFile(edgesPath),
  original: existsSync(originalPath) ? hashFile(originalPath) : null,
};

const nodesBuf = readFileSync(nodesPath);
const edgesBuf = readFileSync(edgesPath);
const nodesFile = JSON.parse(nodesBuf.toString("utf8")) as NodesFile;
const edgesFile = JSON.parse(edgesBuf.toString("utf8")) as EdgesFile;

const issues = validateDataset(nodesFile, edgesFile);
if (issues.length) {
  console.error(`✗ validation 실패 (${issues.length}건)`);
  for (const i of issues) console.error(`  [${i.code}] ${i.itemId ?? ""} ${i.field ?? ""} — ${i.message}`);
  process.exit(1);
}

if (before.original && nodesFile.meta.source_sha256 !== before.original) {
  console.warn(
    `! 입력 파일의 source_sha256(${nodesFile.meta.source_sha256.slice(0, 12)}…)이 현재 원본(${before.original.slice(0, 12)}…)과 다릅니다. 원본이 바뀌었다면 node·edge 파일을 다시 생성하세요.`,
  );
}

const schemaVersion = nodesFile.meta.schema_version;
const datasetHash = sha256(`${before.nodes}|${before.edges}|${schemaVersion}`);
const datasetVersion = datasetHash.slice(0, 16);
const versionDir = path.join(outputDir, datasetVersion);
const base = `${config.publicBasePath}/${datasetVersion}`;

// ── layout ────────────────────────────────────────────────────
const byCode = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const layoutNodes = nodesFile.nodes.map((n) => ({ id: n.id, subject: n.subject })).sort(byCode);
const layoutEdges = edgesFile.edges
  .filter((e) => e.weight >= LAYOUT_MIN_WEIGHT)
  .sort(byCode)
  .map((e) => ({ source: e.source, target: e.target, weight: e.weight }));

const layouts = {} as OverviewLayoutFile["layouts"];
for (const mode of ["subject", "relations"] as LayoutMode[]) {
  const started = Date.now();
  const pos = runForceLayout(layoutNodes, layoutEdges, { mode, subjectOrder: SUBJECT_ORDER, seed: LAYOUT_SEED });
  layouts[mode] = Object.fromEntries(Object.entries(pos).map(([id, p]) => [id, [p.x, p.y] as [number, number]]));
  console.log(`  layout ${mode}: ${layoutNodes.length} nodes, ${layoutEdges.length} edges, ${Date.now() - started}ms`);
}

const layoutFile: OverviewLayoutFile = {
  datasetVersion,
  layoutAlgorithmVersion: LAYOUT_ALGORITHM_VERSION,
  conditions: {
    inputNodes: layoutNodes.length,
    edgeFilter: `original weight >= ${LAYOUT_MIN_WEIGHT}`,
    layoutEdges: layoutEdges.length,
    inputOrder: "code (string order)",
    seed: LAYOUT_SEED,
    ticks: 300,
    note: "공간상 가까움은 공식적인 유사성 점수나 학습 순서를 뜻하지 않는다.",
  },
  layouts,
};
const layoutJson = JSON.stringify(layoutFile);

// ── 쓰기 ──────────────────────────────────────────────────────
mkdirSync(versionDir, { recursive: true });
copyFileSync(nodesPath, path.join(versionDir, "nodes.json"));
copyFileSync(edgesPath, path.join(versionDir, "edges.json"));
writeFileSync(path.join(versionDir, "overview-layout.json"), layoutJson);

const manifest: StandardsGraphManifest = {
  datasetVersion,
  datasetVersionFormula: 'SHA256(nodesFileHash + "|" + edgesFileHash + "|" + schemaVersion), 앞 16자',
  schemaVersion,
  generatedDate: String(nodesFile.meta.generated_date ?? ""),
  sourceSha256: nodesFile.meta.source_sha256,
  layoutAlgorithmVersion: LAYOUT_ALGORITHM_VERSION,
  nodeCount: nodesFile.nodes.length,
  edgeCount: edgesFile.edges.length,
  files: {
    nodes: { url: `${base}/nodes.json`, sha256: before.nodes, bytes: nodesBuf.length },
    edges: { url: `${base}/edges.json`, sha256: before.edges, bytes: edgesBuf.length },
    overviewLayout: {
      url: `${base}/overview-layout.json`,
      sha256: sha256(layoutJson),
      bytes: Buffer.byteLength(layoutJson),
    },
  },
};
writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

// 이전 버전 폴더 정리 (배포 폴더 안에서 16자리 hex 이름만 대상으로 한다)
for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
  if (entry.isDirectory() && /^[0-9a-f]{16}$/.test(entry.name) && entry.name !== datasetVersion) {
    rmSync(path.join(outputDir, entry.name), { recursive: true });
    console.log(`  이전 버전 삭제: ${entry.name}`);
  }
}

// ── 입력 보존 확인 (DATA-01) ───────────────────────────────────
const after = {
  nodes: hashFile(nodesPath),
  edges: hashFile(edgesPath),
  original: existsSync(originalPath) ? hashFile(originalPath) : null,
};
const copied = {
  nodes: hashFile(path.join(versionDir, "nodes.json")),
  edges: hashFile(path.join(versionDir, "edges.json")),
};
const preserved =
  before.nodes === after.nodes &&
  before.edges === after.edges &&
  before.original === after.original &&
  copied.nodes === before.nodes &&
  copied.edges === before.edges;

console.log(`✓ datasetVersion ${datasetVersion} (schema ${schemaVersion})`);
console.log(`  nodes ${manifest.nodeCount} · edges ${manifest.edgeCount}`);
console.log(`  ${path.relative(root, versionDir)}`);
console.log(`${preserved ? "✓" : "✗"} 입력·원본 SHA256 보존 확인`);
if (!preserved) process.exit(1);
