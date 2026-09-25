import { encodeMoneyForwardId } from "./moneyforward-ids.js";

const API_BASE = "https://api-accounting.moneyforward.com";

const MAX_FILES_PER_UPLOAD = 5;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export type VoucherFile = {
  fileName: string;
  data: Buffer;
};

export type VoucherFileId = {
  fileName: string;
  fileId: string;
};

// 証憑ファイルを仕訳に添付する。journal_id を指定してアップロードすると、
// 保存と仕訳への紐付けが1回のAPI呼び出しで完了する。
// journal_id を指定すれば電帳法の要件（クラウド会計仕様準拠）も自動的に満たされる
// （明示的な区分指定パラメータは存在しない。docs/会計自動化設計書.md 参照）。
// 制限（マネフォ仕様）：1回のアップロードにつき最大5件・1件あたり最大5MB。
export async function attachVouchers(
  accessToken: string,
  journalId: string,
  files: VoucherFile[],
): Promise<VoucherFileId[]> {
  if (files.length === 0) {
    throw new Error("添付する証憑ファイルが1件もありません");
  }
  if (files.length > MAX_FILES_PER_UPLOAD) {
    throw new Error(
      `証憑は1回のアップロードにつき最大${MAX_FILES_PER_UPLOAD}件までです（${files.length}件指定）`,
    );
  }
  for (const file of files) {
    if (file.data.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `証憑ファイルが5MBを超えています: ${file.fileName} (${file.data.length}バイト)`,
      );
    }
  }

  const res = await fetch(`${API_BASE}/api/v3/vouchers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // JSONボディのID系フィールドはエンコード済みの形で送る必要がある（journalize等と同様）。
      journal_id: encodeMoneyForwardId(journalId),
      voucher_files: files.map((f) => ({
        file_name: f.fileName,
        file_data: f.data.toString("base64"),
      })),
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`証憑の添付に失敗: ${JSON.stringify(body)}`);
  }
  const ids: Array<{ file_name: string; file_id: string }> = body.voucher_file_ids ?? [];
  return ids.map((v) => ({ fileName: v.file_name, fileId: v.file_id }));
}
