import { describe, it, expect, vi, beforeEach } from "vitest";
import { classifyInvoiceItems } from "../../packages/shared/src/gemini-classify.ts";

function mockFetch(response: any, ok = true, status = ok ? 200 : 400) {
  const calls: { url: string; init: any }[] = [];
  const fn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return { ok, status, json: async () => response } as any;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

// 呼び出しごとに異なるレスポンスを順番に返すfetchモック（リトライ挙動のテスト用）。
function mockFetchSequence(responses: Array<{ response: any; ok: boolean; status: number }>) {
  const calls: { url: string; init: any }[] = [];
  let i = 0;
  const fn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    return { ok: r.ok, status: r.status, json: async () => r.response } as any;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

function geminiResponse(result: unknown) {
  return {
    candidates: [
      { content: { parts: [{ text: JSON.stringify(result) }] } },
    ],
  };
}

describe("classifyInvoiceItems", () => {
  it("APIキーをクエリに付けてPOSTし、JSONレスポンスをパースして返す", async () => {
    const calls = mockFetch(
      geminiResponse({
        matched: true,
        accountId: "acc-1",
        accountName: "肥料費(製)",
        subAccountId: null,
        subAccountName: null,
        taxId: "tax-1",
        taxName: "課税仕入10%",
        reason: "肥料の実例と一致",
      }),
    );

    const result = await classifyInvoiceItems("key123", ["サンライム（粒）"], [
      {
        itemNames: ["サンリード２号"],
        accountId: "acc-1",
        accountName: "肥料費(製)",
        taxId: "tax-1",
        taxName: "課税仕入10%",
      },
    ]);

    expect(result.matched).toBe(true);
    expect(result.accountId).toBe("acc-1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("key=key123");
    expect(calls[0].init.method).toBe("POST");
    const body = JSON.parse(calls[0].init.body);
    expect(body.contents[0].parts[0].text).toContain("サンライム（粒）");
    expect(body.contents[0].parts[0].text).toContain("サンリード２号");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("類似実例が無ければmatched:falseを返す", async () => {
    mockFetch(
      geminiResponse({
        matched: false,
        accountId: null,
        accountName: null,
        subAccountId: null,
        taxId: null,
        taxName: null,
        reason: "類似する過去実例がない",
      }),
    );

    const result = await classifyInvoiceItems("key", ["未知の資材X"], []);

    expect(result.matched).toBe(false);
    expect(result.accountId).toBeNull();
  });

  it("APIエラー時は例外を投げる（400はリトライしない）", async () => {
    const calls = mockFetch({ error: { message: "boom" } }, false, 400);
    await expect(classifyInvoiceItems("key", ["x"], [])).rejects.toThrow(
      "Gemini分類に失敗",
    );
    expect(calls).toHaveLength(1);
  });

  it("レスポンスにtextが無ければ例外を投げる", async () => {
    mockFetch({ candidates: [] });
    await expect(classifyInvoiceItems("key", ["x"], [])).rejects.toThrow(
      "Geminiのレスポンスが空です",
    );
  });

  it("503(高負荷)は指数バックオフでリトライし、成功すれば結果を返す", async () => {
    vi.useFakeTimers();
    const calls = mockFetchSequence([
      { response: { error: { message: "busy" } }, ok: false, status: 503 },
      { response: { error: { message: "busy" } }, ok: false, status: 503 },
      {
        response: geminiResponse({
          matched: false,
          accountId: null,
          accountName: null,
          subAccountId: null,
          taxId: null,
          taxName: null,
          reason: "リトライ後に成功",
        }),
        ok: true,
        status: 200,
      },
    ]);

    const promise = classifyInvoiceItems("key", ["x"], []);
    await vi.advanceTimersByTimeAsync(2000); // 1回目リトライまでの待ち
    await vi.advanceTimersByTimeAsync(4000); // 2回目リトライまでの待ち
    const result = await promise;

    expect(result.reason).toBe("リトライ後に成功");
    expect(calls).toHaveLength(3);
    vi.useRealTimers();
  });

  it("503が上限回数まで続けば例外を投げる", async () => {
    vi.useFakeTimers();
    const calls = mockFetchSequence([
      { response: { error: { message: "busy" } }, ok: false, status: 503 },
    ]);

    const promise = classifyInvoiceItems("key", ["x"], []);
    const assertion = expect(promise).rejects.toThrow("Gemini分類に失敗");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;

    expect(calls).toHaveLength(4); // 初回 + リトライ3回
    vi.useRealTimers();
  });
});
