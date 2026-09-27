import { createClient } from "@supabase/supabase-js";
import chromium from "@sparticuz/chromium-min";
import { chromium as playwrightChromium } from "playwright-core";
import { existsSync } from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Supabase (service role — bypasses RLS) ───────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Chromium 실행 (변경 금지) ────────────────────────────────────
async function launchBrowser() {
  if (process.env.NODE_ENV === "development") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      process.env.CHROME_PATH,
    ].filter(Boolean) as string[];
    const found = candidates.find((p) => existsSync(p));
    if (found) return playwrightChromium.launch({ executablePath: found, headless: true });
    return playwrightChromium.launch({ headless: true });
  }
  const executablePath = await chromium.executablePath(process.env.CHROMIUM_PACK_URL!);
  return playwrightChromium.launch({ args: chromium.args, executablePath, headless: true });
}

// ─── 타입 ─────────────────────────────────────────────────────────
type CardContent = {
  text?: string;
  status?: "completed" | "skipped";
  items?: unknown[];
  question?: string;
  active?: boolean;
  response?: string;
  // 구조화 필드
  vision?: string; vision_note?: string;
  directions?: string[];
  roles?: Array<{ name: string; subject: string; core_role: string; area: string }>;
  rows?: Array<{ name: string; role?: string }>;
  rules?: string[];
  schedule?: Array<{ due_date: string; content: string; deliverable: string }>;
  criteria?: string[];
  candidates?: string[];
  final_topic?: string;
  selection_rationale?: string;
  core_ideas?: Array<{ subject: string; core_idea: string }>;
  achievement_standards?: Array<{ subject: string; code?: string; statement?: string; standard?: string }>;
  integration_narrative?: string;
  integrated_goal?: string;
  sessions?: Array<{ id: string; subject: string; standard: string; objective: string; content: string }>;
  eval_questions?: string[];
  eval_methods?: Array<{ type: string; target: string; method: string; timing: string }>;
  rubric?: Array<{ axis: string; level_high: string; level_mid: string; level_low: string; level_4?: string; level_3?: string; level_2?: string }>;
  problem_situations?: Array<{ situation: string; decision: string }>;
  activities?: Array<{ period: string; activity: string; linked_standards: string[] }>;
  support_tools?: Array<{ stage: string; tool: string; purpose: string; related_period: string }>;
  dev_materials?: Array<{ member: string; material: string; content: string; reviewer: string }>;
  exec_schedule?: Array<{ period: string; date: string; time: string; place: string; teacher: string }>;
  design_rubric?: Array<{ area: string; question: string; score: string }>;
  reflection_note?: string;
};

type RenderData = {
  title: string;
  targetGrade: string | null;
  relatedSubjects: string | null;
  numClasses: number | null;
  numStudents: number | null;
  totalSessions: number | null;
  members: { name: string; email: string }[];
  contents: Record<string, CardContent>;
  standards: { code: string; subject: string; domain: string; content: string }[];
  ideas: { subject: string; domain: string; content: string }[];
  opinions: { question: string; responses: { name: string; response: string }[] }[];
  generatedAt: string;
  writtenDate: string | null; // 수업 기본정보의 작성일(created_date), 없으면 생성일로 대체
};

// ─── 유틸 ─────────────────────────────────────────────────────────
function esc(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const cssEsc = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const fmtDate = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

const fmtMD = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

function nl2br(s: unknown): string {
  return esc(s).replace(/\n/g, "<br>");
}

function table(
  headers: string[],
  rows: Array<Array<string | { html: string }>>,
  opts: { colWidthsMm?: number[]; centerCols?: number[] } = {}
): string {
  const { colWidthsMm = [], centerCols = [] } = opts;
  if (rows.length === 0) return `<p class="empty">(입력된 내용이 없습니다.)</p>`;
  const colgroup = colWidthsMm.length
    ? `<colgroup>${colWidthsMm.map((w) => `<col style="width:${w}mm">`).join("")}</colgroup>`
    : "";
  const head = `<thead><tr>${headers
    .map((h, i) => `<th class="${centerCols.includes(i) ? "c" : ""}">${esc(h)}</th>`)
    .join("")}</tr></thead>`;
  const body = `<tbody>${rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => {
            const cls = centerCols.includes(i) ? "c" : "";
            const inner = typeof c === "string" ? nl2br(c) : c.html;
            return `<td class="${cls}">${inner}</td>`;
          })
          .join("")}</tr>`
    )
    .join("")}</tbody>`;
  return `<table class="data">${colgroup}${head}${body}</table>`;
}

const bullets = (items: string[]): string => {
  const filtered = items.filter(Boolean);
  return filtered.length > 0
    ? `<ul class="bullets">${filtered.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : `<p class="empty">(입력된 내용이 없습니다.)</p>`;
};

const emphasisBox = (label: string, value: string): string =>
  `<div class="emphasis-box"><span class="label">${esc(label)}</span>${esc(value)}</div>`;

const sub = (text: string): string => `<h3 class="sub">${esc(text)}</h3>`;

