import { getShopifyToken } from "./get-shopify-token.js";
import { toJapanesePrefecture } from "./prefecture.js";
import { normalizePhone } from "./phone.js";

const API_VERSION = "2026-01";

type CsvRow = {
  orderName: string;
  billingName: string;
  address: string;
  phone: string;
  productName: string;
  sku: string;
  quantity: number;
  tags: string;
};

// CSVの1セルをエスケープ（ダブルクォート囲み・内部の"は""に）
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}


function buildAddress(addr: any): string {
  if (!addr) return "";
  const zip = addr.zip ? `〒${addr.zip} ` : "";
  const province = addr.province ? toJapanesePrefecture(addr.province) : "";
  return `${zip}${province}${addr.city ?? ""}${addr.address1 ?? ""}${addr.address2 ?? ""}`.trim();
}

/**
 * Shopifyから「今年・未発送・キャンセル除外」の明細(SKU単位)を全件取得し、
 * バーコード印刷用CSV文字列(BOM付きUTF-8)を組み立てて返す。
 */
export async function buildUnfulfilledCsv(): Promise<{
  csv: string;
  orderCount: number;
  rowCount: number;
}> {
  const domain = process.env.SHOP_DOMAIN;
  const token = await getShopifyToken();

  const currentYear = new Date().getFullYear();
  const orderQuery = `created_at:>=${currentYear}-01-01 AND -status:cancelled AND (fulfillment_status:unfulfilled OR fulfillment_status:partial)`;

  const query = `
    query($cursor: String, $queryStr: String) {
      orders(first: 50, after: $cursor, sortKey: CREATED_AT, query: $queryStr) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            name
            phone
            tags
            cancelledAt
            billingAddress {
              firstName lastName
              zip province city address1 address2
              phone
            }
            customer { phone displayName }
            lineItems(first: 250) {
              edges {
                node {
                  name
                  sku
                  unfulfilledQuantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const rows: CsvRow[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let orderCount = 0;

  while (hasNextPage) {
    const response = await fetch(
      `https://${domain}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token!,
        },
        body: JSON.stringify({
          query,
          variables: { cursor, queryStr: orderQuery },
        }),
      },
    );

    const result: any = await response.json();
    if (result.errors) {
      throw new Error(`Shopify API Error: ${JSON.stringify(result.errors)}`);
    }

    for (const orderEdge of result.data.orders.edges) {
      const order = orderEdge.node;
      // キャンセル済みは除外（クエリでも弾いているが念のため）
      if (order.cancelledAt) continue;
      orderCount++;

      const b = order.billingAddress;
      const billingName = b
        ? `${b.lastName ?? ""} ${b.firstName ?? ""}`.trim()
        : (order.customer?.displayName ?? "");
      const address = buildAddress(b);
      const phone = normalizePhone(
        b?.phone || order.phone || order.customer?.phone || "",
      );
      const tags: string = Array.isArray(order.tags)
        ? order.tags.join(" ")
        : "";

      for (const liEdge of order.lineItems.edges) {
        const li = liEdge.node;
        // 未発送数が残っている明細だけ出す
        if (!li.unfulfilledQuantity || li.unfulfilledQuantity <= 0) continue;
        rows.push({
          orderName: order.name,
          billingName,
          address,
          phone,
          productName: li.name, // 「商品名 - バリアント(荷姿)」形式
          sku: li.sku ?? "",
          quantity: li.unfulfilledQuantity,
          tags,
        });
      }
    }

    hasNextPage = result.data.orders.pageInfo.hasNextPage;
    cursor = result.data.orders.pageInfo.endCursor;
  }

  // CSV組み立て（Excel用にBOM付きUTF-8）
  const header = [
    "注文番号",
    "依頼主氏名",
    "住所",
    "電話番号",
    "商品名-荷姿",
    "個数",
    "タグ",
    "バーコード",
  ];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((r) => {
      const cols = [
        r.orderName,
        r.billingName,
        r.address,
        r.phone,
        r.productName,
        String(r.quantity),
        r.tags,
      ];
      // バーコードは商品名が長すぎるためSKUに差し替えて連結
      const barcode = [
        r.orderName,
        r.billingName,
        r.address,
        r.phone,
        r.sku,
        String(r.quantity),
      ].join("");
      return [...cols, barcode].map(csvCell).join(",");
    }),
  ];
  const csv = "﻿" + lines.join("\r\n");

  return { csv, orderCount, rowCount: rows.length };
}
