import * as dotenv from "dotenv";
import { resolve } from "node:path";
import { chromium } from "playwright";
import {
  attachVouchers,
  classifyInvoiceItems,
  extractNagamaruInvoiceText,
  findJournalByTransactionId,
  findMatchingTransaction,
  getMoneyForwardTokenAndPersist,
  journalizeTransaction,
  parseNagamaruInvoiceText,
  saveRefreshTokenToEnvFile,
  type ClassificationExample,
  type MoneyForwardTransaction,
  type NagamaruInvoice,
} from "@shopify-data-sync/shared";
import {
  downloadDocument,
  listPurchaseInvoices,
  loginToNagamaru,
  type NagamaruDocumentLink,
} from "./nagamaru-client.js";

const ENV_PATH = resolve(import.meta.dirname, "../../../.env");
dotenv.config({ path: ENV_PATH });

// JA普通預金のconnected_sub_account_id（日本農業新聞の月次引落と照合して確認済み。
// 設計書 docs/会計自動化設計書.md 参照）。
const JA_BANK_SUB_ACCOUNT_ID = "jVB/kDbCsSMOk6tEG6mk5Q==";

// ながまる購買請求書の取引先は常にJAながの固定。
const JA_TRADE_PARTNER_CODE = "A0000000005";

const REMARK_MAX_LENGTH = 200;

// 品目名を「 / 」区切りで並べた摘要を作る。200文字を超える場合は末尾を「…ほかN件」に丸める。
function buildRemark(invoice: NagamaruInvoice): string {
  const full = invoice.lineItems.map((i) => i.name).join(" / ");
  if (full.length <= REMARK_MAX_LENGTH) return full;

  let remark = "";
  let count = 0;
  for (const item of invoice.lineItems) {
    const next = remark ? `${remark} / ${item.name}` : item.name;
    const suffix = ` …ほか${invoice.lineItems.length - count - 1}件`;
    if (next.length + suffix.length > REMARK_MAX_LENGTH) break;
    remark = next;
    count++;
  }
  return `${remark} …ほか${invoice.lineItems.length - count}件`;
}

type Processed = {
  doc: NagamaruDocumentLink;
  invoice: NagamaruInvoice;
  tx: MoneyForwardTransaction;
};

async function main() {
  console.log("=== ながまる購買請求書 → 仕訳同期 ===\n");

  console.log("--- マネフォ トークン取得 ---");
  const mfToken = await getMoneyForwardTokenAndPersist(async (newRefreshToken) => {
    saveRefreshTokenToEnvFile(ENV_PATH, newRefreshToken);
    console.log("(refresh_token を .env に書き戻しました)");
  });
  const accessToken = mfToken.access_token;

  console.log("\n--- ながまる ログイン ---");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await loginToNagamaru(page);

  const invoices = await listPurchaseInvoices(page);
  console.log(`購買請求書一覧: ${invoices.length}件（最新ページのみ）\n`);

  // --- 第1パス: 全請求書をPDF取得・パース・明細特定し、既存仕訳を分類実例として集める ---
  const examples: ClassificationExample[] = [];
  const unjournalized: Processed[] = [];

  for (const doc of invoices) {
    console.log(`--- ${doc.date} / ${doc.name} ---`);

    const pdf = await downloadDocument(page, doc.url);
    const text = await extractNagamaruInvoiceText(pdf);

    let invoice: NagamaruInvoice;
    try {
      invoice = parseNagamaruInvoiceText(text);
    } catch (err) {
      console.log("  [スキップ] PDFパース失敗:", (err as Error).message);
      continue;
    }

    const transferDateIso = invoice.transferDate.replace(/\//g, "-");
    const tx = await findMatchingTransaction(accessToken, {
      connectedSubAccountId: JA_BANK_SUB_ACCOUNT_ID,
      side: "EXPENSE",
      amount: invoice.totalAmount,
      date: transferDateIso,
    });
    if (!tx) {
      console.log("  [スキップ] 対応する明細が見つかりませんでした（未同期 or 金額不一致）");
      continue;
    }

    const existing = await findJournalByTransactionId(
      accessToken,
      tx.id,
      new Date(transferDateIso),
    );
    if (existing) {
      const debitor = existing.branches[0]?.debitor;
      console.log(
        `  既存仕訳あり: id=${existing.id} 勘定科目=${debitor?.account_name ?? "?"} 証憑=${existing.voucher_file_ids.length}件`,
      );
      if (debitor) {
        examples.push({
          itemNames: invoice.lineItems.map((i) => i.name),
          accountId: debitor.account_id,
          accountName: debitor.account_name,
          subAccountId: debitor.sub_account_id ?? null,
          subAccountName: debitor.sub_account_name ?? null,
          taxId: debitor.tax_id ?? "",
          taxName: debitor.tax_name ?? "",
        });
      }
      if (existing.voucher_file_ids.length === 0) {
        const fileName = `購買請求書_${doc.date.replace(/[年月]/g, "-").replace("日", "")}.pdf`;
        const attached = await attachVouchers(accessToken, existing.id, [
          { fileName, data: pdf },
        ]);
        console.log(`  [完了] 証憑を添付しました: ${attached.map((v) => v.fileId).join(", ")}`);
      } else {
        console.log("  [完了] 証憑添付済みのため何もしません");
      }
    } else {
      console.log(`  未仕訳の明細: id=${tx.id}`);
      unjournalized.push({ doc, invoice, tx });
    }
  }

  console.log(`\n分類実例: ${examples.length}件 / 未仕訳: ${unjournalized.length}件\n`);

  // --- 第2パス: 未仕訳の請求書をGeminiで分類し、確信度が高ければ仕訳作成+証憑添付 ---
  const geminiApiKey = process.env.GEMINI_API_KEY;
  for (const { doc, invoice, tx } of unjournalized) {
    console.log(`--- 未仕訳分類: ${doc.date} / ${doc.name} ---`);
    const itemNames = invoice.lineItems.map((i) => i.name);

    if (!geminiApiKey) {
      console.log("  [人に回す] GEMINI_API_KEY未設定のため分類できません");
      continue;
    }
    if (examples.length === 0) {
      console.log("  [人に回す] 分類実例が1件もないため判定できません");
      continue;
    }

    const result = await classifyInvoiceItems(geminiApiKey, itemNames, examples);
    if (!result.matched || !result.accountId || !result.taxId) {
      console.log(`  [人に回す] Geminiが類似実例なしと判定: ${result.reason}`);
      continue;
    }
    console.log(
      `  Gemini分類: 勘定科目=${result.accountName} 税区分=${result.taxName} (${result.reason})`,
    );

    const remark = buildRemark(invoice);
    const journal = await journalizeTransaction(accessToken, {
      transactionId: tx.id,
      accountId: result.accountId,
      ...(result.subAccountId ? { subAccountId: result.subAccountId } : {}),
      taxId: result.taxId,
      tradePartnerCode: JA_TRADE_PARTNER_CODE,
      remark,
    });
    console.log(`  [完了] 仕訳を新規作成しました: id=${journal.id}`);

    const pdf = await downloadDocument(page, doc.url);
    const fileName = `購買請求書_${doc.date.replace(/[年月]/g, "-").replace("日", "")}.pdf`;
    const attached = await attachVouchers(accessToken, journal.id, [{ fileName, data: pdf }]);
    console.log(`  [完了] 証憑を添付しました: ${attached.map((v) => v.fileId).join(", ")}`);
  }

  await browser.close();
  console.log("\n=== 完了 ===");
}

main().catch((err) => {
  console.error("失敗:", err);
  process.exit(1);
});