// 구조화 필드 존재 여부 확인
function hasField(c: CardContent | undefined, ...fields: string[]): boolean {
  if (!c) return false;
  return fields.some((f) => {
    const v = (c as Record<string, unknown>)[f];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && String(v).trim().length > 0;
  });
}

// 프리텍스트 폴백
function textFallback(c: CardContent | undefined): string {
  const t = c?.text?.trim();
  return t ? `<p>${nl2br(t)}</p>` : `<p class="empty">(입력된 내용이 없습니다.)</p>`;
}

// ─── SVG 다이어그램 (2.2 교과별 핵심 아이디어) ────────────────────
function renderCoreIdeasSvg(
  core: Array<{ subject: string }>,
  centerText: string
): string {
  const subjects = core.slice(0, 3).map((c) => c.subject);
  while (subjects.length < 3) subjects.push("");
  return `<svg viewBox="0 0 200 190" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80"  cy="80"  r="55" fill="#534AB7" fill-opacity="0.42"/>
    <circle cx="120" cy="80"  r="55" fill="#9FE1CB" fill-opacity="0.55"/>
    <circle cx="100" cy="120" r="55" fill="#F59E0B" fill-opacity="0.42"/>
    <text x="55"  y="45" text-anchor="middle" font-size="12" font-weight="700" fill="#3E368A">${esc(subjects[0])}</text>
    <text x="145" y="45" text-anchor="middle" font-size="12" font-weight="700" fill="#0F766E">${esc(subjects[1])}</text>
    <text x="100" y="180" text-anchor="middle" font-size="12" font-weight="700" fill="#92400E">${esc(subjects[2])}</text>
    <rect x="62" y="92" rx="6" ry="6" width="76" height="22" fill="#3E368A"/>
    <text x="100" y="107" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">${esc(centerText)}</text>
  </svg>`;
}

// ─── CSS ──────────────────────────────────────────────────────────
function buildCss(lessonTitle: string): string {
  const footerTitle = lessonTitle ? `"${cssEsc(lessonTitle)}"` : '""';
  return `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap');
:root{
  --purple:#534AB7;--purple-dark:#3E368A;--mint:#9FE1CB;
  --dark:#1F2937;--gray:#6B7280;--light:#F3F4F6;
  --soft-purple:#EEF0FB;--border:#D1D5DB;
}
*{box-sizing:border-box}
html,body{padding:0;margin:0;color:var(--dark);
  font-family:'Noto Sans KR','Nanum Gothic','Apple SD Gothic Neo','Malgun Gothic',sans-serif}
body{font-size:9.6pt;line-height:1.48;-webkit-print-color-adjust:exact;print-color-adjust:exact}

@page{
  size:A4;
  margin:18mm 20mm 22mm 20mm;
  @bottom-left{
    font-family:'Noto Sans KR',sans-serif;
    font-size:8pt;color:#6B7280;
    content:${footerTitle};
  }
  @bottom-right{
    font-family:'Noto Sans KR',sans-serif;
    font-size:8pt;color:#6B7280;
    content:"- " counter(page) " -";
  }
}
@page cover{
  margin:0;
  @bottom-left{content:"";}
  @bottom-right{content:"";}
}
.cover{page:cover;}

.chapter,.toc-overview{border-top:0.8pt solid var(--purple);padding-top:6mm;}
.cover{page-break-after:always;}
.toc-overview{page-break-after:always;}
.chapter{page-break-before:always;}
.page-break{page-break-after:always;}

h1.title{font-size:26pt;color:var(--purple);text-align:center;margin:0 0 4mm;font-weight:700;}
p.subtitle{font-size:12pt;color:var(--gray);text-align:center;margin:0;}
h2.section{font-size:11.5pt;color:var(--purple-dark);margin:8mm 0 2mm;font-weight:700;}
h3.sub{font-size:10.3pt;color:var(--dark);margin:5mm 0 1.5mm;font-weight:700;}
p,li{font-size:9.6pt;line-height:1.48;margin:0 0 3pt;}
ul.bullets{margin:0 0 3mm 5mm;padding:0;}
ul.bullets li{list-style:disc;margin-bottom:1.5pt;}

.chapter-header{
  background:var(--purple);color:#fff;
  padding:10px 12px;border-bottom:2pt solid var(--mint);
  font-weight:700;font-size:16pt;margin-bottom:5mm;
}

table.data{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.8pt;}
table.data th,table.data td{
  border:0.3pt solid var(--border);padding:5px 6px;vertical-align:middle;
  word-break:keep-all;overflow-wrap:anywhere;
}
table.data thead th{background:var(--purple);color:#fff;font-weight:700;text-align:center;font-size:9.2pt;}
table.data tbody tr:nth-child(even) td{background:#F9FAFB;}
table.data td.c,table.data th.c{text-align:center;}

.emphasis-box{
  background:var(--soft-purple);border:0.8pt solid var(--purple);
  padding:8px 10px;color:var(--purple-dark);margin:3mm 0;
}
.emphasis-box .label{font-weight:700;margin-right:6pt;}

.two-col{display:flex;gap:6mm;align-items:flex-start;margin:3mm 0;}
.two-col .text{flex:100 0 0;}
.two-col .figure{flex:70 0 0;text-align:center;}
.two-col svg{width:100%;max-width:70mm;height:auto;}

.cover{position:relative;height:297mm;padding:55mm 20mm 20mm;}
.cover::before{content:"";position:absolute;left:0;top:0;width:8mm;height:60mm;background:var(--mint);}
.cover::after{content:"";position:absolute;left:0;top:60mm;width:8mm;height:calc(297mm - 60mm);background:var(--purple);}
.cover .meta{margin-top:28mm;border:0.6pt solid var(--purple);width:100%;border-collapse:collapse;}
.cover .meta th,.cover .meta td{padding:9px 10px;font-size:10pt;border:0.3pt solid #E5E7EB;}
.cover .meta th{background:var(--light);color:var(--purple);text-align:left;font-weight:700;width:35mm;}

ol.toc{list-style:none;padding:0;margin:0 0 6mm;}
ol.toc li{display:flex;justify-content:space-between;border-bottom:0.3pt solid #E5E7EB;padding:5pt 0;font-size:10pt;}

.check-cell{text-align:center;width:6mm;font-size:9pt;}
.check-cell.on{background:var(--purple);color:#fff;}

p.empty{color:var(--gray);font-style:italic;}
`;
}

