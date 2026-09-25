import { decodeMoneyForwardId, encodeMoneyForwardId } from "./moneyforward-ids.js";

const API_BASE = "https://api-accounting.moneyforward.com";

export type MoneyForwardJournalBranchSide = {
  account_id: string;
  account_name: string;
  value: number;
  sub_account_id?: string | null;
  sub_account_name?: string | null;
  tax_id?: string;
  tax_name?: string;
};

export type MoneyForwardJournalBranch = {
  creditor?: MoneyForwardJournalBranchSide | null;
  debitor?: MoneyForwardJournalBranchSide | null;
  remark?: string;
};

export type MoneyForwardJournal = {
  id: string;
  transaction_id?: string;
  memo: string | null;
  transaction_date: string;
  voucher_file_ids: string[];
  branches: MoneyForwardJournalBranch[];
};

function decodeBranchSide(
  side: MoneyForwardJournalBranchSide | null | undefined,
): MoneyForwardJournalBranchSide | null | undefined {
  if (!side) return side;
  return {
    ...side,
    account_id: decodeMoneyForwardId(side.account_id),
    sub_account_id: side.sub_account_id
      ? decodeMoneyForwardId(side.sub_account_id)
      : side.sub_account_id,
    tax_id: side.tax_id ? decodeMoneyForwardId(side.tax_id) : side.tax_id,
  };
}

function decodeJournal(journal: MoneyForwardJournal): MoneyForwardJournal {
  return {
    ...journal,
    id: decodeMoneyForwardId(journal.id),
    transaction_id: journal.transaction_id
      ? decodeMoneyForwardId(journal.transaction_id)
      : journal.transaction_id,
    branches: journal.branches.map((b) => ({
      ...b,
      creditor: decodeBranchSide(b.creditor),
      debitor: decodeBranchSide(b.debitor),
    })),
  };
}

// 指定した明細ID(transaction_id)に紐づく既存仕訳を検索する。見つからなければnullを返す。
// GET /api/v3/journals は transaction_ids 単独では呼び出せず、必ず start_date/end_date
// （登録されている会計期間に一致する必要がある）を渡す必要がある（実機で確認済み）。
// この事業者の会計期間はカレンダー年（1/1〜12/31）のため、referenceDateの年から組み立てる。
export async function findJournalByTransactionId(
  accessToken: string,
  transactionId: string,
  referenceDate: Date,
): Promise<MoneyForwardJournal | null> {
  const year = referenceDate.getFullYear();
  const params = new URLSearchParams({
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
  });
  params.append("transaction_ids", transactionId);

  const res = await fetch(`${API_BASE}/api/v3/journals?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`仕訳の検索に失敗: ${JSON.stringify(body)}`);
  }
  const journals: MoneyForwardJournal[] = body.journals ?? [];
  return journals[0] ? decodeJournal(journals[0]) : null;
}

export type JournalizeTransactionParams = {
  transactionId: string;
  accountId: string; // 勘定科目ID（借方）。相手方（貸方）は明細側の口座科目が自動で入る
  transactionDate?: string; // YYYY-MM-DD。省略時は明細の取引日
  subAccountId?: string;
  departmentId?: string;
  tradePartnerCode?: string;
  taxId?: string;
  invoiceKind?: string;
  memo?: string; // 200文字まで
  remark?: string; // 摘要。200文字まで
  tags?: string[];
};

// 明細(transaction)から仕訳を新規作成する。findJournalByTransactionIdで見つからなかった場合に使う。
export async function journalizeTransaction(
  accessToken: string,
  params: JournalizeTransactionParams,
): Promise<MoneyForwardJournal> {
  // ID系フィールドはJSONボディではエンコード済みの形（APIが返す形）で送る必要がある
  // （デコード済みの生の値を送ると invalid_request_body_value で拒否される。実機で確認済み）。
  const requestBody: Record<string, unknown> = {
    transaction_id: encodeMoneyForwardId(params.transactionId),
    account_id: encodeMoneyForwardId(params.accountId),
  };
  if (params.transactionDate) requestBody.transaction_date = params.transactionDate;
  if (params.subAccountId)
    requestBody.sub_account_id = encodeMoneyForwardId(params.subAccountId);
  if (params.departmentId)
    requestBody.department_id = encodeMoneyForwardId(params.departmentId);
  if (params.tradePartnerCode) requestBody.trade_partner_code = params.tradePartnerCode;
  if (params.taxId) requestBody.tax_id = encodeMoneyForwardId(params.taxId);
  if (params.invoiceKind) requestBody.invoice_kind = params.invoiceKind;
  if (params.memo) requestBody.memo = params.memo;
  if (params.remark) requestBody.remark = params.remark;
  if (params.tags) requestBody.tags = params.tags;

  const res = await fetch(`${API_BASE}/api/v3/transactions/journalize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`仕訳の新規作成に失敗: ${JSON.stringify(body)}`);
  }
  return decodeJournal(body.journal);
}
