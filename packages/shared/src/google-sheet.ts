// Google スプレッドシートを Sheets API で読み取る共通処理。
//
// スプシ読み取り専用のサービスアカウント(SHEETS_SA_EMAIL)を ADC から成りすまして使う。
// こうすると本番(関数の実行SA)とローカル(gcloud ADC)で同じ識別子でシートを読めるので、
// スプシの共有先はこの1つのSAだけで済む。
// 事前に必要なもの:
//   - 対象スプシをそのSAへ「閲覧者」で共有
//   - 呼び出し元(関数の実行SA / 開発者アカウント)に roles/iam.serviceAccountTokenCreator
// SHEETS_SA_EMAIL 未設定なら ADC のまま読む（移行前・テスト用のフォールバック）。
import { GoogleAuth, Impersonated, type AuthClient } from "google-auth-library";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const SHEETS_SA_EMAIL =
  process.env.SHEETS_SA_EMAIL ||
  "sheets-reader@pgfarm-dashboard-493812.iam.gserviceaccount.com";

const auth = new GoogleAuth({
  // 成りすます場合、元の資格情報側には cloud-platform スコープが必要。
  scopes: SHEETS_SA_EMAIL
    ? ["https://www.googleapis.com/auth/cloud-platform"]
    : SHEETS_SCOPES,
});

// トークンはクライアント内部でキャッシュされるので、クライアント自体を使い回す。
let clientPromise: Promise<AuthClient> | null = null;

function sheetsClient(): Promise<AuthClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const source = await auth.getClient();
      if (!SHEETS_SA_EMAIL) return source;
      return new Impersonated({
        sourceClient: source,
        targetPrincipal: SHEETS_SA_EMAIL,
        targetScopes: SHEETS_SCOPES,
        lifetime: 3600,
      });
    })();
  }
  return clientPromise;
}

async function accessToken(): Promise<string> {
  let t;
  try {
    const client = await sheetsClient();
    t = await client.getAccessToken();
  } catch (e: any) {
    clientPromise = null; // 次回やり直せるようにキャッシュを捨てる
    const hint = SHEETS_SA_EMAIL
      ? `（${SHEETS_SA_EMAIL} への roles/iam.serviceAccountTokenCreator を確認）`
      : "";
    throw new Error(`Google 認証トークンの取得に失敗しました${hint}: ${e?.message ?? e}`);
  }
  if (!t.token) throw new Error("Google 認証トークンの取得に失敗しました");
  return t.token;
}

// gid からシートのタイトル（タブ名）を解決する（Sheets API の range はタブ名指定のため）。
async function sheetTitleForGid(
  spreadsheetId: string,
  gid: number,
  token: string,
): Promise<string> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(
      `Sheetsメタ取得失敗: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json: any = await res.json();
  const sheet = (json.sheets ?? []).find(
    (s: any) => s.properties?.sheetId === gid,
  );
  if (!sheet) throw new Error(`gid=${gid} のシートが見つかりません`);
  return sheet.properties.title as string;
}

// 指定シートの全行（先頭はヘッダー）を返す。columns は "A:Q" のような列範囲。
export async function fetchSheetRows(
  spreadsheetId: string,
  gid: number,
  columns: string,
): Promise<string[][]> {
  const token = await accessToken();
  const title = await sheetTitleForGid(spreadsheetId, gid, token);
  // A1記法ではタブ名にスペース/記号があるとシングルクォートで囲む必要がある
  // （フォーム連携タブ「フォームの回答 1」等に対応）。内部の ' は '' にエスケープ。
  const range = encodeURIComponent(
    `'${title.replace(/'/g, "''")}'!${columns}`,
  );
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(
      `Sheets値取得失敗: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }
  const json: any = await res.json();
  return (json.values ?? []) as string[][];
}
