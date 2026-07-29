import { Firestore } from "@google-cloud/firestore";

const db = new Firestore({
  projectId: process.env.GCP_PROJECT_ID || "pgfarm-dashboard-493812",
  databaseId: "shipandco",
});

const COLLECTION = "shipandco_orders";
const SNAPSHOT_COLLECTION = "order_snapshots";

// 注文の住所・メモのスナップショットを保存（orders/updated 差分検知用）
export async function saveOrderSnapshot(
  orderName: string,
  addressSig: string,
  note: string,
): Promise<void> {
  await db.collection(SNAPSHOT_COLLECTION).doc(encodeId(orderName)).set({
    address_sig: addressSig,
    note: note,
    updated_at: new Date().toISOString(),
  });
  console.log(`スナップショット保存: ${orderName}`);
}

// 注文のスナップショットを取得（なければnull）
export async function getOrderSnapshot(
  orderName: string,
): Promise<{ address_sig: string; note: string } | null> {
  const doc = await db
    .collection(SNAPSHOT_COLLECTION)
    .doc(encodeId(orderName))
    .get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    address_sig: data.address_sig ?? "",
    note: data.note ?? "",
  };
}

// Ship&CoのオーダーIDを保存
// doc ID = ShopifyのfulfillmentOrderId（GIDのままOK）
export async function saveShipAndCoOrderId(
  fulfillmentOrderId: string,
  shipandcoOrderId: string,
  refNumber: string,
): Promise<void> {
  await db.collection(COLLECTION).doc(encodeId(fulfillmentOrderId)).set({
    shipandco_order_id: shipandcoOrderId,
    fulfillment_order_id: fulfillmentOrderId,
    ref_number: refNumber,
    created_at: new Date().toISOString(),
  });
  console.log(
    `Firestore保存: ${fulfillmentOrderId} → ${shipandcoOrderId}`,
  );
}

// Ship&CoのオーダーIDを取得して削除
export async function getAndDeleteShipAndCoOrderId(
  fulfillmentOrderId: string,
): Promise<string | null> {
  const ref = db.collection(COLLECTION).doc(encodeId(fulfillmentOrderId));
  const doc = await ref.get();
  if (!doc.exists) {
    console.log(`Firestoreにレコードなし: ${fulfillmentOrderId}`);
    return null;
  }
  const shipandcoOrderId = doc.data()?.shipandco_order_id as string;
  await ref.delete();
  console.log(
    `Firestore削除: ${fulfillmentOrderId} (Ship&Co: ${shipandcoOrderId})`,
  );
  return shipandcoOrderId;
}

// ref_numberに紐づく全Ship&CoオーダーIDを取得して削除
export async function getAndDeleteByRefNumber(
  refNumber: string,
): Promise<string[]> {
  const snapshot = await db
    .collection(COLLECTION)
    .where("ref_number", "==", refNumber)
    .get();

  if (snapshot.empty) {
    console.log(`Firestoreにレコードなし (ref_number: ${refNumber})`);
    return [];
  }

  const shipandcoOrderIds: string[] = [];
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    shipandcoOrderIds.push(doc.data().shipandco_order_id as string);
    batch.delete(doc.ref);
  }
  await batch.commit();
  console.log(
    `Firestore削除 (ref_number: ${refNumber}): ${shipandcoOrderIds.join(", ")}`,
  );
  return shipandcoOrderIds;
}

// GIDはスラッシュを含むのでドキュメントIDに使えない → エンコード
function encodeId(id: string): string {
  return id.replace(/\//g, "_");
}
