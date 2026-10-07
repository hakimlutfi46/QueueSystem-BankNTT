export function counterPages<T>(counters: T[]): { columns: 1 | 2; pages: T[][] } {
  if (counters.length <= 4) return { columns: 1, pages: [counters] };
  if (counters.length <= 8) return { columns: 2, pages: [counters] };
  const pages: T[][] = [];
  for (let index = 0; index < counters.length; index += 8) {
    pages.push(counters.slice(index, index + 8));
  }
  return { columns: 2, pages };
}
