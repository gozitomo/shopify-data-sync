import { describe, it, expect } from "vitest";
import {
  normalizeCrop,
  parseHarvestRows,
  summarizeHarvest,
  toYmd,
} from "../../packages/shared/src/harvest.ts";
import {
  daysBetween,
  mergeSeriesForChart,
  toDayIndexSeries,
} from "../../packages/frontend/app/lib/harvest.ts";

// アグリノート同期シートのヘッダー（実物と同じ並び・全角カッコ）
const HEADER = [
  "収穫ID",
  "日付",
  "作付ID",
  "作付名",
  "圃場グループ",
  "圃場ID",
  "圃場名",
  "作付面積（アール）",
  "計測タイミング",
  "品質・規格",
  "入力（数値）",
  "入力（単位）",
  "入力（kg）",
  "圃場あたり（数値）",
  "圃場あたり（単位）",
  "圃場あたり（kg）",
  "収穫ロット番号",
  "メモ",
];

function row(
  date: string,
  crop: string,
  group: string,
  fieldId: string,
  fieldName: string,
  inputKg: string,
  perFieldKg = "9999",
): string[] {
  return [
    "h1",
    date,
    "c1",
    crop,
    group,
    fieldId,
    fieldName,
    "10",
    "収穫時",
    "秀",
    "20",
    "コンテナ",
    inputKg,
    "100",
    "コンテナ",
    perFieldKg,
    "lot1",
    "",
  ];
}

describe("toYmd", () => {
  it("区切り文字のゆらぎを吸収する", () => {
    expect(toYmd("2024/7/21")).toBe("2024-07-21");
    expect(toYmd("2024-07-21")).toBe("2024-07-21");
    expect(toYmd("2024年7月21日")).toBe("2024-07-21");
    expect(toYmd("2024-07-21T09:30:00.000Z")).toBe("2024-07-21");
  });
  it("日付でないものは null", () => {
    expect(toYmd("")).toBeNull();
    expect(toYmd("合計")).toBeNull();
    expect(toYmd("2024/13/01")).toBeNull();
  });
});

describe("daysBetween", () => {
  it("うるう年をまたいでも正しい", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // 2024はうるう年
    expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
  });
  it("同じ日は0", () => {
    expect(daysBetween("2024-07-21", "2024-07-21")).toBe(0);
  });
});

describe("normalizeCrop", () => {
  it("作付名の末尾の年を落とす", () => {
    expect(normalizeCrop("くり 2023")).toBe("くり");
    expect(normalizeCrop("だて白桃 2026")).toBe("だて白桃");
    expect(normalizeCrop("もも未成園 2022")).toBe("もも未成園");
    expect(normalizeCrop("あかつき\u30002024")).toBe("あかつき"); // 全角スペース
  });
  it("年が付いていなければそのまま", () => {
    expect(normalizeCrop("くり")).toBe("くり");
    expect(normalizeCrop("")).toBe("");
  });
});

describe("parseHarvestRows", () => {
  it("入力（kg）を読み、圃場あたり（kg）は使わない", () => {
    const rows = [HEADER, row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "120.5", "9999")];
    expect(parseHarvestRows(rows)).toEqual([
      {
        date: "2024-07-21",
        year: 2024,
        fieldId: "F1",
        fieldName: "南畑",
        fieldGroup: "本圃場",
        crop: "白鳳",
        kg: 120.5,
      },
    ]);
  });

  it("カンマ付きの数値を読める", () => {
    const rows = [HEADER, row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "1,234.5")];
    expect(parseHarvestRows(rows)[0].kg).toBe(1234.5);
  });

  it("日付が読めない行・数量が空の行はスキップする", () => {
    const rows = [
      HEADER,
      row("", "白鳳", "本圃場", "F1", "南畑", "10"),
      row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", ""),
      row("2024/7/22", "白鳳", "本圃場", "F1", "南畑", "10"),
    ];
    expect(parseHarvestRows(rows)).toHaveLength(1);
  });

  it("列順が入れ替わってもヘッダー名で解決する", () => {
    const swapped = [...HEADER];
    // 「日付」と「作付名」の位置を入れ替える
    [swapped[1], swapped[3]] = [swapped[3], swapped[1]];
    const r = row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "10");
    [r[1], r[3]] = [r[3], r[1]];
    expect(parseHarvestRows([swapped, r])[0]).toMatchObject({
      date: "2024-07-21",
      crop: "白鳳",
    });
  });

  it("必要な列が無ければエラーにする", () => {
    const broken = HEADER.map((h) => (h === "入力（kg）" ? "入力（ｇ）" : h));
    expect(() => parseHarvestRows([broken, row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "10")]))
      .toThrow(/入力（kg）/);
  });

  it("空のシートは空配列", () => {
    expect(parseHarvestRows([])).toEqual([]);
  });
});

