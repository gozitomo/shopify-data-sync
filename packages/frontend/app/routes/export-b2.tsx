import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileDown, AlertTriangle } from "lucide-react";
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
import ImportShipments from "./import-shipments";

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";
const API_URL = `${API_BASE}/api/export-b2`;
const GROUPS_URL = `${API_BASE}/api/sku-groups`;

type SkuGroup = { group: string; productName: string };

type Suspect = {
  orderName: string;
  recipientName: string;
  zip: string;
  address: string;
  reason: string;
};

function downloadBase64Csv(b64: string, filename: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportB2() {
  const [orders, setOrders] = useState("");
  const [sku, setSku] = useState("");
  const [coolMode, setCoolMode] = useState("none");
  const [groups, setGroups] = useState<SkuGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // SKU区分プルダウンを読み込む
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch(GROUPS_URL, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (res.ok && data.groups) setGroups(data.groups);
      } catch {
        /* プルダウン取得失敗時は空のまま（手動運用に支障なし） */
      }
    })();
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [suspects, setSuspects] = useState<Suspect[] | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setMessage(null);
    setSuspects(null);
    try {
      const token = await getIdToken();
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orders, sku, coolMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      if (data.ok) {
        downloadBase64Csv(data.csvBase64, data.filename);
        setMessage(`${data.count}件の伝票CSVを出力しました。`);
      } else if (data.suspects?.length) {
        setSuspects(data.suspects);
      } else {
        setMessage(data.message || "該当する伝票がありません。");
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-4xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          ヤマトB2伝票用CSV出力
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ヤマトB2クラウド取込用CSVを出力します。住所に要確認がある場合は、解決するまで出力できません。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">出力条件</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              注文番号（カンマ区切り・空欄なら今年の未発送すべて）
            </label>
            <input
              value={orders}
              onChange={(e) => setOrders(e.target.value)}
              placeholder="例: 4497, 4498, 4501"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">商品区分</label>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">（絞り込みなし）</option>
              {groups.map((g) => (
                <option key={g.group} value={g.group}>
                  {g.productName}（{g.group}）
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">クール区分</label>
            <select
              value={coolMode}
              onChange={(e) => setCoolMode(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="none">すべて常温</option>
              <option value="all">すべて冷蔵</option>
              <option value="region">九州・沖縄・北海道のみ冷蔵</option>
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" />
            {loading ? "検証・生成中..." : "検証してCSV出力"}
          </button>
          {error && <p className="text-sm text-destructive">エラー: {error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}
        </CardContent>
      </Card>

      {suspects && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <AlertTriangle className="h-5 w-5" />
              要確認の住所（{suspects.length}件）— 修正後に再実行してください
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>注文番号</TableHead>
                  <TableHead>お届け先</TableHead>
                  <TableHead>郵便番号</TableHead>
                  <TableHead>住所</TableHead>
                  <TableHead>理由</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suspects.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.orderName}</TableCell>
                    <TableCell>{s.recipientName}</TableCell>
                    <TableCell>{s.zip}</TableCell>
                    <TableCell className="text-xs">{s.address}</TableCell>
                    <TableCell className="text-destructive">
                      {s.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">CSV出力後の流れ</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <a
                href="https://bmypage.kuronekoyamato.co.jp/bmypage/servlet/jp.co.kuronekoyamato.wur.hmp.servlet.user.HMPLGI0010JspServlet"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                ヤマト B2クラウドにログイン
              </a>
              する。
            </li>
            <li>
              <a
                href="https://newb2web.kuronekoyamato.co.jp/ex_data_import.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                CSV取込ページ
              </a>
              で、出力したCSVを取り込む。
            </li>
            <li>取込結果で住所などの不備があれば、B2クラウド上で修正する。</li>
            <li>
              <a
                href="https://newb2web.kuronekoyamato.co.jp/issue_search.html"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                発行済みデータ検索ページ
              </a>
              で、条件を指定せず検索して全件を表示し、外部ファイルに出力する。
            </li>
          </ol>
        </CardContent>
      </Card>
      <ImportShipments />
    </div>
  );
}
