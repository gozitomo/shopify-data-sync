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

  try {
    while (hasNextPage) {
      // 【修正】fulfillments から (first: 5) と edges { node { ... } } を除去
      const query = `
        query getVariants($cursor: String) {
          productVariants(first: 50, after: $cursor) {
            edges {
              node {
                id
                sku
                title
                product {
                  id
                  title
                  status # ここで ARCHIVED / ACTIVE / DRAFT を取得
                }
                inventoryItem {
                  id
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
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
          body: JSON.stringify({ query, variables: { cursor } }),
        },
      );

      const result = await response.json();

      if (result.errors) {
        console.error("GraphQL Error Detail:", JSON.stringify(result.errors));
        throw new Error(`Shopify API Error: ${result.errors[0].message}`);
      }

      const variants = result.data.productVariants.edges;

      for (const edge of variants) {
        const variant = edge.node;

        // 全ロケーションの在庫合計を算出
        const totalAvailable =
          variant.inventoryItem.inventoryLevels.edges.reduce(
            (sum: number, level: any) => {
              return sum + (level.node.quantities[0]?.quantity || 0);
            },
            0,
          );
        const sku = variant.sku || "NO_SKU";
        const cleanId = (id: string) => id.replace(/\//g, "_");
        const docId = cleanId(`${sku}${variant.id}${variant.product.id}`);

        await db.collection("products").doc(docId).set({
          shop_domain: domain,
          sku: variant.sku,
          variant_id: variant.id,
          product_id: variant.product.id,
          product_name: variant.product.title,
          variant_name: variant.title,
          status: variant.product.status, // ARCHIVED 等を保存
          inventory: totalAvailable,
          updated_at: new Date(),
        });
        totalProcessed++;
      }

      hasNextPage = result.data.productVariants.pageInfo.hasNextPage;
      cursor = result.data.productVariants.pageInfo.endCursor;
      console.log(`${totalProcessed} 件のバリアントを同期中...`);
    }

    return {
      statusCode: 200,
      body: `商品同期成功！計 ${totalProcessed} 件のSKUを更新しました。`,
    };
  } catch (error) {
    console.error("Connection failed:", error);
    return { statusCode: 500, body: (error as Error).message };
  }
}

testShopify();
