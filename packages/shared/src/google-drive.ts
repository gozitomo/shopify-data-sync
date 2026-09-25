// Googleドライブのフォルダを drive-reader サービスアカウントの権限で読み取る共通処理。
// google-sheet.ts と同じ「なりすまし」パターン: 対象フォルダをこのSAへ「閲覧者」で共有しておくこと。
// 事前に必要なもの:
//   - 対象フォルダをこのSAへ「閲覧者」で共有
//   - 呼び出し元(関数の実行SA / 開発者アカウント)に、このSAへの roles/iam.serviceAccountTokenCreator
import { GoogleAuth, Impersonated, type AuthClient } from "google-auth-library";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
const DRIVE_SA_EMAIL =
  process.env.DRIVE_SA_EMAIL ||
  "drive-reader@pgfarm-dashboard-493812.iam.gserviceaccount.com";

const auth = new GoogleAuth({
  scopes: DRIVE_SA_EMAIL
    ? ["https://www.googleapis.com/auth/cloud-platform"]
    : DRIVE_SCOPES,
});

let clientPromise: Promise<AuthClient> | null = null;

function driveAuthClient(): Promise<AuthClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const source = await auth.getClient();
      if (!DRIVE_SA_EMAIL) return source;
      return new Impersonated({
        sourceClient: source,
        targetPrincipal: DRIVE_SA_EMAIL,
        targetScopes: DRIVE_SCOPES,
        lifetime: 3600,
      });
    })();
  }
  return clientPromise;
}

async function accessToken(): Promise<string> {
  let t;
  try {
    const client = await driveAuthClient();
    t = await client.getAccessToken();
  } catch (e: any) {
    clientPromise = null; // 次回やり直せるようにキャッシュを捨てる
    const hint = DRIVE_SA_EMAIL
      ? `（${DRIVE_SA_EMAIL} への roles/iam.serviceAccountTokenCreator を確認）`
      : "";
    throw new Error(`Google 認証トークンの取得に失敗しました${hint}: ${e?.message ?? e}`);
  }
  if (!t.token) throw new Error("Google 認証トークンの取得に失敗しました");
  return t.token;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
};

// 指定フォルダ直下のファイル一覧を返す（サブフォルダ・ゴミ箱内は対象外）。
export async function listFilesInFolder(folderId: string): Promise<DriveFile[]> {
  const token = await accessToken();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,mimeType,modifiedTime)",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(
        `Driveファイル一覧取得失敗: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
      );
    }
    const json = await res.json();
    files.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return files;
}

// ファイルの中身をダウンロードする。
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const token = await accessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(
      `Driveファイル取得失敗: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}
