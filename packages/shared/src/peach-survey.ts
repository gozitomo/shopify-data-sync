// 桃アンケートは Google スプレッドシート（Slackフォームの回答）が唯一のデータ源。
// このファイルはスプシ行のパースと品種別集計（Firestore非依存）を提供する。

// 5段階評価の軸（平均＆レーダー用）。果肉の赤さはカテゴリ項目なので含めない。
export const PEACH_SURVEY_RATING_FIELDS = [
  "sweetness",
  "acidity",
  "aroma",
  "texture",
  "juiciness",
  "skin_color",
  "overall",
] as const;

export type PeachRatingField = (typeof PEACH_SURVEY_RATING_FIELDS)[number];

// 評価軸の日本語ラベル（グラフ・表示用）
export const PEACH_RATING_LABELS: Record<PeachRatingField, string> = {
  sweetness: "甘さ",
  acidity: "酸味",
  aroma: "香り",
  texture: "硬さ",
  juiciness: "果汁感",
  skin_color: "着色度",
  overall: "おすすめ",
};

export interface PeachSurveyRecord {
  variety: string;
  size: string;
  days_since_harvest: number;
  ripeness: string;
  eating_style: string;
  processing_method?: string;
  sweetness: number;
  acidity: number;
  aroma: number;
  texture: number;
  juiciness: number;
  skin_color: number;
  overall: number;
  flesh_color: string; // 果肉の赤さ（5段階でなくカテゴリ値。分布として集計）
  comment?: string;
  respondent: string;
  submitted_at: string;
}

// スプシの列インデックス（ヘッダー順に固定）
// 品種名, サイズ, 収穫からの経過日数, 試食時の状態, 食べ方, 加工方法,
// 果肉の赤さ, 甘さ, 酸味, 香り, 硬さ(=食感), 果汁感, 着色度, おすすめ度,
// 推しポイント, 送信者, タイムスタンプ
const COL = {
  variety: 0,
  size: 1,
  days: 2,
  ripeness: 3,
  eating: 4,
  processing: 5,
  flesh_color: 6,
  sweetness: 7,
  acidity: 8,
  aroma: 9,
  texture: 10,
  juiciness: 11,
  skin_color: 12,
  overall: 13,
  comment: 14,
  respondent: 15,
  timestamp: 16,
} as const;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

// Sheets API の values（先頭行はヘッダー）を回答レコードに変換する。
export function parsePeachSurveyRows(values: string[][]): PeachSurveyRecord[] {
  return values
    .slice(1) // ヘッダー行を除去
    .filter((r) => str(r[COL.variety]) !== "")
    .map((r) => ({
      variety: str(r[COL.variety]),
      size: str(r[COL.size]),
      days_since_harvest: num(r[COL.days]),
      ripeness: str(r[COL.ripeness]),
      eating_style: str(r[COL.eating]),
      processing_method: str(r[COL.processing]) || undefined,
      flesh_color: str(r[COL.flesh_color]),
      sweetness: num(r[COL.sweetness]),
      acidity: num(r[COL.acidity]),
      aroma: num(r[COL.aroma]),
      texture: num(r[COL.texture]),
      juiciness: num(r[COL.juiciness]),
      skin_color: num(r[COL.skin_color]),
      overall: num(r[COL.overall]),
      comment: str(r[COL.comment]) || undefined,
      respondent: str(r[COL.respondent]),
      submitted_at: str(r[COL.timestamp]),
    }));
}

// 分布(値ごとの件数)として集計する非数値のカテゴリ項目。
export const PEACH_CATEGORY_FIELDS: {
  key: keyof PeachSurveyRecord;
  label: string;
}[] = [
  { key: "flesh_color", label: "果肉の赤さ" },
  { key: "ripeness", label: "試食時の状態" },
  { key: "eating_style", label: "食べ方" },
  { key: "processing_method", label: "加工方法" },
];

export interface CategorySummary {
  label: string;
  dist: Record<string, number>; // 値 → 件数
}

export interface VarietySummary {
  variety: string;
  count: number;
  avg: Record<PeachRatingField, number>;
  categories: CategorySummary[]; // カテゴリ項目の分布（値が無い項目は空distになる）
  comments: string[]; // 推しポイント（空でない回答のみ・回答者名は含めない）
}

// 品種ごとに件数・各評価軸の平均・カテゴリ分布・推しポイントを集計する（件数の多い順）。
export function summarizePeachSurvey(
  records: PeachSurveyRecord[],
): VarietySummary[] {
  const map = new Map<
    string,
    {
      count: number;
      sum: Record<PeachRatingField, number>;
      cats: Record<string, Record<string, number>>; // label → 値 → 件数
      comments: string[];
    }
  >();

  for (const r of records) {
    let e = map.get(r.variety);
    if (!e) {
      e = {
        count: 0,
        sum: Object.fromEntries(
          PEACH_SURVEY_RATING_FIELDS.map((f) => [f, 0]),
        ) as Record<PeachRatingField, number>,
        cats: Object.fromEntries(
          PEACH_CATEGORY_FIELDS.map((c) => [c.label, {}]),
        ),
        comments: [],
      };
      map.set(r.variety, e);
    }
    e.count += 1;
    for (const f of PEACH_SURVEY_RATING_FIELDS) e.sum[f] += r[f];
    for (const c of PEACH_CATEGORY_FIELDS) {
      const v = String(r[c.key] ?? "").trim();
      if (v) e.cats[c.label][v] = (e.cats[c.label][v] ?? 0) + 1;
    }
    if (r.comment) e.comments.push(r.comment);
  }

  return [...map.entries()]
    .map(([variety, e]) => ({
      variety,
      count: e.count,
      avg: Object.fromEntries(
        PEACH_SURVEY_RATING_FIELDS.map((f) => [
          f,
          e.count ? Number((e.sum[f] / e.count).toFixed(2)) : 0,
        ]),
      ) as Record<PeachRatingField, number>,
      categories: PEACH_CATEGORY_FIELDS.map((c) => ({
        label: c.label,
        dist: e.cats[c.label],
      })),
      comments: e.comments,
    }))
    .sort((a, b) => b.count - a.count);
}
