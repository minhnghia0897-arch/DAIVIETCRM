// Số lead theo từng landing page (đọc source_detail.landing của lead nguồn landing_page), cho màn Marketing → Landing
// page. `rows` xếp mới nhất trước.

export interface LandingLeadStat {
  total: number;
  week: number;
  last: string | null;
}

export function leadStatsBySlug(
  rows: { created_at: string; source_detail: unknown }[],
  now: Date,
): Map<string, LandingLeadStat> {
  const weekAgo = now.getTime() - 7 * 24 * 3600_000;
  const stats = new Map<string, LandingLeadStat>();
  for (const l of rows) {
    const slug = (l.source_detail as { landing?: unknown } | null)?.landing;
    if (typeof slug !== "string" || !slug) continue;
    const s = stats.get(slug) ?? { total: 0, week: 0, last: null };
    s.total += 1;
    if (new Date(l.created_at).getTime() >= weekAgo) s.week += 1;
    s.last ??= l.created_at;
    stats.set(slug, s);
  }
  return stats;
}
