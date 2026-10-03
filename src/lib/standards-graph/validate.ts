// 데이터 validation (사양 §9.2)
// scripts/prepare-standards-graph.ts 에서도 직접 import 하므로 런타임 import 를 두지 않는다.

import type { DataIssue, EdgesFile, NodesFile, RelationType } from "./types";

const SUPPORTED_SCHEMA_MAJOR = "2";
const TYPES: RelationType[] = ["content", "competency", "learning_hierarchy", "other"];
const MAX_ISSUES = 50;

export function pairKey(a: string, b: string): string {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWeight(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
}

function isDimensionWeight(value: unknown): boolean {
  return value === 0 || isWeight(value);
}

function schemaSupported(version: unknown): boolean {
  return typeof version === "string" && version.split(".")[0] === SUPPORTED_SCHEMA_MAJOR;
}

/**
 * 두 파일을 검사해 문제 목록을 돌려준다. 빈 배열이면 통과.
 * 문제가 많으면 앞의 MAX_ISSUES 개만 담는다.
 */
export function validateDataset(nodesFile: unknown, edgesFile: unknown): DataIssue[] {
  const issues: DataIssue[] = [];
  const add = (issue: DataIssue) => {
    if (issues.length < MAX_ISSUES) issues.push(issue);
  };

  // 0. 최상위 구조: { meta, nodes } / { meta, edges }
  if (!isRecord(nodesFile) || !isRecord(nodesFile.meta) || !Array.isArray(nodesFile.nodes)) {
    add({ code: "NODES_SHAPE", field: "nodes", message: "Node 파일은 { meta, nodes } 구조여야 합니다." });
  }
  if (!isRecord(edgesFile) || !isRecord(edgesFile.meta) || !Array.isArray(edgesFile.edges)) {
    add({ code: "EDGES_SHAPE", field: "edges", message: "Edge 파일은 { meta, edges } 구조여야 합니다." });
  }
  if (issues.length) return issues;

  const nf = nodesFile as unknown as NodesFile;
  const ef = edgesFile as unknown as EdgesFile;

  // 1. schema_version 지원 범위, 두 파일의 source_sha256 일치
  if (!schemaSupported(nf.meta.schema_version)) {
    add({
      code: "SCHEMA_UNSUPPORTED",
      field: "nodes.meta.schema_version",
      message: `지원하지 않는 node schema_version: ${String(nf.meta.schema_version)}`,
    });
  }
  if (!schemaSupported(ef.meta.schema_version)) {
    add({
      code: "SCHEMA_UNSUPPORTED",
      field: "edges.meta.schema_version",
      message: `지원하지 않는 edge schema_version: ${String(ef.meta.schema_version)}`,
    });
  }
  if (nf.meta.source_sha256 !== ef.meta.source_sha256) {
    add({
      code: "SOURCE_MISMATCH",
      field: "meta.source_sha256",
      message: `두 파일의 원본이 다릅니다 (nodes ${String(nf.meta.source_sha256).slice(0, 12)}…, edges ${String(ef.meta.source_sha256).slice(0, 12)}…).`,
    });
  }

  // 10. meta.count
  if (nf.meta.count !== nf.nodes.length) {
    add({
      code: "COUNT_MISMATCH",
      field: "nodes.meta.count",
      message: `meta.count(${nf.meta.count})와 실제 node 수(${nf.nodes.length})가 다릅니다.`,
    });
  }
  if (ef.meta.count !== ef.edges.length) {
    add({
      code: "COUNT_MISMATCH",
      field: "edges.meta.count",
      message: `meta.count(${ef.meta.count})와 실제 edge 수(${ef.edges.length})가 다릅니다.`,
    });
  }

  // 2·3. node ID 중복, id === code, type
  const subjectById = new Map<string, string>();
  for (const node of nf.nodes) {
    if (!isRecord(node) || typeof node.id !== "string") {
      add({ code: "NODE_SHAPE", field: "id", message: "id가 없는 node가 있습니다." });
      continue;
    }
    if (subjectById.has(node.id)) {
      add({ code: "NODE_DUPLICATE", field: "id", itemId: node.id, message: `중복된 node ID: ${node.id}` });
    }
    subjectById.set(node.id, node.subject);
    if (node.id !== node.code) {
      add({ code: "NODE_CODE", field: "code", itemId: node.id, message: `node.id와 code가 다릅니다: ${node.id} / ${node.code}` });
    }
    if (node.type !== "achievement_standard") {
      add({ code: "NODE_TYPE", field: "type", itemId: node.id, message: `성취기준이 아닌 node: ${node.id} (${String(node.type)})` });
    }
    for (const field of ["subject", "domain", "content"] as const) {
      if (typeof node[field] !== "string") {
        add({ code: "NODE_FIELD", field, itemId: node.id, message: `${node.id}의 ${field}가 문자열이 아닙니다.` });
      }
    }
  }

  // 4–9. edge
  const edgeIds = new Set<string>();
  const pairs = new Set<string>();
  for (const edge of ef.edges) {
    if (!isRecord(edge) || typeof edge.id !== "string") {
      add({ code: "EDGE_SHAPE", field: "id", message: "id가 없는 edge가 있습니다." });
      continue;
    }
    const id = edge.id;
    if (edgeIds.has(id)) add({ code: "EDGE_DUPLICATE", field: "id", itemId: id, message: `중복된 edge ID: ${id}` });
    edgeIds.add(id);

    const { source, target } = edge;
    if (!subjectById.has(source)) add({ code: "EDGE_ENDPOINT", field: "source", itemId: id, message: `존재하지 않는 endpoint: ${source}` });
    if (!subjectById.has(target)) add({ code: "EDGE_ENDPOINT", field: "target", itemId: id, message: `존재하지 않는 endpoint: ${target}` });
    if (source === target) add({ code: "EDGE_SELF_LOOP", field: "source", itemId: id, message: `self-loop: ${source}` });

    const key = pairKey(source, target);
    if (pairs.has(key)) add({ code: "EDGE_PAIR_DUPLICATE", field: "source,target", itemId: id, message: `같은 pair가 중복됩니다: ${source} — ${target}` });
    pairs.add(key);

    const dw = edge.dimension_weights;
    if (!isRecord(dw) || !TYPES.every((t) => isDimensionWeight(dw[t]))) {
      add({ code: "EDGE_DIMENSIONS", field: "dimension_weights", itemId: id, message: `dimension_weights가 0–5 integer가 아닙니다: ${id}` });
      continue;
    }
    const max = Math.max(...TYPES.map((t) => dw[t]));
    if (!isWeight(edge.weight) || edge.weight !== max) {
      add({ code: "EDGE_WEIGHT", field: "weight", itemId: id, message: `weight(${String(edge.weight)})가 1–5 integer가 아니거나 max(dimension_weights)=${max}와 다릅니다.` });
    }

    const expected = TYPES.filter((t) => dw[t] > 0).sort();
    const actual = Array.isArray(edge.relation_types) ? [...edge.relation_types].sort() : [];
    if (expected.join(",") !== actual.join(",")) {
      add({ code: "EDGE_RELATION_TYPES", field: "relation_types", itemId: id, message: `relation_types [${actual.join(", ")}]가 점수 [${expected.join(", ")}]와 다릅니다.` });
    }

    const lh = edge.learning_hierarchy;
    if (dw.learning_hierarchy > 0) {
      if (!lh) {
        add({ code: "EDGE_HIERARCHY", field: "learning_hierarchy", itemId: id, message: `학습 위계 점수가 있지만 방향 정보가 없습니다: ${id}` });
      } else {
        const sameEnds =
          (lh.foundation === source && lh.application === target) ||
          (lh.foundation === target && lh.application === source);
        if (!sameEnds) {
          add({ code: "EDGE_HIERARCHY", field: "learning_hierarchy.foundation", itemId: id, message: `학습 위계 endpoint가 edge와 다릅니다: ${id}` });
        }
        if (lh.weight !== dw.learning_hierarchy) {
          add({ code: "EDGE_HIERARCHY", field: "learning_hierarchy.weight", itemId: id, message: `학습 위계 weight(${lh.weight})가 dimension 점수(${dw.learning_hierarchy})와 다릅니다.` });
        }
      }
    } else if (lh) {
      add({ code: "EDGE_HIERARCHY", field: "learning_hierarchy", itemId: id, message: `학습 위계 점수가 0인데 방향 정보가 있습니다: ${id}` });
    }

    if (subjectById.has(source) && subjectById.has(target)) {
      const cross = subjectById.get(source) !== subjectById.get(target);
      if (edge.cross_subject !== cross) {
        add({ code: "EDGE_CROSS_SUBJECT", field: "cross_subject", itemId: id, message: `cross_subject(${String(edge.cross_subject)})가 실제 교과 차이(${cross})와 다릅니다.` });
      }
    }
  }

  return issues;
}
