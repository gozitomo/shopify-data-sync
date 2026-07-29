import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, ScanLine, Camera, X } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { getIdToken } from "~/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";
const FULFILL_URL = `${API_BASE}/api/fulfill`;

// カメラ読取はヤマト伝票のNW-7(Codabar)に限定して精度を上げる
const HINTS = new Map();
HINTS.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODABAR]);

type Result = "ok" | "already" | "error";
type HistoryEntry = {
  time: string;
  tracking: string;
  result: Result;
  orderName?: string;
  items?: { sku: string; qty: number }[];
  message?: string;
};

// スキャン文字列から追跡番号(数字)を取り出す。
// "A{伝票番号}A" 形式（Codabarのstart/stop文字A）に対応。
function extractTracking(raw: string): string {
  const s = raw.trim();
  const wrapped = s.match(/A(\d{6,})A/i);
  if (wrapped) return wrapped[1];
  const m = s.replace(/[\s　]/g, "").match(/\d{10,}/);
  return m ? m[0] : s;
}

export default function Scan() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // カメラ起動/停止（scanning に連動）
  useEffect(() => {
    if (!scanning) return;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserMultiFormatReader(HINTS);
    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (res) => {
          if (res) {
            setValue(extractTracking(res.getText()));
            setScanning(false); // 検出したらカメラ停止（cleanup）
          }
        },
      )
      .then((c) => {
        controls = c;
      })
      .catch((e) => {
        setCamError(e?.message || "カメラを起動できませんでした");
        setScanning(false);
      });
    return () => controls?.stop();
  }, [scanning]);

  async function handleConfirm() {
    const tracking = extractTracking(value.trim());
    if (!tracking) return;
    setValue("");
    setBusy(true);
    const time = new Date().toLocaleTimeString();
    try {
      const token = await getIdToken();
      const res = await fetch(FULFILL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tracking }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setHistory((prev) => [
        {
          time,
          tracking,
          result: data.status === "ALREADY" ? "already" : "ok",
          orderName: data.orderName,
          items: data.items,
        },
        ...prev,
      ]);
    } catch (e: any) {
      setHistory((prev) => [
        { time, tracking, result: "error", message: e?.message || String(e) },
        ...prev,
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">バーコード出荷</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          伝票の追跡番号を読み取り、「出荷確定」で該当注文を発送済み（fulfill）にします。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="h-5 w-5" />
            追跡番号を読み取り
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={value}
            inputMode="numeric"
            disabled={busy}
            placeholder="バーコードリーダー or カメラで入力"
            onChange={(e) =>
              setValue(e.target.value.replace(/^A/, "").replace(/A(?=\s*$)/, ""))
            }
            className="w-full rounded-md border bg-background px-4 py-3 text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />

          {scanning ? (
            <div className="space-y-2">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-md border bg-black aspect-video object-cover"
              />
              <button
                onClick={() => setScanning(false)}
                className="flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                <X className="h-4 w-4" />
                カメラを止める
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setCamError(null);
                setScanning(true);
              }}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              カメラで読み取る
            </button>
          )}
          {camError && <p className="text-sm text-destructive">{camError}</p>}

          <button
            onClick={handleConfirm}
            disabled={busy || !value.trim()}
            className="w-full rounded-md bg-primary px-5 py-3 text-base font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "処理中..." : "出荷確定する"}
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">処理履歴</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              まだ処理がありません。
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((h, i) => (
                <li key={i} className="flex items-start gap-3 px-6 py-3 text-sm">
                  {h.result === "error" ? (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  ) : (
                    <CheckCircle2
                      className={`mt-0.5 h-5 w-5 shrink-0 ${h.result === "already" ? "text-orange-500" : "text-green-600"}`}
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {h.result === "error"
                        ? `エラー: ${h.message}`
                        : h.result === "already"
                          ? `注文 ${h.orderName}（既に出荷確定済み）`
                          : `注文 ${h.orderName} を出荷確定しました`}
                    </span>
                    {h.items && h.items.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {h.items.map((it) => `${it.sku}×${it.qty}`).join(" / ")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {h.time} ・ 伝票 {h.tracking}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
