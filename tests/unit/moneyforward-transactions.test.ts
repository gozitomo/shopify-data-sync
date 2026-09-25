import { describe, it, expect, vi, beforeEach } from "vitest";
import { findMatchingTransaction } from "../../packages/shared/src/moneyforward-transactions.ts";

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

describe("findMatchingTransaction", () => {
  it("connected_sub_account_id単独・金額一致・日付±3日でGETする", async () => {
    const calls = mockFetch({
      transactions: [
        { id: "tx1", date: "2026-04-20", value: 89980, side: "EXPENSE", content: "コウバイダイキン", memo: null, journalizing_status: "registered", connected_account_id: "acc", connected_sub_account_id: "sub", voucher_file_ids: [] },
      ],
    });

    const result = await findMatchingTransaction("tok", {
      connectedSubAccountId: "sub",
      side: "EXPENSE",
      amount: 89980,
      date: "2026-04-20",
    });

    expect(result?.id).toBe("tx1");
    const url = new URL(calls[0].url);
    expect(url.searchParams.get("connected_sub_account_id")).toBe("sub");
    expect(url.searchParams.get("connected_account_id")).toBeNull();
    expect(url.searchParams.get("side")).toBe("EXPENSE");
    expect(url.searchParams.get("value_min")).toBe("89980");
    expect(url.searchParams.get("value_max")).toBe("89980");
    expect(url.searchParams.get("start_date")).toBe("2026-04-17");
    expect(url.searchParams.get("end_date")).toBe("2026-04-23");
  });

  it("複数マッチしたら基準日に最も近いものを返す", async () => {
    mockFetch({
      transactions: [
        { id: "far", date: "2026-04-17", value: 1000, side: "EXPENSE", content: "", memo: null, journalizing_status: "none", connected_account_id: "a", connected_sub_account_id: "sub", voucher_file_ids: [] },
        { id: "near", date: "2026-04-20", value: 1000, side: "EXPENSE", content: "", memo: null, journalizing_status: "none", connected_account_id: "a", connected_sub_account_id: "sub", voucher_file_ids: [] },
      ],
    });

    const result = await findMatchingTransaction("tok", {
      connectedSubAccountId: "sub",
      side: "EXPENSE",
      amount: 1000,
      date: "2026-04-19",
    });

    expect(result?.id).toBe("near");
  });

  it("見つからなければnullを返す", async () => {
    mockFetch({ transactions: [] });
    const result = await findMatchingTransaction("tok", {
      connectedSubAccountId: "sub",
      side: "EXPENSE",
      amount: 1,
      date: "2026-04-20",
    });
    expect(result).toBeNull();
  });

  it("APIエラー時は例外を投げる", async () => {
    mockFetch({ errors: [{ code: "x", message: "boom" }] }, false);
    await expect(
      findMatchingTransaction("tok", {
        connectedSubAccountId: "sub",
        side: "EXPENSE",
        amount: 1,
        date: "2026-04-20",
      }),
    ).rejects.toThrow("明細の検索に失敗");
  });

  it("レスポンスのidがパーセントエンコード済みでもデコードして返す（実機で二重エンコードのバグを確認済み）", async () => {
    mockFetch({
      transactions: [
        {
          id: "6AMU%2FHMRVMYghVXuYM2uyCVY0tf1KAP1X%2B%2Bgn3gL0yU%3D",
          date: "2026-04-20",
          value: 24260,
          side: "EXPENSE",
          content: "コウバイダイキン",
          memo: null,
          journalizing_status: "none",
          connected_account_id: "vjOmsrht1d%2BPSC%2FSFcltIw%3D%3D",
          connected_sub_account_id: "jVB%2FkDbCsSMOk6tEG6mk5Q%3D%3D",
          voucher_file_ids: [],
        },
      ],
    });

    const result = await findMatchingTransaction("tok", {
      connectedSubAccountId: "sub",
      side: "EXPENSE",
      amount: 24260,
      date: "2026-04-20",
    });

    expect(result?.id).toBe("6AMU/HMRVMYghVXuYM2uyCVY0tf1KAP1X++gn3gL0yU=");
    expect(result?.connected_account_id).toBe("vjOmsrht1d+PSC/SFcltIw==");
    expect(result?.connected_sub_account_id).toBe("jVB/kDbCsSMOk6tEG6mk5Q==");
  });
});