// ─── 표지 ─────────────────────────────────────────────────────────
function renderCover(d: RenderData): string {
  try {
    const grade = d.targetGrade ?? "";
    const subjects = d.relatedSubjects ?? "";
    const classMeta = [
      d.numClasses ? `${d.numClasses}개 학급` : "",
      d.numStudents ? `총 ${d.numStudents}명` : "",
    ].filter(Boolean).join(", ");
    return `<section class="cover">
  <h1 class="title">협력적 수업설계안 보고서</h1>
  <p class="subtitle">${esc(d.title)}</p>
  ${grade && subjects ? `<p class="subtitle">— ${esc(grade)} ${esc(subjects)} 융합 PBL —</p>` : ""}
  <table class="meta">
    <tr><th>수업명</th><td>${esc(d.title)}</td></tr>
    <tr><th>대상 학년</th><td>${esc(grade)}${classMeta ? ` (${esc(classMeta)})` : ""}</td></tr>
    <tr><th>교과(융합)</th><td>${esc(subjects)}</td></tr>
    <tr><th>총 차시</th><td>${d.totalSessions ? `${d.totalSessions}차시` : "(미입력)"}</td></tr>
    <tr><th>설계 방식</th><td>T·A·Ds·DI·E 5단계 협력적 수업설계</td></tr>
    <tr><th>작성일</th><td>${esc(fmtDate(d.writtenDate || d.generatedAt))}</td></tr>
  </table>
</section>`;
  } catch (e) {
    console.error("[pdf/cover]", e);
    return `<section class="cover"><p>(렌더 오류)</p></section>`;
  }
}

