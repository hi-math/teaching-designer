# 중학교 성취기준 웹 시각화 전략 및 제작 사양서

작성일: 2026-10-02 · 문서 버전: 1.0 · 대상 데이터 schema: 2.0

이 문서는 생성된 성취기준 node·edge 파일을 웹에서 탐색할 수 있도록 만드는 구현 사양서다. 실제 웹 애플리케이션은 이 사양에 따라 후속 제작한다. 데이터 규모와 예시 수치는 현재 파일에서 확인한 값이며, 성능 수치는 앞으로 구현할 제품의 목표다.

## 1. 제작 목표와 핵심 전략

교사가 특정 성취기준을 찾고, 함께 다룰 수 있는 성취기준을 발견하며, 연결 근거와 권장 학습 흐름을 확인하는 웹 탐색기를 제작한다.

**기본 전략은 전체 조망 → 성취기준 중심 탐색 → 연결 근거 확인 → 학습 흐름 확인이다.** 처음에는 강한 관계를 보여 주고, 사용자가 범위를 넓히면 약한 관계와 교과 간 관계를 추가한다.

| 구분 | 확정 사양 |
|---|---|
| 제품 가칭 | 성취기준 연결 탐색기 |
| 주요 사용자 | 교사, 교육과정 설계자, 교육 콘텐츠 제작자 |
| 구현 형태 | 기존 Minerva 프로젝트에 통합하는 웹 화면 |
| 제안 URL | `/standards/graph` — 기존 route와 충돌하는지 구현 시작 시 확인 |
| 기준 node | 성취기준 1개 = node 1개 |
| 기준 edge | 성취기준 사이의 내용·역량·학습 위계·기타 관계 |
| 기본 표시 | 모든 성취기준, 모든 관계 유형, `weight >= 4` |
| 핵심 화면 | 전체 보기, 중심 탐색, 학습 흐름, 목록 보기 |
| 원문 정책 | 원본 JSON 및 기존 node·edge 파일은 읽기 전용으로 취급 |
| 해석 정책 | 관계와 weight는 추론 결과임을 연결 상세에서 명시 |

교과와 영역은 filter, 색상, 배경 제목으로 표현한다. 교과·영역을 추가 node로 생성하거나 성취기준 node를 대표 node로 합치지 않는다. 이 원칙은 일반 화면, 내보내기, 학습 흐름 화면에 동일하게 적용한다.

첫 배포에서 완료할 범위는 검색, filter, 네 가지 화면, 원문·근거 상세, 두 성취기준 비교, URL 상태 공유, JSON·PNG 내보내기다. 사용자별 검토 기록, 추천 점수 수정, 로그인과 협업은 후속 범위로 둔다.

## 2. 입력 데이터와 확인된 규모

### 2.1 입력 파일

작업 공간의 제작 입력 파일은 다음과 같다.

- Node: `C:/Users/PC/Documents/Codex/2026-10-02/new-chat/outputs/standards_middle_nodes.json`
- Edge: `C:/Users/PC/Documents/Codex/2026-10-02/new-chat/outputs/standards_middle_edges.json`
- 보존할 원본: `C:/Users/PC/Documents/asone-projects/2026/minerva/public/standard/standards_middle.json`

두 제작 입력은 각각 `{ meta, nodes }`, `{ meta, edges }` 구조다. 최상위 값을 array로 가정하지 않는다. 이전에 생성한 `standards_middle_graph.json`은 성취기준 이외의 node가 포함되어 있으므로 이 제품의 입력으로 사용하지 않는다.

| 항목 | 확인값 |
|---|---:|
| 성취기준 node | 655 |
| 교과 | 21 |
| Edge | 4,958 |
| 교과 간 edge | 2,945 |
| 학습 위계가 기록된 edge | 246 |
| Node 파일 크기 | 2,155,496 bytes |
| Edge 파일 크기 | 6,367,553 bytes |
| 두 파일의 gzip 압축 결과 | 447,964 bytes |

gzip 크기는 로컬 압축으로 확인한 값이다. 실제 응답 크기는 배포 서버의 압축 설정에 따라 달라지므로 브라우저 Network에서 확인한다.

### 2.2 기본 weight filter에 따른 표시량

아래 값은 모든 교과와 모든 관계 유형을 선택했을 때의 결과다. 각 행의 node 수는 해당 edge와 연결되는 node 수이며, 전체 보기에서는 나머지 성취기준도 계속 표시한다.

| 조건 | Edge 수 | Edge와 연결되는 node | 현재 조건에서 edge가 없는 node |
|---|---:|---:|---:|
| `weight >= 1` | 4,958 | 655 | 0 |
| `weight >= 2` | 3,852 | 647 | 8 |
| `weight >= 3` | 2,162 | 584 | 71 |
| `weight >= 4` | 784 | 438 | 217 |
| `weight >= 5` | 269 | 198 | 457 |

첫 화면은 655개 node와 784개 edge를 표시한다. 현재 filter에서 edge가 없는 217개 node를 삭제하지 않고 옅은 테두리로 표시한다. 이 상태의 설명은 “현재 조건에 맞는 관계 없음”으로 한다.

### 2.3 관계 유형의 중복

| `relation_types` 값 | 표시명 | 포함된 edge 수 |
|---|---|---:|
| `content` | 내용 | 4,386 |
| `competency` | 역량 | 1,297 |
| `learning_hierarchy` | 학습 위계 | 246 |
| `other` | 기타 | 15 |

한 edge에 여러 유형이 들어갈 수 있다. 따라서 유형별 수를 더한 값은 전체 edge 수와 다르다. 화면 상단의 관계 수와 내보내기 개수는 `edge.id` 기준으로 중복 없이 계산한다.

## 3. 데이터 해석 규칙

### 3.1 Node 규칙

- `id`와 `code`는 `[9과01-01]` 같은 원본 문자열을 그대로 유지한다.
- `subject`, `domain`, `subject_group`은 node 속성이다.
- 같은 이름의 `domain`도 교과가 다르면 별도 filter 항목으로 취급한다. 내부 식별은 `[subject, domain]` tuple로 관리한다.
- `grade_group: "중1-3"`과 `order`를 특정 학년, 난이도 또는 학습 순서로 변환하지 않는다.
- `content`, `explanation`, `application_notes`는 원문 보기를 제공한다. 표시용 공백 정리가 필요하면 별도 문자열을 만든다.
- `derived_annotations`는 원문과 구분하여 “분석된 주제·역량” 영역에 표시한다.
- 새로 작성하는 mathematical terminology는 English로 작성한다. 제공된 성취기준 원문과 식별자는 그대로 보존한다.

