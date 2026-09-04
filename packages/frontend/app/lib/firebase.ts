import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB22t_Hfj8jZOwSLwvBi7vgahaJOtRazPI",
  authDomain: "pgfarm-dashboard-493812.firebaseapp.com",
  projectId: "pgfarm-dashboard-493812",
  storageBucket: "pgfarm-dashboard-493812.firebasestorage.app",
  messagingSenderId: "591556557767",
  appId: "1:591556557767:web:33177b91c57a593a25f7e2",
  measurementId: "G-QHG4EP1PFR",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 許可するメールドメイン（特定メールのみに絞りたい場合はここを書き換える）
export const ALLOWED_DOMAIN = "progress-farm.com";

export const googleProvider = new GoogleAuthProvider();
// Google Workspace のドメインをログイン画面に優先表示
googleProvider.setCustomParameters({ hd: ALLOWED_DOMAIN });

// 桃アンケート共有ページ用: ドメイン制限(hd)なし。外部のGoogleアカウントも選べる。
// 実際の閲覧可否は API 側の許可リストで判定する。
export const googleProviderAny = new GoogleAuthProvider();

export function isAllowedUser(user: User | null): boolean {
  return !!user?.email?.endsWith(`@${ALLOWED_DOMAIN}`);
}

// API 呼び出し用の ID トークン。未ログイン or 許可ドメイン外なら null。
// 社内オペ画面(サイドバー配下)用。ドメイン限定のAPIはこれを使う。
export async function getIdToken(): Promise<string | null> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!isAllowedUser(user)) return null;
  return user!.getIdToken();
}

// 桃アンケート共有ページ用の ID トークン。ドメイン判定はしない
// （閲覧可否は API 側の許可リストで判定するため、未ログイン以外はトークンを返す）。
export async function getIdTokenAny(): Promise<string | null> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