// ─── 목차 + 수업 개요 + 팀 구성 ───────────────────────────────────
function renderTocOverview(d: RenderData): string {
  try {
    const A12 = d.contents["A-2"];
    const A21 = d.contents["A-3"];
    const A22 = d.contents["A-4"];

    // 관련 성취기준: 카드 구조화 필드 → 전역 __selected_standards 순
    const stdList = hasField(A21, "achievement_standards")
      ? (A21!.achievement_standards ?? [])
      : d.standards.map((s) => ({ subject: s.subject, code: s.code, statement: s.content }));
    const stdHtml = stdList.length > 0
      ? `<ul class="bullets">${stdList.map((s) => {
          const text = s.code
            ? `<strong>[${esc(s.code)}]</strong> ${esc(s.statement)}`
            : esc((s as Record<string, unknown>).standard as string ?? s.statement ?? "");
          return `<li>• ${text}</li>`;
        }).join("")}</ul>`
      : "(미입력)";

    // 핵심 아이디어 요약
    const ideaList = hasField(A21, "core_ideas")
      ? (A21!.core_ideas ?? []).map((i) => `${i.subject}: ${i.core_idea}`)
      : d.ideas.map((i) => `${i.subject}: ${i.content}`);
    const coreIdeaSummary = ideaList.join(" / ") || "(미입력)";

    // 수업 주제/목적
    const topic   = A12?.final_topic || A12?.text?.trim() || d.title;
    const purpose = A22?.integrated_goal || A22?.integration_narrative || A22?.text?.trim() || "(미입력)";
    const audience = [
      d.targetGrade ?? "",
      d.numClasses ? `${d.numClasses}개 학급` : "",
      d.numStudents ? `총 ${d.numStudents}명` : "",
    ].filter(Boolean).join(" ");

    // 팀 구성: T-3 roles 우선
    const T21 = d.contents["T-3"];
    const teamRows: string[][] = hasField(T21, "roles")
      ? (T21!.roles ?? []).map((r) => [r.name, r.subject, r.core_role])
      : (T21?.rows ?? []).map((r) => [r.name, r.role ?? "", ""])
        .filter((r) => r[0]);

    const teamTable = teamRows.length > 0
      ? table(
          ["이름", "과목", "핵심 역할"],
          teamRows.map((r) => r),
          { centerCols: [0, 1] }
        )
      : table(
          ["이름"],
          d.members.map((m) => [m.name]),
          { centerCols: [0] }
        );

    return `<section class="toc-overview">
  <h2 class="section">목차</h2>
  <ol class="toc">
    <li><span>수업 개요</span><span>2</span></li>
    <li><span>팀 구성</span><span>2</span></li>
    <li><span>1. 팀 준비 (T)</span><span>3</span></li>
    <li><span>2. 분석 (A)</span><span>4</span></li>
    <li><span>3. 설계 (Ds)</span><span>5</span></li>
    <li><span>4. 개발·실행 (DI)</span><span>7</span></li>
    <li><span>5. 평가·성찰 (E)</span><span>8</span></li>
  </ol>

  <h2 class="section">수업 개요</h2>
  <table class="data">
    <colgroup><col style="width:30mm"><col></colgroup>
    <tbody>
      <tr><td><strong>수업 주제</strong></td><td>${nl2br(topic)}</td></tr>
      <tr><td><strong>수업 목적</strong></td><td>${nl2br(purpose)}</td></tr>
      <tr><td><strong>수업 대상</strong></td><td>${esc(audience)}</td></tr>
      <tr><td><strong>관련 성취기준</strong></td><td>${stdHtml}</td></tr>
      <tr><td><strong>핵심 아이디어</strong></td><td>${esc(coreIdeaSummary)}</td></tr>
    </tbody>
  </table>

  <h2 class="section">팀 구성</h2>
  ${teamTable}
</section>`;
  } catch (e) {
    console.error("[pdf/toc]", e);
    return `<section class="toc-overview"><p>(렌더 오류)</p></section>`;
  }
}

// ─── 1. 팀 준비 ───────────────────────────────────────────────────
function renderChapterT(d: RenderData): string {
  try {
    const c = d.contents;

    // 1.1 공동 비전
    const T11 = c["T-1"];
    let s11 = sub("1.1 팀 공동 비전 (T-1)");
    if (hasField(T11, "vision", "vision_note")) {
      if (T11!.vision) s11 += emphasisBox("공동 비전", T11!.vision);
      if (T11!.vision_note) s11 += `<p>${nl2br(T11!.vision_note)}</p>`;
    } else {
      s11 += textFallback(T11);
    }

    // 1.2 수업설계 방향
    const T12 = c["T-2"];
    let s12 = sub("1.2 수업설계 방향 (T-2)");
    if (hasField(T12, "directions")) {
      s12 += bullets(T12!.directions ?? []);
    } else {
      s12 += textFallback(T12);
    }

    // 1.3 역할 배분 — roles[] 우선, rows[] 호환
    const T21 = c["T-3"];
    let s13 = sub("1.3 역할 배분 (T-3)");
    if (hasField(T21, "roles")) {
      s13 += table(
        ["이름", "과목", "핵심 역할", "담당 영역"],
        (T21!.roles ?? []).map((r) => [r.name, r.subject, r.core_role, r.area]),
        { colWidthsMm: [28, 25, 45, 72], centerCols: [0, 1] }
      );
    } else if (T21?.rows?.length) {
      s13 += table(
        ["이름", "역할"],
        T21.rows.map((r) => [r.name, r.role ?? ""]),
        { colWidthsMm: [40, 130], centerCols: [0] }
      );
    } else {
      s13 += textFallback(T21);
    }

    // 1.4 팀 규칙 — 불릿만 (표 금지)
    const T22 = c["T-4"];
    let s14 = sub("1.4 팀 규칙 (T-4)");
    if (hasField(T22, "rules")) {
      s14 += bullets(T22!.rules ?? []);
    } else {
      s14 += textFallback(T22);
    }

    // 1.5 단계별 일정 — 목표 완료일 / 내용 / 산출물
    const T23 = c["T-5"];
    let s15 = sub("1.5 단계별 일정 (T-5)");
    if (hasField(T23, "schedule")) {
      s15 += table(
        ["목표 완료일", "내용", "산출물"],
        (T23!.schedule ?? []).map((r) => [fmtMD(r.due_date), r.content, r.deliverable]),
        { colWidthsMm: [28, 90, 52], centerCols: [0] }
      );
    } else {
      s15 += textFallback(T23);
    }

    return `<section class="chapter" data-num="1">
  <div class="chapter-header">1. 팀 준비 (T)</div>
  ${s11}${s12}${s13}${s14}${s15}
</section>`;
  } catch (e) {
    console.error("[pdf/T]", e);
    return `<section class="chapter" data-num="1"><div class="chapter-header">1. 팀 준비 (T)</div><p>(렌더 오류)</p></section>`;
  }
}

