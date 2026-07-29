import type { Firestore } from "firebase-admin/firestore";
import { getShopifyToken } from "@shopify-data-sync/shared";

const API_VERSION = "2026-01";
const CARRIER = "ヤマト運輸";

const MUTATION = `
  mutation($foId: ID!, $tracking: String!) {
    fulfillmentCreate(fulfillment: {
      lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: $foId }],
      trackingInfo: { number: $tracking, company: "${CARRIER}" },
      notifyCustomer: true
    }) {
      fulfillment { id status }
      userErrors { field message }
    }
  }
`;

export type FulfillResult = {
  orderName: string;
  items: { sku: string; qty: number }[];
  status: "FULFILLED" | "ALREADY";
};

/**
 * 追跡番号(伝票番号)から shipments を逆引きし、該当FulfillmentOrderをfulfillする。
 */
export async function fulfillByTracking(
  tracking: string,
  db: Firestore,
): Promise<FulfillResult> {
  const snap = await db
    .collection("shipments")
    .where("trackingNumber", "==", tracking)
    .limit(1)
    .get();
  const doc = snap.docs[0];
  if (!doc) {
    throw new Error(
      `伝票番号 ${tracking} に該当する出荷がありません（先に「出荷データ取込」が必要です）`,
    );
  }
  const data = doc.data();
  const items = (data.items ?? []) as { sku: string; qty: number }[];

  // 既にfulfill済みなら二重実行しない
  if (data.status === "fulfilled") {
    return { orderName: data.orderName, items, status: "ALREADY" };
  }

  const token = await getShopifyToken();
  const domain = process.env.SHOP_DOMAIN;
  const foGid = `gid://shopify/FulfillmentOrder/${data.foId}`;
  const res = await fetch(
    `https://${domain}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token!,
      },
      body: JSON.stringify({
        query: MUTATION,
        variables: { foId: foGid, tracking },
      }),
    },
  );
  const json: any = await res.json();
  if (json.errors) {
    throw new Error(`Shopify API Error: ${JSON.stringify(json.errors)}`);
  }
  const payload = json.data.fulfillmentCreate;
  if (payload.userErrors?.length) {
    // 正規経路以外で既にfulfillされていると fulfillmentCreate は失敗する。
    // Shopify側でFOがCLOSED(=出荷完了)なら、エラーにせずFirestoreを合わせて自己修復する。
    const foStatus = await fetchFulfillmentOrderStatus(foGid, token, domain);
    if (foStatus === "CLOSED") {
      await doc.ref.set(
        { status: "fulfilled", fulfilledAt: new Date(), reconciled: true },
        { merge: true },
      );
      return { orderName: data.orderName, items, status: "ALREADY" };
    }
    throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
  }

  await doc.ref.set(
    {
      status: "fulfilled",
      fulfilledAt: new Date(),
      fulfillmentId: payload.fulfillment.id,
    },
    { merge: true },
  );

  return { orderName: data.orderName, items, status: "FULFILLED" };
}

// FulfillmentOrder の現在ステータスを取得（CLOSED=出荷完了）。取得不能時は null。
async function fetchFulfillmentOrderStatus(
  foGid: string,
  token: string,
  domain: string | undefined,
): Promise<string | null> {
  const query = `query($id: ID!) { fulfillmentOrder(id: $id) { status } }`;
  const res = await fetch(
    `https://${domain}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token!,
      },
      body: JSON.stringify({ query, variables: { id: foGid } }),
    },
  );
  const json: any = await res.json();
  return json?.data?.fulfillmentOrder?.status ?? null;
}
