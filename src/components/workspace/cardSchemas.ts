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
}

export type FieldType = 'text' | 'textarea' | 'bullets' | 'table' | 'richtext';

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
}

export type FieldDef = SimpleField | BulletsFieldDef | TableFieldDef;

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

// ─── 카드 스키마 ──────────────────────────────────────────────────────

export const CARD_SCHEMAS: Record<string, CardSchema> = {

  // ── 1단계: 팀 준비 ──────────────────────────────────────────────
  'T-1': {
    fields: [
      rt('vision', '팀 공동 비전'),
      ta('vision_note', '배경 및 맥락 (선택)', '비전의 배경과 맥락을 설명하세요…'),
    ],
  },
  'T-2': {
    fields: [
      bl('directions'),
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
      { ...tb('core_ideas', '핵심 아이디어', [
        { key: 'subject',   label: '교과',        type: 'subject-select', subjectSource: 'ideas', flex: 1 },
        { key: 'core_idea', label: '핵심 아이디어', type: 'textarea',       flex: 4 },
      ], 2), noAddRow: true },
      tb('achievement_standards', '성취기준', [
        { key: 'subject',  label: '교과',   type: 'subject-select', subjectSource: 'standards', flex: 1 },
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
      tb('exec_schedule', '수업 실행 일정', [
        { key: 'period',  label: '차시',     type: 'text', flex: 0.8, align: 'center' },
        { key: 'date',    label: '날짜',     type: 'date', flex: 1.5, align: 'center' },
        { key: 'time',    label: '시간',     type: 'text', flex: 1,   align: 'center' },
        { key: 'place',   label: '장소',     type: 'text', flex: 1.5, align: 'center' },
        { key: 'teacher', label: '담당 교사', type: 'text', flex: 1.5, align: 'center' },
      ], 3),
    ],
  },

  // ── 5단계: 평가·성찰 ────────────────────────────────────────────
  'E-1': {
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
