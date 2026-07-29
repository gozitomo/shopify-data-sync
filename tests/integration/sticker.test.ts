import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildStickerCsv } from "@shopify-data-sync/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const run = process.env.RUN_INTEGRATION ? describe : describe.skip;

run("buildStickerCsv (integration)", () => {
  it("FO idから注文者を取得し、バーコードに FOid|伝票番号|注文番号|SKU:個数 を出す", async () => {
    const rows = [
      { foId: "7939155361894", tracking: "390368633745", orderName: "4386" },
    ];
    const { csv, missing } = await buildStickerCsv(rows);
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toContain("注文者氏名");
    expect(lines[0]).toContain("バーコード");
    // 見つかればデータ行のバーコード列が所定フォーマット
    if (missing.length === 0 && lines[1]) {
      const barcode = lines[1].split('","').pop()!.replace(/"$/, "");
      expect(barcode).toMatch(/^7939155361894\|390368633745\|4386\|/);
    }
  }, 60000);
});