### 3.2 Edge 및 weight 규칙

`edge.weight`는 `dimension_weights`의 가장 높은 값이다. 관계 유형을 좁혀 볼 때는 **선택한 유형에 해당하는 점수로** 표시 여부를 결정한다.

예를 들어 `content=1, competency=5`인 edge에서 “내용”만 선택하고 minimum weight를 4로 설정하면 해당 edge를 숨겨야 한다. 원래 `edge.weight=5`라는 이유로 표시하면 안 된다.

```ts
type RelationType =
  | "content"
  | "competency"
  | "learning_hierarchy"
  | "other";

type Weight = 1 | 2 | 3 | 4 | 5;
type DimensionWeight = 0 | Weight;

function getEffectiveWeight(
  edge: StandardEdge,
  selectedTypes: readonly RelationType[],
): DimensionWeight {
  return Math.max(
    0,
    ...selectedTypes.map(type => edge.dimension_weights[type]),
  ) as DimensionWeight;
}

function passesRelationFilter(
  edge: StandardEdge,
  selectedTypes: readonly RelationType[],
  minimumWeight: Weight,
): boolean {
  return getEffectiveWeight(edge, selectedTypes) >= minimumWeight;
}
```

여러 유형 선택은 OR로 적용한다. 하나도 선택하지 않으면 edge를 표시하지 않고 “관계 유형을 선택하세요”를 표시한다. 이 상태에서도 node 검색과 원문 열람은 사용할 수 있다.

`dimension_weights`의 0은 해당 관계를 채택하지 않았다는 뜻이다. 화면의 실제 edge weight는 항상 1–5이며, 상세 화면에서 해당 없는 유형은 `—`로 표시한다. `semantic_cosine_similarity`를 화면용 weight로 다시 환산하지 않는다.

### 3.3 방향 규칙

일반 관계 화면의 edge는 **undirected**다. JSON의 `source`와 `target` 저장 순서는 학습 방향을 뜻하지 않는다.

학습 흐름 화면에서는 다음 별도 정보를 사용한다.

```ts
const directedEdge = {
  id: edge.id,
  source: edge.learning_hierarchy.foundation,
  target: edge.learning_hierarchy.application,
  weight: edge.dimension_weights.learning_hierarchy,
};
```

학습 흐름의 화살표는 `foundation → application`이다. 이 관계를 화면에서 “권장 학습 연결”로 설명한다. 수업의 필수 선수조건이나 공식 학년 배치를 의미한다고 표시하지 않는다.

현재 파일에서는 학습 위계에 cycle이 없는 것으로 확인되었다. 이후 데이터가 변경되면 다시 확인한다. Cycle이 발견되면 일반 탐색은 제공하되, 학습 흐름 자동 배치는 중단하고 관련 코드 목록을 보여 준다. 배치 엔진이 cycle을 처리하기 위해 내부적으로 방향을 바꾸더라도 원본의 학습 방향을 변경해서는 안 된다.

## 4. 사용자 흐름과 화면별 동작

### 4.1 전체 보기

목적은 교과별 분포와 강한 교과 간 관계를 조망하는 것이다.

1. 첫 진입 시 `weight >= 4`, 전체 교과, 전체 유형을 적용한다.
2. 상태 표시줄에 `성취기준 655 / 655 · 관계 784 / 4,958`을 표시한다.
3. Node hover 시 코드, 교과, 영역, 본문 앞 100자를 보여 준다.
4. Node 클릭 시 오른쪽 상세 panel을 연다. 위치는 유지한다.
5. 상세 panel의 “이 기준 중심으로 보기”를 누르면 중심 탐색으로 전환한다.
6. Filter 변경 시 표시 대상과 스타일을 갱신한다. “재배치”를 눌렀을 때만 위치를 다시 계산한다.

교과별 배경 제목은 node가 아닌 화면 annotation으로 그린다. “교과별 배치”와 “관계 중심 배치”를 선택할 수 있게 하며 기본값은 교과별 배치다. 두 배치 모두 공간상 가까움이 공식적인 유사성 점수나 학습 순서를 뜻하지 않음을 도움말에 설명한다.

### 4.2 중심 탐색

선택한 성취기준을 중심으로 실제 연결된 성취기준을 살펴본다.

| 설정 | 사양 |
|---|---|
| 초기 탐색 범위 | `1-hop` |
| 추가 탐색 | 사용자가 선택하면 `2-hop` |
| 기본 weight | 전체 보기에서 사용하던 값 유지 |
| 초기 neighbor 한도 | Desktop 30개, mobile 15개 |
| 초기 edge 구성 | 중심 node에 직접 닿는 edge; neighbor 사이 edge는 별도 toggle |
| 확장 | “관계 더 보기”로 30개씩, mobile은 15개씩 추가 |
| 큰 범위 | 표시 node가 150개를 넘으면 추가 확장을 명시적으로 선택하도록 안내 |
| 목록 | 표시 한도와 무관하게 filter를 만족하는 전체 관계를 탐색 가능 |

Neighbor는 `effectiveWeight DESC → cross_subject DESC → code ASC`로 정렬한다. 상위 항목만 화면에 그렸다면 “조건에 맞는 86개 중 30개 표시”처럼 전체와 표시량을 함께 보여 준다. 같은 weight 안에서 교과 간 관계를 먼저 보여 주는 것은 탐색을 돕는 표시 순서이며 새로운 유사성 점수를 만들지 않는다.

`2-hop`은 filter를 통과한 undirected edge에 BFS를 적용한다. 먼저 1-hop을 배치하고, 2-hop 후보는 중심까지의 path에서 가장 낮은 weight가 높은 순서로 정렬한다. 동점에서는 해당 node에 직접 닿는 weight, 마지막으로 code 순서를 사용한다. 각 2-hop node가 어떤 성취기준을 거쳐 연결되는지 path를 보여 준다.

필터가 중심 node의 교과를 제외하더라도 중심 node는 화면에 남기고 “중심 기준은 비교를 위해 유지”라고 표시한다. 이 예외는 중심 node에만 적용한다. 나머지 node와 edge에는 설정한 교과·영역 filter를 적용한다.

### 4.3 학습 흐름

선택한 성취기준의 앞뒤 학습 연결을 살펴보는 화면이다.

