import { decodeMoneyForwardId } from "./moneyforward-ids.js";

const API_BASE = "https://api-accounting.moneyforward.com";

export type MoneyForwardTransaction = {
  id: string;
  date: string;
  value: number;
  side: "INCOME" | "EXPENSE";
  content: string | null;
  memo: string | null;
  journalizing_status: "excluded" | "none" | "registered" | "modified" | "new_voucher_attached";
  connected_account_id: string;
  connected_sub_account_id: string | null;
  voucher_file_ids: string[];
};

export type FindMatchingTransactionParams = {
  connectedSubAccountId: string;
  side: "INCOME" | "EXPENSE";
  amount: number;
  date: string; // YYYY-MM-DD（基準日。前後dateToleranceDaysの範囲で検索する）
  dateToleranceDays?: number; // 既定3日
};

// connected_account_idとconnected_sub_account_idは同時指定できない仕様のため、
// sub_account_id単独で絞り込む（1つのconnected_account_idに複数sub_accountがぶら下がる場合の対策）。
// 金額・日付が完全一致する明細を1件返す（複数マッチした場合は日付が最も近いものを返す）。
export async function findMatchingTransaction(
  accessToken: string,
  params: FindMatchingTransactionParams,
): Promise<MoneyForwardTransaction | null> {
  const target = new Date(params.date);
  const tolerance = params.dateToleranceDays ?? 3;
  const start = new Date(target);
  start.setDate(start.getDate() - tolerance);
  const end = new Date(target);
  end.setDate(end.getDate() + tolerance);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const query = new URLSearchParams({
    start_date: fmt(start),
    end_date: fmt(end),
    connected_sub_account_id: params.connectedSubAccountId,
    side: params.side,
    value_min: String(params.amount),
    value_max: String(params.amount),
    per_page: "50",
  });

  const res = await fetch(`${API_BASE}/api/v3/transactions?${query.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`明細の検索に失敗: ${JSON.stringify(body)}`);
  }
  const transactions: MoneyForwardTransaction[] = (body.transactions ?? []).map(
    (t: MoneyForwardTransaction) => ({
      ...t,
      id: decodeMoneyForwardId(t.id),
      connected_account_id: decodeMoneyForwardId(t.connected_account_id),
      connected_sub_account_id: t.connected_sub_account_id
        ? decodeMoneyForwardId(t.connected_sub_account_id)
        : t.connected_sub_account_id,
    }),
  );
  if (transactions.length === 0) return null;

  const targetMs = target.getTime();
  transactions.sort(
    (a, b) =>
      Math.abs(new Date(a.date).getTime() - targetMs) -
      Math.abs(new Date(b.date).getTime() - targetMs),
  );
  return transactions[0] ?? null;
}
