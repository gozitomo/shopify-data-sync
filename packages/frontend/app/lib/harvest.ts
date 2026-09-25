// 収穫記録グラフの計算（/api/harvest-summary のレスポンスを画面用に変換する）。
//
// 圃場ごとの収穫期は1年のうち数週間に集中するので、暦日をX軸にすると年ごとにズレて比較できない。
// そのため「その年の最初の収穫日＝0日目」とした経過日数をX軸にして年を重ねる。
// 0日目は圃場・作物で絞り込んだ後に決めないと意味がないため、この計算は画面側で行う。
// （スプシのパースと日次集計はサーバ側 packages/shared/src/harvest.ts）

// API のレスポンス（= shared の HarvestSummary）
export type HarvestField = { id: string; name: string; group: string };
export type HarvestDay = {
  date: string; // YYYY-MM-DD
  year: number;
  fieldId: string;
  crop: string;
  kg: number;
  count: number;
};
export type HarvestSummary = {
  fields: HarvestField[];
  crops: string[];
  years: number[];
  days: HarvestDay[];
};

// YYYY-MM-DD 同士の日数差（UTC基準なのでタイムゾーン・DSTの影響を受けない）
export function daysBetween(from: string, to: string): number {
  const at = (s: string) =>
    Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(5, 7)) - 1,
      Number(s.slice(8, 10)),
    );
  return Math.round((at(to) - at(from)) / 86_400_000);
}

export type HarvestSeriesPoint = {
  day: number; // その年の収穫開始日からの経過日数（0起点）
  date: string;
  kg: number; // その日の収穫量
  cumKg: number; // 開始日からの累積
};

export type HarvestSeries = {
  year: number;
  start: string; // 収穫開始日
  end: string; // 最終収穫日
  dayCount: number; // 収穫のあった日数
  totalKg: number;
  peak: HarvestSeriesPoint | null; // 単日で最も収穫した日
  points: HarvestSeriesPoint[];
};

export type HarvestFilter = {
  fieldId?: string; // 未指定 = すべての圃場
  crop?: string; // 未指定 = すべての作物
  years?: number[]; // 未指定 = データにある全年
};

// 日次バケットを絞り込み、年ごとの「収穫開始日=0日目」系列に変換する。
export function toDayIndexSeries(
  days: HarvestDay[],
  filter: HarvestFilter = {},
): HarvestSeries[] {
  const { fieldId, crop, years } = filter;
  const yearFilter = years && years.length > 0 ? new Set(years) : null;

  // 絞り込み後に (年 × 日) で合算する。そうしないと圃場/作物をまたいだ同日分が別の点になる。
  const byYear = new Map<number, Map<string, number>>();
  for (const d of days) {
    if (fieldId && d.fieldId !== fieldId) continue;
    if (crop && d.crop !== crop) continue;
    if (yearFilter && !yearFilter.has(d.year)) continue;
    let dates = byYear.get(d.year);
    if (!dates) byYear.set(d.year, (dates = new Map()));
    dates.set(d.date, (dates.get(d.date) ?? 0) + d.kg);
  }

  const series: HarvestSeries[] = [];
  for (const [year, dates] of byYear) {
    const sorted = [...dates.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (sorted.length === 0) continue;
    const start = sorted[0][0];
    let cum = 0;
    const points = sorted.map(([date, kg]) => {
      cum += kg;
      return { day: daysBetween(start, date), date, kg, cumKg: cum };
    });
    const peak = points.reduce<HarvestSeriesPoint | null>(
      (best, p) => (best === null || p.kg > best.kg ? p : best),
      null,
    );
    series.push({
      year,
      start,
      end: sorted[sorted.length - 1][0],
      dayCount: points.length,
      totalKg: cum,
      peak,
      points,
    });
  }
  return series.sort((a, b) => a.year - b.year);
}

// recharts 用に、年ごとの系列を経過日数で1本の配列にマージする。
// 各行は { day, "2024": kg, "2024__date": "2024-07-21", ... }。
export function mergeSeriesForChart(
  series: HarvestSeries[],
  cumulative = false,
): Record<string, number | string>[] {
  const byDay = new Map<number, Record<string, number | string>>();
  for (const s of series) {
    for (const p of s.points) {
      let row = byDay.get(p.day);
      if (!row) byDay.set(p.day, (row = { day: p.day }));
      row[String(s.year)] = cumulative ? p.cumKg : p.kg;
      row[`${s.year}__date`] = p.date;
    }
  }
  return [...byDay.values()].sort(
    (a, b) => (a.day as number) - (b.day as number),
  );
}

// 年ごとの線の色。年の並び順ではなく年の値から決めるので、
// チェックの付け外しで既存の線の色が変わらない。
const YEAR_HUES = [12, 200, 140, 275, 45, 330, 95, 240];
export function yearColor(year: number, baseYear: number): string {
  const hue = YEAR_HUES[Math.abs(year - baseYear) % YEAR_HUES.length];
  return `hsl(${hue} 70% 45%)`;
}
