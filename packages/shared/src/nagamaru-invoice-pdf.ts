import { PDFParse } from "pdf-parse";

export type NagamaruInvoiceLineItem = {
  date: string; // お買上日 (YYYY/MM/DD)
  name: string; // 品名
  quantity: number;
  unitPrice: number;
  amount: number;
  taxCategory: string; // 内税/外税/非課税など
  department: string; // ご利用部署
  slipNo: string; // 伝票No
};

export type NagamaruInvoice = {
  createdDate: string; // 作成日 (YYYY/MM/DD)
  transferDate: string; // 振替予定日 (YYYY/MM/DD、口座引落予定日)
  totalAmount: number; // 今回お買上額計(税込)
  lineItems: NagamaruInvoiceLineItem[];
};

// ながまるの「購買請求書」PDFからバイナリを渡してテキストを抽出する。
export async function extractNagamaruInvoiceText(pdf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdf });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

// タブ区切り明細行の末尾4項目（税区分/お買上日/ご利用部署/伝票No）は、
// PDF内の絶対位置に起因してテキスト抽出順が行ごとに入れ替わることがある（実物で確認済み）。
// そのため位置ではなく値のパターンで種別を判定する。
function classifyTrailingField(
  value: string,
): "date" | "taxCategory" | "slipNo" | "department" {
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) return "date";
  if (/^(内税|外税|非課税|軽減|軽減税率)$/.test(value)) return "taxCategory";
  if (/^[A-Za-z]\d+$/.test(value)) return "slipNo";
  return "department";
}

// ながまる購買請求書のテキスト（extractNagamaruInvoiceTextの出力）を構造化データにパースする。
// レイアウトは帳票番号固定（610-HB-K72-06「請求明細書」）で毎回同じ想定。
// フォーマットが変わって抽出に失敗した場合は例外を投げる。
export function parseNagamaruInvoiceText(text: string): NagamaruInvoice {
  const lines = text.split("\n");

  const lineItems: NagamaruInvoiceLineItem[] = [];
  for (const line of lines) {
    const parts = line
      .split("\t")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length < 8) continue;

    const [name, quantityStr, unitPriceStr, amountStr, ...rest] = parts;
    const quantity = Number(quantityStr);
    const unitPrice = Number((unitPriceStr ?? "").replace(/,/g, ""));
    const amount = Number((amountStr ?? "").replace(/,/g, ""));
    if (
      !name ||
      !Number.isFinite(quantity) ||
      !Number.isFinite(unitPrice) ||
      !Number.isFinite(amount)
    ) {
      continue;
    }

    let date = "";
    let taxCategory = "";
    let slipNo = "";
    let department = "";
    for (const field of rest) {
      const kind = classifyTrailingField(field);
      if (kind === "date") date = field;
      else if (kind === "taxCategory") taxCategory = field;
      else if (kind === "slipNo") slipNo = field;
      else department = department ? `${department} ${field}` : field;
    }
    if (!date) continue; // 明細行ではない（ヘッダ等）とみなす

    lineItems.push({
      date,
      name,
      quantity,
      unitPrice,
      amount,
      taxCategory,
      department,
      slipNo,
    });
  }
  if (lineItems.length === 0) {
    throw new Error(
      "購買請求書の品目行を1件も抽出できませんでした。PDFフォーマットが変わった可能性があります",
    );
  }

  // 作成日・振替予定日は、明細行に属さない単独の日付行として出現する
  // （実物のPDFでは常にこの2行がこの順で連続して現れる）。
  const standaloneDates = lines
    .map((l) => l.trim())
    .filter((l) => /^\d{4}\/\d{2}\/\d{2}$/.test(l));
  const [createdDate, transferDate] = standaloneDates;
  if (!createdDate || !transferDate) {
    throw new Error(
      "購買請求書の作成日/振替予定日を抽出できませんでした。PDFフォーマットが変わった可能性があります",
    );
  }

  const totalMatch = text.match(/今回お買上額計\(税込\)\s*\t*\s*([\d,]+)/);
  if (!totalMatch) {
    throw new Error(
      "購買請求書の請求合計額(今回お買上額計)を抽出できませんでした。PDFフォーマットが変わった可能性があります",
    );
  }
  const totalAmount = Number(totalMatch[1].replace(/,/g, ""));

  const lineItemsSum = lineItems.reduce((sum, item) => sum + item.amount, 0);
  if (lineItemsSum !== totalAmount) {
    throw new Error(
      `品目行の合計(${lineItemsSum})と請求合計額(${totalAmount})が一致しません。抽出漏れの可能性があります`,
    );
  }

  return { createdDate, transferDate, totalAmount, lineItems };
}
