import { describe, it, expect } from "vitest";
import * as dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { validateAddresses } from "../../packages/api/src/address-validate.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const run = process.env.RUN_INTEGRATION ? describe : describe.skip;

run("validateAddresses (integration / 日本郵便API)", () => {
  if (!getApps().length) initializeApp({ projectId: process.env.PROJECT_ID });
  const db = getFirestore("shopify-data");

  it("都道府県不一致と存在しない郵便番号を検出", async () => {
    const entries = [
      { orderName: "#OK", foId: "x", recipientName: "a", zip: "3810208", prefJp: "長野県", fullAddress: "長野県上高井郡小布施町都住66-4", items: [] },
      { orderName: "#NG_PREF", foId: "y", recipientName: "b", zip: "3810208", prefJp: "東京都", fullAddress: "東京都千代田区1-1", items: [] },
      { orderName: "#NG_ZIP", foId: "z", recipientName: "c", zip: "0000000", prefJp: "長野県", fullAddress: "長野県", items: [] },
    ];
    const suspects = await validateAddresses(entries as any, db);
    const reasons = Object.fromEntries(suspects.map((s) => [s.orderName, s.reason]));
    expect(reasons["#OK"]).toBeUndefined();
    expect(reasons["#NG_PREF"]).toMatch(/都道府県/);
    expect(reasons["#NG_ZIP"]).toMatch(/存在しない/);
  }, 60000);
});
