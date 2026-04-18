import { Firestore } from "@google-cloud/firestore";
import * as dotenv from "dotenv";
import { getShopifyToken } from "./get-tmp-token.js";

dotenv.config();

const projectId = process.env.PROJECT_ID || "";
const db = new Firestore({
  projectId: projectId,
  databaseId: "shopify-order-data",
});

async function testShopify() {
  const domain = process.env.SHOP_DOMAIN;
  const token = await getShopifyToken();

  console.log(`Checking connection for: ${domain}...`);

  let hasNextPage = true;
  let cursor = null;
  let totalProcessed = 0;

  console.log("--- 同期開始 ---");

  const variables = {
    cursor: null,
    queryStr: "created_at:>=2026-01-01",
  };

  try {
    while (hasNextPage) {
      const query = `
        query($cursor: String, $queryStr: String) {
          orders(first: 20, after: $cursor, sortKey: CREATED_AT, reverse: true, query: $queryStr) {
            pageInfo { hasNextPage endCursor }
              edges {
                node {
                  id
                  name
                  createdAt
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        sku
                        title
                        quantity
                        unfulfilledQuantity
                      }
                    }
                  }
                fulfillments {
                  id
                  trackingInfo { number }
                  fulfillmentLineItems(first: 50) {
                    edges {
                      node {
                        lineItem { id }
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response: Response = await fetch(
        `https://${domain}.myshopify.com/admin/api/2026-01/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": token!,
          },
          body: JSON.stringify({ query: query, variables: variables }),
        },
      );

      const result = await response.json();

      if (result.errors) {
        console.error("GraphQL Error Detail:", JSON.stringify(result.errors));
        throw new Error(`Shopify API Error: ${result.errors[0].message}`);
      }

      const orderEdges = result.data.orders.edges;

      for (const orderEdge of orderEdges) {
        const order = orderEdge.node;
        const cleanId = (id: string) => id.replace(/\//g, "_");

        // 1. 発送済みのレコードを処理 (fulfillments が配列なので直接ループ)
        if (order.fulfillments && Array.isArray(order.fulfillments)) {
          for (const fulfillment of order.fulfillments) {
            if (!fulfillment.fulfillmentLineItems) continue;

            for (const fItemEdge of fulfillment.fulfillmentLineItems.edges) {
              const fItem = fItemEdge.node;
              const lineItemOriginal = order.lineItems.edges.find(
                (e: any) => e.node.id === fItem.lineItem.id,
              )?.node;
              // fItem.lineItem.sku または適切な場所から SKU を取得
              const sku = lineItemOriginal?.sku || "NO_SKU";
              const docId = cleanId(
                `${order.createdAt}#${order.id}#${sku}#${fItem.lineItem.id}#${fulfillment.id}`,
              );
              await db
                .collection("orders")
                .doc(docId)
                .set({
                  shop_domain: domain,
                  createdAt_sku: docId,
                  order_id: order.id,
                  order_name: order.name,
                  sku: sku,
                  quantity: fItem.quantity,
                  status: "FULFILLED",
                  tracking_number: fulfillment.trackingInfo[0]?.number || "",
                  updated_at: new Date(),
                });
              totalProcessed++;
            }
          }
        }

        // 2. 未発送（残数）のレコードを処理
        for (const itemEdge of order.lineItems.edges) {
          const item = itemEdge.node;
          const docId = cleanId(
            `${order.createdAt}#${order.id}#${item.id}#UNFULFILLED`,
          );
          if (item.unfulfilledQuantity > 0) {
            await db
              .collection("orders")
              .doc(docId)
              .set({
                shop_domain: domain,
                createdAt_sku: docId,
                order_id: order.id,
                order_name: order.name,
                sku: item.sku || "NO_SKU",
                quantity: item.unfulfilledQuantity,
                status: "UNFULFILLED",
                updated_at: new Date(),
              });
            totalProcessed++;
          } else {
            // 完納済みなら削除
            await db.collection("orders").doc(docId).delete();
          }
        }
      }
      hasNextPage = result.data.orders.pageInfo.hasNextPage;
      variables.cursor = result.data.orders.pageInfo.endCursor;
      console.log(`${totalProcessed} 件のバリアントを同期中...`);
    }
  } catch (error) {
    console.error("Connection failed:", error);
    return { statusCode: 500, body: (error as Error).message };
  }
}

testShopify();
