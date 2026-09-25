import { useState } from "react";
import { useLoaderData } from "react-router";
import { RefreshCw } from "lucide-react";
import { getIdToken } from "~/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

// 1. データを取得する関数 (React Router v7 の SPAモード用 loader)
export async function clientLoader() {
  // 本番(Hosting)は同一オリジンの /api/stats を rewrite 経由で叩く。
  // ローカルは .env の VITE_LAMBDA_URL (http://localhost:8080/api/stats)。
  const API_URL = import.meta.env.PROD
    ? "/api/stats"
    : import.meta.env.VITE_LAMBDA_URL;
  console.log("立ち上がりました");

  try {
    const token = await getIdToken();
    const response = await fetch(API_URL, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error("Network response was not ok");

    // Firestoreから返ってくる { nestedData, previousYear, prepreYear } をそのまま取得
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    // エラー時のフォールバックデータ
    return { nestedData: [], previousYear: "", prepreYear: "" };
  }
}

const SYNC_URL = import.meta.env.PROD
  ? "/api/sync-orders"
  : "http://localhost:8080/api/sync-orders";

function SyncOrdersButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const token = await getIdToken();
      const res = await fetch(SYNC_URL, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessage(
        "更新を開始しました。数分後にページを再読み込みしてください。",
      );
    } catch (e: any) {
      setMessage(`エラー: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "開始中..." : "注文データを更新"}
      </button>
      {message && (
        <span className="text-xs text-muted-foreground">{message}</span>
      )}
    </div>
  );
}

// B2B商材は SKU が "B-" で始まる。それ以外は B2C。
function isB2BSku(sku: string): boolean {
  return (sku ?? "").startsWith("B-");
}

// デジタル商品は SKU が "D-" で始まる。画面には表示しない。
function isDigitalSku(sku: string): boolean {
  return (sku ?? "").startsWith("D-");
}

// 行を条件で絞り込み、カテゴリごとの kg 小計を再計算する。
// デジタル商品(D-)は常に除外。空になったカテゴリは除外する。
function filterCategoriesByRow(
  categories: any[],
  keep: (row: any) => boolean,
): any[] {
  return categories
    .map(([category, categoryData]: any) => {
      const rows = (categoryData?.rows ?? []).filter(
        (row: any) => !isDigitalSku(row.sku) && keep(row),
      );
      return [
        category,
        {
          ...categoryData,
          rows,
          totalWeight: rows.reduce(
            (sum: number, r: any) => sum + r.unshipped * r.weightValue,
            0,
          ),
        },
      ];
    })
    .filter(([, categoryData]: any) => categoryData.rows.length > 0);
}

// バリアント名を "/" 区切りで分解（各要素 trim 済み）。
function variantParts(row: any): string[] {
  return String(row.variantTitle ?? "")
    .split("/")
    .map((s) => s.trim());
}

// バリアント名を " "(半角スペース) 区切りで分解（各要素 trim 済み）。
function variantSpaceParts(row: any): string[] {
  return String(row.variantTitle ?? "")
    .split(" ")
    .map((s) => s.trim());
}

// 商品名列の展開定義。省略時は従来の1列（商品名＋バリアント名を縦積み）。
// collapse: 直前行と同じ値なら2行目以降を空欄にする（上位のcollapse列も一致が条件）。
type NameColumn = {
  header: string;
  get: (row: any) => string;
  collapse?: boolean;
};

// B2C: 商品名 / 等階級 / 箱サイズ（商品名・等階級は重複行を空欄化）
const B2C_NAME_COLUMNS: NameColumn[] = [
  { header: "商品名", get: (r) => r.title, collapse: true },
  { header: "等階級", get: (r) => variantParts(r)[0] ?? "", collapse: true },
  { header: "箱サイズ", get: (r) => variantParts(r)[1] ?? "" },
];

// B2B: 商品名 / 品種名(スペース区切り先頭) / 等階級 / 箱サイズ
const B2B_NAME_COLUMNS: NameColumn[] = [
  { header: "商品名", get: (r) => r.title },
  { header: "品種名", get: (r) => variantSpaceParts(r)[0] ?? "" },
  {
    header: "等階級",
    get: (r) => {
      const s = variantSpaceParts(r);
      const p = variantParts(r);
      return (s[1] ?? "") + (p[2] ?? "") + (p[3] ?? "");
    },
  },
  { header: "箱サイズ", get: (r) => variantParts(r)[4] ?? "" },
];

// 3つの区分。上から順に判定するので archive を先に評価する。
// nameColumns: 商品名列を複数列に展開する定義（未指定なら従来の1列）。
const SECTIONS: {
  key: string;
  heading: string;
  keep: (row: any) => boolean;
  nameColumns?: NameColumn[];
}[] = [
  {
    key: "b2c",
    heading: "🛒 B2C",
    keep: (r) => r.status !== "ARCHIVED" && !isB2BSku(r.sku),
    nameColumns: B2C_NAME_COLUMNS,
  },
  {
    key: "b2b",
    heading: "🏢 B2B",
    keep: (r) => r.status !== "ARCHIVED" && isB2BSku(r.sku),
    nameColumns: B2B_NAME_COLUMNS,
  },
  {
    key: "archive",
    heading: "🗄️ アーカイブ",
    keep: (r) => r.status === "ARCHIVED",
  },
];

function InventoryCard({
  label,
  categories,
  previousYear,
  prepreYear,
  nameColumns,
}: {
  label: string;
  categories: any[];
  previousYear: string;
  prepreYear: string;
  nameColumns?: NameColumn[];
}) {
  // 商品名列の数（未指定なら1列）。他の数値6列と合わせて総列数を出す。
  const nameColCount = nameColumns?.length ?? 1;
  const totalCols = nameColCount + 6;
  return (
    <Card>
      <CardHeader className="bg-muted/50">
        <CardTitle className="text-xl">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table containerClassName="md:overflow-x-visible">
          <TableHeader className="md:sticky md:top-[72px] md:z-[5] bg-background shadow-sm">
            <TableRow>
              {nameColumns ? (
                nameColumns.map((col, i) => (
                  <TableHead
                    key={col.header}
                    className={i === 0 ? "w-[220px]" : ""}
                  >
                    {col.header}
                  </TableHead>
                ))
              ) : (
                <TableHead className="w-[300px]">商品名</TableHead>
              )}
              <TableHead className="text-right">引当済み</TableHead>
              <TableHead className="text-right">kg</TableHead>
              <TableHead className="text-right">販売可能</TableHead>
              <TableHead className="text-right">出荷済み</TableHead>
              <TableHead className="text-right">{previousYear}実績</TableHead>
              <TableHead className="text-right">{prepreYear}実績</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={totalCols}
                  className="h-24 text-center text-muted-foreground"
                >
                  表示できる商品データがありません。
                </TableCell>
              </TableRow>
            ) : (
              categories.flatMap(([, categoryData]: any) =>
                // 商品データ行
                categoryData.rows.map(
                  (row: any, rowIdx: number, rowsArr: any[]) => {
                    const prev = rowIdx > 0 ? rowsArr[rowIdx - 1] : null;
                    return (
                      <TableRow
                        key={row.sku}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          window.open(
                            `https://admin.shopify.com/store/pgfarmco/products/${row.pId}/variants/${row.id}`,
                          );
                        }}
                      >
                        {nameColumns ? (
                          nameColumns.map((col, i) => {
                            // 直前行と、この列＋上位のcollapse列がすべて一致すれば空欄化。
                            const blank =
                              !!col.collapse &&
                              !!prev &&
                              nameColumns.every(
                                (c, k) =>
                                  k > i ||
                                  !c.collapse ||
                                  c.get(row) === c.get(prev),
                              );
                            return (
                              <TableCell
                                key={col.header}
                                className={
                                  i === 0 ? "font-medium text-sm" : "text-sm"
                                }
                              >
                                {blank ? "" : col.get(row)}
                              </TableCell>
                            );
                          })
                        ) : (
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {row.title}
                              </span>
                              {row.variantTitle && (
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                  <span>{row.variantTitle}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        )}

                        {/* 引当済み（受注箱） */}
                        <TableCell
                          className={`text-right ${row.unshipped > 0 ? "text-destructive font-bold" : ""}`}
                        >
                          {row.unshipped.toLocaleString()}
                        </TableCell>

                        {/* 受注kg */}
                        <TableCell className="text-right font-medium">
                          {row.weightValue * row.unshipped}kg
                        </TableCell>

                        {/* 余力（販売可能） */}
                        <TableCell
                          className={`text-right ${row.inventory < 10 ? "font-bold text-orange-600" : ""}`}
                        >
                          {row.inventory.toLocaleString()}
                        </TableCell>

                        {/* 当年出荷済 */}
                        <TableCell className="text-right">
                          {row.currentShipped.toLocaleString()}
                        </TableCell>

                        {/* 前年実績 */}
                        <TableCell className="text-right text-muted-foreground">
                          {row.prevShipped.toLocaleString()}
                        </TableCell>

                        {/* 前々年実績 */}
                        <TableCell className="text-right text-muted-foreground">
                          {row.prepreShipped.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  },
                ),
              )
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function InventoryManagement() {
  const data = useLoaderData<typeof clientLoader>();
  return (
    <div className="container mx-auto py-8 space-y-8">
      <header className="sticky top-14 z-10 -mx-4 mb-6 flex items-center justify-between gap-4 border-b bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:top-0">
        <h1 className="text-3xl font-bold tracking-tight">生産・在庫管理</h1>
        <SyncOrdersButton />
      </header>

      {SECTIONS.map(({ key, heading, keep, nameColumns }) => {
        const groups = data.nestedData
          .map(({ label, data: categories }: any) => ({
            label,
            categories: filterCategoriesByRow(categories, keep),
          }))
          .filter(({ categories }: any) => categories.length > 0);

        if (groups.length === 0) return null;

        return (
          <section key={key} className="space-y-4">
            <h2 className="text-2xl font-bold tracking-tight">{heading}</h2>
            <div className="grid gap-6">
              {groups.map(({ label, categories }: any) => (
                <InventoryCard
                  key={label}
                  label={label}
                  categories={categories}
                  previousYear={data.previousYear}
                  prepreYear={data.prepreYear}
                  nameColumns={nameColumns}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
