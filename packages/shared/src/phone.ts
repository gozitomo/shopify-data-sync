// 国際表記の電話(+81...)を国内表記(0...)に変換
export function normalizePhone(phone: string): string {
  if (!phone) return "";
  const p = phone.trim();
  if (p.startsWith("+81")) return "0" + p.slice(3).replace(/^[\s-]+/, "");
  return p;
}
