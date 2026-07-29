import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // 結合テスト(実Shopify/Firestore)は RUN_INTEGRATION=1 のときだけ
    env: { ...process.env },
  },
});
