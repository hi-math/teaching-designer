import { describe, expect, it } from "vitest";
import {
  addLink, emptyDraft, readDraft, relatedTo, removeItem, removeLink, setElementText, setIdeaText,
  type IdeationDraft,
} from "../model";
import { buildApplication, buildNarrative, canonicalize, type IdeationCatalog } from "../application";

const catalog: IdeationCatalog = {
  ideas: [
    { id: "과학__과학과 사회__0", subject: "과학", domain: "과학과 사회", content: "과학적 탐구는 일상의 문제를 해결하는 데 쓰인다." },
    { id: "사회__지역__0", subject: "사회", domain: "지역", content: "지역은 자연과 인간 활동의 상호작용으로 변화한다." },
  ],
  standards: [
    { code: "[9과01-01]", subject: "과학", domain: "과학과 사회", content: "과학적 탐구 방법을 이해한다.", keywords: [], explanation: "", grade_group: "중1-3" },
    { code: "[9사05-02]", subject: "사회", domain: "지역", content: "지역 문제를 조사한다.", keywords: [], explanation: "", grade_group: "중1-3" },
  ],
};
const [sciIdea, socIdea] = catalog.ideas;

/** 주제·하위요소 2개·공식 핵심아이디어 2개·성취기준 2개 */
function workspace(): IdeationDraft {
  let d = emptyDraft({ subjects: ["과학", "사회"], grade: "중2" }, {
    topic: "우리 동네 폭염에 어떻게 대응할까?",
    ideas: [{ catalogId: sciIdea.id, ...sciIdea }, { catalogId: socIdea.id, ...socIdea }],
    standards: catalog.standards.map(({ code, subject, domain, content }) => ({ code, subject, domain, content })),
  });
  d = { ...d, elements: [{ id: "el_heat", text: "폭염의 원인", via: "manual" }, { id: "el_plan", text: "지역의 대응 방안", via: "manual" }] };
  const [i1, i2] = d.ideas;
  d = addLink(d, "elementIdea", "el_heat", i1.id);
  d = addLink(d, "elementIdea", "el_plan", i2.id);
  d = addLink(d, "ideaStandard", i1.id, "[9과01-01]");
  d = addLink(d, "ideaStandard", i2.id, "[9사05-02]");
  return d;
}