// ─── 2. 분석 ──────────────────────────────────────────────────────
function renderChapterA(d: RenderData): string {
  try {
    const c = d.contents;

    // 2.1 주제 선정
    const A11 = c["A-1"];
    const A12 = c["A-2"];
    let s21 = sub("2.1 주제 선정 (A-1, A-2)");
    if (hasField(A11, "criteria") || hasField(A12, "candidates", "final_topic")) {
      if (hasField(A11, "criteria")) {
        s21 += `<p>세 교과 공통의 주제 선정 기준은 다음과 같다.</p>`;
        s21 += bullets(A11!.criteria ?? []);
      }
      if (hasField(A12, "candidates")) {
        const cands = (A12!.candidates ?? []).join("、");
        s21 += `<p>검토된 주제 후보: ${esc(cands)}</p>`;
      }
      if (A12?.selection_rationale) {
        s21 += `<p>${nl2br(A12.selection_rationale)}</p>`;
      }
      if (A12?.final_topic) {
        s21 += emphasisBox("최종 선정 주제", A12.final_topic);
      }
    } else {
      s21 += textFallback(A11 ?? A12);
    }

    // 2.2 교과별 핵심 아이디어
    const A21 = c["A-3"];
    const coreList = hasField(A21, "core_ideas")
      ? (A21!.core_ideas ?? [])
      : d.ideas.map((i) => ({ subject: i.subject, core_idea: i.content }));
    let s22 = sub("2.2 교과별 핵심 아이디어 (A-3)");
    if (coreList.length > 0) {
      const textPart = `<div class="text">${coreList
        .map((i) => `<p><strong>${esc(i.subject)}</strong><br>${nl2br(i.core_idea)}</p>`)
        .join("")}</div>`;
      const centerText = d.title.slice(0, 10);
      const svgPart = `<div class="figure">${renderCoreIdeasSvg(coreList, centerText)}</div>`;
      s22 += `<div class="two-col">${textPart}${svgPart}</div>`;
    } else {
      s22 += textFallback(A21);
    }

    // 2.3 성취기준 분석 — 원문 렌더, 코드 볼드
    const stdList = hasField(A21, "achievement_standards")
      ? (A21!.achievement_standards ?? [])
      : d.standards.map((s) => ({ subject: s.subject, code: s.code, statement: s.content }));
    let s23 = sub("2.3 성취기준 분석 (A-3)");
    if (stdList.length > 0) {
      s23 += table(
        ["교과", "성취기준"],
        stdList.map((s) => {
          const inner = s.code
            ? `<strong>[${esc(s.code)}]</strong> ${esc(s.statement)}`
            : nl2br((s as Record<string, unknown>).standard as string ?? s.statement ?? "");
          return [s.subject, { html: inner }];
        }),
        { colWidthsMm: [22, 148] }
      );
    } else {
      s23 += `<p class="empty">(입력된 내용이 없습니다.)</p>`;
    }

    // 2.4 통합 수업 목표
    const A22 = c["A-4"];
    let s24 = sub("2.4 핵심 아이디어·성취기준·수업설계의 연계 (A-4)");
    if (hasField(A22, "integration_narrative", "integrated_goal")) {
      if (A22!.integration_narrative) {
        s24 += `<p>${nl2br(A22!.integration_narrative)}</p>`;
      }
      if (A22!.integrated_goal) {
        s24 += `<p>이러한 연계를 하나의 학습자 수행 진술문으로 수렴하면 본 수업의 통합 수업 목표는 다음과 같다.</p>`;
        s24 += emphasisBox("통합 수업 목표", A22!.integrated_goal);
      }
    } else {
      s24 += textFallback(A22);
    }

    // 2.5 수업 시뮬레이션
    const A5 = c["A-5"];
    let s25 = sub("2.5 수업 시뮬레이션 (A-5)");
    if (hasField(A5, "sessions")) {
      s25 += table(
        ["차시", "과목", "성취기준", "학습목표", "지도내용"],
        A5!.sessions!.map((r, i) => [`${i + 1}`, r.subject, r.standard, r.objective, r.content]),
        { colWidthsMm: [12, 20, 46, 40, 52], centerCols: [0] }
      );
    } else {
      s25 += textFallback(A5);
    }

    return `<section class="chapter" data-num="2">
  <div class="chapter-header">2. 분석 (A)</div>
  ${s21}${s22}${s23}${s24}${s25}
</section>`;
  } catch (e) {
    console.error("[pdf/A]", e);
    return `<section class="chapter" data-num="2"><div class="chapter-header">2. 분석 (A)</div><p>(렌더 오류)</p></section>`;
  }
}

