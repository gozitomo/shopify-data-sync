// SKUの「最後の - セグメントを除いた部分」をグループとして返す。
// 例: "M1-T12-0251" -> "M1-T12"（荷姿を分けない区分）
// dispatcher の分割ロジックと同一。
export function getSkuGroup(sku: string): string {
  return (sku ?? "").replace(/-[^\[\]-]+$/, "");
}

// 区分: B-始まり(B2B商材)は "-" 分割の先頭2つ、それ以外は先頭1つ。
// 例: "B-AKT-T2[12-13]-043" -> "B-AKT" / "AJS-02" -> "AJS"
export function getSkuCategory(sku: string): string {
  const s = sku ?? "";
  const n = s.startsWith("B-") ? 2 : 1;
  return s.split("-").slice(0, n).join("-");
}
