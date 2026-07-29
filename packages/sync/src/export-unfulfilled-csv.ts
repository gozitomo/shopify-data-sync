import * as dotenv from "dotenv";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUnfulfilledCsv } from "@shopify-data-sync/shared";

// このファイルからの相対でリポジトリ直下の .env を読む（cwdに依存しない）
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

async function main() {
  console.log("--- 未発送明細の取得開始 ---");
  const { csv, orderCount, rowCount } = await buildUnfulfilledCsv();

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const outPath = resolve(process.cwd(), `unfulfilled-${stamp}.csv`);
  writeFileSync(outPath, csv, "utf-8");

  console.log("--- 完了 ---");
  console.log(`注文 ${orderCount} 件 / 明細 ${rowCount} 行`);
  console.log(`出力: ${outPath}`);
}

main().catch((e) => {
  console.error("エラー:", e);
  process.exit(1);
});
