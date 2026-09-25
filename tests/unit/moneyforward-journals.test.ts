import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findJournalByTransactionId,
  journalizeTransaction,
} from "../../packages/shared/src/moneyforward-journals.ts";

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

describe("findJournalByTransactionId", () => {
  it("transaction_idsとカレンダー年のstart_date/end_dateを付けてGETし、最初の仕訳を返す", async () => {
    const calls = mockFetch({
      journals: [
        { id: "j1", transaction_id: "tx1", memo: "", transaction_date: "2026-03-05", voucher_file_ids: [], branches: [] },
      ],
    });

    const result = await findJournalByTransactionId("tok", "tx1", new Date("2026-03-05"));

    expect(result?.id).toBe("j1");
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.pathname).toBe("/api/v3/journals");
    expect(url.searchParams.get("start_date")).toBe("2026-01-01");
    expect(url.searchParams.get("end_date")).toBe("2026-12-31");
    expect(url.searchParams.getAll("transaction_ids")).toEqual(["tx1"]);
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
  });

  it("見つからなければnullを返す", async () => {
    mockFetch({ journals: [] });
    const result = await findJournalByTransactionId("tok", "tx-none", new Date("2026-03-05"));
    expect(result).toBeNull();
  });

  it("APIエラー時は例外を投げる", async () => {
    mockFetch({ errors: [{ code: "invalid_query_parameter_value", message: "boom" }] }, false);
    await expect(
      findJournalByTransactionId("tok", "tx1", new Date("2026-03-05")),
    ).rejects.toThrow("仕訳の検索に失敗");
  });

  it("レスポンスのid/account_id等がパーセントエンコード済みでもデコードして返す", async () => {
    mockFetch({
      journals: [
        {
          id: "DjpyicuenCcf4ay791FUoLSVIKkesutrPOKKdYNWLHo%3D",
          transaction_id: "x%2BVxmAvOPYJs%2BACvf0wroc34Td17V3l%2BaTqAG44kLEY%3D",
          memo: "",
          transaction_date: "2026-09-07",
          voucher_file_ids: [],
          branches: [
            {
              creditor: { account_id: "XVTX%2B%2BwqcliU65UuIba7vg%3D%3D", account_name: "普通預金", value: 3100, sub_account_id: "PgVXFVNDQncm9Jfs1eqWYg%3D%3D" },
              debitor: { account_id: "GeTUwnvV5BbhvcPGeKf4iw%3D%3D", account_name: "新聞図書費", value: 2871 },
              remark: "日本農業新聞",
            },
          ],
        },
      ],
    });

    const result = await findJournalByTransactionId("tok", "tx1", new Date("2026-09-07"));

    expect(result?.id).toBe("DjpyicuenCcf4ay791FUoLSVIKkesutrPOKKdYNWLHo=");
    expect(result?.transaction_id).toBe("x+VxmAvOPYJs+ACvf0wroc34Td17V3l+aTqAG44kLEY=");
    expect(result?.branches[0]?.creditor?.account_id).toBe("XVTX++wqcliU65UuIba7vg==");
    expect(result?.branches[0]?.creditor?.sub_account_id).toBe("PgVXFVNDQncm9Jfs1eqWYg==");
    expect(result?.branches[0]?.debitor?.account_id).toBe("GeTUwnvV5BbhvcPGeKf4iw==");
  });
});

describe("journalizeTransaction", () => {
  it("必須項目とオプション項目をPOSTし、作成された仕訳を返す", async () => {
    const calls = mockFetch({
      journal: { id: "j-new", transaction_id: "tx1", memo: "元肥", transaction_date: "2026-03-31", voucher_file_ids: [], branches: [] },
    }, true);

    const result = await journalizeTransaction("tok", {
      transactionId: "tx1",
      accountId: "acc-1",
      remark: "元肥",
      tags: ["*4_全社"],
    });

    expect(result.id).toBe("j-new");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api-accounting.moneyforward.com/api/v3/transactions/journalize");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(calls[0].init.body);
    expect(body).toEqual({
      transaction_id: "tx1",
      account_id: "acc-1",
      remark: "元肥",
      tags: ["*4_全社"],
    });
  });

  it("省略可能項目を渡さなければリクエストボディに含めない", async () => {
    const calls = mockFetch({
      journal: { id: "j-new", transaction_id: "tx1", memo: "", transaction_date: "2026-03-31", voucher_file_ids: [], branches: [] },
    });

    await journalizeTransaction("tok", { transactionId: "tx1", accountId: "acc-1" });

    const body = JSON.parse(calls[0].init.body);
    expect(body).toEqual({ transaction_id: "tx1", account_id: "acc-1" });
  });

  it("APIエラー時は例外を投げる", async () => {
    mockFetch({ errors: [{ code: "invalid_parameter", message: "boom" }] }, false);
    await expect(
      journalizeTransaction("tok", { transactionId: "tx1", accountId: "acc-1" }),
    ).rejects.toThrow("仕訳の新規作成に失敗");
  });

  it("デコード済みのID（+ / = を含む）はJSONボディに入れる際にエンコードし直す（実機で確認したAPI仕様）", async () => {
    const calls = mockFetch({
      journal: { id: "j-new", transaction_id: "tx1", memo: "", transaction_date: "2026-03-31", voucher_file_ids: [], branches: [] },
    });

    await journalizeTransaction("tok", {
      transactionId: "6AMU/HMRVMYghVXuYM2uyCVY0tf1KAP1X++gn3gL0yU=",
      accountId: "S/YSLOGCq1AEh3ezn2XoTg==",
      subAccountId: "PgVXFVNDQncm9Jfs1eqWYg==",
      taxId: "KDKSKuKueF2qJuqZXPI/7w==",
    });

    const body = JSON.parse(calls[0].init.body);
    expect(body.transaction_id).toBe("6AMU%2FHMRVMYghVXuYM2uyCVY0tf1KAP1X%2B%2Bgn3gL0yU%3D");
    expect(body.account_id).toBe("S%2FYSLOGCq1AEh3ezn2XoTg%3D%3D");
    expect(body.sub_account_id).toBe("PgVXFVNDQncm9Jfs1eqWYg%3D%3D");
    expect(body.tax_id).toBe("KDKSKuKueF2qJuqZXPI%2F7w%3D%3D");
  });
});
