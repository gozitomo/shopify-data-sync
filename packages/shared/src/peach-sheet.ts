// Google スプレッドシート（桃アンケート回答）を Sheets API で読み取る。
// 認証は ADC（本番=関数のサービスアカウント / ローカル=gcloud ADC）。
// 対象シートは事前にそのサービスアカウントへ「閲覧者」で共有しておくこと。
import { GoogleAuth } from "google-auth-library";

export const PEACH_SPREADSHEET_ID =
  process.env.PEACH_SPREADSHEET_ID ||
  "1C1W5JchEUe_uPx2aneYuQ_3kXKvIcnt9WD8PRNB68dQ";
export const PEACH_SHEET_GID = Number(process.env.PEACH_SHEET_GID || 319980911);

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

async function accessToken(): Promise<string> {
  const client = await auth.getClient();
  const t = await client.getAccessToken();
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

// スプシの全行（先頭はヘッダー）を返す。
export async function fetchPeachSurveyRows(
  spreadsheetId: string = PEACH_SPREADSHEET_ID,
  gid: number = PEACH_SHEET_GID,
): Promise<string[][]> {
  const token = await accessToken();
  const title = await sheetTitleForGid(spreadsheetId, gid, token);
  // A1記法ではタブ名にスペース/記号があるとシングルクォートで囲む必要がある
  // （フォーム連携タブ「フォームの回答 1」等に対応）。内部の ' は '' にエスケープ。
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'!A:Q`);
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
