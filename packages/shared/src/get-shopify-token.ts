import * as dotenv from "dotenv";

dotenv.config();

export async function getShopifyToken() {
  const shop = process.env.SHOP_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  const params = new URLSearchParams({
    client_id: clientId!,
    client_secret: clientSecret!,
    grant_type: "client_credentials",
  });

  const url = `https://${shop}.myshopify.com/admin/oauth/access_token?${params.toString()}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  if (!data.access_token) {
    throw new Error(`トークン取得失敗: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}
