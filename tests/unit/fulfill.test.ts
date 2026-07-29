import { describe, it, expect, vi, beforeEach } from "vitest";
import { fulfillByTracking } from "../../packages/api/src/fulfill.ts";

// getShopifyToken が使う環境変数（fetchはモックするので値はダミーでOK）
process.env.SHOP_DOMAIN = "teststore";
process.env.SHOPIFY_CLIENT_ID = "dummy";
process.env.SHOPIFY_CLIENT_SECRET = "dummy";

// FirestoreのフェイクDB
function makeDb(docData: any) {
  const setMock = vi.fn(async () => {});
  const doc = docData
    ? { data: () => docData, ref: { set: setMock } }
    : undefined;
  const db: any = {
    collection: () => ({
      where: () => ({
        limit: () => ({ get: async () => ({ docs: doc ? [doc] : [] }) }),
      }),
    }),
    _setMock: setMock,
  };
  return db;
}

function mockFetch(graphqlPayload: any) {
  const calls: { url: string; body: any }[] = [];
  const fn = vi.fn(async (url: any, opts: any) => {
    const u = String(url);
    calls.push({ url: u, body: opts?.body ? JSON.parse(opts.body) : null });
    if (u.includes("oauth/access_token")) {
      return { ok: true, json: async () => ({ access_token: "tok" }) } as any;
    }
    if (u.includes("graphql")) {
      return { ok: true, json: async () => graphqlPayload } as any;
    }
    throw new Error("unexpected url " + u);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => vi.unstubAllGlobals());

describe("fulfillByTracking", () => {
  it("正しいFO id(gid)と追跡番号でfulfillし、台帳をfulfilledに更新", async () => {
    const calls = mockFetch({
      data: {
        fulfillmentCreate: {
          fulfillment: { id: "gid://shopify/Fulfillment/1", status: "SUCCESS" },
          userErrors: [],
        },
      },
    });
    const db = makeDb({
      foId: "7939155361894",
      orderName: "#4386",
      items: [{ sku: "M2-T12-040", qty: 1 }],
      status: "generated",
    });

    const r = await fulfillByTracking("390368620552", db);

    expect(r.status).toBe("FULFILLED");
    expect(r.orderName).toBe("#4386");
    const gql = calls.find((c) => c.url.includes("graphql"));
    expect(gql?.body.variables.foId).toBe(
      "gid://shopify/FulfillmentOrder/7939155361894",
    );
    expect(gql?.body.variables.tracking).toBe("390368620552");
    expect(db._setMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "fulfilled" }),
      { merge: true },
    );
  });

  it("既にfulfilled なら二重実行しない（GraphQLを呼ばない）", async () => {
    const calls = mockFetch({});
    const db = makeDb({
      foId: "1",
      orderName: "#1",
      items: [],
      status: "fulfilled",
    });
    const r = await fulfillByTracking("999", db);
    expect(r.status).toBe("ALREADY");
    expect(calls.find((c) => c.url.includes("graphql"))).toBeUndefined();
  });

  it("台帳に該当が無ければエラー", async () => {
    mockFetch({});
    const db = makeDb(null);
    await expect(fulfillByTracking("nope", db)).rejects.toThrow(/該当する出荷/);
  });

  it("userErrors があればエラーにする", async () => {
    mockFetch({
      data: {
        fulfillmentCreate: {
          fulfillment: null,
          userErrors: [{ field: ["x"], message: "既に発送済み" }],
        },
      },
    });
    const db = makeDb({ foId: "1", orderName: "#1", items: [], status: "generated" });
    await expect(fulfillByTracking("111", db)).rejects.toThrow(/既に発送済み/);
  });
});
