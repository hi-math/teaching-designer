import type { IdeaItem } from '@/components/workspace/IdeasModal';
import type { StandardItem } from '@/components/workspace/StandardsModal';
import { bracketCode } from '@/lib/standardCode';

export function a3SelectionFields(ideas: IdeaItem[], standards: StandardItem[]) {
  return {
    core_ideas: ideas.map(item => ({ subject: item.subject, core_idea: item.content })),
    achievement_standards: standards.map(item => ({ subject: item.subject, standard: `${bracketCode(item.code)} ${item.content}` })),
  };
}

export function mergeCatalogItems<T>(existing: T[], recommended: T[], key: (item: T) => string): T[] {
  const merged = new Map(existing.map(item => [key(item), item]));
  recommended.forEach(item => merged.set(key(item), item));
  return [...merged.values()];
}