// ─── 3. 설계 ──────────────────────────────────────────────────────
function renderChapterDs(d: RenderData): string {
  try {
    const c = d.contents;

    // 3.1 평가 내용 및 방법
    const Ds11 = c["Ds-1"];
    let s31 = sub("3.1 평가 내용 및 방법 (Ds-1)");
    if (hasField(Ds11, "eval_questions", "eval_methods", "rubric")) {
      s31 += `<p>백워드 디자인(Backward Design) 원리에 따라 학습 목표에서 출발하여 평가 주제와 방법, 기준을 먼저 설계하였다.</p>`;
      if (hasField(Ds11, "eval_questions")) {
        s31 += `<h3 class="sub">3.1.1 평가 주제</h3>`;
        s31 += bullets(Ds11!.eval_questions ?? []);
      }
      if (hasField(Ds11, "eval_methods")) {
        s31 += `<h3 class="sub">3.1.2 평가 방법</h3>`;
        s31 += table(
          ["평가 유형", "평가 대상/내용", "평가 방법", "시점"],
          (Ds11!.eval_methods ?? []).map((m) => [m.type, m.target, m.method, m.timing]),
          { colWidthsMm: [22, 55, 75, 18], centerCols: [0, 3] }
        );
      }
      if (hasField(Ds11, "rubric")) {
        s31 += `<h3 class="sub">3.1.3 평가 기준 (수행 루브릭)</h3>`;
        s31 += table(
          ["평가 축", "상", "중", "하"],
          (Ds11!.rubric ?? []).map((r) => [r.axis, r.level_high ?? r.level_4 ?? "", r.level_mid ?? r.level_3 ?? "", r.level_low ?? r.level_2 ?? ""]),
          { colWidthsMm: [28, 47, 47, 48] }
        );
      }
    } else {
      s31 += textFallback(Ds11);
    }

    // 3.2 문제 상황 — 2열(상황/채택 여부), 번호 열 없음
    const Ds12 = c["Ds-2"];
    let s32 = sub("3.2 문제 상황 아이디어 (Ds-2)");
    if (hasField(Ds12, "problem_situations")) {
      s32 += `<p>학교 안의 실제 상황에서 출발하는 문제 상황 아이디어를 수집하고 팀 논의를 통해 최종 채택 여부를 결정하였다.</p>`;
      s32 += table(
        ["문제 상황", "채택 여부"],
        (Ds12!.problem_situations ?? []).map((r) => [r.situation, r.decision]),
        { colWidthsMm: [148, 22], centerCols: [1] }
      );
      if (Ds12!.selection_rationale) {
        s32 += `<p>${nl2br(Ds12!.selection_rationale)}</p>`;
      }
    } else {
      s32 += textFallback(Ds12);
    }

    // 3.3 학습자 활동 — 차시 가운데
    const Ds13 = c["Ds-3"];
    let s33 = sub("3.3 학습자 활동 아이디어 (Ds-3)");
    if (hasField(Ds13, "activities")) {
      s33 += table(
        ["차시", "학습 활동", "연계 성취기준"],
        (Ds13!.activities ?? []).map((r) => [
          r.period,
          r.activity,
          (r.linked_standards ?? []).join(", "),
        ]),
        { colWidthsMm: [15, 105, 50], centerCols: [0] }
      );
    } else {
      s33 += textFallback(Ds13);
    }

    // 3.4 지원 도구 — 관련 차시 열 필수
    const Ds21 = c["Ds-4"];
    let s34 = sub("3.4 지원 도구 (Ds-4)");
    if (hasField(Ds21, "support_tools")) {
      s34 += table(
        ["활동 단계", "도구", "목적", "관련 차시"],
        (Ds21!.support_tools ?? []).map((r) => [r.stage, r.tool, r.purpose, r.related_period]),
        { colWidthsMm: [28, 32, 95, 15], centerCols: [3] }
      );
    } else {
      s34 += textFallback(Ds21);
    }

    return `<section class="chapter" data-num="3">
  <div class="chapter-header">3. 설계 (Ds)</div>
  ${s31}<div class="page-break"></div>${s32}${s33}${s34}
</section>`;
  } catch (e) {
    console.error("[pdf/Ds]", e);
    return `<section class="chapter" data-num="3"><div class="chapter-header">3. 설계 (Ds)</div><p>(렌더 오류)</p></section>`;
  }
}

// ─── 4. 개발·실행 ─────────────────────────────────────────────────
function renderChapterDI(d: RenderData): string {
  try {
    const c = d.contents;

    // 4.1 개발 자료
    const DI11 = c["DI-1"];
    let s41 = sub("4.1 개발 자료 목록 (DI-1)");
    if (hasField(DI11, "dev_materials")) {
      s41 += table(
        ["팀원", "자료명", "내용 요약", "검토자"],
        (DI11!.dev_materials ?? []).map((r) => [r.member, r.material, r.content, r.reviewer]),
        { colWidthsMm: [25, 38, 82, 25], centerCols: [0, 3] }
      );
    } else {
      s41 += textFallback(DI11);
    }

    // 4.2 수업 기록 및 실행 일정 — 5개 열 모두 가운데
    const DI21 = c["DI-2"];
    let s42 = sub("4.2 수업 기록 및 실행 일정 (DI-2)");
    if (hasField(DI21, "exec_schedule")) {
      s42 += table(
        ["차시", "날짜", "시간", "장소", "담당 교사"],
        (DI21!.exec_schedule ?? []).map((r) => [
          r.period,
          fmtMD(r.date),
          r.time,
          r.place,
          r.teacher,
        ]),
        { colWidthsMm: [15, 22, 18, 65, 50], centerCols: [0, 1, 2, 3, 4] }
      );
    } else {
      s42 += textFallback(DI21);
    }

    return `<section class="chapter" data-num="4">
  <div class="chapter-header">4. 개발·실행 (DI)</div>
  ${s41}${s42}
</section>`;
  } catch (e) {
    console.error("[pdf/DI]", e);
    return `<section class="chapter" data-num="4"><div class="chapter-header">4. 개발·실행 (DI)</div><p>(렌더 오류)</p></section>`;
  }
}

