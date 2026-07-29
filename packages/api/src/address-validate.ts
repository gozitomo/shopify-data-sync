import type { Firestore } from "firebase-admin/firestore";
import type { B2Entry } from "@shopify-data-sync/shared";

const TOKEN_URL = "https://api.da.pf.japanpost.jp/api/v2/j/token";
const SEARCH_URL = "https://api.da.pf.japanpost.jp/api/v2/searchcode";

export type Suspect = {
  orderName: string;
  recipientName: string;
  zip: string;
  address: string;
  reason: string;
};

type ZipInfo = { prefName: string; cityName: string; count: number };

// OAuth2 client_credentials でアクセストークンを取得
async function getToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.JAPANPOST_CLIENT_ID,
      secret_key: process.env.JAPANPOST_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    throw new Error(`日本郵便トークン取得失敗: HTTP ${res.status}`);
  }
  const data: any = await res.json();
  if (!data.token) throw new Error("日本郵便トークンが取得できません");
  return data.token;
}

// 郵便番号→住所。Firestore zipcache を先に見て、無ければAPI→キャッシュ保存
async function lookupZip(
  zip: string,
  token: string,
  db: Firestore,
): Promise<ZipInfo> {
  const ref = db.collection("zipcache").doc(zip);
  const cached = await ref.get();
  if (cached.exists) return cached.data() as ZipInfo;

  const url = `${SEARCH_URL}/${zip}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let info: ZipInfo;
  if (res.status === 404) {
    // 該当する郵便番号が存在しない → 要確認扱い（count:0）
    info = { prefName: "", cityName: "", count: 0 };
  } else if (res.ok) {
    const data: any = await res.json();
    const first = data.addresses?.[0];
    info = {
      prefName: first?.pref_name ?? "",
      cityName: first?.city_name ?? "",
      count: data.count ?? 0,
    };
  } else {
    // 401/429/500 等は本当の異常 → 中断（キャッシュ済みは残る）
    const body = await res.text();
    throw new Error(
      `日本郵便API検索失敗: HTTP ${res.status} body=${body.slice(0, 150)}`,
    );
  }

  await ref.set({ ...info, fetchedAt: new Date() });
  return info;
}

// 市区町村が住所に含まれるか（郡を外した末尾も許容）
function cityMatches(cityName: string, fullAddress: string): boolean {
  if (!cityName) return false;
  if (fullAddress.includes(cityName)) return true;
  const tail = cityName.split("郡").pop() ?? cityName;
  return tail !== cityName && fullAddress.includes(tail);
}

/**
 * 各伝票の配送先住所を郵便番号で照合し、要確認(不一致)だけ返す。
 * 都道府県・市区町村レベルで判定（表記揺れの少ない範囲）。
 */
export async function validateAddresses(
  entries: B2Entry[],
  db: Firestore,
): Promise<Suspect[]> {
  const suspects: Suspect[] = [];
  const token = await getToken();

  // 同一zipは1回だけ引く
  const cache = new Map<string, ZipInfo>();

  for (const e of entries) {
    const base = {
      orderName: e.orderName,
      recipientName: e.recipientName,
      zip: e.zip,
      address: e.fullAddress,
    };
    if (!e.zip || e.zip.length < 7) {
      suspects.push({ ...base, reason: "郵便番号が未入力/桁不足" });
      continue;
    }
    let info = cache.get(e.zip);
    if (!info) {
      info = await lookupZip(e.zip, token, db);
      cache.set(e.zip, info);
    }
    if (info.count === 0 || !info.prefName) {
      suspects.push({ ...base, reason: "郵便番号が存在しない" });
    } else if (info.prefName !== e.prefJp) {
      suspects.push({
        ...base,
        reason: `都道府県不一致（郵便番号上は${info.prefName}）`,
      });
    } else if (!cityMatches(info.cityName, e.fullAddress)) {
      suspects.push({
        ...base,
        reason: `市区町村不一致（郵便番号上は${info.cityName}）`,
      });
    }
  }

  return suspects;
}
