// ─── 카드 필드 타입 시스템 ────────────────────────────────────────────

export type ColumnType = 'text' | 'textarea' | 'select' | 'date' | 'subject-select';

export interface TableColumn {
  key: string;
  label: string;
  type: ColumnType;
  options?: string[];
  subjectSource?: 'ideas' | 'standards'; // for subject-select type
  align?: 'left' | 'center';
  flex?: number; // CSS flex-grow weight, default 1
  width?: number; // 고정 폭(px). 지정하면 flex 대신 쓴다
}

export type FieldType = 'text' | 'textarea' | 'bullets' | 'table' | 'richtext' | 'choice';

interface BaseField {
  key: string;
  label?: string;
  placeholder?: string;
}

export interface SimpleField extends BaseField {
  type: 'text' | 'textarea' | 'richtext';
}
export interface BulletsFieldDef extends BaseField {
  type: 'bullets';
  minRows?: number;
}
export interface TableFieldDef extends BaseField {
  type: 'table';
  columns: TableColumn[];
  minRows?: number;
  noAddRow?: boolean;
  /** 비어 있을 때 미리 채워 둘 행 (예: T-2 유목화의 분류) — 나머지 칸은 빈칸 */
  defaultRows?: Record<string, string>[];
}

/** 정해진 보기 중에서 고르는 칸 — multiple 이면 여러 개(값: string[]), 아니면 하나(값: string) */
export interface ChoiceFieldDef extends BaseField {
  type: 'choice';
  options: string[];
  multiple?: boolean;
}

export type FieldDef = SimpleField | BulletsFieldDef | TableFieldDef | ChoiceFieldDef;