// ─── 5. 평가·성찰 ─────────────────────────────────────────────────
function renderChapterE(d: RenderData): string {
  try {
    const c = d.contents;
    // E-2: 수업설계 과정 성찰 (design_rubric)
    // E-1: 수업 성찰 (reflection_note)
    const E21 = c["E-2"];
    const E11 = c["E-1"];

    const designRubric = E21?.design_rubric ?? E11?.design_rubric ?? [];
    const reflectionNote = E21?.reflection_note || E11?.reflection_note || E21?.text || E11?.text || "";

    const FIXED_GUIDANCE = [
      "각 항목에 대해 팀원 개인이 먼저 평정한 뒤 팀 합의로 최종 점수를 결정한다.",
      "2점 이하 항목은 다음 설계 주기의 우선 개선 과제로 환류한다.",
      "전체 항목의 75% 이상이 3~4점이면 해당 수업설계안을 Reusable(재사용 가능)로 분류한다.",
      "전체 항목의 60% 미만이 3~4점이면 Rework(전면 재설계)를 권고한다.",
    ];

    let s51 = sub("5.1 협력적 수업설계 종합 평가 체크리스트");
    if (designRubric.length > 0) {
      const checkRows = designRubric.map((item) => {
        const score = parseInt(String(item.score), 10) || 0;
        return [
          item.area,
          item.question,
          { html: `<td class="check-cell${score === 4 ? " on" : ""}">` + (score === 4 ? "■" : "☐") + `</td>` },
          { html: `<td class="check-cell${score === 3 ? " on" : ""}">` + (score === 3 ? "■" : "☐") + `</td>` },
          { html: `<td class="check-cell${score === 2 ? " on" : ""}">` + (score === 2 ? "■" : "☐") + `</td>` },
          { html: `<td class="check-cell${score === 1 ? " on" : ""}">` + (score === 1 ? "■" : "☐") + `</td>` },
        ];
      });

      // Build the check table manually (needs <td> not <td> wrapper from helper)
      const colgroup = `<colgroup>
        <col style="width:28mm"><col style="width:102mm">
        <col style="width:8mm"><col style="width:8mm"><col style="width:8mm"><col style="width:8mm">
      </colgroup>`;
      const head = `<thead><tr>
        <th>영역</th><th>평가 문항</th>
        <th class="c">4</th><th class="c">3</th><th class="c">2</th><th class="c">1</th>
      </tr></thead>`;
      const body = `<tbody>${designRubric.map((item) => {
        const score = parseInt(String(item.score), 10) || 0;
        const cell = (n: number) => `<td class="check-cell${score === n ? " on" : ""}">${score === n ? "■" : "☐"}</td>`;
        return `<tr><td>${esc(item.area)}</td><td>${esc(item.question)}</td>${cell(4)}${cell(3)}${cell(2)}${cell(1)}</tr>`;
      }).join("")}</tbody>`;
      s51 += `<table class="data">${colgroup}${head}${body}</table>`;
    } else {
      s51 += textFallback(E21 ?? E11);
    }

    const s52 = `${sub("5.2 체크리스트 활용 안내")}${bullets(FIXED_GUIDANCE)}`;
    const note = reflectionNote
      ? emphasisBox("성찰 메모", reflectionNote)
      : "";

    return `<section class="chapter" data-num="5">
  <div class="chapter-header">5. 평가·성찰 (E)</div>
  <p>협력적 수업설계 전 과정의 질을 점검하기 위해 4점 척도 체크리스트를 사용한다. 4=매우 잘 됨, 3=대체로 잘 됨, 2=다소 미흡, 1=개선 필요.</p>
  ${s51}${s52}${note}
</section>`;
  } catch (e) {
    console.error("[pdf/E]", e);
    return `<section class="chapter" data-num="5"><div class="chapter-header">5. 평가·성찰 (E)</div><p>(렌더 오류)</p></section>`;
  }
}