- 관계 유형은 `learning_hierarchy`로 고정하고 해당 유형의 점수로만 filter한다.
- 기본 minimum weight는 3으로 하여 현재 246개 관계를 탐색 대상으로 삼는다. 일반 화면의 weight 설정은 별도로 보존한다.
- 중심 node가 있으면 incoming과 outgoing 각각 `2-hop`까지 처음 표시한다. 원하면 범위를 확장한다.
- 중심 node가 없으면 선택한 교과 안의 학습 연결 전체를 표시한다. 교과가 선택되지 않았으면 전체 246개 관계를 사용한다.
- 교과가 선택되었을 때 “타 교과 학습 연결 포함”을 켜면 선택 교과 node와 직접 연결된 타 교과 node까지 확장한다.
- `foundation → application` 방향을 왼쪽에서 오른쪽으로 배치한다.
- 관계가 없는 성취기준은 중심 node로 선택된 경우에만 별도 표시하며, “기록된 학습 연결 없음”으로 안내한다.
- 분기와 합류를 허용하는 directed graph로 구현한다. 하나의 parent만 갖는 tree로 변환하지 않는다.
- 상단 설명: “성취기준 내용을 바탕으로 추론한 권장 학습 연결입니다.”

### 4.4 목록 보기와 두 성취기준 비교

목록 보기는 같은 검색·filter 결과를 표로 제공한다. 화면 접근성과 많은 관계의 검토를 위한 기본 기능으로 포함한다.

| 목록 | 기본 열 |
|---|---|
| 성취기준 | 코드, 교과, 영역, 본문, 현재 조건의 관계 수 |
| 관계 | 양쪽 코드와 본문 요약, 선택 유형, effective weight, 교과 간 여부 |

목록은 50개 단위 pagination을 제공한다. Graph 화면에서 hover 또는 클릭한 대상과 목록의 선택 상태를 동기화한다.

두 성취기준을 비교 대상으로 선택하면 본문·공유 주제·공유 역량·관계별 점수·근거를 나란히 표시한다. 직접 edge가 없을 때는 “데이터에 직접 연결이 기록되어 있지 않습니다”라고 표시한다. 두 기준 사이의 새로운 edge나 점수를 브라우저에서 만들어 넣지 않는다.

## 5. 화면 배치와 상호작용 사양

### 5.1 Desktop 구성

기준 크기는 1440 × 900px이다. 아래 배치는 기능 영역을 설명하는 wireframe이다.

```text
┌─────────────────────────────────────────────────────────────────┐
│ 성취기준 연결 탐색기   [코드·본문 검색]   [공유] [내보내기]         │
├─────────────────────────────────────────────────────────────────┤
│ [전체 보기] [중심 탐색] [학습 흐름] [목록]   minimum weight [4]     │
├──────────────┬──────────────────────────────┬────────────────────┤
│ 교과 filter  │                              │ 선택한 성취기준     │
│ 영역 filter  │                              │ 코드 / 교과 / 영역  │
│ 관계 유형    │       Graph viewport         │ 본문               │
│ 교과 간 조건 │                              │ 해설·적용 사항     │
│              │                              │ 연결 기준 목록     │
│ 초기화       │ [확대][축소][화면 맞춤]        │ 연결 근거 / 비교    │
├──────────────┴──────────────────────────────┴────────────────────┤
│ 표시량 / 전체량 · 표시 제한 안내 · 범례                            │
└─────────────────────────────────────────────────────────────────┘
```

| 요소 | Desktop 사양 |
|---|---|
| 페이지 높이 | `100dvh`; Graph 영역 자체가 남은 높이를 사용 |
| 상단 header | 64px |
| 화면·weight toolbar | 56px; 부족하면 가로 스크롤 |
| 왼쪽 filter panel | 256px |
| 오른쪽 상세 panel | 360px, 접기 가능 |
| 중앙 viewport | 나머지 너비; 최소 480px 확보 |
| 하단 상태 표시줄 | 최소 32px; 설명이 길면 높이 증가 |
| 본문 글자 | 14px, line-height 1.6 |
| 코드·보조 정보 | 12px 이상 |
| 상세 본문 | 생략 없는 원문; 긴 해설은 접기·펼치기 |

폭 768–1279px에서는 filter를 drawer로 전환하고 상세 panel을 overlay로 연다. 폭 767px 이하에서는 검색·탭·Graph를 세로 배치하고 상세를 bottom sheet로 제공한다. Mobile에서 panel을 열면 viewport 조작 영역이 가려지는 비율을 60% 이하로 제한한다.

### 5.2 검색

- 검색 대상: `code`, `content`, `keywords`, `subject`, `domain`.
- Unicode NFC 적용 후 앞뒤 공백을 제거한다. Code 검색은 입력한 대괄호의 유무를 모두 허용한다.
- 입력 debounce는 150ms, 결과 panel은 상위 20개를 먼저 제공한다.
- 순서는 정확한 code → code prefix → 본문·keywords 일치 → 교과·영역 일치다.
- 여러 검색어는 기본 AND로 적용한다. 같은 node에 모든 검색어가 존재해야 한다.
- 기본 검색 범위는 전체 655개다. Filter 밖 결과에는 해당 사실을 표시하고, 선택하면 “이 기준 중심으로 보기”로 전환할 수 있다.
- 결과를 선택하기 전에는 입력만으로 전체 Graph를 계속 재배치하지 않는다.
- Enter로 선택, 방향키로 검색 결과 이동, Escape로 결과 panel 닫기를 지원한다.
- 원문의 불규칙한 줄바꿈은 검색 index에서만 공백 정리한다. 원문 필드를 덮어쓰지 않는다.

### 5.3 Filter 결합 규칙

1. 선택한 교과·영역으로 일반 화면의 node 집합을 정한다. 교과 미선택은 전체 교과다.
2. 양쪽 endpoint가 이 집합에 속하는 edge를 가져온다.
3. 교과 관계 filter를 적용한다: 전체 / 같은 교과 / 다른 교과.
4. 선택 관계 유형의 `effectiveWeight >= minimumWeight`를 적용한다.
5. 전체 보기에서는 결과 edge가 없는 선택 교과 node도 유지한다.
6. 중심 탐색에서는 1-hop·2-hop 추출 후 화면 표시 한도를 적용한다.

