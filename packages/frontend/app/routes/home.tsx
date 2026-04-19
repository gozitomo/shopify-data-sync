import { useLoaderData } from "react-router";
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
  const API_URL = import.meta.env.VITE_LAMBDA_URL;

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Network response was not ok");

    // Lambdaから返ってくる { nestedData, previousYear, prepreYear } をそのまま取得
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    // エラー時のフォールバックデータ
    return { nestedData: [], previousYear: "", prepreYear: "" };
  }
}

export default function InventoryManagement() {
  const data = useLoaderData<typeof clientLoader>();
  return (
    <div className="container mx-auto py-8 space-y-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">生産・在庫管理</h1>
      </header>

      <div className="grid gap-6">
        {data.nestedData.map(({ label, data }: any) => (
          <Card key={label} className="overflow-hidden">
            <CardHeader className="bg-muted/50">
              <CardTitle className="text-xl">{label}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px]">商品名 SKU</TableHead>
                    <TableHead className="text-right">引当済み</TableHead>
                    <TableHead className="text-right">kg</TableHead>
                    <TableHead className="text-right">販売可能</TableHead>
                    <TableHead className="text-right">出荷済み</TableHead>
                    <TableHead className="text-right">
                      {data.previousYear}実績
                    </TableHead>
                    <TableHead className="text-right">
                      {data.prepreYear}実績
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-24 text-center text-muted-foreground"
                      >
                        表示できる商品データがありません。
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.flatMap(([category, categoryData]: any) => [
                      // カテゴリ行（小計行）
                      <TableRow
                        key={category}
                        className="bg-secondary/30 hover:bg-secondary/30 font-bold"
                      >
                        <TableCell>
                          <span className="flex items-center gap-2">
                            📂 {category}
                          </span>
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right">
                          {categoryData.totalWeight}kg
                        </TableCell>
                        <TableCell colSpan={4} />
                      </TableRow>,
                      // 商品データ行
                      ...categoryData.rows.map((row: any) => (
                        <TableRow
                          key={row.sku}
                          className="cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            window.open(
                              `https://admin.shopify.com/store/pgfarmco/products/${row.pId}/variants/${row.id}`,
                            );
                          }}
                        >
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">
                                {row.title}
                              </span>
                              <div className="flex gap-2 text-xs text-muted-foreground">
                                {row.variantTitle && (
                                  <span>{row.variantTitle}</span>
                                )}
                                <span>{row.sku}</span>
                              </div>
                            </div>
                          </TableCell>

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
                      )),
                    ])
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
