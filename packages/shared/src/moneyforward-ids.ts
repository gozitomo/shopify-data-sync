// マネーフォワード クラウド会計APIは、レスポンスに含まれるID群（id/transaction_id/
// connected_account_id 等）をあらかじめパーセントエンコード済みの文字列として返す
// （実機で確認済み: 例 "6AMU%2FHMRVMYghVXuYM2uyCVY0tf1KAP1X%2B%2Bgn3gL0yU%3D"）。
// これをそのまま URLSearchParams に渡すと再エンコードされて壊れる（二重エンコード）ため、
// レスポンスを受け取った時点でデコードしておき、以降は常にデコード済みの値を扱う
// （クエリ文字列に使う際は URLSearchParams が改めて1回だけエンコードしてくれる）。
export function decodeMoneyForwardId(id: string): string {
  return decodeURIComponent(id);
}

// JSONリクエストボディにIDを埋め込む場合は、逆にエンコード済みの形（APIが返してくる形と
// 同じ形）で送る必要がある（実機で確認済み: デコード済みの生の値を送ると
// invalid_request_body_value で拒否される）。JSON.stringifyはURLエンコードしてくれないため、
// デコード済みの内部表現から改めてエンコードしてから埋め込む。
export function encodeMoneyForwardId(id: string): string {
  return encodeURIComponent(id);
}