교과를 하나만 고른 상태에서 “다른 교과”를 선택하면, 선택 교과와 직접 연결된 타 교과 endpoint를 추가로 포함한다. 이 경우 선택 교과 쪽 endpoint에 영역 filter를 적용하고 타 교과 endpoint에는 적용하지 않는다. 여러 교과를 골랐으면 그 교과들 사이의 edge만 대상으로 삼는다. 교과 미선택이면 모든 교과 간 edge를 대상으로 한다. 활성 상태를 toolbar의 문장형 요약으로 보여 준다.

## 6. 시각 표현 규칙

### 6.1 Node

| 속성 | 사양 |
|---|---|
| 모양 | 모든 성취기준은 circle |
| 기본 크기 | Overview에서 diameter 14px, 중심 탐색에서 18px |
| 선택 상태 | diameter 22px, 3px 진한 테두리 |
| 비교 대상 | 이중 테두리와 비교 번호 1 또는 2 |
| 색상 | 교과별 고정 palette; 명시적인 `subjectPalette.ts` mapping 사용 |
| 색상 보완 | Tooltip·목록·상세에 교과명을 항상 표시 |
| 관계 없는 현재 상태 | 채움 opacity 0.45; 클릭·검색은 유지 |
| Label | 기본은 코드, hover·선택에서는 항상 표시 |
| 상세 Label | 중심 탐색에서 충분히 확대한 경우 본문 앞 24자 추가 |

Node 크기를 난이도, 학습 중요도, 학년으로 해석하도록 만들지 않는다. 해당 정보는 현재 데이터에 없다. 21개 교과의 색상을 사용하되 색상만으로 식별하도록 요구하지 않으며, 교과명을 가진 범례와 filter를 함께 제공한다. Palette는 정렬 순서가 바뀌어도 유지되어야 한다.

### 6.2 Edge

일반 화면에서는 `effectiveWeight`에 따라 두께와 opacity를 적용한다. 다음은 초기 제작값이며 실제 viewport에서 가독성을 확인한 뒤 조정할 수 있다.

| Weight | Line width | 기본 opacity | 설명 |
|---|---:|---:|---|
| 1 | 0.6px | 0.12 | 약한 관련 |
| 2 | 0.8px | 0.18 | 부분 관련 |
| 3 | 1.2px | 0.30 | 중간 관련 |
| 4 | 1.8px | 0.48 | 높은 관련 |
| 5 | 2.6px | 0.68 | 매우 높은 관련 |

| 관계 유형 | 색상 | Line style |
|---|---|---|
| 내용 | `#475569` | solid |
| 역량 | `#2563EB` | dashed |
| 학습 위계 | `#B45309` | solid; 화살표는 학습 흐름 화면에서만 표시 |
| 기타 | `#7C3AED` | dotted |

여러 유형이 겹치면 선택된 유형 중 점수가 가장 높은 유형을 대표 스타일로 사용한다. 동점 우선순위는 `learning_hierarchy → content → competency → other`다. 같은 pair를 여러 선으로 복제하지 않고 상세 panel에 전체 유형 badge를 보여 준다.

학습 흐름에서는 모든 선에 방향을 표시하며 weight는 학습 위계 점수만 사용한다. 일반 화면의 교과 간 edge는 끝점의 교과명과 상세 badge로 식별한다.

### 6.3 복잡도 제어

- Zoom이 낮으면 일반 node label을 숨기고 선택·hover label만 표시한다.
- 자동 label은 Desktop viewport당 최대 100개, mobile 최대 30개를 우선 배치한다. 선택 항목은 한도와 무관하게 표시한다.
- Edge label은 기본 숨김이며 선택한 edge에만 `weight`와 유형을 표시한다.
- Node hover 시 직접 연결된 관계만 강조하고 나머지 edge는 opacity 0.05로 낮춘다.
- `weight >= 1`을 선택하면 사용자가 요청한 모든 4,958개 edge를 표시할 수 있어야 한다. 성능을 이유로 알림 없이 edge를 삭제하지 않는다.
- 초기 화면은 강한 관계만 보여 주고, 약한 관계가 필요하면 minimum weight를 낮추도록 한다.
- 터치 환경의 hover 기능은 node 또는 관계 목록의 tap으로 접근한다.
- 가까운 여러 edge의 직접 클릭이 어려우면 “주변 관계” 선택 목록을 열어 정확한 항목을 고를 수 있게 한다.

## 7. 상세 panel 사양

### 7.1 성취기준 상세

다음 순서로 표시한다.

1. 코드, 교과, 영역, 학년군.
2. 성취기준 본문 전체.
3. “이 기준 중심으로 보기”, “학습 흐름 보기”, “비교에 추가”.
4. 현재 조건의 연결 목록: effective weight 순, 교과와 본문 요약 포함.
5. 원문 해설과 적용 사항: 기본 접힘, 원문 줄바꿈 보존.
6. 분석된 주제와 역량: 원문이 아닌 분석 결과임을 표시.

`explanation`이 빈 문자열이면 “등록된 해설 없음”으로 표시한다. Node의 주제 ID와 역량 ID에 대한 표시명은 edge 파일의 `meta.topic_catalog`, `meta.competency_catalog`에서 읽는다. Catalog에 ID가 없으면 식별자 자체를 표시하고 콘솔에 진단을 기록한다.

### 7.2 연결 상세

양쪽 성취기준 본문을 함께 제시한 뒤 연결 이유를 보여 준다.

| 표시 항목 | 원본 필드 |
|---|---|
| 원래의 종합 weight | `weight` |
| 현재 선택 유형의 weight | 계산한 `effectiveWeight` |
| 관계별 점수 | `dimension_weights` |
| 연결 이유 | `reason` |
| 공유 주제 | `evidence.shared_topics` |
| 공유 역량 | `evidence.shared_competencies` |
| 공유 keywords | `evidence.shared_keywords` |
| 학습 방향·근거 | `learning_hierarchy` |
| 분석 상태 | `assessment_status` |

일반 설명은 “성취기준의 내용과 수행 목표를 바탕으로 추론한 관계입니다”로 한다. `weight`를 학생의 성취도나 관계의 probability로 표현하지 않는다. Model 이름, `semantic_cosine_similarity`, 규칙별 산정 기준은 접힌 “분석 정보”에 둔다.

`reason`에 선택하지 않은 유형의 설명도 포함될 수 있다. 상세에서는 현재 선택 유형 badge를 먼저 보여 주고 원래 이유는 “전체 관계 근거”라는 제목으로 제공한다. 근거 문장을 임의로 잘라 다른 의미로 재구성하지 않는다.

