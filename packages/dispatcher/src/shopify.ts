// Shopify GraphQL queries
import { getShopifyToken } from "@shopify-data-sync/shared";
import * as dotenv from "dotenv";
import { LineItem } from "./sku.js";

dotenv.config();

export async function getFulfillmentOrder(fulfillmentOrderId: string) {
  const shop = process.env.SHOP_DOMAIN;
  const token = await getShopifyToken();
  const url = `https://${shop}.myshopify.com/admin/api/2026-01/graphql.json`;
  const query = `
    query getFulfillmentOrder($id:ID!){
      fulfillmentOrder(id: $id){
        id
        status
        order {
          id
          name
          shippingAddress{
            firstName
            lastName
            address1
            address2
            city
            province
            zip
            country
            countryCode
            phone
          }
          note
          email
          shippingLine {
            title
          }
          customer {
            email
            }
          }
          lineItems(first: 50){
            edges {
            node {
                id
                productTitle
                variantTitle
                remainingQuantity
                sku
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
        }
      }
    `;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-Shopify-Access-Token": token,
    },
    body: JSON.stringify({
      query,
      variables: { id: fulfillmentOrderId },
    }),
  });
  const data = await response.json();
  return data;
}

// OrderIDから注文名（#1234形式）を取得
export async function getOrderName(orderId: string): Promise<string | null> {
  const shop = process.env.SHOP_DOMAIN;
  const token = await getShopifyToken();
  const url = `https://${shop}.myshopify.com/admin/api/2026-01/graphql.json`;
  const query = `
    query getOrderName($id: ID!) {
      order(id: $id) {
        name
      }
    }
  `;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables: { id: orderId } }),
  });
  const data = (await response.json()) as any;
  return data.data?.order?.name ?? null;
}

// OrderIDからopen状態のfulfillmentOrderId一覧を取得
export async function getFulfillmentOrderIdsByOrderId(
  orderId: string,
): Promise<string[]> {
  const shop = process.env.SHOP_DOMAIN;
  const token = await getShopifyToken();
  const url = `https://${shop}.myshopify.com/admin/api/2026-01/graphql.json`;
  const query = `
    query getOrderFulfillmentOrders($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 20) {
          edges {
            node {
              id
              status
            }
          }
        }
      }
    }
  `;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables: { id: orderId } }),
  });
  const data = (await response.json()) as any;
  const edges = data.data.order.fulfillmentOrders.edges;
  // open状態のもののみ対象
  return edges
    .filter((e: any) => e.node.status === "OPEN")
    .map((e: any) => e.node.id);
}

export async function splitFulfillmentOrder(
  fulfillmentOrderId: string,
  groups: Map<string, LineItem[]>,
): Promise<string[]> {
  // 分割後の全fulfillmentOrderのIDを返す
  const shop = process.env.SHOP_DOMAIN;
  const token = await getShopifyToken();
  const url = `https://${shop}.myshopify.com/admin/api/2026-01/graphql.json`;
  const mutation = `
    mutation fulfillmentOrderSplit($fulfillmentOrderSplits: [FulfillmentOrderSplitInput!]!) {
    fulfillmentOrderSplit(fulfillmentOrderSplits: $fulfillmentOrderSplits) {
        fulfillmentOrderSplits {
        fulfillmentOrder {
            id
            lineItems(first: 50) {
            edges {
                node {
                id
                totalQuantity
                }
            }
            }
        }
        remainingFulfillmentOrder {
            id
        }
        }
        userErrors {
        field
        message
        }
    }
    }
  `;
  if (groups.size === 1) {
    return [fulfillmentOrderId];
  } else {
    const groupEntries = Array.from(groups.entries());
    const splitsInput = groupEntries.slice(1).map(([_, lineItems]) => ({
      fulfillmentOrderId,
      fulfillmentOrderLineItems: lineItems.map((item) => ({
        id: item.id,
        quantity: item.remainingQuantity,
      })),
    }));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-Shopify-Access-Token": token,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          fulfillmentOrderSplits: splitsInput,
        },
      }),
    });
    const data = (await response.json()) as any;

    console.log(
      "splitFulfillmentOrder response:",
      JSON.stringify(data, null, 2),
    );

    const splits = data.data.fulfillmentOrderSplit.fulfillmentOrderSplits;
    if (!splits) {
      const errors = data.data.fulfillmentOrderSplit.userErrors;
      console.error("splitFulfillmentOrder userErrors:", JSON.stringify(errors));
      throw new Error(`Split failed: ${errors?.[0]?.message}`);
    }
    const newIds = splits.map((s: any) => s.fulfillmentOrder.id);
    const remainingId = splits[0].remainingFulfillmentOrder.id;
    return [remainingId, ...newIds];
  }
}