describe("아이디어 도출 초안", () => {
  it("저장했다가 다시 읽어도 항목·연결·수정본이 그대로다", () => {
    const w = workspace();
    const d = setIdeaText(w, w.ideas[0].id, "교사가 고친 문장");
    expect(d.ideas[0].revision).toBe("교사가 고친 문장");
    const restored = readDraft(JSON.parse(JSON.stringify(d)));
    expect(restored).toEqual(d);
  });

  it("예전 단계형 초안은 고른 주제와 담은 성취기준만 옮긴다", () => {
    const v1 = {
      schemaVersion: 1, datasetVersion: "old",
      conditions: { subjects: ["과학", "사회"], grade: "중2", sessions: 6, interest: "", criteria: ["a"], vision: "" },
      seedIds: ["[9과01-01]"], selectedId: "topic-2", rationale: "", generatedFor: null,
      candidates: [{ id: "topic-2", title: "기후 대응 제안", standardIds: ["[9과01-01]", "[9사05-02]"], roles: [{ subject: "사회", standardIds: ["[9사05-02]"] }] }],
    };
    const d = readDraft(v1)!;
    expect(d.schemaVersion).toBe(2);
    expect(d.topic).toBe("기후 대응 제안");
    expect(d.conditions).toEqual({ subjects: ["과학", "사회"], grade: "중2" });
    expect(d.standards.map((s) => s.code)).toEqual(["[9과01-01]", "[9사05-02]"]);
    expect(d.standards[1].subject).toBe("사회");
  });

  it("깨진 값은 거부하고, 사라진 항목에 남은 연결과 중복 연결은 정리한다", () => {
    expect(readDraft({ schemaVersion: 2 })).toBeNull();
    expect(readDraft("x")).toBeNull();
    const d = workspace();
    const dangling = { ...d, elementIdeaLinks: [...d.elementIdeaLinks, { ...d.elementIdeaLinks[0], id: "ln_dup" }, { id: "ln_x", from: "el_gone", to: d.ideas[0].id, via: "manual", reason: "", review: false }] };
    expect(readDraft(dangling)!.elementIdeaLinks).toEqual(d.elementIdeaLinks);
  });

  it("항목을 지우면 연결도 정리되고, 연결만 지우면 양쪽 항목은 남는다", () => {
    const d = workspace();
    const idea = d.ideas[0];
    const noIdea = removeItem(d, "idea", idea.id);
    expect(noIdea.elementIdeaLinks.some((l) => l.to === idea.id)).toBe(false);
    expect(noIdea.ideaStandardLinks.some((l) => l.from === idea.id)).toBe(false);
    const link = d.elementIdeaLinks[0];
    const unlinked = removeLink(d, "elementIdea", link.id);
    expect(unlinked.elements).toEqual(d.elements);
    expect(unlinked.ideas).toEqual(d.ideas);
    expect(unlinked.elementIdeaLinks).toHaveLength(d.elementIdeaLinks.length - 1);
  });

  it("문장을 바꿔도 연결은 지우지 않고 다시 검토할 연결로 표시한다", () => {
    const d = setElementText(workspace(), "el_heat", "폭염이 생기는 까닭");
    const link = d.elementIdeaLinks.find((l) => l.from === "el_heat")!;
    expect(link.review).toBe(true);
    // 같은 연결을 다시 맺으면(재추천 채택) 검토 표시만 지운다
    const relinked = addLink(d, "elementIdea", "el_heat", link.to);
    expect(relinked.elementIdeaLinks.filter((l) => l.from === "el_heat")).toEqual([{ ...link, review: false }]);
  });

  it("공식 원문과 같게 고치면 수정본을 지운다", () => {
    const d = workspace();
    const id = d.ideas[0].id;
    const revised = setIdeaText(d, id, "다르게 고친 문장");
    expect(revised.ideas[0].revision).toBe("다르게 고친 문장");
    expect(revised.ideas[0].official!.content).toBe(sciIdea.content);
    expect(setIdeaText(revised, id, sciIdea.content).ideas[0].revision).toBeNull();
  });

  it("선택한 항목과 직접·한 단계 건너 연결된 항목을 양방향으로 찾는다", () => {
    const d = workspace();
    const [i1] = d.ideas;
    expect(relatedTo(d, "element", "el_heat")).toEqual({ strong: new Set([i1.id]), soft: new Set(["[9과01-01]"]) });
    expect(relatedTo(d, "idea", i1.id).strong).toEqual(new Set(["el_heat", "[9과01-01]"]));
    expect(relatedTo(d, "standard", "[9과01-01]")).toEqual({ strong: new Set([i1.id]), soft: new Set(["el_heat"]) });
  });
});

describe("저장 전 공식 원문 맞추기", () => {
  it("클라이언트가 보낸 원문 대신 데이터 원문을 쓰고, 없는 코드는 연결과 함께 뺀다", () => {
    const d = workspace();
    const tampered: IdeationDraft = {
      ...d,
      ideas: d.ideas.map((i) => ({ ...i, official: i.official && { ...i.official, content: "바꿔 친 원문" } })),
      standards: [...d.standards.map((s) => ({ ...s, content: "바꿔 친 원문" })), { id: "[9만들어낸01]", code: "[9만들어낸01]", subject: "과학", domain: "", content: "", note: "", via: "ai" }],
      ideaStandardLinks: [...d.ideaStandardLinks, { id: "ln_fake", from: d.ideas[0].id, to: "[9만들어낸01]", via: "ai", reason: "", review: false }],
    };
    const c = canonicalize(tampered, catalog, "v9");
    expect(c.dataVersion).toBe("v9");
    expect(c.ideas.map((i) => i.official!.content)).toEqual([sciIdea.content, socIdea.content]);
    expect(c.standards.map((s) => s.content)).toEqual(catalog.standards.map((s) => s.content));
    expect(c.ideaStandardLinks.some((l) => l.to === "[9만들어낸01]")).toBe(false);
  });

  it("목록에 없는 핵심아이디어는 교사 작성 항목으로 남긴다", () => {
    const d = workspace();
    const odd = { ...d, ideas: [{ ...d.ideas[0], official: { catalogId: "없는__항목__9", subject: "과학", domain: "x", content: "옛 문장" } }] };
    const c = canonicalize(odd, catalog, "v");
    expect(c.ideas[0]).toMatchObject({ official: null, revision: "옛 문장", subject: "과학" });
  });
});

