// Cloud Tasks処理
import { Router } from "express";
import { getFulfillmentOrder, splitFulfillmentOrder } from "./shopify.js";
import { groupBySkuGroup } from "./sku.js";

// Ship&Co連携は一時停止中（来年再対応予定）
// import { CreateShipAndCoRecord, DeleteShipAndCoRecord } from "./shipandco.js";
// import { getFulfillmentOrderIdsByOrderId, getOrderName } from "./shopify.js";
// import {
//   saveShipAndCoOrderId,
//   getAndDeleteShipAndCoOrderId,
//   getAndDeleteByRefNumber,
//   saveOrderSnapshot,
//   getOrderSnapshot,
// } from "./firestore.js";

export const taskRouter = Router();

taskRouter.post("/process-fulfillment", async (req, res) => {
  const { topic, fulfillmentOrderId } = req.body;

  res.status(200).send("OK"); // 先にレスポンスを返す

  await processFulfillmentOrder(topic, fulfillmentOrderId);
});

export async function processFulfillmentOrder(
  topic: string,
  fulfillmentOrderId: string,
) {
  if (
    topic === "fulfillment_orders/order_routing_complete" ||
    topic === "fulfillment_orders/hold_released"
  ) {
    const fulfillmentOrder = (await getFulfillmentOrder(
      fulfillmentOrderId,
    )) as any;
    const fo = fulfillmentOrder.data.fulfillmentOrder;
    const lineItems = fo.lineItems.edges.map((e: any) => e.node);
    const groups = groupBySkuGroup(lineItems);
    const fulfillmentOrderIds = await splitFulfillmentOrder(
      fulfillmentOrderId,
      groups,
    );

    console.log("分割後のfulfillmentOrderIds:", fulfillmentOrderIds);

    // Ship&Co連携は一時停止中
    // for (const [_, groupLineItems] of groups) {
    //   const result = await CreateShipAndCoRecord(fo, groupLineItems);
    //   const splitId = fulfillmentOrderIds[i] ?? fulfillmentOrderId;
    //   if (result?.id) {
    //     await saveShipAndCoOrderId(splitId, result.id, fo.order.name);
    //   }
    // }
    // await saveOrderSnapshot(fo.order.name, addressSig(fo.order.shippingAddress), fo.order.note ?? "");
  }

  // キャンセル・編集・住所変更によるShip&Co更新も一時停止中
  // } else if (topic === "fulfillment_orders/cancelled") {
  //   await cancelShipAndCoForFulfillmentOrder(fulfillmentOrderId);
  // }
}

// Ship&Co連携関数群（一時停止中）
// export async function handleOrderEdited(orderId: string): Promise<void> { ... }
// export async function handleOrderUpdated(payload: any): Promise<void> { ... }
// export async function cancelShipAndCoByOrderName(orderName: string): Promise<void> { ... }
