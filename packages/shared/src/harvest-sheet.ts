// アグリノートから同期される「収穫記録」スプレッドシートを読み取る。
// 取得の共通処理は google-sheet.ts。対象シートはサービスアカウントへ「閲覧者」で共有しておくこと。
import { fetchSheetRows } from "./google-sheet.js";

export const HARVEST_SPREADSHEET_ID =
  process.env.HARVEST_SPREADSHEET_ID ||
  "1PMN6MaWRKc3SSuUWjtoK5P7xu4kLK6ZGW5I62kh6tfc";
export const HARVEST_SHEET_GID = Number(
  process.env.HARVEST_SHEET_GID || 271511280,
);

// 収穫記録シートの全行（先頭はヘッダー）を返す。列は A:R（メモまで）。
export async function fetchHarvestRows(
  spreadsheetId: string = HARVEST_SPREADSHEET_ID,
  gid: number = HARVEST_SHEET_GID,
): Promise<string[][]> {
  if (!spreadsheetId) {
    throw new Error(
      "収穫記録スプレッドシートが未設定です（HARVEST_SPREADSHEET_ID / HARVEST_SHEET_GID）",
    );
  }
  return fetchSheetRows(spreadsheetId, gid, "A:R");
}
