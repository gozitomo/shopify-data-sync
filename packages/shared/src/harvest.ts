// アグリノート「収穫記録」スプシ行のパースと集計（Firestore非依存の純粋関数）。
//
// 圃場ごとの収穫期は1年のうち数週間に集中するため、暦日をX軸にすると年ごとにズレて比較できない。
// そこで「その年の最初の収穫日＝0日目」とした経過日数で年を重ねて比較できるようにしている。
// 0日目の基準は圃場・作物で絞り込んだ後の値でなければ意味がないので、ここ(サーバ側)は日次集計まで。
// 絞り込みと0日目起点の計算は画面側 packages/frontend/app/lib/harvest.ts で行う。

export interface HarvestRecord {
  date: string; // YYYY-MM-DD
  year: number; // 暦年
  fieldId: string;
  fieldName: string;
  fieldGroup: string;
  crop: string; // 作付名から年を除いた品種名
  kg: number; // 入力（kg）
}

export interface HarvestField {
  id: string;
  name: string;
  group: string;
}

// (日付 × 圃場 × 作物) で合算した日次バケット
export interface HarvestDay {
  date: string;
  year: number;
  fieldId: string;
  crop: string;
  kg: number;
  count: number; // 元になった収穫記録の行数
}

export interface HarvestSummary {
  fields: HarvestField[];
  crops: string[];
  years: number[];
  days: HarvestDay[];
}

// ヘッダー名は全角カッコや空白のゆらぎがあり得るので正規化して照合する。
// （NFKC で「入力（kg）」→「入力(kg)」のように揃う）
function normalizeHeader(s: string): string {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

const REQUIRED_HEADERS = {
  date: "日付",
  fieldId: "圃場ID",
  fieldName: "圃場名",
  fieldGroup: "圃場グループ",
  crop: "作付名",
  kg: "圃場あたり（kg）",
} as const;

type ColumnKey = keyof typeof REQUIRED_HEADERS;

function resolveColumns(header: string[]): Record<ColumnKey, number> {
  const normalized = header.map(normalizeHeader);
  const cols = {} as Record<ColumnKey, number>;
  const missing: string[] = [];
  for (const [key, label] of Object.entries(REQUIRED_HEADERS) as [
    ColumnKey,
    string,
  ][]) {
    const idx = normalized.indexOf(normalizeHeader(label));
    if (idx < 0) missing.push(label);
    cols[key] = idx;
  }
  if (missing.length > 0) {
    throw new Error(
      `収穫記録シートに必要な列がありません: ${missing.join(", ")}`,
    );
  }
  return cols;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

// 作付名は「あかつき 2024」のように年が付いており、そのままだと年をまたいだ比較ができない。
// 末尾の年を落として品種名だけにする（例: "くり 2023" -> "くり"）。
export function normalizeCrop(name: string): string {
  return str(name).replace(/[\s\u3000]+\d{4}$/, "");
}

// "1,234.5" / "" / "-" などを数値に。数値でなければ NaN。
function num(v: unknown): number {
  const s = str(v).replace(/,/g, "");
  if (s === "") return NaN;
  return Number(s);
}

// "2024/7/21" "2024-07-21" "2024-07-21T00:00:00Z" "2024年7月21日" いずれも受理する。
export function toYmd(v: unknown): string | null {
  const m = str(v).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// スプシ行（先頭ヘッダー）を収穫記録に変換する。
// 日付が読めない行・数量が空/非数の行はスキップする（小計行や記入漏れ対策）。
export function parseHarvestRows(rows: string[][]): HarvestRecord[] {
  if (rows.length === 0) return [];
  const cols = resolveColumns(rows[0]);
  const records: HarvestRecord[] = [];
  for (const row of rows.slice(1)) {
    const date = toYmd(row[cols.date]);
    if (!date) continue;
    const kg = num(row[cols.kg]);
    if (!Number.isFinite(kg)) continue;
    records.push({
      date,
      year: Number(date.slice(0, 4)),
      fieldId: str(row[cols.fieldId]),
      fieldName: str(row[cols.fieldName]),
      fieldGroup: str(row[cols.fieldGroup]),
      crop: normalizeCrop(row[cols.crop]),
      kg,
    });
  }
  return records;
}

// 画面が必要とする選択肢（圃場・作物・年）と、日次バケットを作る。
export function summarizeHarvest(records: HarvestRecord[]): HarvestSummary {
  const fields = new Map<string, HarvestField>();
  const crops = new Set<string>();
  const years = new Set<number>();
  const days = new Map<string, HarvestDay>();

  for (const r of records) {
    if (!fields.has(r.fieldId)) {
      fields.set(r.fieldId, {
        id: r.fieldId,
        name: r.fieldName,
        group: r.fieldGroup,
      });
    }
    if (r.crop) crops.add(r.crop);
    years.add(r.year);

    // 区切り文字が値に含まれても衝突しないよう JSON 配列をキーにする。
    const key = JSON.stringify([r.date, r.fieldId, r.crop]);
    const bucket = days.get(key);
    if (bucket) {
      bucket.kg += r.kg;
      bucket.count += 1;
    } else {
      days.set(key, {
        date: r.date,
        year: r.year,
        fieldId: r.fieldId,
        crop: r.crop,
        kg: r.kg,
        count: 1,
      });
    }
  }

  const ja = (a: string, b: string) =>
    a.localeCompare(b, "ja", { numeric: true });
  return {
    fields: [...fields.values()].sort(
      (a, b) => ja(a.group, b.group) || ja(a.name, b.name),
    ),
    crops: [...crops].sort(ja),
    years: [...years].sort((a, b) => a - b),
    days: [...days.values()].sort((a, b) => ja(a.date, b.date)),
  };
}
