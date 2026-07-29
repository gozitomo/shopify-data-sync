import * as dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Firestore } from "@google-cloud/firestore";
import iconv from "iconv-lite";
import { buildB2Csv, type SenderInfo } from "@shopify-data-sync/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

const db = new Firestore({
  projectId: process.env.PROJECT_ID || "",
  databaseId: "shopify-data",
});

// settings コレクションから最新（ドキュメントID＝日付の最大）の依頼主マスタを取得
async function loadSender(): Promise<SenderInfo> {
  const snap = await db.collection("settings").get();
  const latest = snap.docs.sort((a, b) => (a.id < b.id ? 1 : -1))[0];
  if (!latest) throw new Error("settings コレクションが空です");
  console.log(`依頼主マスタ: settings/${latest.id}`);
  const d = latest.data();
  return {
    name: d.name,
    zip: d.zip,
    address: d.address,
    phone: d.phone,
    yamatoCustomerCode: d.yamatoCustomerCode,
    freightManagementNo: d.freightManagementNo,
  };
}

async function main() {
  console.log("--- B2取込CSV生成開始 ---");
  const sender = await loadSender();
  const { csv, count } = await buildB2Csv(sender);

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const outPath = resolve(process.cwd(), `b2-${stamp}.csv`);
  // B2クラウドはShift-JIS(CP932)必須
  writeFileSync(outPath, iconv.encode(csv, "Shift_JIS"));

  console.log("--- 完了 ---");
  console.log(`伝票(FulfillmentOrder) ${count} 件`);
  console.log(`出力: ${outPath}`);
}

main().catch((e) => {
  console.error("エラー:", e);
  process.exit(1);
});
