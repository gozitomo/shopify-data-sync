// Google スプレッドシート（桃アンケート回答）を読み取る。
// 取得の共通処理は google-sheet.ts。対象シートはサービスアカウントへ共有済みであること。
import { fetchSheetRows } from "./google-sheet.js";

export const PEACH_SPREADSHEET_ID =
  process.env.PEACH_SPREADSHEET_ID ||
  "1C1W5JchEUe_uPx2aneYuQ_3kXKvIcnt9WD8PRNB68dQ";
export const PEACH_SHEET_GID = Number(process.env.PEACH_SHEET_GID || 319980911);

// スプシの全行（先頭はヘッダー）を返す。
export async function fetchPeachSurveyRows(
  spreadsheetId: string = PEACH_SPREADSHEET_ID,
  gid: number = PEACH_SHEET_GID,
): Promise<string[][]> {
  return fetchSheetRows(spreadsheetId, gid, "A:Q");
}