## 8. 기술 구성과 프로젝트 통합

기존 프로젝트의 `package.json`에서 Next.js 16.1.6, React 19.2.3, TypeScript 5 계열, Tailwind CSS 4 계열을 확인했다. 이 환경을 유지하고 탐색기 기능을 추가한다. 새 의존성의 구체적인 patch version은 구현 시작 시 호환성을 확인하고 lockfile에 고정한다.

| 역할 | 선택 | 선택 이유 |
|---|---|---|
| 웹 화면 | 기존 Next.js App Router + React + TypeScript | 기존 프로젝트에 통합 |
| Graph rendering | Cytoscape.js | node·edge 선택, 스타일, viewport 제어를 한 엔진에서 처리 |
| 일반 layout | `d3-force`, 전용 Web Worker | 위치 계산을 UI 처리와 분리 |
| 학습 흐름 layout | `elkjs`, layered 방식 | 분기·합류가 있는 방향성 학습 흐름 배치 |
| 검색·filter·목록 | TypeScript + React | 현재 데이터 규모에서 별도 검색 서버 불필요 |
| UI 상태 | React reducer + Context | 기능별 상태 변경과 URL 동기화를 명시적으로 관리 |
| 데이터 validation | TypeScript validator | ID, endpoint, 점수, 방향 정보 확인 |
| 검증 | Vitest + Testing Library, Playwright | 계산 규칙 및 실제 화면 동작 확인 |

