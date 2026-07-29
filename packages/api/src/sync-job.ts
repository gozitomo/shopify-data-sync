// 在庫画面の「注文データ更新」ボタン用: 既存の Cloud Run Job を起動する。
// 本番(Cloud Run)ではメタデータサーバからアクセストークンを取得して Cloud Run Admin API を叩く。
const REGION = "asia-northeast1";
const ORDERS_JOB = "shopify-orders-sync";
const PRODUCTS_JOB = "shopify-products-sync";

async function getMetadataToken(): Promise<string> {
  const res = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!res.ok) {
    throw new Error(
      "アクセストークン取得に失敗（この機能は本番環境でのみ動作します）",
    );
  }
  const data: any = await res.json();
  return data.access_token;
}

// 指定した Cloud Run Job を非同期起動（完了は待たない）
async function runJob(jobName: string, token: string): Promise<void> {
  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.PROJECT_ID;
  const url = `https://run.googleapis.com/v2/projects/${project}/locations/${REGION}/jobs/${jobName}:run`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `ジョブ起動失敗(${jobName}): HTTP ${res.status} ${body.slice(0, 200)}`,
    );
  }
}

// 注文同期・商品同期をまとめて起動（在庫を正しく出すため両方更新する）
export async function triggerSync(): Promise<void> {
  const token = await getMetadataToken();
  await Promise.all([
    runJob(ORDERS_JOB, token),
    runJob(PRODUCTS_JOB, token),
  ]);
}
