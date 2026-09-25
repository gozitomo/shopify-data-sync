import * as dotenv from "dotenv";

dotenv.config();

const TOKEN_URL = "https://api.biz.moneyforward.com/token";

export type MoneyForwardTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

// refresh_token を使ってアクセストークンを再発行する。
// マネーフォワードはリフレッシュのたびに refresh_token をローテーションする（実機確認済み）。
// 呼び出し側は必ずレスポンスの refresh_token で保存値を更新すること。古い値は次回失敗する。
export async function refreshMoneyForwardToken(
  refreshToken: string,
): Promise<MoneyForwardTokenResponse> {
  const clientId = process.env.MONEYFORWARD_CLIENT_ID;
  const clientSecret = process.env.MONEYFORWARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "MONEYFORWARD_CLIENT_ID / MONEYFORWARD_CLIENT_SECRET が未設定です",
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = (await response.json()) as
    | MoneyForwardTokenResponse
    | { error: string; error_description?: string };

  if (!response.ok || !("access_token" in data)) {
    throw new Error(
      `マネーフォワードのトークン更新に失敗: ${JSON.stringify(data)}`,
    );
  }

  return data;
}

// 環境変数 MONEYFORWARD_REFRESH_TOKEN を使ってアクセストークンを取得する簡易ヘルパー。
export async function getMoneyForwardToken(): Promise<MoneyForwardTokenResponse> {
  const refreshToken = process.env.MONEYFORWARD_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("MONEYFORWARD_REFRESH_TOKEN が未設定です");
  }
  return refreshMoneyForwardToken(refreshToken);
}

// getMoneyForwardToken に加えて、ローテーションされた新しい refresh_token を
// saveRefreshToken で永続化する。保存先（.env書き換え/Secret Manager等）は呼び出し側が注入する。
// 保存が成功した後、同一プロセス内の以降の呼び出しに備えて process.env も更新する。
export async function getMoneyForwardTokenAndPersist(
  saveRefreshToken: (newRefreshToken: string) => Promise<void>,
): Promise<MoneyForwardTokenResponse> {
  const refreshToken = process.env.MONEYFORWARD_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("MONEYFORWARD_REFRESH_TOKEN が未設定です");
  }
  const result = await refreshMoneyForwardToken(refreshToken);
  if (result.refresh_token && result.refresh_token !== refreshToken) {
    await saveRefreshToken(result.refresh_token);
    process.env.MONEYFORWARD_REFRESH_TOKEN = result.refresh_token;
  }
  return result;
}
