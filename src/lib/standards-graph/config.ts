// 배포 경로 설정 — 개발자 PC 의 입력 경로는 scripts/standards-graph.config.json 에만 둔다.
export const MANIFEST_URL = "/standard/graph/manifest.json";

/** datasetVersion 별 localStorage key (위치·pin·panel 상태) */
export const storageKey = (datasetVersion: string) => `minerva:standards-graph:${datasetVersion}`;
