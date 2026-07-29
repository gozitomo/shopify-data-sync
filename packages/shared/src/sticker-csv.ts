import { getShopifyToken } from "./get-shopify-token.js";
import { toJapanesePrefecture } from "./prefecture.js";
import { normalizePhone } from "./phone.js";

const API_VERSION = "2026-01";

export type ShipmentRow = {
  foId: string; // FulfillmentOrder id（数字）
  tracking: string; // 伝票番号
  orderName: string; // 注文番号
};

function csvCell(value: string | number): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildAddress(addr: any): string {
  if (!addr) return "";
  const zip = addr.zip ? `〒${addr.zip} ` : "";
  const pref = addr.province ? toJapanesePrefecture(addr.province) : "";
  return `${zip}${pref}${addr.city ?? ""}${addr.address1 ?? ""}${addr.address2 ?? ""}`.trim();
}

const NODES_QUERY = `
  query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on FulfillmentOrder {
        id
        order {
          name
          tags
          billingAddress {
            firstName lastName
            zip province city address1 address2
            phone
          }
          customer { displayName }
        }
        lineItems(first: 50) {
          edges { node { remainingQuantity totalQuantity lineItem { name sku } } }
        }
      }
    }
  }
`;

async function fetchFulfillmentOrders(
  ids: string[],
  domain: string,
  token: string,
): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  // nodes は最大250件。安全に100件ずつ
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids
      .slice(i, i + 100)
      .map((id) => `gid://shopify/FulfillmentOrder/${id}`);
    const res = await fetch(
      `https://${domain}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query: NODES_QUERY, variables: { ids: chunk } }),
      },
    );
    const json: any = await res.json();
    if (json.errors) {
      throw new Error(`Shopify API Error: ${JSON.stringify(json.errors)}`);
    }
    for (const node of json.data.nodes) {
      if (node?.id) result.set(node.id.split("/").pop(), node);
    }
  }
  return result;
}

/**
 * 発行済み行(FO id + 伝票番号 + 注文番号)から、注文者(billing)・商品をShopifyで
 * 都度取得し、バーコードシール用CSV(BOM付きUTF-8)を生成する。PIIは保存しない。
 */
export async function buildStickerCsv(
  rows: ShipmentRow[],
): Promise<{ csv: string; count: number; missing: string[] }> {
  const domain = process.env.SHOP_DOMAIN!;
  const token = await getShopifyToken();

  // FO idごとに最新の伝票番号で集約（再発行は最後を採用）
  const byFo = new Map<string, ShipmentRow>();
  for (const r of rows) {
    if (r.foId) byFo.set(r.foId, r);
  }

  const foNodes = await fetchFulfillmentOrders(
    [...byFo.keys()],
    domain,
    token!,
  );

  const header = [
    "注文番号",
    "注文者氏名",
    "住所",
    "電話番号",
    "商品名-荷姿",
    "個数",
    "タグ",
    "バーコード",
  ];
  const lines: string[] = [header.map(csvCell).join(",")];
  const missing: string[] = [];

  for (const [foId, row] of byFo) {
    const node = foNodes.get(foId);
    if (!node) {
      missing.push(foId);
      continue;
    }
    const order = node.order;
    const b = order?.billingAddress;
    const ordererName = b
      ? `${b.lastName ?? ""} ${b.firstName ?? ""}`.trim()
      : (order?.customer?.displayName ?? "");
    const address = buildAddress(b);
    const phone = normalizePhone(b?.phone ?? "");
    const tags = Array.isArray(order?.tags) ? order.tags.join(" ") : "";

    const items = node.lineItems.edges
      .map((e: any) => e.node)
      .map((n: any) => ({
        name: n.lineItem.name,
        sku: n.lineItem.sku ?? "",
        qty: n.remainingQuantity > 0 ? n.remainingQuantity : n.totalQuantity,
      }));
    const productName = items
      .map((it: any) => `${it.name}×${it.qty}`)
      .join(" / ");
    const totalQty = items.reduce((a: number, it: any) => a + it.qty, 0);

    // バーコード: FOid|伝票番号|注文番号|SKU:個数,SKU:個数,...
    const skuPart = items.map((it: any) => `${it.sku}:${it.qty}`).join(",");
    const barcode = `${foId}|${row.tracking}|${row.orderName}|${skuPart}`;

    lines.push(
      [
        order?.name ?? row.orderName,
        ordererName,
        address,
        phone,
        productName,
        totalQty,
        tags,
        barcode,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  return { csv, count: byFo.size - missing.length, missing };
}
