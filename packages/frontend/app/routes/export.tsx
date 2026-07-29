import { useState } from "react";
import { Download } from "lucide-react";
import { getIdToken } from "~/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

const API_URL = import.meta.env.PROD
  ? "/api/export-unfulfilled"
  : "http://localhost:8080/api/export-unfulfilled";

export default function Export() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const res = await fetch(API_URL, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^"]+)"?/);
      const filename = m?.[1] || "unfulfilled.csv";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">CSV出力</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          今年・未発送・キャンセル除外の明細（SKU単位）をCSVで出力します。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">未発送明細CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {loading ? "生成中..." : "CSVをダウンロード"}
          </button>
          {error && <p className="text-sm text-destructive">エラー: {error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
