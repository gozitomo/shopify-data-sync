import { describe, it, expect } from "vitest";
import { parseNagamaruInvoiceText } from "../../packages/shared/src/nagamaru-invoice-pdf.ts";

// 実物の購買請求書PDF（20260331_23434413_購買請求書.pdf）を
// pdf-parseで抽出した生テキストそのまま（列の並び順が行ごとに入れ替わる箇所を含む）。
const SAMPLE_TEXT = `お買上日 	品 名 軽
減 	数量 	単価 	金額 	伝票№ 	備考	税区分 	ご利用部署
入金
情報	消費税等
TEL.
次 回 以 降 請 求 予 定 額
支払日指定 	支払月指定
請 求 明 細 書
〒
ページ
日頃は、ＪＡ事業をご利用いただき、ありがとうございます。
今回のご請求金額については、下記のとおりです。
なお、本書到着前にご入金いただいた節は、ご容赦ください。
作 成 日
注）※印は、軽減税率適用商品
①繰越金額 	②繰越遅延利息 ③今回請求対象額
前 回 情 報 	今回請求情報
④うち 入金額 ⑤今回ご請求額 	⑥遅延利息
⑤＋⑥
⑦今回ご請求合計額
今回請求時点の計算額	①＋③－④
「済」印は、明細金額入金、☆印は、明細一部入金取引
381 0208
上高井郡小布施町大字都住６６－４
細野 善寛
064-00000-000000000000
1
ＢＢ ながの果樹専用肥料 ２０ＫＯ 	10.00 	3,446.00 	34,460	内税	2026/03/23 	アグリＨ小布施 	Y301995
2026/03/31
2026/04/20
064-0024***
0 	89,980 	0 	89,980 	0
89,980
0
振替予定日
23434413-000 1
様
サンリード２号 ２０ＫＯ 	10.00 	2,946.00 	29,460 	アグリＨ小布施	内税	2026/03/23 	Y301995
サンライム（粒）２０ＫＯ 	6.00 	1,346.00 	8,076	内税	2026/03/23 	アグリＨ小布施 	Y301995
みどりマグ ２０ＫＯ 	2.00 	2,746.00 	5,492 	アグリＨ小布施	内税	2026/03/23 	Y301995
グリーンセーフプラス １０ＫＺ 	2.00 	6,246.00 	12,492	内税	2026/03/23 	アグリＨ小布施 	Y301995
今回お買上額計(税込) 	89,980
内訳
10% 	税抜金額 消費税 	81,800 	8,180
ながの農業協同組合
小布施
上高井郡小布施町大字小布施１５０７－１
026-247-3131 	0 	0 ∴23434413

-- 1 of 1 --
`;

describe("parseNagamaruInvoiceText", () => {
  it("実物PDFの抽出テキストから品目・作成日・振替予定日・合計額を正しく抽出する", () => {
    const result = parseNagamaruInvoiceText(SAMPLE_TEXT);

    expect(result.createdDate).toBe("2026/03/31");
    expect(result.transferDate).toBe("2026/04/20");
    expect(result.totalAmount).toBe(89980);
    expect(result.lineItems).toHaveLength(5);

    // 列の並び順が行によって入れ替わっていても正しく解釈できること
    expect(result.lineItems[0]).toEqual({
      date: "2026/03/23",
      name: "ＢＢ ながの果樹専用肥料 ２０ＫＯ",
      quantity: 10,
      unitPrice: 3446,
      amount: 34460,
      taxCategory: "内税",
      department: "アグリＨ小布施",
      slipNo: "Y301995",
    });
    expect(result.lineItems[1]).toEqual({
      date: "2026/03/23",
      name: "サンリード２号 ２０ＫＯ",
      quantity: 10,
      unitPrice: 2946,
      amount: 29460,
      taxCategory: "内税",
      department: "アグリＨ小布施",
      slipNo: "Y301995",
    });

    const sum = result.lineItems.reduce((s, i) => s + i.amount, 0);
    expect(sum).toBe(result.totalAmount);
  });

  it("品目行が無ければ例外を投げる", () => {
    expect(() => parseNagamaruInvoiceText("何もない請求書")).toThrow(
      "品目行を1件も抽出できませんでした",
    );
  });

  it("品目合計と請求合計額が不一致なら例外を投げる", () => {
    const broken = SAMPLE_TEXT.replace("今回お買上額計(税込) \t89,980", "今回お買上額計(税込) \t99,999");
    expect(() => parseNagamaruInvoiceText(broken)).toThrow("一致しません");
  });
});
