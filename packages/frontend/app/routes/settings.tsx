import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { getIdToken } from "~/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

const API_BASE = import.meta.env.PROD ? "" : "http://localhost:8080";
const VIEWERS_URL = `${API_BASE}/api/peach-viewers`;

type Viewer = { email: string; addedAt: string | null };

export default function Settings() {
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authFetch(url: string, init?: RequestInit) {
    const token = await getIdToken();
    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  }

  async function load() {
    setError(null);
    try {
      const res = await authFetch(VIEWERS_URL);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setViewers(data.viewers);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addViewer() {
    const value = email.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(VIEWERS_URL, {
        method: "POST",
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEmail("");
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function removeViewer(target: string) {
    if (!confirm(`${target} を削除しますか？`)) return;
    setError(null);
    try {
      const res = await authFetch(VIEWERS_URL, {
        method: "DELETE",
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          社内(progress-farm.com)メンバーのみが操作できます。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">桃アンケート 共有ユーザー</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            ここに登録した Google アカウントは、共有ページ（/share/peach）を閲覧できます。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addViewer()}
              placeholder="example@gmail.com"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              onClick={addViewer}
              disabled={loading}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" />
              追加
            </button>
          </div>

          {error && <p className="text-sm text-destructive">エラー: {error}</p>}

          {viewers === null ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : viewers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              登録された共有ユーザーはいません。
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {viewers.map((v) => (
                <li
                  key={v.email}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span>{v.email}</span>
                  <button
                    onClick={() => removeViewer(v.email)}
                    aria-label="削除"
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
