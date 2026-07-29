import { useEffect, useState } from "react";
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

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";
const SUMMARY_URL = `${API_BASE}/api/shipment-summary`;

type Row = { sku: string; name: string; qty: number };
type Day = { date: string; parcels: number; total: number; rows: Row[] };

export default function Shipped() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(SUMMARY_URL, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setDays(data.days);
      } catch (e: any) {
        setError(e?.message || String(e));
      }
    })();
  }, []);

  return (
    <div className="container mx-auto max-w-3xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">出荷実績</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          出荷確定（fulfill）した内容を日付ごとに集計しています。
        </p>
      </header>

      {error && <p className="text-sm text-destructive">エラー: {error}</p>}
      {days === null && !error && (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      )}
      {days && days.length === 0 && (
        <p className="text-sm text-muted-foreground">出荷実績がありません。</p>
      )}

      {days?.map((day) => (
        <Card key={day.date} className="overflow-hidden">
          <CardHeader className="bg-muted/50 flex-row items-center justify-between">
            <CardTitle className="text-xl">{day.date}</CardTitle>
            <span className="text-sm text-muted-foreground">
              {day.parcels} 件 / 合計 {day.total} 個
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品名 / 荷姿</TableHead>
                  <TableHead className="text-right w-[120px]">出荷個数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.rows.map((r) => (
                  <TableRow key={r.sku}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{r.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.sku}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {r.qty.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
