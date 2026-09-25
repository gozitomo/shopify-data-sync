import { describe, it, expect, vi, beforeEach } from "vitest";
import { attachVouchers } from "../../packages/shared/src/moneyforward-vouchers.ts";

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

describe("attachVouchers", () => {
  it("journal_idとbase64化したファイルをPOSTし、voucher_file_idsを返す", async () => {
    const calls = mockFetch({
      voucher_file_ids: [{ file_name: "invoice.pdf", file_id: "vid-1" }],
    });

    const result = await attachVouchers("tok", "journal-1", [
      { fileName: "invoice.pdf", data: Buffer.from("hello") },
    ]);

    expect(result).toEqual([{ fileName: "invoice.pdf", fileId: "vid-1" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api-accounting.moneyforward.com/api/v3/vouchers");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok");
    const body = JSON.parse(calls[0].init.body);
    expect(body.journal_id).toBe("journal-1");
    expect(body.voucher_files).toEqual([
      { file_name: "invoice.pdf", file_data: Buffer.from("hello").toString("base64") },
    ]);
  });

  it("ファイルが0件なら例外を投げる（APIを呼ばない）", async () => {
    const calls = mockFetch({});
    await expect(attachVouchers("tok", "journal-1", [])).rejects.toThrow(
      "1件もありません",
    );
    expect(calls).toHaveLength(0);
  });

  it("ファイルが6件以上なら例外を投げる（APIを呼ばない）", async () => {
    const calls = mockFetch({});
    const files = Array.from({ length: 6 }, (_, i) => ({
      fileName: `f${i}.pdf`,
      data: Buffer.from("x"),
    }));
    await expect(attachVouchers("tok", "journal-1", files)).rejects.toThrow(
      "最大5件",
    );
    expect(calls).toHaveLength(0);
  });

  it("5MBを超えるファイルがあれば例外を投げる（APIを呼ばない）", async () => {
    const calls = mockFetch({});
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(
      attachVouchers("tok", "journal-1", [{ fileName: "big.pdf", data: big }]),
    ).rejects.toThrow("5MB");
    expect(calls).toHaveLength(0);
  });

  it("APIエラー時は例外を投げる", async () => {
    mockFetch({ errors: [{ code: "x", message: "boom" }] }, false);
    await expect(
      attachVouchers("tok", "journal-1", [{ fileName: "a.pdf", data: Buffer.from("x") }]),
    ).rejects.toThrow("証憑の添付に失敗");
  });

  it("デコード済みのjournal_id（+ / = を含む）はJSONボディに入れる際にエンコードし直す", async () => {
    const calls = mockFetch({ voucher_file_ids: [] });

    await attachVouchers("tok", "cpd4LJhquRgqCy08oSFyRzxVj5lTTK8jRlIN1o39pFE=", [
      { fileName: "a.pdf", data: Buffer.from("x") },
    ]);

    const body = JSON.parse(calls[0].init.body);
    expect(body.journal_id).toBe("cpd4LJhquRgqCy08oSFyRzxVj5lTTK8jRlIN1o39pFE%3D");
  });
});
