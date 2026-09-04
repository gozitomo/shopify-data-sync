import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth, googleProviderAny } from "~/lib/firebase";

// 桃アンケート共有ページ用レイアウト（サイドバー無し・ドメイン外も可）。
// ログインだけを要求し、実際の閲覧可否は API の許可リストで判定する。
export default function PeachShareLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );

  async function handleLogin() {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProviderAny);
    } catch (e: any) {
      setLoginError(e?.code ? `${e.code}: ${e.message}` : String(e));
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        読み込み中...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <div className="text-2xl font-bold tracking-tight">🍑 桃アンケート</div>
        <p className="text-sm text-muted-foreground">
          Googleアカウントでログインしてください
        </p>
        <button
          onClick={handleLogin}
          className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Google でログイン
        </button>
        {loginError && (
          <p className="max-w-md break-all text-center text-sm text-destructive">
            {loginError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
        <span>{user.email}</span>
        <button
          onClick={() => signOut(auth)}
          className="rounded-md border px-2 py-1 hover:bg-muted"
        >
          ログアウト
        </button>
      </div>
      <Outlet />
    </div>
  );
}
