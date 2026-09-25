import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMoneyForwardToken,
  getMoneyForwardTokenAndPersist,
  refreshMoneyForwardToken,
} from "../../packages/shared/src/moneyforward-token.ts";

process.env.MONEYFORWARD_CLIENT_ID = "dummy-id";
process.env.MONEYFORWARD_CLIENT_SECRET = "dummy-secret";

function mockFetch(response: any, ok = true) {
  const calls: { url: string; init: any }[] = [];
  const fn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return { ok, json: async () => response } as any;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

describe("refreshMoneyForwardToken", () => {
  it("Basic認証ヘッダーとrefresh_tokenでPOSTし、レスポンスのトークンを返す", async () => {
    const calls = mockFetch({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const result = await refreshMoneyForwardToken("old-refresh-token");

    expect(result.access_token).toBe("new-access-token");
    expect(result.expires_in).toBe(3600);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.biz.moneyforward.com/token");
    expect(calls[0].init.headers.Authorization).toBe(
      `Basic ${Buffer.from("dummy-id:dummy-secret").toString("base64")}`,
    );
    expect(calls[0].init.body).toBe(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "old-refresh-token",
      }).toString(),
    );
  });

  it("client_id/client_secretが未設定ならエラー", async () => {
    delete process.env.MONEYFORWARD_CLIENT_ID;
    await expect(refreshMoneyForwardToken("x")).rejects.toThrow(
      "MONEYFORWARD_CLIENT_ID",
    );
    process.env.MONEYFORWARD_CLIENT_ID = "dummy-id";
  });

  it("レスポンスがエラーの場合は例外を投げる", async () => {
    mockFetch({ error: "invalid_grant" }, false);
    await expect(refreshMoneyForwardToken("expired")).rejects.toThrow(
      "マネーフォワードのトークン更新に失敗",
    );
  });
});

describe("getMoneyForwardToken", () => {
  it("環境変数のrefresh_tokenを使って取得する", async () => {
    process.env.MONEYFORWARD_REFRESH_TOKEN = "env-refresh-token";
    const calls = mockFetch({
      access_token: "tok",
      refresh_token: "env-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    });

    const result = await getMoneyForwardToken();

    expect(result.access_token).toBe("tok");
    expect(calls[0].init.body).toContain("env-refresh-token");
  });

  it("MONEYFORWARD_REFRESH_TOKEN未設定ならエラー", async () => {
    delete process.env.MONEYFORWARD_REFRESH_TOKEN;
    await expect(getMoneyForwardToken()).rejects.toThrow(
      "MONEYFORWARD_REFRESH_TOKEN",
    );
  });
});

describe("getMoneyForwardTokenAndPersist", () => {
  it("refresh_tokenがローテーションしていたら保存し、process.envも更新する", async () => {
    process.env.MONEYFORWARD_REFRESH_TOKEN = "old-refresh-token";
    mockFetch({
      access_token: "tok",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
    });
    const save = vi.fn(async () => {});

    const result = await getMoneyForwardTokenAndPersist(save);

    expect(result.access_token).toBe("tok");
    expect(save).toHaveBeenCalledExactlyOnceWith("new-refresh-token");
    expect(process.env.MONEYFORWARD_REFRESH_TOKEN).toBe("new-refresh-token");
  });

  it("refresh_tokenが変わっていなければ保存しない", async () => {
    process.env.MONEYFORWARD_REFRESH_TOKEN = "same-token";
    mockFetch({
      access_token: "tok",
      refresh_token: "same-token",
      expires_in: 3600,
      token_type: "Bearer",
    });
    const save = vi.fn(async () => {});

    await getMoneyForwardTokenAndPersist(save);

    expect(save).not.toHaveBeenCalled();
  });
});