describe("summarizeHarvest", () => {
  it("作付名の年違いを同じ作物としてまとめる", () => {
    const s = summarizeHarvest(
      parseHarvestRows([
        HEADER,
        row("2024/9/20", "くり 2024", "くり", "F9", "寺裏：栗", "40"),
        row("2023/9/22", "くり 2023", "くり", "F9", "寺裏：栗", "35"),
      ]),
    );
    expect(s.crops).toEqual(["くり"]);
    expect(s.days.map((d) => d.crop)).toEqual(["くり", "くり"]);
  });

  it("同じ(日付×圃場×作物)を合算し、選択肢を組み立てる", () => {
    const rows = [
      HEADER,
      // 同日・同圃場・同作物で計測タイミング違いの2行 → 合算して1バケット
      row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "100"),
      row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "50"),
      row("2024/7/21", "あかつき", "本圃場", "F2", "北畑", "30"),
      row("2023/7/25", "白鳳", "本圃場", "F1", "南畑", "80"),
    ];
    const s = summarizeHarvest(parseHarvestRows(rows));
    expect(s.years).toEqual([2023, 2024]);
    expect(s.crops).toEqual(["あかつき", "白鳳"]);
    expect(s.fields.map((f) => f.id).sort()).toEqual(["F1", "F2"]);
    expect(s.days).toHaveLength(3);
    const merged = s.days.find((d) => d.date === "2024-07-21" && d.fieldId === "F1")!;
    expect(merged.kg).toBe(150);
    expect(merged.count).toBe(2);
  });
});

describe("toDayIndexSeries", () => {
  const days = summarizeHarvest(
    parseHarvestRows([
      HEADER,
      // 2024: F1は7/21開始
      row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "100"),
      row("2024/7/23", "白鳳", "本圃場", "F1", "南畑", "200"),
      // 2024: F2は7/15開始（全圃場だと基準日がこちらになる）
      row("2024/7/15", "あかつき", "本圃場", "F2", "北畑", "10"),
      // 2023: F1は7/25開始
      row("2023/7/25", "白鳳", "本圃場", "F1", "南畑", "80"),
      row("2023/7/26", "白鳳", "本圃場", "F1", "南畑", "20"),
    ]),
  ).days;

  it("年ごとに収穫開始日を0日目にする", () => {
    const series = toDayIndexSeries(days, { fieldId: "F1" });
    expect(series.map((s) => s.year)).toEqual([2023, 2024]);
    const y2024 = series.find((s) => s.year === 2024)!;
    expect(y2024.start).toBe("2024-07-21");
    expect(y2024.points.map((p) => p.day)).toEqual([0, 2]);
    expect(y2024.totalKg).toBe(300);
    expect(y2024.peak).toMatchObject({ day: 2, kg: 200 });
    const y2023 = series.find((s) => s.year === 2023)!;
    expect(y2023.start).toBe("2023-07-25");
    expect(y2023.points.map((p) => p.day)).toEqual([0, 1]);
  });

  it("絞り込みを変えると開始日が再計算される", () => {
    // 全圃場だと2024の開始日は F2 の 7/15
    const all = toDayIndexSeries(days, { years: [2024] })[0];
    expect(all.start).toBe("2024-07-15");
    expect(all.points.map((p) => p.day)).toEqual([0, 6, 8]);
    // F1だけなら 7/21 が0日目
    const f1 = toDayIndexSeries(days, { fieldId: "F1", years: [2024] })[0];
    expect(f1.start).toBe("2024-07-21");
    expect(f1.points.map((p) => p.day)).toEqual([0, 2]);
  });

  it("作物で絞り込める", () => {
    const series = toDayIndexSeries(days, { crop: "あかつき" });
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ year: 2024, start: "2024-07-15", totalKg: 10 });
  });

  it("年で絞り込むと他の年は含まれない", () => {
    expect(toDayIndexSeries(days, { years: [2023] }).map((s) => s.year)).toEqual([2023]);
  });

  it("累積値は開始日からの積み上げ", () => {
    const y2024 = toDayIndexSeries(days, { fieldId: "F1", years: [2024] })[0];
    expect(y2024.points.map((p) => p.cumKg)).toEqual([100, 300]);
  });

  it("該当データが無ければ空", () => {
    expect(toDayIndexSeries(days, { fieldId: "F9" })).toEqual([]);
  });
});

describe("mergeSeriesForChart", () => {
  const days = summarizeHarvest(
    parseHarvestRows([
      HEADER,
      row("2024/7/21", "白鳳", "本圃場", "F1", "南畑", "100"),
      row("2024/7/23", "白鳳", "本圃場", "F1", "南畑", "200"),
      row("2023/7/25", "白鳳", "本圃場", "F1", "南畑", "80"),
    ]),
  ).days;

  it("経過日数をキーに年ごとの列を並べる", () => {
    const rows = mergeSeriesForChart(toDayIndexSeries(days, { fieldId: "F1" }));
    expect(rows).toEqual([
      { day: 0, "2023": 80, "2023__date": "2023-07-25", "2024": 100, "2024__date": "2024-07-21" },
      { day: 2, "2024": 200, "2024__date": "2024-07-23" },
    ]);
  });

  it("累積モードでは累積値を入れる", () => {
    const rows = mergeSeriesForChart(toDayIndexSeries(days, { fieldId: "F1" }), true);
    expect(rows[1]["2024"]).toBe(300);
  });
});
