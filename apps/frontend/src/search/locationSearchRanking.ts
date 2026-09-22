export interface RankedLocationOption {
  readonly label: string;
  readonly path: string;
}

export function rankLocationOptions<T extends RankedLocationOption>(
  options: readonly T[],
  query: string,
  limit = 12,
): T[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length < 2) return [];

  return options
    .map((option) => ({ option, score: scoreOption(option, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.option.path.localeCompare(right.option.path))
    .slice(0, limit)
    .map((item) => item.option);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function scoreOption(option: RankedLocationOption, query: string): number {
  const label = normalize(option.label);
  const path = normalize(option.path);
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(query)) return 60;
  if (path.includes(query)) return 30;
  return 0;
}