Cytoscape.js는 Canvas 기반 Graph rendering과 스타일·상호작용 API를 제공한다. 본 사양에서는 전체 원문을 rendering element에 넣지 않고 필요한 속성만 전달한다. [Cytoscape.js 공식 문서](https://js.cytoscape.org/)

D3의 simulation은 전달한 node와 link를 수정하므로 반드시 layout용 복사본을 전달한다. `stop()`과 `tick()`을 이용한 계산은 Web Worker에서 실행하고 완료된 위치를 화면에 반영한다. [D3 simulation 문서](https://d3js.org/d3-force/simulation), [D3 link force 문서](https://d3js.org/d3-force/link)

ELK layered layout은 방향을 강조하는 배치를 제공한다. `elkjs`는 JavaScript에서 이 layout을 실행하기 위한 도구로 사용한다. 이 선택은 제품 설계 결정이며 실제 데이터의 배치 품질은 구현 후 확인한다. [ELK Layered 공식 문서](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html), [elkjs 공식 저장소](https://github.com/kieler/elkjs)

Graph renderer는 Client Component에서 지연 로드한다. `ssr: false`가 필요한 dynamic import는 Client Component 안에 둔다. 초기 서버 화면은 제목·검색 영역·로딩 상태를 제공한다. [Next.js lazy loading 문서](https://nextjs.org/docs/app/guides/lazy-loading)

### 8.1 제안 파일 구성

다음 tree는 `C:/Users/PC/Documents/asone-projects/2026/minerva` 아래에 향후 만들 구성이다.

```text
src/
  app/standards/graph/page.tsx
  components/standards-graph/
    StandardsGraphClient.tsx
    GraphViewport.tsx
    GraphToolbar.tsx
    SearchBox.tsx
    FilterPanel.tsx
    NodeDetails.tsx
    EdgeDetails.tsx
    ComparisonPanel.tsx
    StandardsTable.tsx
    RelationsTable.tsx
    GraphLegend.tsx
    GraphStatus.tsx
  lib/standards-graph/
    types.ts
    validate.ts
    selectors.ts
    neighborhood.ts
    hierarchy.ts
    search.ts
    renderer-adapter.ts
    reducer.ts
    url-state.ts
    export.ts
    subjectPalette.ts
    worker-client.ts
  workers/
    standards-data.worker.ts
    standards-layout.worker.ts
scripts/
  prepare-standards-graph.ts
public/standard/graph/
  manifest.json
  <datasetVersion>/
    nodes.json
    edges.json
    overview-layout.json
```

원본과 산출 데이터는 위 버전별 배포 폴더로 복사하여 사용한다. `prepare-standards-graph.ts`는 `public/standard/standards_middle.json`을 write하지 않는다. 배포 경로는 별도 설정 파일로 관리하여 개발자 PC의 절대 경로가 브라우저 요청 URL에 들어가지 않게 한다.

### 8.2 Component 책임

- `StandardsGraphClient`: Worker 초기화, reducer, 로딩·오류 상태 조정.
- `GraphViewport`: Cytoscape 인스턴스 생성·정리, element diff 적용, 클릭·viewport 이벤트 전달.
- `selectors`: raw graph와 filter 상태를 입력받아 표시 후보를 계산하는 pure function.
- `renderer-adapter`: 원본 ID를 보존하며 일반/학습 흐름용 renderer element를 생성.
- `standards-data.worker`: JSON 로드·validation·검색 index·관계 index·상세 조회.
- `standards-layout.worker`: layout용 경량 복사본만 받아 위치 계산.

React는 node마다 DOM element를 생성하지 않는다. React는 panel과 controls를 관리하고 Graph rendering은 Cytoscape가 담당한다. Unmount 시 이벤트 listener, Worker, renderer 자원을 정리한다.

## 9. 데이터 계약과 처리 절차

### 9.1 주요 TypeScript 계약

```ts
interface StandardNode {
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

interface StandardEdge {
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
  learning_hierarchy: null | {
    foundation: string;
    application: string;
    weight: Weight;
    status: "inferred";
    reason: string;
  };
  cross_subject: boolean;
  assessment_status: "inferred";
}
```

`DimensionWeight=0`은 해당 관계 유형을 채택하지 않았음을 나타낸다. 화면의 실제 edge weight에는 1–5만 표시한다.

### 9.2 Validation

파일 로드 시 다음을 확인한다.

1. `schema_version`이 지원 범위에 속하며 두 파일의 `source_sha256`이 같다.
2. Node ID와 edge ID에 중복이 없고 `node.id === node.code`다.
3. 모든 node의 `type`이 `achievement_standard`다.
4. Edge의 양쪽 endpoint가 존재하며 self-loop가 없다.
5. 같은 unordered pair가 중복되지 않는다. Key는 `JSON.stringify([a, b].sort())`처럼 식별자 사이의 경계를 보존하는 형식을 사용한다.
6. Weight는 1–5의 integer이며 `max(dimension_weights)`와 같다.
7. `relation_types`는 0보다 큰 `dimension_weights`를 가진 유형들과 일치한다.
8. 학습 위계의 endpoint는 일반 edge의 endpoint pair와 같고, 해당 유형의 weight도 일치한다.
9. `cross_subject`가 실제 양쪽 교과의 차이 여부와 일치한다.
10. `meta.count`와 실제 항목 수가 일치한다.

구조가 잘못된 파일은 Graph를 그리기 전에 명확한 오류를 표시한다. 사용자가 원인을 찾을 수 있도록 실패한 field와 code를 제공한다. 새로운 데이터 버전은 655개보다 많거나 적을 수 있으므로 현재 개수를 모든 버전의 고정 validation 조건으로 쓰지 않는다.

### 9.3 로드·계산 흐름

```text
manifest 로드
  → 동일 datasetVersion의 nodes.json·edges.json 병렬 fetch
  → Data Worker에서 parse·validate
  → nodeById / edgeById / adjacency / incoming / outgoing / search index
  → UI용 경량 summary 전달
  → 저장된 overview-layout 적용
  → 현재 filter의 element만 표시
  → 선택 대상의 원문·근거는 Worker에서 요청 시 전달
```

모든 원문과 중복된 근거 excerpt를 renderer에 복사하지 않는다. Renderer에는 ID, 코드, 교과, 스타일 속성, effective weight, 위치 정도만 담는다. 상세 panel은 `nodeId` 또는 `edgeId`로 필요한 내용을 조회한다.

### 9.4 버전과 cache

원본의 `source_sha256`만으로 cache key를 만들면 edge 판단이 바뀌어도 원본이 같을 때 cache가 갱신되지 않는다. 다음처럼 실제 두 산출물의 hash를 사용한다.

```text
datasetVersion = SHA256(nodesFileHash + "|" + edgesFileHash + "|" + schemaVersion)
layoutCacheKey = datasetVersion + ":" + layoutAlgorithmVersion + ":" + layoutMode
```

`manifest.json`에는 datasetVersion, schemaVersion, 파일별 URL·SHA256·bytes, nodeCount, edgeCount를 기록한다. Layout 파일에도 datasetVersion과 적용 조건을 기록한다. Manifest는 재확인 가능한 cache 정책으로, hash가 포함된 자산은 장기 cache 정책으로 배포한다.

### 9.5 Worker 메시지

```ts
type WorkerRequest =
  | { requestId: number; type: "LOAD"; manifestUrl: string }
  | { requestId: number; type: "FILTER"; state: GraphFilterState }
  | { requestId: number; type: "SEARCH"; query: string; limit: number }
  | { requestId: number; type: "NODE_DETAILS"; id: string }
  | { requestId: number; type: "EDGE_DETAILS"; id: string };

type WorkerResponse = {
  requestId: number;
  type: string;
  datasetVersion?: string;
  payload?: unknown;
  error?: { code: string; message: string; itemId?: string };
};
```

오래된 filter·검색·layout 응답은 최신 `requestId`와 비교하여 무시한다. 연속된 검색이나 filter 변경으로 이전 결과가 화면을 덮어쓰지 않도록 한다. Worker 실패 시 검색 가능한 목록 보기를 우선 제공하고 Graph 재시도를 안내한다.

Data Worker가 초기화 이전에 실패하면 동일한 loader·validator·index 코드를 main thread에서 동적으로 불러오는 fallback을 둔다. 먼저 node 파일로 검색 가능한 성취기준 목록을 만들고, edge 파일을 읽은 뒤 관계 목록을 추가한다. Index 생성은 100개 항목 단위로 실행하고 각 단계 사이에 UI 처리 기회를 준다. Layout Worker만 실패한 경우에는 Data Worker를 유지하여 기존 목록·검색·상세를 계속 제공한다.

## 10. Layout 제작 사양

### 10.1 일반 layout

전체 보기의 기본 위치는 빌드 시 계산하여 `overview-layout.json`으로 제공한다. 최초 표시부터 사용자가 위치를 확인할 수 있고 동일 버전에서 배치를 유지할 수 있다.

| 설정 | 초기 제작값 |
|---|---|
| 입력 node | 655개 전체 |
| 위치 계산용 edge | 원래 `weight >= 3`인 2,162개 |
| 입력 정렬 | code의 고정 문자열 순서 |
| Random seed | `20261002` |
| 초기 배치 | 교과 anchor 주변에 일정한 간격으로 배치 |
| `forceManyBody` | strength `-60` |
| `forceCollide` | node radius + 10px |
| Link distance | `140 - 18 * weight` |
| Link strength | `0.2 * (weight / 5) / max(1, sqrt(sourceDegree * targetDegree))` |
| 교과 anchor force | 0.03; 관계 중심 배치에서는 0 |
| `velocityDecay` | 0.4 |
| 종료 | 최대 300 ticks; 이후 좌표를 정지 |

위 값은 초기 tuning 값이다. 동일 입력과 seed의 재현성, 겹침, 교과 간 관계 가독성을 확인하여 조정하고 `layoutAlgorithmVersion`을 올린다. Link distance는 시각 배치를 위한 값이며 weight의 정확한 distance 변환으로 해석하지 않는다.

Filter 변경은 기본 배치를 유지한다. “재배치”는 현재 표시 대상에 대해 새 layout을 실행한다. Node를 drag하면 해당 node를 pin 상태로 만들고 해제 control을 제공한다. 검색·선택·panel 열기로 pin을 취소하지 않는다.

Layout Worker에는 `{ id, x, y, subject }`와 `{ source, target, weight }`만 복사하여 전달한다. 원문 node 객체와 원문 edge 객체를 D3에 직접 넘기지 않는다. Layout 실패 시 마지막 정상 좌표를 유지하고 재시도를 제공한다.

### 10.2 학습 흐름 layout

```ts
const elkOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "28",
  "elk.layered.spacing.nodeNodeBetweenLayers": "96",
  "elk.edgeRouting": "ORTHOGONAL",
};
```

ELK에 전달할 node 크기는 코드 label 공간을 포함한 120 × 56px로 잡는다. Renderer adapter는 ELK node의 top-left를 Cytoscape가 쓰는 center 위치로 변환한다. Overview보다 큰 label 영역을 확보하되 node의 실체는 같은 성취기준이다.

ELK가 반환한 bend point는 source·target과 함께 absolute 좌표로 변환하고 Cytoscape의 segment 방식으로 반영한다. 임의의 renderer route로 교체하여 방향선이 node 내부를 통과하지 않게 한다. Segment 변환이 실패한 edge에는 일시적으로 단순 선을 사용하고 진단을 기록한다.

사용자가 학습 방향을 따라 이동하면 현재 node를 강조하고 incoming·outgoing 기준 목록을 함께 제공한다. Cycle 검사에는 Kahn 방식의 topological sort를 사용하고 실패 시 관련 부분을 상세히 표시한다.

## 11. 상태 저장·공유·내보내기

### 11.1 화면 상태

```ts
interface GraphFilterState {
  subjects: string[];
  domains: [subject: string, domain: string][];
  relationTypes: RelationType[];
  minimumWeight: Weight;
  subjectRelation: "all" | "same" | "cross";
}

interface GraphViewState {
  mode: "overview" | "focus" | "hierarchy" | "table";
  filters: GraphFilterState;
  hierarchyMinimumWeight: Weight;
  hierarchyIncludeCrossSubject: boolean;
  focusNodeId: string | null;
  selectedEdgeId: string | null;
  selectedNodeId: string | null;
  comparisonNodeIds: string[]; // 최대 2개
  hops: 1 | 2;
  layoutMode: "subject" | "relations";
  showNeighborEdges: boolean;
  neighborLimit: number;
}
```

Reducer가 상태 변경을 담당한다. 일반 화면 설정과 학습 흐름 설정을 구분하여 mode 전환 후에도 이전 filter를 복원한다.

URL에는 mode, focus code, 교과·영역, 선택 유형, minimum weight, hop, 비교 대상을 기록한다. `URLSearchParams`로 한글·대괄호를 encoding하고, 입력을 JSON 파일의 ID와 대조한다. 잘못된 code는 기본 화면으로 복구하면서 찾을 수 없는 항목을 알려 준다.

공유 URL에는 datasetVersion을 포함한다. 해당 버전을 제공할 수 없으면 현재 버전으로 전환되었다는 안내를 표시한다. 개인 PC에서 저장한 위치와 pin 상태는 URL에 포함하지 않는다. 위치와 panel 열림 상태는 datasetVersion별 localStorage에 보존한다.

### 11.2 내보내기

| 형식 | 내용 |
|---|---|
| JSON | 포함된 node 원문과 edge 원문, datasetVersion, 현재 filter, 표시 범위 |
| PNG | 현재 viewport 또는 화면 맞춤 결과, 제목, 범례, 적용 조건, 추론 관계 설명 |

JSON 내보내기는 “현재 화면에 표시된 항목”과 “현재 조건에 맞는 전체 항목”을 구분한다. 후자는 중심 탐색의 표시 한도를 적용하기 전 결과를 내보낸다. 모든 endpoint가 node 목록에 포함되어야 한다.

Edge 원본의 `weight`, `source`, `target`, `learning_hierarchy`는 유지한다. 현재 filter에 따른 `effectiveWeight`와 학습 흐름의 표시 방향은 별도 `view` metadata에 기록한다. 내보내기로 원래 edge를 directed edge로 덮어쓰지 않는다.

PNG는 현재 viewport의 2배 pixel scale을 기본으로 하고, 최대 가로·세로 4096px로 제한한다. Graph image에 제목·범례를 별도 Canvas로 합성한다. Export 버튼 옆에 현재 표시 범위만 포함된다는 사실을 제시한다.

## 12. 성능·접근성·오류 처리 목표

### 12.1 성능 목표

다음은 구현 후 측정할 acceptance target이다. 현재 달성된 수치가 아니다.

측정 기준은 4-core급 CPU, 8GB RAM 이상, 1440 × 900 viewport, 실행 시점의 stable Chrome이며 실제 CPU·브라우저 버전을 결과에 기록한다. Cold load는 10Mbps, RTT 80ms 조건에서 측정하고 warm interaction은 데이터 로드 후 측정한다.

| 항목 | 목표 |
|---|---|
| 첫 사용 가능한 overview | navigation 시작 후 3초 이내, 5회 측정 median |
| 검색 결과 | 마지막 입력 후 debounce를 포함하여 p95 250ms 이내 |
| Filter 적용 | 입력 확정부터 rendering 반영까지 p95 300ms 이내 |
| Node 상세 열기 | p95 200ms 이내 |
| 기본 overview 조작 | pan·zoom 중 median 45fps 이상 |
| 전체 edge 표시 조작 | label을 제한한 상태에서 median 30fps 이상 |
| 학습 흐름 배치 | 현재 246개 관계 전체에서 2초 이내 목표 |
| 장기 사용 | mode 전환 20회 후 Worker·listener·renderer 인스턴스 누적 없음 |

먼저 저장된 layout, 원문과 renderer data 분리, 한 인스턴스의 element 갱신, label 제한을 적용한다. 이후 측정에서 병목이 확인된 경우 pixel ratio 조정이나 viewport 조작 중 표현 단순화를 검토한다. 자동 단순화는 표시량을 바꾸지 않고 label·edge 장식 수준에만 적용한다.

### 12.2 접근성

- Graph와 동일한 관계를 목록 보기에서 키보드로 찾고 열 수 있어야 한다.
- 일반 control은 44 × 44px 이상의 터치 영역을 확보한다.
- 색상 이외에 교과명·유형 badge·line style을 함께 사용한다.
- 기본 텍스트 대비 목표는 4.5:1, 주요 control 경계와 focus 표시는 3:1이다.
- Filter 결과 건수와 선택 변경을 `aria-live="polite"`로 안내한다.
- 검색 결과, 관계 목록, 상세 panel 사이 focus 이동과 복귀 규칙을 구현한다.
- `prefers-reduced-motion`이면 위치 이동 animation을 생략한다.
- Canvas의 개별 node를 읽을 수 없는 환경에서도 목록과 상세를 이용해 동일한 탐색 목적을 달성할 수 있게 한다.

### 12.3 상태별 안내

| 상태 | 처리 |
|---|---|
| 로딩 | 작업 단계 표시: 데이터 읽기 → 관계 준비 → 화면 표시 |
| Network 실패 | 재시도 버튼과 실패한 자산 종류 표시 |
| 두 데이터 버전 불일치 | Graph 생성 중단, 버전 정보 표시 |
| Filter 결과 edge 0개 | 선택 node는 유지, 조건 완화 control 제공 |
| 검색 결과 0개 | 검색어와 범위를 표시하고 초기화 제공 |
| 존재하지 않는 URL code | 기본 화면 복구와 안내 |
| Worker 또는 layout 실패 | 마지막 정상 화면 또는 목록 보기 제공 |
| 학습 위계 cycle | 학습 흐름 자동 배치 중단, 해당 code 목록 제공 |

JSON에 포함된 원문·근거·해설은 화면에 표시할 데이터로 취급한다. React text rendering을 사용하고 HTML로 실행하지 않는다. 원문 속 교육 활동 안내를 애플리케이션 동작 명령으로 해석하지 않는다.

## 13. 제작 단계와 산출물

### 단계 1 — 데이터 연결과 기본 탐색

산출물: 배포용 manifest·버전별 JSON, validator, index, 저장된 overview layout, 검색 가능한 전체 보기.

완료 조건: 기본 상태에서 node 655개와 edge 784개를 표시하고, 코드 검색 및 성취기준 원문 확인이 가능하다. 데이터 입력 파일과 원본 파일의 SHA256이 작업 전후 동일하다.

### 단계 2 — 관계 탐색과 설명

산출물: 관계 유형·교과·영역·weight filter, 1-hop·2-hop 중심 탐색, node·edge 상세, 두 성취기준 비교, 목록 보기.

완료 조건: 특정 유형만 선택하면 해당 유형 점수를 사용하고, 표시 한도와 전체 관계 수를 명확히 구분한다. 모든 edge의 근거에 접근할 수 있다.

### 단계 3 — 학습 흐름과 상태 복원

산출물: hierarchy index, cycle 검사, layered layout, 학습 방향 탐색, URL 공유·복원, pin·위치 저장.

완료 조건: 학습 흐름에서 246개 관계의 원래 방향을 보존하고, 여러 foundation이 하나의 application으로 연결되는 사례를 정상적으로 표시한다.

### 단계 4 — 배포 품질 확보

산출물: JSON·PNG export, responsive UI, 접근 가능한 목록·focus 동작, 성능 측정 기록, 자동 검증 결과, 배포 안내.

완료 조건: 아래 acceptance 항목을 충족하고, 실측 성능과 남은 제약을 기록한다. 현재 사양서 작성 단계에서는 사이트 배포나 기존 프로젝트 변경을 수행하지 않는다.

## 14. Acceptance criteria와 검증 시나리오

| ID | 확인 내용 | 통과 기준 |
|---|---|---|
| DATA-01 | 입력 보존 | 원본 및 입력 node·edge JSON의 SHA256 유지 |
| DATA-02 | Node 종류 | 모든 화면·export에서 성취기준만 node로 사용 |
| DATA-03 | Endpoint와 weight | 참조 오류·중복 pair·잘못된 weight가 있으면 명확한 오류 |
| FILTER-01 | 전체 유형, minimum 4 | 784개 edge |
| FILTER-02 | 전체 유형, minimum 3 | 2,162개 edge |
| FILTER-03 | 전체 유형, minimum 1 | 4,958개 edge, 655개 node |
| FILTER-04 | 유형별 weight | `content=1, competency=5`인 fixture에서 내용만 선택·minimum 4이면 제외 |
| FILTER-05 | 유형 중복 | 여러 유형의 동일 edge를 한 번만 표시 |
| FILTER-06 | 교과 간 관계 | 전체 교과·minimum 1에서 다른 교과 edge 2,945개 |
| FOCUS-01 | 국어 사례 | `[9국01-09]`는 전체 유형·minimum 1에서 관계 9개, minimum 3에서 3개 |
| FOCUS-02 | 표시 한도 | 화면 30개 표시 시 전체 결과 수와 추가 표시 control 제공 |
| FOCUS-03 | 2-hop | filter를 통과한 실제 path가 있는 기준만 표시 |
| HIER-01 | 전체 학습 흐름 | 학습 위계 점수 minimum 3에서 246개 edge |
| HIER-02 | 높은 학습 관계 | 학습 위계 점수 minimum 4에서 219개 edge |
| HIER-03 | 방향 확인 | `[9수01-01] → [9수01-02]`와 `[9과12-01] → [9과12-02]`를 올바르게 표시 |
| HIER-04 | 저장 순서 독립 | source·target 순서를 바꾼 fixture에서도 foundation → application 유지 |
| HIER-05 | 합류 | 하나의 application으로 들어오는 여러 foundation을 손실 없이 표시 |
| SEARCH-01 | Code 검색 | 대괄호 포함·생략 입력이 같은 기준을 찾음 |
| DETAIL-01 | 설명 표시 | 원문 본문과 edge reason을 누락 없이 확인 |
| STATE-01 | 공유 | URL에서 교과·유형·weight·중심 code·hop·mode 복원 |
| STATE-02 | 응답 순서 | 빠른 filter 변경 후 오래된 Worker 응답이 최신 화면을 덮어쓰지 않음 |
| EXPORT-01 | JSON 무결성 | 포함된 edge의 endpoint가 모두 존재하고 원래 weight·학습 방향 보존 |
| EXPORT-02 | PNG 해석 | 제목·범례·조건·추론 관계 설명 포함 |
| A11Y-01 | 키보드 | 검색 → 결과 → 상세 → 연결 기준 이동을 마우스 없이 완료 |
| PERF-01 | 실제 데이터 | 655 node / 4,958 edge로 성능 목표 측정 |

Filter·정렬·BFS·학습 방향·export는 unit test로 확인한다. 실제 component 상태와 상세 표시에는 component test를 적용하고, URL 복원·mobile·내보내기에는 browser test를 적용한다. Test fixture를 생성하더라도 실제 데이터 파일을 수정하지 않는다.

## 15. 구현자에게 전달할 완료 정의

이 사양의 완료는 **기존 Next.js 프로젝트에서 원본을 보존한 채 성취기준 655개를 탐색하고, 모든 관계의 근거와 선택 유형의 weight를 확인하며, 학습 방향을 정확하게 열람·공유·내보낼 수 있는 상태**다.

제작 착수 시 route 충돌과 기존 UI 공통 component를 확인한다. 이후 데이터 계약과 filter 규칙을 먼저 구현하고, 네 가지 화면과 layout을 순서대로 추가한다. 최종 전달물에는 기능 코드, 배포용 데이터·manifest, 검증 결과, 성능 실측 기록, 실행·배포 방법을 포함한다.
