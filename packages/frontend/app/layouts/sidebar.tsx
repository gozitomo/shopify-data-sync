import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  Boxes,
  ClipboardList,
  FileDown,
  LogOut,
  Menu,
  ScanLine,
  Star,
  X,
} from "lucide-react";
import { auth, googleProvider, isAllowedUser } from "~/lib/firebase";
import { cn } from "~/lib/utils";

const navItems = [
  { to: "/", label: "在庫一覧", icon: Boxes, end: true },
  { to: "/scan", label: "バーコード出荷", icon: ScanLine, end: false },
  // { to: "/export", label: "CSV出力", icon: Download, end: false }, // 紛らわしいため非表示
  {
    to: "/export-b2",
    label: "ヤマト伝票用CSV出力",
    icon: FileDown,
    end: false,
  },
  // { to: "/import-shipments", label: "出荷データ取込", icon: Upload, end: false },
  { to: "/shipped", label: "出荷実績", icon: ClipboardList, end: false },
  { to: "/peach-survey", label: "桃アンケート", icon: Star, end: false },
];

export default function SidebarLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false); // モバイルのメニュー開閉

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
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.error("login error:", e);
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

  // 未ログイン → ログイン画面
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <div className="text-2xl font-bold tracking-tight">📦 出荷管理</div>
        <p className="text-sm text-muted-foreground">
          progress-farm.com のアカウントでログインしてください
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

  // ログイン済みだが許可ドメイン外 → アクセス拒否
  if (!isAllowedUser(user)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">アクセス権限がありません</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <button
          onClick={() => signOut(auth)}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
          別のアカウントでログイン
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* モバイル用トップバー */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 md:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="メニュー"
          className="rounded-md p-1 hover:bg-muted"
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="text-lg font-bold tracking-tight">📦 出荷管理</span>
      </div>

      {/* モバイルのオーバーレイ */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* サイドバー（モバイルは引き出し、PCは常時表示） */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r bg-muted/30 p-4 transition-transform md:static md:z-auto md:w-56 md:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <span className="text-lg font-bold tracking-tight">📦 出荷管理</span>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="閉じる"
            className="rounded-md p-1 hover:bg-muted md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t pt-4">
          <div className="truncate px-2 text-xs text-muted-foreground">
            {user.email}
          </div>
          <button
            onClick={() => signOut(auth)}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            ログアウト
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
