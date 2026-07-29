import { LineItem } from "./sku.js";
import { toJapanesePrefecture } from "./prefecture.js";
import * as dotenv from "dotenv";

dotenv.config();

// Ship&Coにfulfillmentを連携（API呼び出し）
export async function CreateShipAndCoRecord(
  fulfillmentOrder: any,
  lineItem: LineItem[],
) {
  console.log("Ship&Co連繋開始");

  const url = "https://api.shipandco.com/v1/orders";
  const token = process.env.SHIP_CO_API_KEY;

  const order = fulfillmentOrder.order;
  const shippingAddress = order.shippingAddress;

  const body = {
    to_address: {
      full_name: `${shippingAddress.lastName} ${shippingAddress.firstName}`,
      phone: `${shippingAddress.phone}`,
      email: order.email || order.customer?.email || null,
      country: `${shippingAddress.countryCode}`,
      zip: shippingAddress.zip ?? "",
      province: toJapanesePrefecture(shippingAddress.province ?? ""),
      address1: `${shippingAddress.city ?? ""}${shippingAddress.address1 ?? ""}`,
      extra: shippingAddress.address2 || null,
    },
    products: lineItem.map((item: LineItem) => ({
      name: item.variantTitle
        ? `${item.productTitle} - ${item.variantTitle}[${item.sku}]`
        : `${item.productTitle}[${item.sku}]`,
      quantity: item.remainingQuantity,
      price: Number(item.originalUnitPriceSet?.shopMoney?.amount ?? 0),
    })),
    setup: {
      currency: "JPY",
      ref_number: order.name,
      // warehouse_id: process.env.SHIP_CO_WAREHOUSE_ID || null,  // 切り分けテスト中
      // shipping_method: order.shippingLine?.title || null,  // 切り分けテスト中
      delivery_note: order.note || null,
    },
  };

  console.log("Ship&Coリクエストボディ：", JSON.stringify(body, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-access-token": token!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as any;
  console.log("Ship&Coレスポンス：", JSON.stringify(result, null, 2));

  return result;
}

// Ship&CoのオーダーをIDで削除
export async function DeleteShipAndCoRecord(
  shipandcoOrderId: string,
): Promise<void> {
  const url = `https://api.shipandco.com/v1/orders/${shipandcoOrderId}`;
  const token = process.env.SHIP_CO_API_KEY;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      "x-access-token": token!,
    },
  });

  if (response.ok) {
    console.log(`Ship&Co削除成功: ${shipandcoOrderId}`);
  } else {
    const text = await response.text();
    console.error(`Ship&Co削除失敗: ${shipandcoOrderId}`, text);
  }
}
