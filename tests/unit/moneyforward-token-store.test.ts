import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveRefreshTokenToEnvFile } from "../../packages/shared/src/moneyforward-token-store.ts";

describe("saveRefreshTokenToEnvFile", () => {
  let dir: string;
  let envPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mf-env-test-"));
    envPath = join(dir, ".env");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("MONEYFORWARD_REFRESH_TOKEN行だけを書き換え、他の行は保持する", () => {
    writeFileSync(
      envPath,
      [
        "SHOP_DOMAIN=teststore",
        "MONEYFORWARD_CLIENT_ID=abc",
        "MONEYFORWARD_REFRESH_TOKEN=old-value",
        "OTHER_KEY=keep-me",
      ].join("\n"),
    );

    saveRefreshTokenToEnvFile(envPath, "new-value");

    const lines = readFileSync(envPath, "utf-8").split("\n");
    expect(lines).toContain("MONEYFORWARD_REFRESH_TOKEN=new-value");
    expect(lines).toContain("SHOP_DOMAIN=teststore");
    expect(lines).toContain("OTHER_KEY=keep-me");
    expect(lines).not.toContain("MONEYFORWARD_REFRESH_TOKEN=old-value");
  });

  it("該当行が無ければエラー", () => {
    writeFileSync(envPath, "SHOP_DOMAIN=teststore");
    expect(() => saveRefreshTokenToEnvFile(envPath, "new-value")).toThrow(
      "MONEYFORWARD_REFRESH_TOKEN",
    );
  });
});
