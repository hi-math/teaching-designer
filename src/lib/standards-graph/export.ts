// JSON·PNG 내보내기 (사양 §11.2)
// 원래 edge 의 weight·source·target·learning_hierarchy 는 그대로 두고,
// 현재 filter 의 effectiveWeight 와 학습 흐름의 표시 방향은 별도 view metadata 에 기록한다.

import type { GraphFilterState, GraphMode, StandardEdge, StandardNode } from "./types";

export type ExportScope = "visible" | "matching";

export interface JsonExportInput {
  datasetVersion: string;
  schemaVersion: string;
  mode: GraphMode;
  scope: ExportScope;
  scopeDescription: string;
  filters: GraphFilterState;
  hierarchy?: { minimumWeight: number; includeCrossSubject: boolean; depth: number };
  focusNodeId: string | null;
  nodes: StandardNode[];
  edges: StandardEdge[];
  effectiveWeight: Record<string, number>;
  /** 학습 흐름 화면의 표시 방향 (foundation → application) */
  direction?: Record<string, { from: string; to: string }>;
}

export function buildJsonExport(input: JsonExportInput) {
  return {
    meta: {
      product: "성취기준 연결 탐색기",
      exportedAt: new Date().toISOString(),
      datasetVersion: input.datasetVersion,
      schemaVersion: input.schemaVersion,
      mode: input.mode,
      scope: input.scope,
      scopeDescription: input.scopeDescription,
      filters: input.filters,
      hierarchy: input.hierarchy ?? null,
      focusNodeId: input.focusNodeId,
      nodeCount: input.nodes.length,
      edgeCount: input.edges.length,
      note: "관계와 weight는 성취기준의 내용과 수행 목표를 바탕으로 추론한 결과입니다. 원래 edge 값은 바꾸지 않았고, 현재 조건의 값은 view에 따로 기록했습니다.",
    },
    nodes: input.nodes,
    edges: input.edges,
    view: {
      edges: Object.fromEntries(
        input.edges.map((e) => [
          e.id,
          {
            effectiveWeight: input.effectiveWeight[e.id] ?? null,
            ...(input.direction?.[e.id] ? { displayDirection: input.direction[e.id] } : {}),
          },
        ]),
      ),
    },
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFileName(ext: string, datasetVersion: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `standards-graph-${datasetVersion.slice(0, 8)}-${stamp}.${ext}`;
}

// ── PNG ───────────────────────────────────────────────────────

export const PNG_MAX_SIZE = 4096;

export interface PngLegendItem {
  label: string;
  color: string;
  kind: "line" | "dashed" | "dotted" | "dot";
}

export interface PngComposeInput {
  graph: Blob;
  title: string;
  conditions: string[];
  legend: PngLegendItem[];
  note: string;
}

const FONT = "Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Graph image 위아래에 제목·조건·범례·추론 관계 설명을 합성한다. 결과는 가로·세로 4096px 이내. */
export async function composePng(input: PngComposeInput): Promise<Blob> {
  const graph = await createImageBitmap(input.graph);
  const unit = 2; // 기본 2배 pixel scale 에 맞춘 글자 크기
  const pad = 24 * unit;
  const width = Math.max(graph.width, 900 * unit);
  const textWidth = width - pad * 2;

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `400 ${13 * unit}px ${FONT}`;
  const condLines = input.conditions.flatMap((c) => wrap(measure, c, textWidth));
  const noteLines = wrap(measure, input.note, textWidth);

  const headerH = pad + 22 * unit + 10 * unit + condLines.length * 20 * unit + 12 * unit;
  const legendRows = Math.ceil(input.legend.length / 4);
  const footerH = 12 * unit + legendRows * 22 * unit + 8 * unit + noteLines.length * 20 * unit + pad;
  const height = headerH + graph.height + footerH;

  // 전체가 4096px 를 넘으면 비율을 유지한 채 줄인다
  const scale = Math.min(1, PNG_MAX_SIZE / width, PNG_MAX_SIZE / height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let y = pad;
  ctx.fillStyle = "#111827";
  ctx.textBaseline = "top";
  ctx.font = `700 ${20 * unit}px ${FONT}`;
  ctx.fillText(input.title, pad, y);
  y += 22 * unit + 10 * unit;
  ctx.fillStyle = "#4b5563";
  ctx.font = `400 ${13 * unit}px ${FONT}`;
  for (const line of condLines) {
    ctx.fillText(line, pad, y);
    y += 20 * unit;
  }
  y += 12 * unit;

  ctx.drawImage(graph, Math.round((width - graph.width) / 2), y);
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = unit;
  ctx.strokeRect(0.5, y, width - 1, graph.height);
  y += graph.height + 12 * unit;

  const colW = textWidth / 4;
  input.legend.forEach((item, i) => {
    const x = pad + (i % 4) * colW;
    const ly = y + Math.floor(i / 4) * 22 * unit;
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = 2 * unit;
    if (item.kind === "dot") {
      ctx.beginPath();
      ctx.arc(x + 12 * unit, ly + 8 * unit, 6 * unit, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.setLineDash(item.kind === "dashed" ? [6 * unit, 4 * unit] : item.kind === "dotted" ? [2 * unit, 3 * unit] : []);
      ctx.beginPath();
      ctx.moveTo(x, ly + 8 * unit);
      ctx.lineTo(x + 26 * unit, ly + 8 * unit);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#374151";
    ctx.font = `400 ${13 * unit}px ${FONT}`;
    ctx.fillText(item.label, x + 34 * unit, ly);
  });
  y += legendRows * 22 * unit + 8 * unit;

  ctx.fillStyle = "#6b7280";
  for (const line of noteLines) {
    ctx.fillText(line, pad, y);
    y += 20 * unit;
  }
  graph.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 생성 실패"))), "image/png"),
  );
}
