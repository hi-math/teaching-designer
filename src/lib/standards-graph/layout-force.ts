// 일반 layout (사양 §10.1) — d3-force
// 빌드 스크립트(overview-layout.json 생성)와 layout Worker(재배치)가 함께 쓴다.
// d3 simulation 은 입력을 수정하므로 항상 이 파일 안에서 만든 복사본만 넘긴다.
// scripts/prepare-standards-graph.ts 에서 직접 import 하므로 d3-force 외의 런타임 import 를 두지 않는다.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export const LAYOUT_ALGORITHM_VERSION = "force-1";
export const LAYOUT_SEED = 20261002;
export const OVERVIEW_NODE_RADIUS = 7;
/** 위치 계산에 쓰는 원래 weight 하한 */
export const LAYOUT_MIN_WEIGHT = 3;

export interface ForceInputNode {
  id: string;
  subject: string;
  x?: number;
  y?: number;
  /** pin 된 node 는 위치를 고정한다 */
  fixed?: boolean;
}

export interface ForceInputEdge {
  source: string;
  target: string;
  weight: number;
}

export interface ForceOptions {
  mode: "subject" | "relations";
  subjectOrder: string[];
  seed?: number;
  ticks?: number;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  subject: string;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number;
}

/** d3 내부 lcg 와 같은 방식의 seed 고정 난수 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) % 4294967296) / 4294967296;
}

const ANCHOR_SPACING = 360;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 교과 anchor: 교과 순서대로 격자에 일정한 간격으로 둔다 */
export function subjectAnchors(subjects: string[]): Map<string, { x: number; y: number }> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(subjects.length * 1.6)));
  const rows = Math.ceil(subjects.length / cols);
  const anchors = new Map<string, { x: number; y: number }>();
  subjects.forEach((subject, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    anchors.set(subject, {
      x: (col - (cols - 1) / 2) * ANCHOR_SPACING,
      y: (row - (rows - 1) / 2) * ANCHOR_SPACING,
    });
  });
  return anchors;
}

/**
 * node 위치를 계산한다. 입력 순서가 같고 seed 가 같으면 결과도 같다.
 * x·y 가 있는 node 는 그 위치에서 시작하고, 없으면 교과 anchor 주변 나선형 자리에서 시작한다.
 */
export function runForceLayout(
  nodes: ForceInputNode[],
  edges: ForceInputEdge[],
  options: ForceOptions,
): Record<string, { x: number; y: number }> {
  const present = new Set(nodes.map((n) => n.subject));
  const ordered = [
    ...options.subjectOrder.filter((s) => present.has(s)),
    ...[...present].filter((s) => !options.subjectOrder.includes(s)).sort(),
  ];
  const anchors = subjectAnchors(ordered);

  const slot = new Map<string, number>();
  const simNodes: SimNode[] = nodes.map((n) => {
    const anchor = anchors.get(n.subject)!;
    const i = slot.get(n.subject) ?? 0;
    slot.set(n.subject, i + 1);
    const hasPos = typeof n.x === "number" && typeof n.y === "number";
    const r = 15 * Math.sqrt(i + 0.5);
    const x = hasPos ? n.x! : anchor.x + r * Math.cos(i * GOLDEN_ANGLE);
    const y = hasPos ? n.y! : anchor.y + r * Math.sin(i * GOLDEN_ANGLE);
    return {
      id: n.id,
      subject: n.subject,
      x,
      y,
      fx: n.fixed ? x : undefined,
      fy: n.fixed ? y : undefined,
    };
  });

  const ids = new Set(simNodes.map((n) => n.id));
  const links: SimLink[] = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ source: e.source, target: e.target, weight: e.weight }));
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source as string, (degree.get(l.source as string) ?? 0) + 1);
    degree.set(l.target as string, (degree.get(l.target as string) ?? 0) + 1);
  }

  const sim = forceSimulation<SimNode>(simNodes)
    .randomSource(lcg(options.seed ?? LAYOUT_SEED))
    .velocityDecay(0.4)
    .force("charge", forceManyBody<SimNode>().strength(-60))
    .force("collide", forceCollide<SimNode>(OVERVIEW_NODE_RADIUS + 10))
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((d) => d.id)
        .distance((l) => 140 - 18 * l.weight)
        .strength((l) => {
          const s = (l.source as SimNode).id;
          const t = (l.target as SimNode).id;
          return (0.2 * (l.weight / 5)) / Math.max(1, Math.sqrt((degree.get(s) ?? 1) * (degree.get(t) ?? 1)));
        }),
    )
    .stop();

  if (options.mode === "subject") {
    sim
      .force("anchorX", forceX<SimNode>((d) => anchors.get(d.subject)!.x).strength(0.03))
      .force("anchorY", forceY<SimNode>((d) => anchors.get(d.subject)!.y).strength(0.03));
  } else {
    // 관계 중심 배치는 교과 anchor 를 쓰지 않는다. 관계 없는 node 가 멀리 흩어지지 않도록 약한 중심 인력만 둔다.
    sim.force("gravityX", forceX<SimNode>(0).strength(0.012)).force("gravityY", forceY<SimNode>(0).strength(0.012));
  }

  const ticks = options.ticks ?? 300;
  for (let i = 0; i < ticks; i++) sim.tick();

  const out: Record<string, { x: number; y: number }> = {};
  for (const n of simNodes) {
    out[n.id] = { x: Math.round(n.x! * 10) / 10, y: Math.round(n.y! * 10) / 10 };
  }
  return out;
}
