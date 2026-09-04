import { useState } from "react";
import { Upload } from "lucide-react";
import { getIdToken } from "~/lib/firebase";
import { parseCsv } from "~/lib/csv";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";
const IMPORT_B2_URL = `${API_BASE}/api/import-b2`;

// B2発行済みCSVの列インデックス
const COL_FOID = 0; // お客様管理番号 = FO id
const COL_TRACKING = 3; // 伝票番号
const COL_ORDER = 75; // 検索キー1 = 注文番号

type Failed = { foId: string; orderName: string };

export default function ImportShipments() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState<Failed[] | null>(null);

  async function handleFile(file: File) {
    setLoading(true);
    setError(null);
    setMessage(null);
    setFailed(null);
    try {
      // B2の発行済みCSVはShift-JIS
      const buf = await file.arrayBuffer();
      const text = new TextDecoder("shift-jis").decode(buf);
      const parsed = parseCsv(text);

      // 1行目はヘッダ。FO idがある行だけ採用
      const rows = parsed
        .slice(1)
        .filter((r) => r[COL_FOID])
        .map((r) => ({
          foId: r[COL_FOID],
          tracking: r[COL_TRACKING] ?? "",
          orderName: r[COL_ORDER] ?? "",
        }));

      if (rows.length === 0) {
        throw new Error(
          "有効な行が見つかりません（列の並びを確認してください）",
        );
      }

      const token = await getIdToken();
      const res = await fetch(IMPORT_B2_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setMessage(`${data.count}件の伝票番号を記録しました。`);
      if (data.failed?.length) setFailed(data.failed);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            発行済みデータCSVをアップロード
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            B2クラウドの「発行済みデータCSV」をアップロードすると、伝票番号をフルフィルメントに紐付けます。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            <Upload className="h-4 w-4" />
            {loading ? "処理中..." : "CSVを選択"}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {error && <p className="text-sm text-destructive">エラー: {error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
        </CardContent>
      </Card>

      {failed && failed.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">
              取込できなかった行（{failed.length}件）
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              伝票番号が空のため、これらの行は取り込めませんでした。
            </p>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {failed.map((f) => (
              <div key={f.foId} className="text-destructive">
                FOID: {f.foId} / 注文: {f.orderName} / データ取込みできませんでした。
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
