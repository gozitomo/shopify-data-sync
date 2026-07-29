// 品種別集計を QuickChart のレーダーチャート画像URLに変換する。
// このURLをそのまま Slack の image block の image_url に使える（画像ホスティング不要）。
import {
  PEACH_SURVEY_RATING_FIELDS,
  PEACH_RATING_LABELS,
  type VarietySummary,
} from "./peach-survey.js";

// QuickChart(Chart.js v2)用の radar 設定を組み立て、画像URLを返す。
export function buildRadarChartUrl(summaries: VarietySummary[]): string {
  const labels = PEACH_SURVEY_RATING_FIELDS.map((f) => PEACH_RATING_LABELS[f]);
  const datasets = summaries.map((s) => ({
    label: `${s.variety}(${s.count})`,
    data: PEACH_SURVEY_RATING_FIELDS.map((f) => s.avg[f]),
    fill: true,
  }));

  const config = {
    type: "radar",
    data: { labels, datasets },
    options: {
      scale: { ticks: { beginAtZero: true, min: 0, max: 5, stepSize: 1 } },
    },
  };

  const c = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?w=600&h=500&c=${c}`;
}
