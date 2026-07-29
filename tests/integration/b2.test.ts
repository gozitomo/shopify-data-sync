import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildB2Csv } from "@shopify-data-sync/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const run = process.env.RUN_INTEGRATION ? describe : describe.skip;

const sender = {
  name: "テスト",
  zip: "381-0208",
  address: "長野県",
  phone: "090-0000-0000",
  yamatoCustomerCode: "0000000000",
  freightManagementNo: "01",
};

run("buildB2Csv (integration)", () => {
  it("全件取得: 95列・entries件数一致", async () => {
    const { csv, count, entries } = await buildB2Csv(sender);
    expect(entries.length).toBe(count);
    expect(csv.split("\r\n")[0].split(",").length).toBe(95);
    // 各entryに必須キーが揃う
    if (entries[0]) {
      expect(entries[0].foId).toBeTruthy();
      expect(Array.isArray(entries[0].items)).toBe(true);
    }
  }, 60000);
});