export interface CardSchema {
  fields: FieldDef[];
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────

const t = (key: string, label?: string, placeholder?: string): SimpleField =>
  ({ type: 'text', key, label, placeholder });

const ta = (key: string, label?: string, placeholder?: string): SimpleField =>
  ({ type: 'textarea', key, label, placeholder });

const rt = (key: string, label?: string): SimpleField =>
  ({ type: 'richtext', key, label });

const bl = (key: string, label?: string, minRows = 3): BulletsFieldDef =>
  ({ type: 'bullets', key, label, minRows });

const tb = (key: string, label: string | undefined, columns: TableColumn[], minRows = 3): TableFieldDef =>
  ({ type: 'table', key, label, columns, minRows });

const ch = (key: string, label: string, options: string[], multiple = false): ChoiceFieldDef =>
  ({ type: 'choice', key, label, options, multiple });

// ─── 카드 스키마 ──────────────────────────────────────────────────────

export const CARD_SCHEMAS: Record<string, CardSchema> = {

  // ── 1단계: 팀 준비 ──────────────────────────────────────────────
  // 개인별 교육비전은 참가자마다 따로 저장해(T-1__vision_<userId>) ActivityCard 가 이 필드들 위에 그린다
  'T-1': {
    fields: [
      bl('vision_keywords', '비전 키워드', 1),
      rt('vision', '팀 공동 비전'),
    ],
  },
  'T-2': {
    fields: [
      {
        ...tb('direction_groups', '수업설계 방향 유목화', [
          { key: 'category', label: '분류',     type: 'select', options: ['교수 방법', '평가 방식', '테크놀로지 활용', '기타'], width: 150, align: 'center' },
          { key: 'idea',     label: '아이디어', type: 'textarea', flex: 4 },
        ], 4),
        defaultRows: [{ category: '교수 방법' }, { category: '평가 방식' }, { category: '테크놀로지 활용' }, { category: '기타' }],
      },
      bl('directions', '수업설계 방향 확정안'),
    ],
  },
  'T-3': {
    fields: [
      tb('roles', undefined, [
        { key: 'name',      label: '이름',      type: 'text', flex: 1 },
        { key: 'subject',   label: '과목',      type: 'text', flex: 1 },
        { key: 'core_role', label: '핵심 역할', type: 'text', flex: 2 },
        { key: 'area',      label: '담당 영역', type: 'text', flex: 2 },
      ], 3),
    ],
  },
  'T-4': {
    fields: [
      bl('rules'),
    ],
  },
  'T-5': {
    fields: [
      tb('schedule', undefined, [
        { key: 'due_date',    label: '목표 완료일', type: 'date', flex: 1.5, align: 'center' },
        { key: 'content',     label: '내용',       type: 'text', flex: 3 },
        { key: 'deliverable', label: '산출물',     type: 'text', flex: 2 },
      ], 5),
    ],
  },

  // ── 2단계: 분석 ─────────────────────────────────────────────────
  'A-1': {
    fields: [
      bl('criteria'),
    ],
  },
  'A-2': {
    fields: [
      bl('candidates', '후보 주제'),
      rt('final_topic', '최종 선정 주제'),
      ta('selection_rationale', '선정 사유'),
    ],
  },
  'A-3': {
    fields: [
      tb('core_ideas', '핵심 아이디어', [
        { key: 'subject',   label: '교과',        type: 'subject-select', subjectSource: 'ideas', width: 76, align: 'center' },
        { key: 'core_idea', label: '핵심 아이디어', type: 'textarea',       flex: 4 },
      ], 2),
      tb('achievement_standards', '성취기준', [
        { key: 'subject',  label: '교과',   type: 'subject-select', subjectSource: 'standards', width: 76, align: 'center' },
        { key: 'standard', label: '성취기준', type: 'textarea',       flex: 5 },
      ], 2),
    ],
  },
  'A-4': {
    fields: [
      ta('integration_narrative', '연계 설명', '핵심 아이디어 ↔ 성취기준 ↔ 협력적 수업설계의 연계를 설명하세요…'),
      rt('integrated_goal', '통합 수업 목표'),
    ],
  },
  // 차시 카드는 SimulationBoard 가 직접 그린다 (fields.sessions). 여기 등록은 구조화 카드로 저장되게 하려는 것.
  'A-5': {
    fields: [],
  },

  // ── 3단계: 설계 ─────────────────────────────────────────────────
  'Ds-1': {
    fields: [
      bl('eval_questions', '평가 질문', 3),
      tb('eval_methods', '평가 방법', [
        { key: 'type',   label: '평가 유형', type: 'select', options: ['진단','형성','수행','총괄'], flex: 1.2 },
        { key: 'target', label: '평가 대상', type: 'text',   flex: 2 },
        { key: 'method', label: '평가 방법', type: 'text',   flex: 2 },
        { key: 'timing', label: '시점',     type: 'text',   flex: 1.5 },
      ], 3),
      tb('rubric', '평가 기준 (루브릭)', [
        { key: 'axis',      label: '평가 축', type: 'text',     flex: 1.5 },
        { key: 'level_high', label: '상',     type: 'textarea', flex: 2 },
        { key: 'level_mid',  label: '중',     type: 'textarea', flex: 2 },
        { key: 'level_low',  label: '하',     type: 'textarea', flex: 2 },
      ], 2),
    ],
  },
  'Ds-2': {
    fields: [
      tb('problem_situations', undefined, [
        { key: 'situation', label: '문제 상황',  type: 'textarea', flex: 4 },
        { key: 'decision',  label: '채택 여부', type: 'select',   flex: 2,
          options: ['채택','보조 자료로 활용','보류','미채택'] },
      ], 3),
      ta('selection_rationale', '채택 결정 근거'),
    ],
  },
  'Ds-3': {
    fields: [
      tb('activities', '학습 활동', [
        { key: 'period',           label: '차시',          type: 'text',     flex: 0.8, align: 'center' },
        { key: 'activity',         label: '학습 활동 아이디어', type: 'textarea', flex: 4 },
        { key: 'linked_standards', label: '연결 성취기준', type: 'text',     flex: 2 },
      ], 3),
    ],
  },
  'Ds-4': {
    fields: [
      tb('support_tools', '지원 도구', [
        { key: 'stage',          label: '활동 단계', type: 'text', flex: 1.5 },
        { key: 'tool',           label: '도구 / 자원', type: 'text', flex: 2 },
        { key: 'purpose',        label: '활용 목적', type: 'text', flex: 2 },
        { key: 'related_period', label: '관련 차시', type: 'text', flex: 1, align: 'center' },
      ], 3),
      // 학생이 AI 결과를 그대로 받아들이지 않고 검토·수정·선택하는지, 교사가 개입할 순간이 있는지 점검한다
      tb('ai_agency', 'Human-AI Agency 점검', [
        { key: 'activity', label: '활동 / 도구',          type: 'text',     flex: 1.5 },
        { key: 'student',  label: '학생이 직접 할 일',     type: 'textarea', flex: 2 },
        { key: 'ai',       label: 'AI가 지원할 일',        type: 'textarea', flex: 2 },
        { key: 'teacher',  label: '교사가 확인·개입할 일', type: 'textarea', flex: 2 },
      ], 3),
    ],
  },
  'Ds-5': {
    fields: [
      tb('difficulties', '활동별 어려움 예상', [
        { key: 'activity',   label: '활동',                    type: 'text',     flex: 1.5 },
        { key: 'difficulty', label: '학생의 어려움 예상 지점', type: 'textarea', flex: 3 },
        { key: 'scaffold',   label: '필요한 스캐폴딩',         type: 'textarea', flex: 2.5 },
      ], 3),
      tb('support_level', '지원 수준 검토', [
        { key: 'support',   label: '지원 내용',                                     type: 'textarea', flex: 2 },
        { key: 'necessary', label: '이 지원이 없으면 수행이 어려운가?',             type: 'textarea', flex: 2 },
        { key: 'overreach', label: '이 지원이 있으면 스스로 생각하지 않아도 되는가?', type: 'textarea', flex: 2 },
        { key: 'adjust',    label: '조정 의견',                                     type: 'textarea', flex: 2 },
      ], 2),
      tb('support_plan', '지원 방안', [
        { key: 'stage',  label: '활동 단계', type: 'text',     flex: 1.5 },
        { key: 'target', label: '대상',      type: 'text',     flex: 1.2 },
        { key: 'method', label: '지원 방법', type: 'textarea', flex: 3 },
        { key: 'timing', label: '제공 시점', type: 'text',     flex: 1.2 },
      ], 3),
      ta('scaffold_summary', '스캐폴딩 핵심 정리', '지금까지의 논의를 바탕으로 핵심 내용을 정리하세요…'),
    ],
  },

  // ── 4단계: 개발·실행 ────────────────────────────────────────────
  'DI-1': {
    fields: [
      tb('dev_materials', '개발 자료 목록', [
        { key: 'member',   label: '팀원 이름', type: 'text',     flex: 1.2 },
        { key: 'material', label: '개발 자료', type: 'text',     flex: 2 },
        { key: 'content',  label: '내용',     type: 'textarea', flex: 3 },
        { key: 'reviewer', label: '검토자',   type: 'text',     flex: 1 },
      ], 3),
    ],
  },
  'DI-2': {
    fields: [
      ch('exec_mode', '실행 방식', ['개별 실행', '공동 실행']),
      tb('exec_roles', '역할 분담', [
        { key: 'role',    label: '역할',      type: 'text',     flex: 1.5 },
        { key: 'teacher', label: '담당 교사', type: 'text',     flex: 1.2 },
        { key: 'detail',  label: '주요 내용', type: 'textarea', flex: 3 },
      ], 2),
      tb('exec_schedule', '수업 실행 일정', [
        { key: 'period',  label: '차시',     type: 'text', flex: 0.8, align: 'center' },
        { key: 'date',    label: '날짜',     type: 'date', flex: 1.5, align: 'center' },
        { key: 'time',    label: '시간',     type: 'text', flex: 1,   align: 'center' },
        { key: 'place',   label: '장소',     type: 'text', flex: 1.5, align: 'center' },
        { key: 'teacher', label: '담당 교사', type: 'text', flex: 1.5, align: 'center' },
      ], 3),
      tb('episodes', '수업 주요 상황·에피소드 기록', [
        { key: 'when',     label: '시간 / 차시',     type: 'text',     flex: 1,   align: 'center' },
        { key: 'episode',  label: '상황 / 에피소드', type: 'textarea', flex: 3.5 },
        { key: 'activity', label: '관련 활동',       type: 'text',     flex: 1.5 },
        { key: 'method',   label: '기록 방식',       type: 'text',     flex: 1.2, align: 'center' },
        { key: 'recorder', label: '기록자',          type: 'text',     flex: 1,   align: 'center' },
      ], 3),
      ch('record_types', '공유한 기록의 유형 (복수 선택)', ['영상', '사진', '녹음', '노트', '기타'], true),
      ta('observations', '주요 관찰 및 공유 내용', '예상과 달랐던 학생 반응, 인상적인 발화, 뜻밖의 질문 등을 근거와 함께 적어 주세요…'),
    ],
  },

  // ── 5단계: 평가·성찰 ────────────────────────────────────────────
  'E-1': {
    fields: [
      tb('student_evidence', '학생 자료 분석', [
        { key: 'achieved',   label: '목표에 잘 도달한 사례',          type: 'textarea', flex: 1 },
        { key: 'struggles',  label: '자주 보인 어려움 / 오개념 사례', type: 'textarea', flex: 1 },
        { key: 'unexpected', label: '예상 밖의 창의적 반응 사례',     type: 'textarea', flex: 1 },
      ], 2),
      tb('gap_improvements', '간극의 원인과 개선 아이디어', [
        { key: 'cause', label: '간극의 원인 분석',     type: 'textarea', flex: 1 },
        { key: 'idea',  label: '개선 아이디어 / 대안', type: 'textarea', flex: 1 },
      ], 3),
      tb('design_revisions', '설계안 수정 기록', [
        { key: 'item',   label: '수정 항목', type: 'text',     flex: 1.5 },
        { key: 'before', label: '수정 전',   type: 'textarea', flex: 2.5 },
        { key: 'after',  label: '수정 후',   type: 'textarea', flex: 2.5 },
        { key: 'reason', label: '수정 이유', type: 'textarea', flex: 2 },
      ], 3),
    ],
  },
  'E-2': {
    fields: [
      tb('design_rubric', '협력적 수업설계 종합 평가', [
        { key: 'area',     label: '영역',    type: 'select',   flex: 1.5,
          options: ['T 팀 준비','A 분석','Ds 설계','DI 개발·실행','E 평가·성찰','공통'] },
        { key: 'question', label: '평가 문항', type: 'textarea', flex: 4 },
        { key: 'score',    label: '점수(1~4)', type: 'select',   flex: 0.8,
          options: ['1','2','3','4'] },
      ], 3),
      ta('reflection_note', '팀 성찰 메모', '개선 과제를 기록하세요…'),
    ],
  },
};

// ─── 구조화 데이터를 AI 컨텍스트용 텍스트로 직렬화 ──────────────────
export function serializeStructuredForAI(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(fields)) {
    if (!val) continue;
    if (typeof val === 'string') {
      lines.push(`[${key}] ${val}`);
    } else if (Array.isArray(val)) {
      if (val.length === 0) continue;
      if (typeof val[0] === 'string') {
        // bullets
        lines.push(`[${key}]`);
        (val as string[]).forEach(s => s && lines.push(`• ${s}`));
      } else {
        // table rows
        lines.push(`[${key}]`);
        (val as Record<string, string>[]).forEach(row => {
          const cells = Object.entries(row)
            .filter(([k, v]) => k !== 'id' && v)
            .map(([, v]) => v)
            .join(' | ');
          if (cells) lines.push(`  ${cells}`);
        });
      }
    }
  }
  return lines.join('\n');
}
