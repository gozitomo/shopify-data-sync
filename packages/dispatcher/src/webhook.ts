import { Router, Request, Response } from "express";
import crypto from "crypto";
import { processFulfillmentOrder } from "./task-handler.js";

// Ship&Co連携は一時停止中
// import { cancelShipAndCoByOrderName, handleOrderEdited, handleOrderUpdated } from "./task-handler.js";

export const webhookRouter = Router();

function verifyHmac(req: any): boolean {
  const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
  const secret = process.env.SHOPIFY_CLIENT_SECRET!;
  const hash = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");
  return hash === hmacHeader;
}

webhookRouter.post(
  "/fulfillment-orders",
  async (req: Request, res: Response) => {
    const topic = req.headers["x-shopify-topic"] as string;
    console.log(`[受信] topic: ${topic}`);
    if (!verifyHmac(req)) {
      console.log(`[HMAC失敗] topic: ${topic}`);
      return res.status(401).send("Unauthorized");
    }
    const payload = req.body;
    console.log(`[HMAC OK] topic: ${topic}`);
    res.status(200).json({ received: true });

    // Ship&Co連携が必要なトピックは一時停止中
    // if (topic === "orders/edited") {
    //   const orderId = `gid://shopify/Order/${payload.order_edit?.order_id}`;
    //   if (payload.order_edit?.order_id) await handleOrderEdited(orderId);
    //   return;
    // }
    // if (topic === "orders/updated") {
    //   await handleOrderUpdated(payload);
    //   return;
    // }
    // if (topic === "orders/cancelled") {
    //   const orderName = payload.name as string;
    //   if (orderName) await cancelShipAndCoByOrderName(orderName);
    //   return;
    // }

    const fulfillmentOrderId = payload.fulfillment_order?.id;
    const status = payload.fulfillment_order?.status;

    // on_hold の場合は order_routing_complete をスキップ
    if (topic === "fulfillment_orders/order_routing_complete" && status === "on_hold") {
      console.log(`スキップ: ${topic} (status: on_hold)`);
      return;
    }

    if (fulfillmentOrderId) {
      await processFulfillmentOrder(topic, fulfillmentOrderId);
    }
  },
);
