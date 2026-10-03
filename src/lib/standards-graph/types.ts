// 성취기준 연결 탐색기 — 데이터 계약과 화면 상태 타입
// 사양: prompt/ideation/standards_web_visualization_spec.md §9.1, §11.1

export type RelationType = "content" | "competency" | "learning_hierarchy" | "other";

export const RELATION_TYPES: readonly RelationType[] = [
  "content",
  "competency",
  "learning_hierarchy",
  "other",
];

export type Weight = 1 | 2 | 3 | 4 | 5;
export type DimensionWeight = 0 | Weight;

export const WEIGHTS: readonly Weight[] = [1, 2, 3, 4, 5];

// ── 원본 파일 계약 (schema 2.0) ─────────────────────────────────

export interface StandardNode {
  id: string;
  type: "achievement_standard";
  label: string;
  code: string;
  order: number;
  subject_group: string;
  subject: string;
  grade_group: string;
  school_level: string;
  curriculum_category: string;
  area: string;
  domain: string;
  content: string;
  keywords: string[];
  explanation: string;
  application_notes: string;
  derived_annotations: {
    topics: Record<string, unknown>;
    competencies: Record<string, unknown>;
  };
}

export interface LearningHierarchy {
  foundation: string;
  application: string;
  weight: Weight;
  status: "inferred";
  reason: string;
}

export interface StandardEdge {
  id: string;
  source: string;
  target: string;
  directed: false;
  weight: Weight;
  relation_types: RelationType[];
  dimension_weights: Record<RelationType, DimensionWeight>;
  reason: string;
  evidence: {
    source_fields: string[];
    semantic_cosine_similarity: number;
    shared_topics: { id: string; label: string }[];
    shared_competencies: { id: string; label: string }[];
    shared_keywords: string[];
    source_excerpt: string;
    target_excerpt: string;
    reviewed_judgments: {
      dimension: RelationType;
      weight: Weight;
      reason: string;
    }[];
  };
  learning_hierarchy: null | LearningHierarchy;
  cross_subject: boolean;
  assessment_status: "inferred";
}

export interface NodesFile {
  meta: {
    schema_version: string;
    generated_date?: string;
    source_sha256: string;
    count: number;
    [key: string]: unknown;
  };
  nodes: StandardNode[];
}

export interface TopicCatalogEntry {
  label: string;
  specificity?: number;
}

export interface EdgesFile {
  meta: {
    schema_version: string;
    generated_date?: string;
    source_sha256: string;
    count: number;
    weight_rubric?: Record<string, string>;
    method?: Record<string, unknown>;
    topic_catalog?: Record<string, TopicCatalogEntry>;
    competency_catalog?: Record<string, string>;
    [key: string]: unknown;
  };
  edges: StandardEdge[];
}

// ── 배포 manifest·layout ───────────────────────────────────────

export interface ManifestFileEntry {
  url: string;
  sha256: string;
  bytes: number;
}

export interface StandardsGraphManifest {
  datasetVersion: string;
  datasetVersionFormula: string;
  schemaVersion: string;
  generatedDate: string;
  sourceSha256: string;
  layoutAlgorithmVersion: string;
  nodeCount: number;
  edgeCount: number;
  files: {
    nodes: ManifestFileEntry;
    edges: ManifestFileEntry;
    overviewLayout: ManifestFileEntry;
  };
}

export type LayoutMode = "subject" | "relations";

export interface OverviewLayoutFile {
  datasetVersion: string;
  layoutAlgorithmVersion: string;
  conditions: Record<string, unknown>;
  /** layoutMode → node id → [x, y] */
  layouts: Record<LayoutMode, Record<string, [number, number]>>;
}

// ── 화면에 전달하는 경량 데이터 (원문 제외) ──────────────────────

export interface LightNode {
  id: string;
  code: string;
  order: number;
  subject: string;
  subjectGroup: string;
  domain: string;
  /** 공백을 정리한 본문 앞 100자 (hover용) */
  preview: string;
  /** 본문 앞 24자 (확대 label용) */
  short: string;
}

export interface LightEdge {
  id: string;
  source: string;
  target: string;
  weight: Weight;
  dw: Record<RelationType, DimensionWeight>;
  cross: boolean;
  lh: { foundation: string; application: string; weight: Weight } | null;
}

export interface GraphSummary {
  datasetVersion: string;
  schemaVersion: string;
  generatedDate: string;
  nodes: LightNode[];
  edges: LightEdge[];
  topicCatalog: Record<string, string>;
  competencyCatalog: Record<string, string>;
  weightRubric: Record<string, string>;
  method: {
    description: string;
    model: string;
    edgeWeight: string;
    learningHierarchy: string;
  };
  layout: OverviewLayoutFile | null;
}

// ── 화면 상태 ─────────────────────────────────────────────────

export type SubjectRelation = "all" | "same" | "cross";
export type GraphMode = "overview" | "focus" | "hierarchy" | "table";

export interface GraphFilterState {
  subjects: string[];
  domains: [subject: string, domain: string][];
  relationTypes: RelationType[];
  minimumWeight: Weight;
  subjectRelation: SubjectRelation;
}

export interface GraphViewState {
  mode: GraphMode;
  filters: GraphFilterState;
  hierarchyMinimumWeight: Weight;
  hierarchyIncludeCrossSubject: boolean;
  /** 학습 흐름에서 중심 기준으로부터 따라갈 단계 수 (0 = 제한 없음) */
  hierarchyDepth: number;
  focusNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  comparisonNodeIds: string[]; // 최대 2개
  hops: 1 | 2;
  layoutMode: LayoutMode;
  showNeighborEdges: boolean;
  neighborLimit: number;
}

// ── 오류 ──────────────────────────────────────────────────────

export interface DataIssue {
  code: string;
  message: string;
  field?: string;
  itemId?: string;
}
