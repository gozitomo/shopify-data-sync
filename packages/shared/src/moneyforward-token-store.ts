import { readFileSync, writeFileSync } from "node:fs";

// ローカル開発用: .env ファイルの MONEYFORWARD_REFRESH_TOKEN 行を新しい値に書き換える。
export function saveRefreshTokenToEnvFile(
  envFilePath: string,
  newRefreshToken: string,
): void {
  const content = readFileSync(envFilePath, "utf-8");
  const lines = content.split("\n");
  let found = false;
  const updated = lines.map((line) => {
    if (line.startsWith("MONEYFORWARD_REFRESH_TOKEN=")) {
      found = true;
      return `MONEYFORWARD_REFRESH_TOKEN=${newRefreshToken}`;
    }
    return line;
  });
  if (!found) {
    throw new Error(
      `${envFilePath} に MONEYFORWARD_REFRESH_TOKEN の行が見つかりません`,
    );
  }
  writeFileSync(envFilePath, updated.join("\n"));
}

// 本番用: Secret Manager に新しいバージョンを追加する。
// Cloud Run 実行環境のメタデータサーバからアクセストークンを取得してREST APIを叩く
// （packages/api/src/sync-job.ts の getMetadataToken と同じ方式）。
// 事前に対象サービスアカウントへ roles/secretmanager.secretVersionAdder 相当の権限付与が必要。
export async function saveRefreshTokenToSecretManager(
  secretResourceName: string, // 例: projects/123456789/secrets/moneyforward-refresh-token
  newRefreshToken: string,
): Promise<void> {
  const tokenRes = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!tokenRes.ok) {
    throw new Error(
      "アクセストークン取得に失敗（この関数は本番(Cloud Run)環境でのみ動作します）",
    );
  }
  const { access_token } = (await tokenRes.json()) as {
    access_token: string;
  };

  const url = `https://secretmanager.googleapis.com/v1/${secretResourceName}:addVersion`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: { data: Buffer.from(newRefreshToken).toString("base64") },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Secret Manager更新失敗: HTTP ${res.status} ${body.slice(0, 200)}`,
    );
  }
}