// ─── buildHtml ────────────────────────────────────────────────────
function buildHtml(data: RenderData): string {
  const css = buildCss(data.title);
  const body =
    renderCover(data) +
    renderTocOverview(data) +
    renderChapterT(data) +
    renderChapterA(data) +
    renderChapterDs(data) +
    renderChapterDI(data) +
    renderChapterE(data);

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${esc(data.title)}</title>
<style>${css}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

// ─── GET /api/pdf?lessonId=... ────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lessonId = searchParams.get("lessonId");
  if (!lessonId) return Response.json({ error: "lessonId required" }, { status: 400 });

  try {
    // 1) 레슨 기본 정보
    const { data: lesson, error: lessonErr } = await supabase
      .from("lessons")
      .select("title, target_grade, related_subjects, num_classes, num_students, total_sessions, created_date")
      .eq("id", lessonId)
      .single();
    if (lessonErr || !lesson) return Response.json({ error: "lesson not found" }, { status: 404 });

    // 2) 멤버 목록
    const { data: memberRows } = await supabase
      .from("lesson_members")
      .select("user_id")
      .eq("lesson_id", lessonId);
    const memberIds = (memberRows ?? []).map((r: { user_id: string }) => r.user_id);
    const { data: profiles } = memberIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, email").in("id", memberIds)
      : { data: [] };
    const members = (profiles ?? []).map(
      (p: { id: string; display_name: string | null; email: string | null }) => ({
        name: p.display_name ?? p.email ?? "알 수 없음",
        email: p.email ?? "",
      })
    );

    // 3) 활동 콘텐츠
    const { data: contentRows } = await supabase
      .from("activity_contents")
      .select("activity_code, content")
      .eq("lesson_id", lessonId);

    const contents: Record<string, CardContent> = {};
    let standards: { code: string; subject: string; domain: string; content: string }[] = [];
    let ideas: { subject: string; domain: string; content: string }[] = [];
    const opinionsMap: Record<string, { question: string; responses: { userId: string; response: string }[] }> = {};
    const opinionResMap: Record<string, Record<string, string>> = {};

    for (const row of contentRows ?? []) {
      const code = row.activity_code as string;
      const c = row.content as CardContent;

      if (code === "__selected_standards") {
        standards = (c.items ?? []) as typeof standards;
        continue;
      }
      if (code === "__selected_ideas") {
        ideas = (c.items ?? []) as typeof ideas;
        continue;
      }
      if (code.endsWith("__opinion")) {
        if (c?.active !== false && c?.question) {
          const key = code.slice(0, -"__opinion".length);
          opinionsMap[key] = { question: c.question, responses: [] };
        }
        continue;
      }
      const resIdx = code.indexOf("__opinion_res_");
      if (resIdx !== -1) {
        const key = code.slice(0, resIdx);
        const uid = code.slice(resIdx + "__opinion_res_".length);
        if (!opinionResMap[key]) opinionResMap[key] = {};
        opinionResMap[key][uid] = c?.response ?? "";
        continue;
      }
      // structured 카드: { type:"structured", fields:{...}, status } → 플랫 CardContent로 언래핑
      if ((c as Record<string, unknown>).type === "structured" && (c as Record<string, unknown>).fields) {
        const fields = (c as Record<string, unknown>).fields as CardContent;
        contents[code] = { ...fields, status: c.status };
      } else {
        contents[code] = c;
      }
    }

    // 의견묻기 응답자 이름 매핑
    const allResUids = Object.values(opinionResMap).flatMap((m) => Object.keys(m));
    const uniqueUids = [...new Set(allResUids)];
    const { data: resProfiles } = uniqueUids.length > 0
      ? await supabase.from("profiles").select("id, display_name, email").in("id", uniqueUids)
      : { data: [] };
    const nameById: Record<string, string> = {};
    for (const p of resProfiles ?? []) {
      nameById[(p as { id: string; display_name: string | null; email: string | null }).id] =
        (p as { id: string; display_name: string | null; email: string | null }).display_name ??
        (p as { id: string; display_name: string | null; email: string | null }).email ??
        "알 수 없음";
    }
    const opinions = Object.entries(opinionsMap).map(([key, val]) => ({
      question: val.question,
      responses: Object.entries(opinionResMap[key] ?? {}).map(([uid, response]) => ({
        name: nameById[uid] ?? uid,
        response,
      })),
    }));

    // 4) HTML 생성
    const generatedAt = new Date().toISOString();
    const renderData: RenderData = {
      title: lesson.title ?? "제목 없음",
      targetGrade: lesson.target_grade ?? null,
      relatedSubjects: lesson.related_subjects ?? null,
      numClasses: lesson.num_classes ?? null,
      numStudents: lesson.num_students ?? null,
      totalSessions: lesson.total_sessions ?? null,
      members,
      contents,
      standards,
      ideas,
      opinions,
      generatedAt,
      writtenDate: lesson.created_date ?? null,
    };
    const html = buildHtml(renderData);

    // 5) Playwright → PDF
    const browser = await launchBrowser();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      // 폰트 로드 대기 (최대 5초)
      await Promise.race([
        page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<void> } }).fonts?.ready),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" }, // CSS @page가 마진 관리
      });
      const safeTitle = (lesson.title ?? "report")
        .replace(/[^\w가-힣\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("[pdf]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