describe("수업 설계 반영", () => {
  const before = {
    "A-2": { type: "structured", fields: { candidates: ["기존 후보"], final_topic: "", selection_rationale: "기존 사유" }, status: "active" },
    "A-3": { type: "structured", fields: { core_ideas: [{ subject: "국어", core_idea: "기존 아이디어" }], achievement_standards: [{ subject: "과학", standard: "[9과01-01] 과학적 탐구 방법을 이해한다." }] } },
    "A-4": { type: "structured", fields: { integrated_goal: "기존 목표", integration_narrative: "기존 설명" } },
    __selected_ideas: { type: "ideas", items: [{ id: "국어__듣기__0", subject: "국어", domain: "듣기", content: "기존 아이디어" }] },
    __selected_standards: { type: "standards", items: [{ code: "[9과01-01]", subject: "과학", domain: "", content: "", keywords: [], explanation: "", grade_group: "" }] },
    __ideation: null,
  };

  it("기존 카드 내용은 지우지 않고 새 항목만 더한다", () => {
    const d = workspace();
    const changes = buildApplication(d, catalog, before);
    expect(changes["A-2"]!.fields).toEqual({ candidates: ["기존 후보"], final_topic: "우리 동네 폭염에 어떻게 대응할까?", selection_rationale: "기존 사유" });
    expect(changes["A-2"]!.status).toBe("active");
    const a3 = changes["A-3"]!.fields as Record<string, { subject: string }[]>;
    expect(a3.core_ideas.map((r) => r.subject)).toEqual(["국어", "과학", "사회"]);
    // 이미 있는 [9과01-01] 은 다시 넣지 않는다
    expect(a3.achievement_standards.map((r) => r.subject)).toEqual(["과학", "사회"]);
    expect((changes.__selected_ideas!.items as { id: string }[]).map((i) => i.id)).toEqual(["국어__듣기__0", sciIdea.id, socIdea.id]);
    expect((changes.__selected_standards!.items as { code: string }[]).map((i) => i.code)).toEqual(["[9과01-01]", "[9사05-02]"]);
    const a4 = changes["A-4"]!.fields as Record<string, string>;
    expect(a4.integrated_goal).toBe("기존 목표");
    expect(a4.integration_narrative.startsWith("기존 설명\n\n우리 동네 폭염에 어떻게 대응할까?")).toBe(true);
    expect(changes.__ideation).toEqual({ type: "structured", fields: d });
  });

  it("교사 수정본은 A-3 이 아니라 연계 설명에 들어가고, 다시 검토할 연결은 빠진다", () => {
    const w = workspace();
    const i1 = w.ideas[0].id;
    let d = setIdeaText(w, i1, "폭염은 기후 변화와 도시 구조가 함께 만든다");
    // 고친 뒤 교사가 연결을 다시 확인한다
    d = addLink(addLink(d, "elementIdea", "el_heat", i1), "ideaStandard", i1, "[9과01-01]");
    d = setElementText(d, "el_plan", "지역 대응");
    const narrative = buildNarrative(d);
    expect(narrative).toContain("폭염은 기후 변화와 도시 구조가 함께 만든다");
    expect(narrative).not.toContain("지역 대응:");
    const a3 = buildApplication(d, catalog, before)["A-3"]!.fields as Record<string, { core_idea?: string }[]>;
    expect(a3.core_ideas.map((r) => r.core_idea)).toContain(sciIdea.content);
  });

  it("이미 모두 반영된 상태면 반영할 새 내용이 없다고 알린다", () => {
    const d = workspace();
    const first = buildApplication(d, catalog, before);
    const after = { ...before, ...first };
    expect(() => buildApplication(d, catalog, after)).toThrow("수업 설계에 반영할 새 내용이 없습니다.");
  });
});
