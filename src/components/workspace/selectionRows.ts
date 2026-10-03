type Row = Record<string, string>;

/** Keep AI/manual rows while replacing only the rows created by an earlier search selection. */
export function mergeSearchSelection<T>(
  currentRows: Row[],
  previous: T[],
  next: T[],
  toRow: (item: T) => Row,
  emptyRow: Row,
): Row[] {
  const previousKeys = new Set(previous.map(item => JSON.stringify(toRow(item))));
  const manual = currentRows.filter(row => {
    if (Object.values(row).every(value => !value?.trim())) return false;
    return !previousKeys.has(JSON.stringify(row));
  });
  const seen = new Set(manual.map(row => JSON.stringify(row)));
  for (const item of next) {
    const row = toRow(item);
    const key = JSON.stringify(row);
    if (!seen.has(key)) { manual.push(row); seen.add(key); }
  }
  return manual.length ? manual : [{ ...emptyRow }, { ...emptyRow }];
}

export function cardRows(value: unknown, contentKey: string): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Row => row !== null && typeof row === 'object')
    .map(row => ({ subject: String(row.subject ?? ''), [contentKey]: String(row[contentKey] ?? '') }));
}
